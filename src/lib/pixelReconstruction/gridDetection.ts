// Sindri Pixel — grid detection for AI pixel-art reconstruction.
//
// AI "pixel art" only *looks* pixelated: it's a smooth render with an implied
// grid drawn inconsistently (one apparent pixel 14px wide, its neighbor 18px,
// the whole grid drifting across the image), anti-aliased edges, and fine
// sub-cell texture. Recovering that grid is the hard part.
//
// The detector mirrors what a human does when they "count the pixels": lay
// grid lines along the edges in the art and check that every cell comes out
// internally uniform.
//
//  1. Fit lines. For a candidate cell size, dynamic programming places each
//     axis's grid lines on the strongest edges (color-aware, so red-against-
//     green of equal brightness still counts), letting spacing vary ±25%
//     around the candidate so the lines follow jitter and drift instead of a
//     rigid lattice. Flat stretches stay regular via a small spacing penalty.
//  2. Measure uniformity. The residual within-cell color variance of that
//     fitted grid, as a fraction of the image's total variance.
//  3. Find the knee. Sweeping the candidate upward, residual variance stays
//     on a low plateau while cells still hold one logical pixel (or less),
//     then jumps once they must straddle two. The largest candidate before a
//     sharp jump bounds the true cell from above. The jump's size is the
//     confidence: a real grid kinks hard; a detailed render with no grid
//     just rises smoothly (reported low).
//  4. Settle. The true cell is the spacing between edge-backed lines at that
//     plateau end; refitting at that spacing until it stops moving gives the
//     final lines — one per real pixel edge, including partial cells at the
//     image border and the grid's phase, with no assumption that it starts at
//     the origin or stays uniform.
//
// Integral images keep the variance sweep fast.

import {
  MAX_CELL_SIZE,
  MAX_OUTPUT_SIZE,
  MIN_CELL_SIZE,
  type GridDetectionResult,
  type RGBAImage,
} from './types';

// When detection is low-confidence, distrust very fine grids: a sprite this
// large from a weak signal is usually texture, so cap the longer side. The
// result is flagged `capped` so the UI can say so and offer an explicit pixel
// size — it must never pass as the detected answer.
const SOFT_MAX_GRID = 128;
// Line fitting: spacing may vary ±25% around the cell (follows jitter and
// drift), and each unit of that deviation costs this much edge score.
const LINE_TOLERANCE = 0.25;
const SPACING_PENALTY = 0.5;
// Knee detection on the residual-variance curve (fraction of total variance).
// A candidate is on the plateau while its residual is at most PLATEAU_MAX; the
// knee is the jump to the next few sizes, (max u[c+1..c+3] + ε) / (u[c] + ε):
// real images rise over a few sizes rather than in one step (an anti-aliased
// fringe against a white backdrop blurs the kink), so look a little ahead.
const PLATEAU_MAX = 0.2;
const KNEE_EPS = 0.005;
const KNEE_WINDOW = 3;
const KNEE_MEDIUM = 1.8;
const KNEE_HIGH = 4;
// Refits of the settled cell size; it converges in one or two.
const REFIT_ROUNDS = 4;

type Confidence = GridDetectionResult['confidence'];

/**
 * Normalized autocorrelation of an edge signal. Retained as a signal-level
 * utility (and covered by the laundry-fixture regression test): a strong,
 * dominant peak indicates a genuine repeating grid, a broad comb indicates
 * texture. Not the primary detector.
 */
