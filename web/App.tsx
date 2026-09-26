// Standalone AI pixel-art tool: Downscale one image, or Animate several.
//
// Both modes share one frame list and one set of downscale settings. Downscale
// shows the selected frame against its reconstruction; Animate lines frames up
// on a shared canvas (the same workspace the desktop editor's Import AI Art
// dialog embeds), previews the loop, and exports a sprite sheet, GIF, or
// Sindri Pixel project. Everything runs client-side — images never leave the tab.

import React from 'react';
import { buildOptions } from '../src/lib/pixelReconstruction';
import { downloadBytes, encodePngInBrowser } from '../src/lib/platform';
import {
  EMPTY_HISTORY,
  FrameWorkspace,
  Icon,
  Timeline,
  framesFromFiles,
  framesReducer,
  newFrameId,
  pickImageFiles,
  useComposition,
  useEngine,
  usePlayer,
  type WorkspaceView,
} from '../src/components/aiArt';
import { DownscaleStats, DownscaleView } from './DownscaleView';
import { ExportPanel } from './ExportPanel';
import { Shortcuts } from './Shortcuts';
import { Sidebar, type Mode } from './Sidebar';
import { useSettings } from './settings';

const REPO_URL = 'https://github.com/vardirhq/sindri-pixel';
const RELEASES_URL = `${REPO_URL}/releases`;
const EXPORT_SCALES = [1, 2, 4, 8, 16];

/** "walk_03.png" → "walk". */
function baseName(file: string): string {
  return file.replace(/\.[^.]+$/, '').replace(/[\s_-]*\d+$/, '') || 'animation';
}

