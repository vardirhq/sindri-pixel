// Standalone AI pixel-art downscaler.
//
// Same pipeline as the editor's "Import AI Art" dialog, presented as a full
// page instead of a modal: drop an AI-generated raster, tune the grid /
// palette / cleanup knobs, download a true low-resolution PNG. Everything
// runs client-side — the image never leaves the browser.

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

/** Paint an RGBAImage into a canvas at an integer zoom that fits `box` px. */
function paintPreview(canvas: HTMLCanvasElement | null, image: RGBAImage | null, box: number): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!image || image.width === 0 || image.height === 0) return;

  const scale = Math.max(1, Math.min(box / image.width, box / image.height));
  const drawW = Math.round(image.width * scale);
  const drawH = Math.round(image.height * scale);
  canvas.width = drawW;
  canvas.height = drawH;

  const scratch = document.createElement('canvas');
  scratch.width = image.width;
  scratch.height = image.height;
  const sctx = scratch.getContext('2d');
  if (!sctx) return;
  sctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, drawW, drawH);
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

  const origCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const resultCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

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

  React.useEffect(() => { paintPreview(origCanvasRef.current, source, 512); }, [source]);
  React.useEffect(() => { paintPreview(resultCanvasRef.current, reconstruction?.result ?? null, 512); }, [reconstruction]);

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

  const pickFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/*';
    input.onchange = () => { const f = input.files?.[0]; if (f) void handleFile(f); };
    input.click();
  };

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

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <p className="eyebrow">Sindri Pixel</p>
          <h1>AI Pixel-Art Downscaler</h1>
          <p className="tagline">
            AI image models produce pixel art that only <em>looks</em> pixelated — a big raster with a
            wobbly implied grid and thousands of colors. This finds the grid, resamples to the real
            resolution, and cleans up the palette.
          </p>
        </div>
        <div className="masthead-links">
          <a className="btn" href={REPO_URL} target="_blank" rel="noreferrer">Source</a>
          <a className="btn" href={RELEASES_URL} target="_blank" rel="noreferrer">Desktop app</a>
        </div>
      </header>

      <div
        className={`drop${dragging ? ' active' : ''}`}
        onClick={pickFile}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {source
          ? <span>{fileName || 'pasted image'} · {source.width} × {source.height}px — click, drop or paste to replace</span>
          : <span>Drop an image here, click to choose a file, or paste from the clipboard</span>}
        <span className="hint">
          {busy ? 'reading image…' : 'PNG · JPEG · WebP — processed locally, never uploaded'}
        </span>
      </div>

      {error && <div className="error">{error}</div>}

      {source && (
        <>
          <div className="workspace">
            <div className="controls">
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
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="previews">
                <div className="pane">
                  <div className="label">Original</div>
                  <div className="frame"><canvas ref={origCanvasRef} /></div>
                </div>
                <div className="pane">
                  <div className="label">Reconstructed</div>
                  <div className="frame"><canvas ref={resultCanvasRef} /></div>
                </div>
              </div>

              {det && (
                <div className="stats">
                  <div className="stat"><span className="k">Source resolution</span><span>{source.width} × {source.height}px</span></div>
                  <div className="stat"><span className="k">Detected cell size</span><span>{Math.round(det.cellSize)}px</span></div>
                  <div className="stat"><span className="k">Output grid</span><span>{det.gridWidth} × {det.gridHeight}</span></div>
                  <div className="stat">
                    <span className="k">Detection confidence</span>
                    <span style={{ color: confidenceColor(det.confidence) }}>{det.confidence}</span>
                  </div>
                  <div className="stat"><span className="k">Colors</span><span>{reconstruction?.colorCount ?? 0}</span></div>
                  {reconstruction && reconstruction.palette.length > 0 && (
                    <div className="swatches">
                      {reconstruction.palette.slice(0, 64).map((hex) => (
                        <div key={hex} className="swatch" style={{ background: hex }} title={hex} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="export-bar">
            <label htmlFor="scale">Export scale</label>
            <select id="scale" value={exportScale} onChange={(e) => setExportScale(parseInt(e.target.value, 10))}>
              {EXPORT_SCALES.map((n) => <option key={n} value={n}>{n}×</option>)}
            </select>
            {reconstruction && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-4)' }}>
                {reconstruction.result.width * exportScale} × {reconstruction.result.height * exportScale}px
              </span>
            )}
            <span className="spacer" />
            <button className="btn btn-primary" onClick={() => void downloadPng()} disabled={!reconstruction}>
              Download PNG
            </button>
          </div>
        </>
      )}

      <section className="prose">
        <div>
          <h2>Grid detection</h2>
          <p>
            The implied cell size is found by scoring candidate grids on within-cell color variance —
            the right grid is the one whose cells are internally flat. No model, no guessing at a
            "nice" number; it is deterministic and reports its own confidence.
          </p>
        </div>
        <div>
          <h2>Honest downscaling</h2>
          <p>
            Each cell collapses to one pixel: center-weighted mode for flat, readable sprites, or an
            alpha-weighted average when you want gradients and shading preserved. Anti-aliased
            fringes, stray pixels and near-duplicate colors are cleaned up afterwards.
          </p>
        </div>
        <div>
          <h2>Local-first</h2>
          <p>
            Everything happens in this tab — no upload, no account, no server. The same pipeline
            ships inside <a href={RELEASES_URL} target="_blank" rel="noreferrer">Sindri Pixel</a>, the
            desktop sprite editor, where the result lands directly on a canvas you can edit and
            animate.
          </p>
        </div>
      </section>

      <footer className="footer">
        <span>Part of the Sindri 2D game engine · MIT</span>
        <span><a href={REPO_URL} target="_blank" rel="noreferrer">github.com/vardirhq/sindri-pixel</a></span>
      </footer>
    </div>
  );
}