export function analyzeAxis(
  signal: Float32Array,
  pMin: number,
  pMax: number,
): { period: number; strength: number; dominance: number } {
  const n = signal.length;
  const maxP = Math.min(pMax, Math.floor(n / 2));
  if (maxP < pMin) return { period: pMin, strength: 0, dominance: 0 };
  let mean = 0;
  for (let i = 0; i < n; i++) mean += signal[i];
  mean /= n;
  const dev = new Float32Array(n);
  let variance = 0;
  for (let i = 0; i < n; i++) {
    dev[i] = signal[i] - mean;
    variance += dev[i] * dev[i];
  }
  if (variance <= 0) return { period: pMin, strength: 0, dominance: 0 };
  const corr: number[] = [];
  let peak = -Infinity;
  let peakP = pMin;
  let corrSum = 0;
  let corrCount = 0;
  for (let p = pMin; p <= maxP; p++) {
    let num = 0;
    let e0 = 0;
    let ep = 0;
    for (let i = 0; i + p < n; i++) {
      num += dev[i] * dev[i + p];
      e0 += dev[i] * dev[i];
      ep += dev[i + p] * dev[i + p];
    }
    const c = e0 > 0 && ep > 0 ? num / Math.sqrt(e0 * ep) : 0;
    corr[p] = c;
    corrSum += c;
    corrCount++;
    if (c > peak) {
      peak = c;
      peakP = p;
    }
  }
  let fundamental = peakP;
  for (let p = pMin; p <= peakP; p++) {
    if (corr[p] >= 0.9 * peak) {
      fundamental = p;
      break;
    }
  }
  const meanCorr = corrCount > 0 ? corrSum / corrCount : 0;
  return { period: fundamental, strength: Math.max(0, Math.min(1, peak)), dominance: Math.max(0, peak - meanCorr) };
}

/**
 * Color-aware edge signals: for each column x, the summed change between
 * columns x-1 and x over all rows (spikes at vertical cell boundaries), and
 * likewise per row. RGB is premultiplied by alpha, so garbage color in fully
 * transparent pixels makes no edges while a sprite's silhouette does.
 */
export function edgeSignals(image: RGBAImage): { cols: Float32Array; rows: Float32Array } {
  const { data, width, height } = image;
  const cols = new Float32Array(width);
  const rows = new Float32Array(height);
  const stride = width * 4;
  const diff = (o: number, p: number): number => {
    const a = data[o + 3];
    const b = data[p + 3];
    return (
      Math.abs(data[o] * a - data[p] * b) / 255 +
      Math.abs(data[o + 1] * a - data[p + 1] * b) / 255 +
      Math.abs(data[o + 2] * a - data[p + 2] * b) / 255 +
      Math.abs(a - b)
    );
  };
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const o = row + x * 4;
      if (x > 0) cols[x] += diff(o, o - 4);
      if (y > 0) rowSum += diff(o, o - stride);
    }
    rows[y] = rowSum;
  }
  return { cols, rows };
}

/**
 * Fit grid lines along one axis of `length` px to an edge signal, by dynamic
 * programming: lines land on edges where there are edges, consecutive lines
 * are spaced within ±LINE_TOLERANCE of `cell`, and each deviation from `cell`
 * costs a little so flat stretches stay regular. A partial cell at either end
 * narrower than half a cell is merged into its neighbor. Returns the full
 * boundary list `[0, …lines, length]`.
 */
export function fitLines(signal: Float32Array, length: number, cell: number): number[] {
  const dmin = Math.max(1, Math.floor(cell * (1 - LINE_TOLERANCE)));
  const dmax = Math.max(dmin + 1, Math.ceil(cell * (1 + LINE_TOLERANCE)));
  if (length <= dmax) return [0, length];
  let mean = 0;
  for (let i = 1; i < length; i++) mean += signal[i];
  mean = mean / (length - 1) || 1;
  const spread = cell * LINE_TOLERANCE;

  // score[i]: best total for a line at i; prev[i]: the line before it.
  const score = new Float64Array(length).fill(-Infinity);
  const prev = new Int32Array(length).fill(0);
  for (let i = 1; i <= Math.min(dmax, length - 1); i++) score[i] = signal[i] / mean;
  for (let i = 1; i < length; i++) {
    if (score[i] === -Infinity) continue;
    for (let d = dmin; d <= dmax && i + d < length; d++) {
      const v = score[i] + signal[i + d] / mean - SPACING_PENALTY * ((d - cell) / spread) ** 2;
      if (v > score[i + d]) {
        score[i + d] = v;
        prev[i + d] = i;
      }
    }
  }
  let end = 0;
  let best = -Infinity;
  for (let i = Math.max(1, length - dmax); i < length; i++) {
    if (score[i] > best) {
      best = score[i];
      end = i;
    }
  }
  const lines: number[] = [];
  for (let i = end; i > 0; i = prev[i]) lines.push(i);
  lines.reverse();
  if (lines.length && lines[0] < cell / 2) lines.shift();
  if (lines.length && length - lines[lines.length - 1] < cell / 2) lines.pop();
  return [0, ...lines, length];
}

