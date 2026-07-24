// Sindri Pixel — grid detection for AI pixel-art reconstruction.
//
// AI "pixel art" only *looks* pixelated: it's a smooth render with an implied
// grid drawn inconsistently (one apparent pixel 14px wide, its neighbor 18px),
// anti-aliased edges, and fine sub-cell texture. Recovering the true cell size
// is the hard part.
//
// The core idea mirrors what a human does when they "count the pixels": overlay
// a candidate grid and check whether every cell is internally uniform. At the
// TRUE cell size (and correct phase) each cell holds a single logical pixel, so
// within-cell variance collapses to a sharp local minimum — a "dip". A slightly
// wrong size makes cells straddle two pixels, so variance is high on either
// side. So we sweep the candidate cell size, phase-align each candidate, and
// find the variance dip. The DEPTH of the dip is the confidence: a deep dip
// means a genuine pixel grid; a flat curve means a detailed render with no true
// grid (correctly reported as low confidence). Integral images make the sweep
// fast.

import { luminance } from './color';
import { axisBoundaries } from './cellSampling';
import {
  MAX_CELL_SIZE,
  MAX_OUTPUT_SIZE,
  MIN_CELL_SIZE,
  type GridDetectionResult,
  type RGBAImage,
} from './types';

// When detection is not confident, distrust very fine grids: a sprite this
// large from a weak signal is almost always texture, so cap the longer side.
const SOFT_MAX_GRID = 128;
// Variance-dip depth thresholds for confidence (ratio of neighbor variance to
// the dip). A clean grid resonates strongly (≫1); a detailed render is ~1.
const DIP_HIGH = 1.5;
const DIP_MEDIUM = 1.25;

type Confidence = GridDetectionResult['confidence'];

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Grayscale luminance grid (one float per source pixel). */
function toLuminance(image: RGBAImage): Float32Array {
  const { data, width, height } = image;
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    lum[i] = luminance(data[o], data[o + 1], data[o + 2], data[o + 3]);
  }
  return lum;
}

/** Edge signal over the Y axis: summed absolute luminance change from the row
 *  above (spikes at horizontal cell boundaries). Used for phase alignment. */
function rowEdgeSignal(lum: Float32Array, width: number, box: Box): Float32Array {
  const signal = new Float32Array(box.y1);
  for (let y = Math.max(1, box.y0); y < box.y1; y++) {
    let sum = 0;
    const row = y * width;
    const prev = (y - 1) * width;
    for (let x = box.x0; x < box.x1; x++) sum += Math.abs(lum[row + x] - lum[prev + x]);
    signal[y] = sum;
  }
  return signal;
}

/** Edge signal over the X axis. */
function colEdgeSignal(lum: Float32Array, width: number, box: Box): Float32Array {
  const signal = new Float32Array(box.x1);
  for (let x = Math.max(1, box.x0); x < box.x1; x++) {
    let sum = 0;
    for (let y = box.y0; y < box.y1; y++) sum += Math.abs(lum[y * width + x] - lum[y * width + x - 1]);
    signal[x] = sum;
  }
  return signal;
}

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
 * Bounding box of "content" — pixels whose luminance differs from the flat
 * background (estimated from the corners). Lets detection ignore a large empty
 * background (a sprite centered on white). Falls back to the whole image.
 */
function contentBox(lum: Float32Array, width: number, height: number): Box {
  const bg = (lum[0] + lum[width - 1] + lum[(height - 1) * width] + lum[height * width - 1]) / 4;
  const thresh = 12;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (Math.abs(lum[row + x] - bg) > thresh) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0 || y1 < y0) return { x0: 0, y0: 0, x1: width, y1: height };
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/**
 * Phase of the grid lines for cell size `cell` on one axis, within [a, b):
 * the offset (in [0, cell)) that best aligns grid lines to strong edges.
 */
