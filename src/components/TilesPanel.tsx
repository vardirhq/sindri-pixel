// The tiles of a tilemap layer: make a layer a tilemap (the tile size is
// guessed from the art), see its tileset, pick a tile to stamp, choose
// whether drawing edits every copy, and export the map.

import React from 'react';
import type { Layer, PixelGrid } from '../types';
import type { Tileset } from '../lib/tilemap';
import { IconDownload, IconGrid, IconX } from './Icons';

const SIZES = [8, 16, 32];

const S = {
  root: { padding: '10px 18px 12px', borderBottom: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: 8 } as React.CSSProperties,
  head: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' } as React.CSSProperties,
  sub: { fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.45 } as React.CSSProperties,
  chip: (on: boolean, suggested = false): React.CSSProperties => ({
    fontFamily: 'var(--font-mono)', fontSize: 11, padding: '3px 8px', cursor: 'pointer', position: 'relative',
    border: `1px solid ${on ? 'var(--cyan)' : suggested ? 'var(--moss)' : 'var(--rule-2)'}`,
    color: on ? 'var(--paper)' : 'var(--ink-2)', background: on ? 'var(--cyan)' : 'transparent',
  }),
  btn: (primary: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 11.5,
    padding: '6px 10px', cursor: 'pointer', border: `1px solid ${primary ? 'var(--cyan)' : 'var(--rule-2)'}`,
    color: primary ? 'var(--paper)' : 'var(--ink-2)', background: primary ? 'var(--cyan)' : 'transparent', whiteSpace: 'nowrap',
  }),
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(34px, 1fr))', gap: 4, maxHeight: 180, overflowY: 'auto', padding: 2 } as React.CSSProperties,
  tile: (on: boolean): React.CSSProperties => ({
    position: 'relative', aspectRatio: '1', background: '#0a0e14', cursor: 'pointer',
    outline: on ? '2px solid var(--cyan)' : '1px solid var(--rule-2)', outlineOffset: on ? 0 : -1,
  }),
  uses: { position: 'absolute', right: 1, bottom: 0, fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--ink-3)', textShadow: '0 0 2px #000, 0 0 2px #000' } as React.CSSProperties,
  toggle: (on: boolean): React.CSSProperties => ({ width: 26, height: 14, border: '1px solid var(--rule-2)', background: on ? 'var(--cyan)' : 'var(--paper-3)', position: 'relative', flex: 'none', cursor: 'pointer' }),
};

function TileThumb({ pixels }: { pixels: PixelGrid }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    c.width = pixels[0]?.length ?? 1;
    c.height = pixels.length;
    ctx.clearRect(0, 0, c.width, c.height);
    pixels.forEach((row, y) => row.forEach((col, x) => { if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); } }));
  }, [pixels]);
  return <canvas ref={ref} style={{ width: '100%', height: '100%', imageRendering: 'pixelated', display: 'block' }} />;
}

export interface TilesPanelProps {
  layer: Layer;
  /** The layer's tileset (when it is a tilemap). */
  tileset: Tileset | null;
  /** The tile size that fits this art best. */
  suggested: number;
  canvasW: number;
  canvasH: number;
  auto: boolean;
  onAutoChange: (auto: boolean) => void;
  /** The tile being stamped (index into the tileset), or null. */
  stampTile: number | null;
  onStampTile: (tile: number | null) => void;
  onSetTileSize: (size: { tw: number; th: number } | null) => void;
  /** Tileset PNG + Tiled .tmj. */
  onExport: () => void;
  /** Texture + sheet + prefab for the Sindri engine. */
  onExportSindri: () => void;
}