/**
 * Integral images of premultiplied R, G, B and of their squared norm, for
 * O(1) within-box color variance (the sum of the per-channel variances).
 */
interface ColorIntegrals {
  r: Float64Array;
  g: Float64Array;
  b: Float64Array;
  q: Float64Array;
  w1: number;
}

function buildColorIntegrals(image: RGBAImage): ColorIntegrals {
  const { data, width, height } = image;
  const w1 = width + 1;
  const size = w1 * (height + 1);
  const r = new Float64Array(size);
  const g = new Float64Array(size);
  const b = new Float64Array(size);
  const q = new Float64Array(size);
  for (let y = 0; y < height; y++) {
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let sq = 0;
    for (let x = 0, o = y * width * 4; x < width; x++, o += 4) {
      const a = data[o + 3] / 255;
      const R = data[o] * a;
      const G = data[o + 1] * a;
      const B = data[o + 2] * a;
      sr += R;
      sg += G;
      sb += B;
      sq += R * R + G * G + B * B;
      const i = (y + 1) * w1 + x + 1;
      const up = i - w1;
      r[i] = r[up] + sr;
      g[i] = g[up] + sg;
      b[i] = b[up] + sb;
      q[i] = q[up] + sq;
    }
  }
  return { r, g, b, q, w1 };
}

function boxVar(I: ColorIntegrals, ax: number, ay: number, bx: number, by: number): number {
  const n = (bx - ax) * (by - ay);
  if (n <= 0) return 0;
  const { w1 } = I;
  const sum = (A: Float64Array) => A[by * w1 + bx] - A[ay * w1 + bx] - A[by * w1 + ax] + A[ay * w1 + ax];
  const mr = sum(I.r) / n;
  const mg = sum(I.g) / n;
  const mb = sum(I.b) / n;
  return Math.max(0, sum(I.q) / n - (mr * mr + mg * mg + mb * mb));
}

/** Mean within-cell color variance of the grid given by boundary lists. */
function gridVariance(I: ColorIntegrals, xb: number[], yb: number[]): number {
  let total = 0;
  for (let j = 0; j < yb.length - 1; j++) {
    for (let i = 0; i < xb.length - 1; i++) total += boxVar(I, xb[i], yb[j], xb[i + 1], yb[j + 1]);
  }
  return total / ((xb.length - 1) * (yb.length - 1));
}

/**
 * Typical spacing between consecutive *edge-backed* lines (both above the
 * axis's mean edge strength) — the cell size the art actually shows, ignoring
 * lines laid through a flat background. Interquartile mean, so it is
 * fractional and robust to the odd merged or split cell. NaN if too few.
 */
function edgeSpacing(signal: Float32Array, bounds: number[]): number {
  let mean = 0;
  for (let i = 1; i < signal.length; i++) mean += signal[i];
  mean /= Math.max(1, signal.length - 1);
  const gaps: number[] = [];
  for (let i = 2; i < bounds.length - 1; i++) {
    if (signal[bounds[i]] > mean && signal[bounds[i - 1]] > mean) gaps.push(bounds[i] - bounds[i - 1]);
  }
  if (gaps.length < 3) return NaN;
  gaps.sort((a, b) => a - b);
  const mid = gaps.slice(Math.floor(gaps.length / 4), Math.ceil((gaps.length * 3) / 4));
  return mid.reduce((s, g) => s + g, 0) / mid.length;
}

function clampInt(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(value)));
}

