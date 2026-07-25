// Standalone AI pixel-art downscaler.
//
// Same pipeline as the editor's "Import AI Art" dialog, presented as a
// viewport-filling tool: masthead, controls sidebar, two preview canvases that
// take all remaining height, and a status bar. Everything runs client-side —
// the image never leaves the browser.

import React from 'react';
import { loadImageData, encodePngInBrowser, downloadBytes } from '../src/lib/platform';
import {
  reconstructPixelArt,
  countDistinctColors,
  extractPalette,
  buildOptions,
  GRID_PRESETS,
  PALETTE_PRESETS,
  CLEAN_SPRITE_PRESET,
  HIGH_DETAIL_PRESET,
  MAX_OUTPUT_SIZE,
  type GridChoice,
  type PaletteChoice,
  type CleanupSettings,
  type SamplingMode,
  type RGBAImage,
  type GridDetectionResult,
} from '../src/lib/pixelReconstruction';

const REPO_URL = 'https://github.com/vardirhq/sindri-pixel';
const RELEASES_URL = `${REPO_URL}/releases`;

const EXPORT_SCALES = [1, 2, 4, 8, 16];

function confidenceColor(c: GridDetectionResult['confidence']): string {
  return c === 'high' ? 'var(--moss)' : c === 'medium' ? 'var(--amber)' : 'var(--red)';
}

/**
 * Paint an RGBAImage to fill `box` as closely as possible.
 *
 * Reconstructed sprites are drawn at an integer zoom with nearest-neighbor so
 * pixels stay square and crisp; source rasters (usually far larger than the
 * pane) are drawn at a fractional scale with smoothing, which is the honest
 * preview of what the input actually looks like.
 */
function paintFitted(
  canvas: HTMLCanvasElement | null,
  image: RGBAImage | null,
  box: { w: number; h: number },
  crisp: boolean,
): void {
  if (!canvas || !image || image.width === 0 || image.height === 0) return;
  if (box.w < 1 || box.h < 1) return;

  const fit = Math.min(box.w / image.width, box.h / image.height);
  const scale = crisp && fit >= 1 ? Math.floor(fit) : fit;
  const cssW = Math.max(1, Math.floor(image.width * scale));
  const cssH = Math.max(1, Math.floor(image.height * scale));

  // Render at device resolution so the nearest-neighbor grid stays sharp on
  // HiDPI displays, then let CSS lay it out in logical pixels.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scratch = document.createElement('canvas');
  scratch.width = image.width;
  scratch.height = image.height;
  const sctx = scratch.getContext('2d');
  if (!sctx) return;
  sctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);

  ctx.imageSmoothingEnabled = !crisp;
  ctx.drawImage(scratch, 0, 0, canvas.width, canvas.height);
}

/**
 * Repaint `image` into a canvas whenever it or the containing box changes.
 *
 * The frame and canvas are tracked as state via callback refs, not plain refs:
 * they only mount once an image is loaded, so an effect keyed on mount alone
 * would attach the observer to a null element and never paint anything.
 */
function useFittedCanvas(image: RGBAImage | null, crisp: boolean) {
  const [frameEl, setFrameEl] = React.useState<HTMLDivElement | null>(null);
  const [canvasEl, setCanvasEl] = React.useState<HTMLCanvasElement | null>(null);
  const [box, setBox] = React.useState({ w: 0, h: 0 });

  React.useEffect(() => {
    if (!frameEl) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(frameEl);
    return () => ro.disconnect();
  }, [frameEl]);

  React.useEffect(() => {
    paintFitted(canvasEl, image, box, crisp);
  }, [canvasEl, image, box, crisp]);

  return { frameRef: setFrameEl, canvasRef: setCanvasEl };
}

