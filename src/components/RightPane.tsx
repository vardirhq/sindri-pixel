import React, { useRef, useEffect } from 'react';
import type { Frame, RightTab, Proposal, ProposalChange, PixelGrid } from '../types';
import {
  IconPlus, IconTrash, IconMerge, IconEye, IconEyeOff,
  IconSparkle, IconChevronR,
} from './Icons';
import { PixelSlider } from './PixelSlider';

// ── Types ────────────────────────────────────────────────────────────────────

interface RightPaneProps {
  activeTab: RightTab;
  onTabChange: (tab: RightTab) => void;
  frame: Frame;
  activeLayerIdx: number;
  onSelectLayer: (idx: number) => void;
  onAddLayer: () => void;
  onDeleteLayer: (idx: number) => void;
  onToggleLayerVisible: (idx: number) => void;
  onSetLayerOpacity: (idx: number, opacity: number) => void;
  onMergeDown: () => void;
  onRenameLayer: (idx: number, name: string) => void;
  onLayerContextMenu?: (idx: number, x: number, y: number) => void;
  color: string;
  onColorChange: (color: string) => void;
  swatches: string[];
  onAddSwatch: () => void;
  onSwatchContextMenu?: (color: string, x: number, y: number) => void;
  usedColors?: string[];
  frameIdx: number;
  frameCount: number;
  frameDuration: number;
  onSetFrameDuration: (ms: number) => void;
  onApplyDurationToAll?: () => void;
  canvasW: number;
  canvasH: number;
  proposal: Proposal | null;
  onAcceptProposal: (which: number | 'all') => void;
  onRejectProposal: (which?: number | 'all') => void;
  onRefineProposal: () => void;
}

interface LayersTabProps {
  frame: Frame;
  activeLayerIdx: number;
  onSelect: (idx: number) => void;
  onAdd: () => void;
  onDelete: (idx: number) => void;
  onToggleVisible: (idx: number) => void;
  onSetOpacity: (idx: number, opacity: number) => void;
  onMergeDown: () => void;
  onRenameLayer: (idx: number, name: string) => void;
  onContextMenu?: (idx: number, x: number, y: number) => void;
}

interface PaletteTabProps {
  color: string;
  onColorChange: (color: string) => void;
  swatches: string[];
  onAddSwatch: () => void;
  onSwatchContextMenu?: (color: string, x: number, y: number) => void;
  usedColors?: string[];
}

interface InspectorTabProps {
  frame: Frame;
  frameIdx: number;
  frameCount: number;
  duration: number;
  onSetDuration: (ms: number) => void;
  onApplyDurationToAll?: () => void;
  canvasW: number;
  canvasH: number;
}

