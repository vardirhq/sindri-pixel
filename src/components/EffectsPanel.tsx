// Outline and drop shadow, previewed live on the canvas while the options
// change; Apply keeps it (one undo step), Cancel puts the sprite back.

import React from 'react';

export type EffectKind = 'outline' | 'shadow';

export interface EffectOptions {
  kind: EffectKind;
  color: string;
  /** Outline: around the art, or on its own edge. */
  mode: 'outside' | 'inside';
  /** Outline: include diagonal neighbours. */
  diagonal: boolean;
  /** Shadow offset in pixels. */
  dx: number;
  dy: number;
  /** Every frame, or only the current one. */
  allFrames: boolean;
  /** Put the new pixels on a layer of their own, below the art. */
  ownLayer: boolean;
}

export function defaultEffect(kind: EffectKind, color: string, frameCount: number): EffectOptions {
  return { kind, color, mode: 'outside', diagonal: false, dx: 1, dy: 1, allFrames: frameCount > 1, ownLayer: kind === 'shadow' };
}

const S = {
  root: { position: 'absolute', top: 56, right: 16, zIndex: 40, width: 248, background: 'var(--paper-2)', border: '1px solid var(--rule-2)', boxShadow: '0 16px 36px rgba(0,0,0,0.45)', color: 'var(--ink)', fontFamily: 'var(--font-sans)' } as React.CSSProperties,
  head: { padding: '12px 14px 10px', borderBottom: '1px solid var(--rule)', fontFamily: 'var(--font-display)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
  body: { padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 } as React.CSSProperties,
  label: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 } as React.CSSProperties,
  seg: (on: boolean, first: boolean): React.CSSProperties => ({ flex: 1, textAlign: 'center', padding: '5px 0', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, background: on ? 'var(--paper-3)' : 'var(--paper)', color: on ? 'var(--ink)' : 'var(--ink-3)', border: '1px solid var(--rule-2)', borderLeft: first ? '1px solid var(--rule-2)' : 'none' }),
  swatch: (c: string, on: boolean): React.CSSProperties => ({ width: 18, height: 18, background: c, cursor: 'pointer', outline: on ? '2px solid var(--cyan)' : '1px solid var(--rule-2)', outlineOffset: on ? 1 : -1 }),
  toggle: (on: boolean): React.CSSProperties => ({ width: 26, height: 14, border: '1px solid var(--rule-2)', background: on ? 'var(--cyan)' : 'var(--paper-3)', position: 'relative', flex: 'none' }),
  btn: (primary: boolean): React.CSSProperties => ({ flex: 1, textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 12, padding: '7px 0', cursor: 'pointer', background: primary ? 'var(--ink)' : 'transparent', color: primary ? 'var(--paper)' : 'var(--ink-2)', border: `1px solid ${primary ? 'var(--ink)' : 'var(--rule-2)'}` }),
  step: { width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--rule-2)', cursor: 'pointer', color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', fontSize: 12, userSelect: 'none' } as React.CSSProperties,
};

function Toggle({ on, label, onChange, testId }: { on: boolean; label: string; onChange: (v: boolean) => void; testId: string }) {
  return (
    <div role="switch" aria-checked={on} data-fx={testId} onClick={() => onChange(!on)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--ink-2)' }}>
      <span style={S.toggle(on)}><span style={{ position: 'absolute', top: 1, left: on ? 13 : 1, width: 10, height: 10, background: on ? 'var(--paper)' : 'var(--ink-3)', transition: 'left 120ms' }} /></span>
      {label}
    </div>
  );
}

function Stepper({ label, value, onChange, testId }: { label: string; value: number; onChange: (v: number) => void; testId: string }) {
  const clamp = (v: number) => Math.max(-8, Math.min(8, v));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', width: 12 }}>{label}</span>
      <span role="button" style={S.step} onClick={() => onChange(clamp(value - 1))}>−</span>
      <span data-fx={testId} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, width: 22, textAlign: 'center' }}>{value}</span>
      <span role="button" style={S.step} onClick={() => onChange(clamp(value + 1))}>+</span>
    </div>
  );
}

export interface EffectsPanelProps {
  options: EffectOptions;
  swatches: string[];
  frameCount: number;
  onChange: (o: EffectOptions) => void;
  onApply: () => void;
  onCancel: () => void;
}

export function EffectsPanel({ options: o, swatches, frameCount, onChange, onApply, onCancel }: EffectsPanelProps) {
  const set = (patch: Partial<EffectOptions>) => onChange({ ...o, ...patch });
  React.useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onApply(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onApply, onCancel]);
  const colors = [...new Set([o.color, ...swatches].map((c) => c.toLowerCase()))].slice(0, 24);

  return (
    <div style={S.root} data-effects-panel={o.kind} role="dialog" aria-label={o.kind === 'outline' ? 'Outline' : 'Drop shadow'}>
      <div style={S.head}>
        {o.kind === 'outline' ? 'Outline' : 'Drop shadow'}
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)', letterSpacing: '0.1em' }}>● PREVIEW</span>
      </div>
      <div style={S.body}>
        <div>
          <div style={S.label}>Colour</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {colors.map((c) => <span key={c} data-fx-color={c} title={c} style={S.swatch(c, c === o.color.toLowerCase())} onClick={() => set({ color: c })} />)}
          </div>
        </div>
        {o.kind === 'outline' ? (
          <>
            <div>
              <div style={S.label}>Where</div>
              <div style={{ display: 'flex' }}>
                <span data-fx="outside" style={S.seg(o.mode === 'outside', true)} onClick={() => set({ mode: 'outside' })}>around it</span>
                <span data-fx="inside" style={S.seg(o.mode === 'inside', false)} onClick={() => set({ mode: 'inside' })}>on its edge</span>
              </div>
            </div>
            <Toggle testId="diagonal" on={o.diagonal} label="Round the corners" onChange={(diagonal) => set({ diagonal })} />
          </>
        ) : (
          <div>
            <div style={S.label}>Offset</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Stepper testId="dx" label="x" value={o.dx} onChange={(dx) => set({ dx })} />
              <Stepper testId="dy" label="y" value={o.dy} onChange={(dy) => set({ dy })} />
            </div>
          </div>
        )}
        {frameCount > 1 && <Toggle testId="all-frames" on={o.allFrames} label={`All ${frameCount} frames`} onChange={(allFrames) => set({ allFrames })} />}
        <Toggle testId="own-layer" on={o.ownLayer} label="On its own layer, below" onChange={(ownLayer) => set({ ownLayer })} />
        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <span role="button" data-fx="cancel" style={S.btn(false)} onClick={onCancel}>Cancel</span>
          <span role="button" data-fx="apply" style={S.btn(true)} onClick={onApply}>Apply ↵</span>
        </div>
      </div>
    </div>
  );
}
