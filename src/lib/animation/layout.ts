// Sindri Pixel — placing downscaled frames on a shared animation canvas.
//
// AI renders each pose independently, so the character lands in a different
// spot (and at a slightly different size) in every frame. Before anything can
// play back smoothly the frames need a common anchor: for a character, the
// feet. The anchor is measured from the sprite itself — its opaque pixels —
// so it works on transparent-background sprites with no manual setup; per-
// frame offsets then nudge from there.

import type { RGBAImage } from '../pixelReconstruction/types';

/** Where each frame's anchor point sits on its sprite. */
export type Anchor = 'feet' | 'center' | 'none';

/** Half-open pixel rectangle [x0, x1) × [y0, y1). */
export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PlacedFrameInput {
  sprite: RGBAImage;
  offsetX: number;
  offsetY: number;
  flipX: boolean;
}

export interface Layout {
  width: number;
  height: number;
  /** Top-left of each (flipped) sprite on the canvas. */
  positions: { x: number; y: number }[];
  /** Where the shared anchor point lands (a frame with zero offset puts its
   *  anchor here) — the ground line for `feet`, for drawing guides. */
  origin: { x: number; y: number };
}

const OPAQUE = 8;

/** Bounding box of the opaque pixels, or null for an empty sprite. */
export function opaqueBounds(image: RGBAImage): Bounds | null {
  const { data, width, height } = image;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < OPAQUE) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** Mirror an image left–right. */
export function flipX(image: RGBAImage): RGBAImage {
  const { data, width, height } = image;
  const out: RGBAImage = { data: new Uint8ClampedArray(data.length), width, height };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      out.data.set(data.subarray(from, from + 4), (y * width + (width - 1 - x)) * 4);
    }
  }
  return out;
}

/**
 * The anchor point of a sprite, in its own pixel coordinates.
 *  - `feet`: horizontally the opaque pixels' center of mass (steadier than the
 *    bounding-box middle, which lurches whenever an arm swings out), and
 *    vertically the bottom edge — so every frame stands on the same ground.
 *  - `center`: the center of mass on both axes.
 *  - `none`: the sprite's top-left corner (frames stay where they were drawn).
 */
export function anchorPoint(image: RGBAImage, anchor: Anchor): { x: number; y: number } {
  if (anchor === 'none') return { x: 0, y: 0 };
  const bounds = opaqueBounds(image);
  if (!bounds) return { x: Math.floor(image.width / 2), y: anchor === 'feet' ? image.height : Math.floor(image.height / 2) };
  const { data, width } = image;
  let mass = 0;
  let mx = 0;
  let my = 0;
  for (let y = bounds.y0; y < bounds.y1; y++) {
    for (let x = bounds.x0; x < bounds.x1; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a < OPAQUE) continue;
      mass += a;
      mx += (x + 0.5) * a;
      my += (y + 0.5) * a;
    }
  }
  const cx = Math.floor(mx / mass);
  return anchor === 'feet' ? { x: cx, y: bounds.y1 } : { x: cx, y: Math.floor(my / mass) };
}

/**
 * Lay frames out on one canvas: each frame's anchor lands on a shared point,
 * shifted by its own offset. With no `fixed` size the canvas is the tightest
 * box around every frame's opaque pixels plus `margin`; with one, the shared
 * point sits bottom-center (`feet`), dead center (`center`) or top-left
 * (`none`) of that canvas.
 */
export function layoutFrames(
  frames: PlacedFrameInput[],
  anchor: Anchor,
  margin = 1,
  fixed?: { width: number; height: number },
): Layout {
  const rel = frames.map((f) => {
    const sprite = f.flipX ? flipX(f.sprite) : f.sprite;
    const a = anchorPoint(sprite, anchor);
    return { x: f.offsetX - a.x, y: f.offsetY - a.y, bounds: opaqueBounds(sprite) };
  });

  if (fixed) {
    const origin = anchor === 'feet'
      ? { x: Math.floor(fixed.width / 2), y: fixed.height - margin }
      : anchor === 'center'
        ? { x: Math.floor(fixed.width / 2), y: Math.floor(fixed.height / 2) }
        : { x: margin, y: margin };
    return {
      width: fixed.width,
      height: fixed.height,
      positions: rel.map((r) => ({ x: origin.x + r.x, y: origin.y + r.y })),
      origin,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rel) {
    if (!r.bounds) continue;
    minX = Math.min(minX, r.x + r.bounds.x0);
    minY = Math.min(minY, r.y + r.bounds.y0);
    maxX = Math.max(maxX, r.x + r.bounds.x1);
    maxY = Math.max(maxY, r.y + r.bounds.y1);
  }
  if (minX === Infinity) return { width: 1, height: 1, positions: rel.map(() => ({ x: 0, y: 0 })), origin: { x: 0, y: 0 } };
  return {
    width: maxX - minX + margin * 2,
    height: maxY - minY + margin * 2,
    positions: rel.map((r) => ({ x: r.x - minX + margin, y: r.y - minY + margin })),
    origin: { x: margin - minX, y: margin - minY },
  };
}

/** Draw one frame's sprite onto a transparent `width × height` canvas. */
export function composeFrame(frame: PlacedFrameInput, position: { x: number; y: number }, width: number, height: number): RGBAImage {
  const sprite = frame.flipX ? flipX(frame.sprite) : frame.sprite;
  const out: RGBAImage = { data: new Uint8ClampedArray(width * height * 4), width, height };
  for (let y = 0; y < sprite.height; y++) {
    const ty = y + position.y;
    if (ty < 0 || ty >= height) continue;
    for (let x = 0; x < sprite.width; x++) {
      const tx = x + position.x;
      if (tx < 0 || tx >= width) continue;
      const from = (y * sprite.width + x) * 4;
      if (sprite.data[from + 3] < OPAQUE) continue;
      out.data.set(sprite.data.subarray(from, from + 4), (ty * width + tx) * 4);
    }
  }
  return out;
}
