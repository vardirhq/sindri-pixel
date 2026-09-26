// Sindri Pixel — deterministic, rule-based cleanup passes (no ML).
//
//  • Isolated-pixel removal: a pixel matching none of its 4-connected
//    neighbors and only slightly different from the dominant surrounding
//    color is replaced by that surrounding color. Genuine 1px details survive
//    because the replacement only fires when the pixel is a near-duplicate of
//    its surroundings (a small color delta), i.e. AA/quantization noise.
//  • Near-duplicate color merging: palette entries within a small perceptual
//    distance (ΔE, Lab space) collapse into their more frequent sibling.

import {
  cloneImage,
  deltaE,
  pixelAt,
  rgbDistanceSq,
  rgbToLab,
  setPixel,
  toHex,
  type Lab,
} from './color';
import type { RGBA, RGBAImage } from './types';

const OPAQUE_CUTOFF = 8;

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

function sameColor(a: RGBA, b: RGBA): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

/**
 * Replace isolated near-duplicate pixels with their dominant neighbor color.
 * `threshold` is a squared-RGB distance: a larger value (used when aggressive
 * anti-aliasing removal is on) sweeps up more speckle.
 */
export function removeIsolatedPixels(image: RGBAImage, threshold: number): RGBAImage {
  const out = cloneImage(image);
  const thresholdSq = threshold * threshold;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const c = pixelAt(image, x, y);

      // Gather opaque neighbors (read from the original to avoid cascading).
      const neighbors: RGBA[] = [];
      for (const [dx, dy] of NEIGHBORS) {
        const n = pixelAt(image, x + dx, y + dy);
        if (n.a >= OPAQUE_CUTOFF || c.a < OPAQUE_CUTOFF) neighbors.push(n);
      }
      if (neighbors.length === 0) continue;

      // Does any neighbor share this exact color? If so, not isolated.
      if (neighbors.some((n) => sameColor(n, c))) continue;

      // Dominant (most common) neighbor color.
      const dominant = mostCommon(neighbors);
      // Only replace when the pixel is a near-duplicate of its surroundings —
      // this preserves intentional high-contrast 1px details.
      if (rgbDistanceSq(c, dominant) <= thresholdSq) {
        setPixel(out, x, y, dominant);
      }
    }
  }
  return out;
}

function mostCommon(colors: RGBA[]): RGBA {
  let best = colors[0];
  let bestCount = 0;
  for (const candidate of colors) {
    let count = 0;
    for (const other of colors) if (sameColor(candidate, other)) count++;
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

/**
 * Merge palette colors within `maxDeltaE` (Lab CIE76) into one. AI output
 * sometimes survives quantization with two numerically distinct but visually
 * identical colors; this collapses them onto the more frequent one.
 */
export function mergeSimilarColors(image: RGBAImage, maxDeltaE: number): RGBAImage {
  // Frequency table of opaque colors.
  const counts = new Map<string, { color: RGBA; count: number; lab: Lab }>();
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const c = pixelAt(image, x, y);
      if (c.a < OPAQUE_CUTOFF) continue;
      const key = toHex(c);
      const entry = counts.get(key);
      if (entry) entry.count++;
      else counts.set(key, { color: c, count: 1, lab: rgbToLab(c) });
    }
  }

  const entries = [...counts.values()];
  if (entries.length < 2) return cloneImage(image);

  // More frequent colors are preferred as merge targets.
  entries.sort((a, b) => b.count - a.count);

  // Greedy: each color maps to the first (most frequent) already-kept color
  // within ΔE, otherwise it is kept as its own target.
  const remap = new Map<string, RGBA>();
  const kept: typeof entries = [];
  for (const entry of entries) {
    let target: RGBA | null = null;
    for (const k of kept) {
      if (deltaE(entry.lab, k.lab) < maxDeltaE) {
        target = k.color;
        break;
      }
    }
    if (target) {
      remap.set(toHex(entry.color), target);
    } else {
      kept.push(entry);
      remap.set(toHex(entry.color), entry.color);
    }
  }

  const out = cloneImage(image);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const c = pixelAt(image, x, y);
      if (c.a < OPAQUE_CUTOFF) continue;
      const target = remap.get(toHex(c));
      if (target && !sameColor(target, c)) {
        setPixel(out, x, y, { r: target.r, g: target.g, b: target.b, a: c.a });
      }
    }
  }
  return out;
}

/**
 * Make a solid backdrop transparent. AI sprites often come on a flat white or
 * grey background; if most of the image border is one opaque color, flood
 * fill from the border through pixels near that color and clear them. The fill
 * only spreads from the edge, so an enclosed region of the same color (the
 * white of an eye) survives. Images without such a border — full scenes,
 * sprites already on transparency — are returned unchanged, as is anything
 * the fill would almost entirely erase.
 */
export function removeSolidBackground(image: RGBAImage, tolerance = 28, minBorderShare = 0.6): RGBAImage {
  const { width, height, data } = image;
  if (width < 3 || height < 3) return image;

  // Dominant border color, bucketed to 5 bits per channel.
  const border: number[] = [];
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) border.push(y * width, y * width + width - 1);
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (const i of border) {
    const o = i * 4;
    if (data[o + 3] < 250) continue;
    const key = ((data[o] >> 3) << 10) | ((data[o + 1] >> 3) << 5) | (data[o + 2] >> 3);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++;
    bucket.r += data[o];
    bucket.g += data[o + 1];
    bucket.b += data[o + 2];
    buckets.set(key, bucket);
  }
  let top: { n: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) if (!top || bucket.n > top.n) top = bucket;
  if (!top || top.n < border.length * minBorderShare) return image;
  const bg = { r: top.r / top.n, g: top.g / top.n, b: top.b / top.n };

  const tolSq = tolerance * tolerance;
  const isBg = (i: number) => {
    const o = i * 4;
    if (data[o + 3] < 250) return false;
    const dr = data[o] - bg.r;
    const dg = data[o + 1] - bg.g;
    const db = data[o + 2] - bg.b;
    return dr * dr + dg * dg + db * db <= tolSq;
  };
  const cleared = new Uint8Array(width * height);
  const stack: number[] = [];
  for (const i of border) {
    if (!cleared[i] && isBg(i)) {
      cleared[i] = 1;
      stack.push(i);
    }
  }
  let count = stack.length;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const next = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width];
    for (const j of next) {
      if (j < 0 || j >= width * height || cleared[j] || !isBg(j)) continue;
      cleared[j] = 1;
      count++;
      stack.push(j);
    }
  }
  // Leave images the fill would almost wipe out alone: that's a flat image or
  // a subject the same color as its surroundings, not a backdrop.
  if (count > width * height * 0.98) return image;

  const out = cloneImage(image);
  for (let i = 0; i < width * height; i++) {
    if (cleared[i]) out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = out.data[i * 4 + 3] = 0;
  }
  return out;
}
