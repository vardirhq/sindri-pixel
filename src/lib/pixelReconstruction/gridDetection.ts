// Sindri Pixel — autocorrelation-based grid detection.
//
// AI "pixel art" draws an implied grid inconsistently: one apparent pixel may
// be 14px wide, its neighbor 18px. We estimate the dominant cell size by
// building a 1D edge signal along each axis and finding the period that best
// correlates with itself.
//
// The hard case is a finely-rendered image (fabric weave, mesh, dithering)
// whose *texture* is more periodic than its art grid. There the autocorrelation
// honestly reports the fine texture period — so this module does two extra
// things beyond peak-picking: it scores how trustworthy the estimate is
// (strength + how much the peak dominates its neighbors + axis agreement), and
// when a *low-confidence* estimate would yield an implausibly large sprite it
// caps the output to a usable resolution instead of emitting hundreds of noisy
// cells. Clean, genuinely-gridded art still detects sharply and passes through
// untouched.

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

// When detection is not confident, distrust very fine grids: a sprite this
// large from a weak signal is almost always texture, so cap the longer side to
// a sensible default and let the user override upward if they really wanted it.
const SOFT_MAX_GRID = 128;
// Above this, a non-high-confidence estimate is downgraded — a huge grid from a
// mediocre peak is the fingerprint of sub-cell texture, not an art grid.
const FINE_GRID_LIMIT = 176;

type Confidence = GridDetectionResult['confidence'];

interface AxisEstimate {
  /** Fundamental period in source pixels (the recovered cell size for the axis). */
  period: number;
  /** Normalized autocorrelation at the peak, in [0, 1]. */
  strength: number;
  /** How much the peak stands out from the average lag (peak − mean corr). */
  dominance: number;
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
 * Analyze one 1D edge signal. Uses a properly *normalized* autocorrelation
 * (Pearson over the overlapping window) so `strength` is a real correlation in
 * [0, 1] and comparable across images. Returns the fundamental period (the
 * smallest period whose correlation is near the peak, so we don't lock onto a
 * 2×/3× harmonic multiple), the peak strength, and how far the peak rises above
 * the mean lag (`dominance` — low for a broad "comb" with no clear winner).
 */
export function analyzeAxis(signal: Float32Array, pMin: number, pMax: number): AxisEstimate {
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

  const meanCorr = corrCount > 0 ? corrSum / corrCount : 0;
  return {
    period: fundamental,
    strength: Math.max(0, Math.min(1, peak)),
    dominance: Math.max(0, peak - meanCorr),
  };
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

function downgrade(c: Confidence): Confidence {
  return c === 'high' ? 'medium' : 'low';
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
 * otherwise the stronger axis wins and confidence drops. Confidence reflects
 * peak strength, peak dominance, and axis agreement; a low-confidence estimate
 * that would produce an oversized grid is capped to a usable sprite size.
 */
export function detectGrid(image: RGBAImage): GridDetectionResult {
  const { width, height } = image;
  const lum = toLuminance(image);

  const rowEst = analyzeAxis(rowEdgeSignal(lum, width, height), MIN_CELL_SIZE, MAX_CELL_SIZE);
  const colEst = analyzeAxis(colEdgeSignal(lum, width, height), MIN_CELL_SIZE, MAX_CELL_SIZE);

  const cellH = rowEst.period; // vertical period = cell height
  const cellW = colEst.period; // horizontal period = cell width
  const larger = Math.max(cellW, cellH);
  const smaller = Math.min(cellW, cellH);
  const divergence = larger > 0 ? (larger - smaller) / larger : 1;

  const avgStrength = (rowEst.strength + colEst.strength) / 2;
  const avgDominance = (rowEst.dominance + colEst.dominance) / 2;

  // Base confidence from how clean and decisive the autocorrelation peaks are.
  // A strong, dominant peak on both axes = a real grid; a mediocre peak sitting
  // in a broad comb of similar lags = ambiguous texture.
  let confidence: Confidence =
    avgStrength >= 0.9 && avgDominance >= 0.45
      ? 'high'
      : avgStrength >= 0.6 && avgDominance >= 0.2
        ? 'medium'
        : 'low';

  let cellSize: number;
  if (divergence <= 0.15) {
    cellSize = (cellW + cellH) / 2;
  } else {
    // Axes disagree — trust the stronger peak but flag lower confidence.
    cellSize = colEst.strength >= rowEst.strength ? cellW : cellH;
    confidence = downgrade(confidence);
  }

  cellSize = Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, cellSize));

  let gridWidth = clampInt(snap(width / cellSize), 1, MAX_OUTPUT_SIZE);
  let gridHeight = clampInt(snap(height / cellSize), 1, MAX_OUTPUT_SIZE);

  // A large grid from anything but a clean, strong peak is the signature of
  // sub-cell texture (fabric, mesh, dithering) rather than an art grid.
  if (confidence !== 'high' && Math.max(gridWidth, gridHeight) > FINE_GRID_LIMIT && avgStrength < 0.92) {
    confidence = 'low';
  }

  // Size-sanity cap: don't hand back a "sprite" that is really a downscale when
  // we don't trust the estimate. Preserve aspect ratio; the user can override
  // to the finer grid if that is genuinely what they want.
  if (confidence === 'low' && Math.max(gridWidth, gridHeight) > SOFT_MAX_GRID) {
    const scale = SOFT_MAX_GRID / Math.max(gridWidth, gridHeight);
    gridWidth = clampInt(gridWidth * scale, 1, MAX_OUTPUT_SIZE);
    gridHeight = clampInt(gridHeight * scale, 1, MAX_OUTPUT_SIZE);
    cellSize = (width / gridWidth + height / gridHeight) / 2;
  }

  return { cellSize, gridWidth, gridHeight, confidence };
}
