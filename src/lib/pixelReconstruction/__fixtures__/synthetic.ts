// Procedural test images for the reconstruction pipeline.
//
// Real AI "pixel art" can't ship as fixtures (size, licensing), so these
// builders reproduce its failure modes on demand: soft anti-aliased edges,
// jittered and drifting grid lines, sub-cell texture, colors of equal
// brightness, and grid-free noise. Each returns the logical grid it was
// rendered from, so tests can score a reconstruction pixel by pixel.

import type { RGBA, RGBAImage } from '../types';

export const RED: RGBA = { r: 220, g: 40, b: 40, a: 255 };
export const BLUE: RGBA = { r: 40, g: 80, b: 200, a: 255 };
export const GREEN: RGBA = { r: 60, g: 180, b: 70, a: 255 };

export function makeImage(width: number, height: number): RGBAImage {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}

export function put(image: RGBAImage, x: number, y: number, c: RGBA): void {
  const i = (y * image.width + x) * 4;
  image.data[i] = c.r;
  image.data[i + 1] = c.g;
  image.data[i + 2] = c.b;
  image.data[i + 3] = c.a;
}

export function get(image: RGBAImage, x: number, y: number): RGBA {
  const i = (y * image.width + x) * 4;
  return { r: image.data[i], g: image.data[i + 1], b: image.data[i + 2], a: image.data[i + 3] };
}

/** Deterministic LCG in [0, 1]. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * Render a logical grid of colors upscaled by `cellSize`, i.e. a "clean"
 * (perfectly gridded) pixel-art raster — the easy detection case.
 */
export function upscale(grid: (RGBA | null)[][], cellSize: number): RGBAImage {
  const gh = grid.length;
  const gw = grid[0].length;
  const img = makeImage(gw * cellSize, gh * cellSize);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const c = grid[gy][gx];
      if (!c) continue;
      for (let dy = 0; dy < cellSize; dy++) {
        for (let dx = 0; dx < cellSize; dx++) {
          put(img, gx * cellSize + dx, gy * cellSize + dy, c);
        }
      }
    }
  }
  return img;
}

// A recognizable 8×8 checker-ish logical sprite.
export function logical8x8(): (RGBA | null)[][] {
  return Array.from({ length: 8 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) => ((x + y) % 2 === 0 ? RED : BLUE)),
  );
}

// Spatially-coherent random logical art — like real sprites (and unlike a
// perfect checker, which is degenerate for grid detection because every integer
// divisor of the true cell tiles it just as uniformly).
export function realisticLogical(gw: number, gh: number, seed: number, coherence = 0): RGBA[][] {
  const pal: RGBA[] = [RED, BLUE, GREEN, { r: 230, g: 215, b: 60, a: 255 }, { r: 30, g: 30, b: 45, a: 255 }];
  const rnd = lcg(seed);
  const grid: RGBA[][] = [];
  for (let y = 0; y < gh; y++) {
    const row: RGBA[] = [];
    for (let x = 0; x < gw; x++) {
      const left = row[x - 1];
      // `coherence` copies the left neighbor sometimes (flat regions, like real
      // art); otherwise pick a color distinct from the left so a boundary exists.
      if (x > 0 && rnd() < coherence) { row.push(left); continue; }
      let c = pal[Math.floor(rnd() * pal.length)];
      if (x > 0) while (c === left) c = pal[Math.floor(rnd() * pal.length)];
      row.push(c);
    }
    grid.push(row);
  }
  return grid;
}

/** Game-scene-like logical art: blobs (neighbors often repeat) plus detail. */
export function sceneLogical(gw: number, gh: number, rnd: () => number, pal: RGBA[] = SCENE_PALETTE): RGBA[][] {
  const logical: RGBA[][] = [];
  for (let y = 0; y < gh; y++) {
    const row: RGBA[] = [];
    for (let x = 0; x < gw; x++) {
      const r = rnd();
      if (x > 0 && r < 0.35) row.push(row[x - 1]);
      else if (y > 0 && r < 0.6) row.push(logical[y - 1][x]);
      else row.push(pal[Math.floor(rnd() * pal.length)]);
    }
    logical.push(row);
  }
  return logical;
}

export const SCENE_PALETTE: RGBA[] = [
  { r: 70, g: 140, b: 60, a: 255 }, { r: 90, g: 165, b: 75, a: 255 }, { r: 150, g: 110, b: 70, a: 255 },
  RED, { r: 230, g: 200, b: 80, a: 255 }, BLUE, { r: 240, g: 240, b: 230, a: 255 }, { r: 40, g: 40, b: 50, a: 255 },
];

/**
 * Render `logical` with explicit cell boundaries, then soften: `blur` is the
 * radius of a tent filter (0 = hard edges, 1 = 3×3 anti-aliasing, 2 = 5×5),
 * and `noise` adds a small fixed-pattern dither.
 */
