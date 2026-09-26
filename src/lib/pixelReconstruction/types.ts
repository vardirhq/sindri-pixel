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
  /**
   * Per-axis mean cell size and the offset (phase) of the first grid line.
   * Define the grid when `xBounds`/`yBounds` are absent; a summary otherwise.
   */
  cellWidth: number;
  cellHeight: number;
  offsetX: number;
  offsetY: number;
  /**
   * True when the output grid is coarser than the cell size that was detected
   * or requested — either because a low-confidence detection was held to a
   * modest size, or because the grid would exceed `MAX_OUTPUT_SIZE`. Front-ends
   * must surface this rather than present the coarse result as the answer.
   */
  capped: boolean;
  /** Cell size found (or requested) before any cap; equals `cellSize` when not capped. */
  detectedCellSize: number;
  /**
   * Fitted grid-line positions per axis, `[0, …, width]` / `[0, …, height]`:
   * one entry per cell edge, following the art's own (possibly uneven,
   * drifting) pixel edges. When present they define the grid exactly.
   */
  xBounds?: number[];
  yBounds?: number[];
}

/**
 * How each logical cell is reduced to a single output pixel.
 *  - `mode`    : most-common (center-weighted) color in the cell → flat, clean
 *                pixel-art blocks, resistant to anti-aliased edges and to slight
 *                grid misalignment. The default.
 *  - `average` : alpha-weighted mean of the cell → a detail-preserving
 *                downscale that keeps gradients, shading, and soft edges.
 */
export type SamplingMode = 'mode' | 'average';

export interface PixelArtOptions {
  /**
   * Size of one logical pixel in source pixels (e.g. 3). Used when
   * `autoDetectGrid` is false; takes precedence over the target dimensions.
   * The grid is still phase-aligned to the image's edges.
   */
  cellSize?: number;
  /** Explicit output width. Used when `autoDetectGrid` is false. */
  targetWidth?: number;
  /** Explicit output height. Used when `autoDetectGrid` is false. */
  targetHeight?: number;
  /** When true, ignore cell size / target dimensions and detect the grid automatically. */
  autoDetectGrid: boolean;
  /** Per-cell reduction strategy. Defaults to `mode` when omitted. */
  samplingMode?: SamplingMode;
  /** Target palette size. `undefined` (or 0) means "auto". */
  paletteSize?: number;
  mergeSimilarColors: boolean;
  removeAntiAliasing: boolean;
  removeIsolatedPixels: boolean;
  /**
   * When true, a solid backdrop (most of the border one flat color) is made
   * transparent by flood-filling from the edges. Off by default.
   */
  removeBackground?: boolean;
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
