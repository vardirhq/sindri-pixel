import { describe, expect, it } from 'vitest';
import { detectGrid, gridFromTarget, analyzeAxis } from './gridDetection';
import { MIN_CELL_SIZE, MAX_CELL_SIZE } from './types';
import laundrySignals from './__fixtures__/laundryGolemSignals.json';
import { sampleCells, sampleCellsAverage } from './cellSampling';
import { quantize, countDistinctColors, autoPaletteSize } from './paletteQuantize';
import { removeIsolatedPixels, mergeSimilarColors } from './cleanup';
import { reconstructPixelArt, imageToPackedPixels, extractPalette } from './reconstruct';
import { DEFAULT_OPTIONS, type PixelArtOptions, type RGBA, type RGBAImage } from './types';

// ── Test image builders ─────────────────────────────────────────────────────

function makeImage(width: number, height: number): RGBAImage {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}

function put(image: RGBAImage, x: number, y: number, c: RGBA): void {
  const i = (y * image.width + x) * 4;
  image.data[i] = c.r;
  image.data[i + 1] = c.g;
  image.data[i + 2] = c.b;
  image.data[i + 3] = c.a;
}

function get(image: RGBAImage, x: number, y: number): RGBA {
  const i = (y * image.width + x) * 4;
  return { r: image.data[i], g: image.data[i + 1], b: image.data[i + 2], a: image.data[i + 3] };
}

/**
 * Render a logical grid of colors upscaled by `cellSize`, i.e. a "clean"
 * (perfectly gridded) pixel-art raster — the easy detection case.
 */
function upscale(grid: (RGBA | null)[][], cellSize: number): RGBAImage {
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

const RED: RGBA = { r: 220, g: 40, b: 40, a: 255 };
const BLUE: RGBA = { r: 40, g: 80, b: 200, a: 255 };
const GREEN: RGBA = { r: 60, g: 180, b: 70, a: 255 };

// A recognizable 8×8 checker-ish logical sprite.
function logical8x8(): (RGBA | null)[][] {
  return Array.from({ length: 8 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) => ((x + y) % 2 === 0 ? RED : BLUE)),
  );
}

// ── Grid detection ──────────────────────────────────────────────────────────

