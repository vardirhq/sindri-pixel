// Sindri Pixel — AI pixel-art reconstruction pipeline.
// Public entry point: reconstructPixelArt() plus the helpers the import UI
// needs to turn a result into an editor document.

export { reconstructPixelArt, reconstructSequence, resolveGrid, imageToPackedPixels, extractPalette } from './reconstruct';
export type { ReconstructionResult, SequenceFrame } from './reconstruct';
export { detectGrid, gridFromTarget, gridFromCellSize } from './gridDetection';
export { sampleCells, sampleCellsAverage } from './cellSampling';
export { quantize, countDistinctColors, autoPaletteSize } from './paletteQuantize';
export { removeIsolatedPixels, mergeSimilarColors, removeSolidBackground } from './cleanup';
export { DEFAULT_OPTIONS, MAX_OUTPUT_SIZE } from './types';
export {
  GRID_PRESETS,
  PALETTE_PRESETS,
  CLEAN_SPRITE_PRESET,
  HIGH_DETAIL_PRESET,
  MIN_PIXEL_SIZE,
  MAX_PIXEL_SIZE,
  buildOptions,
  clampPixelSize,
  detectionNotice,
} from './uiOptions';
export type { GridChoice, PaletteChoice, CleanupSettings, UiChoices, DetectionNotice } from './uiOptions';
export type {
  PixelArtOptions,
  SamplingMode,
  GridDetectionResult,
  RGBAImage,
  RGBA,
} from './types';
