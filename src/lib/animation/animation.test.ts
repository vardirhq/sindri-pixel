import { describe, expect, it } from 'vitest';
import { anchorPoint, composeFrame, flipX, layoutFrames, opaqueBounds } from './layout';
import { buildSheet, scaleImage, sheetGrid, sheetJson, toSprProject } from './sheet';
import { encodeGif } from './gif';
import { planGrids, sharedCellSize, type GridCache } from './sequence';
import { parseProject } from '../project-format';
import { BLUE, RED, get, makeImage, put, realisticLogical, softScene, upscale } from '../pixelReconstruction/__fixtures__/synthetic';
import { DEFAULT_OPTIONS, type RGBA, type RGBAImage } from '../pixelReconstruction/types';

/** A w×h opaque block of `c` at (x, y) inside a transparent W×H image. */
function block(W: number, H: number, x: number, y: number, w: number, h: number, c: RGBA = RED): RGBAImage {
  const img = makeImage(W, H);
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(img, i, j, c);
  return img;
}

describe('frame layout', () => {
  it('finds the opaque bounds', () => {
    expect(opaqueBounds(block(10, 10, 2, 3, 4, 5))).toEqual({ x0: 2, y0: 3, x1: 6, y1: 8 });
    expect(opaqueBounds(makeImage(4, 4))).toBeNull();
  });

  it('anchors feet at the center of mass, on the bottom edge', () => {
    // An L shape: a heavy torso plus one outstretched pixel to the right.
    const img = block(20, 20, 4, 4, 4, 12);
    put(img, 15, 6, RED);
    expect(anchorPoint(img, 'feet')).toEqual({ x: 6, y: 16 }); // not bbox-middle 9
    expect(anchorPoint(img, 'none')).toEqual({ x: 0, y: 0 });
  });

  it('stands every frame on the same ground', () => {
    // The same 4×6 character drawn at different spots in two frames.
    const a = block(16, 16, 1, 2, 4, 6);
    const b = block(16, 16, 9, 7, 4, 6);
    const frames = [a, b].map((sprite) => ({ sprite, offsetX: 0, offsetY: 0, flipX: false }));
    const layout = layoutFrames(frames, 'feet', 1);
    expect([layout.width, layout.height]).toEqual([6, 8]); // tight box + 1px margin
    expect(layout.origin.y).toBe(7); // the ground: the row under the feet
    const composed = frames.map((f, i) => composeFrame(f, layout.positions[i], layout.width, layout.height));
    expect(composed[0].data).toEqual(composed[1].data);
    expect(get(composed[0], 1, 1)).toEqual(RED);
    expect(get(composed[0], 0, 0).a).toBe(0);
  });

  it('applies per-frame offsets and grows the canvas to fit', () => {
    const f = (dx: number) => ({ sprite: block(8, 8, 2, 2, 2, 2), offsetX: dx, offsetY: 0, flipX: false });
    const layout = layoutFrames([f(0), f(3)], 'feet', 0);
    expect(layout.width).toBe(5);
    expect(layout.positions[1].x - layout.positions[0].x).toBe(3);
  });

  it('places frames on a fixed canvas bottom-center', () => {
    const layout = layoutFrames([{ sprite: block(8, 8, 0, 0, 2, 4), offsetX: 0, offsetY: 0, flipX: false }], 'feet', 0, { width: 16, height: 16 });
    const out = composeFrame({ sprite: block(8, 8, 0, 0, 2, 4), offsetX: 0, offsetY: 0, flipX: false }, layout.positions[0], 16, 16);
    expect(opaqueBounds(out)).toEqual({ x0: 7, y0: 12, x1: 9, y1: 16 });
  });

  it('mirrors frames', () => {
    const img = block(4, 1, 0, 0, 1, 1);
    expect(get(flipX(img), 3, 0)).toEqual(RED);
    expect(get(flipX(img), 0, 0).a).toBe(0);
  });
});

