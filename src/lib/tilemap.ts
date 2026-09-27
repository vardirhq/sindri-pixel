// Sindri Pixel — tilemaps.
//
// A tilemap layer is an ordinary pixel layer cut into a grid of tiles. The
// pixels stay the source of truth; the tileset is *derived* from them: every
// distinct tile (a flipped copy counts as the same tile) becomes one entry,
// and each cell of the map points at an entry, maybe flipped. So there is
// nothing to keep in sync by hand, AI imports and old sprites become
// tilemaps by just choosing a tile size, and every drawing tool still works.
//
// "Auto" editing is what makes it a tilemap rather than a grid: drawing in
// one cell changes every other cell showing the same tile, flipped to match.
// The cell count and indices export as a tileset image plus a Tiled map
// (.tmj), which Godot, Unity, Phaser, Defold and Tiled itself read.

import type { PixelGrid } from '../types';

export interface TileSize {
  tw: number;
  th: number;
}

/** A map cell: which tile (0 = empty), and how it's flipped. */
export interface TileRef {
  tile: number;
  flipX: boolean;
  flipY: boolean;
}

export interface Tileset {
  /** tiles[0] is the empty tile. */
  tiles: PixelGrid[];
  /** How many cells use each tile. */
  uses: number[];
  /** One map per input grid: [row][col]. */
  maps: TileRef[][][];
  cols: number;
  rows: number;
}

/** The tile at cell (cx, cy); pixels past the canvas edge read as empty. */
export function cellPixels(pixels: PixelGrid, cx: number, cy: number, { tw, th }: TileSize): PixelGrid {
  const out: PixelGrid = [];
  for (let y = 0; y < th; y++) {
    const row = pixels[cy * th + y];
    const line: (string | null)[] = [];
    for (let x = 0; x < tw; x++) line.push(row?.[cx * tw + x] ?? null);
    out.push(line);
  }
  return out;
}

export const flipTile = (t: PixelGrid, fx: boolean, fy: boolean): PixelGrid => {
  const rows = fy ? [...t].reverse() : t;
  return fx ? rows.map((r) => [...r].reverse()) : rows.map((r) => [...r]);
};

const keyOf = (t: PixelGrid): string => t.map((r) => r.map((c) => (c ? c.toLowerCase() : '')).join(',')).join(';');
const isEmpty = (t: PixelGrid): boolean => t.every((r) => r.every((c) => !c));

const FLIPS: [boolean, boolean][] = [[false, false], [true, false], [false, true], [true, true]];

export const gridSize = (w: number, h: number, { tw, th }: TileSize) => ({ cols: Math.ceil(w / tw), rows: Math.ceil(h / th) });

/**
 * Find the distinct tiles of one or more layers (one shared tileset), and
 * map every cell to one. With `flips`, a mirrored copy of a tile reuses it.
 */
export function buildTileset(grids: PixelGrid[], size: TileSize, flips = true): Tileset {
  const h = grids[0]?.length ?? 0;
  const w = grids[0]?.[0]?.length ?? 0;
  const { cols, rows } = gridSize(w, h, size);
  const tiles: PixelGrid[] = [cellPixels([[]], 0, 0, size)];
  const uses = [0];
  const index = new Map<string, number>();
  const maps = grids.map((pixels) => {
    const map: TileRef[][] = [];
    for (let cy = 0; cy < rows; cy++) {
      const row: TileRef[] = [];
      for (let cx = 0; cx < cols; cx++) {
        const t = cellPixels(pixels, cx, cy, size);
        if (isEmpty(t)) { uses[0]++; row.push({ tile: 0, flipX: false, flipY: false }); continue; }
        let ref: TileRef | null = null;
        for (const [fx, fy] of flips ? FLIPS : FLIPS.slice(0, 1)) {
          // This cell, flipped by (fx, fy), is a known tile: so the cell is
          // that tile flipped the same way.
          const found = index.get(keyOf(flipTile(t, fx, fy)));
          if (found !== undefined) { ref = { tile: found, flipX: fx, flipY: fy }; break; }
        }
        if (!ref) {
          ref = { tile: tiles.length, flipX: false, flipY: false };
          index.set(keyOf(t), tiles.length);
          tiles.push(t);
          uses.push(0);
        }
        uses[ref.tile]++;
        row.push(ref);
      }
      map.push(row);
    }
    return map;
  });
  return { tiles, uses, maps, cols, rows };
}

/** The cells showing the same tile as (cx, cy), in any flip (empty: none). */
export function twinsOf(pixels: PixelGrid, size: TileSize, cx: number, cy: number, flips = true): [number, number][] {
  const t = cellPixels(pixels, cx, cy, size);
  if (isEmpty(t)) return [];
  const keys = new Set((flips ? FLIPS : FLIPS.slice(0, 1)).map(([fx, fy]) => keyOf(flipTile(t, fx, fy))));
  const { cols, rows } = gridSize(pixels[0]?.length ?? 0, pixels.length, size);
  const out: [number, number][] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (keys.has(keyOf(cellPixels(pixels, x, y, size)))) out.push([x, y]);
  return out;
}

function writeCell(pixels: PixelGrid, cx: number, cy: number, t: PixelGrid, { tw, th }: TileSize): void {
  for (let y = 0; y < th; y++) {
    const row = pixels[cy * th + y];
    if (!row) break;
    for (let x = 0; x < tw; x++) if (cx * tw + x < row.length) row[cx * tw + x] = t[y][x];
  }
}

/**
 * Auto tile editing: `next` is `base` with some cells drawn in. Every other
 * cell that showed the same tile as an edited one gets the edit too, flipped
 * to match. Cells that were empty don't count as a tile (drawing on empty
 * ground doesn't paint all empty ground).
 */
