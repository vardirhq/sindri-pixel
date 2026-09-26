// Sindri Pixel — choosing a grid for every frame of an animation.
//
// Detecting each frame on its own lets the pixel size wander (15px in one
// frame, 14.6px in the next), and the reconstructed sprites come out at
// slightly different sizes — the character pulses as it plays. So by default
// every frame shares one pixel size: the median of the per-frame detections
// (confident ones first). Each frame still gets its own fitted lines at that
// size, following its own phase and drift.
//
// Per-frame `scale` resizes a frame the pixel-art way: instead of resampling
// the finished sprite (which would smear it), the frame is re-read from its
// source with a proportionally smaller or larger pixel size, so it stays
// crisp at any scale.

import { detectGrid, gridFromCellSize, gridFromTarget } from '../pixelReconstruction/gridDetection';
import type { GridDetectionResult, PixelArtOptions, RGBAImage } from '../pixelReconstruction/types';

export interface SequenceInput {
  id: string;
  source: RGBAImage;
  /** 1 = as drawn; 0.5 = half size; 2 = double. */
  scale: number;
}

/** Memo of grid results, keyed by frame and parameters. Reuse across runs. */
export type GridCache = Map<string, GridDetectionResult>;

export interface GridPlan {
  grids: GridDetectionResult[];
  /** The shared pixel size in auto mode (null when not shared). */
  sharedCellSize: number | null;
}

function cached(cache: GridCache, key: string, compute: () => GridDetectionResult): GridDetectionResult {
  let hit = cache.get(key);
  if (!hit) {
    hit = compute();
    cache.set(key, hit);
  }
  return hit;
}

/** Median detected pixel size, preferring detections that aren't low-confidence. */
export function sharedCellSize(detections: GridDetectionResult[]): number | null {
  if (detections.length === 0) return null;
  const trusted = detections.filter((d) => d.confidence !== 'low');
  const sizes = (trusted.length ? trusted : detections).map((d) => d.detectedCellSize).sort((a, b) => a - b);
  const mid = sizes.length >> 1;
  return sizes.length % 2 ? sizes[mid] : (sizes[mid - 1] + sizes[mid]) / 2;
}

/**
 * Resolve every frame's grid under `options` (as built by `buildOptions`).
 *  - explicit pixel size → that size ÷ scale, fitted per frame;
 *  - explicit output size → that size × scale;
 *  - auto → per-frame detection; with `matchPixelSize`, one shared size.
 */
export function planGrids(
  frames: SequenceInput[],
  options: PixelArtOptions,
  matchPixelSize: boolean,
  cache: GridCache,
): GridPlan {
  const atCell = (f: SequenceInput, cell: number) => {
    const c = Math.round((cell / f.scale) * 100) / 100;
    return cached(cache, `${f.id}:cell:${c}`, () => gridFromCellSize(f.source, c));
  };

  if (!options.autoDetectGrid && options.cellSize && options.cellSize > 0) {
    return { grids: frames.map((f) => atCell(f, options.cellSize!)), sharedCellSize: null };
  }
  if (!options.autoDetectGrid && options.targetWidth && options.targetHeight) {
    return {
      grids: frames.map((f) => {
        const w = Math.max(1, Math.round(options.targetWidth! * f.scale));
        const h = Math.max(1, Math.round(options.targetHeight! * f.scale));
        return cached(cache, `${f.id}:target:${w}x${h}`, () => gridFromTarget(f.source, w, h));
      }),
      sharedCellSize: null,
    };
  }

  const detections = frames.map((f) => cached(cache, `${f.id}:auto`, () => detectGrid(f.source)));
  if (matchPixelSize && frames.length > 1) {
    const shared = sharedCellSize(detections)!;
    return { grids: frames.map((f) => atCell(f, shared)), sharedCellSize: shared };
  }
  return {
    grids: frames.map((f, i) => (f.scale === 1 || detections[i].capped ? detections[i] : atCell(f, detections[i].detectedCellSize))),
    sharedCellSize: null,
  };
}
