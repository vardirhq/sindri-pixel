import { describe, expect, test } from 'vitest';
import { sampleCells } from './cellSampling';
import { createImage, pixelAt, setPixel } from './color';
import type { RGBA, RGBAImage } from './types';

function fill(img: RGBAImage, c: RGBA): void {
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) setPixel(img, x, y, c);
}
function box(img: RGBAImage, x0: number, y0: number, x1: number, y1: number, c: RGBA): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setPixel(img, x, y, c);
}

const wholeCell = (s: RGBAImage) =>
  sampleCells(s, 1, 1, false, { cellWidth: s.width, cellHeight: s.height, offsetX: 0, offsetY: 0 });

describe('center-weighted mode sampling', () => {
  test('a uniform cell is returned unchanged (weighting is a no-op)', () => {
    const img = createImage(9, 9);
    fill(img, { r: 33, g: 120, b: 210, a: 255 });
    expect(pixelAt(wholeCell(img), 0, 0)).toEqual({ r: 33, g: 120, b: 210, a: 255 });
  });

  test('a central detail outvotes a larger peripheral colour', () => {
    // 11×11 cell: blue border (72 px) around a red 7×7 core (49 px). A plain
    // pixel count picks blue (the 60% majority); center-weighting picks red,
    // because the cell's logical pixel lives at its centre.
    const img = createImage(11, 11);
    fill(img, { r: 40, g: 80, b: 200, a: 255 }); // blue majority
    box(img, 2, 2, 8, 8, { r: 200, g: 40, b: 40, a: 255 }); // red central 7×7
    const c = pixelAt(wholeCell(img), 0, 0);
    expect(c.r).toBeGreaterThan(150); // red channel dominates → central colour won
    expect(c.b).toBeLessThan(100);
  });

  test('a thin off-centre boundary sliver cannot steal the cell', () => {
    // Cell is mostly grey with a one-column dark sliver on the right edge — the
    // kind of bleed a slightly-misaligned grid line leaves behind. The grey
    // centre must survive.
    const img = createImage(10, 10);
    fill(img, { r: 190, g: 185, b: 170, a: 255 });
    box(img, 9, 0, 9, 9, { r: 20, g: 20, b: 20, a: 255 });
    const c = pixelAt(wholeCell(img), 0, 0);
    expect(c.r).toBeGreaterThan(150);
  });
});
