import React from 'react';
import type { RecentFile, SavedTemplate } from '../lib/storage';
import type { Frame } from '../types';
import { ForgeMarkPixel, Wordmark, SubMark, LogoLockup } from './Logo';
import { IconSparkle, IconX } from './Icons';

// ── shared style tokens (welcome family) ────────────────────────────────
const wStyles = {
  /* loading screen */
  loadRoot: {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'var(--paper)', color: 'var(--ink)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 32, fontFamily: 'var(--font-sans)',
  } as React.CSSProperties,
  loadMark: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 } as React.CSSProperties,
  loadStage: {
    fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)',
    letterSpacing: '0.14em', textTransform: 'uppercase',
    display: 'flex', alignItems: 'center', gap: 10,
  } as React.CSSProperties,
  loadDot: (kind: string): React.CSSProperties => ({
    width: 6, height: 6,
    background: kind === 'amber' ? 'var(--amber)' : 'var(--moss)',
    animation: 'sk-pulse 1.4s ease-in-out infinite',
  }),
  loadTrack: {
    width: 240, height: 2, background: 'var(--paper-3)', position: 'relative', overflow: 'hidden',
  } as React.CSSProperties,
  loadFill: (p: number): React.CSSProperties => ({
    position: 'absolute', top: 0, left: 0, height: '100%', width: p + '%',
    background: 'var(--ink)', transition: 'width 200ms linear',
  }),

  /* welcome screen */
  welcomeRoot: {
    position: 'fixed', inset: 0, zIndex: 100,
    background: 'var(--paper)', color: 'var(--ink)',
    fontFamily: 'var(--font-sans)',
    display: 'flex', flexDirection: 'column',
    overflow: 'auto',
  } as React.CSSProperties,
  welcomeTop: {
    height: 56, flex: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 18px', borderBottom: '1px solid var(--rule-2)',
    background: 'var(--paper)',
  } as React.CSSProperties,
  welcomeTopRight: { display: 'flex', alignItems: 'center', gap: 14 } as React.CSSProperties,
  welcomeTopLink: {
    fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)',
    letterSpacing: '0.08em', cursor: 'pointer',
  } as React.CSSProperties,
  welcomeBg: {
    position: 'absolute', inset: 56, pointerEvents: 'none',
    backgroundImage:
      'linear-gradient(to right, rgba(230,225,212,0.03) 1px, transparent 1px),' +
      'linear-gradient(to bottom, rgba(230,225,212,0.03) 1px, transparent 1px),' +
      'linear-gradient(to right, rgba(230,225,212,0.06) 1px, transparent 1px),' +
      'linear-gradient(to bottom, rgba(230,225,212,0.06) 1px, transparent 1px)',
    backgroundSize: '40px 40px, 40px 40px, 200px 200px, 200px 200px',
  } as React.CSSProperties,
  shell: { position: 'relative', flex: 1, padding: '36px 48px 48px', maxWidth: 1080, width: '100%', margin: '0 auto', boxSizing: 'border-box' } as React.CSSProperties,
  hero: { display: 'flex', alignItems: 'center', gap: 22, marginBottom: 32 } as React.CSSProperties,
  heroText: { display: 'flex', flexDirection: 'column', gap: 8 } as React.CSSProperties,
  heroTitle: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 36, letterSpacing: '-0.01em', color: 'var(--ink)', lineHeight: 1 } as React.CSSProperties,
  heroSub: { fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase' } as React.CSSProperties,
  heroTag: { fontSize: 13.5, color: 'var(--ink-2)', maxWidth: 540, lineHeight: 1.55, marginTop: 6 } as React.CSSProperties,
  sectionRow: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    marginTop: 28, marginBottom: 12,
  } as React.CSSProperties,
  sectionLabel: {
    color: 'var(--ink-3)', fontFamily: 'var(--font-display)', fontSize: 11,
    letterSpacing: '0.14em', textTransform: 'uppercase',
  } as React.CSSProperties,
  sectionMeta: { color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.06em' } as React.CSSProperties,
  primaryRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--rule)', border: '1px solid var(--rule-2)' } as React.CSSProperties,
  primary: (_variant: string): React.CSSProperties => ({
    background: 'var(--paper-2)', cursor: 'pointer',
    padding: '22px 22px', display: 'flex', flexDirection: 'column', gap: 12,
    minHeight: 140, position: 'relative',
  }),
  primaryHover: { background: 'var(--paper-3)' } as React.CSSProperties,
  primaryGlyph: {
    width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--ink)',
  } as React.CSSProperties,
  primaryGlyphAi: { color: 'var(--amber)' } as React.CSSProperties,
  primaryGlyphCyan: { color: 'var(--cyan)' } as React.CSSProperties,
  primaryTitle: { fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--ink)', lineHeight: 1.2 } as React.CSSProperties,
  primaryDesc: { fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5, marginTop: 2, flex: 1 } as React.CSSProperties,
  primaryShortcut: {
    position: 'absolute', top: 14, right: 14,
    fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)',
    border: '1px solid var(--rule-2)', padding: '0 5px', letterSpacing: '0.06em',
  } as React.CSSProperties,
  templateGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--rule)', border: '1px solid var(--rule-2)' } as React.CSSProperties,
  template: {
    background: 'var(--paper-2)', cursor: 'pointer',
    padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
    minHeight: 150, position: 'relative',
  } as React.CSSProperties,
  templatePreview: {
    width: '100%', aspectRatio: '1 / 1',
    background: '#0a0e14', border: '1px solid var(--rule-2)',
    display: 'block', imageRendering: 'pixelated',
  } as React.CSSProperties,
  templateMeta: { display: 'flex', flexDirection: 'column', gap: 2 } as React.CSSProperties,
  templateName: { fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--ink)' } as React.CSSProperties,
  templateSpec: { fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '0.06em' } as React.CSSProperties,
  recentRow: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1,
    background: 'var(--rule)', border: '1px solid var(--rule-2)',
  } as React.CSSProperties,
  recent: {
    background: 'var(--paper-2)', cursor: 'pointer',
    padding: 16, display: 'flex', gap: 14, alignItems: 'center',
  } as React.CSSProperties,
  recentThumb: {
    width: 64, height: 64, background: '#0a0e14',
    border: '1px solid var(--rule-2)', imageRendering: 'pixelated', flex: 'none',
  } as React.CSSProperties,
  recentMeta: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 } as React.CSSProperties,
  recentName: { fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as React.CSSProperties,
  recentSpec: { fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '0.06em' } as React.CSSProperties,
  recentBadge: {
    fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)',
    border: '1px solid var(--cyan)', padding: '1px 5px',
    letterSpacing: '0.1em', textTransform: 'uppercase',
    alignSelf: 'flex-start', marginLeft: 'auto',
  } as React.CSSProperties,
  compose: {
    marginTop: 28, padding: '14px 18px',
    background: 'var(--paper-2)',
    border: '1px solid var(--rule-2)',
    display: 'flex', alignItems: 'center', gap: 14,
  } as React.CSSProperties,
  composeKicker: { fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--amber)', letterSpacing: '0.14em', textTransform: 'uppercase' } as React.CSSProperties,
  composeBody: { color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.55, flex: 1 } as React.CSSProperties,
  composeBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--amber)',
    cursor: 'pointer', padding: '6px 12px',
    border: '1px solid var(--amber)', whiteSpace: 'nowrap',
  } as React.CSSProperties,
  npScrim: {
    position: 'fixed', inset: 0, zIndex: 150,
    background: 'rgba(13,17,23,0.62)', backdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  } as React.CSSProperties,
  npDialog: {
    width: 'min(640px, 92vw)',
    background: 'var(--paper-2)', border: '1px solid var(--rule-2)',
    color: 'var(--ink)', fontFamily: 'var(--font-sans)',
    boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
  } as React.CSSProperties,
  npHead: {
    padding: '18px 22px 14px', borderBottom: '1px solid var(--rule-2)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
  } as React.CSSProperties,
  npTitle: { fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink)' } as React.CSSProperties,
  npSub: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)', marginTop: 4, letterSpacing: '0.06em' } as React.CSSProperties,
  npClose: { width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--rule-2)', color: 'var(--ink-3)', cursor: 'pointer' } as React.CSSProperties,
  npField: { display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 22px' } as React.CSSProperties,
  npLabel: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)', letterSpacing: '0.08em', textTransform: 'uppercase' } as React.CSSProperties,
  npInput: {
    border: '1px solid var(--rule-2)',
    color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 13,
    padding: '8px 10px', outline: 'none', background: 'var(--paper)',
  } as React.CSSProperties,
  npGrid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--rule)', border: '1px solid var(--rule-2)' } as React.CSSProperties,
  npSizeBtn: (active: boolean): React.CSSProperties => ({
    background: active ? 'var(--paper-3)' : 'var(--paper)',
    color: active ? 'var(--ink)' : 'var(--ink-2)',
    padding: '8px 10px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    borderLeft: active ? '2px solid var(--ink)' : '2px solid transparent',
  }),
  npSizeName: { fontSize: 12.5 } as React.CSSProperties,
  npSizeSpec: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.06em' } as React.CSSProperties,
  npCustomRow: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 } as React.CSSProperties,
  npCustomNum: {
    background: 'var(--paper)', border: '1px solid var(--rule-2)',
    color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 13,
    padding: '6px 8px', width: 64, outline: 'none', textAlign: 'center',
  } as React.CSSProperties,
  npProfileRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--rule)', border: '1px solid var(--rule-2)' } as React.CSSProperties,
  npProfile: (active: boolean): React.CSSProperties => ({
    background: active ? 'var(--paper-3)' : 'var(--paper)',
    color: active ? 'var(--ink)' : 'var(--ink-2)',
    padding: '10px 8px', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
  }),
  npProfileSwatches: { display: 'flex', gap: 1, height: 12, width: '100%' } as React.CSSProperties,
  npProfileSwatch: (col: string | null): React.CSSProperties => ({
    flex: 1, background: col || 'transparent', minWidth: 4, height: 12,
    border: col ? 'none' : '1px dashed var(--rule-2)',
  }),
  npProfileName: { fontFamily: 'var(--font-display)', fontSize: 12 } as React.CSSProperties,
  npProfileSpec: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)' } as React.CSSProperties,
  npToggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 22px 0', cursor: 'pointer' } as React.CSSProperties,
  npToggleLabel: { fontSize: 12.5, color: 'var(--ink-2)' } as React.CSSProperties,
  npToggleDesc: { fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)', padding: '2px 22px 12px', letterSpacing: '0.04em' } as React.CSSProperties,
  npToggle: (on: boolean): React.CSSProperties => ({
    width: 28, height: 14, position: 'relative', border: '1px solid var(--rule-2)',
    background: on ? 'var(--ink)' : 'var(--paper)',
  }),
  npToggleThumb: (on: boolean): React.CSSProperties => ({
    position: 'absolute', top: 1, left: on ? 16 : 1, width: 10, height: 10,
    background: on ? 'var(--paper)' : 'var(--ink-3)',
  }),
  npFooter: {
    padding: '14px 22px', borderTop: '1px solid var(--rule-2)',
    display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center',
    background: 'var(--paper-2)',
  } as React.CSSProperties,
  npFootBtn: (variant: string): React.CSSProperties => ({
    fontFamily: 'var(--font-display)', fontSize: 13,
    padding: '8px 16px', cursor: 'pointer',
    background: variant === 'primary' ? 'var(--ink)' : 'transparent',
    color: variant === 'primary' ? 'var(--paper)' : 'var(--ink-3)',
    border: variant === 'primary' ? '1px solid var(--ink)' : '1px solid var(--rule-2)',
  }),
};

