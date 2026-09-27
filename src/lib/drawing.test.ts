import { describe, expect, it } from 'vitest';
import { makeShader, pixelPerfect, type Point } from './drawing';

describe('pixel-perfect strokes', () => {
  it('drops the corner of every L-step', () => {
    // A mouse stroke from (0,0) to (3,3) stepping right-then-down each time.
    const raw: Point[] = [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2], [3, 3]];
    expect(pixelPerfect(raw)).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]]);
  });

  it('keeps straight runs, and softens a right angle by one pixel', () => {
    const line: Point[] = [[0, 0], [1, 0], [2, 0], [3, 0]];
    expect(pixelPerfect(line)).toEqual(line);
    // Along, then down: the corner pixel goes and the turn is diagonal
    // (as in Aseprite's pixel-perfect mode).
    const corner: Point[] = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]];
    expect(pixelPerfect(corner)).toEqual([[0, 0], [1, 0], [2, 1], [2, 2]]);
  });

  it('ignores repeated points', () => {
    expect(pixelPerfect([[4, 4], [4, 4], [5, 4]])).toEqual([[4, 4], [5, 4]]);
  });
});

describe('shading ramps', () => {
  // Two ramps with a similar hue (skin and orange hair), a blue ramp, greys.
  const SKIN = ['#8a5a44', '#c8876a', '#f0b89a'];
  const HAIR = ['#8c2a08', '#d0520e', '#ff8a2a'];
  const BLUE = ['#1b2a6b', '#2f4fbf', '#6f8cf0'];
  const GREY = ['#303030', '#808080', '#d0d0d0'];
  const shade = makeShader([...HAIR, ...GREY, ...SKIN, ...BLUE]);

  it('steps along a ramp in both directions', () => {
    expect(shade(BLUE[1], 'lighten')).toBe(BLUE[2]);
    expect(shade(BLUE[1], 'darken')).toBe(BLUE[0]);
    expect(shade(GREY[1], 'darken')).toBe(GREY[0]);
  });

  it('stays on its own ramp when another shares the hue', () => {
    expect(shade(SKIN[1], 'lighten')).toBe(SKIN[2]);
    expect(shade(SKIN[1], 'darken')).toBe(SKIN[0]);
    expect(shade(HAIR[1], 'darken')).toBe(HAIR[0]);
  });

  it('stops at the end of a ramp', () => {
    expect(shade(BLUE[2], 'lighten')).toBe(BLUE[2]);
    expect(shade(GREY[0], 'darken')).toBe(GREY[0]);
  });

  it('never turns a grey into a colour, or a colour into a grey', () => {
    expect(GREY).toContain(shade(GREY[2], 'darken'));
    expect(BLUE).toContain(shade(BLUE[2], 'darken'));
  });
});

describe('custom brushes', () => {
  const layer = [
    [null, null, null, null],
    [null, '#aa0000', null, null],
    [null, '#00aa00', '#0000aa', null],
    [null, null, null, null],
  ];

  it('captures the selected pixels, trimmed to what is painted', async () => {
    const { brushFromSelection } = await import('./drawing');
    expect(brushFromSelection(layer, { x0: 0, y0: 0, x1: 3, y1: 3 })).toEqual([
      ['#aa0000', null],
      ['#00aa00', '#0000aa'],
    ]);
  });

  it('respects an irregular selection and returns null when empty', async () => {
    const { brushFromSelection } = await import('./drawing');
    expect(brushFromSelection(layer, { x0: 1, y0: 1, x1: 2, y1: 2, pixels: [[1, 1], [2, 2]] })).toEqual([
      ['#aa0000', null],
      [null, '#0000aa'],
    ]);
    expect(brushFromSelection(layer, { x0: 3, y0: 0, x1: 3, y1: 3 })).toBeNull();
  });
});
