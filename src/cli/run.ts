/// <reference types="node" />
// Sindri Pixel's command line: export .spr files without opening the app,
// one file or whole folders, for build scripts and CI.
//
//   sindri-pixel export hero.spr --format png,sheet --scale 4 --out build/
//   sindri-pixel export art/ --sindri ../game/assets
//   sindri-pixel info hero.spr
//
// Every format goes through the same code the app uses (project format,
// sheet + JSON, GIF encoder, Sindri and Tiled exporters), so the command
// line and the editor can't disagree about what an export is.

import fs from 'node:fs';
import path from 'node:path';
import type { Frame } from '../types';
import { parseProject } from '../lib/project-format';
import { buildSpriteSheet, compositeFrame, compositeGrid } from '../lib/sprite';
import { encodeGif, gridSheet, sheetJson } from '../lib/animation';
import { tagSequence, type FrameTag } from '../lib/tags';
import { sindriSprite, sindriTilemap, type SindriExport } from '../lib/sindriExport';
import { buildTileset, tiledMap, tilesetImage } from '../lib/tilemap';
import { encodePng, upscale } from './png';

export const VERSION = '0.1.0-beta.2';

export interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
}

const FORMATS = ['png', 'gif', 'sheet', 'sindri', 'tiled'] as const;
type Format = (typeof FORMATS)[number];

export const HELP = `Sindri Pixel ${VERSION} — export .spr sprites from the command line.

Usage
  sindri-pixel export <file.spr | folder>... [options]
  sindri-pixel info <file.spr>...

Export options
  --format <list>    png, gif, sheet, sindri, tiled (comma-separated; default png)
  --out <folder>     where files go (default: next to each .spr)
  --scale <n>        whole-number upscale for png, gif and sheet (default 1)
  --frame <n|all>    png: which frame, 1-based, or every frame (default 1)
  --tag <name>       only the frames of this animation tag
  --columns <n>      sheet: frames per row (default: all in one row)
  --sindri <folder>  a Sindri project's assets folder: writes textures/ and
                     prefabs/ there (implies --format sindri)
  --ppu <n>          sindri: pixels per world unit for sprites (default 16)

Folders are searched for .spr files, including subfolders.
Sheets come with Aseprite-format JSON; Sindri exports include tilemap layers
as <name>-map prefabs; tiled writes a .tmj and its tileset for tilemap layers.`;

interface Options {
  inputs: string[];
  formats: Format[];
  out?: string;
  scale: number;
  frame: number | 'all';
  tag?: string;
  columns?: number;
  sindri?: string;
  ppu: number;
}

class UsageError extends Error {}

function parseArgs(args: string[]): Options {
  const o: Options = { inputs: [], formats: [], scale: 1, frame: 1, ppu: 16 };
  const value = (i: number, flag: string) => {
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) throw new UsageError(`${flag} needs a value`);
    return v;
  };
  const positive = (v: string, flag: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new UsageError(`${flag} must be a whole number of 1 or more, not "${v}"`);
    return n;
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) { o.inputs.push(a); continue; }
    switch (a) {
      case '--format':
        for (const f of value(i, a).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) {
          if (!(FORMATS as readonly string[]).includes(f)) throw new UsageError(`unknown format "${f}" (expected ${FORMATS.join(', ')})`);
          if (!o.formats.includes(f as Format)) o.formats.push(f as Format);
        }
        i++; break;
      case '--out': o.out = value(i, a); i++; break;
      case '--scale': o.scale = positive(value(i, a), a); i++; break;
      case '--frame': { const v = value(i, a); o.frame = v === 'all' ? 'all' : positive(v, a); i++; break; }
      case '--tag': o.tag = value(i, a); i++; break;
      case '--columns': o.columns = positive(value(i, a), a); i++; break;
      case '--sindri': o.sindri = value(i, a); i++; break;
      case '--ppu': o.ppu = positive(value(i, a), a); i++; break;
      default: throw new UsageError(`unknown option ${a}`);
    }
  }
  if (o.sindri && !o.formats.includes('sindri')) o.formats.push('sindri');
  if (!o.formats.length) o.formats.push('png');
  if (o.formats.includes('sindri') && !o.sindri) throw new UsageError('the sindri format needs --sindri <assets folder>');
  if (o.scale > 64) throw new UsageError('--scale is at most 64');
  return o;
}

