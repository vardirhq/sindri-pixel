import React, { useState, useRef, useEffect } from 'react';
import type { Tool, ToolOptions, Modifiers, LeftTab, SymmetryMode } from '../types';
import {
  IconPencil, IconEraser, IconFill, IconPicker,
  IconLine, IconRect, IconCircle, IconMarquee,
  IconWand, IconLasso, IconMove, IconPan,
  IconAxis, IconSide, IconIso,
  IconFolder, IconFile, IconHistory, IconSparkle,
} from './Icons';
import { PixelSlider } from './PixelSlider';

// ── Types ────────────────────────────────────────────────────────────────────

interface ToolsPaneProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  helper: string | null;
  onHelperChange: (helper: string | null) => void;
  modifiers: Modifiers;
  onModifierToggle: (key: keyof Modifiers) => void;
  onSymmetryChange: (mode: SymmetryMode) => void;
  toolOptions: ToolOptions;
  onToolOptionChange: (key: keyof ToolOptions, value: number | boolean) => void;
  activeTab: LeftTab;
  onTabChange: (tab: LeftTab) => void;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const tpStyles = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink)', overflow: 'hidden' } as React.CSSProperties,
  tabs: { display: 'flex', height: 42, padding: '0 16px', borderBottom: '1px solid var(--rule)', alignItems: 'flex-end', gap: 20, flex: 'none' } as React.CSSProperties,
  tab: (active: boolean): React.CSSProperties => ({
    paddingBottom: 10, paddingTop: 10, fontSize: 12.5,
    color: active ? 'var(--ink)' : 'var(--ink-3)',
    fontWeight: active ? 500 : 400,
    borderBottom: active ? '2px solid var(--ink)' : '2px solid transparent',
    marginBottom: -1, cursor: 'pointer',
  }),
  content: { flex: 1, overflowY: 'auto', overflowX: 'hidden' } as React.CSSProperties,
  sectionRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 8px' } as React.CSSProperties,
  sectionLabel: { color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap' } as React.CSSProperties,
  sectionMeta: { color: 'var(--ink-4)', fontSize: 10.5, fontFamily: 'var(--font-mono)' } as React.CSSProperties,
  toolGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
    borderTop: '1px solid var(--rule)',
    borderBottom: '1px solid var(--rule)',
    background: 'var(--paper)',
  } as React.CSSProperties,
  toolBtn: (active: boolean, col: number, row: number, rowsTotal: number): React.CSSProperties => ({
    height: 56,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
    background: active ? 'var(--paper-3)' : 'transparent',
    color: active ? 'var(--ink)' : 'var(--ink-2)',
    cursor: 'pointer', position: 'relative',
    borderRight: col < 2 ? '1px solid var(--rule)' : 'none',
    borderBottom: row < rowsTotal - 1 ? '1px solid var(--rule)' : 'none',
    transition: 'background 80ms linear, color 80ms linear',
  }),
  toolDot: { position: 'absolute', top: 4, left: 4, width: 3, height: 3, background: 'var(--ink)' } as React.CSSProperties,
  shortcut: { fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-4)', letterSpacing: '0.08em' } as React.CSSProperties,
  shortcutActive: { color: 'var(--ink-3)' } as React.CSSProperties,
  helperRow: { display: 'flex', padding: '4px 16px 8px', gap: 0, borderTop: '1px solid transparent' } as React.CSSProperties,
  helperBtn: (active: boolean, _first: boolean, last: boolean): React.CSSProperties => ({
    flex: 1, height: 30,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
    background: active ? 'var(--paper-3)' : 'var(--paper-2)',
    color: active ? 'var(--ink)' : 'var(--ink-3)',
    border: '1px solid var(--rule-2)',
    borderRight: last ? '1px solid var(--rule-2)' : 'none',
    cursor: 'pointer',
  }),
  helperLbl: { fontSize: 9, letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap' } as React.CSSProperties,
  modRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', cursor: 'pointer' } as React.CSSProperties,
  modName: { fontSize: 12.5, color: 'var(--ink-2)', whiteSpace: 'nowrap' } as React.CSSProperties,
  modToggle: (on: boolean): React.CSSProperties => ({
    width: 26, height: 14, position: 'relative',
    border: '1px solid var(--rule-2)',
    background: on ? 'var(--ink)' : 'var(--paper)',
  }),
  modThumb: (on: boolean): React.CSSProperties => ({
    position: 'absolute', top: 1, left: on ? 14 : 1,
    width: 10, height: 10,
    background: on ? 'var(--paper)' : 'var(--ink-3)',
    transition: 'left 80ms linear',
  }),
  optRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 6px' } as React.CSSProperties,
  optLabel: { fontSize: 12, color: 'var(--ink-3)' } as React.CSSProperties,
  optValue: { fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-2)' } as React.CSSProperties,
  toolDesc: {
    margin: '14px 16px', padding: '10px 12px',
    background: 'var(--paper-2)', border: '1px solid var(--rule)',
    fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.5,
    fontFamily: 'var(--font-sans)',
  } as React.CSSProperties,
  tooltip: {
    position: 'fixed', zIndex: 200,
    background: 'var(--paper-2)', border: '1px solid var(--rule-2)',
    padding: '10px 12px', minWidth: 200, maxWidth: 260,
    boxShadow: '0 6px 16px rgba(0,0,0,0.45)',
    pointerEvents: 'none',
    fontFamily: 'var(--font-sans)',
  } as React.CSSProperties,
  tooltipHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 } as React.CSSProperties,
  tooltipLabel: { fontFamily: 'var(--font-display)', fontSize: 13.5, color: 'var(--ink)' } as React.CSSProperties,
  tooltipKey: {
    fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)',
    border: '1px solid var(--rule-2)', background: 'var(--paper)',
    padding: '0 5px', letterSpacing: '0.04em',
  } as React.CSSProperties,
  tooltipDesc: { fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.55 } as React.CSSProperties,
  tooltipMeta: {
    marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--rule)',
    display: 'flex', justifyContent: 'space-between',
    fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)',
    letterSpacing: '0.06em',
  } as React.CSSProperties,
  tooltipTail: {
    position: 'absolute', left: -5, top: 14, width: 8, height: 8,
    background: 'var(--paper-2)',
    borderLeft: '1px solid var(--rule-2)',
    borderBottom: '1px solid var(--rule-2)',
    transform: 'rotate(45deg)',
  } as React.CSSProperties,
};