interface ProposalsLaneProps {
  proposal: Proposal;
  onAccept: (which: number | 'all') => void;
  onReject: (which?: number | 'all') => void;
  onRefine: () => void;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const rpStyles = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'var(--font-sans)', color: 'var(--ink)', overflow: 'hidden' } as React.CSSProperties,
  tabs: { display: 'flex', height: 42, padding: '0 18px', borderBottom: '1px solid var(--rule)', alignItems: 'flex-end', gap: 22, flex: 'none' } as React.CSSProperties,
  tab: (active: boolean): React.CSSProperties => ({
    paddingBottom: 10, paddingTop: 10, fontSize: 12.5,
    color: active ? 'var(--ink)' : 'var(--ink-3)',
    fontWeight: active ? 500 : 400,
    borderBottom: active ? '2px solid var(--ink)' : '2px solid transparent',
    marginBottom: -1, cursor: 'pointer',
  }),
  content: { flex: 1, overflowY: 'auto' } as React.CSSProperties,
  layersHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 8px' } as React.CSSProperties,
  sectionLabel: { color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap' } as React.CSSProperties,
  iconBtn: { width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px solid var(--rule-2)', background: 'var(--paper-2)', color: 'var(--ink-3)' } as React.CSSProperties,
  iconBtnRow: { display: 'flex', gap: 4 } as React.CSSProperties,
  layerRow: (selected: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 18px', cursor: 'pointer',
    background: selected ? 'var(--paper-3)' : 'transparent',
    borderLeft: selected ? '2px solid var(--ink)' : '2px solid transparent',
    color: 'var(--ink)', fontSize: 12.5,
    borderBottom: '1px solid var(--rule)',
  }),
  thumb: { width: 26, height: 26, background: '#0a0e14', border: '1px solid var(--rule-2)', imageRendering: 'pixelated', flex: 'none' } as React.CSSProperties,
  layerName: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as React.CSSProperties,
  layerMeta: { fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)' } as React.CSSProperties,
  palHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 8px' } as React.CSSProperties,
  swatch: { display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '1 / 1', cursor: 'pointer', position: 'relative' } as React.CSSProperties,
  swatchInner: (col: string, active: boolean): React.CSSProperties => ({
    position: 'absolute', inset: active ? 2 : 0,
    background: col || 'transparent',
    border: active ? '1.5px solid var(--ink)' : '1px solid var(--rule-2)',
  }),
  palGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, margin: '0 18px', background: 'var(--rule)', border: '1px solid var(--rule-2)', padding: 1 } as React.CSSProperties,
  activeColorRow: { display: 'flex', alignItems: 'stretch', gap: 12, padding: '14px 18px' } as React.CSSProperties,
  bigSwatch: (col: string): React.CSSProperties => ({ width: 64, height: 64, background: col, border: '1px solid var(--rule-2)' }),
  activeColorMeta: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' } as React.CSSProperties,
  hexInput: { fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink)', background: 'var(--paper-2)', border: '1px solid var(--rule-2)', padding: '6px 8px', width: '100%', boxSizing: 'border-box' } as React.CSSProperties,
  channels: { display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '4px 8px', alignItems: 'center', padding: '0 18px 14px' } as React.CSSProperties,
  chLabel: { fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '0.08em' } as React.CSSProperties,
  chBar: { height: 6, background: 'var(--paper-3)', border: '1px solid var(--rule)', position: 'relative' } as React.CSSProperties,
  chFill: (w: number, col: string): React.CSSProperties => ({ position: 'absolute', inset: 0, width: w + '%', background: col }),
  chVal: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)', minWidth: 24, textAlign: 'right' } as React.CSSProperties,
  inspHead: { padding: '20px 22px 16px', borderBottom: '1px solid var(--rule)' } as React.CSSProperties,
  inspKind: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } as React.CSSProperties,
  inspKindDot: (c: string): React.CSSProperties => ({ width: 8, height: 8, background: c }),
  inspName: { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 32, color: 'var(--ink)', lineHeight: 1, letterSpacing: '-0.01em', marginBottom: 6 } as React.CSSProperties,
  inspMeta: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' } as React.CSSProperties,
  block: { borderBottom: '1px solid var(--rule)' } as React.CSSProperties,
  blockHead: { display: 'flex', alignItems: 'center', gap: 8, padding: '14px 22px 6px', color: 'var(--ink-2)', fontFamily: 'var(--font-display)', fontSize: 14 } as React.CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: '88px 1fr', gap: '8px 14px', padding: '4px 22px 16px', alignItems: 'center' } as React.CSSProperties,
  k: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' } as React.CSSProperties,
  v: { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-2)' } as React.CSSProperties,
  aiBlock: { padding: '16px 22px', borderTop: '1px solid var(--rule)' } as React.CSSProperties,
  aiHead: { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--amber)', fontFamily: 'var(--font-display)', fontSize: 13, marginBottom: 10 } as React.CSSProperties,
  aiRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px dotted var(--rule-2)', cursor: 'pointer', color: 'var(--ink-2)', fontSize: 12.5 } as React.CSSProperties,
  propHead: { padding: '16px 22px 12px', borderBottom: '1px solid var(--rule-2)', background: 'var(--paper-2)' } as React.CSSProperties,
  propTitle: { color: 'var(--amber)', fontFamily: 'var(--font-display)', fontSize: 14, marginBottom: 4 } as React.CSSProperties,
  propPrompt: { color: 'var(--ink)', fontSize: 13, lineHeight: 1.5 } as React.CSSProperties,
  propMeta: { fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '0.06em', marginTop: 8 } as React.CSSProperties,
  propCard: { borderBottom: '1px solid var(--rule)' } as React.CSSProperties,
  propCardHead: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '14px 22px 4px' } as React.CSSProperties,
  propBadge: { fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--amber)', border: '1px solid var(--amber)', padding: '1px 6px', letterSpacing: '0.1em', textTransform: 'uppercase', flex: 'none' } as React.CSSProperties,
  propCardTitle: { fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--ink)', lineHeight: 1.4 } as React.CSSProperties,
  propCardMeta: { fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)', padding: '0 22px 6px', lineHeight: 1.5 } as React.CSSProperties,
  propActions: { display: 'flex', gap: 6, padding: '10px 22px 16px' } as React.CSSProperties,
  propBtn: (variant: string): React.CSSProperties => ({
    fontFamily: 'var(--font-display)', fontSize: 12,
    padding: '6px 12px', cursor: 'pointer', textAlign: 'center', flex: 1,
    whiteSpace: 'nowrap',
    background: variant === 'accept' ? 'var(--amber)' : 'transparent',
    color: variant === 'accept' ? 'var(--paper)' : 'var(--amber)',
    border: '1px solid var(--amber)',
  }),
  propFooter: { padding: '14px 22px', borderTop: '1px solid var(--rule-2)', background: 'var(--paper-2)', display: 'flex', gap: 8 } as React.CSSProperties,
  propFootBtn: (variant: string): React.CSSProperties => ({
    fontFamily: 'var(--font-display)', fontSize: 12,
    padding: '8px 10px', cursor: 'pointer', flex: 1, textAlign: 'center',
    whiteSpace: 'nowrap',
    background: variant === 'accept' ? 'var(--amber)' : 'transparent',
    color: variant === 'accept' ? 'var(--paper)' : 'var(--amber)',
    border: '1px solid var(--amber)',
  }),
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