/** Every .spr under the inputs (folders searched recursively), sorted. */
function collect(inputs: string[]): string[] {
  const found: string[] = [];
  const walk = (p: string) => {
    const st = fs.statSync(p, { throwIfNoEntry: false });
    if (!st) throw new UsageError(`${p} does not exist`);
    if (st.isDirectory()) {
      for (const e of fs.readdirSync(p, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const child = path.join(p, e.name);
        if (e.isDirectory()) walk(child);
        else if (e.name.toLowerCase().endsWith('.spr')) found.push(child);
      }
    } else found.push(p);
  };
  inputs.forEach(walk);
  return [...new Set(found)];
}

interface Loaded {
  stem: string;
  w: number;
  h: number;
  frames: Frame[];
  tags: FrameTag[];
  /** The frames played in order (a tag's sequence, or all). */
  order: number[];
}

function load(file: string, tag?: string): Loaded {
  const project = parseProject(fs.readFileSync(file, 'utf8'), path.basename(file));
  const stem = path.basename(file).replace(/\.spr$/i, '');
  let order = project.frames.map((_, i) => i);
  let tags = project.tags;
  if (tag) {
    const t = project.tags.find((x) => x.name.toLowerCase() === tag.toLowerCase());
    if (!t) throw new Error(`no tag "${tag}" (it has ${project.tags.length ? project.tags.map((x) => x.name).join(', ') : 'no tags'})`);
    order = tagSequence(t);
    tags = [{ ...t, from: 0, to: t.to - t.from }];
  }
  const frames = tag ? order.filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).map((i) => project.frames[i]) : project.frames;
  if (tag) order = order.map((i) => i - Math.min(...order));
  return { stem: tag ? `${stem}-${tag}` : stem, w: project.w, h: project.h, frames, tags, order };
}

function write(file: string, data: Uint8Array | string, io: Io) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  io.out(`  ${file}`);
}

function writeSindri(assets: string, out: SindriExport, io: Io) {
  const png = encodePng(compositeFrame({ id: 's', duration: 0, layers: [{ id: 's', name: 's', visible: true, opacity: 1, pixels: out.image.pixels }] }, out.image.w, out.image.h), out.image.w, out.image.h);
  write(path.join(assets, 'textures', `${out.name}.png`), png, io);
  write(path.join(assets, 'textures', `${out.name}.sheet.json`), JSON.stringify(out.sheet, null, 2), io);
  write(path.join(assets, 'prefabs', `${out.name}.prefab.json`), JSON.stringify(out.prefab, null, 2), io);
}