// ── Tool + Helper data ───────────────────────────────────────────────────────

const TOOLS: Array<{ id: Tool; Ico: React.FC<{ size?: number }>; label: string; key: string; desc: string }> = [
  { id: 'pencil',  Ico: IconPencil,  label: 'Pencil',     key: 'P', desc: 'Paint pixel-by-pixel. Hold Shift to constrain to straight lines.' },
  { id: 'eraser',  Ico: IconEraser,  label: 'Eraser',     key: 'E', desc: 'Erase pixels to transparent on the active layer.' },
  { id: 'fill',    Ico: IconFill,    label: 'Fill',       key: 'G', desc: 'Flood-fill the contiguous region matching the picked pixel.' },
  { id: 'picker',  Ico: IconPicker,  label: 'Eyedropper', key: 'I', desc: 'Sample any pixel under the cursor into the active color.' },
  { id: 'line',    Ico: IconLine,    label: 'Line',       key: 'L', desc: 'Draw a 1px line. Hold Shift for 0°/45°/90°.' },
  { id: 'rect',    Ico: IconRect,    label: 'Rect',       key: 'R', desc: 'Drag to draw a rectangle. Hold Shift for a square.' },
  { id: 'circle',  Ico: IconCircle,  label: 'Circle',     key: 'C', desc: 'Drag to draw an ellipse. Hold Shift for a perfect circle.' },
  { id: 'select',  Ico: IconMarquee, label: 'Marquee',    key: 'V', desc: 'Drag a rectangular selection to move, copy, or transform.' },
  { id: 'wand',    Ico: IconWand,    label: 'Magic Wand', key: 'W', desc: 'Select all connected pixels of matching color.' },
  { id: 'lasso',   Ico: IconLasso,   label: 'Lasso',      key: 'A', desc: 'Draw a freeform polygon selection.' },
  { id: 'move',    Ico: IconMove,    label: 'Move',       key: 'M', desc: 'Shift the active layer\'s contents by whole pixels.' },
  { id: 'pan',     Ico: IconPan,     label: 'Pan',        key: 'H', desc: 'Pan the viewport. Hold space with any tool to pan temporarily.' },
];

const HELPERS: Array<{ id: string; Ico: React.FC<{ size?: number }>; label: string }> = [
  { id: 'topdown', Ico: IconAxis, label: 'Top-Down' },
  { id: 'side',    Ico: IconSide, label: 'Side' },
  { id: 'iso',     Ico: IconIso,  label: 'Iso' },
];

// ── ToolTooltip ──────────────────────────────────────────────────────────────

interface TooltipInfo {
  label: string;
  key: string;
  desc: string;
  id: string;
  anchorRect: DOMRect;
}

