import { describe, expect, it } from 'vitest';
import { detectGrid, findPlateauEnd, gridFromCellSize, gridFromTarget, analyzeAxis } from './gridDetection';
import { MIN_CELL_SIZE, MAX_CELL_SIZE } from './types';
import laundrySignals from './__fixtures__/laundryGolemSignals.json';
import { sampleCells, sampleCellsAverage } from './cellSampling';
import { quantize, countDistinctColors, autoPaletteSize } from './paletteQuantize';
import { removeIsolatedPixels, mergeSimilarColors, removeSolidBackground } from './cleanup';
import { reconstructPixelArt, reconstructSequence, imageToPackedPixels, extractPalette } from './reconstruct';
import { DEFAULT_OPTIONS, type PixelArtOptions, type RGBA } from './types';
import {
  BLUE,
  GREEN,
  ISOLUMINANT_PALETTE,
  RED,
  driftScene,
  get,
  gridlessNoise,
  lcg,
  logical8x8,
  makeImage,
  matchRate,
  put,
  realisticLogical,
  renderGrid,
  sceneLogical,
  softScene,
  upscale,
} from './__fixtures__/synthetic';

// Shared procedural builders (soft, jittered, drifting, isoluminant art…).
// See __fixtures__/synthetic.ts.

const RAW: PixelArtOptions = {
  ...DEFAULT_OPTIONS,
  paletteSize: 100000,
  mergeSimilarColors: false,
  removeAntiAliasing: false,
  removeIsolatedPixels: false,
};

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
    // Render a 16×16 logical sprite where each cell boundary is jittered by a
    // few pixels and edges are blended — i.e. what AI "pixel art" actually
    // looks like, not a clean multiple.
    const gw = 16, gh = 16, nominal = 12;
    const logical = realisticLogical(gw, gh, 99);
    const jitter = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 3 - 1.5;
    const bounds = (count: number) => {
      const b = [0];
      for (let i = 1; i < count; i++) b.push(Math.round(i * nominal + jitter(i)));
      b.push(count * nominal);
      return b;
    };
    const xb = bounds(gw);
    const yb = bounds(gh);
    const img = makeImage(xb[gw], yb[gh]);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const c = logical[gy][gx];
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
    // Should land on (or very near) the true 16×16 grid despite the jitter.
    expect(Math.abs(det.gridWidth - gw)).toBeLessThanOrEqual(1);
    expect(Math.abs(det.gridHeight - gh)).toBeLessThanOrEqual(1);
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

  it('detects and corrects a grid phase offset', () => {
    // A checker sprite whose grid does NOT start at (0,0) — placed at a
    // non-multiple pixel offset. Phase detection must recover the offset so
    // sampling lands on real pixel boundaries; otherwise every cell straddles
    // two logical pixels and the checker smears into many blended colors.
    const DARK: RGBA = { r: 40, g: 40, b: 40, a: 255 };
    const LIGHT: RGBA = { r: 210, g: 210, b: 210, a: 255 };
    const W = 420, H = 420, cell = 10, g = 20, off = 13; // 13 mod 10 = 3px phase
    const img = makeImage(W, H);
    for (let i = 0; i < W * H; i++) {
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
    expect(det.confidence).toBe('high');
    // A grid phase was recovered (grid does not start at the origin).
    expect(det.offsetX).toBeGreaterThan(0);
    expect(det.offsetY).toBeGreaterThan(0);

    // Reconstructed cleanly: the checker collapses back to its two ink colors
    // (plus at most a couple of boundary cells), not a smear of blends.
    const { result } = reconstructPixelArt(img, {
      ...DEFAULT_OPTIONS,
      paletteSize: 100000,
      mergeSimilarColors: false,
      removeAntiAliasing: false,
      removeIsolatedPixels: false,
    });
    expect(countDistinctColors(result)).toBeLessThanOrEqual(5);
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
    // A genuine 12px grid (realistic art) carrying a regular 6px sub-cell
    // texture. A naive detector locks onto the 6px texture; the variance-dip
    // detector recovers the true 12px cell — the texture period doesn't dip
    // (its cells still hold the real color variation), only the true grid does.
    const gw = 16, gh = 16, cell = 12;
    const logical = realisticLogical(gw, gh, 7); // distinct-neighbor art (clear boundaries)
    const img = makeImage(gw * cell, gh * cell);
    const clamp = (n: number) => Math.max(0, Math.min(255, n));
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const c = logical[gy][gx];
        for (let y = gy * cell; y < (gy + 1) * cell; y++) {
          for (let x = gx * cell; x < (gx + 1) * cell; x++) {
            const m = (((x >> 3) + (y >> 3)) % 2 ? 10 : -10); // ~8px texture (not a divisor of 12)
            const noise = ((x * 7 + y * 13) % 9) - 4;         // breaks perfect texture periodicity
            put(img, x, y, { r: clamp(c.r + m + noise), g: clamp(c.g + m + noise), b: clamp(c.b + m + noise), a: 255 });
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

  it('caps an oversized low-confidence detection — and reports that it did', () => {
    // A large, detailed image with smooth low-frequency content and fine noise
    // but *no* real grid — like the laundry image, coarsening never sharply
    // increases within-cell variance, so grid clarity stays low. Detection must
    // not confidently emit hundreds of cells; it caps to a usable sprite.
    const W = 900, H = 760;
    const img = gridlessNoise(W, H, 120, 12345);

    const det = detectGrid(img);
    // Not trusted as a clean grid…
    expect(det.confidence).not.toBe('high');
    expect(det.confidence).toBe('low');
    // …and capped to a sensible sprite resolution (SOFT_MAX_GRID = 128).
    expect(Math.max(det.gridWidth, det.gridHeight)).toBeLessThanOrEqual(128);
    // Aspect ratio is preserved through the cap.
    expect(det.gridWidth / det.gridHeight).toBeCloseTo(W / H, 1);
    // The cap is not silent: it is flagged, and the pre-cap estimate is kept
    // so the UI can say what it would have produced.
    expect(det.capped).toBe(true);
    expect(det.detectedCellSize).toBeLessThan(det.cellSize);
  });

  it('does not flag an uncapped detection', () => {
    const det = detectGrid(upscale(logical8x8(), 16));
    expect(det.capped).toBe(false);
    expect(det.detectedCellSize).toBe(det.cellSize);
  });
});

// ── Large scenes with small, soft pixels (regression) ───────────────────────
// A 1536×1024 AI "pixel art" castle scene with ~3px anti-aliased pixels came
// out 128×85: the finer grid was found but, being low-confidence, silently
// rescaled to SOFT_MAX_GRID — a 4× multiple of the real cell that erased
// 3px-wide lines. These pin down the pixel-size override and the no-silent-cap
// behavior on a procedural stand-in (900×600 → 300×200 logical).

describe('large scenes with small, soft pixels', () => {
  const GW = 300;
  const GH = 200;
  const { image, logical } = softScene(GW, GH, 3, 42);

  it('rebuilds the true grid from an explicit pixel size', () => {
    const det = gridFromCellSize(image, 3);
    expect(det.gridWidth).toBe(GW);
    expect(det.gridHeight).toBe(GH);
    expect(det.capped).toBe(false);

    const { result } = reconstructPixelArt(image, { ...RAW, autoDetectGrid: false, cellSize: 3 });
    expect(result.width).toBe(GW);
    expect(matchRate(result, logical)).toBeGreaterThan(0.85); // ~0.92; misses are jittered edges
  });

  it('phase-aligns the pixel-size grid when the art does not start at the origin', () => {
    // Shift the whole grid 2px. Evenly dividing from (0,0) would straddle
    // every pixel; the phase search puts grid lines back on the real edges.
    const shifted = softScene(GW, GH, 3, 42, 2);
    const det = gridFromCellSize(shifted.image, 3);
    // A leading 2px partial cell becomes output column 0.
    expect(Math.round(det.offsetX) % 3).toBe(2);
    expect(Math.round(det.offsetY) % 3).toBe(2);
    const { result } = reconstructPixelArt(shifted.image, { ...RAW, autoDetectGrid: false, cellSize: 3 });
    expect(matchRate(result, shifted.logical, 1, 1)).toBeGreaterThan(0.85);

    // Same image, same size, no phase: markedly worse.
    const unaligned = reconstructPixelArt(shifted.image, { ...RAW, autoDetectGrid: false, targetWidth: GW + 1, targetHeight: GH + 1 });
    expect(matchRate(unaligned.result, shifted.logical, 1, 1)).toBeLessThan(0.85); // ~0.78
  });

  it('auto-detects the soft 3px cell instead of a coarse multiple', () => {
    const det = detectGrid(image);
    expect(det.cellSize).toBeCloseTo(3, 1);
    expect(det.gridWidth).toBe(GW);
    expect(det.gridHeight).toBe(GH);
    expect(det.capped).toBe(false);
    expect(det.confidence).not.toBe('low');
  });

  it('caps an explicit pixel size at the output limit, flagged, aspect kept', () => {
    const det = gridFromCellSize(image, 1); // 900×600 would exceed 512
    expect(det.capped).toBe(true);
    expect(det.gridWidth).toBe(512);
    expect(det.gridHeight).toBe(341);
    expect(det.detectedCellSize).toBe(1);
  });
});

// ── Fitted grids: drift, phase, color, very soft cells (regression) ────────
// A single global cell size and phase can't follow AI output: its pixel size
// drifts across the image (one apparent pixel 14px, its neighbor 18px), the
// grid rarely starts at the origin, some edges separate colors of equal
// brightness, and the smallest cells are blurred almost flat. The detector
// fits each grid line to the art's own edges; these pin that down.

const RAW_AUTO: PixelArtOptions = { ...RAW, autoDetectGrid: true };
const uniformAt = (image: ReturnType<typeof makeImage>, w: number, h: number) =>
  reconstructPixelArt(image, { ...RAW, autoDetectGrid: false, targetWidth: w, targetHeight: h }).result;

describe('fitted grids', () => {
  it('follows a grid whose pixel size drifts across the image', () => {
    // 60×40 logical, cells 16px ± 12% drift plus ±1px jitter.
    const { image, logical, xb } = driftScene(60, 40, 16, 0.12, 9);
    const det = detectGrid(image);
    expect(det.gridWidth).toBe(60);
    expect(det.gridHeight).toBe(40);
    expect(det.confidence).not.toBe('low');
    // The fitted lines are the rendered cell edges, give or take a pixel.
    const off = det.xBounds!.map((v, i) => Math.abs(v - xb[i]));
    expect(Math.max(...off)).toBeLessThanOrEqual(1);

    const fitted = reconstructPixelArt(image, RAW_AUTO).result;
    expect(matchRate(fitted, logical)).toBeGreaterThan(0.95); // ~1.00
    // Even told the exact output size, an even grid drifts out of phase.
    expect(matchRate(uniformAt(image, 60, 40), logical)).toBeLessThan(0.7); // ~0.52
  });

  it('follows drift at a small cell size too', () => {
    const { image, logical } = driftScene(100, 70, 8, 0.1, 4);
    const det = detectGrid(image);
    expect([det.gridWidth, det.gridHeight]).toEqual([100, 70]);
    expect(matchRate(reconstructPixelArt(image, RAW_AUTO).result, logical)).toBeGreaterThan(0.95);
    expect(matchRate(uniformAt(image, 100, 70), logical)).toBeLessThan(0.6); // ~0.41
  });

  it('finds the phase of full-frame art on its own', () => {
    // Edge-to-edge 3px art whose grid starts 2px in: auto mode now lines up
    // with it instead of dividing evenly from the corner.
    const { image, logical } = softScene(300, 200, 3, 42, 2);
    const det = detectGrid(image);
    expect(det.xBounds![1]).toBe(2);
    expect(det.yBounds![1]).toBe(2);
    expect(matchRate(reconstructPixelArt(image, RAW_AUTO).result, logical, 1, 1)).toBeGreaterThan(0.85); // ~0.93
  });

  it('sees edges between colors of equal brightness', () => {
    // 6px cells in four colors of identical luminance: a luma-only detector
    // sees nothing but the dither noise.
    const logical = sceneLogical(80, 60, lcg(3), ISOLUMINANT_PALETTE);
    const edges = (n: number) => Array.from({ length: n + 1 }, (_, i) => i * 6);
    const image = renderGrid(logical, edges(80), edges(60));
    const det = detectGrid(image);
    expect([det.gridWidth, det.gridHeight]).toEqual([80, 60]);
    expect(det.confidence).not.toBe('low');
    expect(matchRate(reconstructPixelArt(image, RAW_AUTO).result, logical)).toBeGreaterThan(0.95);
  });

  it('detects soft 2px pixels without a manual pixel size', () => {
    const { image } = softScene(300, 200, 2, 5);
    const det = detectGrid(image);
    expect([det.gridWidth, det.gridHeight]).toEqual([300, 200]);
    expect(det.capped).toBe(false);
    expect(det.confidence).not.toBe('low');
  });

  it('detects 3px pixels even under a heavy (5×5) blur', () => {
    const { image } = softScene(300, 200, 3, 42, 0, 2);
    const det = detectGrid(image);
    expect([det.gridWidth, det.gridHeight]).toEqual([300, 200]);
    expect(det.confidence).not.toBe('low');
  });

  it('ignores garbage color in fully transparent pixels', () => {
    // A clean sprite on a transparent background whose hidden RGB is noise —
    // common in exported PNGs. It must not create edges or variance.
    const img = upscale(realisticLogical(12, 12, 5), 10);
    const W = 200;
    const out = makeImage(W, W);
    const rnd = lcg(8);
    for (let i = 0; i < W * W; i++) {
      out.data[i * 4] = rnd() * 255;
      out.data[i * 4 + 1] = rnd() * 255;
      out.data[i * 4 + 2] = rnd() * 255;
    }
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) put(out, 40 + x, 40 + y, get(img, x, y));
    const det = detectGrid(out);
    expect(det.cellSize).toBeCloseTo(10, 0);
    expect(det.confidence).toBe('high');
  });
});

// ── Knee selection on measured curves (regression) ─────────────────────────
// Residual-variance curves recorded from a real ~15px AI sprite (1300×1450),
// once on transparency and once composited onto white. On white the
// anti-aliased fringe blurs the kink over a few sizes; looking only one or two
// sizes ahead missed it, and detection fell back to a 2.8px guess (459×512).

const curve = (values: number[]) => [0, 0, ...values]; // index = cell size, from 2
const SPRITE_TRANSPARENT = curve([0.002, 0.006, 0.008, 0.010, 0.012, 0.015, 0.017, 0.018, 0.020, 0.026, 0.031, 0.028, 0.029, 0.030, 0.031, 0.033, 0.034, 0.037, 0.041, 0.041, 0.056, 0.081, 0.094, 0.097, 0.103, 0.108, 0.112, 0.114, 0.116, 0.116]);
const SPRITE_ON_WHITE = curve([0.002, 0.007, 0.011, 0.013, 0.016, 0.020, 0.023, 0.024, 0.026, 0.032, 0.040, 0.038, 0.040, 0.042, 0.044, 0.045, 0.046, 0.050, 0.053, 0.055, 0.071, 0.098, 0.114, 0.118, 0.128, 0.132, 0.137, 0.137, 0.144, 0.149]);
// A detailed render with no grid: the curve just rises smoothly.
const GRIDLESS = curve([0.171, 0.204, 0.215, 0.220, 0.222, 0.225, 0.225, 0.226, 0.227, 0.228, 0.228, 0.229, 0.230, 0.230, 0.231, 0.232, 0.232, 0.233, 0.233, 0.233, 0.234, 0.235, 0.236, 0.236, 0.237]);

describe('knee selection', () => {
  it('finds the plateau end of a real sprite, on transparency and on white', () => {
    for (const u of [SPRITE_TRANSPARENT, SPRITE_ON_WHITE]) {
      const { plateauEnd } = findPlateauEnd(u, u.length - 1);
      // Past the ~15px cell (the ±25% line fit keeps it uniform a little
      // beyond); the settle step then reads 15px from the line spacing.
      expect(plateauEnd).toBeGreaterThanOrEqual(19);
      expect(plateauEnd).toBeLessThanOrEqual(22);
    }
  });

  it('finds no plateau in a gridless render', () => {
    expect(findPlateauEnd(GRIDLESS, GRIDLESS.length - 1).plateauEnd).toBe(0);
  });
});

// ── Backgrounds and multi-frame sequences ──────────────────────────────────

describe('solid background removal', () => {
  const WHITE: RGBA = { r: 250, g: 250, b: 248, a: 255 };
  function onWhite(): ReturnType<typeof makeImage> {
    const img = makeImage(40, 40);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) put(img, x, y, WHITE);
    // A blue ring enclosing a white "eye", plus a red block touching the edge.
    for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) put(img, x, y, BLUE);
    for (let y = 16; y < 24; y++) for (let x = 16; x < 24; x++) put(img, x, y, WHITE);
    for (let y = 30; y < 40; y++) for (let x = 18; x < 22; x++) put(img, x, y, RED);
    return img;
  }

  it('clears a flat backdrop from the edges in', () => {
    const out = removeSolidBackground(onWhite());
    expect(get(out, 0, 0).a).toBe(0);
    expect(get(out, 39, 20).a).toBe(0);
    expect(get(out, 12, 12)).toEqual(BLUE);
    expect(get(out, 20, 39)).toEqual(RED); // touches the edge, different color
  });

  it('keeps enclosed regions of the backdrop color', () => {
    expect(get(removeSolidBackground(onWhite()), 20, 20)).toEqual(WHITE);
  });

  it('leaves scenes, transparent sprites and flat images alone', () => {
    const scene = softScene(40, 30, 3, 1).image;
    expect(removeSolidBackground(scene)).toBe(scene);
    const sprite = upscale([[null, RED], [BLUE, null]], 8);
    expect(removeSolidBackground(sprite)).toBe(sprite);
    const flat = makeImage(20, 20);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) put(flat, x, y, WHITE);
    expect(removeSolidBackground(flat)).toBe(flat);
  });

  it('is an opt-in pipeline option', () => {
    const img = onWhite();
    const opts = { ...RAW, autoDetectGrid: false, targetWidth: 20, targetHeight: 20 };
    expect(get(reconstructPixelArt(img, opts).result, 0, 0).a).toBe(255);
    expect(get(reconstructPixelArt(img, { ...opts, removeBackground: true }).result, 0, 0).a).toBe(0);
  });
});

