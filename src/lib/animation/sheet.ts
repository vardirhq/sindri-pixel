// Sindri Pixel — sprite-sheet packing and its metadata.
//
// Frames are packed into a grid, optionally padded and scaled up with
// nearest-neighbor, and described by JSON in Aseprite's "array" format —
// the de-facto sheet format that Phaser, Godot, Unity and most engine
// importers read directly.

import { serializeProject } from '../project-format';
import type { Frame } from '../../types';
import type { RGBAImage } from '../pixelReconstruction/types';

/** Columns: a count, `auto` (close to square), or `row` (one strip). */
export type SheetColumns = number | 'auto' | 'row';

export interface SheetOptions {
  columns: SheetColumns;
  /** Transparent gap between cells (and around the edge), in output pixels. */
  padding: number;
  /** Integer nearest-neighbor upscale. */
  scale: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Sheet {
  image: RGBAImage;
  rects: Rect[];
  columns: number;
  rows: number;
}

/** Keep sheets comfortably inside browser canvas limits. */
export const MAX_SHEET_PIXELS = 16_777_216; // 4096²

/** Column/row count for `count` frames. */
export function sheetGrid(count: number, columns: SheetColumns): { columns: number; rows: number } {
  const n = Math.max(1, count);
  const cols = columns === 'row' ? n : columns === 'auto' ? Math.ceil(Math.sqrt(n)) : Math.max(1, Math.min(n, Math.round(columns)));
  return { columns: cols, rows: Math.ceil(n / cols) };
}

/** Integer nearest-neighbor upscale. */
export function scaleImage(image: RGBAImage, scale: number): RGBAImage {
  const k = Math.max(1, Math.round(scale));
  if (k === 1) return image;
  const { data, width, height } = image;
  const out: RGBAImage = { data: new Uint8ClampedArray(width * k * height * k * 4), width: width * k, height: height * k };
  for (let y = 0; y < height * k; y++) {
    const sy = Math.floor(y / k);
    for (let x = 0; x < width * k; x++) {
      const from = (sy * width + Math.floor(x / k)) * 4;
      out.data.set(data.subarray(from, from + 4), (y * out.width + x) * 4);
    }
  }
  return out;
}

/** Pack equally-sized frames into a sheet. */
export function buildSheet(frames: RGBAImage[], options: SheetOptions): Sheet {
  if (frames.length === 0) throw new Error('A sprite sheet needs at least one frame');
  const k = Math.max(1, Math.round(options.scale));
  const pad = Math.max(0, Math.round(options.padding));
  const cellW = frames[0].width * k;
  const cellH = frames[0].height * k;
  const { columns, rows } = sheetGrid(frames.length, options.columns);
  const width = columns * cellW + (columns + 1) * pad;
  const height = rows * cellH + (rows + 1) * pad;
  if (width * height > MAX_SHEET_PIXELS) {
    throw new Error(`That sheet would be ${width} × ${height}px — too large. Lower the scale or change the layout.`);
  }
  const image: RGBAImage = { data: new Uint8ClampedArray(width * height * 4), width, height };
  const rects = frames.map((frame, i) => {
    const scaled = scaleImage(frame, k);
    const x = pad + (i % columns) * (cellW + pad);
    const y = pad + Math.floor(i / columns) * (cellH + pad);
    for (let row = 0; row < cellH; row++) {
      image.data.set(scaled.data.subarray(row * cellW * 4, (row + 1) * cellW * 4), ((y + row) * width + x) * 4);
    }
    return { x, y, w: cellW, h: cellH };
  });
  return { image, rects, columns, rows };
}

export interface SheetMeta {
  /** Base name used for frame names and the image file (`name.png`). */
  name: string;
  durations: number[];
  pingPong: boolean;
  scale: number;
}

/** Aseprite "array" JSON describing a sheet built by `buildSheet`. */
export function sheetJson(sheet: Sheet, meta: SheetMeta): object {
  return {
    frames: sheet.rects.map((r, i) => ({
      filename: `${meta.name} ${i}.png`,
      frame: r,
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: r.w, h: r.h },
      sourceSize: { w: r.w, h: r.h },
      duration: Math.round(meta.durations[i]),
    })),
    meta: {
      app: 'https://pixel.vardir.no',
      version: '1.0',
      image: `${meta.name}.png`,
      format: 'RGBA8888',
      size: { w: sheet.image.width, h: sheet.image.height },
      scale: String(meta.scale),
      frameTags: [
        { name: meta.name, from: 0, to: sheet.rects.length - 1, direction: meta.pingPong ? 'pingpong' : 'forward' },
      ],
    },
  };
}

const hex = (v: number) => v.toString(16).padStart(2, '0');

/**
 * A Sindri Pixel project (`.spr`) holding the frames, so the animation opens
 * in the desktop editor ready to touch up. Durations are clamped to what the
 * format accepts (10 ms – 60 s).
 */
export function toSprProject(frames: RGBAImage[], durations: number[], name: string, swatches: string[] = []): string {
  if (frames.length === 0) throw new Error('A project needs at least one frame');
  const { width: w, height: h } = frames[0];
  if (w > 512 || h > 512) throw new Error('Sindri Pixel projects are limited to 512 × 512');
  const projectFrames: Frame[] = frames.map((img, i) => ({
    id: `frame_${i}`,
    duration: Math.max(10, Math.min(60_000, Math.round(durations[i] ?? 100))),
    layers: [{
      id: 'l0',
      name: 'layer 1',
      visible: true,
      opacity: 1,
      pixels: Array.from({ length: h }, (_, y) =>
        Array.from({ length: w }, (_, x) => {
          const o = (y * w + x) * 4;
          return img.data[o + 3] < 128 ? null : `#${hex(img.data[o])}${hex(img.data[o + 1])}${hex(img.data[o + 2])}`;
        }),
      ),
    }],
  }));
  return serializeProject({ name: `${name}.spr`, w, h, frames: projectFrames, swatches });
}
