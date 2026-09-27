// The lesson maker: build a lesson by doing it.
//
// Right column: the course (a start card and the steps, each with a picture
// of its result), the big record button, and an inspector for the selected
// step — its words, its goals as "parts" you can snap on or pull off, where
// it points, and which tools it allows. Above the canvas, the maker bar
// carries the lesson's name, the record light, and Play.

import React from 'react';
import type { SymmetryMode, Tool } from '../../types';
import {
  describeCheck, familyOf, toolName,
  type Check, type ColorFamily, type MakerDraft, type MakerStep, type SpotlightTarget,
} from '../../lib/lessons';
import './maker.css';

const TOOLS: Tool[] = ['pencil', 'eraser', 'shade', 'fill', 'picker', 'line', 'rect', 'circle', 'select', 'wand', 'lasso', 'move', 'pan'];
const FAMILIES: ColorFamily[] = ['dark', 'light', 'grey', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'];
const SPOTS: (SpotlightTarget | '')[] = ['', 'canvas', 'toolbar', 'palette', 'layers', 'timeline'];

export interface MakerEditorState {
  tool: Tool;
  color: string;
  frameCount: number;
  tagCount: number;
  onion: boolean;
  symmetry: SymmetryMode;
  hasSelection: boolean;
}

export interface MakerPanelProps {
  draft: MakerDraft;
  /** Selected card: -1 is the start card. */
  selected: number;
  recording: boolean;
  /** Id of a step that just landed (for its stamp animation). */
  stamped: string | null;
  editor: MakerEditorState;
  onPlay: (fromStep: number) => void;
  onChange: (patch: Partial<MakerDraft>) => void;
  onChangeStep: (i: number, patch: Partial<MakerStep>) => void;
  onRecapture: (i: number) => void;
  onRegionFromSelection: (i: number) => void;
  onStartCanvas: (kind: 'blank16' | 'blank32' | 'mine') => void;
  onExport: () => void;
}

const S = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'var(--font-sans)', color: 'var(--ink)' } as React.CSSProperties,
  head: { padding: '14px 16px 12px', borderBottom: '1px solid var(--rule-2)', background: 'var(--paper-2)' } as React.CSSProperties,
  kicker: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 } as React.CSSProperties,
  titleInput: { width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: 16, padding: 0 } as React.CSSProperties,
  row: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 } as React.CSSProperties,
  btn: (variant: 'primary' | 'ghost' | 'rec' | 'done'): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '7px 12px', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 12, whiteSpace: 'nowrap',
    border: `1px solid ${variant === 'primary' ? 'var(--cyan)' : variant === 'rec' || variant === 'done' ? 'var(--red)' : 'var(--rule-2)'}`,
    background: variant === 'primary' ? 'var(--cyan)' : variant === 'done' ? 'var(--red)' : 'transparent',
    color: variant === 'primary' || variant === 'done' ? 'var(--paper)' : variant === 'rec' ? 'var(--red)' : 'var(--ink-2)',
  }),
  course: { flex: 1, minHeight: 120, overflowY: 'auto', padding: '8px 0' } as React.CSSProperties,
  card: (selected: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', cursor: 'pointer', position: 'relative',
    background: selected ? 'var(--paper-3)' : 'transparent', borderLeft: `2px solid ${selected ? 'var(--red)' : 'transparent'}`,
  }),
  num: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)', width: 18, flex: 'none' } as React.CSSProperties,
  thumb: { width: 36, height: 36, flex: 'none', background: '#0a0e14', border: '1px solid var(--rule-2)', imageRendering: 'pixelated', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', fontSize: 15 } as React.CSSProperties,
  cardTitle: { fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as React.CSSProperties,
  cardMeta: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)', marginTop: 2 } as React.CSSProperties,
  miniBtn: { width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--rule-2)', background: 'var(--paper-2)', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 11 } as React.CSSProperties,
  recBar: { padding: '10px 16px', borderTop: '1px solid var(--rule-2)', borderBottom: '1px solid var(--rule-2)', background: 'var(--paper-2)' } as React.CSSProperties,
  inspector: { flex: 1, minHeight: 0, overflowY: 'auto' } as React.CSSProperties,
  section: { padding: '10px 16px', borderBottom: '1px solid var(--rule)' } as React.CSSProperties,
  label: { fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as React.CSSProperties,
  input: { width: '100%', boxSizing: 'border-box', background: 'var(--paper-2)', border: '1px solid var(--rule-2)', color: 'var(--ink)', fontFamily: 'var(--font-sans)', fontSize: 12.5, padding: '6px 8px', outline: 'none' } as React.CSSProperties,
  chip: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', border: '1px solid var(--rule-2)', background: 'var(--paper-2)', fontSize: 11.5, marginBottom: 4 } as React.CSSProperties,
  num2: { width: 46, background: 'var(--paper)', border: '1px solid var(--rule-2)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '1px 4px' } as React.CSSProperties,
  parts: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--rule)', border: '1px solid var(--rule-2)', marginTop: 6 } as React.CSSProperties,
  part: { background: 'var(--paper-2)', padding: '6px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--ink-2)', display: 'flex', gap: 6, alignItems: 'center' } as React.CSSProperties,
  select: { background: 'var(--paper)', border: '1px solid var(--rule-2)', color: 'var(--ink)', fontSize: 11, padding: '1px 2px' } as React.CSSProperties,
};

function Mini({ grid }: { grid: (string | null)[][] }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  React.useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    grid.forEach((row, y) => row.forEach((c, x) => { if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); } }));
  }, [grid, w, h]);
  return <canvas ref={ref} width={w} height={h} style={{ width: '100%', height: '100%', imageRendering: 'pixelated', objectFit: 'contain' }} />;
}

