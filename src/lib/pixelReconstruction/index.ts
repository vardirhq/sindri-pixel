// Sindri Pixel — AI pixel-art reconstruction pipeline.
// Public entry point: reconstructPixelArt() plus the helpers the import UI
// needs to turn a result into an editor document.

export { reconstructPixelArt, imageToPackedPixels, extractPalette } from './reconstruct';
export type { ReconstructionResult } from './reconstruct';
export { detectGrid, gridFromTarget } from './gridDetection';
export { sampleCells } from './cellSampling';
export { quantize, countDistinctColors, autoPaletteSize } from './paletteQuantize';
export { removeIsolatedPixels, mergeSimilarColors } from './cleanup';
export { DEFAULT_OPTIONS, MAX_OUTPUT_SIZE } from './types';
export type {
  PixelArtOptions,
  GridDetectionResult,
  RGBAImage,
  RGBA,
} from './types';
