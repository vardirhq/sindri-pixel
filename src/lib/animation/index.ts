// Sindri Pixel — animation assembly: anchoring downscaled frames on a shared
// canvas, packing sprite sheets, and encoding GIF / .spr exports. Pure
// TypeScript (no DOM), shared by the web tool and testable in Node.

export { anchorPoint, composeFrame, flipX, layoutFrames, opaqueBounds } from './layout';
export type { Anchor, Bounds, Layout, PlacedFrameInput } from './layout';
export { buildSheet, scaleImage, sheetGrid, sheetJson, toSprProject, MAX_SHEET_PIXELS } from './sheet';
export type { Rect, Sheet, SheetColumns, SheetMeta, SheetOptions } from './sheet';
export { encodeGif } from './gif';
export type { GifOptions } from './gif';
export { planGrids, sharedCellSize } from './sequence';
export type { GridCache, GridPlan, SequenceInput } from './sequence';