describe('sprite sheets', () => {
  const frames = [block(3, 2, 0, 0, 3, 2, RED), block(3, 2, 0, 0, 3, 2, BLUE), block(3, 2, 0, 0, 1, 1, RED)];

  it('chooses a grid', () => {
    expect(sheetGrid(5, 'auto')).toEqual({ columns: 3, rows: 2 });
    expect(sheetGrid(5, 'row')).toEqual({ columns: 5, rows: 1 });
    expect(sheetGrid(5, 2)).toEqual({ columns: 2, rows: 3 });
  });

  it('packs frames with padding and scale', () => {
    const sheet = buildSheet(frames, { columns: 2, padding: 1, scale: 2 });
    expect([sheet.image.width, sheet.image.height]).toEqual([2 * 6 + 3, 2 * 4 + 3]);
    expect(sheet.rects[1]).toEqual({ x: 8, y: 1, w: 6, h: 4 });
    expect(get(sheet.image, 8, 1)).toEqual(BLUE);
    expect(get(sheet.image, 7, 1).a).toBe(0); // the padding gap
    expect(get(sheet.image, 1, 6)).toEqual(RED); // frame 3, row 2
  });

  it('upscales nearest-neighbor', () => {
    const s = scaleImage(block(2, 1, 1, 0, 1, 1), 3);
    expect([s.width, s.height]).toEqual([6, 3]);
    expect(get(s, 2, 2).a).toBe(0);
    expect(get(s, 3, 2)).toEqual(RED);
  });

  it('describes the sheet in Aseprite array JSON', () => {
    const sheet = buildSheet(frames, { columns: 'row', padding: 0, scale: 1 });
    const json = sheetJson(sheet, { name: 'run', durations: [100, 80, 120], pingPong: true, scale: 1 }) as {
      frames: { filename: string; frame: object; duration: number }[];
      meta: { size: object; image: string; frameTags: { direction: string; to: number }[] };
    };
    expect(json.frames[1]).toMatchObject({ filename: 'run 1.png', frame: { x: 3, y: 0, w: 3, h: 2 }, duration: 80 });
    expect(json.meta).toMatchObject({ image: 'run.png', size: { w: 9, h: 2 } });
    expect(json.meta.frameTags[0]).toMatchObject({ direction: 'pingpong', to: 2 });
  });

  it('exports a Sindri Pixel project the editor accepts', () => {
    const project = parseProject(toSprProject(frames, [100, 5, 90], 'run', ['#dc2828']));
    expect(project).toMatchObject({ name: 'run.spr', w: 3, h: 2 });
    expect(project.frames.map((f) => f.duration)).toEqual([100, 10, 90]); // clamped to the format
    expect(project.frames[1].layers[0].pixels[0][0]).toBe('#2850c8');
    expect(project.frames[2].layers[0].pixels[1][2]).toBeNull();
  });
});

// ── GIF: decode what we encode ──────────────────────────────────────────────

function decodeGif(bytes: Uint8Array) {
  let p = 0;
  const u8 = () => bytes[p++];
  const u16 = () => bytes[p++] | (bytes[p++] << 8);
  const sig = String.fromCharCode(...bytes.subarray(0, 6));
  p = 6;
  const width = u16();
  const height = u16();
  const packed = u8();
  p += 2;
  const palette: number[][] = [];
  if (packed & 0x80) for (let i = 0; i < 1 << ((packed & 7) + 1); i++) palette.push([u8(), u8(), u8()]);
  const frames: { delay: number; transparent: number; indices: number[] }[] = [];
  let loop = false;
  let delay = 0;
  let transparent = -1;
  for (;;) {
    const b = u8();
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = u8();
      if (label === 0xf9) {
        u8();
        const flags = u8();
        delay = u16();
        const t = u8();
        transparent = flags & 1 ? t : -1;
        u8();
      } else {
        if (label === 0xff) loop = true;
        for (let n = u8(); n; n = u8()) p += n;
      }
    } else if (b === 0x2c) {
      p += 8;
      u8();
      const minCode = u8();
      const data: number[] = [];
      for (let n = u8(); n; n = u8()) { for (let i = 0; i < n; i++) data.push(u8()); }
      frames.push({ delay, transparent, indices: lzwDecode(data, minCode, width * height) });
    } else throw new Error(`bad block ${b}`);
  }
  return { sig, width, height, palette, frames, loop };
}

