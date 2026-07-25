// Shared UI vocabulary for the reconstruction pipeline.
//
// Both front-ends — the editor's "Import AI Art" dialog and the standalone
// web downscaler — expose the same knobs. Keeping the choice types, presets
// and the choice → PixelArtOptions mapping here stops the two from drifting.

import type { PixelArtOptions, SamplingMode } from './types';

export type GridChoice = 'auto' | '16' | '32' | '48' | '64' | '128' | 'custom';
export type PaletteChoice = 'auto' | '8' | '16' | '32' | '64' | 'original';

export const GRID_PRESETS: { value: GridChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
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
  customWidth: number;
  customHeight: number;
  transparentBackground: boolean;
}

/** Translate the UI's choice vocabulary into pipeline options. */
export function buildOptions(c: UiChoices): PixelArtOptions {
  let targetWidth: number | undefined;
  let targetHeight: number | undefined;
  let autoDetectGrid = true;

  if (c.gridChoice === 'custom') {
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