const SPOT_GLYPH: Record<string, string> = { toolbar: '✎', palette: '◧', layers: '☰', timeline: '▭', canvas: '▦', '': '¶' };

/** Snap-on goals, made from what the editor is doing right now. */
function partsFor(step: MakerStep, e: MakerEditorState, w: number, h: number): { glyph: string; label: string; make: () => Check }[] {
  const region = step.region ?? { x: 0, y: 0, w, h };
  return [
    { glyph: '✎', label: `Use ${toolName(e.tool)}`, make: () => ({ type: 'tool', tool: e.tool }) },
    { glyph: '◧', label: `Pick ${familyOf(e.color)}`, make: () => ({ type: 'color', family: familyOf(e.color) }) },
    { glyph: '▦', label: 'Place pixels', make: () => ({ type: 'pixels', min: 4, ...(step.region ? { region: step.region } : {}) }) },
    { glyph: '◻', label: 'Closed outline', make: () => ({ type: 'closed', ...(step.region ? { region: step.region } : {}), minInterior: 4 }) },
    { glyph: '▩', label: 'Fill area', make: () => ({ type: 'filled', region, share: 0.9 }) },
    ...(step.example ? [{ glyph: '≈', label: 'Match example', make: (): Check => ({ type: 'matches', share: 0.85 }) }] : []),
    { glyph: '▭', label: 'Frames', make: () => ({ type: 'frames', min: Math.max(2, e.frameCount) }) },
    { glyph: '⌖', label: 'Tag frames', make: () => ({ type: 'tags', min: Math.max(1, e.tagCount) }) },
    { glyph: '◐', label: 'Onion skin', make: () => ({ type: 'onion', on: true }) },
    { glyph: '⇆', label: 'Symmetry', make: () => ({ type: 'symmetry', mode: e.symmetry === 'off' ? 'v' : e.symmetry }) },
    { glyph: '▤', label: 'Max colours', make: () => ({ type: 'maxColors', max: 4 }) },
    { glyph: '▶', label: 'Press play', make: () => ({ type: 'playing' }) },
  ];
}

