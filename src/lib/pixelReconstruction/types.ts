// Sindri Pixel — AI pixel-art reconstruction: shared types.
//
// This pipeline takes an AI-generated "pixel art" raster (typically a large
// image like 1024×1024 that only *looks* pixelated, with an inconsistent
// implied grid) and reconstructs a true low-resolution sprite with a clean
// palette. It is fully deterministic — no ML.

/**
 * A raw RGBA raster. Structurally compatible with the browser `ImageData`
 * type, so callers can pass a real `ImageData` straight in, while the core
 * library stays free of any DOM dependency (and therefore unit-testable in a
 * plain Node/vitest environment where `ImageData` is not defined).
 */
export interface RGBAImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface GridDetectionResult {
  /** Estimated size of one logical pixel, in source-image pixels (axis average). */
  cellSize: number;
  gridWidth: number;
  gridHeight: number;
  confidence: 'high' | 'medium' | 'low';
  /** Per-axis cell size and grid-line offset (phase) for aligned resampling. */
  cellWidth: number;
  cellHeight: number;
  offsetX: number;
  offsetY: number;
}

/**
 * How each logical cell is reduced to a single output pixel.
 *  - `mode`    : most-common color in the cell → flat, clean pixel-art blocks
 *                (resistant to anti-aliased edges). The default.
 *  - `average` : alpha-weighted mean of the cell → a detail-preserving
 *                downscale that keeps gradients, shading, and soft edges.
 */
export type SamplingMode = 'mode' | 'average';

export interface PixelArtOptions {
  /** Explicit output width. Used when `autoDetectGrid` is false. */
  targetWidth?: number;
  /** Explicit output height. Used when `autoDetectGrid` is false. */
  targetHeight?: number;
  /** When true, ignore target dimensions and detect the grid automatically. */
  autoDetectGrid: boolean;
  /** Per-cell reduction strategy. Defaults to `mode` when omitted. */
  samplingMode?: SamplingMode;
  /** Target palette size. `undefined` (or 0) means "auto". */
  paletteSize?: number;
  mergeSimilarColors: boolean;
  removeAntiAliasing: boolean;
  removeIsolatedPixels: boolean;
  /**
   * When true, cells whose representative pixel is mostly transparent become
   * fully transparent instead of adopting a stray semi-transparent color.
   */
  transparentBackground: boolean;
}

export const DEFAULT_OPTIONS: PixelArtOptions = {
  autoDetectGrid: true,
  samplingMode: 'mode',
  mergeSimilarColors: true,
  removeAntiAliasing: true,
  removeIsolatedPixels: true,
  transparentBackground: true,
};

/** Upper bound on an output dimension — matches the editor's canvas limit. */
export const MAX_OUTPUT_SIZE = 512;

/** Candidate range for the implied cell size, in source pixels. */
export const MIN_CELL_SIZE = 2;
export const MAX_CELL_SIZE = 64;