describe('grid detection', () => {
  it('detects the cell size of a cleanly-gridded image', () => {
    const img = upscale(logical8x8(), 16); // 128×128, 8×8 logical
    const det = detectGrid(img);
    expect(det.cellSize).toBeCloseTo(16, 0);
    expect(det.gridWidth).toBe(8);
    expect(det.gridHeight).toBe(8);
    expect(det.confidence).toBe('high');
  });

  it('detects a smaller cell size', () => {
    const grid = Array.from({ length: 16 }, (_, y) =>
      Array.from({ length: 16 }, (_, x) => ((x + y) % 2 === 0 ? GREEN : BLUE)),
    );
    const img = upscale(grid, 8); // 128×128, 16×16 logical
    const det = detectGrid(img);
    expect(det.gridWidth).toBe(16);
    expect(det.gridHeight).toBe(16);
  });

  it('detects the grid on a jittered, anti-aliased raster (the AI-art case)', () => {
    // Render an 8×8 logical sprite where each cell boundary is jittered by a
    // few pixels and edges are blended — i.e. what AI "pixel art" actually
    // looks like, not a clean multiple.
    const logical = logical8x8();
    const nominal = 16;
    // Deterministic pseudo-random jitter per boundary.
    const jitter = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 4 - 2;
    const bounds = (count: number) => {
      const b = [0];
      for (let i = 1; i < count; i++) b.push(Math.round(i * nominal + jitter(i)));
      b.push(count * nominal);
      return b;
    };
    const xb = bounds(8);
    const yb = bounds(8);
    const img = makeImage(8 * nominal, 8 * nominal);
    for (let gy = 0; gy < 8; gy++) {
      for (let gx = 0; gx < 8; gx++) {
        const c = logical[gy][gx]!;
        for (let y = yb[gy]; y < yb[gy + 1]; y++) {
          for (let x = xb[gx]; x < xb[gx + 1]; x++) {
            // Blend edge pixels toward a mid-gray to mimic anti-aliasing.
            const edge = x === xb[gx] || y === yb[gy];
            put(img, x, y, edge ? { r: (c.r + 128) >> 1, g: (c.g + 128) >> 1, b: (c.b + 128) >> 1, a: 255 } : c);
          }
        }
      }
    }

    const det = detectGrid(img);
    // Should land on (or very near) the true 8×8 grid despite the jitter.
    expect(det.gridWidth).toBeGreaterThanOrEqual(7);
    expect(det.gridWidth).toBeLessThanOrEqual(9);

    // And a full reconstruction at the detected grid should recover the two
    // dominant colors, not a smear of blend colors.
    const { result } = reconstructPixelArt(img, { ...DEFAULT_OPTIONS });
    expect(countDistinctColors(result)).toBeLessThanOrEqual(4);
  });

  it('honors an explicit target size', () => {
    const img = upscale(logical8x8(), 16);
    const det = gridFromTarget(img, 32, 32);
    expect(det.gridWidth).toBe(32);
    expect(det.gridHeight).toBe(32);
    expect(det.cellSize).toBeCloseTo(4, 0);
  });

  it('recovers a jittered-cell grid via median peak spacing', () => {
    // 20×16 logical checker with ~10px cells jittered ±2px — a variable-width
    // grid that defeats rigid autocorrelation but not median peak spacing.
    const DARK: RGBA = { r: 35, g: 40, b: 55, a: 255 };
    const LIGHT: RGBA = { r: 210, g: 200, b: 190, a: 255 };
    const gw = 20, gh = 16, cell = 10;
    const rng = (() => { let s = 7; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
    const xb = [0]; for (let i = 1; i < gw; i++) xb.push(Math.round(i * cell + (rng() - 0.5) * 4)); xb.push(gw * cell);
    const yb = [0]; for (let i = 1; i < gh; i++) yb.push(Math.round(i * cell + (rng() - 0.5) * 4)); yb.push(gh * cell);
    const img = makeImage(xb[gw], yb[gh]);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const c = (gx + gy) % 2 ? LIGHT : DARK;
        for (let y = yb[gy]; y < yb[gy + 1]; y++) for (let x = xb[gx]; x < xb[gx + 1]; x++) put(img, x, y, c);
      }
    }
    const det = detectGrid(img);
    expect(Math.abs(det.gridWidth - gw)).toBeLessThanOrEqual(1);
    expect(Math.abs(det.gridHeight - gh)).toBeLessThanOrEqual(1);
  });

  it('confidently detects a clean sprite on a large flat background', () => {
    // A small gridded sprite centered on white — most cells are empty. Grid
    // clarity must ignore the background (measure only the content box), or a
    // perfectly crisp sprite gets flagged low-confidence.
    const DARK: RGBA = { r: 40, g: 40, b: 40, a: 255 };
    const LIGHT: RGBA = { r: 210, g: 210, b: 210, a: 255 };
    const W = 400, H = 400, cell = 10, g = 16, off = 120;
    const img = makeImage(W, H);
    for (let i = 0; i < W * H; i++) { // fill background
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 245;
      img.data[i * 4 + 3] = 255;
    }
    for (let gy = 0; gy < g; gy++) {
      for (let gx = 0; gx < g; gx++) {
        const c = (gx + gy) % 2 ? LIGHT : DARK;
        for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) put(img, off + gx * cell + x, off + gy * cell + y, c);
      }
    }
    const det = detectGrid(img);
    expect(det.gridWidth).toBe(40); // 400 / 10
    expect(det.gridHeight).toBe(40);
    expect(det.confidence).toBe('high');
  });
});