// ── LayerThumb ───────────────────────────────────────────────────────────────

function LayerThumb({ pixels }: { pixels: PixelGrid }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cw = pixels[0]?.length ?? 32;
  const ch = pixels.length;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Native canvas matches pixel grid; CSS scales it to 26x26
    canvas.width = cw;
    canvas.height = ch;
    ctx.clearRect(0, 0, cw, ch);

    for (let y = 0; y < pixels.length; y++) {
      const row = pixels[y];
      for (let x = 0; x < row.length; x++) {
        const col = row[x];
        if (col) {
          ctx.fillStyle = col;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }, [pixels, cw, ch]);

  return (
    <canvas
      ref={canvasRef}
      style={rpStyles.thumb}
      width={cw}
      height={ch}
    />
  );
}

// ── LayersTab ────────────────────────────────────────────────────────────────

function LayersTab({
  frame, activeLayerIdx,
  onSelect, onAdd, onDelete, onToggleVisible, onSetOpacity, onMergeDown, onRenameLayer, onContextMenu,
}: LayersTabProps) {
  const [editingIdx, setEditingIdx] = React.useState<number | null>(null);
  const [editDraft, setEditDraft] = React.useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = (idx: number, currentName: string) => {
    setEditingIdx(idx);
    setEditDraft(currentName);
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const commitRename = () => {
    if (editingIdx !== null && editDraft.trim()) {
      onRenameLayer(editingIdx, editDraft.trim());
    }
    setEditingIdx(null);
  };

  return (
    <div>
      <div style={rpStyles.layersHead}>
        <span style={rpStyles.sectionLabel}>Layers</span>
        <div style={rpStyles.iconBtnRow}>
          <span style={rpStyles.iconBtn} onClick={onMergeDown} title="Merge down">
            <IconMerge size={12} />
          </span>
          <span style={rpStyles.iconBtn} onClick={onAdd} title="Add layer">
            <IconPlus size={12} />
          </span>
          <span style={rpStyles.iconBtn} onClick={() => onDelete(activeLayerIdx)} title="Delete layer">
            <IconTrash size={12} />
          </span>
        </div>
      </div>

      {[...frame.layers].reverse().map((layer, revIdx) => {
        const idx = frame.layers.length - 1 - revIdx;
        const selected = idx === activeLayerIdx;
        const renaming = editingIdx === idx;
        return (
          <div key={layer.id}>
            <div
              style={rpStyles.layerRow(selected)}
              onClick={() => onSelect(idx)}
              onContextMenu={e => { e.preventDefault(); onContextMenu?.(idx, e.clientX, e.clientY); }}
            >
              <LayerThumb pixels={layer.pixels} />
              {renaming ? (
                <input
                  ref={renameInputRef}
                  value={editDraft}
                  onChange={e => setEditDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingIdx(null);
                    e.stopPropagation();
                  }}
                  onClick={e => e.stopPropagation()}
                  style={{ flex: 1, background: 'var(--paper)', border: '1px solid var(--ink-3)', color: 'var(--ink)', fontFamily: 'var(--font-sans)', fontSize: 12.5, padding: '2px 4px', minWidth: 0 }}
                  autoFocus
                />
              ) : (
                <span
                  style={rpStyles.layerName}
                  onDoubleClick={e => { e.stopPropagation(); startRename(idx, layer.name); }}
                  title="Double-click to rename"
                >
                  {layer.name}
                </span>
              )}
              <span style={rpStyles.layerMeta}>{Math.round(layer.opacity * 100)}%</span>
              <span
                style={{ color: layer.visible ? 'var(--ink-3)' : 'var(--ink-4)', cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); onToggleVisible(idx); }}
                title={layer.visible ? 'Hide layer' : 'Show layer'}
              >
                {layer.visible ? <IconEye size={13} /> : <IconEyeOff size={13} />}
              </span>
            </div>
            {selected && (
              <div style={{ padding: '8px 18px 10px', borderBottom: '1px solid var(--rule)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>opacity</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                    {Math.round(layer.opacity * 100)}%
                  </span>
                </div>
                <PixelSlider
                  min={0}
                  max={100}
                  value={Math.round(layer.opacity * 100)}
                  onChange={v => onSetOpacity(idx, v / 100)}
                  snap={10}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── PaletteTab ───────────────────────────────────────────────────────────────

function PaletteTab({ color, onColorChange, swatches, onAddSwatch, onSwatchContextMenu, usedColors }: PaletteTabProps) {
  const rgb = hexToRgb(color || '#000000');
  // Track the raw hex text so partial input doesn't paint invalid colors.
  const [hexDraft, setHexDraft] = React.useState(color);
  React.useEffect(() => { setHexDraft(color); }, [color]);

  const commitHex = (raw: string) => {
    setHexDraft(raw);
    const v = raw.startsWith('#') ? raw : '#' + raw;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onColorChange(v.toLowerCase());
  };

  return (
    <div>
      {/* Active color */}
      <div style={rpStyles.activeColorRow}>
        <div style={{ ...rpStyles.bigSwatch(color), position: 'relative', overflow: 'hidden' }}>
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#000000'}
            onChange={e => onColorChange(e.target.value)}
            title="Open color picker"
            style={{ position: 'absolute', inset: -4, width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', opacity: 0, cursor: 'pointer' }}
          />
        </div>
        <div style={rpStyles.activeColorMeta}>
          <input
            type="text"
            value={hexDraft}
            onChange={e => commitHex(e.target.value)}
            style={rpStyles.hexInput}
            spellCheck={false}
          />
        </div>
      </div>

      {/* RGB channel bars */}
      <div style={rpStyles.channels}>
        {(['R', 'G', 'B'] as const).map(ch => {
          const val = ch === 'R' ? rgb.r : ch === 'G' ? rgb.g : rgb.b;
          const barColor = ch === 'R' ? '#c0392b' : ch === 'G' ? '#27ae60' : '#2980b9';
          return (
            <React.Fragment key={ch}>
              <span style={rpStyles.chLabel}>{ch}</span>
              <div style={rpStyles.chBar}>
                <div style={rpStyles.chFill((val / 255) * 100, barColor)} />
              </div>
              <span style={rpStyles.chVal}>{val}</span>
            </React.Fragment>
          );
        })}
      </div>

      {/* Swatch palette */}
      <div style={rpStyles.palHead}>
        <span style={rpStyles.sectionLabel}>Palette</span>
        <span style={rpStyles.iconBtn} onClick={onAddSwatch} title="Add current color to palette">
          <IconPlus size={12} />
        </span>
      </div>
      <div style={rpStyles.palGrid}>
        {swatches.map((sw, i) => {
          const active = sw === color;
          return (
            <div
              key={i}
              style={rpStyles.swatch}
              onClick={() => onColorChange(sw)}
              onContextMenu={e => { e.preventDefault(); onSwatchContextMenu?.(sw, e.clientX, e.clientY); }}
            >
              <div style={rpStyles.swatchInner(sw, active)} />
            </div>
          );
        })}
      </div>

      {/* Colors currently painted in the artwork */}
      {usedColors && usedColors.length > 0 && (
        <React.Fragment>
          <div style={rpStyles.palHead}>
            <span style={rpStyles.sectionLabel}>In artwork</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)' }}>{usedColors.length}</span>
          </div>
          <div style={{ ...rpStyles.palGrid, marginBottom: 18 }}>
            {usedColors.map((sw) => (
              <div
                key={sw}
                style={rpStyles.swatch}
                onClick={() => onColorChange(sw)}
                onContextMenu={e => { e.preventDefault(); onSwatchContextMenu?.(sw, e.clientX, e.clientY); }}
                title={sw}
              >
                <div style={rpStyles.swatchInner(sw, sw === color)} />
              </div>
            ))}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

// ── InspectorTab ─────────────────────────────────────────────────────────────

function InspectorTab({ frame, frameIdx, frameCount, duration, onSetDuration, onApplyDurationToAll, canvasW, canvasH }: InspectorTabProps) {
  // Count painted pixels and unique colors across all visible layers
  let paintedCount = 0;
  const colorSet = new Set<string>();

  for (const layer of frame.layers) {
    if (!layer.visible) continue;
    for (const row of layer.pixels) {
      for (const px of row) {
        if (px) {
          paintedCount++;
          colorSet.add(px);
        }
      }
    }
  }

  const totalPixels = canvasW * canvasH;
  const coverage = ((paintedCount / totalPixels) * 100).toFixed(1);

  return (
    <div>
      {/* Canvas header */}
      <div style={rpStyles.inspHead}>
        <div style={rpStyles.inspKind}>
          <div style={rpStyles.inspKindDot('var(--cyan)')} />
          <span>sprite · pixel art</span>
        </div>
        <div style={rpStyles.inspName}>Frame {String(frameIdx + 1).padStart(2, '0')}</div>
        <div style={rpStyles.inspMeta}>frame {frameIdx + 1} of {frameCount} · {frame.id}</div>
      </div>

      {/* Canvas info */}
      <div style={rpStyles.block}>
        <div style={rpStyles.blockHead}>Canvas</div>
        <div style={rpStyles.grid}>
          <span style={rpStyles.k}>dimensions</span>
          <span style={rpStyles.v}>{canvasW} × {canvasH} px</span>
          <span style={rpStyles.k}>painted</span>
          <span style={rpStyles.v}>{paintedCount} px ({coverage}%)</span>
          <span style={rpStyles.k}>colors</span>
          <span style={rpStyles.v}>{colorSet.size}</span>
          <span style={rpStyles.k}>layers</span>
          <span style={rpStyles.v}>{frame.layers.length}</span>
        </div>
      </div>

      {/* Frame info */}
      <div style={rpStyles.block}>
        <div style={rpStyles.blockHead}>Frame</div>
        <div style={rpStyles.grid}>
          <span style={rpStyles.k}>index</span>
          <span style={rpStyles.v}>{frameIdx + 1} / {frameCount}</span>
          <span style={rpStyles.k}>duration</span>
          <span style={rpStyles.v}>{duration} ms</span>
          <span style={rpStyles.k}>fps equiv</span>
          <span style={rpStyles.v}>{(1000 / duration).toFixed(1)}</span>
        </div>
        <div style={{ padding: '0 22px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)' }}>duration — this frame (ms)</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>{duration}</span>
          </div>
          <PixelSlider
            min={50}
            max={500}
            step={10}
            value={duration}
            onChange={onSetDuration}
            snap={10}
          />
          {onApplyDurationToAll && frameCount > 1 && (
            <div
              style={{
                marginTop: 10, padding: '6px 0', textAlign: 'center', cursor: 'pointer',
                fontFamily: 'var(--font-display)', fontSize: 11.5, color: 'var(--ink-3)',
                border: '1px solid var(--rule-2)',
              }}
              onClick={onApplyDurationToAll}
              title="Copy this frame's duration to every frame"
            >
              Apply to all {frameCount} frames
            </div>
          )}
        </div>
      </div>

      {/* AI suggestions */}
      <div style={rpStyles.aiBlock}>
        <div style={rpStyles.aiHead}>
          <IconSparkle size={13} stroke="var(--amber)" />
          <span>Sindri suggestions</span>
        </div>
        {['Add a highlight pass', 'Refine outline weight', 'Animate bob offset'].map((s, i) => (
          <div key={i} style={rpStyles.aiRow}>
            <span>{s}</span>
            <IconChevronR size={12} stroke="var(--ink-4)" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ProposalsLane ─────────────────────────────────────────────────────────────

export function ProposalsLane({ proposal, onAccept, onReject, onRefine }: ProposalsLaneProps) {
  const changes = proposal.changes ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={rpStyles.propHead}>
        <div style={rpStyles.propTitle}>
          <IconSparkle size={13} stroke="var(--amber)" style={{ marginRight: 6 }} />
          {proposal.title ?? '✦ Sindri Proposal'}
        </div>
        <div style={rpStyles.propPrompt}>{proposal.prompt}</div>
        <div style={rpStyles.propMeta}>
          {changes.length} change{changes.length !== 1 ? 's' : ''} · review before applying
        </div>
      </div>

      {/* Change cards */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {changes.map((change: ProposalChange, i: number) => (
          <div key={i} style={rpStyles.propCard}>
            <div style={rpStyles.propCardHead}>
              <span style={rpStyles.propBadge}>{change.kind}</span>
              <span style={rpStyles.propCardTitle}>{change.title}</span>
            </div>
            <div style={rpStyles.propCardMeta}>{change.body}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)', padding: '0 22px 8px' }}>
              {change.meta}
            </div>
            <div style={rpStyles.propActions}>
              <div style={rpStyles.propBtn('accept')} onClick={() => onAccept(i)}>Accept</div>
              <div style={rpStyles.propBtn('reject')} onClick={() => onReject(i)}>Reject</div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={rpStyles.propFooter}>
        <div style={rpStyles.propFootBtn('accept')} onClick={() => onAccept('all')}>Accept All</div>
        <div style={rpStyles.propFootBtn('reject')} onClick={() => onReject('all')}>Reject All</div>
        <div style={rpStyles.propFootBtn('refine')} onClick={onRefine}>Refine…</div>
      </div>
    </div>
  );
}

// ── RightPane ────────────────────────────────────────────────────────────────

export function RightPane({
  activeTab, onTabChange,
  frame, activeLayerIdx,
  onSelectLayer, onAddLayer, onDeleteLayer, onToggleLayerVisible, onSetLayerOpacity, onMergeDown,
  onRenameLayer, onLayerContextMenu,
  color, onColorChange, swatches, onAddSwatch, onSwatchContextMenu, usedColors,
  frameIdx, frameCount, frameDuration, onSetFrameDuration, onApplyDurationToAll,
  canvasW, canvasH,
  proposal, onAcceptProposal, onRejectProposal, onRefineProposal,
}: RightPaneProps) {
  // If proposal is active and visible, show the proposals lane instead of tabs
  if (proposal?.visible) {
    return (
      <div style={rpStyles.root}>
        <ProposalsLane
          proposal={proposal}
          onAccept={onAcceptProposal}
          onReject={onRejectProposal}
          onRefine={onRefineProposal}
        />
      </div>
    );
  }

  return (
    <div style={rpStyles.root}>
      {/* Tabs */}
      <div style={rpStyles.tabs}>
        {(['layers', 'palette', 'inspector'] as RightTab[]).map(tab => {
          const label = tab === 'inspector' ? 'Inspect' : tab.charAt(0).toUpperCase() + tab.slice(1);
          return (
            <span key={tab} style={rpStyles.tab(activeTab === tab)} onClick={() => onTabChange(tab)}>
              {label}
            </span>
          );
        })}
      </div>

      {/* Content */}
      <div style={rpStyles.content}>
        {activeTab === 'layers' && (
          <LayersTab
            frame={frame}
            activeLayerIdx={activeLayerIdx}
            onSelect={onSelectLayer}
            onAdd={onAddLayer}
            onDelete={onDeleteLayer}
            onToggleVisible={onToggleLayerVisible}
            onSetOpacity={onSetLayerOpacity}
            onMergeDown={onMergeDown}
            onRenameLayer={onRenameLayer}
            onContextMenu={onLayerContextMenu}
          />
        )}
        {activeTab === 'palette' && (
          <PaletteTab
            color={color}
            onColorChange={onColorChange}
            swatches={swatches}
            onAddSwatch={onAddSwatch}
            onSwatchContextMenu={onSwatchContextMenu}
            usedColors={usedColors}
          />
        )}
        {activeTab === 'inspector' && (
          <InspectorTab
            frame={frame}
            frameIdx={frameIdx}
            frameCount={frameCount}
            duration={frameDuration}
            onSetDuration={onSetFrameDuration}
            onApplyDurationToAll={onApplyDurationToAll}
            canvasW={canvasW}
            canvasH={canvasH}
          />
        )}
      </div>
    </div>
  );
}
