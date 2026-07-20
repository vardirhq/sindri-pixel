import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Frame, Tool, ViewHelper, ToolOptions, Modifiers, SymmetryMode, LeftTab, RightTab, CenterTab, Density, TutorialMode, Proposal, AppStage, CursorPos, AppMenuState, SpotlightRect, AIStatus, PixelGrid } from './types';
import { CANVAS_W, CANVAS_H, INITIAL_FRAMES, SWATCHES, buildProposalFrame, ZOOM_LEVELS } from './data';
import { Topbar } from './components/Topbar';
import { StatusBar } from './components/StatusBar';
import { CanvasView } from './components/CanvasView';
import { ToolsPane } from './components/ToolsPane';
import { RightPane } from './components/RightPane';
import { Timeline } from './components/Timeline';
import { CmdK } from './components/CmdK';
import { AppMenu } from './components/AppMenu';
import { ContextMenu } from './components/ContextMenu';
import type { ContextItem } from './components/ContextMenu';
import { LoadingScreen, WelcomeScreen, NewProjectModal } from './components/Welcome';
import type { TemplateConfig } from './components/Welcome';
import { TutorialLibrary, TutorialPlayerLane, TutorialSpotlight, TutorialBuilderRibbon } from './components/Tutorial';
import type { TutorialLesson } from './components/Tutorial';
import { BuilderStepList, BuilderStepForm, DEMO_LESSON } from './components/BuilderPanes';
import type { BuilderLesson } from './components/BuilderPanes';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getRecents, pushRecent, getSavedTemplates, saveTemplate, readAutosave, writeAutosave, clearAutosave } from './lib/storage';
import type { RecentFile, SavedTemplate, AutosaveSnapshot } from './lib/storage';
import { IS_TAURI, downloadBytes, downloadText, pickFile, encodePngInBrowser, decodePngInBrowser } from './lib/platform';
import { parseProject, serializeProject } from './lib/project-format';
import { buildSpriteSheet, compositeFrame as compositeSpriteFrame, frameFromPackedPixels } from './lib/sprite';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROFILE_SWATCHES: Record<string, string[]> = {
  sindri: SWATCHES,
  nes: ['#7c7c7c', '#0000fc', '#0000bc', '#4428bc', '#940084', '#a80020', '#a81000', '#881400',
        '#503000', '#007800', '#006800', '#005800', '#004058', '#000000', '#bcbcbc', '#0078f8'],
  gb:  ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  blank: [],
};

const TWEAKS = {
  rightPaneStart: 'layers',
  showGrid: true,
  showOnionSkin: false,
  showAiGhost: false,
  density: 'comfortable',
  showProposalLane: false,
  tutorialMode: 'off',
};