// A stroke calls propagateTileEdit on every mouse move against the same
// base: its cell keys are worked out once.
const baseKeys = new WeakMap<PixelGrid, { tw: number; th: number; keys: string[] }>();
function cellKeys(base: PixelGrid, size: TileSize, cols: number, rows: number): string[] {
  const hit = baseKeys.get(base);
  if (hit && hit.tw === size.tw && hit.th === size.th) return hit.keys;
  const keys: string[] = [];
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) keys.push(keyOf(cellPixels(base, cx, cy, size)));
  baseKeys.set(base, { ...size, keys });
  return keys;
}

/** Does cell (cx, cy) differ between two grids? (Rows shared by reference are equal.) */
function cellDiffers(a: PixelGrid, b: PixelGrid, cx: number, cy: number, { tw, th }: TileSize): boolean {
  for (let y = cy * th; y < (cy + 1) * th && y < a.length; y++) {
    const ra = a[y], rb = b[y];
    if (ra === rb) continue;
    for (let x = cx * tw; x < (cx + 1) * tw && x < ra.length; x++) if (ra[x] !== rb?.[x]) return true;
  }
  return false;
}

export function propagateTileEdit(base: PixelGrid, next: PixelGrid, size: TileSize, flips = true): PixelGrid {
  const { cols, rows } = gridSize(base[0]?.length ?? 0, base.length, size);
  const keys = cellKeys(base, size, cols, rows);
  const edits = new Map<string, PixelGrid>();
  const edited = new Set<number>();
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      if (!cellDiffers(base, next, cx, cy, size)) continue;
      const b = cellPixels(base, cx, cy, size);
      const n = cellPixels(next, cx, cy, size);
      if (keyOf(b) === keyOf(n)) continue;
      edited.add(cy * cols + cx);
      if (isEmpty(b)) continue;
      // A copy that is `b` flipped by (fx, fy) becomes `n` flipped the same way.
      for (const [fx, fy] of flips ? FLIPS : FLIPS.slice(0, 1)) {
        const k = keyOf(flipTile(b, fx, fy));
        if (!edits.has(k)) edits.set(k, flipTile(n, fx, fy));
      }
    }
  }
  if (!edits.size) return next;
  const out = next.map((r) => [...r]);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      if (edited.has(cy * cols + cx)) continue;
      const t = edits.get(keys[cy * cols + cx]);
      if (t) writeCell(out, cx, cy, t, size);
    }
  }
  return out;
}

const CANDIDATES = [8, 16, 32, 12, 24, 10, 20, 48, 64];

/**
 * Guess the tile size: the square size whose tileset describes the art most
 * cheaply (tile pixels plus one reference per cell). Real tile art repeats
 * at its tile size, so that size wins; ties go to the larger tile.
 */
export function suggestTileSize(pixels: PixelGrid): number {
  const h = pixels.length;
  const w = pixels[0]?.length ?? 0;
  let best = 16;
  let bestCost = Infinity;
  for (const s of CANDIDATES) {
    if (w % s || h % s || w / s < 2 || h / s < 2) continue;
    const set = buildTileset([pixels], { tw: s, th: s });
    const cells = set.cols * set.rows;
    if (set.tiles.length - 1 === 0) continue;
    const cost = (set.tiles.length - 1) * s * s + cells * 32;
    if (cost < bestCost || (cost === bestCost && s > best)) { best = s; bestCost = cost; }
  }
  return best;
}

/** The tiles (without the empty one) packed into an image, `columns` wide. */
export function tilesetImage(set: Tileset, size: TileSize, columns = 8): { w: number; h: number; pixels: PixelGrid; columns: number } {
  const n = set.tiles.length - 1;
  const cols = Math.max(1, Math.min(columns, n));
  const rows = Math.max(1, Math.ceil(n / cols));
  const w = cols * size.tw;
  const h = rows * size.th;
  const pixels: PixelGrid = Array.from({ length: h }, () => Array<string | null>(w).fill(null));
  set.tiles.slice(1).forEach((t, i) => writeCell(pixels, i % cols, Math.floor(i / cols), t, size));
  return { w, h, pixels, columns: cols };
}

const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;

/** A Tiled global tile id (tile 0 = empty = gid 0; flips in the top bits). */
export const gidOf = (ref: TileRef): number =>
  ref.tile === 0 ? 0 : (ref.tile | (ref.flipX ? FLIP_H : 0) | (ref.flipY ? FLIP_V : 0)) >>> 0;

/**
 * A Tiled JSON map (.tmj): one tile layer per input layer, sharing one
 * embedded tileset that points at `image`.
 */
export function tiledMap(set: Tileset, size: TileSize, layerNames: string[], image: { name: string; w: number; h: number; columns: number }, tilesetName = 'tiles'): object {
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    width: set.cols,
    height: set.rows,
    tilewidth: size.tw,
    tileheight: size.th,
    nextlayerid: set.maps.length + 1,
    nextobjectid: 1,
    layers: set.maps.map((map, i) => ({
      type: 'tilelayer',
      id: i + 1,
      name: layerNames[i] ?? `layer ${i + 1}`,
      width: set.cols,
      height: set.rows,
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      data: map.flat().map(gidOf),
    })),
    tilesets: [{
      firstgid: 1,
      name: tilesetName,
      image: image.name,
      imagewidth: image.w,
      imageheight: image.h,
      tilewidth: size.tw,
      tileheight: size.th,
      tilecount: set.tiles.length - 1,
      columns: image.columns,
      margin: 0,
      spacing: 0,
    }],
  };
}
