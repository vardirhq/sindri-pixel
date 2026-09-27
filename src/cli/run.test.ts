/// <reference types="node" />
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Frame, PixelGrid } from '../types';
import { serializeProject } from '../lib/project-format';
import { run } from './run';

let dir: string;
let out: string[];
let err: string[];
const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l) };
const cli = (...args: string[]) => run(args, io);

const grid = (w: number, h: number, paint: [number, number, string][] = []): PixelGrid => {
  const g: PixelGrid = Array.from({ length: h }, () => Array<string | null>(w).fill(null));
  for (const [x, y, c] of paint) g[y][x] = c;
  return g;
};
const frame = (i: number, pixels: PixelGrid, extra: Partial<Frame['layers'][number]> = {}): Frame => ({
  id: `f${i}`, duration: 100 + i * 10, layers: [{ id: `l${i}`, name: 'art', visible: true, opacity: 1, pixels, ...extra }],
});
const writeSpr = (name: string, frames: Frame[], w: number, h: number, tags = [] as { id: string; name: string; from: number; to: number; direction: 'forward' | 'reverse' | 'pingpong' }[]) => {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serializeProject({ name, w, h, frames, swatches: [], tags }));
  return file;
};
/** Size and one pixel of a PNG we wrote (unfiltered RGBA). */
const readPng = (file: string) => {
  const b = fs.readFileSync(file);
  expect([...b.subarray(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  const idatLen = b.readUInt32BE(33);
  const raw = inflateSync(b.subarray(41, 41 + idatLen));
  return { w, h, px: (x: number, y: number) => [...raw.subarray(y * (w * 4 + 1) + 1 + x * 4, y * (w * 4 + 1) + 5 + x * 4)] };
};

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sindri-cli-')); out = []; err = []; });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('export', () => {
  it('writes a PNG next to the sprite by default, scaled on request', () => {
    const f = writeSpr('hero.spr', [frame(0, grid(4, 2, [[1, 0, '#ff0000']]))], 4, 2);
    expect(cli('export', f)).toBe(0);
    const a = readPng(path.join(dir, 'hero.png'));
    expect([a.w, a.h]).toEqual([4, 2]);
    expect(a.px(1, 0)).toEqual([255, 0, 0, 255]);
    expect(a.px(0, 0)).toEqual([0, 0, 0, 0]);
    expect(cli('export', f, '--scale', '3', '--out', path.join(dir, 'big'))).toBe(0);
    const b = readPng(path.join(dir, 'big', 'hero.png'));
    expect([b.w, b.h]).toEqual([12, 6]);
    expect(b.px(5, 2)).toEqual([255, 0, 0, 255]);
  });

  it('exports every frame, a GIF and a sheet with Aseprite JSON', () => {
    const f = writeSpr('walk.spr', [0, 1, 2].map((i) => frame(i, grid(2, 2, [[i % 2, 0, '#00ff00']]))), 2, 2,
      [{ id: 't', name: 'walk', from: 0, to: 2, direction: 'forward' }]);
    expect(cli('export', f, '--format', 'png,gif,sheet', '--frame', 'all', '--columns', '2')).toBe(0);
    for (const n of ['walk-1.png', 'walk-2.png', 'walk-3.png', 'walk.gif', 'walk_sheet.png', 'walk_sheet.json']) expect(fs.existsSync(path.join(dir, n))).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'walk.gif')).subarray(0, 6).toString()).toBe('GIF89a');
    expect([readPng(path.join(dir, 'walk_sheet.png')).w, readPng(path.join(dir, 'walk_sheet.png')).h]).toEqual([4, 4]);
    const json = JSON.parse(fs.readFileSync(path.join(dir, 'walk_sheet.json'), 'utf8'));
    expect(json.frames).toHaveLength(3);
    expect(json.frames[1].frame).toEqual({ x: 2, y: 0, w: 2, h: 2 });
    expect(json.frames[2].duration).toBe(120);
    expect(json.meta.frameTags).toEqual([{ name: 'walk', from: 0, to: 2, direction: 'forward' }]);
  });

  it('keeps only a tag’s frames with --tag', () => {
    const f = writeSpr('hero.spr', [0, 1, 2, 3].map((i) => frame(i, grid(2, 2))), 2, 2, [
      { id: 'a', name: 'idle', from: 0, to: 1, direction: 'forward' },
      { id: 'b', name: 'run', from: 2, to: 3, direction: 'forward' },
    ]);
    expect(cli('export', f, '--format', 'sheet', '--tag', 'run')).toBe(0);
    const json = JSON.parse(fs.readFileSync(path.join(dir, 'hero-run_sheet.json'), 'utf8'));
    expect(json.frames.map((x: { duration: number }) => x.duration)).toEqual([120, 130]);
    expect(cli('export', f, '--tag', 'jump')).toBe(1);
    expect(err.join('\n')).toMatch(/no tag "jump" \(it has idle, run\)/);
  });

  it('writes Sindri textures and prefabs, with tilemap layers as a -map prefab', () => {
    const tile: [number, number, string][] = [[0, 0, '#112233'], [1, 1, '#445566']];
    const map = grid(8, 4, [...tile, ...tile.map(([x, y, c]) => [x + 4, y, c] as [number, number, string])]);
    const f: Frame = { id: 'f', duration: 100, layers: [
      { id: 'a', name: 'hero', visible: true, opacity: 1, pixels: grid(8, 4, [[3, 3, '#ffffff']]) },
      { id: 'b', name: 'ground', visible: true, opacity: 1, pixels: map, tilemap: { tw: 4, th: 4 } },
    ] };
    const file = writeSpr('Level One.spr', [f], 8, 4);
    const assets = path.join(dir, 'game', 'assets');
    expect(cli('export', file, '--sindri', assets)).toBe(0);
    for (const n of ['textures/level-one.png', 'textures/level-one.sheet.json', 'prefabs/level-one.prefab.json',
      'textures/level-one-map.png', 'textures/level-one-map.sheet.json', 'prefabs/level-one-map.prefab.json']) {
      expect(fs.existsSync(path.join(assets, n))).toBe(true);
    }
    const prefab = JSON.parse(fs.readFileSync(path.join(assets, 'prefabs/level-one-map.prefab.json'), 'utf8'));
    expect(prefab.entities[0].components['sindri.tilemap']).toMatchObject({ columns: 2, rows: 1, tiles: [0, 0], palette: ['tile-1'] });
    expect(cli('export', file, '--format', 'tiled', '--out', path.join(dir, 'tiled'))).toBe(0);
    const tmj = JSON.parse(fs.readFileSync(path.join(dir, 'tiled', 'Level One.tmj'), 'utf8'));
    expect(tmj.layers[0].data).toEqual([1, 1]);
  });

  it('exports whole folders and reports failures without stopping', () => {
    writeSpr('art/a.spr', [frame(0, grid(1, 1))], 1, 1);
    writeSpr('art/sub/b.spr', [frame(0, grid(1, 1))], 1, 1);
    fs.writeFileSync(path.join(dir, 'art', 'broken.spr'), '{not json');
    expect(cli('export', path.join(dir, 'art'), '--out', path.join(dir, 'build'))).toBe(1);
    expect(fs.readdirSync(path.join(dir, 'build')).sort()).toEqual(['a.png', 'b.png']);
    expect(out.at(-1)).toBe('2 of 3 exported');
    expect(err.join('\n')).toMatch(/broken\.spr: .*not valid JSON/);
  });
});

describe('usage', () => {
  it('explains mistakes and exits 2', () => {
    expect(cli('export', 'x.spr', '--format', 'jpg')).toBe(2);
    expect(err[0]).toMatch(/unknown format "jpg"/);
    expect(cli('export', 'x.spr', '--format', 'sindri')).toBe(2);
    expect(cli('export', path.join(dir, 'missing.spr'))).toBe(2);
    expect(cli('nope')).toBe(2);
    expect(cli('--help')).toBe(0);
    expect(out.join('\n')).toMatch(/sindri-pixel export/);
  });

  it('describes a sprite with info', () => {
    const f = writeSpr('hero.spr', [frame(0, grid(2, 2)), frame(1, grid(2, 2))], 2, 2, [{ id: 't', name: 'run', from: 0, to: 1, direction: 'pingpong' }]);
    expect(cli('info', f)).toBe(0);
    expect(out.join('\n')).toMatch(/2 × 2 px · 2 frames · 210 ms[\s\S]*tags: run 1–2 pingpong/);
  });
});