/** Equal-division grid whose longer side is `limit`, preserving aspect ratio. */
function cappedGrid(
  image: RGBAImage,
  gridWidth: number,
  gridHeight: number,
  limit: number,
): Pick<GridDetectionResult, 'gridWidth' | 'gridHeight' | 'cellWidth' | 'cellHeight'> {
  const scale = limit / Math.max(gridWidth, gridHeight);
  const w = clampInt(gridWidth * scale, 1, MAX_OUTPUT_SIZE);
  const h = clampInt(gridHeight * scale, 1, MAX_OUTPUT_SIZE);
  return { gridWidth: w, gridHeight: h, cellWidth: image.width / w, cellHeight: image.height / h };
}

/** Offset of the first grid line within its cell (informational). */
function phaseOf(bounds: number[], cell: number): number {
  if (bounds.length < 3) return 0;
  const ph = bounds[1] % cell;
  return ph < 0.5 || cell - ph < 0.5 ? 0 : ph;
}

/**
 * Package fitted boundaries as a detection result, applying the size caps: a
 * low-confidence grid larger than SOFT_MAX_GRID, or any grid over the output
 * limit, falls back to an equal-division grid at a usable size, flagged.
 */
function resultFromBounds(
  image: RGBAImage,
  xb: number[],
  yb: number[],
  confidence: Confidence,
): GridDetectionResult {
  const gridWidth = xb.length - 1;
  const gridHeight = yb.length - 1;
  const cellWidth = image.width / gridWidth;
  const cellHeight = image.height / gridHeight;
  const detectedCellSize = (cellWidth + cellHeight) / 2;
  const limit = confidence === 'low' ? SOFT_MAX_GRID : MAX_OUTPUT_SIZE;
  if (Math.max(gridWidth, gridHeight) > limit) {
    const grid = cappedGrid(image, gridWidth, gridHeight, limit);
    return {
      ...grid,
      cellSize: (grid.cellWidth + grid.cellHeight) / 2,
      confidence,
      offsetX: 0,
      offsetY: 0,
      capped: true,
      detectedCellSize,
    };
  }
  return {
    cellSize: detectedCellSize,
    gridWidth,
    gridHeight,
    confidence,
    cellWidth,
    cellHeight,
    offsetX: phaseOf(xb, cellWidth),
    offsetY: phaseOf(yb, cellHeight),
    capped: false,
    detectedCellSize,
    xBounds: xb,
    yBounds: yb,
  };
}

/** Build a detection result from an explicit output size (manual override). */
export function gridFromTarget(
  image: RGBAImage,
  targetWidth: number,
  targetHeight: number,
): GridDetectionResult {
  const gridWidth = clampInt(targetWidth, 1, MAX_OUTPUT_SIZE);
  const gridHeight = clampInt(targetHeight, 1, MAX_OUTPUT_SIZE);
  const cellWidth = image.width / gridWidth;
  const cellHeight = image.height / gridHeight;
  const cellSize = (cellWidth + cellHeight) / 2;
  return {
    cellSize,
    gridWidth,
    gridHeight,
    confidence: 'high',
    cellWidth,
    cellHeight,
    offsetX: 0,
    offsetY: 0,
    capped: false,
    detectedCellSize: cellSize,
  };
}

/**
 * Build a grid from a known logical-pixel size, in source pixels (manual
 * override for when the user can see the pixels are, say, 3px). The size is
 * taken as given; the lines are still fitted to the art's edges, so they pick
 * up the grid's phase and follow local jitter and drift.
 */
export function gridFromCellSize(image: RGBAImage, cellSize: number): GridDetectionResult {
  const { width, height } = image;
  const cell = Math.max(1, cellSize);
  const nominalW = Math.max(1, Math.round(width / cell));
  const nominalH = Math.max(1, Math.round(height / cell));
  if (Math.max(nominalW, nominalH) > MAX_OUTPUT_SIZE) {
    const grid = cappedGrid(image, nominalW, nominalH, MAX_OUTPUT_SIZE);
    return {
      ...grid,
      cellSize: (grid.cellWidth + grid.cellHeight) / 2,
      confidence: 'high',
      offsetX: 0,
      offsetY: 0,
      capped: true,
      detectedCellSize: cell,
    };
  }
  const { cols, rows } = edgeSignals(image);
  const result = resultFromBounds(image, fitLines(cols, width, cell), fitLines(rows, height, cell), 'high');
  return result.capped ? { ...result, detectedCellSize: cell } : { ...result, cellSize: cell, detectedCellSize: cell };
}