export function renderGrid(logical: RGBA[][], xb: number[], yb: number[], blur = 1, noise = true): RGBAImage {
  const gh = logical.length;
  const gw = logical[0].length;
  const W = xb[gw];
  const H = yb[gh];
  const hard = new Uint8ClampedArray(W * H * 3);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const c = logical[gy][gx];
      for (let y = yb[gy]; y < yb[gy + 1]; y++) {
        for (let x = xb[gx]; x < xb[gx + 1]; x++) {
          const o = (y * W + x) * 3;
          hard[o] = c.r; hard[o + 1] = c.g; hard[o + 2] = c.b;
        }
      }
    }
  }
  const image = makeImage(W, H);
  const at = (x: number, y: number, k: number) =>
    hard[(Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 3 + k];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let k = 0; k < 3; k++) {
        let v = 0;
        let wsum = 0;
        for (let dy = -blur; dy <= blur; dy++) {
          for (let dx = -blur; dx <= blur; dx++) {
            const w = (blur + 1 - Math.abs(dx)) * (blur + 1 - Math.abs(dy));
            v += at(x + dx, y + dy, k) * w;
            wsum += w;
          }
        }
        image.data[(y * W + x) * 4 + k] = v / wsum + (noise ? ((x * 7 + y * 13) % 5) - 2 : 0);
      }
      image.data[(y * W + x) * 4 + 3] = 255;
    }
  }
  return image;
}

/**
 * A large AI-style "pixel art" scene with small, soft logical pixels: `cell`
 * source px per pixel, grid lines jittered by up to ±1px, every edge blurred
 * (a 3×3 tent filter, i.e. anti-aliased), a little fixed-pattern noise, and
 * the whole grid shifted right/down by `shift` px. Logical art is blobby
 * (neighbors often repeat) with fine detail, like a game scene.
 */
export function softScene(gw: number, gh: number, cell: number, seed: number, shift = 0, blur = 1): { image: RGBAImage; logical: RGBA[][] } {
  const rnd = lcg(seed);
  const logical = sceneLogical(gw, gh, rnd);
  const bounds = (n: number) => {
    const b = [0];
    for (let i = 1; i < n; i++) b.push(shift + Math.round(i * cell + (rnd() - 0.5) * 1.2));
    b.push(n * cell + shift);
    return b;
  };
  const xb = bounds(gw);
  const yb = bounds(gh);
  return { image: renderGrid(logical, xb, yb, blur), logical };
}

/**
 * A scene whose pixel size drifts across the image, like AI output where one
 * apparent pixel is 14px and its neighbor 18px: cell widths follow a slow
 * sine of ±`drift` (fraction of `cell`) plus ±1px jitter. A single global
 * grid goes out of phase partway across; only a fitted grid stays on it.
 */
export function driftScene(gw: number, gh: number, cell: number, drift: number, seed: number, blur = 1): { image: RGBAImage; logical: RGBA[][]; xb: number[]; yb: number[] } {
  const rnd = lcg(seed);
  const logical = sceneLogical(gw, gh, rnd);
  const bounds = (n: number, phase: number) => {
    const b = [0];
    let pos = 0;
    for (let i = 0; i < n; i++) {
      pos += cell * (1 + drift * Math.sin(phase + (i / n) * Math.PI * 2.5)) + (rnd() - 0.5) * 2;
      b.push(Math.round(pos));
    }
    for (let i = 1; i < b.length; i++) if (b[i] <= b[i - 1]) b[i] = b[i - 1] + 1;
    return b;
  };
  const xb = bounds(gw, 0.3);
  const yb = bounds(gh, 1.7);
  return { image: renderGrid(logical, xb, yb, blur), logical, xb, yb };
}

/**
 * Clearly different colors of equal Rec. 601 luminance (128 ± 0.5): red,
 * green, blue and ochre that a luma-only edge signal cannot tell apart.
 */
export const ISOLUMINANT_PALETTE: RGBA[] = [
  { r: 210, g: 94, b: 90, a: 255 },
  { r: 60, g: 166, b: 110, a: 255 },
  { r: 120, g: 110, b: 240, a: 255 },
  { r: 180, g: 122, b: 22, a: 255 },
];

/** Fraction of logical pixels reproduced within `tol` (max channel delta). */
export function matchRate(result: RGBAImage, logical: RGBA[][], dx = 0, dy = 0, tol = 40): number {
  let hit = 0;
  let total = 0;
  for (let y = 0; y < logical.length; y++) {
    for (let x = 0; x < logical[0].length; x++) {
      if (x + dx >= result.width || y + dy >= result.height) continue;
      const a = get(result, x + dx, y + dy);
      const b = logical[y][x];
      total++;
      if (Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b)) <= tol) hit++;
    }
  }
  return hit / total;
}

/** Smooth low-frequency content plus fine noise — no pixel grid at all. */
export function gridlessNoise(W: number, H: number, amp: number, seed: number): RGBAImage {
  const rng = lcg(seed);
  const img = makeImage(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const base = 128 + 60 * Math.sin(x / 70) + 50 * Math.cos(y / 55) + 40 * Math.sin((x + y) / 90);
      const v = Math.max(0, Math.min(255, base + (rng() - 0.5) * amp));
      put(img, x, y, { r: v, g: v, b: v, a: 255 });
    }
  }
  return img;
}
