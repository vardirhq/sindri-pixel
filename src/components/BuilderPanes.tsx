import React from 'react';
import { IconPlus, IconSparkle } from './Icons';

// ---------------------------------------------------------------------------
// Local types (exported for use by App.tsx)
// ---------------------------------------------------------------------------

export interface BuilderStep {
  id: string;
  kind: string;
  title: string;
  goalSummary: string;
  instruction: string;
  hint: string;
  spotlightTarget: string;
  highlightRegion: { x: number; y: number; w: number; h: number } | null;
  validation: Record<string, unknown> & { type: string; requiredTool?: string; minPixels?: number; requireClosedArea?: boolean };
  allowedTools: string[];
  hasExampleArt: boolean;
}

export interface BuilderLesson {
  id: string;
  title: string;
  author?: string;
  difficulty: string;
  time: string;
  steps: BuilderStep[];
}

// ---------------------------------------------------------------------------
// Prop interfaces
// ---------------------------------------------------------------------------

export interface BuilderStepListProps {
  lesson: BuilderLesson;
  selectedIdx: number;
  onSelect: (i: number) => void;
  onAdd: (kind: string) => void;
  onMove?: (from: number, to: number) => void;
  onDuplicate?: (i: number) => void;
  onDelete?: (i: number) => void;
}

export interface BuilderStepFormProps {
  lesson: BuilderLesson;
  step: BuilderStep | null | undefined;
  stepIdx: number;
  onChange: (updated: BuilderStep) => void;
  onCaptureRegion: () => void;
  onCaptureTool?: () => void;
  onCaptureColor?: () => void;
  onPlayTest: () => void;
  onAskAI: () => void;
  onClearRegion: () => void;
}

// ---------------------------------------------------------------------------
// Data constants
// ---------------------------------------------------------------------------

export const STEP_PRESETS = [
  { value: 'use_tool',          label: 'Use a tool',        desc: 'Switch to a specific tool.',     spotlightTarget: 'toolbar' },
  { value: 'draw_in_region',    label: 'Draw something',    desc: 'Place pixels in a region.',      spotlightTarget: 'canvas' },
  { value: 'draw_closed_shape', label: 'Draw closed shape', desc: 'Outline must be sealed.',        spotlightTarget: 'canvas' },
  { value: 'select_interior',   label: 'Select an area',    desc: 'Use a selection tool.',          spotlightTarget: 'toolbar' },
  { value: 'activate_helper',   label: 'Turn on a helper',  desc: 'Enable an overlay.',             spotlightTarget: 'toolbar' },
  { value: 'use_palette',       label: 'Pick a color',      desc: 'Select from the palette.',       spotlightTarget: 'palette' },
  { value: 'use_layer',         label: 'Use a layer',       desc: 'Add or switch active layer.',    spotlightTarget: 'layers' },
  { value: 'custom_goal',       label: 'Custom step',       desc: 'Free-form lesson step.',         spotlightTarget: 'canvas' },
];

const TOOLS_LIST: string[] = ['pencil', 'eraser', 'shade', 'fill', 'picker', 'line', 'rect', 'circle', 'select', 'wand', 'lasso', 'move', 'pan'];
const SPOTLIGHT_TARGETS = ['canvas', 'toolbar', 'palette', 'layers', 'timeline'];