// ── data ────────────────────────────────────────────────────────────────

interface LoadStage {
  t: number;
  text: string;
  kind?: string;
}

const LOAD_STAGES: LoadStage[] = [
  { t: 0,    text: 'initializing forge' },
  { t: 280,  text: 'loading palette' },
  { t: 620,  text: 'compiling brushes' },
  { t: 940,  text: 'priming canvas' },
  { t: 1240, text: 'ready', kind: 'moss' },
];

interface TemplateConfig {
  id: string;
  name: string;
  size: string;
  w: number;
  h: number;
  frames: number;
  kind: string;
}

const TEMPLATES: TemplateConfig[] = [
  { id: 'tile-16',   name: 'Game tile',        size: '16 × 16',   w: 16,  h: 16,  frames: 1, kind: 'tile' },
  { id: 'sprite-32', name: 'Sprite',            size: '32 × 32',   w: 32,  h: 32,  frames: 1, kind: 'sprite' },
  { id: 'anim-32',   name: 'Animation',         size: '32 × 32',   w: 32,  h: 32,  frames: 4, kind: 'anim' },
  { id: 'icon-16',   name: 'UI icon',           size: '16 × 16',   w: 16,  h: 16,  frames: 1, kind: 'icon' },
  { id: 'avatar-64', name: 'Portrait',          size: '64 × 64',   w: 64,  h: 64,  frames: 1, kind: 'portrait' },
  { id: 'banner',    name: 'Banner',            size: '128 × 64',  w: 128, h: 64,  frames: 1, kind: 'banner' },
  { id: 'gameboy',   name: 'Game Boy screen',   size: '160 × 144', w: 160, h: 144, frames: 1, kind: 'gameboy' },
  { id: 'blank',     name: 'Blank',             size: '32 × 32',   w: 32,  h: 32,  frames: 1, kind: 'blank' },
];

