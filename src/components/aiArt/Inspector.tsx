// Per-frame controls: position, scale, mirroring and hold time for the
// selected frame, plus what the detector found in its source.

import type { FrameResult } from './engine';
import type { FramePatch, FrameItem } from './frames';
import { Icon } from './icons';

export interface InspectorProps {
  frame: FrameItem;
  index: number;
  result: FrameResult | undefined;
  globalDuration: number;
  onPatch: (patch: FramePatch, coalesce?: string) => void;
}

const SCALE_MIN = 0.25;
const SCALE_MAX = 2;

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="aa-stepper">
      <span className="k">{label}</span>
      <button type="button" aria-label={`${label} −1`} onClick={() => onChange(value - 1)}><Icon name="minus" size={10} /></button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        aria-label={label}
      />
      <button type="button" aria-label={`${label} +1`} onClick={() => onChange(value + 1)}><Icon name="plus" size={10} /></button>
    </label>
  );
}

export function Inspector({ frame, index, result, globalDuration, onPatch }: InspectorProps) {
  const det = result?.detection;
  const moved = frame.offsetX !== 0 || frame.offsetY !== 0;
  return (
    <aside className="aa-inspector" aria-label={`Frame ${index + 1} settings`}>
      <div className="aa-insp-head">
        <span className="aa-insp-title">Frame {String(index + 1).padStart(2, '0')}</span>
        <span className="aa-insp-name" title={frame.name}>{frame.name}</span>
      </div>

      <section>
        <div className="aa-label-row">
          <span className="label">Position</span>
          {moved && <button type="button" className="aa-link" onClick={() => onPatch({ offsetX: 0, offsetY: 0 })}>Reset</button>}
        </div>
        <Stepper label="X" value={frame.offsetX} onChange={(v) => onPatch({ offsetX: v }, 'x')} />
        <Stepper label="Y" value={frame.offsetY} onChange={(v) => onPatch({ offsetY: v }, 'y')} />
        <p className="aa-hint">Drag on the stage, or use the arrow keys (⇧ for 5px).</p>
      </section>

      <section>
        <div className="aa-label-row">
          <span className="label">Scale</span>
          <span className="aa-value">{frame.scale.toFixed(2)}×</span>
        </div>
        <input
          type="range"
          className="aa-range"
          min={SCALE_MIN}
          max={SCALE_MAX}
          step={0.05}
          value={frame.scale}
          onChange={(e) => onPatch({ scale: parseFloat(e.target.value) }, 'scale')}
          aria-label="Scale"
        />
        <div className="aa-label-row">
          <p className="aa-hint">Re-read from the source at a new pixel size, so it stays crisp.</p>
          {frame.scale !== 1 && <button type="button" className="aa-link" onClick={() => onPatch({ scale: 1 })}>1×</button>}
        </div>
      </section>

      <section>
        <span className="label">Mirror</span>
        <button
          type="button"
          className={frame.flipX ? 'aa-chip active' : 'aa-chip'}
          aria-pressed={frame.flipX}
          onClick={() => onPatch({ flipX: !frame.flipX })}
        >
          <Icon name="flip" /> Flip horizontally
        </button>
      </section>

      <section>
        <div className="aa-label-row">
          <span className="label">Hold</span>
          {frame.duration !== null && <button type="button" className="aa-link" onClick={() => onPatch({ duration: null })}>Use frame rate</button>}
        </div>
        <label className="aa-suffix">
          <input
            type="number"
            min={10}
            max={60000}
            step={10}
            value={frame.duration ?? ''}
            placeholder={String(globalDuration)}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              onPatch({ duration: Number.isFinite(v) && v > 0 ? Math.min(60000, v) : null }, 'duration');
            }}
            aria-label="Hold time in milliseconds"
          />
          <span>ms</span>
        </label>
      </section>

      {det && result && (
        <section className="aa-readout">
          <div><span className="k">Source</span><span>{frame.source.width} × {frame.source.height}</span></div>
          <div><span className="k">Pixel size</span><span>{+det.cellSize.toFixed(1)}px</span></div>
          <div><span className="k">Sprite</span><span>{result.sprite.width} × {result.sprite.height}</span></div>
          <div><span className="k">Colors</span><span>{result.colorCount}</span></div>
        </section>
      )}
    </aside>
  );
}
