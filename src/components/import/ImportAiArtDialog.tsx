import React from 'react';
import { loadImageData } from '../../lib/platform';
import {
  reconstructPixelArt,
  countDistinctColors,
  extractPalette,
  type PixelArtOptions,
  type RGBAImage,
  type GridDetectionResult,
} from '../../lib/pixelReconstruction';

// ---------------------------------------------------------------------------
// Import AI Art dialog
//
// Reconstructs an AI-generated "pixel art" raster into a true low-resolution
// sprite. All processing is client-side (Canvas + plain TS): no server round
// trip, no external API calls.
// ---------------------------------------------------------------------------

export interface AiArtImportResult {
  image: RGBAImage;
  palette: string[];
  name: string;
}

interface ImportAiArtDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: AiArtImportResult) => void;
}

type GridChoice = 'auto' | '16' | '32' | '48' | '64' | '128' | 'custom';
type PaletteChoice = 'auto' | '8' | '16' | '32' | '64' | 'original';

const GRID_PRESETS: { value: GridChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: '16', label: '16 × 16' },
  { value: '32', label: '32 × 32' },
  { value: '48', label: '48 × 48' },
  { value: '64', label: '64 × 64' },
  { value: '128', label: '128 × 128' },
  { value: 'custom', label: 'Custom…' },
];

const PALETTE_PRESETS: { value: PaletteChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: '8', label: '8' },
  { value: '16', label: '16' },
  { value: '32', label: '32' },
  { value: '64', label: '64' },
  { value: 'original', label: 'Original' },
];

const PREVIEW_BOX = 240; // px, both preview panes are square

