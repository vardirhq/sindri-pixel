import { describe, expect, it } from 'vitest';
import type { Frame, PixelGrid } from '../types';
import { added, contentBounds, cropFrames, darkest, dropShadow, outline, padRect } from './effects';

const g = (rows: string[]): PixelGrid => rows.map((r) => [...r].map((c) => (c === '.' ? null : c === 'A' ? '#aa0000' : c === 'o' ? '#000000' : '#555555')));
const show = (p: PixelGrid) => p.map((r) => r.map((c) => (c === null ? '.' : c === '#aa0000' ? 'A' : c === '#000000' ? 'o' : 's')).join(''));
const frame = (pixels: PixelGrid, id = 'f'): Frame => ({ id, duration: 100, layers: [{ id: `${id}l`, name: 'l', visible: true, opacity: 1, pixels }] });

describe('outline', () => {
  const art = g(['.....', '.....', '..A..', '.....', '.....']);
  it('draws around the art, with or without corners', () => {
    expect(show(outline(art, { color: '#000000', mode: 'outside', diagonal: false }))).toEqual(['.....', '..o..', '.oAo.', '..o..', '.....']);
    expect(show(outline(art, { color: '#000000', mode: 'outside', diagonal: true }))).toEqual(['.....', '.ooo.', '.oAo.', '.ooo.', '.....']);
  });
  it('inside mode recolours the art’s own edge', () => {
    const block = g(['AAA', 'AAA', 'AAA']);
    // The canvas edge counts as outside, so every pixel of a canvas-filling block is edge but the middle.
    expect(show(outline(g(['.....', '.AAA.', '.AAA.', '.AAA.', '.....']), { color: '#000000', mode: 'inside', diagonal: false }))).toEqual(['.....', '.ooo.', '.oAo.', '.ooo.', '.....']);
    expect(show(outline(block, { color: '#000000', mode: 'inside', diagonal: false }))).toEqual(['ooo', 'oAo', 'ooo']);
  });
});

describe('drop shadow', () => {
  it('falls behind the art, never over it, and stops at the edge', () => {
    const art = g(['AA..', 'A...', '....']);
    expect(show(dropShadow(art, '#555555', 1, 1))).toEqual(['AA..', 'Ass.', '.s..']);
    expect(show(dropShadow(art, '#555555', 3, 3))).toEqual(['AA..', 'A...', '....']);
  });
  it('can be split onto its own layer', () => {
    const art = g(['A.', '..']);
    expect(show(added(art, dropShadow(art, '#555555', 1, 1)))).toEqual(['..', '.s']);
  });
});

describe('trim and crop', () => {
  it('finds the bounds across frames and layers', () => {
    const a = frame(g(['....', '.A..', '....', '....']), 'a');
    const b = frame(g(['....', '....', '....', '..A.']), 'b');
    expect(contentBounds([a, b])).toEqual({ x: 1, y: 1, w: 2, h: 3 });
    expect(contentBounds([frame(g(['..', '..']))])).toBeNull();
  });
  it('crops every frame to a rect, padding past the edge with empty', () => {
    const a = frame(g(['....', '.A..', '....', '..A.']));
    expect(show(cropFrames([a], { x: 1, y: 1, w: 2, h: 3 })[0].layers[0].pixels)).toEqual(['A.', '..', '.A']);
    expect(show(cropFrames([a], padRect({ x: 0, y: 0, w: 1, h: 1 }, 1))[0].layers[0].pixels)).toEqual(['...', '...', '..A']);
  });
  it('picks the darkest palette colour', () => {
    expect(darkest(['#ffffff', '#1a1c2c', '#5d275d'])).toBe('#1a1c2c');
    expect(darkest([])).toBe('#000000');
  });
});
