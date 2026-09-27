import React from 'react';
import type { SpotlightRect } from '../types';
import type { CheckResult, Lesson, MakerDraft } from '../lib/lessons';
import { IconX, IconSearch, IconPlus, IconCheck, IconPlay, IconCopy, IconTrash, IconFolder, IconPencil } from './Icons';
import './maker/maker.css';

// ---------------------------------------------------------------------------
// Prop interfaces
// ---------------------------------------------------------------------------

export type LibraryTab = 'all' | 'todo' | 'done' | 'mine';

export interface LibraryNotice {
  kind: 'ok' | 'error';
  text: string;
}

export interface TutorialLibraryProps {
  open: boolean;
  /** The built-in lessons. */
  lessons: Lesson[];
  /** Lessons people shared, imported from .sindri-lesson files. */
  imported?: Lesson[];
  completed: string[];
  /** The lessons this person is making (the "My lessons" shelf). */
  drafts?: MakerDraft[];
  /** The tab to show when the library opens. */
  initialTab?: LibraryTab;
  /** The lesson just imported (its card is marked new). */
  freshId?: string | null;
  notice?: LibraryNotice | null;
  onClose: () => void;
  onStart: (lesson: Lesson) => void;
  onAuthor?: () => void;
  onEditDraft?: (draft: MakerDraft) => void;
  onPlayDraft?: (draft: MakerDraft) => void;
  onCopyDraft?: (draft: MakerDraft) => void;
  onDeleteDraft?: (id: string) => void;
  /** Pick a .sindri-lesson file to import. */
  onImport?: () => void;
  /** A file dropped on the library. */
  onImportFile?: (file: File) => void;
  onRemoveImported?: (id: string) => void;
}

/** Where the learner is: the intro card, a step, or the finish card. */
export type LessonPhase = 'intro' | 'step' | 'outro';

export interface TutorialPlayerLaneProps {
  lesson: Lesson;
  phase: LessonPhase;
  stepIdx: number;
  /** The current step's checks, evaluated live. */
  results: CheckResult[];
  /** Every check passes: the step is about to advance. */
  stepComplete: boolean;
  /** Why the last tool switch was refused, if it was. */
  notice?: string | null;
  exampleVisible: boolean;
  onToggleExample: () => void;
  onBegin: () => void;
  onPrev: () => void;
  onNext: () => void;
  onJump: (idx: number) => void;
  onExit: () => void;
  /** Label for leaving (a play test returns to the builder). */
  exitLabel?: string;
}

export interface SpotlightCallout {
  stepIdx: number;
  text: string;
}

export interface TutorialSpotlightProps {
  targetRect: SpotlightRect | null;
  callout?: SpotlightCallout | null;
}


// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const tutStyles = {
  scrim: { position: 'fixed', inset: 0, background: 'rgba(13,17,23,0.66)', backdropFilter: 'blur(2px)', zIndex: 110, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 64, paddingBottom: 64 } as React.CSSProperties,
  dialog: { width: 'min(1040px, 94vw)', maxHeight: 'calc(100vh - 128px)', background: 'var(--paper-2)', border: '1px solid var(--rule-2)', color: 'var(--ink)', fontFamily: 'var(--font-sans)', boxShadow: '0 24px 48px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', overflow: 'hidden' } as React.CSSProperties,
  dialogHead: { padding: '20px 24px 14px', borderBottom: '1px solid var(--rule-2)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 } as React.CSSProperties,
  dialogTitle: { fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink)' } as React.CSSProperties,
  dialogSub: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.06em', marginTop: 4 } as React.CSSProperties,
  dialogClose: { width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--rule-2)', color: 'var(--ink-3)', cursor: 'pointer' } as React.CSSProperties,
  tabs: { display: 'flex', padding: '0 24px', borderBottom: '1px solid var(--rule)', alignItems: 'flex-end', gap: 22 } as React.CSSProperties,
  tab: (active: boolean): React.CSSProperties => ({ paddingBottom: 10, paddingTop: 14, fontSize: 12.5, color: active ? 'var(--ink)' : 'var(--ink-3)', fontWeight: active ? 500 : 400, borderBottom: active ? '2px solid var(--ink)' : '2px solid transparent', marginBottom: -1, cursor: 'pointer' }),
  tabBadge: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)', border: '1px solid var(--rule-2)', padding: '0 5px', marginLeft: 6 } as React.CSSProperties,
  searchRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 24px', borderBottom: '1px solid var(--rule)' } as React.CSSProperties,
  searchInput: { flex: 1, background: 'var(--paper)', border: '1px solid var(--rule-2)', color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: 13, padding: '8px 12px', outline: 'none' } as React.CSSProperties,
  composeBtn: { display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--amber)', cursor: 'pointer', padding: '7px 12px', border: '1px solid var(--amber)', whiteSpace: 'nowrap' } as React.CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--rule)', flex: 1, minHeight: 0, overflowY: 'auto' } as React.CSSProperties,
  card: { background: 'var(--paper-2)', padding: 14, display: 'grid', gridTemplateColumns: '88px 1fr', gap: 12, alignItems: 'start', cursor: 'pointer', position: 'relative', minHeight: 132 } as React.CSSProperties,
  cardHover: { background: 'var(--paper-3)' } as React.CSSProperties,
  cardCoverWrap: { position: 'relative', width: 88, height: 88, flex: 'none' } as React.CSSProperties,
  cardCover: { width: 88, height: 88, background: '#0a0e14', border: '1px solid var(--rule-2)', imageRendering: 'pixelated', display: 'block' } as React.CSSProperties,
  cardBody: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, height: '100%' } as React.CSSProperties,
  cardTitleBlock: { display: 'flex', flexDirection: 'column', gap: 4 } as React.CSSProperties,
  cardTitle: { fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--ink)', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as React.CSSProperties,
  cardSummary: { fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties,
  cardMeta: { fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '0.06em', display: 'flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap' } as React.CSSProperties,
  cardMetaDot: { width: 3, height: 3, background: 'var(--ink-4)', flex: 'none' } as React.CSSProperties,
  completedBadge: { position: 'absolute', bottom: 4, right: 4, fontFamily: 'var(--font-mono)', fontSize: 9, padding: '1px 5px', color: 'var(--paper)', background: 'var(--moss)', letterSpacing: '0.1em', textTransform: 'uppercase' } as React.CSSProperties,
  difficulty: (_level: string): React.CSSProperties => ({ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)', border: '1px solid var(--rule-2)', padding: '0 5px', textTransform: 'uppercase', letterSpacing: '0.08em' }),
  laneRoot: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'var(--font-sans)', color: 'var(--ink)' } as React.CSSProperties,
  laneHead: { padding: '16px 22px 14px', borderBottom: '1px solid var(--rule-2)', background: 'var(--paper-2)' } as React.CSSProperties,
  laneKicker: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 } as React.CSSProperties,
  laneTitle: { fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--ink)', lineHeight: 1.25 } as React.CSSProperties,
  laneSub: { fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '0.06em', marginTop: 6 } as React.CSSProperties,
  progressRow: { display: 'flex', gap: 3, padding: '14px 22px 10px' } as React.CSSProperties,
  progDot: (state: string): React.CSSProperties => ({ flex: 1, height: 4, background: state === 'done' ? 'var(--moss)' : state === 'current' ? 'var(--cyan)' : 'var(--paper-4)' }),
  stepList: { flex: 1, overflowY: 'auto' } as React.CSSProperties,
  stepRow: (state: string): React.CSSProperties => ({ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 22px', borderBottom: '1px solid var(--rule)', background: state === 'current' ? 'var(--paper-3)' : 'transparent', borderLeft: state === 'current' ? '2px solid var(--cyan)' : '2px solid transparent', cursor: 'pointer' }),
  stepIdx: (state: string): React.CSSProperties => ({ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: state === 'done' ? 'var(--moss)' : state === 'current' ? 'var(--cyan)' : 'var(--ink-4)', width: 18, flex: 'none', marginTop: 2 }),
  stepText: { flex: 1, minWidth: 0 } as React.CSSProperties,
  stepTitle: (state: string): React.CSSProperties => ({ fontSize: 12.5, color: state === 'current' ? 'var(--ink)' : 'var(--ink-3)', fontWeight: state === 'current' ? 500 : 400, lineHeight: 1.35, textDecoration: state === 'done' ? 'line-through' : 'none', textDecorationColor: 'var(--ink-4)' }),
  stepKind: { fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 3 } as React.CSSProperties,
  currentCard: { padding: '14px 22px', borderTop: '1px solid var(--rule-2)', background: 'var(--paper)' } as React.CSSProperties,
  goalRow: { display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10, color: 'var(--cyan)', fontSize: 12, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' } as React.CSSProperties,
  goalDot: { width: 7, height: 7, background: 'var(--cyan)', flex: 'none', marginTop: 5 } as React.CSSProperties,
  instruction: { color: 'var(--ink)', fontSize: 13.5, lineHeight: 1.5, marginBottom: 14 } as React.CSSProperties,
  criteria: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 } as React.CSSProperties,
  critRow: (met: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11, color: met ? 'var(--moss)' : 'var(--ink-3)' }),
  critGlyph: { width: 12, height: 12, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
  hint: { marginTop: 8, padding: '10px 12px', background: 'var(--paper-2)', border: '1px solid var(--rule-2)', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 } as React.CSSProperties,
  hintLabel: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 } as React.CSSProperties,
  aiHint: { marginTop: 8, padding: '10px 12px', background: 'rgba(240,192,80,0.06)', border: '1px solid var(--amber)', fontSize: 12, color: 'var(--ink)', lineHeight: 1.5 } as React.CSSProperties,
  aiHintHead: { display: 'flex', alignItems: 'center', gap: 7, color: 'var(--amber)', fontFamily: 'var(--font-display)', fontSize: 12, marginBottom: 6 } as React.CSSProperties,
  aiHintRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 } as React.CSSProperties,
  laneFooter: { padding: '12px 14px', borderTop: '1px solid var(--rule-2)', background: 'var(--paper-2)', display: 'flex', gap: 5 } as React.CSSProperties,
  laneBtn: (variant: string): React.CSSProperties => ({ fontFamily: 'var(--font-display)', fontSize: 11.5, padding: '8px 8px', cursor: 'pointer', flex: variant === 'primary' ? 1.3 : 1, textAlign: 'center', background: variant === 'primary' ? 'var(--cyan)' : 'transparent', color: variant === 'primary' ? 'var(--paper)' : variant === 'exit' ? 'var(--ink-3)' : 'var(--cyan)', border: variant === 'exit' ? '1px solid var(--rule-2)' : '1px solid var(--cyan)', whiteSpace: 'nowrap' }),
  laneBtnAi: { fontFamily: 'var(--font-display)', fontSize: 11.5, padding: '8px 8px', cursor: 'pointer', flex: 1.3, textAlign: 'center', background: 'transparent', color: 'var(--amber)', border: '1px solid var(--amber)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 } as React.CSSProperties,
  spotRoot: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 30 } as React.CSSProperties,
  spotDim: { position: 'absolute', background: 'rgba(13,17,23,0.62)' } as React.CSSProperties,
  spotHole: { position: 'absolute', border: '2px solid var(--cyan)', boxShadow: '0 0 0 1px rgba(13,17,23,0.6), inset 0 0 0 1px rgba(13,17,23,0.6)', pointerEvents: 'none' } as React.CSSProperties,
  callout: { position: 'absolute', background: 'var(--paper-2)', border: '1px solid var(--cyan)', padding: '8px 12px', maxWidth: 240, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: 12, pointerEvents: 'auto' } as React.CSSProperties,
  calloutKicker: { fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--cyan)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 } as React.CSSProperties,
  calloutTail: { position: 'absolute', width: 8, height: 8, background: 'var(--paper-2)', border: '1px solid var(--cyan)', borderTop: 'none', borderLeft: 'none', transform: 'rotate(45deg)' } as React.CSSProperties,
};