export function DownscaleApp() {
  const [fileName, setFileName] = React.useState('');
  const [source, setSource] = React.useState<RGBAImage | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [gridChoice, setGridChoice] = React.useState<GridChoice>('auto');
  const [customW, setCustomW] = React.useState(64);
  const [customH, setCustomH] = React.useState(64);
  const [samplingMode, setSamplingMode] = React.useState<SamplingMode>('mode');
  const [paletteChoice, setPaletteChoice] = React.useState<PaletteChoice>('auto');
  const [removeIsolatedPixels, setRemoveIsolatedPixels] = React.useState(true);
  const [mergeSimilarColors, setMergeSimilarColors] = React.useState(true);
  const [removeAntiAliasing, setRemoveAntiAliasing] = React.useState(true);
  const [transparentBackground, setTransparentBackground] = React.useState(true);
  const [exportScale, setExportScale] = React.useState(1);

  const applyPreset = (p: CleanupSettings) => {
    setSamplingMode(p.samplingMode);
    setPaletteChoice(p.paletteChoice);
    setRemoveIsolatedPixels(p.removeIsolatedPixels);
    setMergeSimilarColors(p.mergeSimilarColors);
    setRemoveAntiAliasing(p.removeAntiAliasing);
  };

  const options = React.useMemo(() => buildOptions({
    gridChoice, customWidth: customW, customHeight: customH, samplingMode, paletteChoice,
    mergeSimilarColors, removeAntiAliasing, removeIsolatedPixels, transparentBackground,
  }), [gridChoice, customW, customH, samplingMode, paletteChoice, mergeSimilarColors,
    removeAntiAliasing, removeIsolatedPixels, transparentBackground]);

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

  const original = useFittedCanvas(source, false);
  const output = useFittedCanvas(reconstruction?.result ?? null, true);

  const handleFile = React.useCallback(async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const data = await loadImageData(file);
      setSource({ data: data.data, width: data.width, height: data.height });
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that image.');
    } finally {
      setBusy(false);
    }
  }, []);

  const pickFile = React.useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/*';
    input.onchange = () => { const f = input.files?.[0]; if (f) void handleFile(f); };
    input.click();
  }, [handleFile]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  // Paste an image straight from the clipboard — the common path when the
  // source came out of an image generator in another tab.
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) void handleFile(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handleFile]);

  // Dropping anywhere in the window works once an image is loaded, so the
  // small "replace" affordance isn't the only target.
  React.useEffect(() => {
    const over = (e: DragEvent) => { e.preventDefault(); setDragging(true); };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDragging(false); };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) void handleFile(f);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [handleFile]);

  const downloadPng = async () => {
    if (!reconstruction) return;
    const img = reconstruction.result;
    try {
      const bytes = await encodePngInBrowser(Array.from(img.data), img.width, img.height, exportScale);
      const base = fileName.replace(/\.[^.]+$/, '') || 'downscaled';
      const suffix = exportScale > 1 ? `@${exportScale}x` : '';
      downloadBytes(bytes, `${base}-${img.width}x${img.height}${suffix}.png`, 'image/png');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PNG export failed');
    }
  };

  const det = reconstruction?.detection;
  const out = reconstruction?.result;

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <p className="eyebrow">Sindri Pixel</p>
          <h1>AI Pixel-Art Downscaler</h1>
        </div>
        <div className="divider" />
        <p className="tagline">
          Finds the implied grid in an AI-generated raster and resamples it to its real resolution.
        </p>
        <span className="spacer" />
        <a className="btn" href={REPO_URL} target="_blank" rel="noreferrer">Source</a>
      </header>

      <div className="work">
        {!source ? (
          <div
            className={`dropzone${dragging ? ' active' : ''}`}
            onClick={pickFile}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span className="big">
              {busy ? 'Reading image…' : 'Drop an AI-generated image here'}
            </span>
            <span className="hint">
              or click to choose a file, or paste from the clipboard · PNG, JPEG, WebP
            </span>
            <span className="hint">
              Processed entirely in this tab — nothing is uploaded.
            </span>
            {error && <span className="error">{error}</span>}
          </div>
        ) : (
          <>
            <aside className="sidebar">
              <div className="label">Preset</div>
              <div className="preset-row">
                <button onClick={() => applyPreset(CLEAN_SPRITE_PRESET)}>Clean sprite</button>
                <button onClick={() => applyPreset(HIGH_DETAIL_PRESET)}>High detail</button>
              </div>

              <div className="label">Grid size</div>
              <select value={gridChoice} onChange={(e) => setGridChoice(e.target.value as GridChoice)}>
                {GRID_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              {gridChoice === 'custom' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    type="number" min={1} max={MAX_OUTPUT_SIZE} value={customW}
                    onChange={(e) => setCustomW(Math.max(1, Math.min(MAX_OUTPUT_SIZE, parseInt(e.target.value) || 1)))}
                  />
                  <input
                    type="number" min={1} max={MAX_OUTPUT_SIZE} value={customH}
                    onChange={(e) => setCustomH(Math.max(1, Math.min(MAX_OUTPUT_SIZE, parseInt(e.target.value) || 1)))}
                  />
                </div>
              )}

              <div className="label">Detail</div>
              <div className="seg">
                {([['mode', 'Clean pixels'], ['average', 'Preserve detail']] as const).map(([val, lbl]) => (
                  <div
                    key={val}
                    className={samplingMode === val ? 'active' : undefined}
                    onClick={() => setSamplingMode(val)}
                  >
                    {lbl}
                  </div>
                ))}
              </div>

              <div className="label">Palette size</div>
              <select value={paletteChoice} onChange={(e) => setPaletteChoice(e.target.value as PaletteChoice)}>
                {PALETTE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>

              <div className="label">Cleanup</div>
              <label className="toggle">
                <input type="checkbox" checked={removeIsolatedPixels} onChange={(e) => setRemoveIsolatedPixels(e.target.checked)} />
                Remove isolated pixels
              </label>
              <label className="toggle">
                <input type="checkbox" checked={mergeSimilarColors} onChange={(e) => setMergeSimilarColors(e.target.checked)} />
                Merge similar colors
              </label>
              <label className="toggle">
                <input type="checkbox" checked={removeAntiAliasing} onChange={(e) => setRemoveAntiAliasing(e.target.checked)} />
                Remove anti-aliasing
              </label>
              <label className="toggle">
                <input type="checkbox" checked={transparentBackground} onChange={(e) => setTransparentBackground(e.target.checked)} />
                Transparent background
              </label>

              {det && (
                <div className="stats">
                  <div className="stat"><span className="k">Cell size</span><span>{Math.round(det.cellSize)}px</span></div>
                  <div className="stat"><span className="k">Output grid</span><span>{det.gridWidth} × {det.gridHeight}</span></div>
                  <div className="stat">
                    <span className="k">Confidence</span>
                    <span style={{ color: confidenceColor(det.confidence) }}>{det.confidence}</span>
                  </div>
                  <div className="stat"><span className="k">Colors</span><span>{reconstruction?.colorCount ?? 0}</span></div>
                  {reconstruction && reconstruction.palette.length > 0 && (
                    <div className="swatches">
                      {reconstruction.palette.slice(0, 48).map((hex) => (
                        <div key={hex} className="swatch" style={{ background: hex }} title={hex} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </aside>

            <main className="canvases">
              <div className="filebar">
                <span className="name">{fileName || 'pasted image'}</span>
                <button className="replace" onClick={pickFile}>replace</button>
                <span>{busy ? 'reading image…' : 'drop or paste to swap'}</span>
                {error && <span style={{ color: 'var(--red)' }}>{error}</span>}
              </div>

              <div className="panes">
                <div className="pane">
                  <div className="caption">
                    <span className="label" style={{ margin: 0 }}>Original</span>
                    <span className="dims">{source.width} × {source.height}px</span>
                  </div>
                  <div className="frame" ref={original.frameRef}>
                    <canvas ref={original.canvasRef} />
                  </div>
                </div>
                <div className="pane">
                  <div className="caption">
                    <span className="label" style={{ margin: 0 }}>Reconstructed</span>
                    <span className="dims">{out ? `${out.width} × ${out.height}px` : '—'}</span>
                  </div>
                  <div className="frame" ref={output.frameRef}>
                    <canvas ref={output.canvasRef} className="crisp" />
                  </div>
                </div>
              </div>
            </main>
          </>
        )}
      </div>

      <footer className="statusbar">
        <span className="plug">
          Also built into <a href={RELEASES_URL} target="_blank" rel="noreferrer">Sindri Pixel</a>,
          the desktop sprite editor — where the result lands on a canvas you can edit and animate.
        </span>
        <span className="spacer" />
        {source && (
          <>
            <label htmlFor="scale">Export</label>
            <select id="scale" value={exportScale} onChange={(e) => setExportScale(parseInt(e.target.value, 10))}>
              {EXPORT_SCALES.map((n) => <option key={n} value={n}>{n}×</option>)}
            </select>
            {out && <span>{out.width * exportScale} × {out.height * exportScale}px</span>}
            <button className="btn btn-primary" onClick={() => void downloadPng()} disabled={!reconstruction}>
              Download PNG
            </button>
          </>
        )}
      </footer>
    </div>
  );
}
