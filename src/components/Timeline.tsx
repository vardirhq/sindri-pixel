import React from 'react';
import type { Frame } from '../types';
import { IconOnion, IconCopy, IconTrash, IconPlus } from './Icons';

const tlStyles: {
  root: React.CSSProperties;
  head: React.CSSProperties;
  title: React.CSSProperties;
  meta: React.CSSProperties;
  actions: React.CSSProperties;
  btn: (active: boolean) => React.CSSProperties;
  iconBtn: React.CSSProperties;
  strip: React.CSSProperties;
  frame: (active: boolean) => React.CSSProperties;
  thumbBox: (active: boolean, ghost: boolean) => React.CSSProperties;
  thumbCv: React.CSSProperties;
  fnum: (active: boolean, ghost: boolean) => React.CSSProperties;
  addBox: React.CSSProperties;
  badge: React.CSSProperties;
} = {
  root: {
    display: 'flex', flexDirection: 'column',
    height: 160, flex: 'none', overflow: 'hidden',
    background: 'var(--paper)', borderTop: '1px solid var(--rule-2)',
  },
  head: {
    display: 'flex', alignItems: 'center',
    padding: '0 18px', height: 38, gap: 14,
    borderBottom: '1px solid var(--rule)', flex: 'none',
  },
  title: { fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.14em' },
  meta: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.06em' },
  actions: { marginLeft: 'auto', display: 'flex', gap: 4 },
  btn: (active: boolean): React.CSSProperties => ({
    height: 26, padding: '0 10px',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    cursor: 'pointer',
    border: '1px solid var(--rule-2)',
    background: active ? 'var(--paper-3)' : 'var(--paper-2)',
    color: active ? 'var(--ink)' : 'var(--ink-3)',
    fontSize: 11, fontFamily: 'var(--font-display)',
    whiteSpace: 'nowrap',
  }),
  iconBtn: {
    width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', border: '1px solid var(--rule-2)', background: 'var(--paper-2)', color: 'var(--ink-3)',
  },
  strip: { flex: 1, display: 'flex', alignItems: 'flex-start', padding: '12px 18px', gap: 10, overflowX: 'auto' },
  frame: (_active: boolean): React.CSSProperties => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    cursor: 'pointer', flex: 'none', position: 'relative',
  }),
  thumbBox: (active: boolean, ghost: boolean): React.CSSProperties => ({
    width: 72, height: 72,
    border: ghost ? '1.5px dashed var(--amber)' : active ? '2px solid var(--ink)' : '1px solid var(--rule-2)',
    background: '#0a0e14', position: 'relative',
    padding: 0,
  }),
  thumbCv: { width: '100%', height: '100%', imageRendering: 'pixelated', display: 'block' },
  fnum: (active: boolean, ghost: boolean): React.CSSProperties => ({
    fontFamily: 'var(--font-mono)', fontSize: 10.5,
    color: ghost ? 'var(--amber)' : active ? 'var(--ink)' : 'var(--ink-4)',
    letterSpacing: '0.08em',
  }),
  addBox: {
    width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '1px dashed var(--rule-2)', cursor: 'pointer', color: 'var(--ink-4)',
    background: 'transparent',
  },
  badge: {
    position: 'absolute', top: 2, right: 2,
    fontFamily: 'var(--font-mono)', fontSize: 9,
    color: 'var(--amber)', border: '1px solid var(--amber)',
    background: 'rgba(13,17,23,0.85)', padding: '0 4px',
    letterSpacing: '0.08em', textTransform: 'uppercase',
  },
};

interface FrameThumbProps {
  frame: Frame;
}

function FrameThumb({ frame }: FrameThumbProps) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const cw = frame.layers[0]?.pixels[0]?.length ?? 32;
    const ch = frame.layers[0]?.pixels.length ?? 32;
    const sx = c.width / cw;
    const sy = c.height / ch;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        ctx.fillStyle = ((Math.floor(x / 4) + Math.floor(y / 4)) % 2) ? '#0a0e14' : '#11161d';
        ctx.fillRect(x * sx, y * sy, sx, sy);
      }
    }
    frame.layers.forEach((L) => {
      if (!L.visible) return;
      ctx.globalAlpha = L.opacity;
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const col = L.pixels[y]?.[x];
          if (!col) continue;
          ctx.fillStyle = col;
          ctx.fillRect(x * sx, y * sy, sx, sy);
        }
      }
    });
    ctx.globalAlpha = 1;
  }, [frame]);
  return <canvas ref={ref} width="70" height="70" style={tlStyles.thumbCv}/>;
}

export interface TimelineProps {
  frames: Frame[];
  frameIdx: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onDuplicate: (i: number) => void;
  onDelete: (i: number) => void;
  onMove?: (from: number, to: number) => void;
  showOnionSkin: boolean;
  onToggleOnionSkin: () => void;
  ghostFrame: Frame | null | undefined;
  isPlaying: boolean;
  onFrameContextMenu?: (idx: number, x: number, y: number) => void;
}

export function Timeline({
  frames, frameIdx, onSelect, onAdd, onDuplicate, onDelete,
  showOnionSkin, onToggleOnionSkin,
  ghostFrame, onFrameContextMenu,
}: TimelineProps) {
  return (
    <div style={tlStyles.root} data-spotlight="timeline">
      <div style={tlStyles.head}>
        <span style={tlStyles.title}>timeline</span>
        <span style={tlStyles.meta}>
          {frames.length} frames · {(1000 / Math.max(1, frames.reduce((s, f) => s + (f.duration || 120), 0) / frames.length)).toFixed(1)} fps avg · loop
        </span>
        <div style={tlStyles.actions}>
          <span style={tlStyles.btn(showOnionSkin)} onClick={onToggleOnionSkin} title="Toggle onion skin">
            <IconOnion size={11} stroke={showOnionSkin ? 'var(--ink)' : 'var(--ink-3)'}/>
            onion skin
          </span>
          <span style={tlStyles.iconBtn} onClick={() => onDuplicate(frameIdx)} title="Duplicate current frame"><IconCopy size={11}/></span>
          <span style={tlStyles.iconBtn} onClick={() => onDelete(frameIdx)} title="Delete current frame"><IconTrash size={11}/></span>
        </div>
      </div>
      <div style={tlStyles.strip}>
        {frames.map((f, i) => {
          const active = i === frameIdx;
          return (
            <div
              key={f.id}
              style={tlStyles.frame(active)}
              onClick={() => onSelect(i)}
              onContextMenu={e => { e.preventDefault(); onFrameContextMenu?.(i, e.clientX, e.clientY); }}
            >
              <div style={tlStyles.thumbBox(active, false)}>
                <FrameThumb frame={f}/>
              </div>
              <span style={tlStyles.fnum(active, false)}>{String(i + 1).padStart(2, '0')} · {f.duration}ms</span>
            </div>
          );
        })}
        {ghostFrame && (
          <div style={tlStyles.frame(false)} title="AI-proposed frame">
            <div style={tlStyles.thumbBox(false, true)}>
              <FrameThumb frame={ghostFrame}/>
              <span style={tlStyles.badge}>ai</span>
            </div>
            <span style={tlStyles.fnum(false, true)}>proposed</span>
          </div>
        )}
        <div style={tlStyles.addBox} onClick={onAdd} title="Add new frame">
          <IconPlus size={14} stroke="var(--ink-4)"/>
        </div>
      </div>
    </div>
  );
}
