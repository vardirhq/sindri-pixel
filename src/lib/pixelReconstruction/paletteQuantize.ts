// Sindri Pixel — median-cut color quantization.
//
// Reduces the reconstructed sprite to a target palette size. Median-cut is
// simple and adequate for v1 (the spec explicitly allows it over k-means).
// Fully-transparent pixels are left untouched — only opaque colors quantize.

import { cloneImage, pixelAt, rgbDistanceSq, setPixel } from './color';
import type { RGBA, RGBAImage } from './types';

const OPAQUE_CUTOFF = 8; // alpha below this counts as transparent

interface OpaquePixel {
  x: number;
  y: number;
  c: RGBA;
}

/** Distinct opaque colors in the image (packed RGB keys). */
export function countDistinctColors(image: RGBAImage): number {
  const seen = new Set<number>();
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3] < OPAQUE_CUTOFF) continue;
    seen.add((image.data[i] << 16) | (image.data[i + 1] << 8) | image.data[i + 2]);
  }
  return seen.size;
}

/**
 * Auto palette size: leave small palettes alone, otherwise snap up to the
 * nearest power-of-two bucket. A simple perceptual-fidelity heuristic — the
 * spec says exactness isn't required here.
 */
export function autoPaletteSize(distinct: number): number {
  if (distinct <= 32) return distinct;
  if (distinct <= 64) return 32;
  if (distinct <= 128) return 64;
  return 128;
}

function collectOpaque(image: RGBAImage): OpaquePixel[] {
  const pixels: OpaquePixel[] = [];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const c = pixelAt(image, x, y);
      if (c.a >= OPAQUE_CUTOFF) pixels.push({ x, y, c });
    }
  }
  return pixels;
}

function averageColor(pixels: OpaquePixel[]): RGBA {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (const p of pixels) {
    r += p.c.r;
    g += p.c.g;
    b += p.c.b;
    a += p.c.a;
  }
  const n = pixels.length;
  return {
    r: Math.round(r / n),
    g: Math.round(g / n),
    b: Math.round(b / n),
    a: Math.round(a / n),
  };
}

/** Widest color channel of a bucket → the axis we split along. */
function widestChannel(pixels: OpaquePixel[]): 'r' | 'g' | 'b' {
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  for (const p of pixels) {
    rMin = Math.min(rMin, p.c.r); rMax = Math.max(rMax, p.c.r);
    gMin = Math.min(gMin, p.c.g); gMax = Math.max(gMax, p.c.g);
    bMin = Math.min(bMin, p.c.b); bMax = Math.max(bMax, p.c.b);
  }
  const rr = rMax - rMin, gr = gMax - gMin, br = bMax - bMin;
  if (rr >= gr && rr >= br) return 'r';
  if (gr >= br) return 'g';
  return 'b';
}

/**
 * Quantize `image` to at most `paletteSize` colors via median cut. Returns the
 * remapped image plus the resulting palette. If the image already has no more
 * than `paletteSize` distinct colors it is returned unchanged.
 */
export function quantize(
  image: RGBAImage,
  paletteSize: number,
): { image: RGBAImage; palette: RGBA[] } {
  const pixels = collectOpaque(image);
  if (paletteSize < 1 || pixels.length === 0) {
    return { image: cloneImage(image), palette: [] };
  }

  // Median cut: repeatedly split the bucket with the widest channel range.
  let buckets: OpaquePixel[][] = [pixels];
  while (buckets.length < paletteSize) {
    // Choose the bucket with the largest single-channel spread.
    let target = -1;
    let targetSpread = 0;
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].length < 2) continue;
      const ch = widestChannel(buckets[i]);
      let lo = 255, hi = 0;
      for (const p of buckets[i]) {
        lo = Math.min(lo, p.c[ch]);
        hi = Math.max(hi, p.c[ch]);
      }
      if (hi - lo > targetSpread) {
        targetSpread = hi - lo;
        target = i;
      }
    }
    if (target < 0 || targetSpread === 0) break; // nothing left worth splitting

    const bucket = buckets[target];
    const ch = widestChannel(bucket);
    bucket.sort((a, b) => a.c[ch] - b.c[ch]);
    const mid = bucket.length >> 1;
    const left = bucket.slice(0, mid);
    const right = bucket.slice(mid);
    buckets = buckets.slice(0, target).concat([left, right], buckets.slice(target + 1));
  }

  const palette = buckets.filter((b) => b.length > 0).map(averageColor);

  // Remap every opaque pixel to its nearest palette color.
  const out = cloneImage(image);
  for (const p of pixels) {
    let best = palette[0];
    let bestDist = Infinity;
    for (const entry of palette) {
      const d = rgbDistanceSq(p.c, entry);
      if (d < bestDist) {
        bestDist = d;
        best = entry;
      }
    }
    setPixel(out, p.x, p.y, { r: best.r, g: best.g, b: best.b, a: p.c.a });
  }

  return { image: out, palette };
}
