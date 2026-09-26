// Sindri Pixel — mode-color sampling per logical cell.
//
// For each output cell we take the *mode* color of the corresponding source
// region, not the mean/median. Mode is far more resistant to anti-aliased edge
// pixels dragging the result toward a blend color. To avoid picking a single
// slightly-off pixel as "the" mode, we bucket pixels by a coarse 4-bit-per-
// channel quantization, find the most populated bucket, then average the
// original (full-precision) pixels that fell in that bucket.
//
// The vote is *center-weighted*: a pixel near the cell centre counts for more
// than one near the boundary. The logical pixel a cell represents lives at its
// centre, so when a grid line is slightly off and a cell straddles two logical
// pixels, a plain count lets the intruding edge colour win by area. Down-
// weighting the border makes the central colour win instead — an eye pixel that
// is 45% black (centre) and 55% skin (a boundary sliver) resolves to black, the
// way a human counting pixels reads it. On a correctly aligned cell every pixel
// shares one colour, so the weighting changes nothing.
//
// Transparency is decided separately from colour. AI rasters on transparency
// carry an anti-aliased fringe (half-transparent pixels, often darkened) and
// frequently store their "solid" pixels at 94–99% opacity. So a cell is filled
// or empty by its *coverage* (center-weighted mean alpha), its colour comes
// only from its solid pixels (a fringe never tints the edge), and with a
// transparent background the result is fully opaque or fully clear — no
// faint halo, no see-through sprite.
//
// Small pixels are un-blurred first. When a logical pixel is only 2–4 source
// px wide, the AI's anti-aliasing reaches its centre, so no source pixel holds
// the true colour and every vote is a blend with the neighbours. A light
// deconvolution (Van Cittert against a 3×3 tent) pushes those blends back
// toward the colours they were mixed from. It amplifies noise, so it runs
// only as often as the pixel size needs, and not at all on large pixels.

import { createImage, pixelAt, setPixel } from './color';
import type { RGBA, RGBAImage } from './types';

// Below this alpha a cell's representative pixel is treated as transparent
// (when the transparent-background option is on).
const ALPHA_TRANSPARENT_CUTOFF = 128;
// Pixels at least this opaque are "solid" and vote on a cell's colour.
const SOLID_ALPHA = 192;

// Radial vote weight falls off from the cell centre. σ is in units of the cell
// half-extent: at σ=0.5 the centre weighs 1, the edge midpoints ~0.14, corners
// ~0.02. Small enough to reject boundary slivers, wide enough that a genuine
// off-centre detail still carries real weight.
const CENTER_WEIGHT_SIGMA = 0.5;

/** Deblur passes for a mean cell size: more for smaller pixels, none from 5px. */
function deblurPasses(cellSize: number): number {
  if (cellSize < 2.5) return 2;
  if (cellSize < 5) return 1;
  return 0;
}

/** Radial weight of source pixel (x, y) within cell [x0,x1)×[y0,y1). */
function centerWeight(
  x: number,
  y: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const cx = (x0 + x1 - 1) / 2;
  const cy = (y0 + y1 - 1) / 2;
  const hx = Math.max((x1 - x0) / 2, 0.5);
  const hy = Math.max((y1 - y0) / 2, 0.5);
  const ndx = (x - cx) / hx;
  const ndy = (y - cy) / hy;
  const d2 = ndx * ndx + ndy * ndy;
  return Math.exp(-d2 / (2 * CENTER_WEIGHT_SIGMA * CENTER_WEIGHT_SIGMA));
}

