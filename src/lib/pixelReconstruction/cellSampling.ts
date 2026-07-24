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

import { createImage, pixelAt, setPixel } from './color';
import type { RGBA, RGBAImage } from './types';

// Below this alpha a cell's representative pixel is treated as transparent
// (when the transparent-background option is on).
const ALPHA_TRANSPARENT_CUTOFF = 128;

// Radial vote weight falls off from the cell centre. σ is in units of the cell
// half-extent: at σ=0.5 the centre weighs 1, the edge midpoints ~0.14, corners
// ~0.02. Small enough to reject boundary slivers, wide enough that a genuine
// off-centre detail still carries real weight.
const CENTER_WEIGHT_SIGMA = 0.5;

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

/**
 * Resample `source` down to a low-resolution sprite by taking the mode color of
 * each logical cell. With `grid` the cells follow the detected phased lattice;
 * without it the image is divided equally into `gridWidth × gridHeight` cells.
 */
export function sampleCells(
  source: RGBAImage,
  gridWidth: number,
  gridHeight: number,
  transparentBackground: boolean,
  grid?: GridSpec,
): RGBAImage {
  const xb = grid ? axisBoundaries(source.width, grid.cellWidth, grid.offsetX) : equalBoundaries(source.width, gridWidth);
  const yb = grid ? axisBoundaries(source.height, grid.cellHeight, grid.offsetY) : equalBoundaries(source.height, gridHeight);
  const gw = xb.length - 1;
  const gh = yb.length - 1;
  const out = createImage(gw, gh);

  for (let gy = 0; gy < gh; gy++) {
    const y0 = yb[gy];
    const y1 = Math.max(y0 + 1, yb[gy + 1]);
    for (let gx = 0; gx < gw; gx++) {
      const x0 = xb[gx];
      const x1 = Math.max(x0 + 1, xb[gx + 1]);
      setPixel(out, gx, gy, sampleRegion(source, x0, y0, x1, y1, transparentBackground));
    }
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
  const xb = grid ? axisBoundaries(source.width, grid.cellWidth, grid.offsetX) : equalBoundaries(source.width, gridWidth);
  const yb = grid ? axisBoundaries(source.height, grid.cellHeight, grid.offsetY) : equalBoundaries(source.height, gridHeight);
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
    a,
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
  const buckets = new Map<number, Bucket>();

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const c = pixelAt(source, x, y);
      const w = centerWeight(x, y, x0, y0, x1, y1);
      const key = bucketKey(c);
      const b = buckets.get(key);
      if (b) {
        b.weight += w;
        b.r += c.r * w;
        b.g += c.g * w;
        b.b += c.b * w;
        b.a += c.a * w;
      } else {
        buckets.set(key, { weight: w, r: c.r * w, g: c.g * w, b: c.b * w, a: c.a * w });
      }
    }
  }

  // Pick the highest-weighted bucket (ties broken by the earlier-seen key so
  // the result is deterministic).
  let best: Bucket | null = null;
  for (const b of buckets.values()) {
    if (!best || b.weight > best.weight) best = b;
  }
  if (!best) return { r: 0, g: 0, b: 0, a: 0 };

  // Representative = weighted average of the original pixels in the winning
  // bucket (the same weights, so the centre dominates the tint too).
  const a = Math.round(best.a / best.weight);
  if (transparentBackground && a < ALPHA_TRANSPARENT_CUTOFF) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  return {
    r: Math.round(best.r / best.weight),
    g: Math.round(best.g / best.weight),
    b: Math.round(best.b / best.weight),
    a,
  };
}