interface ColorProfile {
  id: string;
  name: string;
  count: number;
  swatches: string[];
}

const COLOR_PROFILES: ColorProfile[] = [
  { id: 'sindri', name: 'Sindri default', count: 16,
    swatches: ['#0d1117', '#1a1a1a', '#4a4642', '#6e6960', '#a8a298', '#e6e1d4', '#6dbcdb', '#3a6e8a', '#9bb070', '#d4541e', '#a03a0e', '#e05555'] },
  { id: 'nes',    name: 'NES',            count: 54,
    swatches: ['#7c7c7c', '#0000fc', '#0000bc', '#4428bc', '#940084', '#a80020', '#a81000', '#881400', '#503000', '#007800', '#006800', '#005800', '#004058', '#000000'] },
  { id: 'gb',     name: 'Game Boy',       count: 4,
    swatches: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
  { id: 'blank',  name: 'Empty',          count: 0,
    swatches: [] },
];

interface SizePreset {
  id: string;
  name: string;
  w: number;
  h: number;
  spec: string;
}

const SIZE_PRESETS: SizePreset[] = [
  { id: 's16',  name: '16 × 16',   w: 16,  h: 16,  spec: 'icon' },
  { id: 's32',  name: '32 × 32',   w: 32,  h: 32,  spec: 'sprite' },
  { id: 's64',  name: '64 × 64',   w: 64,  h: 64,  spec: 'character' },
  { id: 's128', name: '128 × 128', w: 128, h: 128, spec: 'detailed' },
];

// ── local sub-components ─────────────────────────────────────────────────

interface TemplatePreviewProps {
  kind: string;
  w: number;
  h: number;
}

function TemplatePreview({ kind, w, h }: TemplatePreviewProps) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const W = c.width, H = c.height;
    for (let y = 0; y < H; y += 6) for (let x = 0; x < W; x += 6) {
      ctx.fillStyle = ((Math.floor(x / 6) + Math.floor(y / 6)) % 2) ? '#0a0e14' : '#11161d';
      ctx.fillRect(x, y, 6, 6);
    }
    const cx = W / 2, cy = H / 2;
    if (kind === 'tile') {
      ctx.fillStyle = '#6e6960'; ctx.fillRect(W * 0.2, H * 0.55, W * 0.6, H * 0.3);
      ctx.fillStyle = '#a8a298'; ctx.fillRect(W * 0.22, H * 0.57, W * 0.56, H * 0.04);
    } else if (kind === 'sprite') {
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(W * 0.3, H * 0.25, W * 0.4, H * 0.5);
      ctx.fillStyle = '#6dbcdb'; ctx.fillRect(W * 0.4, H * 0.4, W * 0.2, H * 0.1);
      ctx.fillStyle = '#d4541e'; ctx.fillRect(W * 0.43, H * 0.7, W * 0.14, H * 0.06);
    } else if (kind === 'anim') {
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = i === 1 ? '#6dbcdb' : '#2a3038';
        ctx.lineWidth = 1;
        ctx.strokeRect(W * (0.06 + i * 0.22), H * 0.3, W * 0.18, H * 0.4);
        ctx.fillStyle = '#a8a298';
        ctx.fillRect(W * (0.10 + i * 0.22), H * (0.40 + (i % 2) * 0.05), W * 0.10, H * 0.18);
      }
    } else if (kind === 'icon') {
      ctx.strokeStyle = '#e6e1d4'; ctx.lineWidth = 2;
      ctx.strokeRect(W * 0.25, H * 0.25, W * 0.5, H * 0.5);
      ctx.fillStyle = '#9bb070'; ctx.fillRect(W * 0.42, H * 0.42, W * 0.16, H * 0.16);
    } else if (kind === 'portrait') {
      ctx.fillStyle = '#a8a298'; ctx.beginPath(); ctx.arc(cx, cy - H * 0.05, W * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(cx - W * 0.10, cy - H * 0.08, 4, 4);
      ctx.fillRect(cx + W * 0.06, cy - H * 0.08, 4, 4);
      ctx.fillRect(cx - W * 0.06, cy + H * 0.02, W * 0.12, 2);
    } else if (kind === 'banner') {
      ctx.fillStyle = '#d4541e'; ctx.fillRect(W * 0.1, H * 0.35, W * 0.8, H * 0.3);
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(W * 0.1, H * 0.40, W * 0.8, 3);
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(W * 0.1, H * 0.58, W * 0.8, 3);
    } else if (kind === 'gameboy') {
      const greens = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = greens[i];
        ctx.fillRect(W * 0.1, H * (0.25 + i * 0.12), W * 0.8, H * 0.12);
      }
    } else if (kind === 'blank') {
      ctx.strokeStyle = '#2a3038'; ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(W * 0.1, H * 0.1, W * 0.8, H * 0.8);
    }
  }, [kind, w, h]);
  return <canvas ref={ref} width={140} height={140} style={wStyles.templatePreview}/>;
}

