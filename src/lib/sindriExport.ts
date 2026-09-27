// Sindri Pixel — export to the Sindri engine (sindri2).
//
// Sindri keeps art as a texture plus a sheet beside it (`textures/x.png` is
// sliced by `textures/x.sheet.json`, which names its cells), and places it
// with a prefab (`prefabs/x.prefab.json`): an entity whose components point
// at those names. So one export is three files:
//
// - a sprite: its frames packed into the texture, named by animation tag
//   (`run-0`, `run-1`…), and a prefab with `sindri.sprite` and, when there is
//   more than one frame, `sindri.animation.sprite` with one clip per tag;
// - a tilemap: its tiles packed into the texture and a prefab with one
//   `sindri.tilemap` per tilemap layer. Sindri's tilemap cells can't flip, so
//   a tile used flipped is baked as a sprite of its own (`tile-3-h`).
//
// Everything here is pure; the app composites pixels and writes the files.

import type { PixelGrid } from '../types';
import { tagSequence, type FrameTag } from './tags';
import { buildTileset, flipTile, type TileSize } from './tilemap';

export const SINDRI_SHEET_VERSION = 1;
export const SINDRI_PREFAB_VERSION = 1;

/** A Sindri asset name (file stem and entity id): lowercase, digits, - and _. */
export function sindriName(name: string, fallback = 'sprite'): string {
  const slug = name
    .toLowerCase()
    .replace(/\.spr$/, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 64)
    .replace(/[-_]+$/, '');
  return slug || fallback;
}

/** Make each name unique by numbering repeats (`idle`, `idle-2`). */
function unique(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const k = (seen.get(n) ?? 0) + 1;
    seen.set(n, k);
    return k === 1 ? n : `${n}-${k}`;
  });
}

export interface SindriExport {
  /** File stem: textures/<name>.png, textures/<name>.sheet.json, prefabs/<name>.prefab.json. */
  name: string;
  image: { w: number; h: number; pixels: PixelGrid };
  sheet: object;
  prefab: object;
}

/** Pack equal-size cells into an image `columns` wide. */
function pack(cells: PixelGrid[], cw: number, ch: number, maxColumns = 8) {
  const columns = Math.max(1, Math.min(maxColumns, cells.length));
  const rows = Math.max(1, Math.ceil(cells.length / columns));
  const pixels: PixelGrid = Array.from({ length: rows * ch }, () => Array<string | null>(columns * cw).fill(null));
  cells.forEach((cell, i) => {
    const ox = (i % columns) * cw;
    const oy = Math.floor(i / columns) * ch;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) pixels[oy + y][ox + x] = cell[y]?.[x] ?? null;
  });
  return { columns, rows, image: { w: columns * cw, h: rows * ch, pixels } };
}

const sheetDoc = (columns: number, rows: number, names: string[]) => ({
  format_version: SINDRI_SHEET_VERSION,
  anchor: 'center',
  grid: { columns, rows, names },
});

interface PrefabEntity {
  id: string;
  name: string;
  parent?: string;
  scale: [number, number];
  components: Record<string, unknown>;
}

const round = (v: number, places = 4) => Number(v.toFixed(places));

function prefabDoc(title: string, entities: PrefabEntity[], source: Record<string, unknown>) {
  return {
    format_version: SINDRI_PREFAB_VERSION,
    metadata: { name: title },
    entities: entities.map((e) => ({
      id: e.id,
      name: e.name,
      ...(e.parent ? { parent: e.parent } : {}),
      transform_3d: {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [round(e.scale[0]), round(e.scale[1]), 1],
      },
      components: e.components,
      // Where it came from, carried through untouched by the engine (the
      // same place Sindri's own isometric baker records its recipe).
      ...(e.parent ? {} : { editor: { 'sindri.pixel': source } }),
    })),
  };
}

export interface SpriteExportInput {
  /** Display name (the file name without .spr is fine). */
  title: string;
  /** Each frame, composited. */
  frames: PixelGrid[];
  w: number;
  h: number;
  /** Per-frame durations in ms. */
  durations: number[];
  tags: FrameTag[];
  /** Pixels per world unit (Sindri's platformer draws 16 px as 1 unit). */
  pixelsPerUnit?: number;
}

