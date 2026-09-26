import React from 'react';
import {
  buildOptions,
  clampPixelSize,
  detectionNotice,
  extractPalette,
  GRID_PRESETS,
  PALETTE_PRESETS,
  CLEAN_SPRITE_PRESET,
  HIGH_DETAIL_PRESET,
  MAX_OUTPUT_SIZE,
  MIN_PIXEL_SIZE,
  MAX_PIXEL_SIZE,
  type GridChoice,
  type PaletteChoice,
  type CleanupSettings,
  type SamplingMode,
  type RGBAImage,
  type GridDetectionResult,
} from '../../lib/pixelReconstruction';
import type { Anchor } from '../../lib/animation';
import {
  EMPTY_HISTORY,
  FrameWorkspace,
  framesFromFiles,
  framesReducer,
  pickImageFiles,
  SheetNotice,
  splitFrame,
  useComposition,
  useEngine,
  usePlayer,
  type WorkspaceView,
} from '../aiArt';

// ---------------------------------------------------------------------------
// Import AI Art dialog
//
// Reconstructs AI-generated "pixel art" rasters into true low-resolution
// sprites. One image gives a single-frame sprite; several images become an
// animation: every frame is read at one shared pixel size with one palette,
// lined up by the character's feet, and previewed with onion skin in the same
// frame workspace the web tool uses — then lands in the editor as frames. All
// processing is client-side (Canvas + plain TS, in a Web Worker): no server
// round trip, no external API calls.
// ---------------------------------------------------------------------------

export interface AiArtImportResult {
  /** One entry per frame, all the same size; durations in ms. */
  frames: { image: RGBAImage; duration: number }[];
  palette: string[];
  name: string;
}

interface ImportAiArtDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: AiArtImportResult) => void;
}

/** Largest canvas the editor accepts. */
const EDITOR_MAX = 512;

const PREVIEW_BOX = 240; // px, both preview panes are square