interface RecentPreviewProps {
  frame: Frame | null | undefined;
}

function RecentPreview({ frame }: RecentPreviewProps) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const c = ref.current; if (!c || !frame) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const s = c.width / 32;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      ctx.fillStyle = ((Math.floor(x / 4) + Math.floor(y / 4)) % 2) ? '#0a0e14' : '#11161d';
      ctx.fillRect(x * s, y * s, s, s);
    }
    frame.layers.forEach((L) => {
      if (!L.visible) return;
      ctx.globalAlpha = L.opacity;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const col = L.pixels[y]?.[x]; if (!col) continue;
        ctx.fillStyle = col; ctx.fillRect(x * s, y * s, s, s);
      }
    });
    ctx.globalAlpha = 1;
  }, [frame]);
  return <canvas ref={ref} width={64} height={64} style={wStyles.recentThumb}/>;
}

interface PrimaryCardProps {
  kind: string;
  title: string;
  desc: string;
  shortcut?: string;
  onClick: () => void;
}

function PrimaryCard({ kind, title, desc, shortcut, onClick }: PrimaryCardProps) {
  const [hover, setHover] = React.useState(false);
  const glyph: Record<string, React.ReactNode> = {
    new:     <svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square"><path d="M8 3 V13 M3 8 H13"/><rect x="1.5" y="1.5" width="13" height="13"/></svg>,
    open:    <svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square"><path d="M2 4 H6 L8 6 H14 V13 H2 Z"/></svg>,
    lessons: <svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square"><rect x="2" y="2" width="12" height="12"/><path d="M5 5 H11 M5 8 H11 M5 11 H8"/></svg>,
  };
  const glyphColor = kind === 'lessons' ? wStyles.primaryGlyphCyan : (kind === 'compose' ? wStyles.primaryGlyphAi : undefined);
  return (
    <div
      style={{ ...wStyles.primary(kind), ...(hover ? wStyles.primaryHover : undefined) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      <span style={{ ...wStyles.primaryGlyph, ...glyphColor }}>{glyph[kind]}</span>
      <div style={wStyles.primaryTitle}>{title}</div>
      <div style={wStyles.primaryDesc}>{desc}</div>
      {shortcut && <span style={wStyles.primaryShortcut}>{shortcut}</span>}
    </div>
  );
}

// ── exported components ──────────────────────────────────────────────────

export interface LoadingScreenProps {
  onDone: () => void;
}

export function LoadingScreen({ onDone }: LoadingScreenProps) {
  const [progress, setProgress] = React.useState(0);
  const [stage, setStage] = React.useState<LoadStage>(LOAD_STAGES[0]);

  React.useEffect(() => {
    LOAD_STAGES.forEach((s) => {
      setTimeout(() => {
        setStage(s);
        setProgress((LOAD_STAGES.indexOf(s) + 1) / LOAD_STAGES.length * 100);
      }, s.t);
    });
    const id = setTimeout(onDone, 1500);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div style={wStyles.loadRoot}>
      <div style={wStyles.loadMark}>
        <ForgeMarkPixel size={88}/>
        <Wordmark size={24}/>
        <SubMark size={11}/>
      </div>
      <div style={wStyles.loadTrack}>
        <div style={wStyles.loadFill(progress)}/>
      </div>
      <div style={wStyles.loadStage}>
        <span style={wStyles.loadDot(stage.kind || 'amber')}/>
        <span>{stage.text}…</span>
      </div>
    </div>
  );
}

export interface RecoveryInfo {
  name: string;
  savedAt: number;
  spec: string;
}

export interface WelcomeScreenProps {
  onEnter: () => void;
  onNewProject: (template?: TemplateConfig) => void;
  onOpenLessons: () => void;
  onOpenFile: () => void;
  onComposeWithSindri: () => void;
  recentFrame: Frame | null | undefined;
  recentFiles: RecentFile[];
  savedTemplates: SavedTemplate[];
  onOpenRecent: (file: RecentFile) => void;
  recovery?: RecoveryInfo | null;
  onRecover?: () => void;
  onDiscardRecovery?: () => void;
}

function timeAgo(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return 'moments ago';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

export function WelcomeScreen({ onEnter, onNewProject, onOpenLessons, onOpenFile, onComposeWithSindri, recentFrame, recentFiles, savedTemplates, onOpenRecent, recovery, onRecover, onDiscardRecovery }: WelcomeScreenProps) {
  return (
    <div style={wStyles.welcomeRoot}>
      <div style={wStyles.welcomeTop}>
        <LogoLockup size={18}/>
        <div style={wStyles.welcomeTopRight}>
          <span style={wStyles.welcomeTopLink} onClick={onEnter}>skip · enter editor</span>
        </div>
      </div>
      <div style={wStyles.welcomeBg}/>
      <div style={wStyles.shell}>
        <div style={wStyles.hero}>
          <ForgeMarkPixel size={84}/>
          <div style={wStyles.heroText}>
            <div style={wStyles.heroSub}>welcome to</div>
            <div style={wStyles.heroTitle}>Sindri Pixel Editor</div>
            <div style={wStyles.heroTag}>
              A pixel-art editor for the Sindri engine. Draw sprites, animate frames,
              follow lessons, or ask Sindri to compose something with you.
            </div>
          </div>
        </div>
        {recovery && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            margin: '0 0 22px', padding: '14px 18px',
            background: 'var(--paper-2)', border: '1px dashed var(--amber)',
          }} data-testid="recovery-banner">
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 13.5, color: 'var(--amber)', marginBottom: 3 }}>
                Recovered work found
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
                {recovery.name} · {recovery.spec} · autosaved {timeAgo(recovery.savedAt)}
              </div>
            </div>
            <span
              style={{ fontFamily: 'var(--font-display)', fontSize: 12, padding: '7px 14px', cursor: 'pointer', background: 'var(--amber)', color: 'var(--paper)', border: '1px solid var(--amber)' }}
              onClick={onRecover}
            >
              Restore
            </span>
            <span
              style={{ fontFamily: 'var(--font-display)', fontSize: 12, padding: '7px 14px', cursor: 'pointer', background: 'transparent', color: 'var(--ink-3)', border: '1px solid var(--rule-2)' }}
              onClick={onDiscardRecovery}
            >
              Discard
            </span>
          </div>
        )}
        <div style={wStyles.sectionRow}>
          <span style={wStyles.sectionLabel}>start</span>
          <span style={wStyles.sectionMeta}>3 ways in</span>
        </div>
        <div style={wStyles.primaryRow}>
          <PrimaryCard kind="new"     title="New sprite"     desc="Start a blank canvas. Choose a size, color profile, and whether to animate." shortcut="⌘N" onClick={() => onNewProject()}/>
          <PrimaryCard kind="open"    title="Open sprite"    desc="Pick up an existing .spr file, sprite sheet, or imported PNG."              shortcut="⌘O" onClick={onOpenFile}/>
          <PrimaryCard kind="lessons" title="Browse lessons" desc="6 built-in lessons plus community drops. Run them live inside the editor."  shortcut="⇧⌘L" onClick={onOpenLessons}/>
        </div>
        <div style={wStyles.sectionRow}>
          <span style={wStyles.sectionLabel}>recent</span>
          <span style={wStyles.sectionMeta}>{recentFiles.length} files</span>
        </div>
        <div style={wStyles.recentRow}>
          {recentFiles.length === 0 && (
            <div style={{ ...wStyles.recent, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '24px 18px' }}>
              no recent files yet — create or open one above
            </div>
          )}
          {recentFiles.map((r, i) => (
            <div key={r.id} style={wStyles.recent} onClick={() => onOpenRecent(r)}>
              <RecentPreview frame={i === 0 ? recentFrame : null}/>
              <div style={wStyles.recentMeta}>
                <div style={wStyles.recentName}>{r.name}</div>
                <div style={wStyles.recentSpec}>{r.spec}</div>
              </div>
              {i === 0 && <span style={wStyles.recentBadge}>continue</span>}
            </div>
          ))}
        </div>
        <div style={wStyles.sectionRow}>
          <span style={wStyles.sectionLabel}>templates</span>
          <span style={wStyles.sectionMeta}>{TEMPLATES.length + savedTemplates.length} presets</span>
        </div>
        <div style={wStyles.templateGrid}>
          {TEMPLATES.map((t) => (
            <div key={t.id} style={wStyles.template} onClick={() => onNewProject(t)}>
              <TemplatePreview kind={t.kind} w={t.w} h={t.h}/>
              <div style={wStyles.templateMeta}>
                <div style={wStyles.templateName}>{t.name}</div>
                <div style={wStyles.templateSpec}>{t.size}{t.frames > 1 ? ` · ${t.frames} frames` : ''}</div>
              </div>
            </div>
          ))}
          {savedTemplates.map((t) => (
            <div key={t.id} style={wStyles.template} onClick={() => onNewProject({
              id: t.id, name: t.name, size: `${t.w} × ${t.h}`,
              w: t.w, h: t.h, frames: t.frames, kind: 'blank',
            })}>
              <TemplatePreview kind="blank" w={t.w} h={t.h}/>
              <div style={wStyles.templateMeta}>
                <div style={wStyles.templateName}>{t.name}</div>
                <div style={wStyles.templateSpec}>{t.w} × {t.h}{t.frames > 1 ? ` · ${t.frames} fr` : ''} · saved</div>
              </div>
            </div>
          ))}
        </div>
        <div style={wStyles.compose}>
          <IconSparkle size={16} stroke="var(--amber)"/>
          <div style={wStyles.composeBody}>
            <div style={wStyles.composeKicker}>compose with sindri</div>
            <div style={{ marginTop: 4 }}>
              Don't know where to start? Describe what you want and Sindri will scaffold a sprite, palette, and animation for you to refine.
            </div>
          </div>
          <span style={wStyles.composeBtn} onClick={onComposeWithSindri}>Open Compose</span>
        </div>
      </div>
    </div>
  );
}