function bestPhase(signal: Float32Array, cell: number, a: number, b: number): number {
  let total = 0;
  for (let i = a; i < b; i++) total += signal[i];
  if (total <= 0) return 0;
  let best = 0;
  let bestScore = -1;
  for (let ph = 0; ph < cell; ph += 0.5) {
    let on = 0;
    let cnt = 0;
    for (let p = a + ph; p < b - 0.5; p += cell) {
      on += signal[Math.round(p)];
      cnt++;
    }
    if (cnt === 0) continue;
    const off = (total - on) / (b - a - cnt);
    const score = on / cnt / Math.max(off, 1e-6);
    if (score > bestScore) {
      bestScore = score;
      best = ph;
    }
  }
  return best;
}

/** Grid boundary positions within [a, b) for a cell offset by phase `ph`. */
function boundariesIn(a: number, b: number, cell: number, ph: number): number[] {
  const arr = [a];
  for (let p = a + ph; p < b - 0.5; p += cell) if (p > a + 0.5) arr.push(Math.round(p));
  arr.push(b);
  return arr;
}

/** Integral images for O(1) box mean/variance queries. */
interface Integrals {
  i1: Float64Array;
  i2: Float64Array;
  w1: number;
}

function buildIntegrals(lum: Float32Array, width: number, height: number): Integrals {
  const w1 = width + 1;
  const i1 = new Float64Array(w1 * (height + 1));
  const i2 = new Float64Array(w1 * (height + 1));
  for (let y = 0; y < height; y++) {
    let r1 = 0;
    let r2 = 0;
    for (let x = 0; x < width; x++) {
      const v = lum[y * width + x];
      r1 += v;
      r2 += v * v;
      i1[(y + 1) * w1 + (x + 1)] = i1[y * w1 + (x + 1)] + r1;
      i2[(y + 1) * w1 + (x + 1)] = i2[y * w1 + (x + 1)] + r2;
    }
  }
  return { i1, i2, w1 };
}

function boxVar(I: Integrals, ax: number, ay: number, bx: number, by: number): number {
  const n = (bx - ax) * (by - ay);
  if (n <= 0) return 0;
  const { i1, i2, w1 } = I;
  const s1 = i1[by * w1 + bx] - i1[ay * w1 + bx] - i1[by * w1 + ax] + i1[ay * w1 + ax];
  const s2 = i2[by * w1 + bx] - i2[ay * w1 + bx] - i2[by * w1 + ax] + i2[ay * w1 + ax];
  return s2 / n - (s1 / n) ** 2;
}

/** Mean within-cell variance for a phase-aligned grid over the content box. */
function cellVariance(I: Integrals, box: Box, cell: number, phx: number, phy: number): number {
  const xb = boundariesIn(box.x0, box.x1, cell, phx);
  const yb = boundariesIn(box.y0, box.y1, cell, phy);
  let total = 0;
  let cells = 0;
  for (let gy = 0; gy < yb.length - 1; gy++) {
    const ya = yb[gy];
    const yb2 = Math.max(ya + 1, yb[gy + 1]);
    for (let gx = 0; gx < xb.length - 1; gx++) {
      const xa = xb[gx];
      const xb2 = Math.max(xa + 1, xb[gx + 1]);
      total += boxVar(I, xa, ya, xb2, yb2);
      cells++;
    }
  }
  return cells > 0 ? total / cells : 0;
}

function clampInt(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(value)));
}

function axisGridCount(length: number, cell: number, offset: number): number {
  return Math.max(1, axisBoundaries(length, cell, offset).length - 1);
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
  return { cellSize, gridWidth, gridHeight, confidence: 'high', cellWidth, cellHeight, offsetX: 0, offsetY: 0 };
}

/**
 * Detect the implied grid via the within-cell-variance dip. Sweeps candidate
 * cell sizes, phase-aligns each, and finds where variance collapses (a real
 * grid). Confidence is the dip depth; a low-confidence oversized grid is capped.
 */