interface Bucket {
  weight: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Coarse 4-bit-per-channel key grouping near-identical AA variants together. */
function bucketKey(c: RGBA): number {
  const r = c.r >> 4;
  const g = c.g >> 4;
  const b = c.b >> 4;
  const a = c.a >> 4;
  return (r << 12) | (g << 8) | (b << 4) | a;
}

/**
 * A phased grid: cells of size `cellWidth × cellHeight` with grid lines offset
 * from the origin by `offsetX / offsetY`. Detection produces this so sampling
 * lands cell boundaries on the source's real pixel lattice rather than assuming
 * the grid starts at (0, 0) — a small offset otherwise smears fine detail.
 */
export interface GridSpec {
  cellWidth: number;
  cellHeight: number;
  offsetX: number;
  offsetY: number;
  /** Explicit cell edges per axis (`[0, …, length]`); take precedence when set. */
  xBounds?: number[];
  yBounds?: number[];
}

/** Boundary positions for a phased grid: lines at `offset + k·cell`, spanning [0, length]. */
export function axisBoundaries(length: number, cell: number, offset: number): number[] {
  const b = [0];
  let pos = offset;
  while (pos <= 0.5) pos += cell; // first interior line strictly inside the image
  for (; pos < length - 0.5; pos += cell) b.push(Math.round(pos));
  b.push(length);
  return b;
}

/** Equal division into `count` cells (the default phase-0 grid). */
function equalBoundaries(length: number, count: number): number[] {
  const b: number[] = [];
  for (let k = 0; k <= count; k++) b.push(Math.floor((k * length) / count));
  return b;
}

/** Cell edges per axis: explicit fitted bounds, a phased lattice, or equal division. */
function gridBounds(source: RGBAImage, gridWidth: number, gridHeight: number, grid?: GridSpec): [number[], number[]] {
  if (!grid) return [equalBoundaries(source.width, gridWidth), equalBoundaries(source.height, gridHeight)];
  return [
    grid.xBounds ?? axisBoundaries(source.width, grid.cellWidth, grid.offsetX),
    grid.yBounds ?? axisBoundaries(source.height, grid.cellHeight, grid.offsetY),
  ];
}

/**
 * Resample `source` down to a low-resolution sprite by taking the mode color of
 * each logical cell. With `grid` the cells follow the detected (fitted) grid;
 * without it the image is divided equally into `gridWidth × gridHeight` cells.
 */
export function sampleCells(
  source: RGBAImage,
  gridWidth: number,
  gridHeight: number,
  transparentBackground: boolean,
  grid?: GridSpec,
): RGBAImage {
  const [xb, yb] = gridBounds(source, gridWidth, gridHeight, grid);
  const gw = xb.length - 1;
  const gh = yb.length - 1;
  const out = createImage(gw, gh);
  const cellSize = Math.min(source.width / gw, source.height / gh);
  const deblurred = deblur(source, deblurPasses(cellSize));

  for (let gy = 0; gy < gh; gy++) {
    const y0 = yb[gy];
    const y1 = Math.max(y0 + 1, yb[gy + 1]);
    for (let gx = 0; gx < gw; gx++) {
      const x0 = xb[gx];
      const x1 = Math.max(x0 + 1, xb[gx + 1]);
      setPixel(out, gx, gy, sampleRegion(deblurred, x0, y0, x1, y1, transparentBackground));
    }
  }
  return out;
}

const TENT = [1, 2, 1];

const clampTo = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Van Cittert deconvolution against a 3×3 tent: `f ← f + (source − tent(f))`,
 * `passes` times, on the colour of solid pixels only. The tent averages over
 * solid neighbours alone, so a transparent backdrop (whose RGB is arbitrary,
 * usually black) never darkens an outline, and alpha is left untouched.
 */
export function deblur(source: RGBAImage, passes: number): RGBAImage {
  if (passes <= 0) return source;
  const { width: W, height: H, data: src } = source;
  let f = new Float32Array(W * H * 3);
  for (let p = 0; p < W * H; p++) {
    for (let k = 0; k < 3; k++) f[p * 3 + k] = src[p * 4 + k];
  }
  // Each pixel may move only within its solid 3×3 neighbourhood's colour
  // range: a blend is pulled toward the colours around it, but a hard edge
  // (already at the extremes) cannot overshoot into ringing.
  const lo = new Float32Array(W * H * 3).fill(255);
  const hi = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const q = yy * W + xx;
          if (src[q * 4 + 3] < SOLID_ALPHA) continue;
          for (let k = 0; k < 3; k++) {
            const v = src[q * 4 + k];
            if (v < lo[p * 3 + k]) lo[p * 3 + k] = v;
            if (v > hi[p * 3 + k]) hi[p * 3 + k] = v;
          }
        }
      }
    }
  }
  for (let pass = 0; pass < passes; pass++) {
    const next = new Float32Array(f);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (src[p * 4 + 3] < SOLID_ALPHA) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let ws = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= W) continue;
            const q = yy * W + xx;
            if (src[q * 4 + 3] < SOLID_ALPHA) continue;
            const w = TENT[dy + 1] * TENT[dx + 1];
            r += f[q * 3] * w;
            g += f[q * 3 + 1] * w;
            b += f[q * 3 + 2] * w;
            ws += w;
          }
        }
        next[p * 3] = clampTo(next[p * 3] + src[p * 4] - r / ws, lo[p * 3], hi[p * 3]);
        next[p * 3 + 1] = clampTo(next[p * 3 + 1] + src[p * 4 + 1] - g / ws, lo[p * 3 + 1], hi[p * 3 + 1]);
        next[p * 3 + 2] = clampTo(next[p * 3 + 2] + src[p * 4 + 2] - b / ws, lo[p * 3 + 2], hi[p * 3 + 2]);
      }
    }
    f = next;
  }
  const out = createImage(W, H);
  for (let p = 0; p < W * H; p++) {
    for (let k = 0; k < 3; k++) out.data[p * 4 + k] = f[p * 3 + k];
    out.data[p * 4 + 3] = src[p * 4 + 3];
  }
  return out;
}

