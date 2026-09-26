// Animate mode's export popover: a sprite sheet (PNG + Aseprite-style JSON),
// an animated GIF, or a Sindri Pixel project for the desktop editor.

import React from 'react';
import { buildSheet, encodeGif, scaleImage, sheetGrid, sheetJson, toSprProject, type SheetColumns } from '../src/lib/animation';
import { extractPalette, type RGBAImage } from '../src/lib/pixelReconstruction';
import { downloadBytes, downloadText, encodePngInBrowser } from '../src/lib/platform';
import { Icon } from '../src/components/aiArt';
import { Seg } from './Sidebar';
import type { Settings } from './settings';

export interface ExportPanelProps {
  frames: RGBAImage[];
  durations: number[];
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  defaultName: string;
  onClose: () => void;
}

const SCALES = [1, 2, 3, 4, 6, 8, 12, 16];

export function ExportPanel({ frames, durations, settings: s, update, defaultName, onClose }: ExportPanelProps) {
  const [name, setName] = React.useState(defaultName);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const base = name.trim().replace(/[^\w.-]+/g, '-') || 'animation';

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(t) && !(t as HTMLElement).closest?.('[data-export-toggle]')) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  const w = frames[0]?.width ?? 0;
  const h = frames[0]?.height ?? 0;
  const k = s.exportScale;
  const grid = sheetGrid(frames.length, s.sheetColumns);
  const sheetW = grid.columns * w * k + (grid.columns + 1) * s.sheetPadding;
  const sheetH = grid.rows * h * k + (grid.rows + 1) * s.sheetPadding;

  const run = async (label: string, job: () => Promise<void> | void) => {
    setError(null);
    setDone(null);
    try {
      await job();
      setDone(label);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  };

  const sheetOpts = { columns: s.sheetColumns, padding: s.sheetPadding, scale: k };
  const exportSheet = () => run('Sprite sheet saved', async () => {
    const sheet = buildSheet(frames, sheetOpts);
    const png = await encodePngInBrowser(Array.from(sheet.image.data), sheet.image.width, sheet.image.height, 1);
    downloadBytes(png, `${base}.png`, 'image/png');
  });
  const exportJson = () => run('Sheet data saved', () => {
    const sheet = buildSheet(frames, sheetOpts);
    const json = sheetJson(sheet, { name: base, durations, pingPong: s.playback === 'pingpong', scale: k });
    downloadText(JSON.stringify(json, null, 2), `${base}.json`);
  });
  const exportGif = () => run('GIF saved', () => {
    const scaled = frames.map((f) => scaleImage(f, k));
    const order = s.playback === 'pingpong' && frames.length > 2
      ? [...scaled.keys(), ...[...scaled.keys()].slice(1, -1).reverse()]
      : [...scaled.keys()];
    const gif = encodeGif(order.map((i) => scaled[i]), order.map((i) => durations[i]));
    downloadBytes(gif, `${base}.gif`, 'image/gif');
  });
  const exportSpr = () => run('Project saved', () => {
    const palette = [...new Set(frames.flatMap((f) => extractPalette(f)))].slice(0, 256);
    downloadText(toSprProject(frames, durations, base, palette), `${base}.spr`);
  });

  const columnsValue = typeof s.sheetColumns === 'number' ? 'custom' : s.sheetColumns;
  return (
    <div className="export-panel" ref={panelRef} role="dialog" aria-label="Export animation">
      <div className="export-head">
        <span className="export-title">Export</span>
        <span className="export-sub">{frames.length} frames · {w} × {h}px</span>
      </div>

      <label className="export-name">
        <span className="label">Name</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
      </label>

      <div className="export-row">
        <span className="label">Scale</span>
        <select value={k} onChange={(e) => update({ exportScale: parseInt(e.target.value, 10) })} aria-label="Export scale">
          {SCALES.map((n) => <option key={n} value={n}>{n}×</option>)}
        </select>
      </div>

      <section className="export-section">
        <div className="export-section-head">
          <span className="export-kind">Sprite sheet</span>
          <span className="export-dims">{sheetW} × {sheetH}px</span>
        </div>
        <Seg
          label="Sheet layout"
          value={columnsValue}
          options={[['auto', 'Grid'], ['row', 'Strip'], ['custom', 'Columns']] as const}
          onChange={(v) => update({ sheetColumns: v === 'custom' ? Math.min(4, frames.length) : (v as SheetColumns) })}
        />
        <div className="export-inline">
          {typeof s.sheetColumns === 'number' && (
            <label>
              <span>Columns</span>
              <input
                type="number" min={1} max={frames.length} value={s.sheetColumns}
                onChange={(e) => update({ sheetColumns: Math.max(1, Math.min(frames.length, parseInt(e.target.value, 10) || 1)) })}
              />
            </label>
          )}
          <label>
            <span>Padding</span>
            <input
              type="number" min={0} max={16} value={s.sheetPadding}
              onChange={(e) => update({ sheetPadding: Math.max(0, Math.min(16, parseInt(e.target.value, 10) || 0)) })}
            />
          </label>
        </div>
        <div className="export-buttons">
          <button type="button" className="btn btn-primary" onClick={() => void exportSheet()}><Icon name="download" /> PNG</button>
          <button type="button" className="btn" onClick={() => void exportJson()}>JSON data</button>
        </div>
      </section>

      <section className="export-section">
        <div className="export-section-head">
          <span className="export-kind">Animated GIF</span>
          <span className="export-dims">{w * k} × {h * k}px · {s.playback === 'pingpong' ? 'ping-pong' : 'loop'}</span>
        </div>
        <div className="export-buttons">
          <button type="button" className="btn" onClick={() => void exportGif()}><Icon name="download" /> GIF</button>
        </div>
      </section>

      <section className="export-section">
        <div className="export-section-head">
          <span className="export-kind">Sindri Pixel project</span>
          <span className="export-dims">.spr</span>
        </div>
        <p className="export-note">Open it in the desktop editor to touch up frames.</p>
        <div className="export-buttons">
          <button type="button" className="btn" onClick={() => void exportSpr()}><Icon name="download" /> .spr</button>
        </div>
      </section>

      {(error || done) && (
        <div className={error ? 'export-msg error' : 'export-msg'} role="status">{error ?? done}</div>
      )}
    </div>
  );
}