/** A sprite, animated by its tags, as a Sindri texture + sheet + prefab. */
export function sindriSprite(input: SpriteExportInput): SindriExport {
  const { frames, w, h, durations, tags } = input;
  const ppu = input.pixelsPerUnit ?? 16;
  const name = sindriName(input.title);
  const byStart = [...tags].sort((a, b) => a.from - b.from);
  // A frame is named for the first tag it belongs to, counted from the tag's
  // start, so clips read as `run-0, run-1…` in the sheet.
  const frameNames = unique(frames.map((_, i) => {
    const tag = byStart.find((t) => i >= t.from && i <= t.to);
    return tag ? `${sindriName(tag.name, 'clip')}-${i - tag.from}` : `frame-${i}`;
  }));
  const packed = pack(frames, w, h);

  const clipOf = (seq: number[]) => ({
    frames: seq.map((i) => frameNames[i]),
    // Sindri clips have one speed; a tag with mixed durations plays at their average.
    seconds_per_frame: round(seq.reduce((sum, i) => sum + (durations[i] ?? 100), 0) / seq.length / 1000, 3),
    looping: true,
  });
  const components: Record<string, unknown> = {};
  let first = frameNames[0];
  if (frames.length > 1) {
    const clips: Record<string, ReturnType<typeof clipOf>> = {};
    const tagNames = unique(tags.map((t) => sindriName(t.name, 'clip')));
    tags.forEach((t, k) => { clips[tagNames[k]] = clipOf(tagSequence(t).filter((i) => i < frames.length)); });
    if (!tags.length) clips.default = clipOf(frames.map((_, i) => i));
    const playing = Object.keys(clips)[0];
    first = clips[playing].frames[0];
    components['sindri.sprite'] = { texture: `textures/${name}.png#${first}` };
    components['sindri.animation.sprite'] = { clips, playing, speed: 1 };
  } else {
    components['sindri.sprite'] = { texture: `textures/${name}.png#${first}` };
  }
  return {
    name,
    image: packed.image,
    sheet: sheetDoc(packed.columns, packed.rows, frameNames),
    prefab: prefabDoc(input.title, [{ id: name, name: input.title, scale: [w / ppu, h / ppu], components }], {
      kind: 'sprite', frame: [w, h], pixels_per_unit: ppu,
    }),
  };
}

export interface TilemapExportInput {
  title: string;
  /** The tilemap layers, bottom first. */
  layers: { name: string; pixels: PixelGrid }[];
  size: TileSize;
  /** Pixels per world unit; by default one tile is one unit. */
  pixelsPerUnit?: number;
}

/**
 * Tilemap layers as a Sindri texture + sheet + prefab with one
 * `sindri.tilemap` entity per layer, sharing one texture. Flipped uses of a
 * tile are baked as sprites of their own, because Sindri's cells can't flip.
 */
export function sindriTilemap(input: TilemapExportInput): SindriExport {
  const { size, layers } = input;
  const ppu = input.pixelsPerUnit ?? size.tw;
  const name = sindriName(input.title, 'tilemap');
  const set = buildTileset(layers.map((l) => l.pixels), size);

  // Every (tile, flip) actually used becomes one sprite, in order of use.
  const sprites: PixelGrid[] = [];
  const names: string[] = [];
  const spriteOf = new Map<string, number>();
  const spriteFor = (tile: number, fx: boolean, fy: boolean): number => {
    const key = `${tile}:${fx ? 1 : 0}${fy ? 1 : 0}`;
    let i = spriteOf.get(key);
    if (i === undefined) {
      i = sprites.length;
      spriteOf.set(key, i);
      sprites.push(flipTile(set.tiles[tile], fx, fy));
      names.push(`tile-${tile}${fx || fy ? `-${fx ? 'h' : ''}${fy ? 'v' : ''}` : ''}`);
    }
    return i;
  };

  // A prefab has exactly one root: one layer is the root itself; several
  // hang under an empty root named for the map, so they spawn and move as one.
  const several = layers.length > 1;
  const entityIds = unique([...(several ? [name] : []), ...layers.map((l) => (several ? `${name}-${sindriName(l.name, 'layer')}` : name))]).slice(several ? 1 : 0);
  const entities: PrefabEntity[] = layers.map((layer, li) => {
    // Each map's palette is the sprites it uses; its cells index the palette.
    const palette: number[] = [];
    const slot = new Map<number, number>();
    const tiles = set.maps[li].flat().map((ref) => {
      if (!ref.tile) return null;
      const s = spriteFor(ref.tile, ref.flipX, ref.flipY);
      if (!slot.has(s)) { slot.set(s, palette.length); palette.push(s); }
      return slot.get(s)!;
    });
    return {
      id: entityIds[li],
      name: layer.name,
      ...(several ? { parent: name } : {}),
      scale: [1, 1],
      components: {
        'sindri.tilemap': {
          texture: `textures/${name}.png`,
          palette: palette.map((s) => names[s]),
          columns: set.cols,
          rows: set.rows,
          tile_size: [round(size.tw / ppu), round(size.th / ppu)],
          tiles,
          layer: li,
        },
      },
    };
  });

  // Sindri refuses a sheet that names nothing, so an empty map is an error here.
  if (!sprites.length) throw new Error('The tilemap has no tiles yet — draw some first.');
  const packed = pack(sprites, size.tw, size.th);
  return {
    name,
    image: packed.image,
    sheet: sheetDoc(packed.columns, packed.rows, names),
    prefab: prefabDoc(input.title, several ? [{ id: name, name: input.title, scale: [1, 1], components: {} }, ...entities] : entities, { kind: 'tilemap', tile: [size.tw, size.th], pixels_per_unit: ppu }),
  };
}
