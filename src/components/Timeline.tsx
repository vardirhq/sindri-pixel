import React from 'react';
import type { Frame } from '../types';
import type { FrameTag, TagDirection } from '../lib/tags';
import { IconOnion, IconCopy, IconTrash, IconPlus } from './Icons';

// Frame cells are 72px wide with 10px gaps; tags span whole cells.
const CELL = 72;
const GAP = 10;
const LANE = 18;
const TAG_COLORS = ['var(--cyan)', 'var(--amber)', 'var(--moss)', 'var(--orange)', 'var(--green)', 'var(--red)'];
const DIRECTION_GLYPH: Record<TagDirection, string> = { forward: '→', reverse: '←', pingpong: '⇄' };
const DIRECTION_NAME: Record<TagDirection, string> = { forward: 'forward', reverse: 'reverse', pingpong: 'ping-pong' };
const NEXT_DIRECTION: Record<TagDirection, TagDirection> = { forward: 'reverse', reverse: 'pingpong', pingpong: 'forward' };

/** Stack overlapping tags into lanes (greedy, in start order). */
function laneOf(tags: FrameTag[]): Map<string, number> {
  const ends: number[] = [];
  const lanes = new Map<string, number>();
  for (const t of [...tags].sort((a, b) => a.from - b.from || b.to - a.to)) {
    let lane = ends.findIndex((end) => end < t.from);
    if (lane === -1) lane = ends.length;
    ends[lane] = t.to;
    lanes.set(t.id, lane);
  }
  return lanes;
}

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
    minHeight: 160, flex: 'none', overflow: 'hidden',
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
  strip: { flex: 1, display: 'flex', alignItems: 'flex-start', padding: '12px 18px', gap: GAP, overflowX: 'auto', position: 'relative' },
  frame: (_active: boolean): React.CSSProperties => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    cursor: 'pointer', flex: 'none', position: 'relative',
  }),
  thumbBox: (active: boolean, ghost: boolean): React.CSSProperties => ({
    width: CELL, height: CELL,
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
  tags?: FrameTag[];
  /** The tag playback loops over (null = all frames). */
  playTagId?: string | null;
  onPlayTag?: (id: string | null) => void;
  onAddTag?: (from: number, to: number) => void;
  onUpdateTag?: (id: string, patch: Partial<Omit<FrameTag, 'id'>>) => void;
  onTagContextMenu?: (id: string, x: number, y: number) => void;
}

function TagChip({
  tag, color, lane, playing, onPlay, onUpdate, onContextMenu,
}: {
  tag: FrameTag; color: string; lane: number; playing: boolean;
  onPlay: () => void;
  onUpdate?: (patch: Partial<Omit<FrameTag, 'id'>>) => void;
  onContextMenu?: (x: number, y: number) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(tag.name);
  const commit = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== tag.name) onUpdate?.({ name });
    else setDraft(tag.name);
  };
  return (
    <div
      data-tag={tag.name}
      title={`${tag.name} · frames ${tag.from + 1}–${tag.to + 1} · ${DIRECTION_NAME[tag.direction]}\nClick to loop it · double-click to rename`}
      onClick={onPlay}
      onDoubleClick={(e) => { e.stopPropagation(); setDraft(tag.name); setEditing(true); }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e.clientX, e.clientY); }}
      style={{
        position: 'absolute',
        left: 18 + tag.from * (CELL + GAP),
        top: 8 + lane * LANE,
        width: (tag.to - tag.from + 1) * (CELL + GAP) - GAP,
        height: LANE - 4,
        display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px',
        borderLeft: `3px solid ${color}`,
        background: playing ? `color-mix(in srgb, ${color} 32%, var(--paper-2))` : 'var(--paper-2)',
        outline: playing ? `1px solid ${color}` : 'none',
        cursor: 'pointer', boxSizing: 'border-box', overflow: 'hidden',
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em',
        color: playing ? 'var(--ink)' : 'var(--ink-2)',
      }}
    >
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(tag.name); setEditing(false); }
          }}
          aria-label="Tag name"
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', font: 'inherit', padding: 0 }}
        />
      ) : (
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag.name}</span>
      )}
      <span
        role="button"
        title={`Direction: ${DIRECTION_NAME[tag.direction]} (click to change)`}
        onClick={(e) => { e.stopPropagation(); onUpdate?.({ direction: NEXT_DIRECTION[tag.direction] }); }}
        style={{ color, flex: 'none' }}
      >
        {DIRECTION_GLYPH[tag.direction]}
      </span>
    </div>
  );
}