export function App() {
  const [settings, update] = useSettings();
  const [history, dispatch] = React.useReducer(framesReducer, EMPTY_HISTORY);
  const frames = history.present;
  const [mode, setMode] = React.useState<Mode>('downscale');
  const [dragging, setDragging] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);

  const options = React.useMemo(() => buildOptions(settings), [settings]);
  const engine = useEngine(frames, options, settings.matchPixelSize);
  const composition = useComposition(frames, engine.results, settings);
  const player = usePlayer(frames.length, composition.durations, settings.playback);
  const selected = frames[Math.min(player.index, frames.length - 1)];
  const selectedResult = selected ? engine.results.get(selected.id) : undefined;

  const addFiles = React.useCallback(async (files: File[], at?: number) => {
    if (!files.length) return;
    setError(null);
    setLoading(true);
    try {
      const { frames: added, errors } = await framesFromFiles(files);
      if (errors.length) setError(errors.join(' · '));
      if (!added.length) return;
      // One image into a one-image Downscale session swaps it, like before;
      // anything else appends, and several at once means an animation.
      if (mode === 'downscale' && frames.length === 1 && added.length === 1 && at === undefined) {
        dispatch({ type: 'replace', id: frames[0].id, frame: added[0] });
        player.setIndex(0);
        return;
      }
      const pos = at ?? frames.length;
      dispatch({ type: 'add', frames: added, at: pos });
      player.setIndex(pos);
      if (frames.length + added.length > 1) setMode('animate');
    } finally {
      setLoading(false);
    }
  }, [frames, mode, player]);

  const pickFiles = React.useCallback(async (at?: number) => addFiles(await pickImageFiles(), at), [addFiles]);

  // Paste from the clipboard — the usual path when the image came out of a
  // generator in another tab — and drop anywhere in the window.
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((i) => i.type.startsWith('image/'))
        .map((i) => i.getAsFile())
        .filter((f): f is File => !!f);
      if (files.length) void addFiles(files);
    };
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDragging(false); };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) void addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [addFiles]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
      if (e.key === '?') { e.preventDefault(); setHelpOpen((v) => !v); }
      if (e.key === 'Escape') setHelpOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const downloadPng = async () => {
    if (!selectedResult || !selected) return;
    const img = selectedResult.sprite;
    try {
      const bytes = await encodePngInBrowser(Array.from(img.data), img.width, img.height, settings.exportScale);
      const base = selected.name.replace(/\.[^.]+$/, '') || 'downscaled';
      const suffix = settings.exportScale > 1 ? `@${settings.exportScale}x` : '';
      downloadBytes(bytes, `${base}-${img.width}x${img.height}${suffix}.png`, 'image/png');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PNG export failed');
    }
  };

  const view: WorkspaceView = settings;
  const onViewChange = React.useCallback((patch: Partial<WorkspaceView>) => update(patch), [update]);
  const readyFrames = composition.composed.filter((c): c is NonNullable<typeof c> => !!c);
  const cycleMs = composition.durations.reduce((a, b) => a + b, 0);

  const tagline = mode === 'animate'
    ? 'Line up AI-generated frames, preview the loop, and export a sprite sheet.'
    : 'Finds the implied grid in an AI-generated raster and resamples it to its real resolution.';

  return (
    <div className={`app mode-${mode}`}>
      <header className="masthead">
        <div>
          <p className="eyebrow">Sindri Pixel</p>
          <h1>AI Pixel-Art Studio</h1>
        </div>
        <nav className="modes" role="tablist" aria-label="Mode">
          {(['downscale', 'animate'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? 'active' : undefined}
              onClick={() => { setMode(m); setExportOpen(false); }}
            >
              {m === 'downscale' ? 'Downscale' : 'Animate'}
              {m === 'animate' && frames.length > 1 && <span className="count">{frames.length}</span>}
            </button>
          ))}
        </nav>
        <div className="divider" />
        <p className="tagline">{tagline}</p>
        <span className="spacer" />
        <button type="button" className="btn btn-quiet" onClick={() => setHelpOpen((v) => !v)} aria-expanded={helpOpen}>Shortcuts</button>
        <a className="btn" href={REPO_URL} target="_blank" rel="noreferrer">Source</a>
      </header>

      <div className="work">
        {frames.length === 0 ? (
          <div
            className={`dropzone${dragging ? ' active' : ''}`}
            onClick={() => void pickFiles()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') void pickFiles(); }}
          >
            <div className="drop-art" aria-hidden="true">
              <span /><span /><span />
            </div>
            <span className="big">
              {loading ? 'Reading images…' : mode === 'animate' ? 'Drop your animation frames here' : 'Drop AI-generated images here'}
            </span>
            <span className="hint">
              One image to downscale it · several to build an animation · click to choose, or paste
            </span>
            <span className="hint">PNG, JPEG, WebP · processed entirely in this tab — nothing is uploaded.</span>
            {error && <span className="error">{error}</span>}
          </div>
        ) : (
          <>
            <Sidebar mode={mode} settings={settings} update={update} sharedCellSize={engine.sharedCellSize} frameCount={frames.length}>
              {mode === 'downscale' && selected && selectedResult && (
                <DownscaleStats
                  source={selected.source}
                  sprite={selectedResult.sprite}
                  detection={selectedResult.detection}
                  onUsePixelSize={(px) => update({ pixelSize: px, gridChoice: 'pixel' })}
                />
              )}
            </Sidebar>

            {mode === 'animate' ? (
              <FrameWorkspace
                history={history}
                dispatch={dispatch}
                engine={engine}
                composition={composition}
                player={player}
                view={view}
                onViewChange={onViewChange}
                onPickFiles={(at) => void pickFiles(at)}
                onDropFiles={(files, at) => void addFiles(files, at)}
                keyboard={!exportOpen}
              />
            ) : (
              <main className="canvases">
                <div className="filebar">
                  <span className="name">{selected.name}</span>
                  <button type="button" className="replace" onClick={() => void pickFiles()}>add images</button>
                  <span>{loading ? 'reading…' : engine.busy ? 'updating…' : 'drop or paste to add'}</span>
                  {error && <span style={{ color: 'var(--red)' }}>{error}</span>}
                </div>
                <DownscaleView source={selected.source} sprite={selectedResult?.sprite ?? null} name={selected.name} />
                {frames.length > 1 && (
                  <div className="downscale-strip">
                    <Timeline
                      frames={frames}
                      composed={frames.map((f) => engine.results.get(f.id)?.sprite ?? null)}
                      durations={composition.durations}
                      selected={Math.min(player.index, frames.length - 1)}
                      playing={false}
                      onSelect={player.setIndex}
                      onMove={(from, to) => dispatch({ type: 'move', from, to })}
                      onDuplicate={(id) => dispatch({ type: 'duplicate', id, newId: newFrameId() })}
                      onRemove={(id) => dispatch({ type: 'remove', ids: [id] })}
                      onAdd={() => void pickFiles()}
                      onDropFiles={(files, at) => void addFiles(files, at)}
                    />
                  </div>
                )}
              </main>
            )}
          </>
        )}
      </div>

      <footer className="statusbar">
        {mode === 'animate' && frames.length > 0 ? (
          <>
            <span className="summary">
              <b>{frames.length}</b> frame{frames.length === 1 ? '' : 's'}
              <span className="dot">·</span>
              {composition.layout.width} × {composition.layout.height}px
              <span className="dot">·</span>
              {settings.fps} fps
              <span className="dot">·</span>
              {(cycleMs / 1000).toFixed(2)}s {settings.playback === 'pingpong' ? 'ping-pong' : 'loop'}
            </span>
            <span className="spacer" />
            <div className="export-anchor">
              {exportOpen && readyFrames.length === frames.length && (
                <ExportPanel
                  frames={readyFrames}
                  durations={composition.durations}
                  settings={settings}
                  update={update}
                  defaultName={baseName(frames[0].name)}
                  onClose={() => setExportOpen(false)}
                />
              )}
              <button
                type="button"
                data-export-toggle
                className="btn btn-primary"
                onClick={() => setExportOpen((v) => !v)}
                disabled={readyFrames.length !== frames.length}
                aria-expanded={exportOpen}
              >
                <Icon name="download" /> Export
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="plug">
              Also built into <a href={RELEASES_URL} target="_blank" rel="noreferrer">Sindri Pixel</a>,
              the desktop sprite editor — where the result lands on a canvas you can edit and animate.
            </span>
            <span className="spacer" />
            {selected && (
              <>
                <label htmlFor="scale">Export</label>
                <select id="scale" value={settings.exportScale} onChange={(e) => update({ exportScale: parseInt(e.target.value, 10) })}>
                  {EXPORT_SCALES.map((n) => <option key={n} value={n}>{n}×</option>)}
                </select>
                {selectedResult && (
                  <span>{selectedResult.sprite.width * settings.exportScale} × {selectedResult.sprite.height * settings.exportScale}px</span>
                )}
                <button type="button" className="btn btn-primary" onClick={() => void downloadPng()} disabled={!selectedResult}>
                  Download PNG
                </button>
              </>
            )}
          </>
        )}
      </footer>

      {helpOpen && <Shortcuts onClose={() => setHelpOpen(false)} />}
      {dragging && frames.length > 0 && (
        <div className="drop-veil" aria-hidden="true">
          <span>{mode === 'animate' ? 'Drop to add frames' : frames.length === 1 ? 'Drop to replace — or several to animate' : 'Drop to add'}</span>
        </div>
      )}
    </div>
  );
}