const s = {
  scrim: { position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
  box: { background: 'var(--paper-2)', border: '1px solid var(--rule-2)', width: 720, maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', padding: '24px 24px 20px', boxShadow: '0 12px 32px rgba(0,0,0,0.5)', color: 'var(--ink)', fontFamily: 'var(--font-sans)' } as React.CSSProperties,
  title: { fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, marginBottom: 4 } as React.CSSProperties,
  subtitle: { fontSize: 12, color: 'var(--ink-3)', marginBottom: 20 } as React.CSSProperties,
  label: { fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, fontFamily: 'var(--font-display)' } as React.CSSProperties,
  drop: (active: boolean): React.CSSProperties => ({ border: `1px dashed ${active ? 'var(--ink-2)' : 'var(--rule-2)'}`, background: active ? 'var(--paper-3)' : 'var(--paper)', padding: '28px 16px', textAlign: 'center', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 12.5 }),
  select: { background: 'var(--paper)', border: '1px solid var(--rule-2)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 12.5, padding: '6px 8px', width: '100%', boxSizing: 'border-box' } as React.CSSProperties,
  numInput: { background: 'var(--paper)', border: '1px solid var(--rule-2)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 12.5, padding: '6px 8px', width: '100%', boxSizing: 'border-box' } as React.CSSProperties,
  detailRow: { display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11.5, padding: '3px 0', color: 'var(--ink-2)' } as React.CSSProperties,
  detailKey: { color: 'var(--ink-4)' } as React.CSSProperties,
  toggleRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer', padding: '4px 0' } as React.CSSProperties,
  previewPane: { flex: 1 } as React.CSSProperties,
  canvasFrame: { width: PREVIEW_BOX, height: PREVIEW_BOX, background: 'var(--paper)', border: '1px solid var(--rule-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } as React.CSSProperties,
  btn: (primary: boolean, disabled = false): React.CSSProperties => ({ fontFamily: 'var(--font-display)', fontSize: 12.5, padding: '7px 16px', background: primary ? 'var(--ink)' : 'transparent', border: `1px solid ${primary ? 'var(--ink)' : 'var(--rule-2)'}`, color: primary ? 'var(--paper)' : 'var(--ink-2)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }),
};

function confidenceColor(c: GridDetectionResult['confidence']): string {
  return c === 'high' ? 'var(--ink-2)' : c === 'medium' ? 'var(--amber)' : 'var(--danger, #e05555)';
}

/** Draw an RGBAImage into a canvas, scaled to fit `PREVIEW_BOX` with nearest-
 *  neighbor sampling and no upscaling beyond an integer zoom. */
function paintPreview(canvas: HTMLCanvasElement | null, image: RGBAImage | null): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!image || image.width === 0 || image.height === 0) return;

  const scale = Math.max(1, Math.min(PREVIEW_BOX / image.width, PREVIEW_BOX / image.height));
  const drawW = Math.round(image.width * scale);
  const drawH = Math.round(image.height * scale);
  canvas.width = drawW;
  canvas.height = drawH;
  ctx.imageSmoothingEnabled = false;

  // Blit source pixels 1:1 into a scratch canvas, then scale up.
  const scratch = document.createElement('canvas');
  scratch.width = image.width;
  scratch.height = image.height;
  const sctx = scratch.getContext('2d');
  if (!sctx) return;
  sctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, drawW, drawH);
}

export function ImportAiArtDialog({ open, onClose, onConfirm }: ImportAiArtDialogProps) {
  const [fileName, setFileName] = React.useState<string>('');
  const [source, setSource] = React.useState<RGBAImage | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [gridChoice, setGridChoice] = React.useState<GridChoice>('auto');
  const [customW, setCustomW] = React.useState(64);
  const [customH, setCustomH] = React.useState(64);
  const [paletteChoice, setPaletteChoice] = React.useState<PaletteChoice>('auto');
  const [removeIsolatedPixels, setRemoveIsolatedPixels] = React.useState(true);
  const [mergeSimilarColors, setMergeSimilarColors] = React.useState(true);
  const [removeAntiAliasing, setRemoveAntiAliasing] = React.useState(true);
  const [transparentBackground, setTransparentBackground] = React.useState(true);

  const origCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const resultCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // Reset everything when the dialog is (re)opened.
  React.useEffect(() => {
    if (open) {
      setFileName(''); setSource(null); setDragging(false); setError(null);
      setGridChoice('auto'); setCustomW(64); setCustomH(64); setPaletteChoice('auto');
      setRemoveIsolatedPixels(true); setMergeSimilarColors(true);
      setRemoveAntiAliasing(true); setTransparentBackground(true);
    }
  }, [open]);

  const options = React.useMemo<PixelArtOptions>(() => {
    let targetWidth: number | undefined;
    let targetHeight: number | undefined;
    let autoDetectGrid = true;
    if (gridChoice === 'custom') {
      autoDetectGrid = false; targetWidth = customW; targetHeight = customH;
    } else if (gridChoice !== 'auto') {
      autoDetectGrid = false;
      const n = parseInt(gridChoice, 10);
      targetWidth = n; targetHeight = n;
    }

    let paletteSize: number | undefined;
    if (paletteChoice === 'original') paletteSize = 100000; // effectively no quantization
    else if (paletteChoice !== 'auto') paletteSize = parseInt(paletteChoice, 10);

    return {
      autoDetectGrid, targetWidth, targetHeight, paletteSize,
      mergeSimilarColors, removeAntiAliasing, removeIsolatedPixels, transparentBackground,
    };
  }, [gridChoice, customW, customH, paletteChoice, mergeSimilarColors, removeAntiAliasing, removeIsolatedPixels, transparentBackground]);

  // Recompute the reconstruction whenever the source or options change.
  const reconstruction = React.useMemo(() => {
    if (!source) return null;
    try {
      const { result, detection } = reconstructPixelArt(source, options);
      return { result, detection, palette: extractPalette(result), colorCount: countDistinctColors(result) };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reconstruction failed');
      return null;
    }
  }, [source, options]);

  // Paint both previews after each render.
  React.useEffect(() => { paintPreview(origCanvasRef.current, source); }, [source, open]);
  React.useEffect(() => { paintPreview(resultCanvasRef.current, reconstruction?.result ?? null); }, [reconstruction, open]);

  const handleFile = React.useCallback(async (file: File) => {
    setError(null);
    try {
      const data = await loadImageData(file);
      setSource({ data: data.data, width: data.width, height: data.height });
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that image.');
    }
  }, []);

  const pickFileInput = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/*';
    input.onchange = () => { const f = input.files?.[0]; if (f) void handleFile(f); };
    input.click();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  const confirm = () => {
    if (!source || !reconstruction) return;
    const base = fileName.replace(/\.[^.]+$/, '') || 'ai-import';
    onConfirm({ image: reconstruction.result, palette: reconstruction.palette, name: `${base}.spr` });
  };

  if (!open) return null;

  const det = reconstruction?.detection;

  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={s.box} onClick={(e) => e.stopPropagation()}>
        <div style={s.title}>Import AI Art</div>
        <div style={s.subtitle}>Reconstruct an AI-generated pixel-art image into a clean, native-resolution sprite.</div>

        {/* Drop / upload zone */}
        <div
          style={s.drop(dragging)}
          onClick={pickFileInput}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {source
            ? <span style={{ color: 'var(--ink-2)' }}>{fileName} · {source.width} × {source.height}px — click or drop to replace</span>
            : <span>Drop an image here, or click to choose a file</span>}
        </div>

        {error && <div style={{ color: 'var(--danger, #e05555)', fontSize: 12, marginTop: 10 }}>{error}</div>}

        {source && (
          <React.Fragment>
            <div style={{ display: 'flex', gap: 24, marginTop: 20 }}>
              {/* ── Controls column ── */}
              <div style={{ width: 200, flex: 'none' }}>
                <div style={s.label}>Grid size</div>
                <select style={s.select} value={gridChoice} onChange={(e) => setGridChoice(e.target.value as GridChoice)}>
                  {GRID_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                {gridChoice === 'custom' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input type="number" min={1} max={512} value={customW} style={s.numInput}
                      onChange={(e) => setCustomW(Math.max(1, Math.min(512, parseInt(e.target.value) || 1)))} />
                    <input type="number" min={1} max={512} value={customH} style={s.numInput}
                      onChange={(e) => setCustomH(Math.max(1, Math.min(512, parseInt(e.target.value) || 1)))} />
                  </div>
                )}

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
              </div>

              {/* ── Preview column ── */}
              <div style={{ flex: 1, display: 'flex', gap: 16 }}>
                <div style={s.previewPane}>
                  <div style={s.label}>Original</div>
                  <div style={s.canvasFrame}><canvas ref={origCanvasRef} style={{ imageRendering: 'pixelated' }} /></div>
                </div>
                <div style={s.previewPane}>
                  <div style={s.label}>Reconstructed</div>
                  <div style={s.canvasFrame}><canvas ref={resultCanvasRef} style={{ imageRendering: 'pixelated' }} /></div>
                </div>
              </div>
            </div>

            {/* ── Detected values (read-only) ── */}
            {det && (
              <div style={{ marginTop: 20, borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
                <div style={s.detailRow}><span style={s.detailKey}>Source resolution</span><span>{source.width} × {source.height}px</span></div>
                <div style={s.detailRow}><span style={s.detailKey}>Detected cell size</span><span>{Math.round(det.cellSize)}px</span></div>
                <div style={s.detailRow}><span style={s.detailKey}>Output grid</span><span>{det.gridWidth} × {det.gridHeight}</span></div>
                <div style={s.detailRow}><span style={s.detailKey}>Detection confidence</span><span style={{ color: confidenceColor(det.confidence) }}>{det.confidence}</span></div>
                <div style={s.detailRow}><span style={s.detailKey}>Colors</span><span>{reconstruction?.colorCount ?? 0}</span></div>
              </div>
            )}
          </React.Fragment>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={s.btn(false)}>Cancel</button>
          <button onClick={confirm} disabled={!reconstruction} style={s.btn(true, !reconstruction)}>Create sprite</button>
        </div>
      </div>
    </div>
  );
}