export interface NewProjectConfig {
  name: string;
  w: number;
  h: number;
  profile: string;
  animated: boolean;
  frames: number;
  saveAsTemplate: boolean;
}

export interface NewProjectModalProps {
  open: boolean;
  template: TemplateConfig | null | undefined;
  onClose: () => void;
  onCreate: (cfg: NewProjectConfig) => void;
}

export function NewProjectModal({ open, template, onClose, onCreate }: NewProjectModalProps) {
  const [name, setName] = React.useState('untitled.spr');
  const [size, setSize] = React.useState('s32');
  const [customW, setCustomW] = React.useState(32);
  const [customH, setCustomH] = React.useState(32);
  const [profile, setProfile] = React.useState('sindri');
  const [animated, setAnimated] = React.useState(false);
  const [frames, setFrames] = React.useState(4);
  const [saveAsTemplate, setSaveAsTemplate] = React.useState(false);

  React.useEffect(() => {
    if (!template) return;
    setCustomW(template.w); setCustomH(template.h);
    const matched = SIZE_PRESETS.find((s) => s.w === template.w && s.h === template.h);
    setSize(matched ? matched.id : 'custom');
    setAnimated(template.frames > 1);
    setFrames(Math.max(2, template.frames || 4));
    setName(`untitled_${template.name.toLowerCase().replace(/\s+/g, '_')}.spr`);
  }, [template]);

  if (!open) return null;
  const finalW = size === 'custom' ? customW : (SIZE_PRESETS.find((s) => s.id === size)?.w ?? 32);
  const finalH = size === 'custom' ? customH : (SIZE_PRESETS.find((s) => s.id === size)?.h ?? 32);

  return (
    <div style={wStyles.npScrim} onClick={onClose}>
      <div style={wStyles.npDialog} onClick={(e) => e.stopPropagation()}>
        <div style={wStyles.npHead}>
          <div>
            <div style={wStyles.npTitle}>New sprite</div>
            <div style={wStyles.npSub}>{template ? `from template · ${template.name.toLowerCase()}` : 'blank canvas'}</div>
          </div>
          <span style={wStyles.npClose} onClick={onClose}><IconX size={11}/></span>
        </div>
        <div style={wStyles.npField}>
          <span style={wStyles.npLabel}>project name</span>
          <input style={wStyles.npInput} value={name} onChange={(e) => setName(e.target.value)}/>
        </div>
        <div style={wStyles.npField}>
          <span style={wStyles.npLabel}>canvas size</span>
          <div style={wStyles.npGrid2}>
            {SIZE_PRESETS.map((s) => (
              <div key={s.id} style={wStyles.npSizeBtn(size === s.id)} onClick={() => setSize(s.id)}>
                <span style={wStyles.npSizeName}>{s.name}</span>
                <span style={wStyles.npSizeSpec}>{s.spec}</span>
              </div>
            ))}
            <div style={wStyles.npSizeBtn(size === 'custom')} onClick={() => setSize('custom')}>
              <span style={wStyles.npSizeName}>Custom</span>
              <span style={wStyles.npSizeSpec}>any size</span>
            </div>
          </div>
          {size === 'custom' && (
            <div style={wStyles.npCustomRow}>
              <span style={wStyles.npLabel}>w</span>
              <input
                style={wStyles.npCustomNum}
                type="number"
                value={customW}
                onChange={(e) => setCustomW(Math.max(1, Math.min(512, Number(e.target.value))))}
              />
              <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>×</span>
              <span style={wStyles.npLabel}>h</span>
              <input
                style={wStyles.npCustomNum}
                type="number"
                value={customH}
                onChange={(e) => setCustomH(Math.max(1, Math.min(512, Number(e.target.value))))}
              />
              <span style={{ ...wStyles.npSizeSpec, marginLeft: 'auto' }}>up to 512 × 512</span>
            </div>
          )}
        </div>
        <div style={wStyles.npField}>
          <span style={wStyles.npLabel}>color profile</span>
          <div style={wStyles.npProfileRow}>
            {COLOR_PROFILES.map((p) => (
              <div key={p.id} style={wStyles.npProfile(profile === p.id)} onClick={() => setProfile(p.id)}>
                <div style={wStyles.npProfileName}>{p.name}</div>
                <div style={wStyles.npProfileSwatches}>
                  {p.swatches.slice(0, 12).map((c, i) => <div key={i} style={wStyles.npProfileSwatch(c)}/>)}
                  {p.swatches.length === 0 && <div style={wStyles.npProfileSwatch(null)}/>}
                </div>
                <div style={wStyles.npProfileSpec}>{p.count === 0 ? 'empty' : `${p.count} colors`}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={wStyles.npToggleRow} onClick={() => setAnimated(!animated)}>
          <span style={wStyles.npToggleLabel}>animated</span>
          <span style={wStyles.npToggle(animated)}><span style={wStyles.npToggleThumb(animated)}/></span>
        </div>
        {animated && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 22px 10px' }}>
            <span style={wStyles.npLabel}>frames</span>
            <span
              style={wStyles.npCustomNum as React.CSSProperties}
              onClick={() => setFrames((f) => Math.max(2, f - 1))}
              role="button"
              aria-label="fewer frames"
            >−</span>
            <span style={{ ...wStyles.npCustomNum as React.CSSProperties, cursor: 'default', width: 40, textAlign: 'center' }}>
              {frames}
            </span>
            <span
              style={wStyles.npCustomNum as React.CSSProperties}
              onClick={() => setFrames((f) => Math.min(64, f + 1))}
              role="button"
              aria-label="more frames"
            >+</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)', marginLeft: 4 }}>
              2 – 64
            </span>
          </div>
        )}
        <div style={wStyles.npToggleDesc}>
          {animated
            ? `Starts with ${frames} frames. Add or remove anytime from the timeline.`
            : 'Single frame. The timeline stays available — add frames later from a hotkey or the bottom bar.'}
        </div>
        <div style={wStyles.npToggleRow} onClick={() => setSaveAsTemplate(!saveAsTemplate)}>
          <span style={wStyles.npToggleLabel}>save these settings as a template</span>
          <span style={wStyles.npToggle(saveAsTemplate)}><span style={wStyles.npToggleThumb(saveAsTemplate)}/></span>
        </div>
        <div style={wStyles.npToggleDesc}>
          {saveAsTemplate
            ? 'Shows up as a card on the welcome screen next time.'
            : 'Just this one project. You can save the settings later from File → Save as template.'}
        </div>
        <div style={wStyles.npFooter}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.06em' }}>
            {finalW} × {finalH} · {animated ? `${frames} frames` : '1 frame'} · {COLOR_PROFILES.find((p) => p.id === profile)?.count ?? 0} colors
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={wStyles.npFootBtn('cancel')} onClick={onClose}>Cancel</span>
            <span
              style={wStyles.npFootBtn('primary')}
              onClick={() => onCreate({ name, w: finalW, h: finalH, profile, animated, frames: animated ? frames : 1, saveAsTemplate })}
            >
              Create sprite
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { TemplateConfig };