describe('reconstructSequence', () => {
  // Two frames of the "same" sprite whose AI render shifted the red a little.
  const RED_2: RGBA = { r: 225, g: 42, b: 40, a: 255 };
  const frameWith = (red: RGBA) =>
    upscale(Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => ((x + y) % 3 ? red : BLUE))), 8);
  const opts: PixelArtOptions = { ...DEFAULT_OPTIONS, autoDetectGrid: false, targetWidth: 8, targetHeight: 8 };

  it('maps colors the same way in every frame', () => {
    const a = frameWith(RED);
    const b = frameWith(RED_2);
    // Separately, each frame keeps its own red — the animation would flicker.
    const apart = [reconstructPixelArt(a, opts).result, reconstructPixelArt(b, opts).result];
    expect(get(apart[0], 1, 0)).not.toEqual(get(apart[1], 1, 0));
    // Together, both frames land on one shared red.
    const [ra, rb] = reconstructSequence([{ source: a }, { source: b }], opts).map((r) => r.result);
    expect(get(ra, 1, 0)).toEqual(get(rb, 1, 0));
    expect(get(ra, 0, 0)).toEqual(get(rb, 0, 0));
  });

  it('keeps each frame on its own grid, and honors a precomputed one', () => {
    const small = upscale(logical8x8(), 8);
    const big = upscale(logical8x8(), 16);
    const [ra, rb] = reconstructSequence(
      [{ source: small }, { source: big, grid: gridFromTarget(big, 4, 4) }],
      { ...DEFAULT_OPTIONS },
    );
    expect([ra.result.width, ra.result.height]).toEqual([8, 8]);
    expect([rb.result.width, rb.result.height]).toEqual([4, 4]);
  });

  it('is exactly reconstructPixelArt for one frame', () => {
    const img = softScene(40, 30, 3, 7).image;
    expect(reconstructSequence([{ source: img }], DEFAULT_OPTIONS)[0].result.data).toEqual(
      reconstructPixelArt(img, DEFAULT_OPTIONS).result.data,
    );
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
