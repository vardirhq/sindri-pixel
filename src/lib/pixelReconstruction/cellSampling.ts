// Sindri Pixel — mode-color sampling per logical cell.
//
// For each output cell we take the *mode* color of the corresponding source
// region, not the mean/median. Mode is far more resistant to anti-aliased edge
// pixels dragging the result toward a blend color. To avoid picking a single
// slightly-off pixel as "the" mode, we bucket pixels by a coarse 4-bit-per-
// channel quantization, find the most populated bucket, then average the
// original (full-precision) pixels that fell in that bucket.

import { createImage, pixelAt, setPixel } from './color';
import type { RGBA, RGBAImage } from './types';

// Below this alpha a cell's representative pixel is treated as transparent
// (when the transparent-background option is on).
const ALPHA_TRANSPARENT_CUTOFF = 128;

interface Bucket {
  count: number;
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
 * Resample `source` down to a `gridWidth × gridHeight` sprite by taking the
 * mode color of each logical cell.
 */
export function sampleCells(
  source: RGBAImage,
  gridWidth: number,
  gridHeight: number,
  transparentBackground: boolean,
): RGBAImage {
  const out = createImage(gridWidth, gridHeight);
  const cellW = source.width / gridWidth;
  const cellH = source.height / gridHeight;

  for (let gy = 0; gy < gridHeight; gy++) {
    const y0 = Math.floor(gy * cellH);
    const y1 = Math.max(y0 + 1, Math.floor((gy + 1) * cellH));
    for (let gx = 0; gx < gridWidth; gx++) {
      const x0 = Math.floor(gx * cellW);
      const x1 = Math.max(x0 + 1, Math.floor((gx + 1) * cellW));
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
): RGBAImage {
  const out = createImage(gridWidth, gridHeight);
  const cellW = source.width / gridWidth;
  const cellH = source.height / gridHeight;

  for (let gy = 0; gy < gridHeight; gy++) {
    const y0 = Math.floor(gy * cellH);
    const y1 = Math.max(y0 + 1, Math.floor((gy + 1) * cellH));
    for (let gx = 0; gx < gridWidth; gx++) {
      const x0 = Math.floor(gx * cellW);
      const x1 = Math.max(x0 + 1, Math.floor((gx + 1) * cellW));
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
      const key = bucketKey(c);
      const b = buckets.get(key);
      if (b) {
        b.count++;
        b.r += c.r;
        b.g += c.g;
        b.b += c.b;
        b.a += c.a;
      } else {
        buckets.set(key, { count: 1, r: c.r, g: c.g, b: c.b, a: c.a });
      }
    }
  }

  // Pick the most populated bucket (ties broken by the earlier-seen key so
  // the result is deterministic).
  let best: Bucket | null = null;
  for (const b of buckets.values()) {
    if (!best || b.count > best.count) best = b;
  }
  if (!best) return { r: 0, g: 0, b: 0, a: 0 };

  // Representative = average of the original pixels in the winning bucket.
  const a = Math.round(best.a / best.count);
  if (transparentBackground && a < ALPHA_TRANSPARENT_CUTOFF) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  return {
    r: Math.round(best.r / best.count),
    g: Math.round(best.g / best.count),
    b: Math.round(best.b / best.count),
    a,
  };
}