function ToolTooltip({ info }: { info: TooltipInfo }) {
  const top = info.anchorRect.top + 14;
  const left = info.anchorRect.right + 10;

  return (
    <div style={{ ...tpStyles.tooltip, top, left }}>
      <div style={tpStyles.tooltipTail} />
      <div style={tpStyles.tooltipHead}>
        <span style={tpStyles.tooltipLabel}>{info.label}</span>
        <span style={tpStyles.tooltipKey}>{info.key}</span>
      </div>
      <div style={tpStyles.tooltipDesc}>{info.desc}</div>
      <div style={tpStyles.tooltipMeta}>
        <span>{info.id}</span>
        <span>tool</span>
      </div>
    </div>
  );
}

// ── FilesPane ────────────────────────────────────────────────────────────────

function FilesPane() {
  const files = [
    { name: 'patrol-drone', kind: 'folder' as const },
    { name: 'drone.px',     kind: 'file' as const },
    { name: 'idle.px',      kind: 'file' as const },
    { name: 'attack.px',    kind: 'file' as const },
  ];

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={tpStyles.sectionRow}>
        <span style={tpStyles.sectionLabel}>Files</span>
        <span style={tpStyles.sectionMeta}>workspace</span>
      </div>
      <div>
        {files.map((f, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 16px', cursor: 'pointer', fontSize: 12.5,
              color: f.kind === 'folder' ? 'var(--ink)' : 'var(--ink-2)',
            }}
          >
            {f.kind === 'folder' ? <IconFolder size={13} /> : <IconFile size={13} />}
            <span>{f.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── HistoryPane ──────────────────────────────────────────────────────────────

const HISTORY_ITEMS = [
  { label: 'Pencil stroke', meta: 'layer 0  ·  f01', time: 'now' },
  { label: 'Fill region',   meta: 'layer 0  ·  f01', time: '0:12' },
  { label: 'Erase',         meta: 'layer 0  ·  f01', time: '0:31' },
  { label: 'Pencil stroke', meta: 'layer 0  ·  f02', time: '1:04' },
  { label: 'Add layer',     meta: 'layer 1  ·  f01', time: '1:22' },
  { label: 'AI compose',    meta: 'all layers',        time: '2:00' },
];

function HistoryPane() {
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={tpStyles.sectionRow}>
        <span style={tpStyles.sectionLabel}>History</span>
        <span style={tpStyles.sectionMeta}>{HISTORY_ITEMS.length} steps</span>
      </div>
      <div>
        {HISTORY_ITEMS.map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 16px', cursor: 'pointer',
              borderBottom: '1px solid var(--rule)',
              background: i === 0 ? 'var(--paper-3)' : 'transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {i === 0 && <IconSparkle size={11} stroke="var(--amber)" />}
              {i !== 0 && <IconHistory size={11} stroke="var(--ink-4)" />}
              <div>
                <div style={{ fontSize: 12.5, color: i === 0 ? 'var(--ink)' : 'var(--ink-2)' }}>{item.label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)', marginTop: 2 }}>{item.meta}</div>
              </div>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)' }}>{item.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ToolsPane ────────────────────────────────────────────────────────────────

export function ToolsPane({
  tool, onToolChange,
  helper, onHelperChange,
  modifiers, onModifierToggle, onSymmetryChange,
  toolOptions, onToolOptionChange,
  activeTab, onTabChange,
}: ToolsPaneProps) {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleToolEnter = (t: typeof TOOLS[number], el: HTMLElement) => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    tooltipTimerRef.current = setTimeout(() => {
      setTooltip({ label: t.label, key: t.key, desc: t.desc, id: t.id, anchorRect: el.getBoundingClientRect() });
    }, 320);
  };

  const handleToolLeave = () => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    setTooltip(null);
  };

  useEffect(() => () => { if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current); }, []);

  const activeTool = TOOLS.find(t => t.id === tool);
  const rowsTotal = Math.ceil(TOOLS.length / 3);

  const renderToolsContent = () => (
    <>
      {/* Tool grid */}
      <div style={tpStyles.toolGrid}>
        {TOOLS.map((t, i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const active = tool === t.id;
          return (
            <div
              key={t.id}
              style={tpStyles.toolBtn(active, col, row, rowsTotal)}
              onClick={() => onToolChange(t.id)}
              onMouseEnter={e => handleToolEnter(t, e.currentTarget)}
              onMouseLeave={handleToolLeave}
              title={`${t.label} (${t.key})`}
            >
              {active && <span style={tpStyles.toolDot} />}
              <t.Ico size={15} />
              <span style={{ ...tpStyles.shortcut, ...(active ? tpStyles.shortcutActive : {}) }}>
                {t.key}
              </span>
            </div>
          );
        })}
      </div>

      {/* View helpers */}
      <div style={tpStyles.sectionRow}>
        <span style={tpStyles.sectionLabel}>View helper</span>
        <span style={tpStyles.sectionMeta}>{helper ?? 'none'}</span>
      </div>
      <div style={tpStyles.helperRow}>
        {HELPERS.map((h, i) => {
          const active = helper === h.id;
          const first = i === 0;
          const last = i === HELPERS.length - 1;
          return (
            <div
              key={h.id}
              style={tpStyles.helperBtn(active, first, last)}
              onClick={() => onHelperChange(active ? null : h.id)}
            >
              <h.Ico size={12} />
              <span style={tpStyles.helperLbl}>{h.label}</span>
            </div>
          );
        })}
      </div>

      {/* Modifiers */}
      <div style={tpStyles.sectionRow}>
        <span style={tpStyles.sectionLabel}>Modifiers</span>
      </div>
      <div style={{ ...tpStyles.modRow, cursor: 'default' }}>
        <span style={tpStyles.modName}>Symmetry</span>
      </div>
      <div style={tpStyles.helperRow}>
        {([
          { id: 'off',  label: 'Off' },
          { id: 'v',    label: 'Vert' },
          { id: 'h',    label: 'Horiz' },
          { id: 'both', label: 'Both' },
        ] as Array<{ id: SymmetryMode; label: string }>).map((m, i, arr) => (
          <div
            key={m.id}
            style={tpStyles.helperBtn(modifiers.symmetry === m.id, i === 0, i === arr.length - 1)}
            onClick={() => onSymmetryChange(m.id)}
          >
            <span style={tpStyles.helperLbl}>{m.label}</span>
          </div>
        ))}
      </div>
      <div style={tpStyles.modRow} onClick={() => onModifierToggle('tile')}>
        <span style={tpStyles.modName}>Tile (wrap)</span>
        <div style={tpStyles.modToggle(modifiers.tile)}>
          <div style={tpStyles.modThumb(modifiers.tile)} />
        </div>
      </div>

      {/* Tool options */}
      <div style={tpStyles.sectionRow}>
        <span style={tpStyles.sectionLabel}>Options</span>
        <span style={tpStyles.sectionMeta}>{activeTool?.label}</span>
      </div>

      <div style={tpStyles.optRow}>
        <span style={tpStyles.optLabel}>Brush size</span>
        <span style={tpStyles.optValue}>{toolOptions.brushSize}px</span>
      </div>
      <div style={{ padding: '0 16px 8px' }}>
        <PixelSlider min={1} max={16} value={toolOptions.brushSize} onChange={v => onToolOptionChange('brushSize', v)} snap={8} />
      </div>

      <div style={tpStyles.optRow}>
        <span style={tpStyles.optLabel}>Threshold</span>
        <span style={tpStyles.optValue}>{toolOptions.threshold}%</span>
      </div>
      <div style={{ padding: '0 16px 8px' }}>
        <PixelSlider min={0} max={100} value={toolOptions.threshold} onChange={v => onToolOptionChange('threshold', v)} snap={10} />
      </div>

      {/* Boolean options */}
      {(['filled', 'perfectShapes', 'contiguous'] as const).map(key => {
        const labels: Record<string, string> = { filled: 'Filled shapes', perfectShapes: 'Perfect shapes', contiguous: 'Contiguous fill' };
        return (
          <div key={key} style={tpStyles.modRow} onClick={() => onToolOptionChange(key, !toolOptions[key])}>
            <span style={tpStyles.modName}>{labels[key]}</span>
            <div style={tpStyles.modToggle(toolOptions[key])}>
              <div style={tpStyles.modThumb(toolOptions[key])} />
            </div>
          </div>
        );
      })}

      {/* Tool description */}
      {activeTool && (
        <div style={tpStyles.toolDesc}>{activeTool.desc}</div>
      )}
    </>
  );

  return (
    <div style={tpStyles.root}>
      {/* Tabs */}
      <div style={tpStyles.tabs}>
        {(['tools', 'files', 'history'] as LeftTab[]).map(tab => (
          <span key={tab} style={tpStyles.tab(activeTab === tab)} onClick={() => onTabChange(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </span>
        ))}
      </div>

      {/* Content */}
      <div style={tpStyles.content}>
        {activeTab === 'tools'   && renderToolsContent()}
        {activeTab === 'files'   && <FilesPane />}
        {activeTab === 'history' && <HistoryPane />}
      </div>

      {/* Tooltip portal */}
      {tooltip && <ToolTooltip info={tooltip} />}
    </div>
  );
}
