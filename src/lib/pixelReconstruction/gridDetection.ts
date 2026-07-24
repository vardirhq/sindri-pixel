// Sindri Pixel — autocorrelation-based grid detection.
//
// AI "pixel art" draws an implied grid inconsistently: one apparent pixel may
// be 14px wide, its neighbor 18px. We estimate the dominant cell size by
// building a 1D edge signal along each axis and finding the period that best
// correlates with itself.

import { luminance } from './color';
import {
  MAX_CELL_SIZE,
  MAX_OUTPUT_SIZE,
  MIN_CELL_SIZE,
  type GridDetectionResult,
  type RGBAImage,
} from './types';

// Common sprite dimensions we gently snap to when the raw estimate lands
// within one pixel — recovers e.g. 63 → 64 without forcing powers of two.
const SNAP_TARGETS = [8, 16, 24, 32, 48, 64, 96, 128, 256];

interface AxisEstimate {
  period: number;
  strength: number;
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

/**
 * Edge signal over the Y axis: for each row, the summed absolute luminance
 * change from the row above. Spikes at horizontal cell boundaries → its
 * period is the cell *height*.
 */
function rowEdgeSignal(lum: Float32Array, width: number, height: number): Float32Array {
  const signal = new Float32Array(height);
  for (let y = 1; y < height; y++) {
    let sum = 0;
    const row = y * width;
    const prev = (y - 1) * width;
    for (let x = 0; x < width; x++) {
      sum += Math.abs(lum[row + x] - lum[prev + x]);
    }
    signal[y] = sum;
  }
  return signal;
}

/** Edge signal over the X axis → its period is the cell *width*. */
function colEdgeSignal(lum: Float32Array, width: number, height: number): Float32Array {
  const signal = new Float32Array(width);
  for (let x = 1; x < width; x++) {
    let sum = 0;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      sum += Math.abs(lum[row + x] - lum[row + x - 1]);
    }
    signal[x] = sum;
  }
  return signal;
}

/**
 * Find the dominant period of a 1D signal via normalized autocorrelation.
 * Returns the fundamental period (the smallest period whose correlation is
 * near the peak, so we don't lock onto a harmonic multiple) plus a strength
 * in roughly [0, 1] that we use for confidence scoring.
 */
export function autocorrPeriod(signal: Float32Array, pMin: number, pMax: number): AxisEstimate {
  const n = signal.length;
  const maxP = Math.min(pMax, Math.floor(n / 2));
  if (maxP < pMin) return { period: pMin, strength: 0 };

  let mean = 0;
  for (let i = 0; i < n; i++) mean += signal[i];
  mean /= n;

  const dev = new Float32Array(n);
  let variance = 0;
  for (let i = 0; i < n; i++) {
    dev[i] = signal[i] - mean;
    variance += dev[i] * dev[i];
  }
  if (variance <= 0) return { period: pMin, strength: 0 };

  const corr: number[] = [];
  let peak = -Infinity;
  let peakP = pMin;
  for (let p = pMin; p <= maxP; p++) {
    let num = 0;
    for (let i = 0; i + p < n; i++) num += dev[i] * dev[i + p];
    const c = num / variance;
    corr[p] = c;
    if (c > peak) {
      peak = c;
      peakP = p;
    }
  }

  // Recover the fundamental: the smallest period whose correlation is at least
  // 90% of the peak. A spike train correlates strongly at 2×, 3×, … its true
  // period, so the raw argmax can be a multiple.
  let fundamental = peakP;
  for (let p = pMin; p <= peakP; p++) {
    if (corr[p] >= 0.9 * peak) {
      fundamental = p;
      break;
    }
  }

  return { period: fundamental, strength: Math.max(0, Math.min(1, peak)) };
}

function snap(dim: number): number {
  for (const t of SNAP_TARGETS) {
    if (Math.abs(dim - t) <= 1) return t;
  }
  return dim;
}

function clampInt(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(value)));
}

/** Build a detection result from an explicit output size (manual override). */
export function gridFromTarget(
  image: RGBAImage,
  targetWidth: number,
  targetHeight: number,
): GridDetectionResult {
  const gridWidth = clampInt(targetWidth, 1, MAX_OUTPUT_SIZE);
  const gridHeight = clampInt(targetHeight, 1, MAX_OUTPUT_SIZE);
  const cellSize = (image.width / gridWidth + image.height / gridHeight) / 2;
  return { cellSize, gridWidth, gridHeight, confidence: 'high' };
}

/**
 * Detect the implied grid. Estimates cell width and height independently; if
 * they agree (within ~15%) they are averaged into a single square cell size,
 * otherwise the stronger axis wins and confidence drops.
 */
export function detectGrid(image: RGBAImage): GridDetectionResult {
  const { width, height } = image;
  const lum = toLuminance(image);

  const rowEst = autocorrPeriod(rowEdgeSignal(lum, width, height), MIN_CELL_SIZE, MAX_CELL_SIZE);
  const colEst = autocorrPeriod(colEdgeSignal(lum, width, height), MIN_CELL_SIZE, MAX_CELL_SIZE);

  const cellH = rowEst.period; // vertical period = cell height
  const cellW = colEst.period; // horizontal period = cell width
  const larger = Math.max(cellW, cellH);
  const smaller = Math.min(cellW, cellH);
  const divergence = larger > 0 ? (larger - smaller) / larger : 1;

  let cellSize: number;
  let confidence: GridDetectionResult['confidence'];
  const avgStrength = (rowEst.strength + colEst.strength) / 2;

  if (divergence <= 0.15) {
    cellSize = (cellW + cellH) / 2;
    confidence = avgStrength >= 0.5 ? 'high' : avgStrength >= 0.25 ? 'medium' : 'low';
  } else {
    // Axes disagree — trust the stronger peak but flag lower confidence.
    cellSize = colEst.strength >= rowEst.strength ? cellW : cellH;
    confidence = 'low';
  }

  cellSize = Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, cellSize));

  const gridWidth = clampInt(snap(width / cellSize), 1, MAX_OUTPUT_SIZE);
  const gridHeight = clampInt(snap(height / cellSize), 1, MAX_OUTPUT_SIZE);

  return { cellSize, gridWidth, gridHeight, confidence };
}