/** One goal as an editable chip: its numbers and choices inline. */
function GoalChip({ check, onChange, onRemove }: { check: Check; onChange: (c: Check) => void; onRemove: () => void }) {
  const num = (value: number, set: (v: number) => void, opts: { min?: number; max?: number; pct?: boolean } = {}) => (
    <input
      type="number"
      style={S.num2}
      value={opts.pct ? Math.round(value * 100) : value}
      min={opts.min ?? 1}
      max={opts.max}
      onChange={(e) => {
        const v = parseInt(e.target.value, 10);
        if (Number.isFinite(v)) set(opts.pct ? Math.min(100, Math.max(1, v)) / 100 : Math.max(opts.min ?? 1, v));
      }}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
  const family = (value: ColorFamily | undefined, set: (f: ColorFamily | undefined) => void) => (
    <select style={S.select} value={value ?? ''} onChange={(e) => set((e.target.value || undefined) as ColorFamily | undefined)}>
      <option value="">any colour</option>
      {FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
    </select>
  );
  let controls: React.ReactNode = null;
  switch (check.type) {
    case 'tool':
      controls = (
        <select style={S.select} value={check.tool} onChange={(e) => onChange({ ...check, tool: e.target.value as Tool })}>
          {TOOLS.map((t) => <option key={t} value={t}>{toolName(t)}</option>)}
        </select>
      );
      break;
    case 'color': controls = family(check.family, (f) => onChange({ type: 'color', ...(f ? { family: f } : {}) })); break;
    case 'pixels': controls = <>{num(check.min, (v) => onChange({ ...check, min: v }))}{family(check.family, (f) => { const { family: _f, hex: _h, ...rest } = check; onChange({ ...rest, ...(f ? { family: f } : {}) }); })}</>; break;
    case 'closed': controls = num(check.minInterior ?? 1, (v) => onChange({ ...check, minInterior: v })); break;
    case 'filled': controls = <>{num(check.share, (v) => onChange({ ...check, share: v }), { pct: true })}%{family(check.family, (f) => { const { family: _f, hex: _h, ...rest } = check; onChange({ ...rest, ...(f ? { family: f } : {}) }); })}</>; break;
    case 'matches': controls = <>{num(check.share, (v) => onChange({ ...check, share: v }), { pct: true })}%</>; break;
    case 'frames': case 'tags': case 'layers': controls = num(check.min, (v) => onChange({ ...check, min: v })); break;
    case 'maxColors': controls = num(check.max, (v) => onChange({ ...check, max: v })); break;
    case 'frameIndex': controls = num(check.index + 1, (v) => onChange({ ...check, index: v - 1 })); break;
    case 'onion': controls = <select style={S.select} value={String(check.on)} onChange={(e) => onChange({ ...check, on: e.target.value === 'true' })}><option value="true">on</option><option value="false">off</option></select>; break;
    case 'symmetry': controls = <select style={S.select} value={check.mode} onChange={(e) => onChange({ ...check, mode: e.target.value as SymmetryMode })}>{['off', 'v', 'h', 'both'].map((m) => <option key={m} value={m}>{m}</option>)}</select>; break;
  }
  return (
    <div style={S.chip} data-goal={check.type}>
      <span style={{ flex: 1, minWidth: 0, color: 'var(--ink-2)' }}>{describeCheck(check)}</span>
      {controls}
      <span role="button" title="Remove this goal" onClick={onRemove} style={{ cursor: 'pointer', color: 'var(--ink-4)' }}>×</span>
    </div>
  );
}

export function MakerPanel(p: MakerPanelProps) {
  const { draft, selected, recording, editor } = p;
  const [partsOpen, setPartsOpen] = React.useState(false);
  const step = selected >= 0 ? draft.steps[selected] : null;
  const w = draft.start.w;
  const h = draft.start.h;
  React.useEffect(() => { setPartsOpen(false); }, [selected]);

  return (
    <div style={S.root} data-maker-panel>
      <div style={S.head}>
        <div style={S.kicker}>● lesson maker</div>
        <input
          style={S.titleInput}
          value={draft.title}
          aria-label="Lesson title"
          onChange={(e) => p.onChange({ title: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <div style={S.row}>
          <span role="button" style={{ ...S.btn('primary'), opacity: draft.steps.length ? 1 : 0.4 }} onClick={() => draft.steps.length && p.onPlay(0)} title="Play the whole lesson (⌘↵)">▶ Play</span>
          {draft.cleared ? (
            <span className="mk-cleared" data-cleared style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--moss)', border: '2px solid var(--moss)', padding: '2px 8px', letterSpacing: '0.1em', transform: 'rotate(-6deg)' }}>✓ CLEARED</span>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--ink-4)', lineHeight: 1.3 }}>{draft.steps.length ? 'Play it through, no skips, to clear it' : 'Record your first step below'}</span>
          )}
          <span style={{ flex: 1 }} />
          <span
            role="button"
            style={{ ...S.btn('ghost'), opacity: draft.cleared ? 1 : 0.35, cursor: draft.cleared ? 'pointer' : 'not-allowed' }}
            title={draft.cleared ? 'Save the lesson as a file to share' : 'Clear it first: play your lesson start to finish without skipping'}
            onClick={() => draft.cleared && p.onExport()}
          >
            Share
          </span>
        </div>
      </div>

      {recording && (
        <div style={S.recBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mk-rec-dot" />
            <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.4 }}>Recording. Do the step on the canvas the way a learner should, then press ■ Done in the course below.</span>
          </div>
        </div>
      )}
      {!step && !recording && (
        <div style={{ padding: '16px', fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.55 }}>
          {draft.steps.length
            ? 'Pick a step in the course below to edit its words and goals, or record another.'
            : <>Make a lesson by doing it: press <b style={{ color: 'var(--red)' }}>● Record</b> below, do the first step on the canvas, and press <b>■ Done</b>. The maker works out the step's goals, area and example for you.</>}
          {selected === -1 && !draft.steps.length && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--ink-4)', width: '100%' }}>The lesson starts on:</span>
              <span role="button" style={S.btn('ghost')} onClick={() => p.onStartCanvas('blank16')}>Blank 16×16</span>
              <span role="button" style={S.btn('ghost')} onClick={() => p.onStartCanvas('blank32')}>Blank 32×32</span>
              <span role="button" style={S.btn('ghost')} onClick={() => p.onStartCanvas('mine')}>My sprite</span>
            </div>
          )}
        </div>
      )}
      {step && !recording && (
        <div style={S.inspector} data-step-inspector>
          <div style={S.section}>
            <div style={S.label}><span>Step {selected + 1}</span></div>
            <input style={{ ...S.input, fontFamily: 'var(--font-display)', marginBottom: 6 }} value={step.title} aria-label="Step title"
              onChange={(e) => p.onChangeStep(selected, { title: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
            <textarea style={{ ...S.input, minHeight: 54, resize: 'vertical', lineHeight: 1.45 }} value={step.instruction} aria-label="Instruction"
              onChange={(e) => p.onChangeStep(selected, { instruction: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
            <input style={{ ...S.input, marginTop: 6, fontSize: 11.5 }} value={step.hint ?? ''} placeholder="Hint (optional)" aria-label="Hint"
              onChange={(e) => p.onChangeStep(selected, { hint: e.target.value || undefined })} onKeyDown={(e) => e.stopPropagation()} />
          </div>

          <div style={S.section}>
            <div style={S.label}>
              <span>Goals · {step.checks.length ? 'all must pass' : 'none — read & continue'}</span>
              <span role="button" style={{ cursor: 'pointer', color: 'var(--cyan)' }} onClick={() => setPartsOpen((v) => !v)} data-add-goal>{partsOpen ? 'close' : '+ goal'}</span>
            </div>
            {step.checks.map((c, k) => (
              <GoalChip
                key={k}
                check={c}
                onChange={(next) => p.onChangeStep(selected, { checks: step.checks.map((x, j) => (j === k ? next : x)) })}
                onRemove={() => p.onChangeStep(selected, { checks: step.checks.filter((_, j) => j !== k) })}
              />
            ))}
            {partsOpen && (
              <div style={S.parts}>
                {partsFor(step, editor, w, h).map((part) => (
                  <span key={part.label} className="mk-part" style={S.part} role="button" data-part={part.label}
                    onClick={() => { p.onChangeStep(selected, { checks: [...step.checks, part.make()] }); setPartsOpen(false); }}>
                    <span style={{ color: 'var(--cyan)', width: 12, textAlign: 'center' }}>{part.glyph}</span>{part.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={S.section}>
            <div style={S.label}><span>Points at</span></div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <select style={{ ...S.select, fontSize: 12, padding: '3px 4px' }} value={step.spotlight ?? ''} aria-label="Spotlight"
                onChange={(e) => p.onChangeStep(selected, { spotlight: (e.target.value || null) as MakerStep['spotlight'] })}>
                {SPOTS.map((t) => <option key={t} value={t}>{t || 'nothing'}</option>)}
              </select>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>
                {step.region ? `area ${step.region.w}×${step.region.h} at ${step.region.x},${step.region.y}` : 'no area'}
              </span>
              <span role="button" style={{ ...S.miniBtn, width: 'auto', padding: '0 6px', opacity: editor.hasSelection ? 1 : 0.4 }}
                title={editor.hasSelection ? 'Use the marquee selection as the highlighted area' : 'Select an area on the canvas first (V)'}
                onClick={() => editor.hasSelection && p.onRegionFromSelection(selected)}>from selection</span>
              {step.region && <span role="button" style={{ ...S.miniBtn, width: 'auto', padding: '0 6px' }} onClick={() => p.onChangeStep(selected, { region: null })}>clear</span>}
            </div>
          </div>

          <div style={S.section}>
            <div style={S.label}>
              <span>Tools · {step.tools?.length ? 'only these' : 'any'}</span>
              {step.tools?.length ? <span role="button" style={{ cursor: 'pointer', color: 'var(--ink-3)' }} onClick={() => p.onChangeStep(selected, { tools: null })}>allow all</span> : null}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {TOOLS.filter((t) => t !== 'pan').map((t) => {
                const on = !!step.tools?.includes(t);
                return (
                  <span key={t} role="button" onClick={() => {
                    const cur = step.tools ?? [];
                    const next = on ? cur.filter((x) => x !== t) : [...cur, t];
                    p.onChangeStep(selected, { tools: next.length ? next : null });
                  }}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 6px', cursor: 'pointer', border: `1px solid ${on ? 'var(--ink-2)' : 'var(--rule-2)'}`, color: on ? 'var(--ink)' : 'var(--ink-4)', background: on ? 'var(--paper-3)' : 'transparent' }}>
                    {toolName(t)}
                  </span>
                );
              })}
            </div>
          </div>

          <div style={{ ...S.section, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span role="button" style={S.btn('ghost')} onClick={() => p.onRecapture(selected)} title="Use the canvas as it is now as this step's result and example, and re-suggest its goals">↻ Re-capture from canvas</span>
            {step.example && <span role="button" style={S.btn('ghost')} onClick={() => p.onChangeStep(selected, { example: null, checks: step.checks.filter((c) => c.type !== 'matches') })}>Drop example</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Above the canvas while making: name, record light, play, exit. */
export function MakerBar({ title, recording, stepCount, onPlay, onExit }: { title: string; recording: boolean; stepCount: number; onPlay: () => void; onExit: () => void }) {
  return (
    <div style={{ height: 30, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', background: recording ? 'rgba(224,85,85,0.12)' : 'rgba(224,85,85,0.06)', borderBottom: '1px solid var(--red)', fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--red)' }}>
      {recording ? <span className="mk-rec-dot" /> : <span>✎</span>}
      <span>{recording ? 'recording a step' : 'making'} · {title}</span>
      <span style={{ flex: 1 }} />
      <span role="button" style={{ cursor: stepCount ? 'pointer' : 'default', opacity: stepCount ? 1 : 0.4, border: '1px solid var(--red)', padding: '1px 8px' }} onClick={() => stepCount && onPlay()}>▶ play</span>
      <span role="button" style={{ cursor: 'pointer', border: '1px solid var(--red)', padding: '1px 8px' }} onClick={onExit}>exit maker</span>
    </div>
  );
}

export interface MakerCourseProps {
  draft: MakerDraft;
  selected: number;
  recording: boolean;
  stamped: string | null;
  onSelect: (i: number) => void;
  onRecord: () => void;
  onDone: () => void;
  onCancel: () => void;
  onPlay: (fromStep: number) => void;
  onMoveStep: (from: number, to: number) => void;
  onDeleteStep: (i: number) => void;
}

const C = {
  root: { flex: 'none', display: 'flex', alignItems: 'stretch', gap: 8, padding: '10px 18px', overflowX: 'auto', borderTop: '1px solid var(--rule-2)', background: 'var(--paper)' } as React.CSSProperties,
  card: (selected: boolean): React.CSSProperties => ({
    flex: 'none', width: 92, display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer', position: 'relative',
    padding: 5, background: selected ? 'var(--paper-3)' : 'var(--paper-2)', border: `1px solid ${selected ? 'var(--red)' : 'var(--rule-2)'}`,
  }),
  pic: { height: 52, background: '#0a0e14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', fontSize: 18 } as React.CSSProperties,
  label: { fontSize: 10.5, lineHeight: 1.25, color: 'var(--ink-2)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties,
  num: { position: 'absolute', top: 7, left: 7, fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink)', background: 'rgba(13,17,23,0.8)', padding: '0 3px' } as React.CSSProperties,
  arrow: { flex: 'none', alignSelf: 'center', color: 'var(--ink-4)', fontSize: 11 } as React.CSSProperties,
};

/** The lesson as a course: start, each step as a card, then the record slot. */
export function MakerCourse(p: MakerCourseProps) {
  const { draft, selected, recording } = p;
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  return (
    <div style={C.root} role="list" aria-label="Lesson steps" data-maker-course>
      <div style={C.card(selected === -1)} role="listitem" data-step-card="start" onClick={() => !recording && p.onSelect(-1)}>
        <div style={C.pic}><Mini grid={draft.start.frames[0]?.layers[0]?.pixels ?? [[null]]} /></div>
        <div style={C.label}>Start · {draft.start.w}×{draft.start.h}</div>
      </div>
      {draft.steps.map((s, i) => (
        <React.Fragment key={s.id}>
          <span style={C.arrow}>›</span>
          <div
            className={`mk-card${p.stamped === s.id ? ' mk-stamp' : ''}`}
            style={{ ...C.card(selected === i), opacity: dragFrom === i ? 0.4 : 1 }}
            role="listitem"
            data-step-card={i}
            title={`${i + 1}. ${s.title} — ${s.checks.length ? `${s.checks.length} goal${s.checks.length === 1 ? '' : 's'}` : 'read & continue'}. Drag to reorder.`}
            onClick={() => !recording && p.onSelect(i)}
            draggable={!recording}
            onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move'; }}
            onDragEnd={() => setDragFrom(null)}
            onDragOver={(e) => { if (dragFrom !== null) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); if (dragFrom !== null && dragFrom !== i) p.onMoveStep(dragFrom, i); setDragFrom(null); }}
          >
            <div style={C.pic}>{s.example ? <Mini grid={s.example} /> : SPOT_GLYPH[s.spotlight ?? '']}</div>
            <span style={C.num}>{String(i + 1).padStart(2, '0')}</span>
            <div style={C.label}>{s.title}</div>
            <span className="mk-card-actions" style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 2 }}>
              <span role="button" style={{ ...S.miniBtn, width: 18, height: 18 }} title="Play from this step" onClick={(e) => { e.stopPropagation(); p.onPlay(i); }}>▶</span>
              <span role="button" style={{ ...S.miniBtn, width: 18, height: 18 }} title="Delete this step" onClick={(e) => { e.stopPropagation(); p.onDeleteStep(i); }}>×</span>
            </span>
          </div>
        </React.Fragment>
      ))}
      <span style={C.arrow}>›</span>
      {recording ? (
        <div style={{ ...C.card(false), width: 150, borderColor: 'var(--red)', justifyContent: 'center', gap: 6, cursor: 'default' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--red)' }}><span className="mk-rec-dot" />recording…</div>
          <span role="button" style={{ ...S.btn('done'), padding: '5px 8px' }} onClick={p.onDone} data-record-done>■ Done</span>
          <span role="button" style={{ ...S.btn('ghost'), padding: '3px 8px', fontSize: 11 }} onClick={p.onCancel}>Cancel</span>
        </div>
      ) : (
        <div
          role="button"
          data-record
          onClick={p.onRecord}
          title={`Record a new step after ${selected === -1 ? 'the start' : `step ${selected + 1}`}: do it on the canvas, then press Done`}
          style={{ ...C.card(false), borderStyle: 'dashed', borderColor: 'var(--red)', alignItems: 'center', justifyContent: 'center', color: 'var(--red)', fontFamily: 'var(--font-display)', fontSize: 11.5, gap: 6 }}
        >
          <span className="mk-rec-dot" style={{ animation: 'none', width: 14, height: 14 }} />
          Record
        </div>
      )}
    </div>
  );
}
