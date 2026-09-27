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
import { TutorialLibrary, TutorialPlayerLane, TutorialSpotlight, type LibraryNotice, type LibraryTab } from './components/Tutorial';
import { MakerBar, MakerCourse, MakerPanel } from './components/maker/MakerPanel';
import { Confetti } from './components/Confetti';
import type { LessonPhase } from './components/Tutorial';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getRecents, pushRecent, getSavedTemplates, saveTemplate, readAutosave, writeAutosave, clearAutosave, getCompletedLessons, markLessonCompleted, readLessonDrafts, writeLessonDrafts, readImportedLessons, writeImportedLessons, getLessonAuthor, setLessonAuthor } from './lib/storage';
import type { RecentFile, SavedTemplate, AutosaveSnapshot } from './lib/storage';
import { IS_TAURI, downloadBytes, downloadText, pickFile, encodePngInBrowser, decodePngInBrowser } from './lib/platform';
import { parseProject, serializeProject } from './lib/project-format';
import { brushFromSelection } from './lib/drawing';
import {
  BUILTIN_LESSONS, copyDraft, draftToLesson, importLesson, readDrafts, readImported, shelveDraft, evaluateStep, newDraft, newStepId, recordStep, snapshotBefore, stepDone, toolName, touch,
  type CheckResult, type EditorState, type Lesson, type MakerContext, type MakerDraft, type MakerSnapshot,
} from './lib/lessons';
import { readPalette, recolor, writePalette, type PaletteFormat } from './lib/palette';
import { duplicateLinked, independentLayers, linkSize, linkToPrevious, propagateFrame, pruneLinks, unlinkLayer, writeLayerPixels } from './lib/cels';
import { clampTags, freshTagName, nextPlayFrame, tagSequence, tagsAfterDelete, tagsAfterInsert, tagsAfterMove, validateTags, type FrameTag } from './lib/tags';
import { gridSheet, sheetJson } from './lib/animation';
import { buildSpriteSheet, compositeFrame as compositeSpriteFrame, frameFromPackedPixels, compositeGrid } from './lib/sprite';
import { ImportAiArtDialog } from './components/import/ImportAiArtDialog';
import type { AiArtImportResult } from './components/import/ImportAiArtDialog';
import { imageToPackedPixels } from './lib/pixelReconstruction';

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
    gridTemplateRows: '56px minmax(0, 1fr) 28px',
    gridTemplateColumns: '260px 1fr 360px',
    gridTemplateAreas: '"topbar topbar topbar" "left center right" "status status status"',
    height: '100vh',
    width: '100vw',
    background: 'var(--paper)',
    color: 'var(--ink)',
    overflow: 'hidden',
  },
  rootCompact: {
    gridTemplateRows: '52px minmax(0, 1fr) 26px',
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

/** The largest zoom step at which a w×h canvas fits the editor viewport. */
function fitZoomIdx(w: number, h: number): number {
  const vw = Math.max(100, window.innerWidth - 660);
  const vh = Math.max(100, window.innerHeight - 360);
  const fit = Math.floor(Math.min(vw / w, vh / h));
  return ZOOM_LEVELS.reduce((best, z, i) => (z <= fit ? i : best), 0);
}

/** Everything a lesson replaces, kept aside so leaving it restores the
 *  learner's own sprite exactly: pixels, palette, history and view. */
interface LessonStash {
  frames: Frame[];
  w: number;
  h: number;
  swatches: string[];
  tags: FrameTag[];
  name: string;
  path: string | null;
  dirty: boolean;
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  frameIdx: number;
  layerIdx: number;
  onion: boolean;
  symmetry: Modifiers['symmetry'];
  zoomIdx: number;
}

interface HistorySnapshot {
  frames: Frame[];
  w: number;
  h: number;
  tags: FrameTag[];
  /** Set only by edits that change the palette too (recolour, palette
   *  import); undoing them restores it. Other steps leave the palette be. */
  swatches?: string[];
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
    { keys: '⌘B',   label: 'Use selection as brush' },
    { keys: 'Del',  label: 'Delete selection pixels' },
  ]},
  { title: 'Tools', rows: [
    { keys: 'P',  label: 'Pencil' },
    { keys: 'E',  label: 'Eraser' },
    { keys: 'D',  label: 'Shade (⇧ reverses)' },
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
          output · {outW} × {outH} px{format === 'gif' ? ` · ${frameCount} frames` : format === 'sheet' ? ` · ${frameCount} tiles + .json (frames, durations, tags)` : ''}
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
  const [tags, setTags] = useState<FrameTag[]>([]);
  // The tag whose frames playback loops over (null = every frame).
  const [playTagId, setPlayTagId] = useState<string | null>(null);
  const playStepRef = useRef(0);
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
  // Import AI art dialog
  const [aiImportOpen, setAiImportOpen] = useState(false);
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
    pixelPerfect: true,
    shadeMode: 'darken',
    brush: null,
    brushOwnColors: true,
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
    setTags([]);
    setPlayTagId(null);
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
  // ── Lessons ──
  // A lesson runs on its own canvas: the learner's sprite (and its undo
  // history) is put aside when it starts and restored when it ends.
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [lessonPhase, setLessonPhase] = useState<LessonPhase>('intro');
  const [lessonStepIdx, setLessonStepIdx] = useState(0);
  const [showLessonExample, setShowLessonExample] = useState(true);
  const [lessonNotice, setLessonNotice] = useState<string | null>(null);
  const [completedLessons, setCompletedLessons] = useState<string[]>(() => getCompletedLessons());
  // A play test from the builder returns to the builder, and isn't "done".
  const [lessonReturnTo, setLessonReturnTo] = useState<'off' | 'authoring'>('off');
  const lessonStashRef = useRef<LessonStash | null>(null);
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const pastRef = useRef<HistorySnapshot[]>([]);
  const futureRef = useRef<HistorySnapshot[]>([]);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);

  // ── Lesson maker ──
  // The draft being made, the selected card (-1 = start), and an in-progress
  // recording: the document and settings when Record was pressed.
  const [makerDraft, setMakerDraft] = useState<MakerDraft | null>(null);
  // The shelf: every lesson being made, and the lessons people shared.
  const [lessonDrafts, setLessonDrafts] = useState<MakerDraft[]>(() => readDrafts(readLessonDrafts()));
  const [importedLessons, setImportedLessons] = useState<Lesson[]>(() => readImported(readImportedLessons()));
  const [libraryTab, setLibraryTab] = useState<LibraryTab>('all');
  const [libraryNotice, setLibraryNotice] = useState<LibraryNotice | null>(null);
  const [freshLessonId, setFreshLessonId] = useState<string | null>(null);
  const [makerSel, setMakerSel] = useState(-1);
  const [makerRec, setMakerRec] = useState<{ before: MakerSnapshot; was: MakerContext; insertAt: number } | null>(null);
  const [makerStamped, setMakerStamped] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(0);
  // A maker's play test clears the draft only from step 1, with no skips.
  const playFromStartRef = useRef(false);
  const lessonSkippedRef = useRef(false);

  // ── History (undo / redo) ──────────────────────────────────────────────────
  // Snapshots capture frames AND canvas dimensions so undoing a resize/crop
  // restores a consistent grid. pushHistory is called just before setFrames.
  const [dirty, setDirty] = useState(false);

  const applySnapshot = useCallback((snap: HistorySnapshot) => {
    setFrames(snap.frames);
    setTags(snap.tags);
    if (snap.swatches) setSwatches(snap.swatches);
    setCanvasW(snap.w);
    setCanvasH(snap.h);
    setFrameIdx((i) => Math.max(0, Math.min(i, snap.frames.length - 1)));
    setActiveLayerIdx((i) => {
      const maxLayers = Math.max(...snap.frames.map((f) => f.layers.length));
      return Math.max(0, Math.min(i, maxLayers - 1));
    });
    setSelection(null);
  }, []);

  const pushHistory = useCallback((opts?: { swatches?: boolean }) => {
    pastRef.current = [...pastRef.current.slice(-49), { frames, w: canvasW, h: canvasH, tags, ...(opts?.swatches ? { swatches } : {}) }];
    futureRef.current = [];
    setDirty(true);
  }, [frames, canvasW, canvasH, tags, swatches]);

  const undo = useCallback(() => {
    if (!pastRef.current.length) return;
    const prev = pastRef.current[pastRef.current.length - 1];
    futureRef.current = [{ frames, w: canvasW, h: canvasH, tags, ...(prev.swatches ? { swatches } : {}) }, ...futureRef.current.slice(0, 49)];
    pastRef.current = pastRef.current.slice(0, -1);
    applySnapshot(prev);
  }, [frames, canvasW, canvasH, tags, swatches, applySnapshot]);

  const redo = useCallback(() => {
    if (!futureRef.current.length) return;
    const next = futureRef.current[0];
    pastRef.current = [...pastRef.current.slice(-49), { frames, w: canvasW, h: canvasH, tags, ...(next.swatches ? { swatches } : {}) }];
    futureRef.current = futureRef.current.slice(1);
    applySnapshot(next);
  }, [frames, canvasW, canvasH, tags, swatches, applySnapshot]);

  // Spotlight: the panel (or canvas area) the current lesson step is about.
  const lessonSpot = tutorialMode === 'playing' && activeLesson && lessonPhase === 'step'
    ? activeLesson.steps[lessonStepIdx] ?? null : null;
  useEffect(() => {
    const target = lessonSpot?.spotlight;
    if (!target) { setSpotlightRect(null); return; }
    if (target === 'palette' || target === 'layers') setRightTab(target);
    const measure = () => {
      if (target === 'canvas') {
        const shell = canvasShellRef.current;
        const board = shell?.querySelector('[data-spotlight="canvas-board"]');
        if (!shell || !board) return;
        const sb = shell.getBoundingClientRect();
        const bb = board.getBoundingClientRect();
        const scale = bb.width / canvasW;
        const r = lessonSpot?.region ?? { x: 0, y: 0, w: canvasW, h: canvasH };
        setSpotlightRect({
          scope: 'center',
          x: bb.left - sb.left + r.x * scale,
          y: bb.top - sb.top + r.y * scale,
          w: r.w * scale,
          h: r.h * scale,
          calloutSide: 'right',
        });
        return;
      }
      const el = document.querySelector(`[data-spotlight="${target}"]`);
      if (!el) { setSpotlightRect(null); return; }
      const r = el.getBoundingClientRect();
      setSpotlightRect({ scope: 'viewport', x: r.left, y: r.top, w: r.width, h: r.height, calloutSide: target === 'toolbar' ? 'right' : 'left' });
    };
    // Measure after the tab switch and layout settle.
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    if (canvasShellRef.current) ro.observe(canvasShellRef.current);
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [lessonSpot, canvasW, canvasH, zoomIdx]);

  const initialProposal: Proposal | null = TWEAKS.showProposalLane
    ? makeProposal('Add a damaged-burst frame to the drone idle so it has a death pose.')
    : null;
  const [proposal, setProposal] = useState<Proposal | null>(initialProposal);

  useEffect(() => {
    if (!isPlaying) return;
    if (centerTab !== 'editor') return;
    // Each frame holds for its own duration. With a tag chosen, playback
    // loops over its frames in its direction (a ping-pong passes most frames
    // twice, so the position in the cycle is tracked separately).
    const tag = tags.find((t) => t.id === playTagId) ?? null;
    const id = setTimeout(() => {
      const seq = tag ? tagSequence(tag) : null;
      const inCycle = seq ? seq[playStepRef.current % seq.length] === frameIdx : true;
      // If the frame changed underneath us (a click, a new tag), restart the
      // cycle from wherever the current frame first appears in it.
      const step = seq && !inCycle ? Math.max(-1, seq.indexOf(frameIdx)) : playStepRef.current;
      const next = nextPlayFrame(frames.length, tag, seq ? step : frameIdx);
      playStepRef.current = next.step;
      setFrameIdx(next.frame);
    }, frames[frameIdx]?.duration ?? 120);
    return () => clearTimeout(id);
  }, [isPlaying, frames, frameIdx, centerTab, tags, playTagId]);

  // Linked cels: the write reaches every layer sharing this one's drawing.
  const updateActiveLayerPixels = useCallback((newPixels: (string | null)[][]) => {
    setFrames((fs) => writeLayerPixels(fs, frameIdx, activeLayerIdx, newPixels));
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
        ...independentLayers([src])[0],
        id: `${src.id}_dup_${Date.now()}`,
        name: src.name + ' copy',
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
    setTags((t) => tagsAfterInsert(t, idx));
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
    setFrames((fs) => propagateFrame(fs.map((f, i) => (i !== frameIdx ? f : {
      ...f,
      layers: f.layers.map((l) => ({
        ...l,
        pixels: l.pixels.map((row) => row.slice().reverse()),
      })),
    })), frameIdx));
  }, [transformSelection, pushHistory, frameIdx]);

  const flipV = useCallback(() => {
    if (transformSelection((rx, ry, _w, h) => [rx, h - 1 - ry])) return;
    pushHistory();
    setFrames((fs) => propagateFrame(fs.map((f, i) => (i !== frameIdx ? f : {
      ...f,
      layers: f.layers.map((l) => ({
        ...l,
        pixels: l.pixels.slice().reverse(),
      })),
    })), frameIdx));
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
      return pruneLinks(next);
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
      // The merge belongs to this frame alone, so the result is unlinked.
      layers[activeLayerIdx - 1] = { ...independentLayers([bot])[0], pixels: merged };
      layers.splice(activeLayerIdx, 1);
      frame.layers = layers;
      next[frameIdx] = frame;
      return pruneLinks(next);
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
    setTags((t) => tagsAfterInsert(t, frameIdx + 1));
    setFrameIdx((i) => i + 1);
  };

  const duplicateFrame = (idx: number) => {
    pushHistory();
    setFrames((fs) => {
      const src = fs[idx];
      const copy: Frame = {
        id: `frame_${Date.now()}`,
        duration: src.duration,
        layers: independentLayers(src.layers).map((L) => ({ ...L, id: `${L.id}_${Date.now()}` })),
      };
      const next = fs.slice();
      next.splice(idx + 1, 0, copy);
      return next;
    });
    setTags((t) => tagsAfterInsert(t, idx + 1));
    setFrameIdx((i) => i + 1);
  };

  const deleteFrame = (idx: number) => {
    if (frames.length <= 1) return;
    pushHistory();
    setFrames((fs) => pruneLinks(fs.filter((_, i) => i !== idx)));
    setTags((t) => tagsAfterDelete(t, idx));
    setFrameIdx((i) => Math.max(0, Math.min(i, frames.length - 2)));
  };

  // ── Linked cels ────────────────────────────────────────────────────────────
  const duplicateLinkedFrame = (idx: number) => {
    pushHistory();
    const stamp = Date.now();
    setFrames((fs) => duplicateLinked(fs, idx, { frame: `frame_${stamp}`, layer: (k) => `f${stamp}_l${k}` }));
    setTags((t) => tagsAfterInsert(t, idx + 1));
    setFrameIdx(idx + 1);
  };

  const linkLayerToPrevious = (idx: number) => {
    pushHistory();
    setFrames((fs) => linkToPrevious(fs, idx, activeLayerIdx));
  };

  const unlinkLayerAt = (idx: number) => {
    pushHistory();
    setFrames((fs) => unlinkLayer(fs, idx, activeLayerIdx));
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
    setTags((t) => tagsAfterMove(t, from, to));
    setFrameIdx(to);
  }, [frames.length, pushHistory]);

  const addSwatch = () => {
    if (swatches.includes(color)) return;
    setSwatches((s) => [...s, color]);
  };

  // ── Lessons: start, leave, advance ─────────────────────────────────────────
  const startLesson = useCallback((lesson: Lesson, opts: { startAt?: number; returnTo?: 'off' | 'authoring'; keepCanvas?: boolean } = {}) => {
    if (!lessonStashRef.current) {
      lessonStashRef.current = {
        frames, w: canvasW, h: canvasH, swatches, tags, name: projectName, path: currentFilePath, dirty,
        past: pastRef.current, future: futureRef.current, frameIdx, layerIdx: activeLayerIdx,
        onion: showOnionSkin, symmetry: modifiers.symmetry, zoomIdx,
      };
    }
    if (!opts.keepCanvas) {
      const { w, h } = lesson.start;
      const start: Frame[] = lesson.start.frames?.length
        ? (JSON.parse(JSON.stringify(lesson.start.frames)) as Frame[]).map((f, i) => ({ ...f, id: `frame_${i}` }))
        : [{ id: 'frame_0', duration: 140, layers: [{ id: 'lesson_l0', name: 'layer 1', visible: true, opacity: 1, pixels: Array.from({ length: h }, () => Array(w).fill(null)) }] }];
      setFrames(start);
      setCanvasW(w);
      setCanvasH(h);
      setTags([]);
      setPlayTagId(null);
      if (lesson.start.swatches?.length) setSwatches(lesson.start.swatches);
      setProjectName(`${lesson.title}.spr`);
      setCurrentFilePath(null);
      setDirty(false);
      pastRef.current = [];
      futureRef.current = [];
      setFrameIdx(0);
      setActiveLayerIdx(0);
      setShowOnionSkin(false);
      setModifiers((m) => ({ ...m, symmetry: 'off' }));
      setZoomIdx(fitZoomIdx(w, h));
    }
    setSelection(null);
    setIsPlaying(false);
    // Lessons are about drawing: keep the colours in reach.
    setRightTab('palette');
    setActiveLesson(lesson);
    setLessonStepIdx(opts.startAt ?? 0);
    setLessonPhase(opts.startAt !== undefined ? 'step' : 'intro');
    setLessonNotice(null);
    setShowLessonExample(true);
    setLessonReturnTo(opts.returnTo ?? 'off');
    setTutorialMode('playing');
  }, [frames, canvasW, canvasH, swatches, tags, projectName, currentFilePath, dirty, frameIdx, activeLayerIdx, showOnionSkin, modifiers.symmetry, zoomIdx]);

  // Put the learner's sprite back (every way out of a lesson comes here).
  const restoreLessonStash = () => {
    const s = lessonStashRef.current;
    lessonStashRef.current = null;
    setActiveLesson(null);
    setIsPlaying(false);
    setLessonNotice(null);
    if (!s) return;
    setFrames(s.frames);
    setCanvasW(s.w);
    setCanvasH(s.h);
    setSwatches(s.swatches);
    setTags(s.tags);
    setPlayTagId(null);
    setProjectName(s.name);
    setCurrentFilePath(s.path);
    setDirty(s.dirty);
    pastRef.current = s.past;
    futureRef.current = s.future;
    setFrameIdx(Math.min(s.frameIdx, s.frames.length - 1));
    setActiveLayerIdx(s.layerIdx);
    setShowOnionSkin(s.onion);
    setModifiers((m) => ({ ...m, symmetry: s.symmetry }));
    setZoomIdx(s.zoomIdx);
    setSelection(null);
  };

  const exitLesson = () => {
    if (lessonReturnTo === 'authoring') {
      // Back to making: the maker's canvas, not the learner's sprite.
      setActiveLesson(null);
      setIsPlaying(false);
      setLessonNotice(null);
      if (makerDraft) loadDoc(snapshotBefore(makerDraft, makerSel + 1));
      setTutorialMode('authoring');
      return;
    }
    restoreLessonStash();
    setTutorialMode('off');
  };

  const lessonStep = activeLesson && lessonPhase === 'step' ? activeLesson.steps[lessonStepIdx] ?? null : null;

  // Live checks: what the current step asks, evaluated against the editor.
  const lessonResults = useMemo<CheckResult[]>(() => {
    if (!lessonStep) return [];
    const sprite = (f: Frame | undefined) => compositeGrid(f, canvasW, canvasH);
    const state: EditorState = {
      tool, color,
      frame: sprite(frames[frameIdx]),
      allFrames: lessonStep.checks.some((c) => c.type === 'maxColors') ? frames.map(sprite) : [],
      frameIndex: frameIdx,
      frameCount: frames.length,
      layerCount: frames[frameIdx]?.layers.length ?? 0,
      tagCount: tags.length,
      onion: showOnionSkin,
      symmetry: modifiers.symmetry,
      playing: isPlaying,
    };
    return evaluateStep(lessonStep, state);
  }, [lessonStep, tool, color, frames, frameIdx, canvasW, canvasH, tags.length, showOnionSkin, modifiers.symmetry, isPlaying]);
  const lessonStepComplete = stepDone(lessonResults);

  const advanceLesson = useCallback(() => {
    if (!activeLesson) return;
    if (lessonStepIdx < activeLesson.steps.length - 1) {
      setLessonStepIdx((i) => i + 1);
      return;
    }
    setLessonPhase('outro');
    setIsPlaying(false);
    if (lessonReturnTo === 'off') {
      markLessonCompleted(activeLesson.id);
      setCompletedLessons(getCompletedLessons());
      setConfetti((n) => n + 1);
    } else if (playFromStartRef.current && !lessonSkippedRef.current) {
      // The maker beat their own lesson: it's cleared (and shareable).
      setMakerDraft((d) => (d ? { ...d, cleared: true } : d));
      setConfetti((n) => n + 1);
    }
  }, [activeLesson, lessonStepIdx, lessonReturnTo]);

  // Advance by itself when a step's checks are met. Arriving at a step that
  // is already met moves on too (the learner already has the pencil), except
  // when they went back to it on purpose: then "Continue" is theirs to press.
  const lessonArmedRef = useRef(false);
  const lessonNavRef = useRef<'forward' | 'manual'>('forward');
  useEffect(() => {
    lessonArmedRef.current = lessonNavRef.current === 'forward' || !lessonStepComplete;
    lessonNavRef.current = 'forward';
    setLessonNotice(null);
    // Put the learner on a tool the step allows.
    if (lessonStep?.tools?.length && !lessonStep.tools.includes(tool)) setTool(lessonStep.tools[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonStepIdx, lessonPhase, activeLesson]);
  useEffect(() => {
    if (!lessonStepComplete) { lessonArmedRef.current = true; return; }
    if (!lessonArmedRef.current) return;
    const id = setTimeout(() => { lessonArmedRef.current = false; advanceLesson(); }, 900);
    return () => clearTimeout(id);
  }, [lessonStepComplete, advanceLesson]);

  // Tools a step doesn't use are refused with a word about which it does.
  const chooseTool = useCallback((t: Tool) => {
    const allowed = tutorialMode === 'playing' ? lessonStep?.tools : null;
    if (allowed?.length && !allowed.includes(t)) {
      setLessonNotice(`This step uses the ${allowed.map(toolName).join(' or ')}.`);
      return;
    }
    setLessonNotice(null);
    setTool(t);
  }, [tutorialMode, lessonStep]);

  // ── Lesson maker ───────────────────────────────────────────────────────────
  const snapshotDoc = (): MakerSnapshot => ({ frames, w: canvasW, h: canvasH, swatches, tags, frameIdx });
  const makerContext = (): MakerContext => ({ tool, color, onion: showOnionSkin, symmetry: modifiers.symmetry });

  // Show a document on the canvas (a step's result, the start…). Undo starts
  // fresh: history shouldn't reach across steps.
  function loadDoc(d: MakerSnapshot) {
    if (d.w !== canvasW || d.h !== canvasH) setZoomIdx(fitZoomIdx(d.w, d.h));
    setFrames(d.frames);
    setCanvasW(d.w);
    setCanvasH(d.h);
    setSwatches(d.swatches);
    setTags(d.tags);
    setPlayTagId(null);
    setFrameIdx(Math.min(d.frameIdx, d.frames.length - 1));
    setActiveLayerIdx(0);
    setSelection(null);
    pastRef.current = [];
    futureRef.current = [];
  }

  const blankDoc = (w: number, h: number, palette: string[]): MakerSnapshot => ({
    frames: [{ id: 'frame_0', duration: 140, layers: [{ id: 'l0', name: 'layer 1', visible: true, opacity: 1, pixels: Array.from({ length: h }, () => Array(w).fill(null)) }] }],
    w, h, swatches: palette, tags: [], frameIdx: 0,
  });

  // Making happens on its own canvas: the sprite is put aside, as in a lesson.
  function enterMaker(open?: MakerDraft) {
    if (!lessonStashRef.current) {
      lessonStashRef.current = {
        frames, w: canvasW, h: canvasH, swatches, tags, name: projectName, path: currentFilePath, dirty,
        past: pastRef.current, future: futureRef.current, frameIdx, layerIdx: activeLayerIdx,
        onion: showOnionSkin, symmetry: modifiers.symmetry, zoomIdx,
      };
    }
    // A draft from the shelf, or a fresh one (it joins the shelf once it has
    // a step or a name).
    const draft = open ?? newDraft(blankDoc(16, 16, swatches), getLessonAuthor() || 'Anonymous');
    setMakerDraft(draft);
    setMakerRec(null);
    const sel = draft.steps.length - 1;
    setMakerSel(sel);
    loadDoc(snapshotBefore(draft, sel + 1));
    setProjectName(`${draft.title}.spr`);
    setCurrentFilePath(null);
    setIsPlaying(false);
    setRightTab('palette');
    setTutorialMode('authoring');
  }

  const updateDraft = (patch: Partial<MakerDraft>) => {
    // The name signs this person's next lessons too.
    if (patch.author !== undefined) setLessonAuthor(patch.author.trim());
    setMakerDraft((d) => (d ? touch(d, patch) : d));
  };

  const makerActions = {
    select: (i: number) => {
      if (!makerDraft || makerRec) return;
      setMakerSel(i);
      loadDoc(snapshotBefore(makerDraft, i + 1));
    },
    record: () => {
      if (!makerDraft) return;
      setIsPlaying(false);
      setMakerRec({ before: snapshotDoc(), was: makerContext(), insertAt: makerSel + 1 });
    },
    done: () => {
      if (!makerDraft || !makerRec) return;
      const after = snapshotDoc();
      const r = recordStep(makerRec.before, after, makerRec.was, makerContext());
      const step = { id: newStepId(), ...r, after };
      const steps = [...makerDraft.steps];
      steps.splice(makerRec.insertAt, 0, step);
      updateDraft({ steps });
      setMakerSel(makerRec.insertAt);
      setMakerStamped(step.id);
      setMakerRec(null);
    },
    cancel: () => {
      if (!makerRec) return;
      loadDoc(makerRec.before);
      setMakerRec(null);
    },
    play: (from: number) => {
      if (!makerDraft?.steps.length) return;
      playFromStartRef.current = from === 0;
      lessonSkippedRef.current = false;
      startLesson(draftToLesson(makerDraft, from), { startAt: from, returnTo: 'authoring' });
    },
    changeStep: (i: number, patch: Partial<MakerDraft['steps'][number]>) => {
      if (!makerDraft) return;
      updateDraft({ steps: makerDraft.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
    },
    moveStep: (from: number, to: number) => {
      if (!makerDraft) return;
      const steps = [...makerDraft.steps];
      const [moved] = steps.splice(from, 1);
      steps.splice(to, 0, moved);
      updateDraft({ steps });
      setMakerSel(to);
    },
    deleteStep: (i: number) => {
      if (!makerDraft) return;
      const steps = makerDraft.steps.filter((_, k) => k !== i);
      updateDraft({ steps });
      const sel = Math.min(i, steps.length - 1);
      setMakerSel(sel);
      loadDoc(snapshotBefore({ ...makerDraft, steps }, sel + 1));
    },
    // Use the canvas as it is now as this step's result, and re-suggest its
    // goals, keeping the author's wording.
    recapture: (i: number) => {
      if (!makerDraft) return;
      const step = makerDraft.steps[i];
      const r = recordStep(snapshotBefore(makerDraft, i), snapshotDoc(), makerContext(), makerContext());
      makerActions.changeStep(i, { checks: r.checks.length ? r.checks : step.checks, region: r.region, example: r.example, tools: r.tools ?? step.tools, spotlight: r.spotlight ?? step.spotlight, after: snapshotDoc() });
      setMakerStamped(step.id);
    },
    regionFromSelection: (i: number) => {
      if (!selection) return;
      const x = Math.min(selection.x0, selection.x1);
      const y = Math.min(selection.y0, selection.y1);
      makerActions.changeStep(i, { region: { x, y, w: Math.abs(selection.x1 - selection.x0) + 1, h: Math.abs(selection.y1 - selection.y0) + 1 }, spotlight: 'canvas' });
      setSelection(null);
    },
    startCanvas: (kind: 'blank16' | 'blank32' | 'mine') => {
      if (!makerDraft) return;
      const mine = lessonStashRef.current;
      const start = kind === 'mine' && mine
        ? { frames: mine.frames, w: mine.w, h: mine.h, swatches: mine.swatches, tags: [], frameIdx: 0 }
        : blankDoc(kind === 'blank32' ? 32 : 16, kind === 'blank32' ? 32 : 16, swatches);
      updateDraft({ start });
      loadDoc(start);
    },
    exportLesson: async () => {
      if (!makerDraft?.cleared) return;
      const lesson = draftToLesson(makerDraft);
      const file = `${makerDraft.title.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'lesson'}.sindri-lesson`;
      const content = JSON.stringify(lesson);
      try {
        if (!IS_TAURI) { downloadText(content, file); return; }
        const path = await saveDialog({ title: 'Share lesson', filters: [{ name: 'Sindri lesson', extensions: ['sindri-lesson'] }], defaultPath: file });
        if (path) await invoke('write_sprite_file', { path, content });
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Could not save the lesson.');
      }
    },
  };

  // While making, the file name in the top bar is the lesson's name.
  useEffect(() => {
    if (tutorialMode === 'authoring' && makerDraft) setProjectName(`${makerDraft.title || 'Untitled lesson'}.spr`);
  }, [tutorialMode, makerDraft?.title]);

  // Every change to the draft goes on the shelf, and the shelf is kept safe
  // across reloads.
  useEffect(() => {
    if (makerDraft) setLessonDrafts((ds) => shelveDraft(ds, makerDraft));
  }, [makerDraft]);
  const shelfLoadedRef = useRef(false);
  useEffect(() => {
    if (!shelfLoadedRef.current) { shelfLoadedRef.current = true; return; }
    const id = setTimeout(() => {
      if (!writeLessonDrafts(lessonDrafts)) setLibraryNotice({ kind: 'error', text: 'Storage is full — your newest lesson changes are only kept until you close the app. Share (export) lessons to keep them.' });
    }, 600);
    return () => clearTimeout(id);
  }, [lessonDrafts]);

  // ── Lesson shelf: open, copy, delete drafts; import shared lessons ────────
  const shelf = {
    edit: (d: MakerDraft) => enterMaker(d),
    play: (d: MakerDraft) => { if (d.steps.length) startLesson(draftToLesson(d)); },
    copy: (d: MakerDraft) => {
      const c = copyDraft(d);
      setLessonDrafts((ds) => [c, ...ds]);
      setLibraryNotice({ kind: 'ok', text: `Copied “${d.title}”.` });
    },
    remove: (id: string) => {
      setLessonDrafts((ds) => ds.filter((d) => d.id !== id));
      if (makerDraft?.id === id) setMakerDraft(null);
    },
    importText: (text: string) => {
      try {
        const r = importLesson(text, importedLessons, BUILTIN_LESSONS.map((l) => l.id));
        setImportedLessons(r.lessons);
        setLibraryTab('all');
        setFreshLessonId(r.lesson.id);
        setLibraryNotice(writeImportedLessons(r.lessons)
          ? { kind: 'ok', text: `${r.replaced ? 'Updated' : 'Added'} “${r.lesson.title}” by ${r.lesson.author} — click it to play.` }
          : { kind: 'error', text: `Added “${r.lesson.title}”, but storage is full: it's only here until you close the app.` });
      } catch (err) {
        setLibraryNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not read that lesson.' });
      }
    },
    importFile: async (file: File) => {
      if (file.size > 8 * 1024 * 1024) { setLibraryNotice({ kind: 'error', text: 'That file is too big to be a lesson.' }); return; }
      shelf.importText(await file.text());
    },
    pick: async () => {
      const file = await pickFile('.sindri-lesson,.json');
      if (file) await shelf.importFile(file);
    },
    removeImported: (id: string) => {
      const next = importedLessons.filter((l) => l.id !== id);
      setImportedLessons(next);
      writeImportedLessons(next);
    },
  };

  // The stamp animation plays once.
  useEffect(() => {
    if (!makerStamped) return;
    const id = setTimeout(() => setMakerStamped(null), 500);
    return () => clearTimeout(id);
  }, [makerStamped]);

  // ── Palette: recolour everywhere, palette files ────────────────────────────
  // A recolour session (swatch editor open) is one undo step, however many
  // colours the picker passes through on the way.
  const beginRecolor = useCallback(() => pushHistory({ swatches: true }), [pushHistory]);

  const recolorEverywhere = useCallback((from: string, to: string) => {
    const a = from.toLowerCase();
    const b = to.toLowerCase();
    if (a === b) return;
    setFrames((fs) => recolor(fs, a, b));
    setSwatches((sw) => {
      const next = sw.map((c) => (c.toLowerCase() === a ? b : c));
      return next.filter((c, i) => next.indexOf(c) === i);
    });
    setColor((c) => (c.toLowerCase() === a ? b : c));
  }, []);

  const importPalette = useCallback(async () => {
    try {
      const file = await pickFile('.gpl,.hex,.pal,.txt');
      if (!file) return;
      const colors = readPalette(await file.text());
      pushHistory({ swatches: true });
      setSwatches(colors);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not read that palette.');
    }
  }, [pushHistory]);

  const exportPalette = useCallback(async (format: PaletteFormat) => {
    const stem = projectName.replace(/\.spr$/i, '');
    const content = writePalette(swatches, format, stem);
    try {
      if (!IS_TAURI) { downloadText(content, `${stem}.${format}`); return; }
      const path = await saveDialog({
        title: 'Export palette',
        filters: [{ name: format === 'gpl' ? 'GIMP palette' : format === 'hex' ? 'Hex palette' : 'JASC palette', extensions: [format] }],
        defaultPath: `${stem}.${format}`,
      });
      if (!path) return;
      await invoke('write_palette_file', { path: /\.(gpl|hex|pal)$/i.test(path) ? path : `${path}.${format}`, content });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not export the palette.');
    }
  }, [projectName, swatches]);

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
    setTags((t) => tagsAfterInsert(t, frameIdx + 1));
    setSwatches((s) => (s.includes('#9bb070') ? s : [...s, '#9bb070']));
    setFrameIdx((i) => i + 1);
    setProposal(null);
  };

  const rejectProposal = () => setProposal(null);
  const refineProposal = () => { setCmdKOpen(true); };

  // Apply loaded project data and reset editing state (history, dirty flag).
  const applyProject = useCallback((newFrames: Frame[], w: number, h: number, name: string, projectSwatches?: string[], projectTags: FrameTag[] = []) => {
    setFrames(newFrames);
    setTags(clampTags(projectTags, newFrames.length));
    setPlayTagId(null);
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
    applyProject(data.frames, data.w, data.h, data.name, data.swatches, data.tags);
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

  // Turn a reconstructed AI-art result (one frame, or an animation) into a
  // new document.
  const importAiArt = useCallback((res: AiArtImportResult) => {
    const { frames: imported, palette, name } = res;
    const { width, height } = imported[0].image;
    const newFrames = imported.map(({ image, duration }, i) => ({
      ...frameFromPackedPixels(width, height, imageToPackedPixels(image)),
      id: `frame_${i}`,
      duration,
    }));
    applyProject(newFrames, width, height, name, palette.length ? palette : undefined);
    setCurrentFilePath(null);
    const count = newFrames.length;
    pushRecent({ name, path: '', spec: `${width} × ${height} · ${count} frame${count === 1 ? '' : 's'}`, timestamp: Date.now() });
    setRecentFiles(getRecents());
    setAiImportOpen(false);
    enterEditor();
  }, [applyProject]);

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
        downloadText(serializeProject({ w: canvasW, h: canvasH, name, frames, swatches, tags }), name);
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
      await invoke('write_sprite_file', { path, content: serializeProject({ w: canvasW, h: canvasH, name, frames, swatches, tags }) });
      setCurrentFilePath(path);
      setProjectName(name);
      setDirty(false);
      pushRecent({ name, path, spec: `${canvasW} × ${canvasH} · ${frames.length} frame${frames.length !== 1 ? 's' : ''}`, timestamp: Date.now() });
      setRecentFiles(getRecents());
    } catch (err) {
      console.error('saveFile failed', err);
      window.alert(err instanceof Error ? err.message : 'Could not save the project.');
    }
  }, [currentFilePath, projectName, canvasW, canvasH, frames, swatches, tags]);

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
      // Aseprite-format JSON beside the PNG: frame rectangles (in output
      // pixels), durations and tags — what engine importers read.
      const describe = (image: string) => JSON.stringify(sheetJson(
        gridSheet(frames.length, canvasW * scale, canvasH * scale, columns ?? frames.length),
        { name: stem, image, app: 'Sindri Pixel', durations: frames.map((f) => f.duration), pingPong: false, scale, tags },
      ), null, 2);
      if (!IS_TAURI) {
        const bytes = await encodePngInBrowser(sheet.pixels, sheet.width, sheet.height, scale);
        downloadBytes(bytes, stem + '_sheet.png', 'image/png');
        downloadText(describe(stem + '_sheet.png'), stem + '_sheet.json');
        return;
      }
      const path = await saveDialog({
        title: 'Export sprite sheet',
        filters: [{ name: 'PNG Image', extensions: ['png'] }],
        defaultPath: stem + '_sheet.png',
      });
      if (!path) return;
      await invoke('export_png', { path, width: sheet.width, height: sheet.height, pixels: sheet.pixels, scale });
      const image = path.split(/[/\\]/).pop() ?? stem + '_sheet.png';
      await invoke('write_sprite_file', { path: path.replace(/\.png$/i, '') + '.json', content: describe(image) });
    } catch (err) {
      console.error('exportSpriteSheet failed', err);
      window.alert(err instanceof Error ? err.message : 'Could not export the sprite sheet.');
    }
  }, [projectName, frames, canvasW, canvasH, tags]);

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
    // A lesson's canvas is not the learner's work: keep their recovery copy.
    if (tutorialMode === 'playing') return;
    const id = setTimeout(() => {
      writeAutosave({
        savedAt: Date.now(),
        projectName,
        path: currentFilePath,
        w: canvasW,
        h: canvasH,
        frames,
        swatches,
        tags,
        dirty,
      });
    }, 1200);
    return () => clearTimeout(id);
  }, [appStage, frames, canvasW, canvasH, projectName, swatches, tags, currentFilePath, dirty, tutorialMode]);

  const [recovery, setRecovery] = useState<AutosaveSnapshot | null>(() => {
    const snap = readAutosave();
    return snap && snap.dirty ? snap : null;
  });

  const recoverAutosave = useCallback(() => {
    if (!recovery) return;
    let recoveredTags: FrameTag[] = [];
    try { recoveredTags = validateTags(recovery.tags, recovery.frames.length); } catch { /* drop malformed tags */ }
    applyProject(recovery.frames as Frame[], recovery.w, recovery.h, recovery.projectName, undefined, recoveredTags);
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
  // ── Custom brush: the selected pixels of the active layer ─────────────────
  const captureBrush = useCallback(() => {
    const layer = frames[frameIdx]?.layers[activeLayerIdx];
    if (!selection || !layer) return;
    const brush = brushFromSelection(layer.pixels, selection);
    if (!brush) { window.alert('The selection has no painted pixels on this layer to make a brush from.'); return; }
    setToolOptions((o) => ({ ...o, brush }));
    setSelection(null);
    setTool('pencil');
  }, [frames, frameIdx, activeLayerIdx, selection]);

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
      { type: 'action', id: 'ctx-brush',        label: 'Use selection as brush', shortcut: '⌘B', disabled: !hasSel },
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
    // Cel actions apply to the active layer's cel in this frame.
    const layer = frames[idx]?.layers[activeLayerIdx];
    const prev = frames[idx - 1]?.layers[activeLayerIdx];
    const layerName = layer?.name ?? 'layer';
    const linked = linkSize(frames, layer);
    const canLink = !!layer && !!prev && !(layer.link && layer.link === prev.link);
    const items: ContextItem[] = [
      { type: 'action', id: `ctx-frame-dup:${idx}`,        label: 'Duplicate frame' },
      { type: 'action', id: `ctx-frame-dup-linked:${idx}`, label: 'Duplicate as linked frame' },
      { type: 'action', id: `ctx-frame-insert-before:${idx}`, label: 'Insert frame before' },
      { type: 'action', id: `ctx-frame-insert-after:${idx}`,  label: 'Insert frame after' },
      { type: 'separator' },
      { type: 'action', id: `ctx-frame-move-left:${idx}`,  label: 'Move frame left',  disabled: idx <= 0 },
      { type: 'action', id: `ctx-frame-move-right:${idx}`, label: 'Move frame right', disabled: idx >= frames.length - 1 },
      { type: 'separator' },
      { type: 'separator' },
      { type: 'action', id: `ctx-frame-link-prev:${idx}`, label: `Link “${layerName}” to previous frame`, disabled: !canLink },
      { type: 'action', id: `ctx-frame-unlink:${idx}`,    label: linked > 1 ? `Unlink “${layerName}” (shared by ${linked} frames)` : `Unlink “${layerName}”`, disabled: linked < 2 },
      { type: 'separator' },
      { type: 'action', id: `ctx-frame-delete:${idx}`,     label: 'Delete frame', disabled: frames.length <= 1, danger: true },
    ];
    setContextMenu({ x, y, items });
  }, [frames, activeLayerIdx]);

  // ── Animation tags ─────────────────────────────────────────────────────────
  const addTag = useCallback((from: number, to: number) => {
    pushHistory();
    const id = `tag_${Date.now()}`;
    setTags((t) => [...t, { id, name: freshTagName(t), from, to, direction: 'forward' }]);
  }, [pushHistory]);

  const updateTag = useCallback((id: string, patch: Partial<Omit<FrameTag, 'id'>>) => {
    pushHistory();
    setTags((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, [pushHistory]);

  const deleteTag = useCallback((id: string) => {
    pushHistory();
    setTags((ts) => ts.filter((t) => t.id !== id));
    setPlayTagId((p) => (p === id ? null : p));
  }, [pushHistory]);

  const openTagContextMenu = useCallback((id: string, x: number, y: number) => {
    const tag = tags.find((t) => t.id === id);
    if (!tag) return;
    const dir = (d: FrameTag['direction'], label: string): ContextItem =>
      ({ type: 'action', id: `ctx-tag-dir:${d}:${id}`, label: `${tag.direction === d ? '✓ ' : '   '}${label}` });
    const items: ContextItem[] = [
      { type: 'action', id: `ctx-tag-play:${id}`, label: playTagId === id ? 'Stop looping this tag' : 'Loop this tag in playback' },
      { type: 'separator' },
      dir('forward', 'Forward'),
      dir('reverse', 'Reverse'),
      dir('pingpong', 'Ping-pong'),
      { type: 'separator' },
      { type: 'action', id: `ctx-tag-delete:${id}`, label: `Delete tag “${tag.name}”`, danger: true },
    ];
    setContextMenu({ x, y, items });
  }, [tags, playTagId]);

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
    if (id === 'ctx-brush')        { captureBrush(); return; }
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
    if (id.startsWith('ctx-frame-dup-linked:'))    { duplicateLinkedFrame(parseInt(id.split(':')[1])); return; }
    if (id.startsWith('ctx-frame-link-prev:'))     { linkLayerToPrevious(parseInt(id.split(':')[1])); return; }
    if (id.startsWith('ctx-frame-unlink:'))        { unlinkLayerAt(parseInt(id.split(':')[1])); return; }
    if (id.startsWith('ctx-frame-insert-before:')) { insertFrameAt(parseInt(id.split(':')[1])); return; }
    if (id.startsWith('ctx-frame-insert-after:'))  { insertFrameAt(parseInt(id.split(':')[1]) + 1); return; }
    if (id.startsWith('ctx-frame-move-left:'))     { const i = parseInt(id.split(':')[1]); moveFrame(i, i - 1); return; }
    if (id.startsWith('ctx-frame-move-right:'))    { const i = parseInt(id.split(':')[1]); moveFrame(i, i + 1); return; }
    if (id.startsWith('ctx-frame-delete:'))        { deleteFrame(parseInt(id.split(':')[1])); return; }

    if (id.startsWith('ctx-tag-play:'))   { const t = id.slice('ctx-tag-play:'.length); setPlayTagId((p) => (p === t ? null : t)); return; }
    if (id.startsWith('ctx-tag-delete:')) { deleteTag(id.slice('ctx-tag-delete:'.length)); return; }
    if (id.startsWith('ctx-tag-dir:'))    {
      const [, dir, ...rest] = id.split(':');
      updateTag(rest.join(':'), { direction: dir as FrameTag['direction'] });
      return;
    }

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
  }, [closeContextMenu, selectAll, captureBrush, cutSelection, copySelection, pasteClipboard, deleteSelection, clearLayer, flipH, flipV, rotate90, frames, frameIdx, renameLayer, duplicateLayer, moveLayerUp, moveLayerDown, mergeDown, deleteLayer, duplicateFrame, duplicateLinkedFrame, linkLayerToPrevious, unlinkLayerAt, insertFrameAt, moveFrame, deleteFrame, deleteTag, updateTag]);

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
        if (k === 'b' && !e.shiftKey) { e.preventDefault(); captureBrush(); return; }
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
          setZoomIdx(fitZoomIdx(canvasW, canvasH));
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
        p: 'pencil', e: 'eraser', d: 'shade', g: 'fill', i: 'picker',
        l: 'line', r: 'rect', c: 'circle', v: 'select',
        w: 'wand', a: 'lasso', m: 'move', h: 'pan',
      };
      if (map[key] && !e.shiftKey) chooseTool(map[key]);
      if (key === 'g' && e.shiftKey) setShowGrid((v) => !v);
      if (key === 'o' && e.shiftKey) setShowOnionSkin((v) => !v);
      if (key === 'a' && e.shiftKey) setShowAiGhost((v) => !v);
      if (e.key === '[') setFrameIdx((i) => Math.max(0, i - 1));
      if (e.key === ']') setFrameIdx((i) => Math.min(frames.length - 1, i + 1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [frames.length, saveFile, exportPng, exportGif, undo, redo, openFile, selectAll, copySelection, cutSelection, pasteClipboard, deleteSelection, captureBrush, chooseTool]);

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
      if (v === 'authoring' && tutorialMode !== 'authoring') { enterMaker(); return; }
      if (v === 'library' && tutorialMode !== 'library') { setLibraryNotice(null); setFreshLessonId(null); }
      setTutorialMode(v as TutorialMode);
      // Leaving a lesson or the maker by any route gives the sprite back.
      if ((tutorialMode === 'playing' || tutorialMode === 'authoring') && v !== 'playing' && v !== 'authoring') {
        setMakerRec(null);
        setMakerDraft(null);
        restoreLessonStash();
      }
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
        {(
          <ToolsPane
            tool={tool} onToolChange={chooseTool}
            allowedTools={tutorialMode === 'playing' ? lessonSpot?.tools ?? null : null}
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
        {tutorialMode === 'authoring' && makerDraft && (
          <MakerBar
            title={makerDraft.title}
            recording={!!makerRec}
            stepCount={makerDraft.steps.length}
            onPlay={() => makerActions.play(0)}
            onExit={() => setTweak('tutorialMode', 'off')}
          />
        )}
        <CanvasView
          frames={frames} frameIdx={frameIdx} activeLayerIdx={activeLayerIdx}
          palette={swatches}
          trace={tutorialMode === 'playing' && showLessonExample && lessonSpot?.example && lessonSpot.example.length === canvasH ? lessonSpot.example : null}
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
        {tutorialMode === 'authoring' && makerDraft && (
          <MakerCourse
            draft={makerDraft}
            selected={makerSel}
            recording={!!makerRec}
            stamped={makerStamped}
            onSelect={makerActions.select}
            onRecord={makerActions.record}
            onDone={makerActions.done}
            onCancel={makerActions.cancel}
            onPlay={makerActions.play}
            onMoveStep={makerActions.moveStep}
            onDeleteStep={makerActions.deleteStep}
          />
        )}
        <Timeline
          frames={frames} frameIdx={frameIdx}
          onSelect={setFrameIdx} onAdd={addFrame} onDuplicate={duplicateFrame} onDelete={deleteFrame}
          showOnionSkin={showOnionSkin} onToggleOnionSkin={() => setShowOnionSkin((v) => !v)}
          ghostFrame={showAiGhost && proposal?.visible ? proposal.frame ?? null : null}
          isPlaying={isPlaying}
          onFrameContextMenu={openFrameContextMenu}
          tags={tags}
          playTagId={playTagId}
          onPlayTag={setPlayTagId}
          onAddTag={addTag}
          onUpdateTag={updateTag}
          onTagContextMenu={openTagContextMenu}
        />
        {tutorialMode === 'playing' && spotlightRect && (
          <TutorialSpotlight
            targetRect={spotlightRect}
            callout={lessonSpot ? { stepIdx: lessonStepIdx, text: lessonSpot.title } : null}
          />
        )}
      </div>

      <div style={{ ...appStyles.right, position: 'relative', zIndex: tutorialMode === 'playing' ? 60 : 'auto' }}>
        {(
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {tutorialMode === 'authoring' && makerDraft && (
            <div style={{ flex: '1 1 50%', minHeight: 0, borderBottom: '1px solid var(--rule-2)' }}>
            <MakerPanel
              draft={makerDraft}
              selected={makerSel}
              recording={!!makerRec}
              stamped={makerStamped}
              editor={{ tool, color, frameCount: frames.length, tagCount: tags.length, onion: showOnionSkin, symmetry: modifiers.symmetry, hasSelection: !!selection }}
              onPlay={makerActions.play}
              onChange={updateDraft}
              onChangeStep={makerActions.changeStep}
              onRecapture={makerActions.recapture}
              onRegionFromSelection={makerActions.regionFromSelection}
              onStartCanvas={makerActions.startCanvas}
              onExport={() => void makerActions.exportLesson()}
            />
            </div>
          )}
          {tutorialMode === 'playing' && activeLesson && (
            <TutorialPlayerLane
              lesson={activeLesson}
              phase={lessonPhase}
              stepIdx={lessonStepIdx}
              results={lessonResults}
              stepComplete={lessonStepComplete}
              notice={lessonNotice}
              exampleVisible={showLessonExample}
              onToggleExample={() => setShowLessonExample((v) => !v)}
              onBegin={() => { setLessonPhase('step'); setLessonStepIdx(0); }}
              onPrev={() => { lessonNavRef.current = 'manual'; setLessonStepIdx((i) => Math.max(0, i - 1)); }}
              onNext={() => {
                if (lessonStep && lessonStep.checks.length && !lessonStepComplete) lessonSkippedRef.current = true;
                advanceLesson();
              }}
              onJump={(i) => { lessonNavRef.current = 'manual'; setLessonPhase('step'); setLessonStepIdx(i); }}
              onExit={exitLesson}
              exitLabel={lessonReturnTo === 'authoring' ? 'Back to maker' : 'Exit'}
            />
          )}
          <div style={{ flex: 1, minHeight: 0 }}>
          <RightPane
            activeTab={rightTab} onTabChange={setRightTab}
            frame={frames[frameIdx]} activeLayerIdx={activeLayerIdx} onSelectLayer={setActiveLayerIdx}
            onAddLayer={addLayer} onDeleteLayer={deleteLayer}
            onToggleLayerVisible={toggleLayerVisible} onSetLayerOpacity={setLayerOpacity} onMergeDown={mergeDown}
            onRenameLayer={renameLayer} onLayerContextMenu={openLayerContextMenu}
            color={color} onColorChange={setColor}
            swatches={swatches} onAddSwatch={addSwatch} onSwatchContextMenu={openSwatchContextMenu}
            usedColors={usedColors}
            onRecolorBegin={beginRecolor} onRecolor={recolorEverywhere}
            onImportPalette={importPalette} onExportPalette={exportPalette}
            frameIdx={frameIdx} frameCount={frames.length}
            frameDuration={frames[frameIdx]?.duration ?? 120} onSetFrameDuration={setFrameDuration}
            onApplyDurationToAll={applyDurationToAll}
            canvasW={canvasW} canvasH={canvasH}
            proposal={proposal}
            onAcceptProposal={acceptProposal}
            onRejectProposal={rejectProposal}
            onRefineProposal={refineProposal}
          />
          </div>
          </div>
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
          else if (id === 'import-ai')      setAiImportOpen(true);
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
          else if (id === 'lessons')        { setLibraryTab('all'); setTweak('tutorialMode', 'library'); }
          else if (id === 'my-lessons')     { setLibraryTab('mine'); setTweak('tutorialMode', 'library'); }
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

      <Confetti burst={confetti} />
      <TutorialLibrary
        open={tutorialMode === 'library'}
        lessons={BUILTIN_LESSONS}
        imported={importedLessons}
        completed={completedLessons}
        drafts={lessonDrafts}
        initialTab={libraryTab}
        freshId={freshLessonId}
        notice={libraryNotice}
        onClose={() => setTweak('tutorialMode', 'off')}
        onStart={(lesson) => startLesson(lesson)}
        onAuthor={() => setTweak('tutorialMode', 'authoring')}
        onEditDraft={shelf.edit}
        onPlayDraft={shelf.play}
        onCopyDraft={shelf.copy}
        onDeleteDraft={shelf.remove}
        onImport={() => void shelf.pick()}
        onImportFile={(f) => void shelf.importFile(f)}
        onRemoveImported={shelf.removeImported}
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

      <ImportAiArtDialog
        open={aiImportOpen}
        onClose={() => setAiImportOpen(false)}
        onConfirm={importAiArt}
      />

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
