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