function lzwDecode(data: number[], minCode: number, count: number): number[] {
  const clear = 1 << minCode;
  const eoi = clear + 1;
  let size = minCode + 1;
  let dict: number[][] = [];
  const reset = () => { dict = Array.from({ length: clear + 2 }, (_, i) => [i]); size = minCode + 1; };
  reset();
  const out: number[] = [];
  let bit = 0;
  let prev: number[] | null = null;
  while (out.length < count) {
    let code = 0;
    for (let i = 0; i < size; i++, bit++) code |= ((data[bit >> 3] >> (bit & 7)) & 1) << i;
    if (code === clear) { reset(); prev = null; continue; }
    if (code === eoi) break;
    let entry: number[];
    if (code < dict.length) entry = dict[code];
    else if (prev) entry = [...prev, prev[0]];
    else throw new Error('bad code');
    out.push(...entry);
    if (prev) dict.push([...prev, entry[0]]);
    prev = entry;
    if (dict.length === 1 << size && size < 12) size++;
  }
  return out;
}

describe('GIF encoding', () => {
  it('round-trips frames, palette, transparency, delays and looping', () => {
    const a = block(5, 4, 1, 1, 3, 2, RED);
    const b = block(5, 4, 0, 0, 2, 4, BLUE);
    const gif = decodeGif(encodeGif([a, b], [100, 250]));
    expect(gif.sig).toBe('GIF89a');
    expect([gif.width, gif.height, gif.loop]).toEqual([5, 4, true]);
    expect(gif.frames.map((f) => f.delay)).toEqual([10, 25]);
    const render = (f: (typeof gif.frames)[number]) => f.indices.map((i) => (i === f.transparent ? null : gif.palette[i]));
    const expected = (img: RGBAImage) =>
      Array.from({ length: 20 }, (_, i) => (img.data[i * 4 + 3] ? [img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]] : null));
    expect(render(gif.frames[0])).toEqual(expected(a));
    expect(render(gif.frames[1])).toEqual(expected(b));
  });

  it('survives long runs and code-table resets (large, noisy frames)', () => {
    const img = softScene(60, 50, 3, 3).image; // 180×150, a few hundred colors
    const gif = decodeGif(encodeGif([img], [100]));
    expect(gif.frames[0].indices).toHaveLength(180 * 150);
    expect(gif.palette.length).toBeLessThanOrEqual(256); // >255 colors were quantized
  });

  it('can play once', () => {
    expect(decodeGif(encodeGif([block(2, 2, 0, 0, 1, 1)], [100], { loop: false })).loop).toBe(false);
  });
});

describe('frame grid planning', () => {
  const frame = (id: string, cell: number, scale = 1) => ({ id, source: upscale(realisticLogical(8, 8, 11), cell), scale });

  it('takes the median of confident detections', () => {
    const d = (s: number, confidence: 'high' | 'low' = 'high') => ({ detectedCellSize: s, confidence }) as never;
    expect(sharedCellSize([d(10), d(12), d(11)])).toBe(11);
    expect(sharedCellSize([d(10), d(30, 'low'), d(12)])).toBe(11);
  });

  it('shares one pixel size across frames and re-reads scaled frames from source', () => {
    const cache: GridCache = new Map();
    const plan = planGrids([frame('a', 10), frame('b', 10), frame('c', 10, 0.5)], DEFAULT_OPTIONS, true, cache);
    expect(plan.sharedCellSize).toBeCloseTo(10, 0);
    expect(plan.grids.map((g) => g.gridWidth).slice(0, 2)).toEqual([8, 8]);
    // Half scale: pixels read at 2× the size → about half the grid (±1 for a
    // partial cell where the fitted lines pick up the art's phase).
    expect(Math.abs(plan.grids[2].gridWidth - 4)).toBeLessThanOrEqual(1);
    // Cached: a re-run with the same inputs detects nothing new.
    const size = cache.size;
    planGrids([frame('a', 10), frame('b', 10), frame('c', 10, 0.5)], DEFAULT_OPTIONS, true, cache);
    expect(cache.size).toBe(size);
  });

  it('scales explicit pixel sizes and output sizes per frame', () => {
    const cache: GridCache = new Map();
    const bySize = planGrids([frame('a', 10, 2)], { ...DEFAULT_OPTIONS, autoDetectGrid: false, cellSize: 10 }, true, cache);
    expect(bySize.grids[0].gridWidth).toBe(16);
    const byTarget = planGrids([frame('a', 10, 0.5)], { ...DEFAULT_OPTIONS, autoDetectGrid: false, targetWidth: 8, targetHeight: 4 }, true, cache);
    expect([byTarget.grids[0].gridWidth, byTarget.grids[0].gridHeight]).toEqual([4, 2]);
  });
});