/**
 * Resample `source` down to `gridWidth × gridHeight` by taking the alpha-
 * weighted mean of each logical cell. This is a detail-preserving downscale
 * (a box/area filter): gradients, shading, and soft edges survive, where mode
 * sampling would flatten them. Color is averaged in premultiplied space so
 * transparent pixels don't bleed into the result.
 */
export function sampleCellsAverage(
  source: RGBAImage,
  gridWidth: number,
  gridHeight: number,
  transparentBackground: boolean,
  grid?: GridSpec,
): RGBAImage {
  const [xb, yb] = gridBounds(source, gridWidth, gridHeight, grid);
  const gw = xb.length - 1;
  const gh = yb.length - 1;
  const out = createImage(gw, gh);

  for (let gy = 0; gy < gh; gy++) {
    const y0 = yb[gy];
    const y1 = Math.max(y0 + 1, yb[gy + 1]);
    for (let gx = 0; gx < gw; gx++) {
      const x0 = xb[gx];
      const x1 = Math.max(x0 + 1, xb[gx + 1]);
      setPixel(out, gx, gy, averageRegion(source, x0, y0, x1, y1, transparentBackground));
    }
  }
  return out;
}

function averageRegion(
  source: RGBAImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  transparentBackground: boolean,
): RGBA {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumA = 0;
  let count = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const c = pixelAt(source, x, y);
      // Premultiply by alpha so transparent pixels contribute no color.
      sumR += c.r * c.a;
      sumG += c.g * c.a;
      sumB += c.b * c.a;
      sumA += c.a;
      count++;
    }
  }

  if (count === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const a = Math.round(sumA / count);
  if (sumA === 0 || (transparentBackground && a < ALPHA_TRANSPARENT_CUTOFF)) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  return {
    r: Math.round(sumR / sumA),
    g: Math.round(sumG / sumA),
    b: Math.round(sumB / sumA),
    // A sprite on a transparent background is solid or clear, never faint.
    a: transparentBackground ? 255 : a,
  };
}

function sampleRegion(
  source: RGBAImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  transparentBackground: boolean,
): RGBA {
  const solid = new Map<number, Bucket>();
  const any = new Map<number, Bucket>(); // fallback: a cell that is all fringe
  let coverW = 0;
  let coverA = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const c = pixelAt(source, x, y);
      const w = centerWeight(x, y, x0, y0, x1, y1);
      coverW += w;
      coverA += c.a * w;
      if (c.a === 0) continue;
      const target = c.a >= SOLID_ALPHA ? solid : any;
      // Fringe pixels vote in proportion to their opacity.
      const vw = c.a >= SOLID_ALPHA ? w : (w * c.a) / 255;
      const key = bucketKey({ ...c, a: 255 });
      const b = target.get(key);
      if (b) {
        b.weight += vw;
        b.r += c.r * vw;
        b.g += c.g * vw;
        b.b += c.b * vw;
        b.a += c.a * vw;
      } else {
        target.set(key, { weight: vw, r: c.r * vw, g: c.g * vw, b: c.b * vw, a: c.a * vw });
      }
    }
  }

  const coverage = coverW > 0 ? coverA / coverW : 0;
  if (coverage < 1 || (transparentBackground && coverage < ALPHA_TRANSPARENT_CUTOFF)) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  // Pick the highest-weighted bucket (ties broken by the earlier-seen key so
  // the result is deterministic), from the solid pixels when there are any.
  let best: Bucket | null = null;
  for (const b of (solid.size ? solid : any).values()) {
    if (!best || b.weight > best.weight) best = b;
  }
  if (!best) return { r: 0, g: 0, b: 0, a: 0 };

  // Representative = weighted average of the original pixels in the winning
  // bucket (the same weights, so the centre dominates the tint too).
  return {
    r: Math.round(best.r / best.weight),
    g: Math.round(best.g / best.weight),
    b: Math.round(best.b / best.weight),
    a: transparentBackground ? 255 : Math.round(coverage),
  };
}
