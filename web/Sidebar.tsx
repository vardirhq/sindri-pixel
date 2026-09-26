// Left column: the downscale settings (shared by both modes — in Animate
// they apply to every frame) and, in Animate, how frames line up.

import React from 'react';
import {
  CLEAN_SPRITE_PRESET,
  GRID_PRESETS,
  HIGH_DETAIL_PRESET,
  MAX_OUTPUT_SIZE,
  MAX_PIXEL_SIZE,
  MIN_PIXEL_SIZE,
  PALETTE_PRESETS,
  clampPixelSize,
  type CleanupSettings,
  type GridChoice,
  type PaletteChoice,
} from '../src/lib/pixelReconstruction';
import type { Settings } from './settings';

export type Mode = 'downscale' | 'animate';

interface SidebarProps {
  mode: Mode;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  /** Extra content under the settings (stats, notices). */
  children?: React.ReactNode;
  sharedCellSize: number | null;
  frameCount: number;
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([val, text]) => (
        <button
          key={val}
          type="button"
          role="radio"
          aria-checked={value === val}
          className={value === val ? 'active' : undefined}
          onClick={() => onChange(val)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

const clampInt = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, parseInt(v, 10) || lo));

export function Sidebar({ mode, settings: s, update, children, sharedCellSize, frameCount }: SidebarProps) {
  const applyPreset = (p: CleanupSettings) => update({ ...p });
  return (
    <aside className="sidebar">
      <div className="label">Preset</div>
      <div className="preset-row">
        <button type="button" onClick={() => applyPreset(CLEAN_SPRITE_PRESET)}>Clean sprite</button>
        <button type="button" onClick={() => applyPreset(HIGH_DETAIL_PRESET)}>High detail</button>
      </div>

      <div className="label">Grid size</div>
      <select value={s.gridChoice} onChange={(e) => update({ gridChoice: e.target.value as GridChoice })}>
        {GRID_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      {s.gridChoice === 'pixel' && (
        <div className="inline-field">
          <input
            type="number" min={MIN_PIXEL_SIZE} max={MAX_PIXEL_SIZE} step={0.1} value={s.pixelSize}
            aria-label="Source pixels per art pixel"
            onChange={(e) => update({ pixelSize: clampPixelSize(parseFloat(e.target.value)) })}
          />
          <span>px</span>
        </div>
      )}
      {s.gridChoice === 'custom' && (
        <div className="inline-field">
          <input
            type="number" min={1} max={MAX_OUTPUT_SIZE} value={s.customWidth} aria-label="Output width"
            onChange={(e) => update({ customWidth: clampInt(e.target.value, 1, MAX_OUTPUT_SIZE) })}
          />
          <span>×</span>
          <input
            type="number" min={1} max={MAX_OUTPUT_SIZE} value={s.customHeight} aria-label="Output height"
            onChange={(e) => update({ customHeight: clampInt(e.target.value, 1, MAX_OUTPUT_SIZE) })}
          />
        </div>
      )}

      <div className="label">Detail</div>
      <Seg
        label="Detail"
        value={s.samplingMode}
        options={[['mode', 'Clean pixels'], ['average', 'Preserve detail']] as const}
        onChange={(samplingMode) => update({ samplingMode })}
      />

      <div className="label">Palette size</div>
      <select value={s.paletteChoice} onChange={(e) => update({ paletteChoice: e.target.value as PaletteChoice })}>
        {PALETTE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>

      <div className="label">Cleanup</div>
      <Toggle checked={s.removeIsolatedPixels} onChange={(v) => update({ removeIsolatedPixels: v })}>Remove isolated pixels</Toggle>
      <Toggle checked={s.mergeSimilarColors} onChange={(v) => update({ mergeSimilarColors: v })}>Merge similar colors</Toggle>
      <Toggle checked={s.removeAntiAliasing} onChange={(v) => update({ removeAntiAliasing: v })}>Remove anti-aliasing</Toggle>
      <Toggle checked={s.transparentBackground} onChange={(v) => update({ transparentBackground: v })}>Transparent background</Toggle>
      <Toggle checked={s.removeBackground} onChange={(v) => update({ removeBackground: v })}>Remove solid background</Toggle>

      {mode === 'animate' && (
        <>
          <div className="label">Frames</div>
          <Toggle checked={s.matchPixelSize} onChange={(v) => update({ matchPixelSize: v })}>Match pixel size</Toggle>
          <p className="hint">
            {s.gridChoice !== 'auto'
              ? 'Every frame uses the grid size above.'
              : s.matchPixelSize && sharedCellSize && frameCount > 1
                ? `All ${frameCount} frames read at ${+sharedCellSize.toFixed(1)}px per pixel, so the sprite keeps one size.`
                : 'Each frame is detected on its own.'}
          </p>

          <div className="label">Align by</div>
          <Seg
            label="Align frames by"
            value={s.anchor}
            options={[['feet', 'Feet'], ['center', 'Center'], ['none', 'Off']] as const}
            onChange={(anchor) => update({ anchor })}
          />

          <div className="label">Canvas</div>
          <Seg
            label="Canvas size"
            value={s.canvasMode}
            options={[['auto', 'Fit frames'], ['fixed', 'Fixed']] as const}
            onChange={(canvasMode) => update({ canvasMode })}
          />
          {s.canvasMode === 'fixed' && (
            <div className="inline-field">
              <input
                type="number" min={1} max={MAX_OUTPUT_SIZE} value={s.canvasWidth} aria-label="Canvas width"
                onChange={(e) => update({ canvasWidth: clampInt(e.target.value, 1, MAX_OUTPUT_SIZE) })}
              />
              <span>×</span>
              <input
                type="number" min={1} max={MAX_OUTPUT_SIZE} value={s.canvasHeight} aria-label="Canvas height"
                onChange={(e) => update({ canvasHeight: clampInt(e.target.value, 1, MAX_OUTPUT_SIZE) })}
              />
            </div>
          )}
        </>
      )}

      {children}
    </aside>
  );
}
