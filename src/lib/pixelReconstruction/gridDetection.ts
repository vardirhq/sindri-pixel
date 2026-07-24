// Sindri Pixel — grid detection for AI pixel-art reconstruction.
//
// AI "pixel art" draws an implied grid inconsistently: one apparent pixel may
// be 14px wide, its neighbor 18px, with anti-aliased edges and fine sub-cell
// texture (fabric weave, mesh, dithering). Recovering the true cell size from
// that is the hard part. We use three cooperating signals:
//
//  1. Peak spacing — the *median gap* between edge peaks on each axis. Robust
//     to jittered cell widths (a median tolerates the variation), and the
//     primary period estimate.
//  2. Autocorrelation — a normalized self-correlation of the edge signal. A
//     strong, dominant peak means a genuine repeating grid; a broad "comb"
//     means ambiguous texture. Used to score confidence and cross-check.
//  3. Within-cell variance — arbitrates harmonic aliases: if a detector locked
//     onto sub-cell texture, coarsening to the true cell keeps cells nearly as
//     uniform, whereas coarsening past the true cell merges distinct colors and
//     variance jumps. So we coarsen while variance stays flat.
//
// Confidence reflects peak regularity, autocorrelation strength, and agreement
// between the estimates; a low-confidence estimate that would yield an
// implausibly large sprite is capped to a usable resolution.

import { luminance } from './color';
import { axisBoundaries } from './cellSampling';
import {
  MAX_CELL_SIZE,
  MAX_OUTPUT_SIZE,
  MIN_CELL_SIZE,
  type GridDetectionResult,
  type RGBAImage,
} from './types';

// A grid this regular is treated as rigid: worth sub-pixel cell + phase fitting.
const RIGID_REGULARITY = 0.8;

// When detection is not confident, distrust very fine grids: a sprite this
// large from a weak signal is almost always texture, so cap the longer side to
// a sensible default and let the user override upward if they really wanted it.
const SOFT_MAX_GRID = 128;
// Above this, a non-high-confidence estimate is downgraded — a huge grid from a
// weak signal is the fingerprint of sub-cell texture, not an art grid.
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

interface PeakEstimate {
  /** Median gap between edge peaks, or 0 if too few peaks were found. */
  period: number;
  /** Fraction of gaps close to the median — 1 for a perfectly regular grid. */
  regularity: number;
}

/**
 * Estimate the axis period from the *median spacing* between prominent edge
 * peaks. Unlike autocorrelation this tolerates jittered cell widths (each cell
 * a few pixels off), which is how real AI upscales look, and reports how
 * regular the spacing is as a confidence signal. `kSd` sets the peak threshold
 * at `mean + kSd·sd`: a higher value keeps only strong (real-boundary) edges,
 * used to see past regular sub-cell texture.
 */
export function peakSpacingAxis(
  signal: Float32Array,
  pMin: number,
  pMax: number,
  kSd = 0.25,
): PeakEstimate {
  const n = signal.length;
  if (n < pMin * 3) return { period: 0, regularity: 0 };

  let mean = 0;
  for (let i = 0; i < n; i++) mean += signal[i];
  mean /= n;
  let sd = 0;
  for (let i = 0; i < n; i++) sd += (signal[i] - mean) ** 2;
  sd = Math.sqrt(sd / n);
  const threshold = mean + kSd * sd;
  const minSep = Math.max(2, Math.floor(pMin * 0.75));

  const peaks: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (signal[i] < threshold) continue;
    if (signal[i] < signal[i - 1] || signal[i] < signal[i + 1]) continue;
    const last = peaks[peaks.length - 1];
    if (last !== undefined && i - last < minSep) {
      if (signal[i] > signal[last]) peaks[peaks.length - 1] = i; // keep the taller of two close peaks
    } else {
      peaks.push(i);
    }
  }
  if (peaks.length < 3) return { period: 0, regularity: 0 };

  const gaps: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    const g = peaks[i] - peaks[i - 1];
    if (g >= pMin && g <= pMax) gaps.push(g);
  }
  if (gaps.length < 2) return { period: 0, regularity: 0 };

  gaps.sort((a, b) => a - b);
  const median = gaps[gaps.length >> 1];
  const tol = Math.max(1, median * 0.15);
  let near = 0;
  for (const g of gaps) if (Math.abs(g - median) <= tol) near++;
  return { period: median, regularity: near / gaps.length };
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Bounding box of "content" — pixels whose luminance differs from the flat
 * background (estimated from the corners) by more than a small threshold. Lets
 * grid clarity ignore a large empty background (a sprite centered on white),
 * which would otherwise swamp the signal. Falls back to the whole image.
 */