// ---------------------------------------------------------------------------
// CoverPreview (local, not exported)
// ---------------------------------------------------------------------------

interface CoverPreviewProps {
  pixels: (string | null)[][];
  size?: number;
}

function CoverPreview({ pixels, size = 160 }: CoverPreviewProps) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const h = pixels.length;
    const w = pixels[0]?.length ?? 1;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    const s = c.width / Math.max(w, h);
    const ox = (c.width - w * s) / 2;
    const oy = (c.height - h * s) / 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      ctx.fillStyle = ((Math.floor(x / 4) + Math.floor(y / 4)) % 2) ? '#0a0e14' : '#11161d';
      ctx.fillRect(ox + x * s, oy + y * s, s, s);
      const col = pixels[y][x];
      if (col) { ctx.fillStyle = col; ctx.fillRect(ox + x * s, oy + y * s, s, s); }
    }
  }, [pixels, size]);
  return <canvas ref={ref} width={size} height={size} style={tutStyles.cardCover} />;
}

/** Library card art: the lesson's cover, else its last example. */
function coverOf(l: Lesson): (string | null)[][] {
  return l.cover ?? [...l.steps].reverse().find((s) => s.example)?.example ?? l.start.frames?.[0]?.layers[0]?.pixels ?? [[null]];
}

