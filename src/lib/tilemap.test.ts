import { describe, expect, it } from 'vitest';
import type { PixelGrid } from '../types';
import { buildTileset, cellPixels, flipTile, gidOf, propagateTileEdit, suggestTileSize, tiledMap, tilesetImage, twinsOf } from './tilemap';

const S = { tw: 4, th: 4 };
const blank = (w: number, h: number): PixelGrid => Array.from({ length: h }, () => Array<string | null>(w).fill(null));
/** A 4×4 tile with a diagonal-ish mark (asymmetric, so flips differ). */
const TILE: PixelGrid = [
  ['#aa0000', '#aa0000', null, null],
  ['#aa0000', null, null, null],
  [null, null, null, '#00aa00'],
  [null, null, null, null],
];
const put = (g: PixelGrid, cx: number, cy: number, t: PixelGrid) => {
  t.forEach((row, y) => row.forEach((c, x) => { g[cy * 4 + y][cx * 4 + x] = c; }));
  return g;
};

describe('building a tileset', () => {
  it('finds distinct tiles, reuses flipped copies, and maps every cell', () => {
    const g = blank(12, 8);
    put(g, 0, 0, TILE);
    put(g, 1, 0, TILE);
    put(g, 2, 0, flipTile(TILE, true, false));
    put(g, 0, 1, flipTile(TILE, true, true));
    const set = buildTileset([g], S);
    expect(set.cols).toBe(3);
    expect(set.rows).toBe(2);
    expect(set.tiles).toHaveLength(2); // empty + one
    expect(set.uses).toEqual([2, 4]);
    expect(set.maps[0][0].map((r) => [r.tile, r.flipX, r.flipY])).toEqual([[1, false, false], [1, false, false], [1, true, false]]);
    expect(set.maps[0][1][0]).toEqual({ tile: 1, flipX: true, flipY: true });
    expect(set.maps[0][1][1].tile).toBe(0);
  });

  it('keeps flipped copies apart when flips are off', () => {
    const g = put(put(blank(8, 4), 0, 0, TILE), 1, 0, flipTile(TILE, true, false));
    expect(buildTileset([g], S, false).tiles).toHaveLength(3);
  });

  it('shares one tileset across layers, and reads past the edge as empty', () => {
    const a = put(blank(6, 4), 0, 0, TILE);
    const b = put(blank(6, 4), 0, 0, TILE);
    b[0][5] = '#123456';
    const set = buildTileset([a, b], S);
    expect(set.cols).toBe(2);
    expect(set.tiles).toHaveLength(3);
    expect(set.maps[1][0][1].tile).toBe(2);
    expect(cellPixels(b, 1, 0, S)[0]).toEqual([null, '#123456', null, null]);
  });
});

describe('auto tile editing', () => {
  it('an edit to one copy reaches every copy, flipped to match', () => {
    const base = blank(12, 4);
    put(base, 0, 0, TILE);
    put(base, 1, 0, TILE);
    put(base, 2, 0, flipTile(TILE, true, false));
    const next = base.map((r) => [...r]);
    next[3][0] = '#0000ff'; // bottom-left pixel of cell 0
    const out = propagateTileEdit(base, next, S);
    expect(out[3][4]).toBe('#0000ff'); // same spot in the plain copy
    expect(out[3][11]).toBe('#0000ff'); // mirrored spot in the flipped copy
    expect(out[3][8]).toBeNull();
    expect(twinsOf(out, S, 0, 0)).toEqual([[0, 0], [1, 0], [2, 0]]);
  });

  it('drawing on empty ground stays where it is drawn', () => {
    const base = blank(8, 4);
    const next = base.map((r) => [...r]);
    next[0][0] = '#ffffff';
    const out = propagateTileEdit(base, next, S);
    expect(out[0][4]).toBeNull();
    expect(twinsOf(base, S, 0, 0)).toEqual([]);
  });

  it('without edits returns the same grid', () => {
    const g = put(blank(8, 4), 0, 0, TILE);
    expect(propagateTileEdit(g, g, S)).toBe(g);
  });
});

describe('tile size and export', () => {
  it('guesses the size real tile art repeats at', () => {
    // 64×32 map of 16×16 tiles: a patterned tile and a plain one, in a pattern.
    const t16 = blank(16, 16).map((r, y) => r.map((_, x) => ((x * 7 + y * 3) % 5 === 0 ? '#335577' : '#88aa44')));
    const t16b = blank(16, 16).map((r) => r.map(() => '#221100'));
    const g = blank(64, 32);
    for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 4; cx++) {
      const t = (cx + cy) % 2 ? t16b : t16;
      t.forEach((row, y) => row.forEach((c, x) => { g[cy * 16 + y][cx * 16 + x] = c; }));
    }
    expect(suggestTileSize(g)).toBe(16);
    expect(suggestTileSize(blank(32, 32))).toBe(16);
  });

  it('packs the tileset and writes a Tiled map with flip bits', () => {
    const g = put(put(blank(8, 8), 0, 0, TILE), 1, 1, flipTile(TILE, true, true));
    const set = buildTileset([g], S);
    const img = tilesetImage(set, S);
    expect([img.w, img.h, img.columns]).toEqual([4, 4, 1]);
    expect(img.pixels).toEqual(TILE);
    expect(gidOf({ tile: 1, flipX: true, flipY: true })).toBe(0xc0000001);
    const map = tiledMap(set, S, ['ground'], { name: 'level-tiles.png', ...img }) as {
      width: number; layers: { name: string; data: number[] }[]; tilesets: { image: string; tilecount: number; columns: number }[];
    };
    expect(map.width).toBe(2);
    expect(map.layers[0]).toMatchObject({ name: 'ground', data: [1, 0, 0, 0xc0000001] });
    expect(map.tilesets[0]).toMatchObject({ image: 'level-tiles.png', tilecount: 1, columns: 1 });
  });
});