// ── Grid detection: texture robustness (regression) ─────────────────────────
// A real AI-generated "laundry golem" pixel-art image had strong ~4px fabric/
// mesh texture that was more periodic than its coarse art grid. An earlier
// detector locked onto that 4px texture and returned a 287×342 grid at *high*
// confidence — a noisy downscale, not a low-res sprite. These lock the fix in.

describe('grid detection — texture robustness', () => {
  it('distrusts the real laundry-golem image signals (fine texture, not a grid)', () => {
    // Per-axis edge signals decoded from the actual image (see the fixture).
    const col = analyzeAxis(new Float32Array(laundrySignals.col), MIN_CELL_SIZE, MAX_CELL_SIZE);
    const row = analyzeAxis(new Float32Array(laundrySignals.row), MIN_CELL_SIZE, MAX_CELL_SIZE);

    // The dominant period really is the fine texture (~4px) on both axes…
    expect(col.period).toBeLessThanOrEqual(6);
    expect(row.period).toBeLessThanOrEqual(6);
    // …but the peaks are mediocre and sit in a broad comb, so neither axis
    // clears the "high confidence" bar (strength ≥ 0.9 AND dominance ≥ 0.45).
    expect(col.strength).toBeLessThan(0.9);
    expect(row.strength).toBeLessThan(0.9);
    const highConfidence = (e: typeof col) => e.strength >= 0.9 && e.dominance >= 0.45;
    expect(highConfidence(col)).toBe(false);
    expect(highConfidence(row)).toBe(false);
  });

  it('sees past regular sub-cell texture to the true, coarser grid', () => {
    // A genuine 12px grid (luminance-distinct checker) carrying a regular 6px
    // sub-cell texture. A naive detector locks onto the 6px texture; harmonic
    // reconciliation (strong-edge peak spacing) recovers the true 12px cell.
    const DARK: RGBA = { r: 35, g: 40, b: 55, a: 255 };
    const LIGHT: RGBA = { r: 210, g: 200, b: 190, a: 255 };
    const gw = 16, gh = 16, cell = 12;
    const img = makeImage(gw * cell, gh * cell);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const c = (gx + gy) % 2 ? LIGHT : DARK;
        for (let y = gy * cell; y < (gy + 1) * cell; y++) {
          for (let x = gx * cell; x < (gx + 1) * cell; x++) {
            const m = (((x / 6) | 0) + ((y / 6) | 0)) % 2 ? 20 : -20; // subtle 6px texture
            const clamp = (n: number) => Math.max(0, Math.min(255, n));
            put(img, x, y, { r: clamp(c.r + m), g: clamp(c.g + m), b: clamp(c.b + m), a: 255 });
          }
        }
      }
    }
    const det = detectGrid(img);
    // The true 12px cell, not the 6px texture (which would give a 32×32 grid).
    expect(det.cellSize).toBeGreaterThan(9);
    expect(det.gridWidth).toBe(16);
    expect(det.gridHeight).toBe(16);
  });

  it('caps an oversized low-confidence detection to a usable sprite size', () => {
    // A large, detailed image with smooth low-frequency content and fine noise
    // but *no* real grid — like the laundry image, coarsening never sharply
    // increases within-cell variance, so grid clarity stays low. Detection must
    // not confidently emit hundreds of cells; it caps to a usable sprite.
    const rng = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
    const W = 900, H = 760;
    const img = makeImage(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const base = 128 + 60 * Math.sin(x / 70) + 50 * Math.cos(y / 55) + 40 * Math.sin((x + y) / 90);
        const v = Math.max(0, Math.min(255, base + (rng() - 0.5) * 120));
        put(img, x, y, { r: v, g: v, b: v, a: 255 });
      }
    }

    const det = detectGrid(img);
    // Not trusted as a clean grid…
    expect(det.confidence).not.toBe('high');
    // …and capped to a sensible sprite resolution (SOFT_MAX_GRID = 128).
    expect(Math.max(det.gridWidth, det.gridHeight)).toBeLessThanOrEqual(128);
    // Aspect ratio is preserved through the cap.
    expect(det.gridWidth / det.gridHeight).toBeCloseTo(W / H, 1);
  });
});

