// Sindri Pixel — reconstruction pipeline orchestrator.
//
//   source image (any resolution)
//     → grid detection (find logical pixel size)
//     → cell sampling (mode color per logical cell)
//     → palette quantization (reduce to N colors)
//     → cleanup pass (remove isolated pixels, merge near-duplicate colors)
//
//   reconstructSequence runs the same pipeline over several frames with one
//   shared palette (for animations).
//     → output: native-resolution sprite

import { sampleCells, sampleCellsAverage } from './cellSampling';
import { mergeSimilarColors, removeIsolatedPixels, removeSolidBackground } from './cleanup';
import { toHex } from './color';
import { detectGrid, gridFromCellSize, gridFromTarget } from './gridDetection';
import { autoPaletteSize, countDistinctColors, quantize } from './paletteQuantize';
import type { GridDetectionResult, PixelArtOptions, RGBAImage } from './types';

// Cleanup thresholds. Anti-aliasing removal reuses the same passes with more
// aggressive thresholds, so the toggle always has an observable effect.
const ISOLATED_THRESHOLD = 40; // RGB distance
const ISOLATED_THRESHOLD_AA = 80;
const MERGE_DELTA_E = 4;
const MERGE_DELTA_E_AA = 9;

const OPAQUE_CUTOFF = 8;

export interface ReconstructionResult {
  result: RGBAImage;
  detection: GridDetectionResult;
}

/** One frame of a sequence: its source raster and, optionally, a grid the
 *  caller already resolved (callers cache detection across re-runs). */
export interface SequenceFrame {
  source: RGBAImage;
  grid?: GridDetectionResult;
}

/** Grid detection, or an explicit override: a known pixel size (still fitted
 *  to the art's edges) or an explicit output size. */
export function resolveGrid(source: RGBAImage, options: PixelArtOptions): GridDetectionResult {
  if (!options.autoDetectGrid && options.cellSize && options.cellSize > 0) {
    return gridFromCellSize(source, options.cellSize);
  }
  if (!options.autoDetectGrid && options.targetWidth && options.targetHeight) {
    return gridFromTarget(source, options.targetWidth, options.targetHeight);
  }
  return detectGrid(source);
}

/**
 * Reconstruct a true low-resolution sprite from an AI-generated pixel-art
 * raster. Fully deterministic. `source` may be a browser `ImageData` (it is
 * structurally an `RGBAImage`).
 */
export function reconstructPixelArt(
  source: RGBAImage,
  options: PixelArtOptions,
): ReconstructionResult {
  return reconstructSequence([{ source }], options)[0];
}

/**
 * Reconstruct several rasters as one set — the frames of an animation. Each
 * frame keeps its own grid, but palette quantization and color merging run
 * over all frames together, so a color means the same thing in every frame
 * and nothing flickers between them. A one-frame sequence is exactly
 * `reconstructPixelArt`.
 */
export function reconstructSequence(
  frames: SequenceFrame[],
  options: PixelArtOptions,
): ReconstructionResult[] {
  // 1–2. Grid, then cell sampling → native-resolution sprite. `mode` flattens
  //      each cell to its dominant color (clean pixel art); `average` keeps
  //      per-cell detail (a faithful downscale). A solid backdrop is cleared
  //      at this point, before it can take palette slots.
  const sampler = options.samplingMode === 'average' ? sampleCellsAverage : sampleCells;
  const detections = frames.map((f) => f.grid ?? resolveGrid(f.source, options));
  let images = frames.map((f, i) => {
    const detection = detections[i];
    const sampled = sampler(f.source, detection.gridWidth, detection.gridHeight, options.transparentBackground, {
      cellWidth: detection.cellWidth,
      cellHeight: detection.cellHeight,
      offsetX: detection.offsetX,
      offsetY: detection.offsetY,
      xBounds: detection.xBounds,
      yBounds: detection.yBounds,
    });
    return options.removeBackground ? removeSolidBackground(sampled) : sampled;
  });

  // 3. Palette quantization, shared across frames.
  const joined = stack(images);
  const distinct = countDistinctColors(joined);
  const targetPalette = options.paletteSize && options.paletteSize > 0
    ? options.paletteSize
    : autoPaletteSize(distinct);
  if (targetPalette > 0 && distinct > targetPalette) {
    images = unstack(quantize(joined, targetPalette).image, images);
  }

  // 4. Cleanup passes. Each toggle is wired independently; anti-aliasing
  //    removal raises the thresholds of both passes (and runs them even when
  //    the individual toggles are off) so it is never a silent no-op.
  //    Isolated-pixel removal is spatial, so it runs per frame; color merging
  //    runs over the whole set so every frame maps colors the same way.
  const aa = options.removeAntiAliasing;
  if (options.removeIsolatedPixels || aa) {
    images = images.map((img) => removeIsolatedPixels(img, aa ? ISOLATED_THRESHOLD_AA : ISOLATED_THRESHOLD));
  }
  if (options.mergeSimilarColors || aa) {
    images = unstack(mergeSimilarColors(stack(images), aa ? MERGE_DELTA_E_AA : MERGE_DELTA_E), images);
  }

  return images.map((result, i) => ({ result, detection: detections[i] }));
}

/** Stack images vertically (left-aligned, transparent padding) into one. */
function stack(images: RGBAImage[]): RGBAImage {
  if (images.length === 1) return images[0];
  const width = Math.max(...images.map((img) => img.width));
  const height = images.reduce((h, img) => h + img.height, 0);
  const out: RGBAImage = { data: new Uint8ClampedArray(width * height * 4), width, height };
  let top = 0;
  for (const img of images) {
    for (let y = 0; y < img.height; y++) {
      out.data.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((top + y) * width) * 4);
    }
    top += img.height;
  }
  return out;
}

/** Split a `stack` result back into images shaped like `like`. */
function unstack(joined: RGBAImage, like: RGBAImage[]): RGBAImage[] {
  if (like.length === 1) return [joined];
  let top = 0;
  return like.map((img) => {
    const out: RGBAImage = { data: new Uint8ClampedArray(img.width * img.height * 4), width: img.width, height: img.height };
    for (let y = 0; y < img.height; y++) {
      const from = ((top + y) * joined.width) * 4;
      out.data.set(joined.data.subarray(from, from + img.width * 4), y * img.width * 4);
    }
    top += img.height;
    return out;
  });
}

/**
 * Pack an RGBAImage into the ARGB int array consumed by
 * `frameFromPackedPixels`. Transparent pixels become 0.
 */
export function imageToPackedPixels(image: RGBAImage): number[] {
  const { data, width, height } = image;
  const packed = new Array<number>(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (data[o + 3] < OPAQUE_CUTOFF) {
      packed[i] = 0;
    } else {
      packed[i] = ((0xff << 24) | (data[o] << 16) | (data[o + 1] << 8) | data[o + 2]) >>> 0;
    }
  }
  return packed;
}

/** Distinct opaque colors as `#rrggbb` hex strings (for the editor palette). */
export function extractPalette(image: RGBAImage): string[] {
  const seen = new Set<string>();
  const palette: string[] = [];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const o = (y * image.width + x) * 4;
      if (image.data[o + 3] < OPAQUE_CUTOFF) continue;
      const hex = toHex({ r: image.data[o], g: image.data[o + 1], b: image.data[o + 2], a: 255 });
      if (!seen.has(hex)) {
        seen.add(hex);
        palette.push(hex);
      }
    }
  }
  return palette;
}