/**
 * Read the residual-variance curve `u` (indexed by candidate cell size, up to
 * `maxCell`): the plateau's end is the largest size still (mostly) uniform
 * whose next sizes jump sharply — smaller knees are divisors or sub-cell
 * texture. `plateauEnd` is 0 when nothing qualifies (no grid); `strongest`
 * is the sharpest knee anywhere, the fallback guess.
 */
export function findPlateauEnd(u: number[], maxCell: number): { plateauEnd: number; knee: number; strongest: number } {
  const kneeAt = (c: number) => {
    let next = 0;
    for (let d = 1; d <= KNEE_WINDOW && c + d <= maxCell; d++) next = Math.max(next, u[c + d]);
    return (next + KNEE_EPS) / (u[c] + KNEE_EPS);
  };
  let plateauEnd = 0;
  let strongest = MIN_CELL_SIZE;
  for (let c = MIN_CELL_SIZE; c < maxCell; c++) {
    const k = kneeAt(c);
    if (k > kneeAt(strongest)) strongest = c;
    if (k >= KNEE_MEDIUM && u[c] <= PLATEAU_MAX) plateauEnd = c;
  }
  return { plateauEnd, knee: plateauEnd ? kneeAt(plateauEnd) : 0, strongest };
}

/**
 * Detect the implied grid: fit lines at each candidate cell size, find the
 * knee in residual within-cell variance, and settle on the spacing of the
 * edge-backed lines there (see the file header). Returns the fitted line
 * positions; a low-confidence grid over SOFT_MAX_GRID is capped and flagged.
 */
export function detectGrid(image: RGBAImage): GridDetectionResult {
  const { width, height } = image;
  const { cols, rows } = edgeSignals(image);
  const I = buildColorIntegrals(image);
  const total = boxVar(I, 0, 0, width, height);
  if (total <= 1e-6) return resultFromBounds(image, [0, width], [0, height], 'low'); // flat: no grid to find

  const fitAt = (cell: number) => ({ xb: fitLines(cols, width, cell), yb: fitLines(rows, height, cell) });
  const maxCell = Math.max(MIN_CELL_SIZE + 1, Math.min(MAX_CELL_SIZE, Math.floor(Math.min(width, height) / 3)));

  // Residual-variance curve over candidate sizes, each with its own fitted lines.
  const u: number[] = [];
  const fits: { xb: number[]; yb: number[] }[] = [];
  for (let c = MIN_CELL_SIZE; c <= maxCell; c++) {
    fits[c] = fitAt(c);
    u[c] = gridVariance(I, fits[c].xb, fits[c].yb) / total;
  }

  const { plateauEnd, knee, strongest } = findPlateauEnd(u, maxCell);
  if (!plateauEnd) {
    // No grid: keep the best guess, reported low (and capped if large).
    return resultFromBounds(image, fits[strongest].xb, fits[strongest].yb, 'low');
  }
  const confidence: Confidence = knee >= KNEE_HIGH ? 'high' : 'medium';

  // Settle on the spacing the art's edges actually show, refitting there.
  let { xb, yb } = fits[plateauEnd];
  let cell = plateauEnd;
  for (let round = 0; round < REFIT_ROUNDS; round++) {
    const spacings = [edgeSpacing(cols, xb), edgeSpacing(rows, yb)].filter((s) => !Number.isNaN(s));
    if (spacings.length === 0) break;
    const next = spacings.reduce((s, v) => s + v, 0) / spacings.length;
    if (Math.abs(next - cell) < 0.05) break;
    cell = next;
    ({ xb, yb } = fitAt(cell));
  }
  return resultFromBounds(image, xb, yb, confidence);
}
