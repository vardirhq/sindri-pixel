// Sindri Pixel — reconstruction pipeline orchestrator.
//
//   source image (any resolution)
//     → grid detection (find logical pixel size)
//     → cell sampling (mode color per logical cell)
//     → palette quantization (reduce to N colors)
//     → cleanup pass (remove isolated pixels, merge near-duplicate colors)
//     → output: native-resolution sprite

import { sampleCells } from './cellSampling';
import { mergeSimilarColors, removeIsolatedPixels } from './cleanup';
import { toHex } from './color';
import { detectGrid, gridFromTarget } from './gridDetection';
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

/**
 * Reconstruct a true low-resolution sprite from an AI-generated pixel-art
 * raster. Fully deterministic. `source` may be a browser `ImageData` (it is
 * structurally an `RGBAImage`).
 */
export function reconstructPixelArt(
  source: RGBAImage,
  options: PixelArtOptions,
): ReconstructionResult {
  // 1. Grid detection (or explicit override).
  const detection =
    !options.autoDetectGrid && options.targetWidth && options.targetHeight
      ? gridFromTarget(source, options.targetWidth, options.targetHeight)
      : detectGrid(source);

  // 2. Cell sampling → native-resolution sprite.
  let image = sampleCells(
    source,
    detection.gridWidth,
    detection.gridHeight,
    options.transparentBackground,
  );

  // 3. Palette quantization.
  const distinct = countDistinctColors(image);
  const targetPalette = options.paletteSize && options.paletteSize > 0
    ? options.paletteSize
    : autoPaletteSize(distinct);
  if (targetPalette > 0 && distinct > targetPalette) {
    image = quantize(image, targetPalette).image;
  }

  // 4. Cleanup passes. Each toggle is wired independently; anti-aliasing
  //    removal raises the thresholds of both passes (and runs them even when
  //    the individual toggles are off) so it is never a silent no-op.
  const aa = options.removeAntiAliasing;
  if (options.removeIsolatedPixels || aa) {
    image = removeIsolatedPixels(image, aa ? ISOLATED_THRESHOLD_AA : ISOLATED_THRESHOLD);
  }
  if (options.mergeSimilarColors || aa) {
    image = mergeSimilarColors(image, aa ? MERGE_DELTA_E_AA : MERGE_DELTA_E);
  }

  return { result: image, detection };
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
