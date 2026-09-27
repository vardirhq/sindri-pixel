// Sindri Pixel — palette editing and palette files.
//
// Recolouring: pixel art is made of a handful of colours, so changing one
// colour everywhere at once (every frame, every layer) is the everyday way
// to tweak a sprite, make a palette swap, or turn an AI import's near-misses
// into the colour you meant. Classic editors get this from "indexed" mode;
// here it works directly on the colours.
//
// Palette files: the formats pixel artists trade palettes in —
//   .gpl  GIMP palette (Aseprite, Krita, Inkscape read and write it)
//   .hex  one RRGGBB per line (Lospec's download format)
//   .pal  JASC-PAL (Paint Shop Pro, many older tools)

import type { Frame } from '../types';

const HEX = /^#[0-9a-f]{6}$/;

/** Replace colour `from` with `to` in every layer of every frame. Returns
 *  the same array when nothing used `from`. */
export function recolor(frames: Frame[], from: string, to: string): Frame[] {
  const a = from.toLowerCase();
  const b = to.toLowerCase();
  if (a === b) return frames;
  let changed = false;
  const out = frames.map((f) => {
    let frameChanged = false;
    const layers = f.layers.map((l) => {
      if (!l.pixels.some((row) => row.some((c) => c?.toLowerCase() === a))) return l;
      frameChanged = true;
      return { ...l, pixels: l.pixels.map((row) => row.map((c) => (c?.toLowerCase() === a ? b : c))) };
    });
    if (!frameChanged) return f;
    changed = true;
    return { ...f, layers };
  });
  return changed ? out : frames;
}

/** How many pixels (across frames and layers) use a colour. */
export function colorUsage(frames: Frame[], color: string): number {
  const c = color.toLowerCase();
  let n = 0;
  for (const f of frames) for (const l of f.layers) for (const row of l.pixels) for (const p of row) if (p?.toLowerCase() === c) n++;
  return n;
}

export type PaletteFormat = 'gpl' | 'hex' | 'pal';

const hex2 = (v: number) => v.toString(16).padStart(2, '0');
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Write a palette in the given format. */
export function writePalette(colors: string[], format: PaletteFormat, name = 'Sindri Pixel'): string {
  const list = colors.map((c) => c.toLowerCase()).filter((c) => HEX.test(c));
  if (format === 'hex') return list.map((c) => c.slice(1)).join('\n') + '\n';
  if (format === 'pal') return ['JASC-PAL', '0100', String(list.length), ...list.map((c) => rgb(c).join(' '))].join('\r\n') + '\r\n';
  return [
    'GIMP Palette',
    `Name: ${name.replace(/[\r\n]/g, ' ')}`,
    'Columns: 8',
    '#',
    ...list.map((c) => `${rgb(c).map((v) => String(v).padStart(3)).join(' ')}\t${c.slice(1)}`),
  ].join('\n') + '\n';
}

/** Read a palette file of any supported format (detected from its content).
 *  Duplicates are removed; throws if no colour can be read. */
export function readPalette(text: string): string[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim());
  const colors: string[] = [];
  const add = (r: number, g: number, b: number) => {
    if ([r, g, b].every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) colors.push(`#${hex2(r)}${hex2(g)}${hex2(b)}`);
  };
  const triple = (line: string) => {
    const m = line.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s|$)/);
    if (m) add(+m[1], +m[2], +m[3]);
  };
  if (lines[0] === 'GIMP Palette') {
    for (const line of lines.slice(1)) {
      if (!line || line.startsWith('#') || /^(Name|Columns):/i.test(line)) continue;
      triple(line);
    }
  } else if (lines[0] === 'JASC-PAL') {
    for (const line of lines.slice(3)) triple(line);
  } else {
    for (const line of lines) {
      const m = line.match(/^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i); // RRGGBB, optionally with alpha
      if (m) colors.push(`#${m[1].toLowerCase()}`);
    }
  }
  const unique = [...new Set(colors)];
  if (!unique.length) throw new Error('No colours found in that palette file.');
  return unique;
}