export const DEMO_LESSON: BuilderLesson = {
  id: 'outlines_101', title: 'Pixel outlines 101', author: 'sindri team', difficulty: 'beginner', time: '4 min',
  steps: [
    {
      id: 's1', kind: 'use_tool', title: 'Pick the pencil and a dark ink',
      goalSummary: 'Switch to the pencil and pick any dark color.',
      instruction: 'Press P for the pencil, then pick any dark ink from the palette. The lesson checks the family, not the exact hex.',
      hint: 'Pencil shortcut is P. Any color darker than #6e6960 counts as "dark."',
      spotlightTarget: 'toolbar', highlightRegion: null,
      validation: { type: 'tool_used', requiredTool: 'pencil' },
      allowedTools: ['pencil'], hasExampleArt: false,
    },
    {
      id: 's2', kind: 'draw_closed_shape', title: 'Outline the mushroom cap',
      goalSummary: 'Draw a closed outline of the cap in the highlighted area.',
      instruction: 'Trace the cap silhouette inside the highlighted region. The shape must be fully closed — no gaps. Aim for at least 18 placed pixels.',
      hint: 'Hold Shift while moving the pencil for straight lines.',
      spotlightTarget: 'canvas', highlightRegion: { x: 6, y: 4, w: 16, h: 10 },
      validation: { type: 'pixels_present', minPixels: 18, requireClosedArea: true },
      allowedTools: ['pencil', 'eraser'], hasExampleArt: true,
    },
    {
      id: 's3', kind: 'use_tool', title: 'Fill the cap with red',
      goalSummary: 'Switch to fill and bucket the cap interior.',
      instruction: 'Press G for fill, pick a red color, then click inside the closed cap outline. The lesson checks that the cap interior turned red.',
      hint: "If fill leaks out, your outline isn't fully closed — go back to step 2.",
      spotlightTarget: 'toolbar', highlightRegion: null,
      validation: { type: 'tool_used', requiredTool: 'fill' },
      allowedTools: ['fill'], hasExampleArt: false,
    },
  ],
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const builderStyles = {
  list: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'var(--font-sans)', color: 'var(--ink)' } as React.CSSProperties,
  listHead: { padding: '14px 16px 12px', borderBottom: '1px solid var(--rule)' } as React.CSSProperties,
  listKicker: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 } as React.CSSProperties,
  listTitle: { fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--ink)', lineHeight: 1.25 } as React.CSSProperties,
  listMeta: { fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '0.06em', marginTop: 4 } as React.CSSProperties,
  addRow: { margin: '12px 16px 4px', padding: '8px 12px', border: '1px dashed var(--rule-2)', cursor: 'pointer', color: 'var(--ink-3)', fontFamily: 'var(--font-display)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 } as React.CSSProperties,
  presetRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, margin: '8px 16px 12px', background: 'var(--rule)', border: '1px solid var(--rule-2)' } as React.CSSProperties,
  presetBtn: { background: 'var(--paper-2)', padding: '8px 10px', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--ink-2)', textAlign: 'left' as const, lineHeight: 1.3 } as React.CSSProperties,
  presetSub: { fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-4)', marginTop: 2, letterSpacing: '0.06em' } as React.CSSProperties,
  steps: { flex: 1, overflowY: 'auto', padding: '4px 0' } as React.CSSProperties,
  step: (selected: boolean, isDrag: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px', cursor: 'pointer', background: selected ? 'var(--paper-3)' : 'transparent', borderLeft: selected ? '2px solid var(--red)' : '2px solid transparent', borderBottom: '1px solid var(--rule)', opacity: isDrag ? 0.5 : 1, position: 'relative' }),
  stepHandle: { color: 'var(--ink-4)', cursor: 'grab', marginTop: 4 } as React.CSSProperties,
  stepBody: { flex: 1, minWidth: 0 } as React.CSSProperties,
  stepHeadRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 } as React.CSSProperties,
  stepIdx: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)' } as React.CSSProperties,
  stepKindBadge: { fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-3)', border: '1px solid var(--rule-2)', padding: '0 5px', letterSpacing: '0.08em', textTransform: 'uppercase' } as React.CSSProperties,
  stepTitle: { fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as React.CSSProperties,
  stepGoal: { fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.4, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties,
  readiness: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 } as React.CSSProperties,
  readinessChip: (ready: boolean): React.CSSProperties => ({ fontFamily: 'var(--font-mono)', fontSize: 8.5, padding: '1px 5px', color: ready ? 'var(--moss)' : 'var(--ink-4)', border: ready ? '1px solid var(--moss)' : '1px solid var(--rule-2)', letterSpacing: '0.08em', textTransform: 'uppercase' }),
  stepActions: { display: 'flex', gap: 2, marginLeft: 'auto', flex: 'none' } as React.CSSProperties,
  stepAction: { width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px solid var(--rule-2)', background: 'var(--paper-2)', color: 'var(--ink-3)' } as React.CSSProperties,
  form: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'var(--font-sans)', color: 'var(--ink)' } as React.CSSProperties,
  formHead: { padding: '14px 18px 12px', borderBottom: '1px solid var(--rule-2)', background: 'var(--paper-2)' } as React.CSSProperties,
  formKicker: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 } as React.CSSProperties,
  formTitle: { fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--ink)' } as React.CSSProperties,
  formMeta: { fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)', marginTop: 4 } as React.CSSProperties,
  body: { flex: 1, overflowY: 'auto' } as React.CSSProperties,
  section: { borderBottom: '1px solid var(--rule)' } as React.CSSProperties,
  sectionHead: { display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px 8px', color: 'var(--ink-2)', fontFamily: 'var(--font-display)', fontSize: 13 } as React.CSSProperties,
  sectionLabel: { color: 'var(--ink-3)', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'var(--font-display)', flex: 1 } as React.CSSProperties,
  segmented: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, margin: '0 18px 14px', background: 'var(--rule)', border: '1px solid var(--rule-2)' } as React.CSSProperties,
  segBtn: (active: boolean): React.CSSProperties => ({ background: active ? 'var(--paper-3)' : 'var(--paper-2)', color: active ? 'var(--ink)' : 'var(--ink-3)', padding: '8px 10px', cursor: 'pointer', fontSize: 11, lineHeight: 1.3, textAlign: 'left', borderLeft: active ? '2px solid var(--ink)' : '2px solid transparent' }),
  segSub: { fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-4)', marginTop: 2, letterSpacing: '0.06em' } as React.CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 18px 12px' } as React.CSSProperties,
  label: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)', letterSpacing: '0.06em', textTransform: 'uppercase' } as React.CSSProperties,
  input: { background: 'var(--paper-2)', border: '1px solid var(--rule-2)', color: 'var(--ink)', fontFamily: 'var(--font-sans)', fontSize: 12.5, padding: '6px 8px', outline: 'none' } as React.CSSProperties,
  textarea: { background: 'var(--paper-2)', border: '1px solid var(--rule-2)', color: 'var(--ink)', fontFamily: 'var(--font-sans)', fontSize: 12.5, padding: '6px 8px', outline: 'none', resize: 'vertical', minHeight: 60, lineHeight: 1.5 } as React.CSSProperties,
  capture: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', margin: '0 18px 12px', background: 'var(--paper-2)', border: '1px solid var(--rule-2)', cursor: 'pointer', color: 'var(--cyan)', fontFamily: 'var(--font-display)', fontSize: 12, whiteSpace: 'nowrap' } as React.CSSProperties,
  captureRow: { display: 'flex', gap: 8, padding: '0 18px 12px' } as React.CSSProperties,
  captureBtn: (variant?: string): React.CSSProperties => ({ flex: 1, padding: '8px 10px', background: 'var(--paper-2)', border: '1px solid ' + (variant === 'cyan' ? 'var(--cyan)' : 'var(--rule-2)'), color: variant === 'cyan' ? 'var(--cyan)' : 'var(--ink-2)', cursor: 'pointer', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap' }),
  metaLine: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', padding: '0 18px 12px' } as React.CSSProperties,
  metaKey: { color: 'var(--ink-4)', marginRight: 6 } as React.CSSProperties,
  toolGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, margin: '0 18px 14px', background: 'var(--rule)', border: '1px solid var(--rule-2)' } as React.CSSProperties,
  toolChip: (on: boolean): React.CSSProperties => ({ background: on ? 'var(--paper-3)' : 'var(--paper-2)', color: on ? 'var(--ink)' : 'var(--ink-3)', padding: '6px 8px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10.5, textAlign: 'center', letterSpacing: '0.04em' }),
  modRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 18px 12px' } as React.CSSProperties,
  modToggle: (on: boolean): React.CSSProperties => ({ width: 26, height: 14, position: 'relative', border: '1px solid var(--rule-2)', background: on ? 'var(--ink)' : 'var(--paper)' }),
  modThumb: (on: boolean): React.CSSProperties => ({ position: 'absolute', top: 1, left: on ? 14 : 1, width: 10, height: 10, background: on ? 'var(--paper)' : 'var(--ink-3)' }),
  modName: { fontSize: 12, color: 'var(--ink-2)' } as React.CSSProperties,
  formFooter: { padding: '12px 14px', borderTop: '1px solid var(--rule-2)', background: 'var(--paper-2)', display: 'flex', gap: 6 } as React.CSSProperties,
  footBtn: (variant: string): React.CSSProperties => ({ flex: 1, padding: '8px 10px', cursor: 'pointer', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 12, whiteSpace: 'nowrap', background: variant === 'primary' ? 'var(--cyan)' : 'transparent', color: variant === 'primary' ? 'var(--paper)' : variant === 'ai' ? 'var(--amber)' : 'var(--ink-3)', border: '1px solid ' + (variant === 'primary' ? 'var(--cyan)' : variant === 'ai' ? 'var(--amber)' : 'var(--rule-2)'), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }),
  example: { margin: '0 18px 12px', padding: 8, background: 'var(--paper-2)', border: '1px solid var(--rule-2)', display: 'flex', alignItems: 'center', gap: 12 } as React.CSSProperties,
  exampleCanvas: { width: 56, height: 56, background: '#0a0e14', border: '1px solid var(--rule-2)', imageRendering: 'pixelated', flex: 'none', display: 'block' } as React.CSSProperties,
  exampleMeta: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } as React.CSSProperties,
  exampleLabel: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)', letterSpacing: '0.06em', textTransform: 'uppercase' } as React.CSSProperties,
  exampleSize: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)' } as React.CSSProperties,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getReadiness(step: BuilderStep): Record<string, boolean> {
  return {
    Copy: Boolean(step.title?.trim() && step.instruction?.trim()),
    Target: Boolean(step.highlightRegion || step.spotlightTarget !== 'canvas'),
    Rules: Boolean(step.validation?.type),
    Example: Boolean(step.hasExampleArt),
  };
}

