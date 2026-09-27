import { describe, expect, it } from 'vitest';
import type { Frame, PixelGrid } from '../types';
import { colorUsage, readPalette, recolor, writePalette } from './palette';

const frame = (id: string, ...grids: PixelGrid[]): Frame => ({
  id, duration: 100,
  layers: grids.map((pixels, i) => ({ id: `${id}_${i}`, name: `l${i}`, visible: true, opacity: 1, pixels })),
});

describe('recolouring', () => {
  const frames = [
    frame('a', [['#ff0000', null], ['#00ff00', '#FF0000']]),
    frame('b', [['#0000ff', '#0000ff']], [['#ff0000', null]]),
  ];

  it('changes a colour in every frame and layer, and nothing else', () => {
    const out = recolor(frames, '#ff0000', '#123456');
    expect(out[0].layers[0].pixels).toEqual([['#123456', null], ['#00ff00', '#123456']]);
    expect(out[1].layers[0]).toBe(frames[1].layers[0]); // untouched layers are reused
    expect(out[1].layers[1].pixels).toEqual([['#123456', null]]);
    expect(colorUsage(out, '#123456')).toBe(3);
    expect(colorUsage(out, '#ff0000')).toBe(0);
  });

  it('returns the same frames when the colour is unused or unchanged', () => {
    expect(recolor(frames, '#abcdef', '#000000')).toBe(frames);
    expect(recolor(frames, '#ff0000', '#FF0000')).toBe(frames);
  });
});

describe('palette files', () => {
  const colors = ['#1a1c2c', '#5d275d', '#b13e53', '#ffcd75'];

  it('round-trips every format', () => {
    for (const format of ['gpl', 'hex', 'pal'] as const) {
      expect(readPalette(writePalette(colors, format, 'test'))).toEqual(colors);
    }
  });

  it('reads files as other tools write them', () => {
    const gimp = 'GIMP Palette\nName: Sweetie 16\nColumns: 4\n#\n 26  28  44\tUntitled\n 93  39  93\t5d275d\n';
    expect(readPalette(gimp)).toEqual(['#1a1c2c', '#5d275d']);
    expect(readPalette('JASC-PAL\r\n0100\r\n2\r\n177 62 83\r\n255 205 117\r\n')).toEqual(['#b13e53', '#ffcd75']);
    // Lospec .hex, with a BOM, blank lines, a duplicate and an alpha channel.
    expect(readPalette('﻿1a1c2c\n\nFFCD75ff\n1A1C2C\n')).toEqual(['#1a1c2c', '#ffcd75']);
  });

  it('rejects a file with no colours', () => {
    expect(() => readPalette('hello\nworld')).toThrow(/No colours/);
  });
});