// ── Cell sampling ───────────────────────────────────────────────────────────

describe('cell sampling', () => {
  it('recovers the logical grid via mode color', () => {
    const logical = logical8x8();
    const img = upscale(logical, 16);
    const sampled = sampleCells(img, 8, 8, true);
    expect(sampled.width).toBe(8);
    expect(sampled.height).toBe(8);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        expect(get(sampled, x, y)).toEqual(logical[y][x]);
      }
    }
  });

  it('is robust to anti-aliased edge pixels (mode beats mean)', () => {
    // A 4×4 cell that is mostly RED with a couple of blended edge pixels.
    const img = makeImage(4, 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) put(img, x, y, RED);
    put(img, 3, 0, { r: 130, g: 60, b: 120, a: 255 }); // AA blend toward blue
    put(img, 3, 3, { r: 130, g: 60, b: 120, a: 255 });
    const sampled = sampleCells(img, 1, 1, true);
    // Mode bucket is the RED cluster; representative stays essentially red.
    expect(get(sampled, 0, 0).r).toBeGreaterThan(200);
    expect(get(sampled, 0, 0).b).toBeLessThan(60);
  });

  it('preserves transparency', () => {
    const img = makeImage(4, 4); // all zero alpha
    const sampled = sampleCells(img, 1, 1, true);
    expect(get(sampled, 0, 0).a).toBe(0);
  });
});

// ── Cell sampling: average / detail-preserving mode ─────────────────────────

describe('cell sampling — average (detail preserving)', () => {
  it('blends a gradient cell where mode would collapse it', () => {
    // A 4×4 cell: left half red, right half blue.
    const img = makeImage(4, 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) put(img, x, y, x < 2 ? RED : BLUE);
    }
    const mode = get(sampleCells(img, 1, 1, true), 0, 0);
    const avg = get(sampleCellsAverage(img, 1, 1, true), 0, 0);

    // Mode picks one of the two source colors outright.
    const isPure = (c: typeof avg) =>
      (c.r === RED.r && c.g === RED.g && c.b === RED.b) ||
      (c.r === BLUE.r && c.g === BLUE.g && c.b === BLUE.b);
    expect(isPure(mode)).toBe(true);
    // Average is a genuine blend of the two — both channels move toward the mean.
    expect(isPure(avg)).toBe(false);
    expect(avg.r).toBeCloseTo((RED.r + BLUE.r) / 2, -1);
    expect(avg.b).toBeCloseTo((RED.b + BLUE.b) / 2, -1);
  });

  it('reduces to a plain mean for a fully-opaque cell', () => {
    const img = makeImage(2, 1);
    put(img, 0, 0, { r: 100, g: 40, b: 200, a: 255 });
    put(img, 1, 0, { r: 200, g: 80, b: 40, a: 255 });
    const avg = get(sampleCellsAverage(img, 1, 1, true), 0, 0);
    expect(avg).toEqual({ r: 150, g: 60, b: 120, a: 255 });
  });

  it('averages alpha in premultiplied space and preserves transparency', () => {
    // One opaque red pixel, one fully transparent pixel.
    const img = makeImage(2, 1);
    put(img, 0, 0, { r: 200, g: 20, b: 20, a: 255 });
    // pixel (1,0) left transparent
    const avg = get(sampleCellsAverage(img, 1, 1, false), 0, 0);
    // Color comes only from the opaque pixel (no black bleed); alpha halves.
    expect(avg.r).toBe(200);
    expect(avg.g).toBe(20);
    expect(avg.a).toBe(128);

    const allClear = makeImage(4, 4);
    expect(get(sampleCellsAverage(allClear, 1, 1, true), 0, 0).a).toBe(0);
  });
});