// ---------------------------------------------------------------------------
// ExampleCanvas (local, not exported)
// ---------------------------------------------------------------------------

function ExampleCanvas() {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const ART = [
      '....kkkkkk......', '...kssssssk.....', '..krsrssrrsk....', '..krrssssrsk....',
      '..kssrrrrsk.....', '...kkkssksk.....', '....kssssk......', '....kssssk......',
      '...kssssssk.....', '....kkkkkk......',
    ];
    const map: Record<string, string | null> = { '.': null, 'k': '#1a1a1a', 's': '#a8a298', 'r': '#e05555' };
    const s = c.width / 16;
    for (let y = 0; y < 10; y++) for (let x = 0; x < 16; x++) {
      ctx.fillStyle = ((Math.floor(x / 4) + Math.floor(y / 4)) % 2) ? '#0a0e14' : '#11161d';
      ctx.fillRect(x * s, y * s, s, s);
    }
    for (let y = 0; y < ART.length; y++) for (let x = 0; x < ART[y].length; x++) {
      const col = map[ART[y][x]];
      if (col) { ctx.fillStyle = col; ctx.fillRect(x * s, y * s, s, s); }
    }
  }, []);
  return <canvas ref={ref} width="56" height="35" style={builderStyles.exampleCanvas} />;
}