export function detectGrid(image: RGBAImage): GridDetectionResult {
  const { width, height } = image;
  const lum = toLuminance(image);
  const box = contentBox(lum, width, height);
  const marginX = box.x0 > 2 || box.x1 < width - 2;
  const marginY = box.y0 > 2 || box.y1 < height - 2;

  const I = buildIntegrals(lum, width, height);
  const colSig = colEdgeSignal(lum, width, box);
  const rowSig = rowEdgeSignal(lum, width, box);

  const boxW = box.x1 - box.x0;
  const boxH = box.y1 - box.y0;
  const maxCell = Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, Math.floor(Math.min(boxW, boxH) / 3)));

  // Variance curve across candidate cell sizes, each phase-aligned.
  const v: number[] = [];
  const phxArr: number[] = [];
  const phyArr: number[] = [];
  for (let s = MIN_CELL_SIZE; s <= maxCell; s++) {
    const phx = bestPhase(colSig, s, box.x0, box.x1);
    const phy = bestPhase(rowSig, s, box.y0, box.y1);
    v[s] = cellVariance(I, box, s, phx, phy);
    phxArr[s] = phx;
    phyArr[s] = phy;
  }

  // Deepest variance dip: cell size markedly more uniform than its neighbors.
  const dipAt = (s: number): number => Math.min(v[s - 1], v[s + 1]) / Math.max(v[s], 1e-6);
  let bestDip = 0;
  let bestCell = MIN_CELL_SIZE;
  for (let s = MIN_CELL_SIZE + 1; s < maxCell; s++) {
    const d = dipAt(s);
    if (d > bestDip) {
      bestDip = d;
      bestCell = s;
    }
  }
  // The true cell is the finest strong dip. On real art its divisors dip more
  // shallowly (jitter and detail break their uniformity), so the first cell that
  // reaches near the best dip is the fundamental — not a sub-cell texture period
  // (which does not dip) nor a coarse multiple (which merges pixels).
  let cell = bestCell;
  for (let s = MIN_CELL_SIZE + 1; s < bestCell; s++) {
    if (dipAt(s) >= 0.85 * bestDip) {
      cell = s;
      break;
    }
  }
  const dip = maxCell > MIN_CELL_SIZE + 1 ? dipAt(Math.max(MIN_CELL_SIZE + 1, Math.min(maxCell - 1, cell))) : 1;

  let confidence: Confidence = dip >= DIP_HIGH ? 'high' : dip >= DIP_MEDIUM ? 'medium' : 'low';

  // Per-axis grid + phase. Sprites with a margin keep the detected phase (grid
  // lines don't start at the origin); full-frame art uses exact equal division.
  let cellW = cell;
  let cellH = cell;
  let offsetX = 0;
  let offsetY = 0;
  let gridWidth: number;
  let gridHeight: number;
  if (marginX) {
    offsetX = (((box.x0 + phxArr[cell]) % cell) + cell) % cell;
    gridWidth = clampInt(axisGridCount(width, cell, offsetX), 1, MAX_OUTPUT_SIZE);
  } else {
    gridWidth = clampInt(width / cell, 1, MAX_OUTPUT_SIZE);
    cellW = width / gridWidth;
  }
  if (marginY) {
    offsetY = (((box.y0 + phyArr[cell]) % cell) + cell) % cell;
    gridHeight = clampInt(axisGridCount(height, cell, offsetY), 1, MAX_OUTPUT_SIZE);
  } else {
    gridHeight = clampInt(height / cell, 1, MAX_OUTPUT_SIZE);
    cellH = height / gridHeight;
  }

  // Size-sanity cap: when we don't trust an oversized estimate (or it exceeds
  // the output limit), fall back to an equal-division grid at a usable size.
  const oversized = Math.max(gridWidth, gridHeight) > MAX_OUTPUT_SIZE;
  if (oversized || (confidence !== 'high' && Math.max(gridWidth, gridHeight) > SOFT_MAX_GRID)) {
    const target = oversized ? MAX_OUTPUT_SIZE : SOFT_MAX_GRID;
    const scale = target / Math.max(gridWidth, gridHeight);
    gridWidth = clampInt(gridWidth * scale, 1, MAX_OUTPUT_SIZE);
    gridHeight = clampInt(gridHeight * scale, 1, MAX_OUTPUT_SIZE);
    cellW = width / gridWidth;
    cellH = height / gridHeight;
    offsetX = 0;
    offsetY = 0;
  }

  return {
    cellSize: (cellW + cellH) / 2,
    gridWidth,
    gridHeight,
    confidence,
    cellWidth: cellW,
    cellHeight: cellH,
    offsetX,
    offsetY,
  };
}
