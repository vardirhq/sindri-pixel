// Downscale mode: the selected frame's source next to its reconstruction,
// plus what the detector found.

import {
  countDistinctColors,
  detectionNotice,
  extractPalette,
  type GridDetectionResult,
  type RGBAImage,
} from '../src/lib/pixelReconstruction';
import { useFittedCanvas } from '../src/components/aiArt';

function confidenceColor(c: GridDetectionResult['confidence']): string {
  return c === 'high' ? 'var(--moss)' : c === 'medium' ? 'var(--amber)' : 'var(--red)';
}

export function DownscaleStats({
  source,
  sprite,
  detection,
  onUsePixelSize,
}: {
  source: RGBAImage;
  sprite: RGBAImage;
  detection: GridDetectionResult;
  onUsePixelSize: (px: number) => void;
}) {
  const palette = extractPalette(sprite);
  const notice = detectionNotice(detection, source);
  return (
    <div className="stats">
      <div className="stat"><span className="k">Cell size</span><span>{+detection.cellSize.toFixed(1)}px</span></div>
      <div className="stat"><span className="k">Output grid</span><span>{detection.gridWidth} × {detection.gridHeight}</span></div>
      <div className="stat">
        <span className="k">Confidence</span>
        <span style={{ color: confidenceColor(detection.confidence) }}>{detection.confidence}</span>
      </div>
      <div className="stat"><span className="k">Colors</span><span>{countDistinctColors(sprite)}</span></div>
      {notice && (
        <div className="notice" role="status">
          {notice.message}
          {notice.suggestedPixelSize !== undefined && (
            <button type="button" onClick={() => onUsePixelSize(notice.suggestedPixelSize!)}>
              Use {notice.suggestedPixelSize} px
            </button>
          )}
        </div>
      )}
      {palette.length > 0 && (
        <div className="swatches">
          {palette.slice(0, 48).map((hex) => (
            <div key={hex} className="swatch" style={{ background: hex }} title={hex} />
          ))}
        </div>
      )}
    </div>
  );
}

export function DownscaleView({ source, sprite, name }: { source: RGBAImage; sprite: RGBAImage | null; name: string }) {
  const original = useFittedCanvas(source, false);
  const output = useFittedCanvas(sprite, true);
  return (
    <div className="panes" aria-label={name}>
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
          <span className="dims">{sprite ? `${sprite.width} × ${sprite.height}px` : '—'}</span>
        </div>
        <div className="frame" ref={output.frameRef}>
          <canvas ref={output.canvasRef} className="crisp" />
        </div>
      </div>
    </div>
  );
}