export function Timeline({
  frames, frameIdx, onSelect, onAdd, onDuplicate, onDelete,
  showOnionSkin, onToggleOnionSkin,
  ghostFrame, onFrameContextMenu,
  tags = [], playTagId = null, onPlayTag, onAddTag, onUpdateTag, onTagContextMenu,
}: TimelineProps) {
  // Shift-click extends a frame range from the last plain-clicked frame;
  // "+ tag" names that range (or just the current frame).
  const [anchor, setAnchor] = React.useState<number | null>(null);
  const [range, setRange] = React.useState<[number, number] | null>(null);
  React.useEffect(() => {
    if (range && range[1] >= frames.length) setRange(null);
  }, [frames.length, range]);
  const lanes = laneOf(tags);
  const laneCount = tags.length ? Math.max(...lanes.values()) + 1 : 0;
  const inRange = (i: number) => !!range && i >= range[0] && i <= range[1];
  const playTag = tags.find((t) => t.id === playTagId);
  return (
    <div style={tlStyles.root} data-spotlight="timeline">
      <div style={tlStyles.head}>
        <span style={tlStyles.title}>timeline</span>
        <span style={tlStyles.meta}>
          {frames.length} frames · {(1000 / Math.max(1, frames.reduce((s, f) => s + (f.duration || 120), 0) / frames.length)).toFixed(1)} fps avg · {playTag ? `looping “${playTag.name}”` : 'loop'}
          {range && ` · ${range[1] - range[0] + 1} selected`}
        </span>
        <div style={tlStyles.actions}>
          {onAddTag && (
            <span
              style={tlStyles.btn(false)}
              onClick={() => { const [a, b] = range ?? [frameIdx, frameIdx]; onAddTag(a, b); setRange(null); }}
              title="Tag the selected frames (shift-click frames to select a range)"
            >
              <IconPlus size={10}/>
              tag
            </span>
          )}
          <span style={tlStyles.btn(showOnionSkin)} onClick={onToggleOnionSkin} title="Toggle onion skin">
            <IconOnion size={11} stroke={showOnionSkin ? 'var(--ink)' : 'var(--ink-3)'}/>
            onion skin
          </span>
          <span style={tlStyles.iconBtn} onClick={() => onDuplicate(frameIdx)} title="Duplicate current frame"><IconCopy size={11}/></span>
          <span style={tlStyles.iconBtn} onClick={() => onDelete(frameIdx)} title="Delete current frame"><IconTrash size={11}/></span>
        </div>
      </div>
      <div style={{ ...tlStyles.strip, paddingTop: 12 + laneCount * LANE }}>
        {tags.map((t, k) => (
          <TagChip
            key={t.id}
            tag={t}
            color={TAG_COLORS[k % TAG_COLORS.length]}
            lane={lanes.get(t.id) ?? 0}
            playing={t.id === playTagId}
            onPlay={() => {
              const next = t.id === playTagId ? null : t.id;
              onPlayTag?.(next);
              if (next && (frameIdx < t.from || frameIdx > t.to)) onSelect(t.from);
            }}
            onUpdate={(patch) => onUpdateTag?.(t.id, patch)}
            onContextMenu={(x, y) => onTagContextMenu?.(t.id, x, y)}
          />
        ))}
        {frames.map((f, i) => {
          const active = i === frameIdx;
          return (
            <div
              key={f.id}
              data-frame={i}
              style={tlStyles.frame(active)}
              onClick={(e) => {
                if (e.shiftKey) {
                  const from = anchor ?? frameIdx;
                  setRange([Math.min(from, i), Math.max(from, i)]);
                } else {
                  setAnchor(i);
                  setRange(null);
                }
                onSelect(i);
              }}
              onContextMenu={e => { e.preventDefault(); onFrameContextMenu?.(i, e.clientX, e.clientY); }}
            >
              <div style={{ ...tlStyles.thumbBox(active, false), ...(inRange(i) && !active ? { border: '1px dashed var(--ink-2)' } : {}) }}>
                <FrameThumb frame={f}/>
                {f.layers.some((l) => l.link) && (
                  <span
                    style={{ ...tlStyles.badge, color: 'var(--cyan)', borderColor: 'var(--cyan)' }}
                    title={`Linked: ${f.layers.filter((l) => l.link).map((l) => l.name).join(', ')} shared with other frames`}
                  >
                    link
                  </span>
                )}
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
