// Sindri Pixel — one-click effects: outline, drop shadow, trim.
//
// These are the things Aseprite users most often write scripts for. Each is
// a pure function over pixel grids so the editor can preview it live (run it
// again on the untouched pixels as the options change) and undo it as one
// step.

import type { Frame, PixelGrid } from '../types';
import { luma } from './lessons/checks';

export interface OutlineOptions {
  color: string;
  /** Around the art (outside) or on its own edge pixels (inside). */
  mode: 'outside' | 'inside';
  /** Count diagonal neighbours too (a thicker, rounder outline). */
  diagonal: boolean;
}

const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8: [number, number][] = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Outside: every empty pixel touching the art becomes `color`. Inside: every
 * art pixel touching emptiness (or the canvas edge) does.
 */
export function outline(pixels: PixelGrid, { color, mode, diagonal }: OutlineOptions): PixelGrid {
  const h = pixels.length;
  const w = pixels[0]?.length ?? 0;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? pixels[y][x] : null);
  const around = diagonal ? N8 : N4;
  return pixels.map((row, y) => row.map((c, x) => {
    if (mode === 'outside') return !c && around.some(([dx, dy]) => at(x + dx, y + dy)) ? color : c;
    return c && around.some(([dx, dy]) => !at(x + dx, y + dy)) ? color : c;
  }));
}

/** The art's shadow, `dx`/`dy` pixels away, wherever the art isn't. */
export function dropShadow(pixels: PixelGrid, color: string, dx: number, dy: number): PixelGrid {
  const h = pixels.length;
  const w = pixels[0]?.length ?? 0;
  return pixels.map((row, y) => row.map((c, x) => {
    if (c) return c;
    const sx = x - dx;
    const sy = y - dy;
    return sx >= 0 && sy >= 0 && sx < w && sy < h && pixels[sy][sx] ? color : null;
  }));
}

/** Only the pixels an effect added (to put them on a layer of their own). */
export function added(before: PixelGrid, after: PixelGrid): PixelGrid {
  return after.map((row, y) => row.map((c, x) => (c && c !== before[y]?.[x] ? c : null)));
}

export interface Rect { x: number; y: number; w: number; h: number }

/** The smallest rect holding every painted pixel of every frame and layer. */
export function contentBounds(frames: Frame[]): Rect | null {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const f of frames) for (const l of f.layers) l.pixels.forEach((row, y) => row.forEach((c, x) => {
    if (!c) return;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }));
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Grow a rect by `pad` on every side (it may reach past the canvas). */
export const padRect = (r: Rect, pad: number): Rect => ({ x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 });

/** Cut every layer of every frame to `rect`; outside the old canvas is empty. */
export function cropFrames(frames: Frame[], rect: Rect): Frame[] {
  return frames.map((f) => ({
    ...f,
    layers: f.layers.map((l) => ({
      ...l,
      pixels: Array.from({ length: rect.h }, (_, y) => Array.from({ length: rect.w }, (_, x) => l.pixels[rect.y + y]?.[rect.x + x] ?? null)),
    })),
  }));
}

/** The darkest colour among `colors` (the natural outline or shadow). */
export function darkest(colors: string[], fallback = '#000000'): string {
  const valid = colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  return valid.length ? valid.reduce((a, b) => (luma(b) < luma(a) ? b : a)) : fallback;
}
