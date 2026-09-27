import { describe, expect, it } from 'vitest';
import type { PixelGrid } from '../types';
import { sindriName, sindriSprite, sindriTilemap } from './sindriExport';
import { flipTile } from './tilemap';

const blank = (w: number, h: number): PixelGrid => Array.from({ length: h }, () => Array<string | null>(w).fill(null));
const dot = (w: number, h: number, x: number, y: number, c = '#ff0000') => { const g = blank(w, h); g[y][x] = c; return g; };
type Prefab = { format_version: number; entities: { id: string; transform_3d: { scale: number[] }; components: Record<string, any>; editor: Record<string, unknown> }[] };
type Sheet = { format_version: number; anchor: string; grid: { columns: number; rows: number; names: string[] } };

describe('Sindri names', () => {
  it('turns titles into asset names', () => {
    expect(sindriName('Drone Idle.spr')).toBe('drone-idle');
    expect(sindriName('  ÆØÅ!! ')).toBe('sprite');
    expect(sindriName('Hero_2')).toBe('hero_2');
    expect(sindriName('x'.repeat(80))).toHaveLength(64);
  });
});

describe('sprite export', () => {
  const frames = [0, 1, 2, 3, 4].map((i) => dot(4, 4, i % 4, 0));
  const tags = [
    { id: 'a', name: 'Idle', from: 0, to: 1, direction: 'forward' as const },
    { id: 'b', name: 'Run', from: 2, to: 4, direction: 'pingpong' as const },
  ];

  it('names frames by tag and makes one clip per tag', () => {
    const out = sindriSprite({ title: 'Hero.spr', frames, w: 4, h: 4, durations: [450, 450, 90, 90, 120], tags });
    const sheet = out.sheet as Sheet;
    expect(out.name).toBe('hero');
    expect(sheet).toEqual({ format_version: 1, anchor: 'center', grid: { columns: 5, rows: 1, names: ['idle-0', 'idle-1', 'run-0', 'run-1', 'run-2'] } });
    expect([out.image.w, out.image.h]).toEqual([20, 4]);
    expect(out.image.pixels[0][4 + 1]).toBe('#ff0000');
    const e = (out.prefab as Prefab).entities[0];
    expect(e.id).toBe('hero');
    expect(e.transform_3d.scale).toEqual([0.25, 0.25, 1]);
    expect(e.components['sindri.sprite']).toEqual({ texture: 'textures/hero.png#idle-0' });
    expect(e.components['sindri.animation.sprite']).toEqual({
      clips: {
        idle: { frames: ['idle-0', 'idle-1'], seconds_per_frame: 0.45, looping: true },
        run: { frames: ['run-0', 'run-1', 'run-2', 'run-1'], seconds_per_frame: 0.098, looping: true },
      },
      playing: 'idle',
      speed: 1,
    });
    expect(e.editor['sindri.pixel']).toMatchObject({ kind: 'sprite', pixels_per_unit: 16 });
  });

  it('plays untagged frames as one clip, and a single frame is a still sprite', () => {
    const anim = sindriSprite({ title: 'coin', frames: frames.slice(0, 2), w: 4, h: 4, durations: [100, 100], tags: [] });
    const comp = (anim.prefab as Prefab).entities[0].components['sindri.animation.sprite'];
    expect(comp.clips.default.frames).toEqual(['frame-0', 'frame-1']);
    const still = sindriSprite({ title: 'rock', frames: frames.slice(0, 1), w: 4, h: 4, durations: [100], tags: [], pixelsPerUnit: 4 });
    const e = (still.prefab as Prefab).entities[0];
    expect(Object.keys(e.components)).toEqual(['sindri.sprite']);
    expect(e.transform_3d.scale).toEqual([1, 1, 1]);
  });

  it('packs many frames into rows of eight', () => {
    const many = Array.from({ length: 10 }, () => blank(2, 2));
    const out = sindriSprite({ title: 'fx', frames: many, w: 2, h: 2, durations: many.map(() => 100), tags: [] });
    expect((out.sheet as Sheet).grid).toMatchObject({ columns: 8, rows: 2 });
    expect([out.image.w, out.image.h]).toEqual([16, 4]);
  });
});

describe('tilemap export', () => {
  const S = { tw: 4, th: 4 };
  const TILE: PixelGrid = [['#aa0000', '#aa0000', null, null], ['#aa0000', null, null, null], [null, null, null, '#00aa00'], [null, null, null, null]];
  const put = (g: PixelGrid, cx: number, cy: number, t: PixelGrid) => { t.forEach((row, y) => row.forEach((c, x) => { g[cy * 4 + y][cx * 4 + x] = c; })); return g; };

  it('bakes flipped tiles and writes a sindri.tilemap per layer', () => {
    const ground = put(put(put(blank(12, 8), 0, 0, TILE), 1, 0, TILE), 2, 1, flipTile(TILE, true, false));
    const deco = put(blank(12, 8), 1, 1, flipTile(TILE, true, false));
    const out = sindriTilemap({ title: 'Level 1', layers: [{ name: 'Ground', pixels: ground }, { name: 'Deco', pixels: deco }], size: S });
    const sheet = out.sheet as Sheet;
    expect(out.name).toBe('level-1');
    expect(sheet.grid.names).toEqual(['tile-1', 'tile-1-h']);
    expect(out.image.pixels.slice(0, 4).map((r) => r.slice(4, 8))).toEqual(flipTile(TILE, true, false));
    const [root, g, d] = (out.prefab as Prefab).entities as (Prefab['entities'][number] & { parent?: string })[];
    // One root (the prefab rule), the layers under it.
    expect([root.id, g.id, d.id]).toEqual(['level-1', 'level-1-ground', 'level-1-deco']);
    expect([root.parent, g.parent, d.parent]).toEqual([undefined, 'level-1', 'level-1']);
    expect(root.components).toEqual({});
    expect(root.editor['sindri.pixel']).toMatchObject({ kind: 'tilemap' });
    expect(g.components['sindri.tilemap']).toEqual({
      texture: 'textures/level-1.png',
      palette: ['tile-1', 'tile-1-h'],
      columns: 3,
      rows: 2,
      tile_size: [1, 1],
      tiles: [0, 0, null, null, null, 1],
      layer: 0,
    });
    // The second map's palette is only what it uses.
    expect(d.components['sindri.tilemap']).toMatchObject({ palette: ['tile-1-h'], tiles: [null, null, null, null, 0, null], layer: 1 });
  });

  it('makes a single layer the root itself', () => {
    const out = sindriTilemap({ title: 'floor', layers: [{ name: 'Ground', pixels: put(blank(8, 4), 0, 0, TILE) }], size: S, pixelsPerUnit: 16 });
    const [only] = (out.prefab as Prefab).entities;
    expect(only.id).toBe('floor');
    expect(only.components['sindri.tilemap'].tile_size).toEqual([0.25, 0.25]);
  });

  it('refuses a map with nothing on it', () => {
    expect(() => sindriTilemap({ title: 'x', layers: [{ name: 'a', pixels: blank(8, 8) }], size: S })).toThrow(/no tiles/);
  });
});
