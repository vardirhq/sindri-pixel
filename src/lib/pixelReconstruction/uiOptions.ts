// Shared UI vocabulary for the reconstruction pipeline.
//
// Both front-ends — the editor's "Import AI Art" dialog and the standalone
// web downscaler — expose the same knobs. Keeping the choice types, presets
// and the choice → PixelArtOptions mapping here stops the two from drifting.

import { MAX_CELL_SIZE, MAX_OUTPUT_SIZE, type GridDetectionResult, type PixelArtOptions, type SamplingMode } from './types';

/**
 * `pixel` takes the size of one logical pixel in source pixels (the thing a
 * user can measure by eye); `custom` and the presets take output dimensions.
 */
export type GridChoice = 'auto' | 'pixel' | '16' | '32' | '48' | '64' | '128' | 'custom';
export type PaletteChoice = 'auto' | '8' | '16' | '32' | '64' | 'original';

export const GRID_PRESETS: { value: GridChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'pixel', label: 'Pixel size…' },
  { value: '16', label: '16 × 16' },
  { value: '32', label: '32 × 32' },
  { value: '48', label: '48 × 48' },
  { value: '64', label: '64 × 64' },
  { value: '128', label: '128 × 128' },
  { value: 'custom', label: 'Custom…' },
];

export const PALETTE_PRESETS: { value: PaletteChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: '8', label: '8' },
  { value: '16', label: '16' },
  { value: '32', label: '32' },
  { value: '64', label: '64' },
  { value: 'original', label: 'Original' },
];

/** Accepted range for the "Pixel size" input, in source pixels. */
export const MIN_PIXEL_SIZE = 1;
export const MAX_PIXEL_SIZE = MAX_CELL_SIZE;

/** Parse and clamp a "Pixel size" input value (decimals allowed, e.g. 2.5). */
export function clampPixelSize(value: number): number {
  if (!Number.isFinite(value)) return MIN_PIXEL_SIZE;
  return Math.max(MIN_PIXEL_SIZE, Math.min(MAX_PIXEL_SIZE, Math.round(value * 10) / 10));
}

/** Palette size that effectively disables quantization. */
const NO_QUANTIZE = 100000;

/** The mutable half of the UI state — everything except the grid choice. */
export interface CleanupSettings {
  samplingMode: SamplingMode;
  paletteChoice: PaletteChoice;
  removeIsolatedPixels: boolean;
  mergeSimilarColors: boolean;
  removeAntiAliasing: boolean;
}

/** "Clean sprite" — flat, readable pixel art. */
export const CLEAN_SPRITE_PRESET: CleanupSettings = {
  samplingMode: 'mode',
  paletteChoice: 'auto',
  removeIsolatedPixels: true,
  mergeSimilarColors: true,
  removeAntiAliasing: true,
};

/** "High detail" — a faithful downscale that keeps gradients and shading. */
export const HIGH_DETAIL_PRESET: CleanupSettings = {
  samplingMode: 'average',
  paletteChoice: 'original',
  removeIsolatedPixels: false,
  mergeSimilarColors: false,
  removeAntiAliasing: false,
};

export interface UiChoices extends CleanupSettings {
  gridChoice: GridChoice;
  /** Logical pixel size in source pixels, for `gridChoice === 'pixel'`. */
  pixelSize: number;
  customWidth: number;
  customHeight: number;
  transparentBackground: boolean;
}

/** Translate the UI's choice vocabulary into pipeline options. */
export function buildOptions(c: UiChoices): PixelArtOptions {
  let targetWidth: number | undefined;
  let targetHeight: number | undefined;
  let cellSize: number | undefined;
  let autoDetectGrid = true;

  if (c.gridChoice === 'pixel') {
    autoDetectGrid = false;
    cellSize = clampPixelSize(c.pixelSize);
  } else if (c.gridChoice === 'custom') {
    autoDetectGrid = false;
    targetWidth = c.customWidth;
    targetHeight = c.customHeight;
  } else if (c.gridChoice !== 'auto') {
    autoDetectGrid = false;
    const n = parseInt(c.gridChoice, 10);
    targetWidth = n;
    targetHeight = n;
  }

  let paletteSize: number | undefined;
  if (c.paletteChoice === 'original') paletteSize = NO_QUANTIZE;
  else if (c.paletteChoice !== 'auto') paletteSize = parseInt(c.paletteChoice, 10);

  return {
    autoDetectGrid,
    cellSize,
    targetWidth,
    targetHeight,
    samplingMode: c.samplingMode,
    paletteSize,
    mergeSimilarColors: c.mergeSimilarColors,
    removeAntiAliasing: c.removeAntiAliasing,
    removeIsolatedPixels: c.removeIsolatedPixels,
    transparentBackground: c.transparentBackground,
  };
}

export interface DetectionNotice {
  message: string;
  /** A pixel size worth offering as a one-click "Use N px" action, if any. */
  suggestedPixelSize?: number;
}

/**
 * What the UI should tell the user about a grid it didn't fully trust or had
 * to shrink. `null` when the result is the grid as detected or requested.
 * Shared so both front-ends word it the same way.
 */
export function detectionNotice(
  det: GridDetectionResult,
  source: { width: number; height: number },
): DetectionNotice | null {
  const low = det.confidence === 'low';
  const hint = 'If you can see how many source pixels make one art pixel, set Grid size → Pixel size.';
  if (det.capped) {
    const w = Math.max(1, Math.round(source.width / det.detectedCellSize));
    const h = Math.max(1, Math.round(source.height / det.detectedCellSize));
    const size = `${w} × ${h}`;
    if (low) {
      const px = clampPixelSize(det.detectedCellSize);
      return {
        message: `Low confidence. The best guess, ~${px}px pixels, would give ${size}, so the output was held to ${det.gridWidth} × ${det.gridHeight} — likely too coarse. ${hint}`,
        suggestedPixelSize: px,
      };
    }
    return {
      message: `${size} exceeds the ${MAX_OUTPUT_SIZE}px output limit, so the image was resampled to ${det.gridWidth} × ${det.gridHeight}.`,
    };
  }
  if (low) return { message: `Low confidence — this may not be the image's real pixel grid. ${hint}` };
  return null;
}