// ---------------------------------------------------------------------------
// TutorialLibrary
// ---------------------------------------------------------------------------

/** A draft's card art: its latest example, else its starting canvas. */
function draftCover(d: MakerDraft): (string | null)[][] {
  return [...d.steps].reverse().find((s) => s.example)?.example ?? d.start.frames[0]?.layers[0]?.pixels ?? [[null]];
}

function ago(t: number): string {
  const min = Math.round((Date.now() - t) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** A small text action on a card (doesn't open the card). */
function CardAction({ label, title, onClick, danger, children }: { label: string; title?: string; onClick: () => void; danger?: boolean; children?: React.ReactNode }) {
  return (
    <span
      role="button"
      data-card-action={label}
      title={title ?? label}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="mk-part"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', padding: '3px 6px', border: '1px solid var(--rule-2)', color: danger ? 'var(--red)' : 'var(--ink-3)', cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      {children}{label}
    </span>
  );
}

export function TutorialLibrary({
  open, lessons, imported = [], completed, drafts = [], initialTab = 'all', freshId, notice,
  onClose, onStart, onAuthor, onEditDraft, onPlayDraft, onCopyDraft, onDeleteDraft, onImport, onImportFile, onRemoveImported,
}: TutorialLibraryProps) {
  const [tab, setTab] = React.useState<LibraryTab>(initialTab);
  const [query, setQuery] = React.useState('');
  const [hover, setHover] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [dropping, setDropping] = React.useState(false);

  React.useEffect(() => { if (open) { setTab(initialTab); setConfirming(null); } }, [open, initialTab]);
  // A lesson just imported shows where it landed.
  React.useEffect(() => { if (freshId) { setTab('all'); setQuery(''); } }, [freshId]);

  if (!open) return null;

  const sharedIds = new Set(imported.map((l) => l.id));
  const all = [...imported, ...lessons];
  const isDone = (l: Lesson) => completed.includes(l.id);
  const q = query.trim().toLowerCase();
  const matches = (title: string, summary: string) => !q || title.toLowerCase().includes(q) || summary.toLowerCase().includes(q);
  const filtered = all.filter((l) => {
    if (tab === 'todo' && isDone(l)) return false;
    if (tab === 'done' && !isDone(l)) return false;
    return matches(l.title, l.summary);
  });
  const mine = drafts.filter((d) => matches(d.title, d.summary));
  const todo = all.filter((l) => !isDone(l)).length;

  const dropProps = onImportFile ? {
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropping(true); } },
    onDragLeave: (e: React.DragEvent) => { if (e.currentTarget === e.target) setDropping(false); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDropping(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onImportFile(file);
    },
  } : {};

  return (
    <div style={tutStyles.scrim} onClick={onClose}>
      <div
        style={{ ...tutStyles.dialog, ...(dropping ? { outline: '2px dashed var(--cyan)', outlineOffset: -6 } : null) }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Lessons"
        {...dropProps}
      >
        <div style={tutStyles.dialogHead}>
          <div>
            <div style={tutStyles.dialogTitle}>Lessons</div>
            <div style={tutStyles.dialogSub}>guided, hands-on · checked as you draw · your sprite waits while you learn</div>
          </div>
          <span style={tutStyles.dialogClose} onClick={onClose} title="Close"><IconX size={11} /></span>
        </div>
        <div style={tutStyles.tabs}>
          <div style={tutStyles.tab(tab === 'all')} onClick={() => setTab('all')} data-tab="all">All<span style={tutStyles.tabBadge}>{all.length}</span></div>
          <div style={tutStyles.tab(tab === 'todo')} onClick={() => setTab('todo')} data-tab="todo">To do<span style={tutStyles.tabBadge}>{todo}</span></div>
          <div style={tutStyles.tab(tab === 'done')} onClick={() => setTab('done')} data-tab="done">Done<span style={tutStyles.tabBadge}>{all.length - todo}</span></div>
          {onEditDraft && (
            <div style={{ ...tutStyles.tab(tab === 'mine'), marginLeft: 'auto' }} onClick={() => setTab('mine')} data-tab="mine">
              My lessons<span style={tutStyles.tabBadge}>{drafts.length}</span>
            </div>
          )}
        </div>
        <div style={tutStyles.searchRow}>
          <span style={{ color: 'var(--ink-4)' }}><IconSearch size={13} /></span>
          <input style={tutStyles.searchInput} placeholder={tab === 'mine' ? 'Search my lessons…' : 'Search lessons…'} value={query} onChange={(e) => setQuery(e.target.value)} />
          {onImport && (
            <span
              data-import-lesson
              style={{ ...tutStyles.composeBtn, color: 'var(--ink-2)', border: '1px solid var(--rule-2)' }}
              onClick={onImport}
              title="Open a .sindri-lesson file someone shared (or drop one here)"
            >
              <IconFolder size={11} /> Import lesson…
            </span>
          )}
          {onAuthor && (
            <span style={tutStyles.composeBtn} onClick={() => { onClose(); onAuthor(); }} data-new-lesson>
              <IconPlus size={11} /> New lesson
            </span>
          )}
        </div>
        {notice && (
          <div
            data-library-notice={notice.kind}
            role="status"
            style={{ padding: '9px 24px', borderBottom: '1px solid var(--rule)', fontSize: 12, color: notice.kind === 'ok' ? 'var(--moss)' : 'var(--red)', background: 'var(--paper)' }}
          >
            {notice.text}
          </div>
        )}

        {tab !== 'mine' && (
          <div style={tutStyles.grid}>
            {filtered.length === 0 && (
              <div style={{ gridColumn: '1 / -1', padding: 32, background: 'var(--paper-2)', color: 'var(--ink-3)', fontSize: 13 }}>
                {tab === 'done' ? 'No finished lessons yet — pick one from “To do”.' : 'No lessons match that search.'}
              </div>
            )}
            {filtered.map((l) => {
              const shared = sharedIds.has(l.id);
              return (
                <div
                  key={l.id}
                  data-lesson={l.id}
                  data-shared={shared || undefined}
                  className={l.id === freshId ? 'mk-stamp' : undefined}
                  style={{ ...tutStyles.card, ...(hover === l.id ? tutStyles.cardHover : null) }}
                  onMouseEnter={() => setHover(l.id)}
                  onMouseLeave={() => { setHover(null); setConfirming(null); }}
                  onClick={() => onStart(l)}
                >
                  <div style={tutStyles.cardCoverWrap}>
                    <CoverPreview pixels={coverOf(l)} size={96} />
                    {isDone(l) && <span style={tutStyles.completedBadge}>done</span>}
                    {!isDone(l) && l.id === freshId && <span style={{ ...tutStyles.completedBadge, background: 'var(--cyan)' }}>new</span>}
                  </div>
                  <div style={tutStyles.cardBody}>
                    <div style={tutStyles.cardTitleBlock}>
                      <div style={tutStyles.cardTitle}>{l.title}</div>
                      <div style={tutStyles.cardSummary}>{l.summary}</div>
                    </div>
                    <div style={{ flex: 1 }} />
                    <div style={tutStyles.cardMeta}>
                      <span style={tutStyles.difficulty(l.difficulty)}>{l.difficulty}</span>
                      <span>{l.steps.length} steps</span>
                      <span style={tutStyles.cardMetaDot} />
                      <span>{l.minutes} min</span>
                    </div>
                    <div style={{ ...tutStyles.cardMeta, color: 'var(--ink-3)', justifyContent: 'space-between' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{shared ? `shared by ${l.author}` : l.author}</span>
                      {shared && onRemoveImported && hover === l.id && (
                        confirming === l.id
                          ? <CardAction label="remove?" danger onClick={() => onRemoveImported(l.id)} />
                          : <CardAction label="remove" title="Take this shared lesson off your shelf" onClick={() => setConfirming(l.id)} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'mine' && (
          <div style={tutStyles.grid} data-my-lessons>
            {onAuthor && !q && (
              <div
                data-new-lesson-card
                style={{ ...tutStyles.card, gridTemplateColumns: '1fr', alignItems: 'center', justifyItems: 'center', textAlign: 'center', ...(hover === '__new' ? tutStyles.cardHover : null) }}
                onMouseEnter={() => setHover('__new')}
                onMouseLeave={() => setHover(null)}
                onClick={() => { onClose(); onAuthor(); }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 44, height: 44, border: '1px dashed var(--amber)', color: 'var(--amber)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><IconPlus size={16} /></span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--ink)' }}>Make a lesson</span>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.45, maxWidth: 220 }}>Press record, draw, press done — each thing you do becomes a step.</span>
                </div>
              </div>
            )}
            {mine.length === 0 && (
              <div style={{ gridColumn: onAuthor && !q ? 'span 2' : '1 / -1', padding: 32, background: 'var(--paper-2)', color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.6 }}>
                {q ? 'None of your lessons match that search.' : 'Lessons you make live here. Clear one — play it start to finish — and you can share it.'}
              </div>
            )}
            {mine.map((d) => (
              <div
                key={d.id}
                data-draft={d.id}
                data-cleared={d.cleared || undefined}
                style={{ ...tutStyles.card, ...(hover === d.id ? tutStyles.cardHover : null) }}
                onMouseEnter={() => setHover(d.id)}
                onMouseLeave={() => { setHover(null); setConfirming(null); }}
                onClick={() => onEditDraft?.(d)}
                title="Keep making this lesson"
              >
                <div style={tutStyles.cardCoverWrap}>
                  <CoverPreview pixels={draftCover(d)} size={96} />
                  {d.cleared
                    ? <span style={{ ...tutStyles.completedBadge, background: 'var(--amber)', transform: 'rotate(-6deg)' }}>cleared</span>
                    : <span style={{ ...tutStyles.completedBadge, background: 'var(--paper-4)', color: 'var(--ink-3)' }}>draft</span>}
                </div>
                <div style={tutStyles.cardBody}>
                  <div style={tutStyles.cardTitleBlock}>
                    <div style={tutStyles.cardTitle}>{d.title || 'Untitled lesson'}</div>
                    <div style={tutStyles.cardSummary}>{d.summary || (d.cleared ? 'Cleared — ready to share.' : 'Play it start to finish to clear it.')}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <div style={tutStyles.cardMeta}>
                    <span>{d.steps.length} step{d.steps.length === 1 ? '' : 's'}</span>
                    <span style={tutStyles.cardMetaDot} />
                    <span>edited {ago(d.updatedAt)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', opacity: hover === d.id ? 1 : 0.55, transition: 'opacity 120ms' }}>
                    <CardAction label="edit" onClick={() => onEditDraft?.(d)}><IconPencil size={9} /></CardAction>
                    {!!d.steps.length && onPlayDraft && <CardAction label="play" title="Play it as a learner would" onClick={() => onPlayDraft(d)}><IconPlay size={9} /></CardAction>}
                    {onCopyDraft && <CardAction label="copy" title="Make a copy to take somewhere new" onClick={() => onCopyDraft(d)}><IconCopy size={9} /></CardAction>}
                    {onDeleteDraft && (confirming === d.id
                      ? <CardAction label="delete?" danger title="Click again to delete for good" onClick={() => onDeleteDraft(d.id)}><IconTrash size={9} /></CardAction>
                      : <CardAction label="delete" onClick={() => setConfirming(d.id)}><IconTrash size={9} /></CardAction>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TutorialPlayerLane
// ---------------------------------------------------------------------------

export function TutorialPlayerLane({
  lesson, phase, stepIdx, results, stepComplete, notice, exampleVisible,
  onToggleExample, onBegin, onPrev, onNext, onJump, onExit, exitLabel = 'Exit',
}: TutorialPlayerLaneProps) {
  const [hintOpen, setHintOpen] = React.useState(false);
  React.useEffect(() => { setHintOpen(false); }, [stepIdx, phase]);
  const step = lesson.steps[stepIdx];
  const total = lesson.steps.length;
  const last = stepIdx >= total - 1;
  const readOnly = step && step.checks.length === 0;

  return (
    <div style={{ ...tutStyles.laneRoot, height: 'auto', maxHeight: '58vh', borderBottom: '1px solid var(--rule-2)' }} data-lesson-lane>
      <div style={{ ...tutStyles.laneHead, padding: '12px 18px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={tutStyles.laneKicker}>● lesson{phase === 'step' ? ` · step ${stepIdx + 1} of ${total}` : phase === 'outro' ? ' · complete' : ''}</div>
          <span style={{ ...tutStyles.laneKicker, color: 'var(--ink-4)', cursor: 'pointer' }} onClick={onExit} title="Leave the lesson and get your sprite back">{exitLabel} ×</span>
        </div>
        <div style={tutStyles.laneTitle}>{lesson.title}</div>
      </div>
      <div style={{ ...tutStyles.progressRow, padding: '10px 18px 8px' }}>
        {lesson.steps.map((s, i) => (
          <span
            key={s.id}
            title={`${i + 1}. ${s.title}`}
            onClick={() => onJump(i)}
            style={{ ...tutStyles.progDot(phase === 'outro' || i < stepIdx ? 'done' : phase === 'step' && i === stepIdx ? 'current' : 'pending'), cursor: 'pointer' }}
          />
        ))}
      </div>

      <div style={{ ...tutStyles.currentCard, borderTop: 'none', overflowY: 'auto', flex: 1 }}>
        {phase === 'intro' && (
          <>
            <div style={tutStyles.instruction}>{lesson.intro}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '0.06em' }}>
              {total} steps · about {lesson.minutes} min · {lesson.difficulty}
            </div>
          </>
        )}
        {phase === 'outro' && (
          <>
            <div style={{ ...tutStyles.goalRow, color: 'var(--moss)' }}><IconCheck size={12} stroke="var(--moss)" /><span>lesson complete</span></div>
            <div style={tutStyles.instruction}>{lesson.outro}</div>
          </>
        )}
        {phase === 'step' && step && (
          <>
            <div style={{ ...tutStyles.goalRow, color: stepComplete ? 'var(--moss)' : 'var(--cyan)' }}>
              {stepComplete ? <IconCheck size={12} stroke="var(--moss)" /> : <span style={tutStyles.goalDot} />}
              <span>{stepComplete ? 'nice — next step…' : step.title}</span>
            </div>
            <div style={tutStyles.instruction}>{step.instruction}</div>
            {!!results.length && (
              <div style={tutStyles.criteria} aria-live="polite">
                {results.map((c, i) => (
                  <div key={i} style={tutStyles.critRow(c.met)}>
                    <span style={tutStyles.critGlyph}>
                      {c.met
                        ? <IconCheck size={10} stroke="var(--moss)" />
                        : <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square"><rect x="0.5" y="0.5" width="9" height="9" /></svg>}
                    </span>
                    <span style={{ flex: 1 }}>{c.label}</span>
                    {c.progress && !c.met && <span style={{ color: 'var(--ink-4)' }}>{c.progress}</span>}
                  </div>
                ))}
              </div>
            )}
            {notice && <div style={{ ...tutStyles.hint, borderColor: 'var(--amber)', color: 'var(--amber)' }}>{notice}</div>}
            {hintOpen && step.hint && (
              <div style={tutStyles.hint}>
                <div style={tutStyles.hintLabel}>hint</div>
                <div>{step.hint}</div>
              </div>
            )}
          </>
        )}
      </div>

      <div style={tutStyles.laneFooter}>
        {phase === 'intro' && <span style={tutStyles.laneBtn('primary')} onClick={onBegin}>Start →</span>}
        {phase === 'step' && (
          <>
            {stepIdx > 0 && <span style={tutStyles.laneBtn('exit')} onClick={onPrev} title="Previous step">←</span>}
            {step?.hint && <span style={tutStyles.laneBtn('exit')} onClick={() => setHintOpen((v) => !v)}>{hintOpen ? 'Hide hint' : 'Hint'}</span>}
            {step?.example && <span style={tutStyles.laneBtn(exampleVisible ? 'exit' : 'exit')} onClick={onToggleExample} title="Show or hide the example over the canvas">{exampleVisible ? 'Hide example' : 'Show example'}</span>}
            <span
              style={tutStyles.laneBtn(readOnly || stepComplete ? 'primary' : 'exit')}
              onClick={onNext}
              title={readOnly ? undefined : 'Skip ahead without completing this step'}
            >
              {readOnly ? (last ? 'Finish' : 'Continue →') : last ? 'Skip to end' : 'Skip →'}
            </span>
          </>
        )}
        {phase === 'outro' && (
          <>
            <span style={tutStyles.laneBtn('exit')} onClick={() => onJump(0)}>Replay</span>
            <span style={tutStyles.laneBtn('primary')} onClick={onExit}>Back to my sprite</span>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TutorialSpotlight
// ---------------------------------------------------------------------------

export function TutorialSpotlight({ targetRect, callout }: TutorialSpotlightProps) {
  if (!targetRect) return null;

  const pad = 6;
  const r = { x: targetRect.x - pad, y: targetRect.y - pad, w: targetRect.w + pad * 2, h: targetRect.h + pad * 2 };

  const baseStyle: React.CSSProperties = targetRect.scope === 'viewport'
    ? { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50 }
    : tutStyles.spotRoot;

  const calloutLeft = targetRect.calloutSide === 'left' ? r.x - 260 : r.x + r.w + 16;
  const tailLeft: number | 'auto' = targetRect.calloutSide === 'left' ? 'auto' : -5;
  const tailRight: number | 'auto' = targetRect.calloutSide === 'left' ? -5 : 'auto';
  const tailRot = targetRect.calloutSide === 'left' ? 'rotate(-135deg)' : 'rotate(45deg)';

  return (
    <div style={baseStyle}>
      <div style={{ ...tutStyles.spotDim, left: 0, right: 0, top: 0, height: r.y }} />
      <div style={{ ...tutStyles.spotDim, left: 0, top: r.y, width: r.x, height: r.h }} />
      <div style={{ ...tutStyles.spotDim, left: r.x + r.w, top: r.y, right: 0, height: r.h }} />
      <div style={{ ...tutStyles.spotDim, left: 0, right: 0, top: r.y + r.h, bottom: 0 }} />
      <div style={{ ...tutStyles.spotHole, left: r.x, top: r.y, width: r.w, height: r.h }} />
      {callout && (
        <div style={{ ...tutStyles.callout, left: calloutLeft, top: r.y, width: 240 }}>
          <div style={tutStyles.calloutKicker}>step {callout.stepIdx + 1}</div>
          <div>{callout.text}</div>
          <span style={{ ...tutStyles.calloutTail, left: tailLeft, right: tailRight, top: 14, transform: tailRot }} />
        </div>
      )}
    </div>
  );
}