function exportOne(file: string, o: Options, io: Io) {
  const s = load(file, o.tag);
  const dir = o.out ?? path.dirname(file);
  const rgba = (f: Frame) => compositeFrame(f, s.w, s.h);
  // Tilemap layers of the first frame, of the first tile size found.
  const tileLayers = () => {
    const layers = s.frames[0].layers.filter((l) => l.tilemap);
    const size = layers[0]?.tilemap;
    return size ? { size, layers: layers.filter((l) => l.tilemap!.tw === size.tw && l.tilemap!.th === size.th) } : null;
  };

  for (const format of o.formats) {
    if (format === 'png') {
      const picks = o.frame === 'all' ? s.frames.map((_, i) => i) : [o.frame - 1];
      for (const i of picks) {
        if (!s.frames[i]) throw new Error(`there is no frame ${i + 1} (it has ${s.frames.length})`);
        const name = picks.length > 1 ? `${s.stem}-${String(i + 1).padStart(String(s.frames.length).length, '0')}.png` : `${s.stem}.png`;
        write(path.join(dir, name), encodePng(upscale(rgba(s.frames[i]), s.w, s.h, o.scale), s.w * o.scale, s.h * o.scale), io);
      }
    } else if (format === 'gif') {
      const images = s.order.map((i) => ({ width: s.w * o.scale, height: s.h * o.scale, data: new Uint8ClampedArray(upscale(rgba(s.frames[i]), s.w, s.h, o.scale)) }));
      write(path.join(dir, `${s.stem}.gif`), encodeGif(images, s.order.map((i) => s.frames[i].duration)), io);
    } else if (format === 'sheet') {
      const columns = o.columns ?? s.frames.length;
      const sheet = buildSpriteSheet(s.frames, s.w, s.h, columns);
      const image = `${s.stem}_sheet.png`;
      write(path.join(dir, image), encodePng(upscale(sheet.pixels, sheet.width, sheet.height, o.scale), sheet.width * o.scale, sheet.height * o.scale), io);
      const json = sheetJson(gridSheet(s.frames.length, s.w * o.scale, s.h * o.scale, columns), {
        name: s.stem, image, app: 'Sindri Pixel', durations: s.frames.map((f) => f.duration), pingPong: false, scale: o.scale, tags: s.tags,
      });
      write(path.join(dir, `${s.stem}_sheet.json`), JSON.stringify(json, null, 2), io);
    } else if (format === 'sindri') {
      writeSindri(o.sindri!, sindriSprite({
        title: s.stem, frames: s.frames.map((f) => compositeGrid(f, s.w, s.h)), w: s.w, h: s.h,
        durations: s.frames.map((f) => f.duration), tags: s.tags, pixelsPerUnit: o.ppu,
      }), io);
      const tiles = tileLayers();
      if (tiles) writeSindri(o.sindri!, sindriTilemap({ title: `${s.stem} map`, layers: tiles.layers.map((l) => ({ name: l.name, pixels: l.pixels })), size: tiles.size }), io);
    } else if (format === 'tiled') {
      const tiles = tileLayers();
      if (!tiles) { io.err(`  ${file}: no tilemap layers, skipping tiled`); continue; }
      const set = buildTileset(tiles.layers.map((l) => l.pixels), tiles.size);
      if (set.tiles.length < 2) { io.err(`  ${file}: the tilemap is empty, skipping tiled`); continue; }
      const img = tilesetImage(set, tiles.size);
      const imageName = `${s.stem}_tiles.png`;
      const flat = compositeFrame({ id: 't', duration: 0, layers: [{ id: 't', name: 't', visible: true, opacity: 1, pixels: img.pixels }] }, img.w, img.h);
      write(path.join(dir, imageName), encodePng(flat, img.w, img.h), io);
      write(path.join(dir, `${s.stem}.tmj`), JSON.stringify(tiledMap(set, tiles.size, tiles.layers.map((l) => l.name), { name: imageName, ...img }, s.stem), null, 2), io);
    }
  }
}

function info(file: string, io: Io) {
  const p = parseProject(fs.readFileSync(file, 'utf8'), path.basename(file));
  io.out(`${file}`);
  io.out(`  ${p.w} × ${p.h} px · ${p.frames.length} frame${p.frames.length === 1 ? '' : 's'} · ${p.frames.reduce((n, f) => n + f.duration, 0)} ms`);
  io.out(`  layers: ${p.frames[0].layers.map((l) => (l.tilemap ? `${l.name} (tilemap ${l.tilemap.tw}×${l.tilemap.th})` : l.name)).join(', ')}`);
  io.out(`  tags: ${p.tags.length ? p.tags.map((t) => `${t.name} ${t.from + 1}–${t.to + 1}${t.direction === 'forward' ? '' : ` ${t.direction}`}`).join(', ') : 'none'}`);
  io.out(`  palette: ${p.swatches.length} colours`);
}

/** Run a command; returns the process exit code. */
export function run(argv: string[], io: Io): number {
  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') { io.out(HELP); return command ? 0 : 1; }
  if (command === '--version' || command === '-v') { io.out(VERSION); return 0; }
  try {
    if (command === 'info') {
      const files = collect(rest);
      if (!files.length) throw new UsageError('info needs a .spr file');
      files.forEach((f) => info(f, io));
      return 0;
    }
    if (command !== 'export') throw new UsageError(`unknown command "${command}" (try export, info or --help)`);
    const o = parseArgs(rest);
    const files = collect(o.inputs);
    if (!files.length) throw new UsageError(o.inputs.length ? 'no .spr files found' : 'export needs a .spr file or a folder');
    let failed = 0;
    for (const f of files) {
      io.out(`${f}`);
      try { exportOne(f, o, io); } catch (e) { failed++; io.err(`  ${f}: ${(e as Error).message}`); }
    }
    if (files.length > 1) io.out(`${files.length - failed} of ${files.length} exported`);
    return failed ? 1 : 0;
  } catch (e) {
    io.err(`sindri-pixel: ${(e as Error).message}`);
    if (e instanceof UsageError) io.err('Run sindri-pixel --help for usage.');
    return 2;
  }
}