function contentBox(lum: Float32Array, width: number, height: number): Box {
  const bg = (lum[0] + lum[width - 1] + lum[(height - 1) * width] + lum[height * width - 1]) / 4;
  const thresh = 12;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
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

/** Mean per-cell luminance variance for cells of size `cell` tiling `box`. */
function boxCellVariance(lum: Float32Array, width: number, box: Box, cell: number): number {
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  const gw = Math.max(1, Math.round(bw / cell));
  const gh = Math.max(1, Math.round(bh / cell));
  const cw = bw / gw;
  const ch = bh / gh;
  let total = 0;
  let cells = 0;
  for (let gy = 0; gy < gh; gy++) {
    const y0 = box.y0 + Math.floor(gy * ch);
    const y1 = box.y0 + Math.max(Math.floor(gy * ch) + 1, Math.floor((gy + 1) * ch));
    for (let gx = 0; gx < gw; gx++) {
      const x0 = box.x0 + Math.floor(gx * cw);
      const x1 = box.x0 + Math.max(Math.floor(gx * cw) + 1, Math.floor((gx + 1) * cw));
      let sum = 0;
      let sq = 0;
      let cnt = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * width;
        for (let x = x0; x < x1; x++) {
          const v = lum[row + x];
          sum += v;
          sq += v * v;
          cnt++;
        }
      }
      if (cnt > 0) {
        total += sq / cnt - (sum / cnt) ** 2;
        cells++;
      }
    }
  }
  return cells > 0 ? total / cells : 0;
}

/**
 * "Grid clarity": how sharply within-cell variance jumps when coarsening from
 * the detected cell to double it. A true grid breaks (large jump) because
 * coarsening merges distinct logical pixels; smoothly-detailed art with no real
 * grid (the fabric-texture case) barely changes. Measured over the content
 * bounding box so a flat background does not dilute it. Returned in ~[0, 1].
 */
function gridClarity(lum: Float32Array, width: number, box: Box, cell: number): number {
  const vCell = boxCellVariance(lum, width, box, cell);
  const vDouble = boxCellVariance(lum, width, box, Math.min(MAX_CELL_SIZE, cell * 2));
  const ratio = vDouble / Math.max(vCell, 1e-3);
  // ratio ~1 → no grid (smooth); ratio ≫1 → coarsening broke a real grid.
  return Math.max(0, Math.min(1, (ratio - 1.3) / 2));
}

/**
 * Reconcile an axis period against sub-cell texture. Real cell boundaries are
 * stronger edges than fabric/mesh/dither texture, so we re-measure peak spacing
 * keeping only strong edges: if that spacing is a clean 2–4× multiple of the
 * all-edge spacing and stays regular, the all-edge estimate had locked onto
 * texture and we adopt the coarser, true period. A normal (untextured) grid is
 * unaffected — its strong spacing equals its base spacing (ratio ~1).
 */
function reconcilePeriod(signal: Float32Array, base: PeakEstimate): PeakEstimate {
  if (base.period <= 0) return base;
  const strong = peakSpacingAxis(signal, MIN_CELL_SIZE, MAX_CELL_SIZE, 1.1);
  if (strong.period <= 0 || strong.regularity < 0.5) return base;
  const ratio = strong.period / base.period;
  const mult = Math.round(ratio);
  if (mult >= 2 && mult <= 4 && Math.abs(ratio - mult) <= 0.15) {
    return strong;
  }
  return base;
}

/**
 * Sub-pixel refinement for a rigid grid: search cell size near `coarse` and the
 * grid-line phase to maximize comb alignment — mean edge energy *on* grid lines
 * vs *off* them. Recovers the exact cell size and the offset of the first grid
 * line, so sampling lands on the source's real pixel boundaries instead of
 * assuming the grid starts at 0 (a small offset otherwise smears fine detail).
 */
function fitAxis(signal: Float32Array, coarse: number): { cell: number; offset: number } {
  const n = signal.length;
  let total = 0;
  for (let i = 0; i < n; i++) total += signal[i];
  if (total <= 0) return { cell: coarse, offset: 0 };

  const lo = Math.max(MIN_CELL_SIZE, coarse - 1.5);
  const hi = Math.min(MAX_CELL_SIZE, coarse + 1.5);
  let best = { cell: coarse, offset: 0, score: -1 };
  for (let p = lo; p <= hi; p += 0.05) {
    for (let ph = 0; ph < p; ph += 0.25) {
      let on = 0;
      let cnt = 0;
      for (let pos = ph; pos < n - 0.5; pos += p) {
        on += signal[Math.round(pos)];
        cnt++;
      }
      if (cnt === 0 || cnt >= n) continue;
      const offMean = (total - on) / (n - cnt);
      const score = on / cnt / Math.max(offMean, 1e-6);
      if (score > best.score) best = { cell: p, offset: ph, score };
    }
  }
  return { cell: best.cell, offset: best.offset };
}

function clampInt(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(value)));
}

/** Cell count for a phased axis grid. */
function axisGridCount(length: number, cell: number, offset: number): number {
  return Math.max(1, axisBoundaries(length, cell, offset).length - 1);
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
  const cellWidth = image.width / gridWidth;
  const cellHeight = image.height / gridHeight;
  const cellSize = (cellWidth + cellHeight) / 2;
  return { cellSize, gridWidth, gridHeight, confidence: 'high', cellWidth, cellHeight, offsetX: 0, offsetY: 0 };
}