// ---------------------------------------------------------------------------
// BuilderStepList
// ---------------------------------------------------------------------------

export function BuilderStepList({ lesson, selectedIdx, onSelect, onAdd }: BuilderStepListProps) {
  return (
    <div style={builderStyles.list}>
      <div style={builderStyles.listHead}>
        <div style={builderStyles.listKicker}>● lesson · authoring</div>
        <div style={builderStyles.listTitle}>{lesson.title}</div>
        <div style={builderStyles.listMeta}>{lesson.steps.length} steps · {lesson.difficulty} · {lesson.time}</div>
      </div>
      <div style={builderStyles.steps}>
        {lesson.steps.map((s, i) => {
          const sel = i === selectedIdx;
          const r = getReadiness(s);
          return (
            <div key={s.id} style={builderStyles.step(sel, false)} onClick={() => onSelect(i)}>
              <span style={builderStyles.stepHandle} title="Drag to reorder">⋮⋮</span>
              <div style={builderStyles.stepBody}>
                <div style={builderStyles.stepHeadRow}>
                  <span style={builderStyles.stepIdx}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={builderStyles.stepKindBadge}>{s.kind}</span>
                </div>
                <div style={builderStyles.stepTitle}>{s.title}</div>
                {s.goalSummary && <div style={builderStyles.stepGoal}>{s.goalSummary}</div>}
                <div style={builderStyles.readiness}>
                  {Object.entries(r).map(([k, v]) => (
                    <span key={k} style={builderStyles.readinessChip(v)}>{k}</span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: '1px solid var(--rule-2)' }}>
        <div style={{ ...builderStyles.sectionHead, padding: '12px 16px 4px' }}>
          <span style={builderStyles.sectionLabel}>add step</span>
        </div>
        <div style={builderStyles.presetRow}>
          {STEP_PRESETS.slice(0, 4).map((p) => (
            <div key={p.value} style={builderStyles.presetBtn} onClick={() => onAdd(p.value)}>
              <div>{p.label}</div>
              <div style={builderStyles.presetSub}>{p.desc}</div>
            </div>
          ))}
        </div>
        <div style={builderStyles.addRow} onClick={() => onAdd('custom_goal')}>
          <IconPlus size={10} /> Custom step
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BuilderStepForm
// ---------------------------------------------------------------------------

export function BuilderStepForm({ lesson, step, stepIdx, onChange, onCaptureRegion, onPlayTest, onAskAI, onClearRegion }: BuilderStepFormProps) {
  if (!step) return null;

  const u = (k: keyof BuilderStep, v: unknown) => onChange({ ...step, [k]: v });
  const uv = (k: string, v: unknown) => onChange({ ...step, validation: { ...step.validation, [k]: v } });
  const allowed = new Set(step.allowedTools || []);

  const val = step.validation as Record<string, unknown>;

  return (
    <div style={builderStyles.form}>
      <div style={builderStyles.formHead}>
        <div style={builderStyles.formKicker}>● step {stepIdx + 1} of {lesson.steps.length} · editing</div>
        <div style={builderStyles.formTitle}>{step.title || 'Untitled step'}</div>
        <div style={builderStyles.formMeta}>{step.kind} · {step.spotlightTarget} spotlight</div>
      </div>
      <div style={builderStyles.body}>
        {/* Step type */}
        <div style={builderStyles.section}>
          <div style={builderStyles.sectionHead}>
            <span style={builderStyles.sectionLabel}>step type</span>
            <span style={{ ...builderStyles.footBtn('ai'), padding: '3px 8px', fontSize: 10, gap: 4, flex: 'none' }} onClick={onAskAI}>
              <IconSparkle size={9} stroke="var(--amber)" />Suggest
            </span>
          </div>
          <div style={builderStyles.segmented}>
            {STEP_PRESETS.map((p) => (
              <div key={p.value} style={builderStyles.segBtn(step.kind === p.value)} onClick={() => u('kind', p.value)}>
                <div>{p.label}</div>
                <div style={builderStyles.segSub}>{p.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Learner copy */}
        <div style={builderStyles.section}>
          <div style={builderStyles.sectionHead}><span style={builderStyles.sectionLabel}>learner copy</span></div>
          <div style={builderStyles.field}>
            <span style={builderStyles.label}>title</span>
            <input style={builderStyles.input} value={step.title} onChange={(e) => u('title', e.target.value)} />
          </div>
          <div style={builderStyles.field}>
            <span style={builderStyles.label}>goal summary</span>
            <input style={builderStyles.input} value={step.goalSummary || ''} onChange={(e) => u('goalSummary', e.target.value)} placeholder="Short line shown in play mode" />
          </div>
          <div style={builderStyles.field}>
            <span style={builderStyles.label}>instruction</span>
            <textarea style={builderStyles.textarea} value={step.instruction || ''} onChange={(e) => u('instruction', e.target.value)} />
          </div>
          <div style={builderStyles.field}>
            <span style={builderStyles.label}>hint (optional)</span>
            <textarea style={{ ...builderStyles.textarea, minHeight: 44 }} value={step.hint || ''} onChange={(e) => u('hint', e.target.value)} placeholder="Shown when the learner clicks Hint" />
          </div>
        </div>

        {/* Expected result */}
        <div style={builderStyles.section}>
          <div style={builderStyles.sectionHead}><span style={builderStyles.sectionLabel}>expected result</span></div>
          <div style={builderStyles.field}>
            <span style={builderStyles.label}>spotlight target</span>
            <div style={builderStyles.segmented}>
              {SPOTLIGHT_TARGETS.map((t) => (
                <div key={t} style={builderStyles.segBtn(step.spotlightTarget === t)} onClick={() => u('spotlightTarget', t)}>
                  <div>{t}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={builderStyles.captureRow}>
            <span style={builderStyles.captureBtn('cyan')} onClick={onCaptureRegion}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square">
                <path d="M3 3 H7 M3 3 V7 M13 3 H9 M13 3 V7 M3 13 H7 M3 13 V9 M13 13 H9 M13 13 V9" strokeDasharray="2 1" />
              </svg>
              Capture region
            </span>
            <span style={builderStyles.captureBtn()} onClick={onClearRegion}>Clear</span>
          </div>
          {step.highlightRegion ? (
            <div style={builderStyles.metaLine}>
              <span style={builderStyles.metaKey}>region</span>
              {step.highlightRegion.x}, {step.highlightRegion.y} · {step.highlightRegion.w} × {step.highlightRegion.h}
            </div>
          ) : (
            <div style={builderStyles.metaLine}><span style={builderStyles.metaKey}>region</span><span style={{ color: 'var(--ink-4)' }}>none</span></div>
          )}
          {step.hasExampleArt && (
            <div style={builderStyles.example}>
              <ExampleCanvas />
              <div style={builderStyles.exampleMeta}>
                <span style={builderStyles.exampleLabel}>reference example</span>
                <span style={builderStyles.exampleSize}>16 × 10 · 22 px placed</span>
              </div>
            </div>
          )}
        </div>

        {/* Validation rules */}
        <div style={builderStyles.section}>
          <div style={builderStyles.sectionHead}><span style={builderStyles.sectionLabel}>validation rules</span></div>
          <div style={builderStyles.field}>
            <span style={builderStyles.label}>validator</span>
            <div style={builderStyles.segmented}>
              {['tool_used', 'pixels_present', 'selection_exists', 'helper_active', 'ai_judges'].map((t) => (
                <div key={t} style={builderStyles.segBtn(step.validation?.type === t)} onClick={() => uv('type', t)}>
                  <div>{t === 'ai_judges' ? <span style={{ color: 'var(--amber)' }}>✦ ai judges</span> : t.replace(/_/g, ' ')}</div>
                </div>
              ))}
            </div>
          </div>
          {step.validation?.type === 'pixels_present' && (
            <React.Fragment>
              <div style={builderStyles.field}>
                <span style={builderStyles.label}>minimum pixels</span>
                <input
                  style={builderStyles.input}
                  type="number"
                  min="1"
                  value={(val.minPixels as number) ?? 1}
                  onChange={(e) => uv('minPixels', Number(e.target.value))}
                />
              </div>
              <div style={builderStyles.modRow} onClick={() => uv('requireClosedArea', !val.requireClosedArea)}>
                <span style={builderStyles.modName}>shape must be closed</span>
                <span style={builderStyles.modToggle(Boolean(val.requireClosedArea))}>
                  <span style={builderStyles.modThumb(Boolean(val.requireClosedArea))} />
                </span>
              </div>
            </React.Fragment>
          )}
          {step.validation?.type === 'tool_used' && (
            <div style={builderStyles.field}>
              <span style={builderStyles.label}>required tool</span>
              <input
                style={builderStyles.input}
                value={step.validation.requiredTool || ''}
                onChange={(e) => uv('requiredTool', e.target.value)}
              />
            </div>
          )}
          {step.validation?.type === 'ai_judges' && (
            <div style={{ ...builderStyles.example, borderColor: 'var(--amber)', background: 'rgba(240,192,80,0.06)' }}>
              <IconSparkle size={14} stroke="var(--amber)" />
              <div style={builderStyles.exampleMeta}>
                <span style={{ ...builderStyles.exampleLabel, color: 'var(--amber)' }}>ai-graded</span>
                <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>Sindri checks the result against the prompt only when the learner says "I'm done."</span>
              </div>
            </div>
          )}
        </div>

        {/* Recommended tools */}
        <div style={builderStyles.section}>
          <div style={builderStyles.sectionHead}><span style={builderStyles.sectionLabel}>recommended tools</span></div>
          <div style={builderStyles.toolGrid}>
            {TOOLS_LIST.map((t) => (
              <div key={t} style={builderStyles.toolChip(allowed.has(t))} onClick={() => {
                const next = new Set(allowed);
                if (next.has(t)) next.delete(t); else next.add(t);
                u('allowedTools', [...next]);
              }}>{t}</div>
            ))}
          </div>
        </div>
      </div>

      <div style={builderStyles.formFooter}>
        <span style={builderStyles.footBtn('ai')} onClick={onAskAI}>
          <IconSparkle size={11} stroke="var(--amber)" />Sindri
        </span>
        <span style={builderStyles.footBtn('primary')} onClick={onPlayTest}>Play test step</span>
      </div>
    </div>
  );
}