export function TilesPanel(p: TilesPanelProps) {
  const { layer, tileset, suggested } = p;
  const tm = layer.tilemap;
  const [pick, setPick] = React.useState(suggested);
  React.useEffect(() => { setPick(suggested); }, [suggested, layer.id]);

  if (!tm) {
    return (
      <div style={S.root} data-tiles-panel="off">
        <div style={S.head}><IconGrid size={11} /> <span>TILEMAP</span></div>
        <div style={S.sub}>Cut this layer into tiles: repeats are found for you, and drawing on one tile draws on every copy.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {[...new Set([...SIZES, suggested])].sort((a, b) => a - b).map((s) => (
            <span key={s} role="button" data-tile-size={s} style={S.chip(pick === s, s === suggested)} onClick={() => setPick(s)} title={s === suggested ? 'Fits this art best' : undefined}>
              {s}{s === suggested ? ' ✓' : ''}
            </span>
          ))}
          <span style={{ flex: 1 }} />
          <span role="button" data-make-tilemap style={S.btn(true)} onClick={() => p.onSetTileSize({ tw: pick, th: pick })}>Make tilemap</span>
        </div>
      </div>
    );
  }

  const unique = (tileset?.tiles.length ?? 1) - 1;
  const cells = tileset ? tileset.cols * tileset.rows : 0;
  const empty = tileset?.uses[0] ?? 0;
  return (
    <div style={S.root} data-tiles-panel="on">
      <div style={S.head}>
        <IconGrid size={11} />
        <span>TILES {tm.tw}×{tm.th}</span>
        <span style={{ flex: 1 }} />
        <span data-tile-count>{unique} unique · {cells - empty}/{cells} cells</span>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--ink-2)' }} title="Drawing on a tile changes every copy of it (flipped copies too)">
        <span style={S.toggle(p.auto)} onClick={() => p.onAutoChange(!p.auto)} data-tile-auto={p.auto ? 'on' : 'off'} role="switch" aria-checked={p.auto}>
          <span style={{ position: 'absolute', top: 1, left: p.auto ? 13 : 1, width: 10, height: 10, background: p.auto ? 'var(--paper)' : 'var(--ink-3)', transition: 'left 120ms' }} />
        </span>
        <span onClick={() => p.onAutoChange(!p.auto)}>Edit every copy</span>
      </label>
      {unique > 0 ? (
        <>
          <div style={{ ...S.sub, fontSize: 11 }}>
            {p.stampTile !== null ? 'Stamping — click or drag on the canvas to place whole tiles. Click the tile again to stop.' : 'Click a tile to stamp it onto the grid.'}
          </div>
          <div style={S.grid} data-tileset>
            {tileset!.tiles.slice(1).map((t, i) => (
              <div
                key={i}
                data-tile={i + 1}
                style={S.tile(p.stampTile === i + 1)}
                title={`Tile ${i + 1} · used ${tileset!.uses[i + 1]}×`}
                onClick={() => p.onStampTile(p.stampTile === i + 1 ? null : i + 1)}
              >
                <TileThumb pixels={t} />
                <span style={S.uses}>{tileset!.uses[i + 1]}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={S.sub}>No tiles yet — draw in a {tm.tw}×{tm.th} cell and it becomes the first tile.</div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <span role="button" data-export-sindri style={{ ...S.btn(true), flex: 1, opacity: unique ? 1 : 0.4 }} onClick={() => unique && p.onExportSindri()} title="Texture, sheet and a prefab with sindri.tilemap, into your Sindri project">
          <IconDownload size={11} /> Sindri
        </span>
        <span role="button" data-export-tilemap style={{ ...S.btn(false), flex: 1, opacity: unique ? 1 : 0.4 }} onClick={() => unique && p.onExport()} title="Tileset PNG + Tiled map (.tmj) for Godot, Unity, Phaser, Tiled">
          <IconDownload size={11} /> Tiled
        </span>
        <span role="button" style={S.btn(false)} onClick={() => p.onSetTileSize(null)} title="Make this an ordinary layer again (the pixels stay)">
          <IconX size={10} />
        </span>
      </div>
    </div>
  );
}