// ── Palette quantization ────────────────────────────────────────────────────

describe('palette quantization', () => {
  it('reduces color count to the target', () => {
    const img = makeImage(8, 1);
    for (let x = 0; x < 8; x++) put(img, x, 0, { r: x * 30, g: 10, b: 10, a: 255 });
    expect(countDistinctColors(img)).toBe(8);
    const { image, palette } = quantize(img, 2);
    expect(palette.length).toBeLessThanOrEqual(2);
    expect(countDistinctColors(image)).toBeLessThanOrEqual(2);
  });

  it('leaves transparent pixels transparent', () => {
    const img = makeImage(4, 1);
    put(img, 0, 0, RED);
    put(img, 1, 0, BLUE);
    // pixels 2,3 stay transparent
    const { image } = quantize(img, 1);
    expect(get(image, 2, 0).a).toBe(0);
    expect(get(image, 3, 0).a).toBe(0);
  });

  it('auto palette size leaves small palettes alone', () => {
    expect(autoPaletteSize(12)).toBe(12);
    expect(autoPaletteSize(50)).toBe(32);
    expect(autoPaletteSize(200)).toBe(128);
  });
});

// ── Cleanup ─────────────────────────────────────────────────────────────────

describe('cleanup passes', () => {
  it('removes an isolated near-duplicate pixel', () => {
    const img = makeImage(3, 3);
    const base: RGBA = { r: 100, g: 100, b: 100, a: 255 };
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) put(img, x, y, base);
    // Center is a near-duplicate speck.
    put(img, 1, 1, { r: 108, g: 100, b: 100, a: 255 });
    const cleaned = removeIsolatedPixels(img, 40);
    expect(get(cleaned, 1, 1)).toEqual(base);
  });

  it('preserves a genuine high-contrast 1px detail', () => {
    const img = makeImage(3, 3);
    const base: RGBA = { r: 100, g: 100, b: 100, a: 255 };
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) put(img, x, y, base);
    put(img, 1, 1, RED); // far from base → kept
    const cleaned = removeIsolatedPixels(img, 40);
    expect(get(cleaned, 1, 1)).toEqual(RED);
  });

  it('merges near-duplicate colors', () => {
    const img = makeImage(4, 1);
    put(img, 0, 0, { r: 100, g: 100, b: 100, a: 255 });
    put(img, 1, 0, { r: 100, g: 100, b: 100, a: 255 });
    put(img, 2, 0, { r: 101, g: 100, b: 100, a: 255 }); // ΔE ~ tiny
    put(img, 3, 0, { r: 100, g: 100, b: 100, a: 255 });
    expect(countDistinctColors(img)).toBe(2);
    const merged = mergeSimilarColors(img, 4);
    expect(countDistinctColors(merged)).toBe(1);
  });

  it('keeps clearly distinct colors separate', () => {
    const img = makeImage(2, 1);
    put(img, 0, 0, RED);
    put(img, 1, 0, BLUE);
    const merged = mergeSimilarColors(img, 4);
    expect(countDistinctColors(merged)).toBe(2);
  });
});

// ── Full pipeline + toggles ─────────────────────────────────────────────────