const s = {
  scrim: { position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
  box: { background: 'var(--paper-2)', border: '1px solid var(--rule-2)', width: 720, maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', padding: '24px 24px 20px', boxShadow: '0 12px 32px rgba(0,0,0,0.5)', color: 'var(--ink)', fontFamily: 'var(--font-sans)' } as React.CSSProperties,
  // Several images: the dialog grows into a workspace that fills the window.
  boxWide: { background: 'var(--paper-2)', border: '1px solid var(--rule-2)', width: 'min(1360px, calc(100vw - 48px))', height: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 32px rgba(0,0,0,0.5)', color: 'var(--ink)', fontFamily: 'var(--font-sans)', overflow: 'hidden' } as React.CSSProperties,
  wideHead: { display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', borderBottom: '1px solid var(--rule)' } as React.CSSProperties,
  wideBody: { flex: 1, minHeight: 0, display: 'flex' } as React.CSSProperties,
  wideControls: { width: 224, flex: 'none', overflowY: 'auto', padding: '16px 18px', borderRight: '1px solid var(--rule)' } as React.CSSProperties,
  wideFoot: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderTop: '1px solid var(--rule)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' } as React.CSSProperties,
  hint: { fontSize: 11, lineHeight: 1.45, color: 'var(--ink-4)', margin: '6px 0 0' } as React.CSSProperties,
  title: { fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, marginBottom: 4 } as React.CSSProperties,
  subtitle: { fontSize: 12, color: 'var(--ink-3)', marginBottom: 20 } as React.CSSProperties,
  label: { fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, fontFamily: 'var(--font-display)' } as React.CSSProperties,
  drop: (active: boolean): React.CSSProperties => ({ border: `1px dashed ${active ? 'var(--ink-2)' : 'var(--rule-2)'}`, background: active ? 'var(--paper-3)' : 'var(--paper)', padding: '28px 16px', textAlign: 'center', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 12.5 }),
  select: { background: 'var(--paper)', border: '1px solid var(--rule-2)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 12.5, padding: '6px 8px', width: '100%', boxSizing: 'border-box' } as React.CSSProperties,
  numInput: { background: 'var(--paper)', border: '1px solid var(--rule-2)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 12.5, padding: '6px 8px', width: '100%', boxSizing: 'border-box' } as React.CSSProperties,
  detailRow: { display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11.5, padding: '3px 0', color: 'var(--ink-2)' } as React.CSSProperties,
  detailKey: { color: 'var(--ink-4)' } as React.CSSProperties,
  toggleRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer', padding: '4px 0' } as React.CSSProperties,
  seg: (active: boolean, first: boolean): React.CSSProperties => ({
    flex: 1, textAlign: 'center', padding: '6px 4px', cursor: 'pointer',
    fontFamily: 'var(--font-mono)', fontSize: 11.5,
    background: active ? 'var(--paper-3)' : 'var(--paper)',
    color: active ? 'var(--ink)' : 'var(--ink-3)',
    border: '1px solid var(--rule-2)', borderLeft: first ? '1px solid var(--rule-2)' : 'none',
  }),
  preset: { fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 10px', background: 'transparent', border: '1px solid var(--rule-2)', color: 'var(--ink-2)', cursor: 'pointer' } as React.CSSProperties,
  previewPane: { flex: 1, minWidth: 0 } as React.CSSProperties,
  // Square, as wide as the column allows (at most PREVIEW_BOX); the canvas
  // inside shrinks to fit.
  canvasFrame: { width: '100%', maxWidth: PREVIEW_BOX, aspectRatio: '1', background: 'var(--paper)', border: '1px solid var(--rule-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } as React.CSSProperties,
  previewCanvas: { imageRendering: 'pixelated', maxWidth: '100%', maxHeight: '100%' } as React.CSSProperties,
  btn: (primary: boolean, disabled = false): React.CSSProperties => ({ fontFamily: 'var(--font-display)', fontSize: 12.5, padding: '7px 16px', background: primary ? 'var(--ink)' : 'transparent', border: `1px solid ${primary ? 'var(--ink)' : 'var(--rule-2)'}`, color: primary ? 'var(--paper)' : 'var(--ink-2)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }),
};

function confidenceColor(c: GridDetectionResult['confidence']): string {
  return c === 'high' ? 'var(--ink-2)' : c === 'medium' ? 'var(--amber)' : 'var(--danger, #e05555)';
}

/** Draw an RGBAImage into a canvas fitted to `PREVIEW_BOX`: an integer zoom
 *  with nearest-neighbor when it's small (a sprite), smooth downscaling when
 *  it's larger than the box (an AI source raster). */
function paintPreview(canvas: HTMLCanvasElement | null, image: RGBAImage | null): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!image || image.width === 0 || image.height === 0) return;

  const fit = Math.min(PREVIEW_BOX / image.width, PREVIEW_BOX / image.height);
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  const drawW = Math.round(image.width * scale);
  const drawH = Math.round(image.height * scale);
  canvas.width = drawW;
  canvas.height = drawH;

  // Blit source pixels 1:1 into a scratch canvas, then scale to fit.
  const scratch = document.createElement('canvas');
  scratch.width = image.width;
  scratch.height = image.height;
  const sctx = scratch.getContext('2d');
  if (!sctx) return;
  sctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.drawImage(scratch, 0, 0, drawW, drawH);
}

export function ImportAiArtDialog({ open, onClose, onConfirm }: ImportAiArtDialogProps) {
  const [history, dispatch] = React.useReducer(framesReducer, EMPTY_HISTORY);
  const frames = history.present;
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [gridChoice, setGridChoice] = React.useState<GridChoice>('auto');
  const [pixelSize, setPixelSize] = React.useState(4);
  const [customW, setCustomW] = React.useState(64);
  const [customH, setCustomH] = React.useState(64);
  const [samplingMode, setSamplingMode] = React.useState<SamplingMode>('mode');
  const [paletteChoice, setPaletteChoice] = React.useState<PaletteChoice>('auto');
  const [removeIsolatedPixels, setRemoveIsolatedPixels] = React.useState(true);
  const [mergeSimilarColors, setMergeSimilarColors] = React.useState(true);
  const [removeAntiAliasing, setRemoveAntiAliasing] = React.useState(true);
  const [transparentBackground, setTransparentBackground] = React.useState(true);
  const [removeBackground, setRemoveBackground] = React.useState(true);
  const [matchPixelSize, setMatchPixelSize] = React.useState(true);
  const [canvasMode, setCanvasMode] = React.useState<'auto' | 'fixed'>('auto');
  const [canvasW, setCanvasW] = React.useState(64);
  const [canvasH, setCanvasH] = React.useState(64);
  const [view, setView] = React.useState<WorkspaceView>({ anchor: 'feet', fps: 8, playback: 'loop', onion: false, pixelGrid: false });

  const origCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const resultCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // Reset everything when the dialog is (re)opened.
  React.useEffect(() => {
    if (open) {
      dispatch({ type: 'reset' }); setDragging(false); setError(null);
      setGridChoice('auto'); setPixelSize(4); setCustomW(64); setCustomH(64);
      setSamplingMode('mode'); setPaletteChoice('auto');
      setRemoveIsolatedPixels(true); setMergeSimilarColors(true);
      setRemoveAntiAliasing(true); setTransparentBackground(true); setRemoveBackground(true);
      setMatchPixelSize(true); setCanvasMode('auto');
      setView({ anchor: 'feet', fps: 8, playback: 'loop', onion: false, pixelGrid: false });
    }
  }, [open]);

  // One-click presets. "Clean sprite" = flat pixel art; "High detail" = a
  // faithful downscale that keeps gradients and shading.
  const applyPreset = (p: CleanupSettings) => {
    setSamplingMode(p.samplingMode); setPaletteChoice(p.paletteChoice);
    setRemoveIsolatedPixels(p.removeIsolatedPixels);
    setMergeSimilarColors(p.mergeSimilarColors);
    setRemoveAntiAliasing(p.removeAntiAliasing);
  };

  const options = React.useMemo(() => buildOptions({
    gridChoice, pixelSize, customWidth: customW, customHeight: customH, samplingMode, paletteChoice,
    mergeSimilarColors, removeAntiAliasing, removeIsolatedPixels, transparentBackground, removeBackground,
  }), [gridChoice, pixelSize, customW, customH, samplingMode, paletteChoice, mergeSimilarColors, removeAntiAliasing, removeIsolatedPixels, transparentBackground, removeBackground]);

  // Reconstruction runs in a worker; results arrive as they're ready.
  const engine = useEngine(open ? frames : [], options, matchPixelSize);
  const composition = useComposition(frames, engine.results, {
    anchor: view.anchor, canvasMode, canvasWidth: canvasW, canvasHeight: canvasH, fps: view.fps, playback: view.playback,
  });
  const player = usePlayer(frames.length, composition.durations, view.playback);
  const onViewChange = React.useCallback((patch: Partial<WorkspaceView>) => setView((v) => ({ ...v, ...patch })), []);

  const single = frames.length === 1 ? frames[0] : null;
  const singleResult = single ? engine.results.get(single.id) : undefined;

  // Paint both previews (single-image layout).
  React.useEffect(() => { paintPreview(origCanvasRef.current, single?.source ?? null); }, [single, open]);
  React.useEffect(() => { paintPreview(resultCanvasRef.current, singleResult?.sprite ?? null); }, [singleResult, open]);

  const addFiles = React.useCallback(async (files: File[], at?: number) => {
    if (!files.length) return;
    setError(null);
    const { frames: added, errors } = await framesFromFiles(files);
    if (errors.length) setError(errors.join(' · '));
    if (!added.length) return;
    // One image onto a one-image import replaces it; anything else adds frames.
    if (frames.length === 1 && added.length === 1 && at === undefined) {
      dispatch({ type: 'replace', id: frames[0].id, frame: added[0] });
      return;
    }
    const pos = at ?? frames.length;
    dispatch({ type: 'add', frames: added, at: pos });
    player.setIndex(pos);
  }, [frames, player]);

  const pickFiles = async (at?: number) => addFiles(await pickImageFiles(), at);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    void addFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const multi = frames.length > 1;
  const ready = frames.length > 0 && composition.ready && !engine.busy;
  const tooBig = multi && (composition.layout.width > EDITOR_MAX || composition.layout.height > EDITOR_MAX);
  const baseName = (frames[0]?.name ?? 'ai-import').replace(/\.[^.]+$/, '').replace(multi ? /[\s_-]*\d+$/ : /$^/, '') || 'ai-import';

  const confirm = () => {
    if (!ready || tooBig) return;
    if (!multi && singleResult) {
      onConfirm({
        frames: [{ image: singleResult.sprite, duration: 120 }],
        palette: extractPalette(singleResult.sprite),
        name: `${baseName}.spr`,
      });
      return;
    }
    const images = composition.composed.filter((c): c is RGBAImage => !!c);
    const palette = [...new Set(images.flatMap((img) => extractPalette(img)))];
    onConfirm({
      frames: images.map((image, i) => ({ image, duration: composition.durations[i] })),
      palette,
      name: `${baseName}.spr`,
    });
  };

  if (!open) return null;

  const det = singleResult?.detection;
  const notice = det && single ? detectionNotice(det, single.source) : null;
  const usePixelSize = (px: number) => { setPixelSize(px); setGridChoice('pixel'); };

  const controls = (
    <>
      <div style={s.label}>Preset</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={s.preset} onClick={() => applyPreset(CLEAN_SPRITE_PRESET)}>Clean sprite</button>
        <button style={s.preset} onClick={() => applyPreset(HIGH_DETAIL_PRESET)}>High detail</button>
      </div>

      <div style={s.label}>Grid size</div>
      <select style={s.select} value={gridChoice} onChange={(e) => setGridChoice(e.target.value as GridChoice)}>
        {GRID_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      {gridChoice === 'pixel' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <input type="number" min={MIN_PIXEL_SIZE} max={MAX_PIXEL_SIZE} step={0.1} value={pixelSize} style={s.numInput}
            aria-label="Source pixels per art pixel"
            onChange={(e) => setPixelSize(clampPixelSize(parseFloat(e.target.value)))} />
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>px</span>
        </div>
      )}
      {gridChoice === 'custom' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input type="number" min={1} max={MAX_OUTPUT_SIZE} value={customW} style={s.numInput}
            onChange={(e) => setCustomW(Math.max(1, Math.min(MAX_OUTPUT_SIZE, parseInt(e.target.value) || 1)))} />
          <input type="number" min={1} max={MAX_OUTPUT_SIZE} value={customH} style={s.numInput}
            onChange={(e) => setCustomH(Math.max(1, Math.min(MAX_OUTPUT_SIZE, parseInt(e.target.value) || 1)))} />
        </div>
      )}

      <div style={{ ...s.label, marginTop: 16 }}>Detail</div>
      <div style={{ display: 'flex' }}>
        {([['mode', 'Clean pixels'], ['average', 'Preserve detail']] as const).map(([val, lbl], i) => (
          <div key={val} style={s.seg(samplingMode === val, i === 0)} onClick={() => setSamplingMode(val)}>{lbl}</div>
        ))}
      </div>

      <div style={{ ...s.label, marginTop: 16 }}>Palette size</div>
      <select style={s.select} value={paletteChoice} onChange={(e) => setPaletteChoice(e.target.value as PaletteChoice)}>
        {PALETTE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>

      <div style={{ ...s.label, marginTop: 16 }}>Cleanup</div>
      <label style={s.toggleRow}>
        <input type="checkbox" checked={removeIsolatedPixels} onChange={(e) => setRemoveIsolatedPixels(e.target.checked)} />
        Remove isolated pixels
      </label>
      <label style={s.toggleRow}>
        <input type="checkbox" checked={mergeSimilarColors} onChange={(e) => setMergeSimilarColors(e.target.checked)} />
        Merge similar colors
      </label>
      <label style={s.toggleRow}>
        <input type="checkbox" checked={removeAntiAliasing} onChange={(e) => setRemoveAntiAliasing(e.target.checked)} />
        Remove anti-aliasing
      </label>
      <label style={s.toggleRow}>
        <input type="checkbox" checked={transparentBackground} onChange={(e) => setTransparentBackground(e.target.checked)} />
        Transparent background
      </label>
      <label style={s.toggleRow}>
        <input type="checkbox" checked={removeBackground} onChange={(e) => setRemoveBackground(e.target.checked)} />
        Remove solid background
      </label>
    </>
  );

  if (multi) {
    return (
      <div style={s.scrim} onClick={onClose}>
        <div style={s.boxWide} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Import AI Art">
          <div style={s.wideHead}>
            <div>
              <div style={s.title}>Import AI Art</div>
              <div style={{ ...s.subtitle, marginBottom: 0 }}>Line up the frames, check the loop, then bring them into the editor as an animation.</div>
            </div>
            <span style={{ flex: 1 }} />
            {error && <span style={{ color: 'var(--danger, #e05555)', fontSize: 12 }}>{error}</span>}
          </div>
          <div
            style={s.wideBody}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={onDrop}
          >
            <div style={s.wideControls}>
              {controls}
              <div style={{ ...s.label, marginTop: 16 }}>Frames</div>
              <label style={s.toggleRow}>
                <input type="checkbox" checked={matchPixelSize} onChange={(e) => setMatchPixelSize(e.target.checked)} />
                Match pixel size
              </label>
              <p style={s.hint}>
                {gridChoice !== 'auto'
                  ? 'Every frame uses the grid size above.'
                  : matchPixelSize && engine.sharedCellSize
                    ? `All ${frames.length} frames read at ${+engine.sharedCellSize.toFixed(1)}px per pixel.`
                    : 'Each frame is detected on its own.'}
              </p>
              <div style={{ ...s.label, marginTop: 16 }}>Align by</div>
              <div style={{ display: 'flex' }}>
                {([['feet', 'Feet'], ['center', 'Center'], ['none', 'Off']] as const).map(([val, lbl], i) => (
                  <div key={val} style={s.seg(view.anchor === val, i === 0)} onClick={() => onViewChange({ anchor: val as Anchor })}>{lbl}</div>
                ))}
              </div>
              <div style={{ ...s.label, marginTop: 16 }}>Canvas</div>
              <div style={{ display: 'flex' }}>
                {([['auto', 'Fit frames'], ['fixed', 'Fixed']] as const).map(([val, lbl], i) => (
                  <div key={val} style={s.seg(canvasMode === val, i === 0)} onClick={() => setCanvasMode(val)}>{lbl}</div>
                ))}
              </div>
              {canvasMode === 'fixed' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input type="number" min={1} max={EDITOR_MAX} value={canvasW} style={s.numInput} aria-label="Canvas width"
                    onChange={(e) => setCanvasW(Math.max(1, Math.min(EDITOR_MAX, parseInt(e.target.value) || 1)))} />
                  <input type="number" min={1} max={EDITOR_MAX} value={canvasH} style={s.numInput} aria-label="Canvas height"
                    onChange={(e) => setCanvasH(Math.max(1, Math.min(EDITOR_MAX, parseInt(e.target.value) || 1)))} />
                </div>
              )}
            </div>
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
            />
          </div>
          <div style={s.wideFoot}>
            <span>
              {frames.length} frames · {composition.layout.width} × {composition.layout.height}px · {view.fps} fps
            </span>
            {tooBig && <span style={{ color: 'var(--danger, #e05555)' }}>The editor's canvas is limited to {EDITOR_MAX} × {EDITOR_MAX} — lower the scale or use a fixed canvas.</span>}
            <span style={{ flex: 1 }} />
            <button onClick={onClose} style={s.btn(false)}>Cancel</button>
            <button onClick={confirm} disabled={!ready || tooBig} style={s.btn(true, !ready || tooBig)}>
              Create animation · {frames.length} frames
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={s.box} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Import AI Art">
        <div style={s.title}>Import AI Art</div>
        <div style={s.subtitle}>Reconstruct an AI-generated pixel-art image into a clean, native-resolution sprite — or add several images to import an animation.</div>

        {/* Drop / upload zone */}
        <div
          style={s.drop(dragging)}
          onClick={() => void pickFiles()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {single
            ? <span style={{ color: 'var(--ink-2)' }}>{single.name} · {single.source.width} × {single.source.height}px — drop to replace, or add more images for an animation</span>
            : <span>Drop an image here — or several for an animation — or click to choose</span>}
        </div>
        {single && (
          <div style={{ marginTop: 8, textAlign: 'right' }}>
            <button style={s.preset} onClick={() => void pickFiles(1)}>+ Add frames</button>
          </div>
        )}

        {error && <div style={{ color: 'var(--danger, #e05555)', fontSize: 12, marginTop: 10 }}>{error}</div>}

        {single && singleResult && singleResult.poses > 1 && (
          <div style={{ marginTop: 12 }}>
            <SheetNotice poses={singleResult.poses} onSplit={() => dispatch({ type: 'expand', id: single.id, frames: splitFrame(single) })} />
          </div>
        )}

        {single && (
          <React.Fragment>
            <div style={{ display: 'flex', gap: 24, marginTop: 20 }}>
              {/* ── Controls column ── */}
              <div style={{ width: 200, flex: 'none' }}>{controls}</div>

              {/* ── Preview column ── */}
              <div style={{ flex: 1, display: 'flex', gap: 16 }}>
                <div style={s.previewPane}>
                  <div style={s.label}>Original</div>
                  <div style={s.canvasFrame}><canvas ref={origCanvasRef} style={s.previewCanvas} /></div>
                </div>
                <div style={s.previewPane}>
                  <div style={s.label}>Reconstructed</div>
                  <div style={s.canvasFrame}><canvas ref={resultCanvasRef} style={s.previewCanvas} /></div>
                </div>
              </div>
            </div>

            {/* ── Detected values (read-only) ── */}
            {det && singleResult && (
              <div style={{ marginTop: 20, borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
                <div style={s.detailRow}><span style={s.detailKey}>Source resolution</span><span>{single.source.width} × {single.source.height}px</span></div>
                <div style={s.detailRow}><span style={s.detailKey}>{gridChoice === 'pixel' ? 'Cell size' : 'Detected cell size'}</span><span>{+det.cellSize.toFixed(1)}px</span></div>
                <div style={s.detailRow}><span style={s.detailKey}>Output grid</span><span>{det.gridWidth} × {det.gridHeight}</span></div>
                <div style={s.detailRow}><span style={s.detailKey}>Detection confidence</span><span style={{ color: confidenceColor(det.confidence) }}>{det.confidence}</span></div>
                <div style={s.detailRow}><span style={s.detailKey}>Colors</span><span>{singleResult.colorCount}</span></div>
                {notice && (
                  <div role="status" style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: 'var(--amber)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ flex: 1 }}>{notice.message}</span>
                    {notice.suggestedPixelSize !== undefined && (
                      <button style={s.preset} onClick={() => usePixelSize(notice.suggestedPixelSize!)}>
                        Use {notice.suggestedPixelSize} px
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </React.Fragment>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={s.btn(false)}>Cancel</button>
          <button onClick={confirm} disabled={!ready} style={s.btn(true, !ready)}>Create sprite</button>
        </div>
      </div>
    </div>
  );
}