/**
 * Detect the implied grid. Per axis, the period comes from median peak spacing
 * (jitter-robust), falling back to autocorrelation when too few peaks are
 * found; harmonic aliases are then resolved by within-cell-variance coarsening.
 * Confidence blends peak regularity, autocorrelation strength, and agreement
 * between the two, and a low-confidence oversized grid is capped.
 */
export function detectGrid(image: RGBAImage): GridDetectionResult {
  const { width, height } = image;
  const lum = toLuminance(image);
  const rowSig = rowEdgeSignal(lum, width, height);
  const colSig = colEdgeSignal(lum, width, height);
  const box = contentBox(lum, width, height);
  // A sprite inset from the image edges has a real grid phase to recover;
  // full-frame art (texture, benchmark tiles) starts at 0 and must not be
  // sub-pixel-fitted (that would destabilize the robust median estimate).
  const marginX = box.x0 > 2 || box.x1 < width - 2;
  const marginY = box.y0 > 2 || box.y1 < height - 2;

  const rowPk = peakSpacingAxis(rowSig, MIN_CELL_SIZE, MAX_CELL_SIZE);
  const colPk = peakSpacingAxis(colSig, MIN_CELL_SIZE, MAX_CELL_SIZE);
  const rowAc = analyzeAxis(rowSig, MIN_CELL_SIZE, MAX_CELL_SIZE);
  const colAc = analyzeAxis(colSig, MIN_CELL_SIZE, MAX_CELL_SIZE);

  // Harmonic arbitration: if the base spacing locked onto regular sub-cell
  // texture, adopt the coarser strong-edge spacing (the true cell).
  const rowRec = reconcilePeriod(rowSig, rowPk);
  const colRec = reconcilePeriod(colSig, colPk);

  // Period per axis: prefer the jitter-robust peak spacing; fall back to
  // autocorrelation when too few peaks were found.
  const baseH = rowRec.period > 0 ? rowRec.period : rowAc.period;
  const baseW = colRec.period > 0 ? colRec.period : colAc.period;

  const regularity = (rowRec.regularity + colRec.regularity) / 2;
  const acStrength = (rowAc.strength + colAc.strength) / 2;

  // Sub-pixel cell size + grid-line phase for rigid axes; jittered axes keep the
  // median period at phase 0 (no single exact cell to fit).
  let cellW = baseW;
  let cellH = baseH;
  let offsetX = 0;
  let offsetY = 0;
  if (marginX && colRec.regularity >= RIGID_REGULARITY) {
    const f = fitAxis(colSig, baseW);
    cellW = f.cell;
    offsetX = f.offset;
  }
  if (marginY && rowRec.regularity >= RIGID_REGULARITY) {
    const f = fitAxis(rowSig, baseH);
    cellH = f.cell;
    offsetY = f.offset;
  }

  const larger = Math.max(cellW, cellH);
  const smaller = Math.min(cellW, cellH);
  const divergence = larger > 0 ? (larger - smaller) / larger : 1;
  // Scalar cell used for non-phased grid counts: average when the axes agree,
  // otherwise the more regular axis.
  const cellSize = Math.max(
    MIN_CELL_SIZE,
    Math.min(
      MAX_CELL_SIZE,
      divergence <= 0.15 ? (cellW + cellH) / 2 : colRec.regularity >= rowRec.regularity ? cellW : cellH,
    ),
  );

  // Grid clarity: does the detected cell mark a real grid (variance jumps when
  // coarsening past it) or just a slice of smooth detail (no jump)? This is what
  // separates a genuine sprite grid from regular fabric/mesh texture.
  const clarity = gridClarity(lum, width, box, cellSize);

  let confidence: Confidence;
  if (regularity >= 0.7 && clarity >= 0.5 && divergence <= 0.15) {
    confidence = 'high';
  } else if ((regularity >= 0.45 && clarity >= 0.3) || (acStrength >= 0.55 && clarity >= 0.5)) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  if (divergence > 0.15) confidence = downgrade(confidence);

  // With no phase, use exact equal division (round of width/cell) so the grid
  // count is stable. With a phase, tile from the offset (edge cells may be
  // partial background).
  let gridWidth: number;
  let gridHeight: number;
  if (offsetX === 0) {
    gridWidth = clampInt(width / cellSize, 1, MAX_OUTPUT_SIZE);
    cellW = width / gridWidth;
  } else {
    gridWidth = clampInt(axisGridCount(width, cellW, offsetX), 1, MAX_OUTPUT_SIZE);
  }
  if (offsetY === 0) {
    gridHeight = clampInt(height / cellSize, 1, MAX_OUTPUT_SIZE);
    cellH = height / gridHeight;
  } else {
    gridHeight = clampInt(axisGridCount(height, cellH, offsetY), 1, MAX_OUTPUT_SIZE);
  }

  // A large grid from anything but a confident, regular signal is the signature
  // of sub-cell texture rather than an art grid.
  if (confidence !== 'high' && Math.max(gridWidth, gridHeight) > FINE_GRID_LIMIT && regularity < 0.8) {
    confidence = 'low';
  }

  // Size-sanity cap: when we don't fully trust an oversized estimate (or it
  // simply exceeds the output limit), fall back to an equal-division grid at a
  // usable resolution, preserving aspect ratio.
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