describe('reconstructPixelArt', () => {
  it('reconstructs a clean sprite end to end', () => {
    const logical = logical8x8();
    const img = upscale(logical, 16);
    const { result, detection } = reconstructPixelArt(img, { ...DEFAULT_OPTIONS });
    expect(detection.gridWidth).toBe(8);
    expect(result.width).toBe(8);
    expect(result.height).toBe(8);
    // Two dominant colors survive.
    expect(countDistinctColors(result)).toBeLessThanOrEqual(2);
  });

  it('respects an explicit grid override', () => {
    const img = upscale(logical8x8(), 16);
    const opts: PixelArtOptions = {
      ...DEFAULT_OPTIONS,
      autoDetectGrid: false,
      targetWidth: 4,
      targetHeight: 4,
    };
    const { result } = reconstructPixelArt(img, opts);
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
  });

  it('toggling removeIsolatedPixels changes output', () => {
    // Sprite with an isolated near-duplicate speck at native resolution.
    const grid: (RGBA | null)[][] = Array.from({ length: 6 }, () =>
      Array.from({ length: 6 }, () => ({ r: 100, g: 100, b: 100, a: 255 })),
    );
    grid[2][2] = { r: 118, g: 100, b: 100, a: 255 };
    const img = upscale(grid, 10);
    const base: PixelArtOptions = {
      ...DEFAULT_OPTIONS,
      autoDetectGrid: false,
      targetWidth: 6,
      targetHeight: 6,
      paletteSize: undefined,
      mergeSimilarColors: false,
      removeAntiAliasing: false,
    };
    const withOn = reconstructPixelArt(img, { ...base, removeIsolatedPixels: true }).result;
    const withOff = reconstructPixelArt(img, { ...base, removeIsolatedPixels: false }).result;
    expect(withOn.data).not.toEqual(withOff.data);
  });

  it('toggling mergeSimilarColors changes output', () => {
    const grid: (RGBA | null)[][] = [
      [{ r: 100, g: 100, b: 100, a: 255 }, { r: 102, g: 100, b: 100, a: 255 }],
      [{ r: 100, g: 100, b: 100, a: 255 }, { r: 101, g: 100, b: 100, a: 255 }],
    ];
    const img = upscale(grid, 8);
    const base: PixelArtOptions = {
      ...DEFAULT_OPTIONS,
      autoDetectGrid: false,
      targetWidth: 2,
      targetHeight: 2,
      paletteSize: 0,
      removeIsolatedPixels: false,
      removeAntiAliasing: false,
    };
    const on = reconstructPixelArt(img, { ...base, mergeSimilarColors: true }).result;
    const off = reconstructPixelArt(img, { ...base, mergeSimilarColors: false }).result;
    expect(countDistinctColors(on)).toBeLessThan(countDistinctColors(off));
  });

  it('average sampling mode preserves more detail than mode sampling', () => {
    // A source with smooth gradients (many colors) sampled at a coarse grid:
    // mode collapses each cell to one color, average keeps the blends.
    const img = makeImage(64, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        put(img, x, y, { r: x * 4, g: y * 4, b: (x + y) * 2, a: 255 });
      }
    }
    const base: PixelArtOptions = {
      ...DEFAULT_OPTIONS,
      autoDetectGrid: false,
      targetWidth: 16,
      targetHeight: 16,
      paletteSize: 100000, // no quantization, so sampling drives the color count
      mergeSimilarColors: false,
      removeAntiAliasing: false,
      removeIsolatedPixels: false,
    };
    const mode = reconstructPixelArt(img, { ...base, samplingMode: 'mode' }).result;
    const average = reconstructPixelArt(img, { ...base, samplingMode: 'average' }).result;
    expect(mode.data).not.toEqual(average.data);
    // Average retains at least as many distinct colors (the gradient detail).
    expect(countDistinctColors(average)).toBeGreaterThanOrEqual(countDistinctColors(mode));
  });

  it('produces packed pixels and a palette usable by the editor', () => {
    const img = upscale(logical8x8(), 16);
    const { result } = reconstructPixelArt(img, { ...DEFAULT_OPTIONS });
    const packed = imageToPackedPixels(result);
    expect(packed.length).toBe(result.width * result.height);
    // Opaque pixels have the alpha byte set.
    expect(packed.some((v) => (v >>> 24) === 0xff)).toBe(true);
    const palette = extractPalette(result);
    expect(palette.length).toBeGreaterThan(0);
    expect(palette.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
  });
});