const appStyles: Record<string, React.CSSProperties> = {
  root: {
    display: 'grid',
    gridTemplateRows: '56px 1fr 28px',
    gridTemplateColumns: '260px 1fr 360px',
    gridTemplateAreas: '"topbar topbar topbar" "left center right" "status status status"',
    height: '100vh',
    width: '100vw',
    background: 'var(--paper)',
    color: 'var(--ink)',
    overflow: 'hidden',
  },
  rootCompact: {
    gridTemplateRows: '52px 1fr 26px',
    gridTemplateColumns: '240px 1fr 340px',
  },
  topbar: { gridArea: 'topbar' },
  left: { gridArea: 'left', borderRight: '1px solid var(--rule-2)', minWidth: 0 },
  center: { gridArea: 'center', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 },
  right: { gridArea: 'right', borderLeft: '1px solid var(--rule-2)', minWidth: 0 },
  status: { gridArea: 'status' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface HistorySnapshot {
  frames: Frame[];
  w: number;
  h: number;
}

function makeProposal(prompt: string): Proposal {
  return {
    visible: true,
    prompt,
    title: 'drone_burst frame',
    frame: {
      id: 'ghost',
      duration: 100,
      layers: [{ id: 'gl', name: 'ai-proposed', visible: true, opacity: 1, pixels: buildProposalFrame() }],
    },
    changes: [
      {
        kind: 'frame',
        title: 'Add drone_burst frame',
        meta: 'after frame 4 · 100 ms · 24 px changed',
        body: 'Inserts a new frame depicting the drone with damaged metal and a moss-green energy burst, sized to match the existing 32×32 canvas.',
      },
      {
        kind: 'palette',
        title: 'Add moss highlight to palette',
        meta: '+1 swatch · #9bb070',
        body: 'Brings the proposed burst color into the working palette so future frames can reuse it.',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Initial active lesson placeholder
// ---------------------------------------------------------------------------

const INITIAL_LESSON: TutorialLesson = {
  id: 'outlines_101',
  title: 'Pixel outlines 101',
  author: 'sindri team',
  difficulty: 'beginner',
  time: '4 min',
  steps: 3,
  summary: '',
  intro: '',
  cover: { w: 12, h: 12, pixels: Array(12).fill(Array(12).fill(null)) },
  completed: false,
};

// ---------------------------------------------------------------------------
// TweakKey type
// ---------------------------------------------------------------------------

type TweakKey =
  | 'rightPaneStart'
  | 'showGrid'
  | 'showOnionSkin'
  | 'showAiGhost'
  | 'density'
  | 'showProposalLane'
  | 'tutorialMode';

// ---------------------------------------------------------------------------
// Keyboard Shortcuts Modal
// ---------------------------------------------------------------------------

const SHORTCUT_SECTIONS = [
  { title: 'File', rows: [
    { keys: '⌘N',   label: 'New sprite' },
    { keys: '⌘O',   label: 'Open…' },
    { keys: '⌘S',   label: 'Save' },
    { keys: '⇧⌘S',  label: 'Save as…' },
    { keys: '⌘E',   label: 'Export PNG (current frame)' },
    { keys: '⇧⌘E',  label: 'Export animated GIF' },
  ]},
  { title: 'Edit', rows: [
    { keys: '⌘Z',   label: 'Undo' },
    { keys: '⇧⌘Z',  label: 'Redo' },
    { keys: '⌘C',   label: 'Copy selection' },
    { keys: '⌘X',   label: 'Cut selection' },
    { keys: '⌘V',   label: 'Paste' },
    { keys: 'Del',  label: 'Delete selection pixels' },
  ]},
  { title: 'Tools', rows: [
    { keys: 'P',  label: 'Pencil' },
    { keys: 'E',  label: 'Eraser' },
    { keys: 'G',  label: 'Fill' },
    { keys: 'I',  label: 'Color picker' },
    { keys: 'L',  label: 'Line' },
    { keys: 'R',  label: 'Rect' },
    { keys: 'C',  label: 'Circle' },
    { keys: 'V',  label: 'Select (marquee)' },
    { keys: 'W',  label: 'Magic wand' },
    { keys: 'A',  label: 'Lasso' },
    { keys: 'M',  label: 'Move' },
    { keys: 'H',  label: 'Pan' },
  ]},
  { title: 'View', rows: [
    { keys: '⌘+',  label: 'Zoom in' },
    { keys: '⌘−',  label: 'Zoom out' },
    { keys: '⌘0',  label: 'Fit to viewport' },
    { keys: '⌘1',  label: 'Actual size' },
    { keys: '⇧G',  label: 'Toggle pixel grid' },
    { keys: '⇧O',  label: 'Toggle onion skin' },
    { keys: '⇧A',  label: 'Toggle AI ghost' },
    { keys: '⌘K',  label: 'Open command palette' },
  ]},
  { title: 'Timeline', rows: [
    { keys: '[',     label: 'Previous frame' },
    { keys: ']',     label: 'Next frame' },
    { keys: 'Space', label: 'Play / pause' },
  ]},
];

function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  React.useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  const scrim: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const box: React.CSSProperties = {
    background: 'var(--paper-2)', border: '1px solid var(--rule-2)',
    width: 620, maxHeight: '80vh', overflow: 'auto',
    boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
    color: 'var(--ink)', fontFamily: 'var(--font-sans)',
    display: 'flex', flexDirection: 'column',
  };
  const header: React.CSSProperties = {
    padding: '18px 24px 14px', borderBottom: '1px solid var(--rule)',
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
  };
  const grid: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px',
    padding: '16px 24px 20px',
  };
  const sectionTitle: React.CSSProperties = {
    fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-3)',
    marginBottom: 6, marginTop: 12,
  };
  const row: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '3px 0', borderBottom: '1px solid var(--rule)',
  };
  const keyChip: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink)',
    background: 'var(--paper-3)', border: '1px solid var(--rule-2)',
    padding: '1px 6px', letterSpacing: '0.04em', flex: 'none',
  };

  return (
    <div style={scrim} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600 }}>Keyboard Shortcuts</span>
          <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', cursor: 'pointer' }} onClick={onClose}>ESC</span>
        </div>
        <div style={grid}>
          {SHORTCUT_SECTIONS.map(sec => (
            <div key={sec.title}>
              <div style={sectionTitle}>{sec.title}</div>
              {sec.rows.map(r => (
                <div key={r.keys} style={row}>
                  <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{r.label}</span>
                  <span style={keyChip}>{r.keys}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resize Canvas Modal
// ---------------------------------------------------------------------------

function ResizeCanvasModal({
  open, currentW, currentH, onClose, onResize,
}: {
  open: boolean;
  currentW: number;
  currentH: number;
  onClose: () => void;
  onResize: (w: number, h: number, anchor: 'top-left' | 'center') => void;
}) {
  const [w, setW] = React.useState(currentW);
  const [h, setH] = React.useState(currentH);
  const [anchor, setAnchor] = React.useState<'top-left' | 'center'>('top-left');

  React.useEffect(() => {
    if (open) { setW(currentW); setH(currentH); setAnchor('top-left'); }
  }, [open, currentW, currentH]);

  if (!open) return null;

  const modalScrim: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
  const modalBox: React.CSSProperties = { background: 'var(--paper-2)', border: '1px solid var(--rule-2)', width: 280, padding: '24px 24px 20px', boxShadow: '0 12px 32px rgba(0,0,0,0.5)', color: 'var(--ink)', fontFamily: 'var(--font-sans)' };
  const numInput: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--rule-2)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: '6px 8px', width: '100%', boxSizing: 'border-box' };
  const btn = (primary: boolean): React.CSSProperties => ({ fontFamily: 'var(--font-display)', fontSize: 12.5, padding: '7px 16px', background: primary ? 'var(--ink)' : 'transparent', border: `1px solid ${primary ? 'var(--ink)' : 'var(--rule-2)'}`, color: primary ? 'var(--paper)' : 'var(--ink-2)', cursor: 'pointer' });

  return (
    <div style={modalScrim} onClick={onClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Resize Canvas</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 12px', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Width</span>
          <input type="number" min={1} max={512} value={w} style={numInput}
            onChange={e => setW(Math.max(1, Math.min(512, parseInt(e.target.value) || 1)))} />
          <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Height</span>
          <input type="number" min={1} max={512} value={h} style={numInput}
            onChange={e => setH(Math.max(1, Math.min(512, parseInt(e.target.value) || 1)))} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, fontFamily: 'var(--font-display)' }}>Anchor</div>
          <div style={{ display: 'flex', gap: 16 }}>
            {(['top-left', 'center'] as const).map(a => (
              <label key={a} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                <input type="radio" name="anchor" checked={anchor === a} onChange={() => setAnchor(a)} />
                {a === 'top-left' ? 'Top-left' : 'Center'}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btn(false)}>Cancel</button>
          <button onClick={() => { onResize(w, h, anchor); onClose(); }} style={btn(true)}>Resize</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export Modal
// ---------------------------------------------------------------------------

export type ExportFormat = 'png' | 'gif' | 'sheet';

function ExportModal({
  open, format, frameCount, canvasW, canvasH, onClose, onExport,
}: {
  open: boolean;
  format: ExportFormat;
  frameCount: number;
  canvasW: number;
  canvasH: number;
  onClose: () => void;
  onExport: (format: ExportFormat, scale: number, columns: number) => void;
}) {
  const [scale, setScale] = React.useState(1);
  const [columns, setColumns] = React.useState(frameCount);

  React.useEffect(() => {
    if (open) setColumns(frameCount);
  }, [open, frameCount]);

  if (!open) return null;

  const titles: Record<ExportFormat, string> = {
    png: 'Export PNG (current frame)',
    gif: 'Export animated GIF',
    sheet: 'Export sprite sheet',
  };
  const rows = format === 'sheet' ? Math.ceil(frameCount / Math.max(1, columns)) : 1;
  const outW = (format === 'sheet' ? canvasW * Math.min(columns, frameCount) : canvasW) * scale;
  const outH = (format === 'sheet' ? canvasH * rows : canvasH) * scale;

  const scrim: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
  const box: React.CSSProperties = { background: 'var(--paper-2)', border: '1px solid var(--rule-2)', width: 300, padding: '24px 24px 20px', boxShadow: '0 12px 32px rgba(0,0,0,0.5)', color: 'var(--ink)', fontFamily: 'var(--font-sans)' };
  const segRow: React.CSSProperties = { display: 'flex', marginBottom: 16 };
  const seg = (active: boolean): React.CSSProperties => ({
    flex: 1, textAlign: 'center', padding: '7px 0', cursor: 'pointer',
    fontFamily: 'var(--font-mono)', fontSize: 12,
    background: active ? 'var(--paper-3)' : 'var(--paper)',
    color: active ? 'var(--ink)' : 'var(--ink-3)',
    border: '1px solid var(--rule-2)', borderLeft: 'none',
  });
  const btn = (primary: boolean): React.CSSProperties => ({ fontFamily: 'var(--font-display)', fontSize: 12.5, padding: '7px 16px', background: primary ? 'var(--ink)' : 'transparent', border: `1px solid ${primary ? 'var(--ink)' : 'var(--rule-2)'}`, color: primary ? 'var(--paper)' : 'var(--ink-2)', cursor: 'pointer' });
  const label: React.CSSProperties = { fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, fontFamily: 'var(--font-display)' };

  return (
    <div style={scrim} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, marginBottom: 20 }}>{titles[format]}</div>

        <div style={label}>Scale</div>
        <div style={segRow}>
          {[1, 2, 4, 8, 16].map((s, i) => (
            <div key={s} style={{ ...seg(scale === s), ...(i === 0 ? { borderLeft: '1px solid var(--rule-2)' } : {}) }} onClick={() => setScale(s)}>
              {s}×
            </div>
          ))}
        </div>

        {format === 'sheet' && (
          <React.Fragment>
            <div style={label}>Columns</div>
            <div style={{ marginBottom: 16 }}>
              <input
                type="number" min={1} max={frameCount} value={columns}
                style={{ background: 'var(--paper)', border: '1px solid var(--rule-2)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: '6px 8px', width: '100%', boxSizing: 'border-box' }}
                onChange={e => setColumns(Math.max(1, Math.min(frameCount, parseInt(e.target.value) || 1)))}
              />
            </div>
          </React.Fragment>
        )}

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)', marginBottom: 20 }}>
          output · {outW} × {outH} px{format === 'gif' ? ` · ${frameCount} frames` : format === 'sheet' ? ` · ${frameCount} tiles` : ''}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btn(false)}>Cancel</button>
          <button onClick={() => { onExport(format, scale, columns); onClose(); }} style={btn(true)}>Export</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App() {
  const [frames, setFrames] = useState<Frame[]>(INITIAL_FRAMES);
  const [frameIdx, setFrameIdx] = useState(0);
  const [activeLayerIdx, setActiveLayerIdx] = useState(0);
  const [canvasW, setCanvasW] = useState(CANVAS_W);
  const [canvasH, setCanvasH] = useState(CANVAS_H);
  const [projectName, setProjectName] = useState('drone_idle.spr');
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => getRecents());
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>(() => getSavedTemplates());
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);

  // Selection (lifted from CanvasView so clipboard operations can access it)
  const [selection, setSelection] = useState<{ x0: number; y0: number; x1: number; y1: number; pixels?: [number, number][] } | null>(null);
  // Internal clipboard — stores a cropped region of pixels
  const [clipboard, setClipboard] = useState<{ pixels: (string | null)[][]; w: number; h: number; srcX: number; srcY: number } | null>(null);
  // Resize canvas dialog state
  const [resizeModalOpen, setResizeModalOpen] = useState(false);
  // Keyboard shortcuts modal
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextItem[] } | null>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const [tool, setTool] = useState<Tool>('pencil' as Tool);
  const [color, setColor] = useState('#6dbcdb');
  const [swatches, setSwatches] = useState<string[]>(SWATCHES);

  const [toolOptions, setToolOptions] = useState<ToolOptions>({
    brushSize: 1,
    filled: false,
    perfectShapes: true,
    contiguous: true,
    threshold: 32,
  });
  const [modifiers, setModifiers] = useState<Modifiers>({ symmetry: 'off', tile: false });
  const [helper, setHelper] = useState<ViewHelper>(null);

  const [leftTab, setLeftTab] = useState<LeftTab>('tools');
  const [rightTab, setRightTab] = useState<RightTab>(TWEAKS.rightPaneStart as RightTab);
  const [centerTab, setCenterTab] = useState<CenterTab>('editor');

  const [showGrid, setShowGrid] = useState<boolean>(TWEAKS.showGrid);
  const [showOnionSkin, setShowOnionSkin] = useState<boolean>(TWEAKS.showOnionSkin);
  const [showAiGhost, setShowAiGhost] = useState<boolean>(TWEAKS.showAiGhost);
  const [density, setDensity] = useState<Density>(TWEAKS.density as Density);

  const [zoomIdx, setZoomIdx] = useState(4);
  const [cursor, setCursor] = useState<CursorPos | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [cmdKOpen, setCmdKOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  // Keep maximized state in sync with the actual OS window (Tauri only)
  useEffect(() => {
    if (!IS_TAURI) return;
    const win = getCurrentWindow();
    void win.isMaximized().then(setMaximized);
    const unlisten = win.onResized(() => void win.isMaximized().then(setMaximized));
    return () => { void unlisten.then((fn) => fn()); };
  }, []);
  const [appMenu, setAppMenu] = useState<AppMenuState | null>(null);

  const [appStage, setAppStage] = useState<AppStage>('loading');
  const [newProjectFor, setNewProjectFor] = useState<TemplateConfig | object | null>(null);
  const enterEditor = () => setAppStage('editor');

  const createSprite = (cfg: TemplateConfig | object) => {
    const c = cfg as Partial<{
      name: string; w: number; h: number;
      frames: number; animated: boolean; profile: string;
    }>;
    const w = c.w ?? 32;
    const h = c.h ?? 32;
    const frameCount = c.animated ? (c.frames ?? 1) : (c.frames === undefined ? 1 : Math.max(1, c.frames as number));
    const name = (c.name as string | undefined) ?? 'untitled.spr';
    const profile = (c.profile as string | undefined) ?? 'sindri';

    const makeBlankLayer = (layerIdx: number, fIdx: number) => ({
      id: `f${fIdx}_l${layerIdx}_${Date.now()}`,
      name: 'layer 1',
      visible: true,
      opacity: 1,
      pixels: Array(h).fill(null).map(() => Array(w).fill(null)),
    });

    const newFrames: Frame[] = Array.from({ length: Math.max(1, frameCount) }, (_, i) => ({
      id: `frame_${i}`,
      duration: 120,
      layers: [makeBlankLayer(0, i)],
    }));

    setCanvasW(w);
    setCanvasH(h);
    setProjectName(name);
    setFrames(newFrames);
    setFrameIdx(0);
    setActiveLayerIdx(0);
    setSwatches(PROFILE_SWATCHES[profile] ?? SWATCHES);
    setProposal(null);
    setNewProjectFor(null);
    setCurrentFilePath(null);
    setSelection(null);
    pastRef.current = [];
    futureRef.current = [];
    setDirty(false);
    const doSaveTemplate = (c as { saveAsTemplate?: boolean }).saveAsTemplate ?? false;
    if (doSaveTemplate) {
      saveTemplate({ name, w, h, frames: Math.max(1, frameCount), animated: !!c.animated, profile });
      setSavedTemplates(getSavedTemplates());
    }
    pushRecent({ name, path: '', spec: `${w} × ${h} · ${Math.max(1, frameCount)} frame${frameCount > 1 ? 's' : ''}`, timestamp: Date.now() });
    setRecentFiles(getRecents());
    enterEditor();
  };

  const [tutorialMode, setTutorialMode] = useState<TutorialMode>(TWEAKS.tutorialMode as TutorialMode);
  const [activeLesson, setActiveLesson] = useState<TutorialLesson>(INITIAL_LESSON);
  const [lessonStepIdx, setLessonStepIdx] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [showAIHint, setShowAIHint] = useState(false);
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const pastRef = useRef<HistorySnapshot[]>([]);
  const futureRef = useRef<HistorySnapshot[]>([]);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);

  const [draftLesson, setDraftLesson] = useState<BuilderLesson>(DEMO_LESSON);
  const [builderStepIdx, setBuilderStepIdx] = useState(1);

  // ── History (undo / redo) ──────────────────────────────────────────────────
  // Snapshots capture frames AND canvas dimensions so undoing a resize/crop
  // restores a consistent grid. pushHistory is called just before setFrames.
  const [dirty, setDirty] = useState(false);

  const applySnapshot = useCallback((snap: HistorySnapshot) => {
    setFrames(snap.frames);
    setCanvasW(snap.w);
    setCanvasH(snap.h);
    setFrameIdx((i) => Math.max(0, Math.min(i, snap.frames.length - 1)));
    setActiveLayerIdx((i) => {
      const maxLayers = Math.max(...snap.frames.map((f) => f.layers.length));
      return Math.max(0, Math.min(i, maxLayers - 1));
    });
    setSelection(null);
  }, []);

  const pushHistory = useCallback(() => {
    pastRef.current = [...pastRef.current.slice(-49), { frames, w: canvasW, h: canvasH }];
    futureRef.current = [];
    setDirty(true);
  }, [frames, canvasW, canvasH]);

  const undo = useCallback(() => {
    if (!pastRef.current.length) return;
    const prev = pastRef.current[pastRef.current.length - 1];
    futureRef.current = [{ frames, w: canvasW, h: canvasH }, ...futureRef.current.slice(0, 49)];
    pastRef.current = pastRef.current.slice(0, -1);
    applySnapshot(prev);
  }, [frames, canvasW, canvasH, applySnapshot]);

  const redo = useCallback(() => {
    if (!futureRef.current.length) return;
    const next = futureRef.current[0];
    pastRef.current = [...pastRef.current.slice(-49), { frames, w: canvasW, h: canvasH }];
    futureRef.current = futureRef.current.slice(1);
    applySnapshot(next);
  }, [frames, canvasW, canvasH, applySnapshot]);

  useEffect(() => {
    if (tutorialMode !== 'playing') { setSpotlightRect(null); return; }
    const measure = () => {
      const shell = canvasShellRef.current;
      if (!shell) return;
      const targetName = ['toolbar', 'canvas', 'toolbar'][lessonStepIdx] || 'canvas';
      if (targetName === 'canvas') {
        const board = shell.querySelector('[data-spotlight="canvas-board"]');
        if (!board) return;
        const sb = shell.getBoundingClientRect();
        const bb = board.getBoundingClientRect();
        const sprite = 32;
        const scale = bb.width / sprite;
        setSpotlightRect({
          scope: 'center',
          x: bb.left - sb.left + 6 * scale,
          y: bb.top - sb.top + 4 * scale,
          w: 16 * scale,
          h: 10 * scale,
          calloutSide: 'right',
        });
      } else {
        const sel: Record<string, string> = {
          toolbar: '[data-spotlight="toolbar"]',
          palette: '[data-spotlight="palette"]',
          layers: '[data-spotlight="layers"]',
          timeline: '[data-spotlight="timeline"]',
        };
        const el = document.querySelector(sel[targetName]);
        if (!el) return;
        const r = el.getBoundingClientRect();
        setSpotlightRect({
          scope: 'viewport',
          x: r.left,
          y: r.top,
          w: r.width,
          h: r.height,
          calloutSide: targetName === 'toolbar' ? 'right' : 'left',
        });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (canvasShellRef.current) ro.observe(canvasShellRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [tutorialMode, lessonStepIdx]);

  const initialProposal: Proposal | null = TWEAKS.showProposalLane
    ? makeProposal('Add a damaged-burst frame to the drone idle so it has a death pose.')
    : null;
  const [proposal, setProposal] = useState<Proposal | null>(initialProposal);

  useEffect(() => {
    if (!isPlaying) return;
    if (centerTab !== 'editor') return;
    // Each frame holds for its own duration.
    const id = setTimeout(() => { setFrameIdx((i) => (i + 1) % frames.length); }, frames[frameIdx]?.duration ?? 120);
    return () => clearTimeout(id);
  }, [isPlaying, frames, frameIdx, centerTab]);

  const updateActiveLayerPixels = useCallback((newPixels: (string | null)[][]) => {
    setFrames((fs) => {
      const next = fs.slice();
      const frame = { ...next[frameIdx] };
      const layers = frame.layers.slice();
      layers[activeLayerIdx] = { ...layers[activeLayerIdx], pixels: newPixels };
      frame.layers = layers;
      next[frameIdx] = frame;
      return next;
    });
  }, [frameIdx, activeLayerIdx]);

  // ── Clipboard operations ───────────────────────────────────────────────────
  const copySelection = useCallback(() => {
    if (!selection) return;
    const layer = frames[frameIdx]?.layers[activeLayerIdx];
    if (!layer) return;
    const { x0, y0, x1, y1, pixels: selPixels } = selection;
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const copied: (string | null)[][] = Array.from({ length: h }, (_, ry) =>
      Array.from({ length: w }, (_, rx) => {
        const px = minX + rx, py = minY + ry;
        if (selPixels && !selPixels.some(([sx, sy]) => sx === px && sy === py)) return null;
        return layer.pixels[py]?.[px] ?? null;
      })
    );
    setClipboard({ pixels: copied, w, h, srcX: minX, srcY: minY });
  }, [selection, frames, frameIdx, activeLayerIdx]);

  const cutSelection = useCallback(() => {
    if (!selection) return;
    copySelection();
    const layer = frames[frameIdx]?.layers[activeLayerIdx];
    if (!layer) return;
    pushHistory();
    const { x0, y0, x1, y1, pixels: selPixels } = selection;
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    const newPixels = layer.pixels.map((row, y) =>
      row.map((col, x) => {
        if (x < minX || x > maxX || y < minY || y > maxY) return col;
        if (selPixels && !selPixels.some(([sx, sy]) => sx === x && sy === y)) return col;
        return null;
      })
    );
    updateActiveLayerPixels(newPixels);
    setSelection(null);
  }, [selection, frames, frameIdx, activeLayerIdx, copySelection, pushHistory, updateActiveLayerPixels]);

  const pasteClipboard = useCallback(() => {
    if (!clipboard) return;
    const layer = frames[frameIdx]?.layers[activeLayerIdx];
    if (!layer) return;
    pushHistory();
    const newPixels = layer.pixels.map((row, y) =>
      row.map((col, x) => {
        const rx = x - clipboard.srcX, ry = y - clipboard.srcY;
        if (rx < 0 || ry < 0 || rx >= clipboard.w || ry >= clipboard.h) return col;
        return clipboard.pixels[ry][rx] ?? col;
      })
    );
    updateActiveLayerPixels(newPixels);
    // Select pasted region
    setSelection({ x0: clipboard.srcX, y0: clipboard.srcY, x1: clipboard.srcX + clipboard.w - 1, y1: clipboard.srcY + clipboard.h - 1 });
  }, [clipboard, frames, frameIdx, activeLayerIdx, pushHistory, updateActiveLayerPixels]);

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    const layer = frames[frameIdx]?.layers[activeLayerIdx];
    if (!layer) return;
    pushHistory();
    const { x0, y0, x1, y1, pixels: selPixels } = selection;
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    const newPixels = layer.pixels.map((row, y) =>
      row.map((col, x) => {
        if (x < minX || x > maxX || y < minY || y > maxY) return col;
        if (selPixels && !selPixels.some(([sx, sy]) => sx === x && sy === y)) return col;
        return null;
      })
    );
    updateActiveLayerPixels(newPixels);
    setSelection(null);
  }, [selection, frames, frameIdx, activeLayerIdx, pushHistory, updateActiveLayerPixels]);

  // ── Select all / clear layer ──────────────────────────────────────────────
  const selectAll = useCallback(() => {
    setSelection({ x0: 0, y0: 0, x1: canvasW - 1, y1: canvasH - 1 });
  }, [canvasW, canvasH]);

  const clearLayer = useCallback(() => {
    pushHistory();
    updateActiveLayerPixels(Array(canvasH).fill(null).map(() => Array(canvasW).fill(null)));
    setSelection(null);
  }, [canvasH, canvasW, pushHistory, updateActiveLayerPixels]);

  // ── Layer operations ──────────────────────────────────────────────────────
  const duplicateLayer = useCallback((idx: number) => {
    pushHistory();
    setFrames((fs) => {
      const next = fs.slice();
      const frame = { ...next[frameIdx] };
      const layers = frame.layers.slice();
      const src = layers[idx];
      const copy = {
        ...src,
        id: `${src.id}_dup_${Date.now()}`,
        name: src.name + ' copy',
        pixels: src.pixels.map((r) => r.slice()),
      };
      layers.splice(idx + 1, 0, copy);
      frame.layers = layers;
      next[frameIdx] = frame;
      return next;
    });
    setActiveLayerIdx(idx + 1);
  }, [frameIdx, pushHistory]);

  const moveLayerUp = useCallback((idx: number) => {
    if (idx >= frames[frameIdx].layers.length - 1) return;
    pushHistory();
    setFrames((fs) => {
      const next = fs.slice();
      const frame = { ...next[frameIdx] };
      const layers = frame.layers.slice();
      [layers[idx], layers[idx + 1]] = [layers[idx + 1], layers[idx]];
      frame.layers = layers;
      next[frameIdx] = frame;
      return next;
    });
    setActiveLayerIdx(idx + 1);
  }, [frames, frameIdx, pushHistory]);

  const moveLayerDown = useCallback((idx: number) => {
    if (idx <= 0) return;
    pushHistory();
    setFrames((fs) => {
      const next = fs.slice();
      const frame = { ...next[frameIdx] };
      const layers = frame.layers.slice();
      [layers[idx], layers[idx - 1]] = [layers[idx - 1], layers[idx]];
      frame.layers = layers;
      next[frameIdx] = frame;
      return next;
    });
    setActiveLayerIdx(idx - 1);
  }, [frames, frameIdx, pushHistory]);

  // ── Frame operations ──────────────────────────────────────────────────────
  const insertFrameAt = useCallback((idx: number) => {
    pushHistory();
    setFrames((fs) => {
      const next = fs.slice();
      const blank: Frame = {
        id: `frame_${Date.now()}`,
        duration: fs[0]?.duration ?? 120,
        layers: [{
          id: `f${Date.now()}_l0`,
          name: 'layer 1',
          visible: true,
          opacity: 1,
          pixels: Array(canvasH).fill(null).map(() => Array(canvasW).fill(null)),
        }],
      };
      next.splice(idx, 0, blank);
      return next;
    });
    setFrameIdx(idx);
  }, [canvasH, canvasW, pushHistory]);

  // ── Flip / rotate operations ───────────────────────────────────────────────
  // With an active selection: transform only the selected pixels on the active
  // layer, in place within the selection's bounding box.
  // Without a selection: transform every layer of the current frame.

  const transformSelection = useCallback((fn: (rx: number, ry: number, w: number, h: number) => [number, number]) => {
    if (!selection) return false;
    const layer = frames[frameIdx]?.layers[activeLayerIdx];
    if (!layer) return false;
    pushHistory();
    const minX = Math.min(selection.x0, selection.x1), maxX = Math.max(selection.x0, selection.x1);
    const minY = Math.min(selection.y0, selection.y1), maxY = Math.max(selection.y0, selection.y1);
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const selSet = selection.pixels ? new Set(selection.pixels.map(([sx, sy]) => `${sx},${sy}`)) : null;
    const inSel = (px: number, py: number) =>
      px >= minX && px <= maxX && py >= minY && py <= maxY && (!selSet || selSet.has(`${px},${py}`));

    const newPixels: PixelGrid = layer.pixels.map((row, py) =>
      row.map((col, px) => (inSel(px, py) ? null : col))
    );
    for (let ry = 0; ry < h; ry++) {
      for (let rx = 0; rx < w; rx++) {
        const sx = minX + rx, sy = minY + ry;
        if (!inSel(sx, sy)) continue;
        const col = layer.pixels[sy][sx];
        if (col === null) continue;
        const [nx, ny] = fn(rx, ry, w, h);
        const dx = minX + nx, dy = minY + ny;
        if (dx >= 0 && dx < canvasW && dy >= 0 && dy < canvasH) newPixels[dy][dx] = col;
      }
    }
    updateActiveLayerPixels(newPixels);
    return true;
  }, [selection, frames, frameIdx, activeLayerIdx, canvasW, canvasH, pushHistory, updateActiveLayerPixels]);

  const flipH = useCallback(() => {
    if (transformSelection((rx, ry, w) => [w - 1 - rx, ry])) return;
    pushHistory();
    setFrames((fs) => fs.map((f, i) => (i !== frameIdx ? f : {
      ...f,
      layers: f.layers.map((l) => ({
        ...l,
        pixels: l.pixels.map((row) => row.slice().reverse()),
      })),
    })));
  }, [transformSelection, pushHistory, frameIdx]);

  const flipV = useCallback(() => {
    if (transformSelection((rx, ry, _w, h) => [rx, h - 1 - ry])) return;
    pushHistory();
    setFrames((fs) => fs.map((f, i) => (i !== frameIdx ? f : {
      ...f,
      layers: f.layers.map((l) => ({
        ...l,
        pixels: l.pixels.slice().reverse(),
      })),
    })));
  }, [transformSelection, pushHistory, frameIdx]);

  // Rotate 90°. Selections rotate in place around the bounding-box center
  // (the box's width/height swap). Without a selection, the whole canvas
  // rotates and its dimensions swap across every frame.
  const rotate90 = useCallback((cw: boolean) => {
    if (selection) {
      const minX = Math.min(selection.x0, selection.x1), maxX = Math.max(selection.x0, selection.x1);
      const minY = Math.min(selection.y0, selection.y1), maxY = Math.max(selection.y0, selection.y1);
      const w = maxX - minX + 1, h = maxY - minY + 1;
      // Anchor the rotated (h × w) box at the same top-left corner.
      transformSelection((rx, ry, bw, bh) => (cw ? [bh - 1 - ry, rx] : [ry, bw - 1 - rx]));
      const nx1 = Math.min(canvasW - 1, minX + h - 1);
      const ny1 = Math.min(canvasH - 1, minY + w - 1);
      setSelection({ x0: minX, y0: minY, x1: nx1, y1: ny1 });
      return;
    }
    pushHistory();
    const newW = canvasH, newH = canvasW;
    setFrames((fs) => fs.map((f) => ({
      ...f,
      layers: f.layers.map((l) => ({
        ...l,
        pixels: Array.from({ length: newH }, (_, y) =>
          Array.from({ length: newW }, (_, x) =>
            cw ? l.pixels[canvasH - 1 - x][y] : l.pixels[x][canvasW - 1 - y]
          )
        ),
      })),
    })));
    setCanvasW(newW);
    setCanvasH(newH);
  }, [selection, transformSelection, pushHistory, canvasW, canvasH]);

  // ── Layer rename ───────────────────────────────────────────────────────────
  const renameLayer = useCallback((idx: number, name: string) => {
    setFrames((fs) => {
      const next = fs.slice();
      const frame = { ...next[frameIdx] };
      const layers = frame.layers.slice();
      layers[idx] = { ...layers[idx], name: name || layers[idx].name };
      frame.layers = layers;
      next[frameIdx] = frame;
      return next;
    });
  }, [frameIdx]);

  // ── Resize canvas ──────────────────────────────────────────────────────────
  const resizeCanvas = useCallback((newW: number, newH: number, anchor: 'top-left' | 'center') => {
    pushHistory();
    const offX = anchor === 'center' ? Math.round((newW - canvasW) / 2) : 0;
    const offY = anchor === 'center' ? Math.round((newH - canvasH) / 2) : 0;
    setFrames((fs) =>
      fs.map((f) => ({
        ...f,
        layers: f.layers.map((l) => ({
          ...l,
          pixels: Array.from({ length: newH }, (_, y) =>
            Array.from({ length: newW }, (_, x) => {
              const srcX = x - offX, srcY = y - offY;
              if (srcY < 0 || srcY >= canvasH || srcX < 0 || srcX >= canvasW) return null;
              return l.pixels[srcY]?.[srcX] ?? null;
            })
          ),
        })),
      }))
    );
    setCanvasW(newW);
    setCanvasH(newH);
    setSelection(null);
  }, [pushHistory, canvasW, canvasH]);

  const addLayer = () => {
    pushHistory();
    setFrames((fs) => {
      const next = fs.slice();
      const frame = { ...next[frameIdx] };
      frame.layers = [
        ...frame.layers,
        {
          id: `${frame.id}_layer_${frame.layers.length}_${Date.now()}`,
          name: `layer ${frame.layers.length + 1}`,
          visible: true,
          opacity: 1,
          pixels: Array(canvasH).fill(null).map(() => Array(canvasW).fill(null)),
        },
      ];
      next[frameIdx] = frame;
      return next;
    });
    setActiveLayerIdx((i) => i + 1);
  };

  const deleteLayer = (idx: number) => {
    pushHistory();
    setFrames((fs) => {
      const next = fs.slice();
      const frame = { ...next[frameIdx] };
      if (frame.layers.length <= 1) return fs;
      frame.layers = frame.layers.filter((_, i) => i !== idx);
      next[frameIdx] = frame;
      return next;
    });
    setActiveLayerIdx((i) => Math.max(0, i - 1));
  };

  const toggleLayerVisible = (idx: number) => {
    setFrames((fs) => {
      const next = fs.slice();
      const frame = { ...next[frameIdx] };
      const layers = frame.layers.slice();
      layers[idx] = { ...layers[idx], visible: !layers[idx].visible };
      frame.layers = layers;
      next[frameIdx] = frame;
      return next;
    });
  };

  const setLayerOpacity = (idx: number, op: number) => {
    setFrames((fs) => {
      const next = fs.slice();
      const frame = { ...next[frameIdx] };
      const layers = frame.layers.slice();
      layers[idx] = { ...layers[idx], opacity: op };
      frame.layers = layers;
      next[frameIdx] = frame;
      return next;
    });
  };

  const mergeDown = () => {
    if (activeLayerIdx === 0) return;
    pushHistory();
    setFrames((fs) => {
      const next = fs.slice();
      const frame = { ...next[frameIdx] };
      const top = frame.layers[activeLayerIdx];
      const bot = frame.layers[activeLayerIdx - 1];
      const merged = bot.pixels.map((row, y) =>
        row.map((c, x) => (top.visible && top.pixels[y][x]) || c)
      );
      const layers = frame.layers.slice();
      layers[activeLayerIdx - 1] = { ...bot, pixels: merged };
      layers.splice(activeLayerIdx, 1);
      frame.layers = layers;
      next[frameIdx] = frame;
      return next;
    });
    setActiveLayerIdx((i) => Math.max(0, i - 1));
  };

  const addFrame = () => {
    pushHistory();
    setFrames((fs) => {
      const next = fs.slice();
      const blank: Frame = {
        id: `frame_${Date.now()}`,
        duration: fs[0]?.duration ?? 120,
        layers: [{
          id: `f${Date.now()}_l0`,
          name: 'layer 1',
          visible: true,
          opacity: 1,
          pixels: Array(canvasH).fill(null).map(() => Array(canvasW).fill(null)),
        }],
      };
      next.splice(frameIdx + 1, 0, blank);
      return next;
    });
    setFrameIdx((i) => i + 1);
  };

  const duplicateFrame = (idx: number) => {
    pushHistory();
    setFrames((fs) => {
      const src = fs[idx];
      const copy: Frame = {
        id: `frame_${Date.now()}`,
        duration: src.duration,
        layers: src.layers.map((L) => ({
          ...L,
          id: `${L.id}_${Date.now()}`,
          pixels: L.pixels.map((r) => r.slice()),
        })),
      };
      const next = fs.slice();
      next.splice(idx + 1, 0, copy);
      return next;
    });
    setFrameIdx((i) => i + 1);
  };

  const deleteFrame = (idx: number) => {
    if (frames.length <= 1) return;
    pushHistory();
    setFrames((fs) => fs.filter((_, i) => i !== idx));
    setFrameIdx((i) => Math.max(0, Math.min(i, frames.length - 2)));
  };

  // Set the duration of the current frame only.
  const setFrameDuration = (ms: number) => {
    setFrames((fs) => fs.map((f, i) => (i === frameIdx ? { ...f, duration: ms } : f)));
  };

  // Copy the current frame's duration to every frame.
  const applyDurationToAll = () => {
    const ms = frames[frameIdx]?.duration ?? 120;
    setFrames((fs) => fs.map((f) => ({ ...f, duration: ms })));
  };

  // ── Frame reorder ──────────────────────────────────────────────────────────
  const moveFrame = useCallback((from: number, to: number) => {
    if (to < 0 || to >= frames.length || from === to) return;
    pushHistory();
    setFrames((fs) => {
      const next = fs.slice();
      const [f] = next.splice(from, 1);
      next.splice(to, 0, f);
      return next;
    });
    setFrameIdx(to);
  }, [frames.length, pushHistory]);

  const addSwatch = () => {
    if (swatches.includes(color)) return;
    setSwatches((s) => [...s, color]);
  };

  // Distinct colors currently painted anywhere in the sprite.
  const usedColors = useMemo(() => {
    const set = new Set<string>();
    for (const f of frames) {
      for (const l of f.layers) {
        for (const row of l.pixels) {
          for (const c of row) if (c) set.add(c);
        }
      }
    }
    return [...set];
  }, [frames]);

  const aiStatus = useMemo<AIStatus>(() => {
    if (proposal?.visible) {
      return {
        text: `${(proposal.changes ?? []).length} changes pending`,
        dot: 'var(--amber)',
        kind: 'review',
        amber: true,
      };
    }
    return { text: 'ready', dot: 'var(--moss)', kind: 'idle', amber: false };
  }, [proposal]);

  const onCompose = (prompt: string) => {
    setCmdKOpen(false);
    setProposal({ visible: false, busy: true, prompt });
    setTimeout(() => {
      setProposal(makeProposal(prompt));
      setRightTab('layers');
    }, 700);
  };

  const acceptProposal = (which: number | 'all') => {
    void which;
    if (!proposal?.frame) { setProposal(null); return; }
    pushHistory();
    setFrames((fs) => {
      const next = fs.slice();
      next.splice(frameIdx + 1, 0, { ...proposal.frame!, id: `frame_${Date.now()}` });
      return next;
    });
    setSwatches((s) => (s.includes('#9bb070') ? s : [...s, '#9bb070']));
    setFrameIdx((i) => i + 1);
    setProposal(null);
  };

  const rejectProposal = () => setProposal(null);
  const refineProposal = () => { setCmdKOpen(true); };

  // Apply loaded project data and reset editing state (history, dirty flag).
  const applyProject = useCallback((newFrames: Frame[], w: number, h: number, name: string, projectSwatches?: string[]) => {
    setFrames(newFrames);
    setCanvasW(w);
    setCanvasH(h);
    setProjectName(name);
    if (projectSwatches?.length) setSwatches(projectSwatches);
    setFrameIdx(0);
    setActiveLayerIdx(0);
    setSelection(null);
    pastRef.current = [];
    futureRef.current = [];
    setDirty(false);
  }, []);

  const applySprJson = useCallback((json: string, fallbackName: string) => {
    const data = parseProject(json, fallbackName);
    applyProject(data.frames, data.w, data.h, data.name, data.swatches);
    return { w: data.w, h: data.h, frameCount: data.frames.length };
  }, [applyProject]);

  const openFile = async () => {
    try {
      let openedW = canvasW, openedH = canvasH, openedFrameCount = 1;

      if (!IS_TAURI) {
        // Browser: file picker + local decode. No FS path, so recents get ''.
        const file = await pickFile('.spr,.png');
        if (!file) return;
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'spr') {
          const meta = applySprJson(await file.text(), file.name);
          openedW = meta.w; openedH = meta.h; openedFrameCount = meta.frameCount;
        } else {
          const result = await decodePngInBrowser(file);
          openedW = result.w; openedH = result.h;
          applyProject([frameFromPackedPixels(result.w, result.h, result.pixels)], result.w, result.h, file.name);
        }
        pushRecent({ name: file.name, path: '', spec: `${openedW} × ${openedH} · ${openedFrameCount} frame${openedFrameCount !== 1 ? 's' : ''}`, timestamp: Date.now() });
        setRecentFiles(getRecents());
        enterEditor();
        return;
      }

      const selected = await openDialog({
        title: 'Open sprite',
        filters: [{ name: 'Images & sprites', extensions: ['png', 'spr'] }],
        multiple: false,
        directory: false,
      });
      if (!selected || typeof selected !== 'string') return;
      const ext = selected.split('.').pop()?.toLowerCase();
      const name = selected.split(/[/\\]/).pop() ?? 'unknown';
      if (ext === 'spr') {
        const json = await invoke<string>('read_sprite_file', { path: selected });
        const meta = applySprJson(json, name);
        openedW = meta.w; openedH = meta.h; openedFrameCount = meta.frameCount;
        setCurrentFilePath(selected);
      } else {
        const result = await invoke<{ w: number; h: number; pixels: number[] }>('import_png', { path: selected });
        openedW = result.w; openedH = result.h;
        applyProject([frameFromPackedPixels(result.w, result.h, result.pixels)], result.w, result.h, name);
        setCurrentFilePath(null);
      }
      pushRecent({ name, path: selected, spec: `${openedW} × ${openedH} · ${openedFrameCount} frame${openedFrameCount !== 1 ? 's' : ''}`, timestamp: Date.now() });
      setRecentFiles(getRecents());
      enterEditor();
    } catch (e) {
      console.error('openFile failed', e);
      window.alert(e instanceof Error ? e.message : 'Could not open that file.');
    }
  };

  const openRecent = async (file: RecentFile) => {
    if (!file.path || !IS_TAURI) {
      enterEditor();
      return;
    }
    try {
      const ext = file.path.split('.').pop()?.toLowerCase();
      if (ext === 'spr') {
        const json = await invoke<string>('read_sprite_file', { path: file.path });
        applySprJson(json, file.name);
        setCurrentFilePath(file.path);
      } else {
        const result = await invoke<{ w: number; h: number; pixels: number[] }>('import_png', { path: file.path });
        applyProject([frameFromPackedPixels(result.w, result.h, result.pixels)], result.w, result.h, file.name);
        setCurrentFilePath(null);
      }
      pushRecent({ name: file.name, path: file.path, spec: file.spec, timestamp: Date.now() });
      setRecentFiles(getRecents());
      enterEditor();
    } catch (e) {
      console.error('openRecent failed', e);
      window.alert(e instanceof Error ? e.message : 'Could not reopen that file.');
      enterEditor();
    }
  };

  // ── Composite a single frame (all visible layers) → flat RGBA bytes ────────
  const compositeFrame = useCallback((frameData: Frame): number[] => {
    return compositeSpriteFrame(frameData, canvasW, canvasH);
  }, [canvasW, canvasH]);

  // ── Save / Save As ─────────────────────────────────────────────────────────
  const saveFile = useCallback(async (forceSaveAs = false) => {
    try {
      if (!IS_TAURI) {
        // Browser: download the .spr as a file.
        const name = projectName.endsWith('.spr') ? projectName : projectName + '.spr';
        downloadText(serializeProject({ w: canvasW, h: canvasH, name, frames, swatches }), name);
        setDirty(false);
        return;
      }
      let path = currentFilePath;
      if (!path || forceSaveAs) {
        const defaultName = projectName.endsWith('.spr') ? projectName : projectName + '.spr';
        path = await saveDialog({
          title: forceSaveAs ? 'Save sprite as…' : 'Save sprite',
          filters: [{ name: 'Sprite', extensions: ['spr'] }],
          defaultPath: defaultName,
        });
        if (!path) return;
        if (!path.endsWith('.spr')) path += '.spr';
      }
      const name = path.split(/[/\\]/).pop() ?? projectName;
      await invoke('write_sprite_file', { path, content: serializeProject({ w: canvasW, h: canvasH, name, frames, swatches }) });
      setCurrentFilePath(path);
      setProjectName(name);
      setDirty(false);
      pushRecent({ name, path, spec: `${canvasW} × ${canvasH} · ${frames.length} frame${frames.length !== 1 ? 's' : ''}`, timestamp: Date.now() });
      setRecentFiles(getRecents());
    } catch (err) {
      console.error('saveFile failed', err);
      window.alert(err instanceof Error ? err.message : 'Could not save the project.');
    }
  }, [currentFilePath, projectName, canvasW, canvasH, frames, swatches]);

  // ── Export PNG (current frame, composited) ─────────────────────────────────
  const exportPng = useCallback(async (scale = 1) => {
    try {
      const stem = projectName.replace(/\.spr$/i, '');
      const suffix = frames.length > 1 ? `_f${frameIdx + 1}` : '';
      const defaultName = stem + suffix + '.png';
      const pixels = compositeFrame(frames[frameIdx]);
      if (!IS_TAURI) {
        const bytes = await encodePngInBrowser(pixels, canvasW, canvasH, scale);
        downloadBytes(bytes, defaultName, 'image/png');
        return;
      }
      const path = await saveDialog({
        title: 'Export as PNG',
        filters: [{ name: 'PNG Image', extensions: ['png'] }],
        defaultPath: defaultName,
      });
      if (!path) return;
      await invoke('export_png', { path, width: canvasW, height: canvasH, pixels, scale });
    } catch (err) {
      console.error('exportPng failed', err);
      window.alert(err instanceof Error ? err.message : 'Could not export the PNG.');
    }
  }, [projectName, frames, frameIdx, canvasW, canvasH, compositeFrame]);

  // ── Export animated GIF (all frames, per-frame durations) ─────────────────
  const exportGif = useCallback(async (scale = 1) => {
    try {
      if (!IS_TAURI) {
        window.alert('Animated GIF export requires the Sindri desktop app.');
        return;
      }
      const stem = projectName.replace(/\.spr$/i, '');
      const path = await saveDialog({
        title: 'Export as animated GIF',
        filters: [{ name: 'GIF Image', extensions: ['gif'] }],
        defaultPath: stem + '.gif',
      });
      if (!path) return;
      const framePixels = frames.map((f) => compositeFrame(f));
      const delays = frames.map((f) => f.duration ?? 120);
      await invoke('export_gif', { path, frames: framePixels, width: canvasW, height: canvasH, delaysMs: delays, scale });
    } catch (err) {
      console.error('exportGif failed', err);
      window.alert(err instanceof Error ? err.message : 'Could not export the animated GIF.');
    }
  }, [projectName, frames, canvasW, canvasH, compositeFrame]);

  // ── Export sprite sheet (grid layout, configurable columns) ────────────────
  const exportSpriteSheet = useCallback(async (scale = 1, columns?: number) => {
    try {
      const stem = projectName.replace(/\.spr$/i, '');
      const sheet = buildSpriteSheet(frames, canvasW, canvasH, columns ?? frames.length);
      if (!IS_TAURI) {
        const bytes = await encodePngInBrowser(sheet.pixels, sheet.width, sheet.height, scale);
        downloadBytes(bytes, stem + '_sheet.png', 'image/png');
        return;
      }
      const path = await saveDialog({
        title: 'Export sprite sheet',
        filters: [{ name: 'PNG Image', extensions: ['png'] }],
        defaultPath: stem + '_sheet.png',
      });
      if (!path) return;
      await invoke('export_png', { path, width: sheet.width, height: sheet.height, pixels: sheet.pixels, scale });
    } catch (err) {
      console.error('exportSpriteSheet failed', err);
      window.alert(err instanceof Error ? err.message : 'Could not export the sprite sheet.');
    }
  }, [projectName, frames, canvasW, canvasH]);

  // ── Export modal dispatch ──────────────────────────────────────────────────
  const [exportModalFor, setExportModalFor] = useState<ExportFormat | null>(null);

  const runExport = useCallback((format: ExportFormat, scale: number, columns: number) => {
    if (format === 'png') void exportPng(scale);
    else if (format === 'gif') void exportGif(scale);
    else void exportSpriteSheet(scale, columns);
  }, [exportPng, exportGif, exportSpriteSheet]);

  // ── Autosave (crash recovery) ──────────────────────────────────────────────
  useEffect(() => {
    if (appStage !== 'editor') return;
    const id = setTimeout(() => {
      writeAutosave({
        savedAt: Date.now(),
        projectName,
        path: currentFilePath,
        w: canvasW,
        h: canvasH,
        frames,
        swatches,
        dirty,
      });
    }, 1200);
    return () => clearTimeout(id);
  }, [appStage, frames, canvasW, canvasH, projectName, swatches, currentFilePath, dirty]);

  const [recovery, setRecovery] = useState<AutosaveSnapshot | null>(() => {
    const snap = readAutosave();
    return snap && snap.dirty ? snap : null;
  });

  const recoverAutosave = useCallback(() => {
    if (!recovery) return;
    applyProject(recovery.frames as Frame[], recovery.w, recovery.h, recovery.projectName);
    setSwatches(recovery.swatches ?? SWATCHES);
    setCurrentFilePath(recovery.path);
    setDirty(true); // recovered work is unsaved by definition
    setRecovery(null);
    enterEditor();
  }, [recovery, applyProject]);

  const discardAutosave = useCallback(() => {
    clearAutosave();
    setRecovery(null);
  }, []);

  // ── Context menu builders ─────────────────────────────────────────────────
  const openCanvasContextMenu = useCallback((x: number, y: number) => {
    const hasSel = !!selection;
    const hasClip = !!clipboard;
    const items: ContextItem[] = [
      { type: 'action', id: 'ctx-select-all',   label: 'Select All',         shortcut: '⌘A' },
      { type: 'action', id: 'ctx-deselect',     label: 'Deselect',           disabled: !hasSel },
      { type: 'separator' },
      { type: 'action', id: 'ctx-cut',          label: 'Cut',                shortcut: '⌘X', disabled: !hasSel },
      { type: 'action', id: 'ctx-copy',         label: 'Copy',               shortcut: '⌘C', disabled: !hasSel },
      { type: 'action', id: 'ctx-paste',        label: 'Paste',              shortcut: '⌘V', disabled: !hasClip },
      { type: 'action', id: 'ctx-delete',       label: 'Delete',             shortcut: '⌫',  disabled: !hasSel, danger: true },
      { type: 'separator' },
      { type: 'action', id: 'ctx-clear-layer',  label: 'Clear layer',        danger: true },
      { type: 'separator' },
      { type: 'action', id: 'ctx-flip-h',       label: hasSel ? 'Flip selection horizontal' : 'Flip horizontal' },
      { type: 'action', id: 'ctx-flip-v',       label: hasSel ? 'Flip selection vertical' : 'Flip vertical' },
      { type: 'action', id: 'ctx-rotate-cw',    label: hasSel ? 'Rotate selection 90° CW' : 'Rotate canvas 90° CW' },
      { type: 'action', id: 'ctx-rotate-ccw',   label: hasSel ? 'Rotate selection 90° CCW' : 'Rotate canvas 90° CCW' },
    ];
    setContextMenu({ x, y, items });
  }, [selection, clipboard]);

  const openLayerContextMenu = useCallback((idx: number, x: number, y: number) => {
    const layer = frames[frameIdx]?.layers[idx];
    if (!layer) return;
    const layerCount = frames[frameIdx]?.layers.length ?? 1;
    const items: ContextItem[] = [
      { type: 'action', id: `ctx-layer-rename:${idx}`,    label: 'Rename…' },
      { type: 'action', id: `ctx-layer-dup:${idx}`,       label: 'Duplicate layer' },
      { type: 'separator' },
      { type: 'action', id: `ctx-layer-up:${idx}`,        label: 'Move up',    disabled: idx >= layerCount - 1 },
      { type: 'action', id: `ctx-layer-down:${idx}`,      label: 'Move down',  disabled: idx <= 0 },
      { type: 'separator' },
      { type: 'action', id: `ctx-layer-merge:${idx}`,     label: 'Merge down', disabled: idx <= 0 },
      { type: 'separator' },
      { type: 'action', id: `ctx-layer-delete:${idx}`,    label: 'Delete layer', disabled: layerCount <= 1, danger: true },
    ];
    setContextMenu({ x, y, items });
  }, [frames, frameIdx]);

  const openFrameContextMenu = useCallback((idx: number, x: number, y: number) => {
    const items: ContextItem[] = [
      { type: 'action', id: `ctx-frame-dup:${idx}`,        label: 'Duplicate frame' },
      { type: 'action', id: `ctx-frame-insert-before:${idx}`, label: 'Insert frame before' },
      { type: 'action', id: `ctx-frame-insert-after:${idx}`,  label: 'Insert frame after' },
      { type: 'separator' },
      { type: 'action', id: `ctx-frame-move-left:${idx}`,  label: 'Move frame left',  disabled: idx <= 0 },
      { type: 'action', id: `ctx-frame-move-right:${idx}`, label: 'Move frame right', disabled: idx >= frames.length - 1 },
      { type: 'separator' },
      { type: 'action', id: `ctx-frame-delete:${idx}`,     label: 'Delete frame', disabled: frames.length <= 1, danger: true },
    ];
    setContextMenu({ x, y, items });
  }, [frames.length]);

  const openSwatchContextMenu = useCallback((swatchColor: string, x: number, y: number) => {
    const items: ContextItem[] = [
      { type: 'action', id: `ctx-swatch-use:${swatchColor}`,    label: 'Use this color' },
      { type: 'action', id: `ctx-swatch-copy:${swatchColor}`,   label: 'Copy hex' },
      { type: 'separator' },
      { type: 'action', id: `ctx-swatch-remove:${swatchColor}`, label: 'Remove from palette', danger: true },
    ];
    setContextMenu({ x, y, items });
  }, []);

  const handleContextAction = useCallback((id: string) => {
    closeContextMenu();
    if (id === 'ctx-select-all')   { selectAll(); return; }
    if (id === 'ctx-deselect')     { setSelection(null); return; }
    if (id === 'ctx-cut')          { cutSelection(); return; }
    if (id === 'ctx-copy')         { copySelection(); return; }
    if (id === 'ctx-paste')        { pasteClipboard(); return; }
    if (id === 'ctx-delete')       { deleteSelection(); return; }
    if (id === 'ctx-clear-layer')  { clearLayer(); return; }
    if (id === 'ctx-flip-h')       { flipH(); return; }
    if (id === 'ctx-flip-v')       { flipV(); return; }
    if (id === 'ctx-rotate-cw')    { rotate90(true); return; }
    if (id === 'ctx-rotate-ccw')   { rotate90(false); return; }

    if (id.startsWith('ctx-layer-rename:')) {
      const idx = parseInt(id.split(':')[1]);
      // Trigger rename by selecting the layer first, then simulating double-click
      // We just set active layer — the user can double-click to rename from layers panel
      // Instead, emit a special rename event via a small trick: post to RightPane
      setActiveLayerIdx(idx);
      // We can't directly trigger rename UI from here; use a ref-based approach
      // For now, open a browser prompt as fallback
      const current = frames[frameIdx]?.layers[idx]?.name ?? '';
      const name = window.prompt('Rename layer:', current);
      if (name && name.trim()) renameLayer(idx, name.trim());
      return;
    }
    if (id.startsWith('ctx-layer-dup:'))    { duplicateLayer(parseInt(id.split(':')[1])); return; }
    if (id.startsWith('ctx-layer-up:'))     { moveLayerUp(parseInt(id.split(':')[1])); return; }
    if (id.startsWith('ctx-layer-down:'))   { moveLayerDown(parseInt(id.split(':')[1])); return; }
    if (id.startsWith('ctx-layer-merge:'))  {
      setActiveLayerIdx(parseInt(id.split(':')[1]));
      mergeDown();
      return;
    }
    if (id.startsWith('ctx-layer-delete:')) { deleteLayer(parseInt(id.split(':')[1])); return; }

    if (id.startsWith('ctx-frame-dup:'))           { duplicateFrame(parseInt(id.split(':')[1])); return; }
    if (id.startsWith('ctx-frame-insert-before:')) { insertFrameAt(parseInt(id.split(':')[1])); return; }
    if (id.startsWith('ctx-frame-insert-after:'))  { insertFrameAt(parseInt(id.split(':')[1]) + 1); return; }
    if (id.startsWith('ctx-frame-move-left:'))     { const i = parseInt(id.split(':')[1]); moveFrame(i, i - 1); return; }
    if (id.startsWith('ctx-frame-move-right:'))    { const i = parseInt(id.split(':')[1]); moveFrame(i, i + 1); return; }
    if (id.startsWith('ctx-frame-delete:'))        { deleteFrame(parseInt(id.split(':')[1])); return; }

    if (id.startsWith('ctx-swatch-use:'))    { setColor(id.slice('ctx-swatch-use:'.length)); return; }
    if (id.startsWith('ctx-swatch-copy:'))   {
      void navigator.clipboard.writeText(id.slice('ctx-swatch-copy:'.length));
      return;
    }
    if (id.startsWith('ctx-swatch-remove:')) {
      const col = id.slice('ctx-swatch-remove:'.length);
      setSwatches((s) => s.filter((c) => c !== col));
      return;
    }
  }, [closeContextMenu, selectAll, cutSelection, copySelection, pasteClipboard, deleteSelection, clearLayer, flipH, flipV, rotate90, frames, frameIdx, renameLayer, duplicateLayer, moveLayerUp, moveLayerDown, mergeDown, deleteLayer, duplicateFrame, insertFrameAt, moveFrame, deleteFrame]);

  // ── Global keyboard shortcuts ──────────────────────────────────────────────
  // Placed here so saveFile / exportPng / openFile are already in scope.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      const meta = e.metaKey || e.ctrlKey;

      // Meta / Ctrl shortcuts
      if (meta) {
        const k = e.key.toLowerCase();
        if (k === 'k') { e.preventDefault(); setCmdKOpen(true); return; }
        if (k === 's') { e.preventDefault(); void saveFile(e.shiftKey); return; }
        if (k === 'e' && !e.shiftKey) { e.preventDefault(); setExportModalFor('png'); return; }
        if (k === 'e' &&  e.shiftKey) { e.preventDefault(); setExportModalFor('gif'); return; }
        if (k === '/')                { e.preventDefault(); setShortcutsOpen(true); return; }
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if (k === 'z' &&  e.shiftKey) { e.preventDefault(); redo(); return; }
        if (k === 'a' && !e.shiftKey) { e.preventDefault(); selectAll(); return; }
        if (k === 'c' && !e.shiftKey) { e.preventDefault(); copySelection(); return; }
        if (k === 'x' && !e.shiftKey) { e.preventDefault(); cutSelection(); return; }
        if (k === 'v' && !e.shiftKey) { e.preventDefault(); pasteClipboard(); return; }
        if (k === 'n') { e.preventDefault(); setNewProjectFor({}); return; }
        if (k === 'o' && !e.shiftKey) { e.preventDefault(); void openFile(); return; }
        if (k === 'i') { e.preventDefault(); void openFile(); return; }
        if (k === '+' || k === '=') { e.preventDefault(); setZoomIdx((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1)); return; }
        if (k === '-') { e.preventDefault(); setZoomIdx((i) => Math.max(0, i - 1)); return; }
        if (k === '0') {
          e.preventDefault();
          const vw = Math.max(100, window.innerWidth - 660);
          const vh = Math.max(100, window.innerHeight - 360);
          const fit = Math.floor(Math.min(vw / canvasW, vh / canvasH));
          setZoomIdx(ZOOM_LEVELS.reduce((best, z, i) => (z <= fit ? i : best), 0));
          return;
        }
        if (k === '1') { e.preventDefault(); setZoomIdx(0); return; }
        if (k === 'l' && e.shiftKey) { e.preventDefault(); setTweak('tutorialMode', 'library'); return; }
        return; // don't fall through to single-key tool shortcuts
      }

      // Single-key shortcuts
      if (e.key === 'Escape') { setSelection(null); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelection(); return; }
      if (e.key === ' ') { e.preventDefault(); setIsPlaying((p) => !p); return; }
      const key = e.key.toLowerCase();
      const map: Record<string, Tool> = {
        p: 'pencil', e: 'eraser', g: 'fill', i: 'picker',
        l: 'line', r: 'rect', c: 'circle', v: 'select',
        w: 'wand', a: 'lasso', m: 'move', h: 'pan',
      };
      if (map[key] && !e.shiftKey) setTool(map[key]);
      if (key === 'g' && e.shiftKey) setShowGrid((v) => !v);
      if (key === 'o' && e.shiftKey) setShowOnionSkin((v) => !v);
      if (key === 'a' && e.shiftKey) setShowAiGhost((v) => !v);
      if (e.key === '[') setFrameIdx((i) => Math.max(0, i - 1));
      if (e.key === ']') setFrameIdx((i) => Math.min(frames.length - 1, i + 1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [frames.length, saveFile, exportPng, exportGif, undo, redo, openFile, selectAll, copySelection, cutSelection, pasteClipboard, deleteSelection]);

  const setTweak = (k: TweakKey, v: unknown) => {
    if (k === 'rightPaneStart') setRightTab(v as RightTab);
    if (k === 'showGrid') setShowGrid(v as boolean);
    if (k === 'showOnionSkin') setShowOnionSkin(v as boolean);
    if (k === 'showAiGhost') setShowAiGhost(v as boolean);
    if (k === 'density') setDensity(v as Density);
    if (k === 'showProposalLane') {
      if (v) setProposal(makeProposal('Add a damaged-burst frame to the drone idle so it has a death pose.'));
      else setProposal(null);
    }
    if (k === 'tutorialMode') {
      setTutorialMode(v as TutorialMode);
      if (v === 'playing' || v === 'authoring') setShowAIHint(false);
    }
  };

  if (appStage === 'loading') {
    return <LoadingScreen onDone={() => setAppStage('welcome')} />;
  }

  if (appStage === 'welcome') {
    return (
      <React.Fragment>
        <WelcomeScreen
          onEnter={enterEditor}
          onNewProject={(template) => setNewProjectFor(template || {})}
          onOpenFile={openFile}
          onOpenLessons={() => { enterEditor(); setTimeout(() => setTweak('tutorialMode', 'library'), 50); }}
          onComposeWithSindri={() => { enterEditor(); setTimeout(() => setCmdKOpen(true), 50); }}
          recentFrame={frames[0]}
          recentFiles={recentFiles}
          savedTemplates={savedTemplates}
          onOpenRecent={openRecent}
          recovery={recovery ? {
            name: recovery.projectName,
            savedAt: recovery.savedAt,
            spec: `${recovery.w} × ${recovery.h} · ${recovery.frames.length} frame${recovery.frames.length !== 1 ? 's' : ''}`,
          } : null}
          onRecover={recoverAutosave}
          onDiscardRecovery={discardAutosave}
        />
        <NewProjectModal
          open={!!newProjectFor}
          template={newProjectFor && 'id' in newProjectFor ? newProjectFor as TemplateConfig : null}
          onClose={() => setNewProjectFor(null)}
          onCreate={createSprite}
        />
      </React.Fragment>
    );
  }

  const ghostForViewport: { visible: boolean; frame: Frame; title: string } | null =
    showAiGhost && proposal?.visible && proposal.frame
      ? { visible: true, frame: proposal.frame, title: proposal.title ?? '' }
      : null;

  return (
    <div style={{ ...appStyles.root, ...(density === 'compact' ? appStyles.rootCompact : {}) }}>
      <div style={appStyles.topbar}>
        <Topbar
          onCmdK={() => setCmdKOpen(true)}
          onCompose={() => setCmdKOpen(true)}
          aiStatus={aiStatus}
          isPlaying={isPlaying}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onStop={() => { setIsPlaying(false); setFrameIdx(0); }}
          frameIdx={frameIdx}
          frameCount={frames.length}
          projectName={dirty ? `${projectName} •` : projectName}
          maximized={maximized}
          onMinimize={() => { if (IS_TAURI) void getCurrentWindow().minimize(); }}
          onToggleMax={() => { if (IS_TAURI) { void getCurrentWindow().toggleMaximize(); setMaximized((m) => !m); } }}
          onClose={() => { if (IS_TAURI) void getCurrentWindow().close(); }}
          onOpenLessons={() => setTweak('tutorialMode', 'library')}
          onOpenMenu={(rect: DOMRect) => setAppMenu({ anchorRect: rect, tab: 'file' })}

          menuOpen={!!appMenu}
        />
      </div>

      <div style={appStyles.left}>
        {tutorialMode === 'authoring' ? (
          <BuilderStepList
            lesson={draftLesson}
            selectedIdx={builderStepIdx}
            onSelect={setBuilderStepIdx}
            onAdd={(kind) => {
              const newStep = {
                id: 's' + Date.now(),
                kind,
                title: 'New step',
                goalSummary: '',
                instruction: '',
                hint: '',
                spotlightTarget: 'canvas' as const,
                highlightRegion: null,
                validation: { type: 'tool_used' as const, requiredTool: 'pencil' as Tool },
                allowedTools: [] as Tool[],
                hasExampleArt: false,
              };
              const next: BuilderLesson = { ...draftLesson, steps: [...draftLesson.steps, newStep] };
              setDraftLesson(next);
              setBuilderStepIdx(next.steps.length - 1);
            }}
          />
        ) : (
          <ToolsPane
            tool={tool} onToolChange={setTool}
            helper={helper} onHelperChange={(h) => setHelper(h as ViewHelper)}
            modifiers={modifiers}
            onModifierToggle={(k) => { if (k === 'tile') setModifiers((m) => ({ ...m, tile: !m.tile })); }}
            onSymmetryChange={(mode: SymmetryMode) => setModifiers((m) => ({ ...m, symmetry: mode }))}
            toolOptions={toolOptions} onToolOptionChange={(k, v) => setToolOptions((o) => ({ ...o, [k]: v }))}
            activeTab={leftTab} onTabChange={setLeftTab}
          />
        )}
      </div>

      <div style={{ ...appStyles.center, position: 'relative' }} ref={canvasShellRef}>
        {tutorialMode === 'authoring' && (
          <TutorialBuilderRibbon
            onExit={() => setTweak('tutorialMode', 'off')}
            onPreview={() => setTweak('tutorialMode', 'playing')}
          />
        )}
        <CanvasView
          frames={frames} frameIdx={frameIdx} activeLayerIdx={activeLayerIdx}
          tool={tool} color={color} toolOptions={toolOptions} modifiers={modifiers} helper={helper}
          showGrid={showGrid} showOnionSkin={showOnionSkin}
          ghost={ghostForViewport}
          onPixelsChange={updateActiveLayerPixels}
          onCursorChange={setCursor}
          onColorPick={setColor}
          onAcceptGhost={() => acceptProposal('all' as const)}
          onRejectGhost={rejectProposal}
          onRefineGhost={refineProposal}
          activeTab={centerTab} onTabChange={setCenterTab}
          isPlaying={isPlaying}
          zoomIdx={zoomIdx} onZoomChange={setZoomIdx}
          canvasW={canvasW} canvasH={canvasH}
          onStrokeBegin={pushHistory}
          selection={selection} onSelectionChange={setSelection}
          onContextMenu={openCanvasContextMenu}
        />
        <Timeline
          frames={frames} frameIdx={frameIdx}
          onSelect={setFrameIdx} onAdd={addFrame} onDuplicate={duplicateFrame} onDelete={deleteFrame}
          showOnionSkin={showOnionSkin} onToggleOnionSkin={() => setShowOnionSkin((v) => !v)}
          ghostFrame={showAiGhost && proposal?.visible ? proposal.frame ?? null : null}
          isPlaying={isPlaying}
          onFrameContextMenu={openFrameContextMenu}
        />
        {tutorialMode === 'playing' && spotlightRect && (
          <TutorialSpotlight
            targetRect={spotlightRect}
            callout={{
              stepIdx: lessonStepIdx,
              text: ([
                'Pick the pencil from the toolbar (P), then pick any dark ink from the palette.',
                'Draw a closed outline inside the highlighted region.',
                'Switch to fill (G), then click inside the closed cap outline.',
              ] as string[])[lessonStepIdx] || '',
            }}
          />
        )}
      </div>

      <div style={{ ...appStyles.right, position: 'relative', zIndex: tutorialMode === 'playing' ? 60 : 'auto' }}>
        {tutorialMode === 'playing' ? (
          <TutorialPlayerLane
            lesson={activeLesson} stepIdx={lessonStepIdx}
            onPrev={() => setLessonStepIdx((i) => Math.max(0, i - 1))}
            onNext={() => {
              if (lessonStepIdx >= activeLesson.steps - 1) setTweak('tutorialMode', 'off');
              else setLessonStepIdx((i) => i + 1);
            }}
            onExit={() => setTweak('tutorialMode', 'off')}
            onShowHint={() => setShowHint((v) => !v)}
            onAskAI={() => setShowAIHint((v) => !v)}
            hintVisible={showHint}
            aiHintVisible={showAIHint}
          />
        ) : tutorialMode === 'authoring' ? (
          <BuilderStepForm
            lesson={draftLesson}
            step={draftLesson.steps[builderStepIdx]}
            stepIdx={builderStepIdx}
            onChange={(updated) => {
              const next: BuilderLesson = {
                ...draftLesson,
                steps: draftLesson.steps.map((s, i) => i === builderStepIdx ? updated : s),
              };
              setDraftLesson(next);
            }}
            onCaptureRegion={() => {}}
            onClearRegion={() => {
              const updated = { ...draftLesson.steps[builderStepIdx], highlightRegion: null };
              const next: BuilderLesson = {
                ...draftLesson,
                steps: draftLesson.steps.map((s, i) => i === builderStepIdx ? updated : s),
              };
              setDraftLesson(next);
            }}
            onPlayTest={() => {
              setActiveLesson({ ...draftLesson, steps: draftLesson.steps.length } as unknown as TutorialLesson);
              setLessonStepIdx(builderStepIdx);
              setTweak('tutorialMode', 'playing');
            }}
            onAskAI={() => setCmdKOpen(true)}
          />
        ) : (
          <RightPane
            activeTab={rightTab} onTabChange={setRightTab}
            frame={frames[frameIdx]} activeLayerIdx={activeLayerIdx} onSelectLayer={setActiveLayerIdx}
            onAddLayer={addLayer} onDeleteLayer={deleteLayer}
            onToggleLayerVisible={toggleLayerVisible} onSetLayerOpacity={setLayerOpacity} onMergeDown={mergeDown}
            onRenameLayer={renameLayer} onLayerContextMenu={openLayerContextMenu}
            color={color} onColorChange={setColor}
            swatches={swatches} onAddSwatch={addSwatch} onSwatchContextMenu={openSwatchContextMenu}
            usedColors={usedColors}
            frameIdx={frameIdx} frameCount={frames.length}
            frameDuration={frames[frameIdx]?.duration ?? 120} onSetFrameDuration={setFrameDuration}
            onApplyDurationToAll={applyDurationToAll}
            canvasW={canvasW} canvasH={canvasH}
            proposal={proposal}
            onAcceptProposal={acceptProposal}
            onRejectProposal={rejectProposal}
            onRefineProposal={refineProposal}
          />
        )}
      </div>

      <div style={appStyles.status}>
        <StatusBar
          aiStatus={aiStatus}
          cursor={cursor}
          canvasSize={{ w: canvasW, h: canvasH }}
          frameCount={frames.length}
          layerCount={frames[frameIdx]?.layers.length ?? 0}
          zoom={ZOOM_LEVELS[zoomIdx]}
        />
      </div>

      {cmdKOpen && <CmdK onClose={() => setCmdKOpen(false)} onCompose={onCompose} />}

      <AppMenu
        open={!!appMenu}
        anchorRect={appMenu?.anchorRect ?? null}
        initialTab={appMenu?.tab}
        recentFiles={recentFiles}
        onClose={() => setAppMenu(null)}
        onAction={(id: string) => {
          if      (id === 'new')            { setNewProjectFor({}); }
          else if (id === 'open')           void openFile();
          else if (id === 'import')         void openFile();
          else if (id === 'save')           void saveFile(false);
          else if (id === 'save-as')        void saveFile(true);
          else if (id === 'export-png')     setExportModalFor('png');
          else if (id === 'export-gif')     setExportModalFor('gif');
          else if (id === 'export-sheet')   setExportModalFor('sheet');
          else if (id === 'shortcuts')      setShortcutsOpen(true);
          else if (id === 'undo')           undo();
          else if (id === 'redo')           redo();
          else if (id === 'cut')            cutSelection();
          else if (id === 'copy')           copySelection();
          else if (id === 'paste')          pasteClipboard();
          else if (id === 'resize')         setResizeModalOpen(true);
          else if (id === 'crop') {
            if (selection) {
              const { x0, y0, x1, y1 } = selection;
              const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
              const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
              resizeCanvas(maxX - minX + 1, maxY - minY + 1, 'top-left');
            }
          }
          else if (id === 'flip-h')         flipH();
          else if (id === 'flip-v')         flipV();
          else if (id === 'rotate-cw')      rotate90(true);
          else if (id === 'rotate-ccw')     rotate90(false);
          else if (id === 'lessons')        setTweak('tutorialMode', 'library');
          else if (id === 'create-lesson')  setTweak('tutorialMode', 'authoring');
          else if (id === 'ask-sindri')     setCmdKOpen(true);
          else if (id === 'toggle-grid')    setTweak('showGrid', !showGrid);
          else if (id === 'toggle-onion')   setTweak('showOnionSkin', !showOnionSkin);
          else if (id === 'toggle-ghost')   setTweak('showAiGhost', !showAiGhost);
          else if (id === 'zoom-in')        setZoomIdx((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1));
          else if (id === 'zoom-out')       setZoomIdx((i) => Math.max(0, i - 1));
          else if (id === 'zoom-fit') {
            const vw = Math.max(100, window.innerWidth - 660);
            const vh = Math.max(100, window.innerHeight - 360);
            const fit = Math.floor(Math.min(vw / canvasW, vh / canvasH));
            setZoomIdx(ZOOM_LEVELS.reduce((best, z, i) => (z <= fit ? i : best), 0));
          }
          else if (id === 'zoom-actual')    setZoomIdx(0);
          else if (id.startsWith('recent:')) {
            const fileId = id.slice(7);
            const rf = recentFiles.find((f) => f.id === fileId);
            if (rf) void openRecent(rf);
          }
        }}
      />

      <TutorialLibrary
        open={tutorialMode === 'library'}
        onClose={() => setTweak('tutorialMode', 'off')}
        onStart={(lesson) => {
          setActiveLesson(lesson);
          setLessonStepIdx(0);
          setShowHint(false);
          setShowAIHint(false);
          setTweak('tutorialMode', 'playing');
        }}
        onAuthor={() => setTweak('tutorialMode', 'authoring')}
      />

      {/* New project modal — accessible from the editor via ⌘N */}
      <NewProjectModal
        open={!!newProjectFor && appStage === 'editor'}
        template={newProjectFor && 'id' in newProjectFor ? newProjectFor as TemplateConfig : null}
        onClose={() => setNewProjectFor(null)}
        onCreate={createSprite}
      />

      <ResizeCanvasModal
        open={resizeModalOpen}
        currentW={canvasW}
        currentH={canvasH}
        onClose={() => setResizeModalOpen(false)}
        onResize={resizeCanvas}
      />

      <ExportModal
        open={!!exportModalFor}
        format={exportModalFor ?? 'png'}
        frameCount={frames.length}
        canvasW={canvasW}
        canvasH={canvasH}
        onClose={() => setExportModalFor(null)}
        onExport={runExport}
      />

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onAction={handleContextAction}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}

export default App;
