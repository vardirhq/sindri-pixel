// Sindri Pixel — color helpers shared across the reconstruction pipeline.

import type { RGBA, RGBAImage } from './types';

/** Rec. 601 luma. Alpha is folded in so transparent pixels read as black,
 *  which makes sprite/background boundaries show up in the edge signal. */
export function luminance(r: number, g: number, b: number, a: number): number {
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  return (l * a) / 255;
}

/** Read the pixel at (x, y) as an RGBA object. Out-of-bounds → transparent. */
export function pixelAt(image: RGBAImage, x: number, y: number): RGBA {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const i = (y * image.width + x) * 4;
  const d = image.data;
  return { r: d[i], g: d[i + 1], b: d[i + 2], a: d[i + 3] };
}

export function setPixel(image: RGBAImage, x: number, y: number, c: RGBA): void {
  const i = (y * image.width + x) * 4;
  image.data[i] = c.r;
  image.data[i + 1] = c.g;
  image.data[i + 2] = c.b;
  image.data[i + 3] = c.a;
}

export function createImage(width: number, height: number): RGBAImage {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}

export function cloneImage(image: RGBAImage): RGBAImage {
  return {
    data: new Uint8ClampedArray(image.data),
    width: image.width,
    height: image.height,
  };
}

/** Squared Euclidean distance in RGB. Cheap ordering metric. */
export function rgbDistanceSq(a: RGBA, b: RGBA): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

export function toHex(c: RGBA): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

// ── CIELAB conversion + ΔE (CIE76) ──────────────────────────────────────────
// Perceptual distance for near-duplicate color merging. CIE76 is adequate for
// the "are these two swatches basically identical?" test the cleanup pass needs.

export interface Lab {
  L: number;
  a: number;
  b: number;
}

function pivotRgb(channel: number): number {
  const c = channel / 255;
  return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
}

function pivotXyz(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

export function rgbToLab(c: RGBA): Lab {
  const r = pivotRgb(c.r);
  const g = pivotRgb(c.g);
  const b = pivotRgb(c.b);

  // sRGB → XYZ (D65), then normalize by the reference white.
  const x = pivotXyz((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = pivotXyz(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = pivotXyz((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);

  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}

export function deltaE(a: Lab, b: Lab): number {
  const dL = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}
