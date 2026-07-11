import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Frame, Layer, PixelGrid, Tool, ToolOptions, Modifiers, CenterTab } from '../types';
import { ZOOM_LEVELS } from '../data';
import { IconSparkle } from './Icons';

interface CanvasViewProps {
  frames: Frame[];
  frameIdx: number;
  activeLayerIdx: number;
  tool: Tool;
  color: string;
  toolOptions: ToolOptions;
  modifiers: Modifiers;
  helper: string | null;
  showGrid: boolean;
  showOnionSkin: boolean;
  ghost: { visible: boolean; frame: Frame; title: string } | null;
  onPixelsChange: (pixels: PixelGrid) => void;
  onCursorChange: (cursor: { x: number; y: number } | null) => void;
  onColorPick: (color: string) => void;
  onAcceptGhost: () => void;
  onRejectGhost: () => void;
  onRefineGhost: () => void;
  activeTab: CenterTab;
  onTabChange: (tab: CenterTab) => void;
  isPlaying: boolean;
  zoomIdx: number;
  onZoomChange: (idx: number) => void;
  canvasW: number;
  canvasH: number;
  onStrokeBegin?: () => void;
  selection: { x0: number; y0: number; x1: number; y1: number; pixels?: [number, number][] } | null;
  onSelectionChange: (sel: { x0: number; y0: number; x1: number; y1: number; pixels?: [number, number][] } | null) => void;
  onContextMenu?: (x: number, y: number) => void;
}

type DragState = {
  tool: string;
  lastX?: number;
  lastY?: number;
  draft?: PixelGrid;
  // Floating selection — set when move tool lifts selected pixels
  basePixels?: PixelGrid;              // layer with selected region cleared
  floatCols?: (string | null)[][];     // lifted pixel colors, [floatH][floatW]
  floatX?: number;                     // original top-left of float region
  floatY?: number;
  floatW?: number;
  floatH?: number;
  floatMask?: Set<string>;             // "rx,ry" keys for irregular selection cells
  floatOrigPixels?: [number, number][];// original irregular pixel coords (for selection update)
  hasLifted?: boolean;                 // true once pixels have been visually lifted
  // Shape / selection drag bounds
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
  preview?: [number, number][];
  lassoPath?: [number, number][];
  // Marquee-only move (select tool drag inside existing selection)
  selOrigX0?: number;
  selOrigY0?: number;
  selOrigX1?: number;
  selOrigY1?: number;
  selOrigPixels?: [number, number][];
} | null;

type DrawOpts = { bg?: string; checker?: boolean; checkerScale?: number; alpha?: number };

const cvStyles = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--paper)', overflow: 'hidden' } as React.CSSProperties,
  tabbar: {
    display: 'flex', alignItems: 'center',
    height: 42, padding: '0 18px', borderBottom: '1px solid var(--rule)',
    gap: 22, flex: 'none',
  } as React.CSSProperties,
  tab: (active: boolean): React.CSSProperties => ({
    paddingBottom: 10, paddingTop: 10, fontSize: 12.5,
    color: active ? 'var(--ink)' : 'var(--ink-3)',
    fontWeight: active ? 500 : 400,
    borderBottom: active ? '2px solid var(--ink)' : '2px solid transparent',
    marginBottom: -1, cursor: 'pointer',
  }),
  meta: {
    marginLeft: 'auto', display: 'flex', gap: 14,
    fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)',
    letterSpacing: '0.06em',
  } as React.CSSProperties,
  metaItem: { display: 'flex', alignItems: 'center', gap: 4 } as React.CSSProperties,
  zoomBtn: {
    width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid var(--rule-2)', cursor: 'pointer', background: 'var(--paper-2)',
    color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11,
  } as React.CSSProperties,
  viewport: {
    flex: 1, position: 'relative', overflow: 'hidden',
    background: 'var(--paper)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  } as React.CSSProperties,
  minimap: {
    position: 'absolute',
    background: 'var(--paper-2)', border: '1px solid var(--rule-2)',
    padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
    zIndex: 5, userSelect: 'none',
    boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
  } as React.CSSProperties,
  minimapHead: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-4)',
    letterSpacing: '0.08em', textTransform: 'uppercase', gap: 12,
    cursor: 'grab',
  } as React.CSSProperties,
  minimapHeadActive: { cursor: 'grabbing' } as React.CSSProperties,
  minimapHeadDot: { color: 'var(--cyan)', marginRight: 4 } as React.CSSProperties,
  minimapGrip: { display: 'inline-flex', gap: 2 } as React.CSSProperties,
  minimapGripDot: { width: 2, height: 2, background: 'var(--ink-4)' } as React.CSSProperties,
  minimapCanvas: {
    imageRendering: 'pixelated', display: 'block',
    background: '#0a0e14', border: '1px solid var(--rule)',
  } as React.CSSProperties,
  minimapMeta: {
    display: 'flex', justifyContent: 'space-between',
    fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-4)',
    letterSpacing: '0.06em',
  } as React.CSSProperties,
  zoomBadge: {
    position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
    fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink)',
    background: 'var(--paper-2)', border: '1px solid var(--rule-2)',
    padding: '4px 10px', letterSpacing: '0.06em',
    pointerEvents: 'none', zIndex: 6,
  } as React.CSSProperties,
  bgPattern: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    backgroundImage:
      'linear-gradient(to right, rgba(230,225,212,0.04) 1px, transparent 1px),' +
      'linear-gradient(to bottom, rgba(230,225,212,0.04) 1px, transparent 1px),' +
      'linear-gradient(to right, rgba(230,225,212,0.08) 1px, transparent 1px),' +
      'linear-gradient(to bottom, rgba(230,225,212,0.08) 1px, transparent 1px)',
    backgroundSize: '40px 40px, 40px 40px, 200px 200px, 200px 200px',
  } as React.CSSProperties,
  artboardWrap: { position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 } as React.CSSProperties,
  artboardLabel: {
    fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)',
    letterSpacing: '0.08em', textTransform: 'uppercase',
  } as React.CSSProperties,
  artboard: (w: number, h: number): React.CSSProperties => ({
    position: 'relative', width: w, height: h,
    border: '1px solid var(--rule-2)',
    background: '#0a0e14',
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.4)',
  }),
  canvasLayered: { position: 'absolute', inset: 0, imageRendering: 'pixelated', display: 'block' } as React.CSSProperties,
  ghostBanner: {
    position: 'absolute', top: 8, left: 8, right: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 10px', background: 'rgba(13,17,23,0.92)',
    border: '1px dashed var(--amber)', color: 'var(--amber)',
    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em',
    pointerEvents: 'auto',
  } as React.CSSProperties,
  ghostActions: { display: 'flex', gap: 6 } as React.CSSProperties,
  ghostBtn: (variant: string): React.CSSProperties => ({
    fontFamily: 'var(--font-display)', fontSize: 11,
    padding: '3px 10px', cursor: 'pointer',
    background: variant === 'accept' ? 'var(--amber)' : 'transparent',
    color: variant === 'accept' ? 'var(--paper)' : 'var(--amber)',
    border: '1px solid var(--amber)',
  }),
  previewWrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
  } as React.CSSProperties,
  previewArt: (w: number, h: number): React.CSSProperties => ({
    width: w, height: h,
    border: '1px solid var(--rule-2)', background: '#0a0e14',
    imageRendering: 'pixelated', display: 'block',
  }),
};

export function CanvasView({
  frames, frameIdx, activeLayerIdx,
  tool, color, toolOptions, modifiers, helper,
  showGrid, showOnionSkin, ghost,
  onPixelsChange, onCursorChange, onColorPick,
  onAcceptGhost, onRejectGhost, onRefineGhost,
  activeTab, onTabChange, isPlaying,
  zoomIdx, onZoomChange,
  canvasW, canvasH, onStrokeBegin,
  selection, onSelectionChange,
  onContextMenu,
}: CanvasViewProps) {
  const zoom = ZOOM_LEVELS[zoomIdx];
  const artboardW = canvasW * zoom;
  const artboardH = canvasH * zoom;
  const baseRef = useRef<HTMLCanvasElement>(null);
  const onionRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const ghostRef = useRef<HTMLCanvasElement>(null);

  const [drag, setDrag] = useState<DragState>(null);
  // selection and onSelectionChange come from App as props (lifted state)
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoverInSel, setHoverInSel] = useState(false);
  const panDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [previewFrame, setPreviewFrame] = useState(0);
  const [zoomBadgeVisible, setZoomBadgeVisible] = useState(false);
  const zoomBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const [miniPos, setMiniPos] = useState<{ right: number; bottom: number }>(() => {
    try { return JSON.parse(localStorage.getItem('sindri_minimap_pos') || 'null') || { right: 16, bottom: 16 }; }
    catch { return { right: 16, bottom: 16 }; }
  });
  const [miniDrag, setMiniDrag] = useState<{
    startX: number; startY: number;
    startRight: number; startBottom: number;
    vRect: DOMRect;
  } | null>(null);

  const startMiniDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const v = viewportRef.current;
    if (!v) return;
    const vRect = v.getBoundingClientRect();
    setMiniDrag({
      startX: e.clientX, startY: e.clientY,
      startRight: miniPos.right, startBottom: miniPos.bottom,
      vRect,
    });
  };

  useEffect(() => {
    if (!miniDrag) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - miniDrag.startX;
      const dy = e.clientY - miniDrag.startY;
      const next = {
        right:  Math.max(8, Math.min(miniDrag.vRect.width  - 180, miniDrag.startRight  - dx)),
        bottom: Math.max(8, Math.min(miniDrag.vRect.height - 180, miniDrag.startBottom - dy)),
      };
      setMiniPos(next);
    };
    const onUp = () => {
      setMiniDrag(null);
      try { localStorage.setItem('sindri_minimap_pos', JSON.stringify(miniPos)); } catch {}
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [miniDrag, miniPos]);

  const frame = frames[frameIdx];
  const prevFrame = frameIdx > 0 ? frames[frameIdx - 1] : frames[frames.length - 1];
  const nextFrame = frames[(frameIdx + 1) % frames.length];

  const drawFrameToCanvas = useCallback((canvas: HTMLCanvasElement | null, frameData: Frame | null | undefined, opts: DrawOpts = {}) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (opts.bg) {
      ctx.fillStyle = opts.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (opts.checker) {
      const s = (opts.checkerScale ?? 2);
      for (let y = 0; y < canvasH; y++) {
        for (let x = 0; x < canvasW; x++) {
          if (((Math.floor(x / s) + Math.floor(y / s)) % 2) === 0) {
            ctx.fillStyle = '#11161d';
          } else {
            ctx.fillStyle = '#0a0e14';
          }
          ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
        }
      }
    }
    if (!frameData) return;
    ctx.globalAlpha = opts.alpha ?? 1;
    frameData.layers.forEach((layer: Layer) => {
      if (!layer.visible) return;
      ctx.globalAlpha = (opts.alpha ?? 1) * layer.opacity;
      for (let y = 0; y < canvasH; y++) {
        for (let x = 0; x < canvasW; x++) {
          const c = layer.pixels[y][x];
          if (c) {
            ctx.fillStyle = c;
            ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
          }
        }
      }
    });
    ctx.globalAlpha = 1;
  }, [zoom]);

  useEffect(() => {
    drawFrameToCanvas(baseRef.current, frame, { checker: true });
  }, [frame, drawFrameToCanvas, activeTab]);

  useEffect(() => {
    if (!onionRef.current) return;
    const ctx = onionRef.current.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, onionRef.current.width, onionRef.current.height);
    if (!showOnionSkin || frames.length < 2) return;
    drawFrameToCanvas(onionRef.current, prevFrame, { alpha: 0.28 });
    // Also ghost the next frame, fainter, without wiping the previous one.
    if (frames.length > 2 && nextFrame !== prevFrame) {
      const nctx = onionRef.current.getContext('2d')!;
      nctx.globalAlpha = 1;
      nextFrame.layers.forEach((layer) => {
        if (!layer.visible) return;
        nctx.globalAlpha = 0.14 * layer.opacity;
        for (let y = 0; y < canvasH; y++) {
          for (let x = 0; x < canvasW; x++) {
            const c = layer.pixels[y][x];
            if (c) { nctx.fillStyle = c; nctx.fillRect(x * zoom, y * zoom, zoom, zoom); }
          }
        }
      });
      nctx.globalAlpha = 1;
    }
  }, [showOnionSkin, prevFrame, nextFrame, drawFrameToCanvas, activeTab, frames.length, canvasW, canvasH, zoom]);

  useEffect(() => {
    if (!ghostRef.current) return;
    const ctx = ghostRef.current.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, ghostRef.current.width, ghostRef.current.height);
    if (!ghost?.visible) return;
    drawFrameToCanvas(ghostRef.current, ghost.frame, { alpha: 0.78 });
  }, [ghost, drawFrameToCanvas, activeTab]);

  useEffect(() => {
    const c = overlayRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);

    if (showGrid) {
      ctx.strokeStyle = 'rgba(230,225,212,0.06)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= canvasW; x++) {
        ctx.beginPath(); ctx.moveTo(x * zoom + 0.5, 0); ctx.lineTo(x * zoom + 0.5, artboardH); ctx.stroke();
      }
      for (let y = 0; y <= canvasH; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * zoom + 0.5); ctx.lineTo(artboardW, y * zoom + 0.5); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(230,225,212,0.14)';
      for (let x = 0; x <= canvasW; x += 8) {
        ctx.beginPath(); ctx.moveTo(x * zoom + 0.5, 0); ctx.lineTo(x * zoom + 0.5, artboardH); ctx.stroke();
      }
      for (let y = 0; y <= canvasH; y += 8) {
        ctx.beginPath(); ctx.moveTo(0, y * zoom + 0.5); ctx.lineTo(artboardW, y * zoom + 0.5); ctx.stroke();
      }
    }

    if (helper === 'topdown') {
      ctx.strokeStyle = 'rgba(109,188,219,0.32)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(artboardW / 2 + 0.5, 0); ctx.lineTo(artboardW / 2 + 0.5, artboardH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, artboardH / 2 + 0.5); ctx.lineTo(artboardW, artboardH / 2 + 0.5); ctx.stroke();
    } else if (helper === 'side') {
      ctx.strokeStyle = 'rgba(155,176,112,0.42)';
      ctx.lineWidth = 2;
      const y = artboardH - zoom * 4;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(artboardW, y); ctx.stroke();
    } else if (helper === 'iso') {
      ctx.strokeStyle = 'rgba(109,188,219,0.28)';
      ctx.lineWidth = 1;
      const cx = artboardW / 2;
      const cy = artboardH - zoom * 4;
      const iw = zoom * 12, ih = zoom * 6;
      ctx.beginPath();
      ctx.moveTo(cx, cy - ih / 2);
      ctx.lineTo(cx + iw / 2, cy);
      ctx.lineTo(cx, cy + ih / 2);
      ctx.lineTo(cx - iw / 2, cy);
      ctx.closePath();
      ctx.stroke();
    }

    if (modifiers.symmetry !== 'off') {
      ctx.strokeStyle = 'rgba(240,192,80,0.18)';
      ctx.setLineDash([3, 3]);
      if (modifiers.symmetry === 'v' || modifiers.symmetry === 'both') {
        ctx.beginPath(); ctx.moveTo(artboardW / 2 + 0.5, 0); ctx.lineTo(artboardW / 2 + 0.5, artboardH); ctx.stroke();
      }
      if (modifiers.symmetry === 'h' || modifiers.symmetry === 'both') {
        ctx.beginPath(); ctx.moveTo(0, artboardH / 2 + 0.5); ctx.lineTo(artboardW, artboardH / 2 + 0.5); ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Draw active drag preview (line/rect/circle shape strokes)
    if (drag && drag.preview && drag.tool !== 'select' && drag.tool !== 'lasso') {
      drag.preview.forEach(([px, py]) => {
        // Respect selection mask for shape previews
        if (selection && !isInSelection(px, py)) return;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(px * zoom, py * zoom, zoom, zoom);
      });
      ctx.globalAlpha = 1;
    }

    // Lasso: draw path as connected lines
    if (drag?.tool === 'lasso' && drag.lassoPath && drag.lassoPath.length > 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      drag.lassoPath.forEach(([px, py], i) => {
        const cx = (px + 0.5) * zoom, cy = (py + 0.5) * zoom;
        if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Select: draw dashed rectangle during drag
    if (drag?.tool === 'select' && drag.x0 != null && drag.x1 != null) {
      const sx0 = Math.min(drag.x0, drag.x1) * zoom + 0.5;
      const sy0 = Math.min(drag.y0!, drag.y1!) * zoom + 0.5;
      const sw = (Math.abs(drag.x1 - drag.x0) + 1) * zoom;
      const sh = (Math.abs(drag.y1! - drag.y0!) + 1) * zoom;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(sx0, sy0, sw, sh);
      ctx.setLineDash([]);
    }

    // Committed selection (marching ants)
    if (selection) {
      const sx0 = selection.x0 * zoom + 0.5;
      const sy0 = selection.y0 * zoom + 0.5;
      const sw = (selection.x1 - selection.x0 + 1) * zoom;
      const sh = (selection.y1 - selection.y0 + 1) * zoom;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(sx0, sy0, sw, sh);
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = 4;
      ctx.strokeRect(sx0, sy0, sw, sh);
      ctx.lineDashOffset = 0;
      ctx.setLineDash([]);
    }
  }, [showGrid, helper, modifiers.symmetry, zoom, artboardW, artboardH, drag, color, selection]);

  useEffect(() => {
    if (activeTab !== 'preview' && activeTab !== 'split') return;
    if (!isPlaying) return;
    // Honor each frame's own duration rather than a single global interval.
    const id = setTimeout(() => {
      setPreviewFrame((f) => (f + 1) % frames.length);
    }, frames[previewFrame]?.duration ?? 120);
    return () => clearTimeout(id);
  }, [activeTab, isPlaying, frames, previewFrame]);

  useEffect(() => {
    if (activeTab !== 'preview' && activeTab !== 'split') return;
    const f = isPlaying ? previewFrame : frameIdx;
    drawFrameToCanvas(previewRef.current, frames[f], { checker: true, checkerScale: 4 });
  }, [activeTab, previewFrame, isPlaying, frames, frameIdx, drawFrameToCanvas]);

  const eventToPixel = (e: React.MouseEvent) => {
    const rect = baseRef.current!.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvasW);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvasH);
    return { x, y };
  };

  // ── Selection helpers ──────────────────────────────────────────────────────
  // Pre-compute a Set for fast membership tests on irregular selections.
  const selectionSet = useMemo<Set<string> | null>(() => {
    if (!selection?.pixels) return null;
    return new Set(selection.pixels.map(([sx, sy]) => `${sx},${sy}`));
  }, [selection]);

  // Returns true if (px, py) is within the active selection (or if no selection).
  const isInSelection = useCallback((px: number, py: number): boolean => {
    if (!selection) return true;
    const minX = Math.min(selection.x0, selection.x1);
    const maxX = Math.max(selection.x0, selection.x1);
    const minY = Math.min(selection.y0, selection.y1);
    const maxY = Math.max(selection.y0, selection.y1);
    if (px < minX || px > maxX || py < minY || py > maxY) return false;
    if (selectionSet) return selectionSet.has(`${px},${py}`);
    return true;
  }, [selection, selectionSet]);

  const setPixelInDraft = (draft: PixelGrid, x: number, y: number, col: string | null, opts: { size?: number; ignoreSelection?: boolean } = {}) => {
    const sz = opts.size ?? toolOptions.brushSize ?? 1;
    const apply = (px: number, py: number) => {
      if (!opts.ignoreSelection && !isInSelection(px, py)) return;
      if (modifiers.tile) {
        // Tile: wrap coordinates (torus topology)
        const tx = ((px % canvasW) + canvasW) % canvasW;
        const ty = ((py % canvasH) + canvasH) % canvasH;
        draft[ty][tx] = col;
      } else {
        if (px < 0 || px >= canvasW || py < 0 || py >= canvasH) return;
        draft[py][px] = col;
      }
    };
    const r = Math.floor(sz / 2);
    const stamp = (cx: number, cy: number) => {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (sz === 1 && (dx !== 0 || dy !== 0)) continue;
          apply(cx + dx, cy + dy);
        }
      }
    };
    stamp(x, y);
    const sym = modifiers.symmetry;
    const mx = canvasW - 1 - x;
    const my = canvasH - 1 - y;
    if (sym === 'v' || sym === 'both') stamp(mx, y);
    if (sym === 'h' || sym === 'both') stamp(x, my);
    if (sym === 'both') stamp(mx, my);
  };

  const linePixels = (x0: number, y0: number, x1: number, y1: number): [number, number][] => {
    const out: [number, number][] = [];
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0, y = y0;
    while (true) {
      out.push([x, y]);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
    return out;
  };

  const rectPixels = (x0: number, y0: number, x1: number, y1: number, filled: boolean): [number, number][] => {
    const out: [number, number][] = [];
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1), by = Math.max(y0, y1);
    for (let y = ay; y <= by; y++) {
      for (let x = ax; x <= bx; x++) {
        if (filled || x === ax || x === bx || y === ay || y === by) out.push([x, y]);
      }
    }
    return out;
  };

  const circlePixels = (x0: number, y0: number, x1: number, y1: number, filled: boolean): [number, number][] => {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    if (minX === maxX && minY === maxY) return [[minX, minY]];

    // Bounding box center (sub-pixel) and radii in pixel units
    const cx = (minX + maxX + 1) / 2;
    const cy = (minY + maxY + 1) / 2;
    const rx = (maxX - minX + 1) / 2;
    const ry = (maxY - minY + 1) / 2;

    // Pixel (x,y) is inside the ellipse when its center (x+0.5, y+0.5) satisfies the equation
    const inside = (x: number, y: number): boolean => {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      return dx * dx + dy * dy <= 1.0;
    };

    const out: [number, number][] = [];
    const seen = new Set<number>();
    const plot = (x: number, y: number) => {
      const k = y * 65536 + x;
      if (!seen.has(k)) { seen.add(k); out.push([x, y]); }
    };

    if (filled) {
      // Scan each row and fill from left to right boundary
      for (let y = minY; y <= maxY; y++) {
        let left = -1, right = -1;
        for (let x = minX; x <= maxX; x++) {
          if (inside(x, y)) { if (left === -1) left = x; right = x; }
        }
        if (left !== -1) for (let x = left; x <= right; x++) plot(x, y);
      }
      return out;
    }

    // Outline: scan rows for left/right boundary pixels (covers near-horizontal arcs)
    for (let y = minY; y <= maxY; y++) {
      let left = -1, right = -1;
      for (let x = minX; x <= maxX; x++) {
        if (inside(x, y)) { if (left === -1) left = x; right = x; }
      }
      if (left !== -1) { plot(left, y); if (right !== left) plot(right, y); }
    }
    // Scan columns for top/bottom boundary pixels (covers near-vertical arcs)
    for (let x = minX; x <= maxX; x++) {
      let top = -1, bottom = -1;
      for (let y = minY; y <= maxY; y++) {
        if (inside(x, y)) { if (top === -1) top = y; bottom = y; }
      }
      if (top !== -1) { plot(x, top); if (bottom !== top) plot(x, bottom); }
    }
    return out;
  };

  const floodFill = (pixels: PixelGrid, sx: number, sy: number, target: string | null, replace: string | null, constraint?: (cx: number, cy: number) => boolean): PixelGrid => {
    if (target === replace) return pixels;
    const out = pixels.map((r) => r.slice());
    const stack: [number, number][] = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= canvasW || y >= canvasH) continue;
      if (constraint && !constraint(x, y)) continue;
      if (out[y][x] !== target) continue;
      out[y][x] = replace;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return out;
  };

  // Euclidean colour distance in RGB space (0–441).
  const colorDistance = (a: string | null, b: string | null): number => {
    if (a === b) return 0;
    if (!a || !b) return 441;
    const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
    const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
    return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
  };

  // Returns pixels matching `target` within `threshold` colour distance.
  // When `contiguous` is true, only flood-connected pixels qualify.
  const wandSelect = (
    pixels: PixelGrid,
    sx: number, sy: number,
    target: string | null,
    threshold: number,
    contiguous: boolean,
  ): [number, number][] => {
    // threshold 0–100 → max Euclidean distance 0–441
    const maxDist = (threshold / 100) * 441;
    if (contiguous) {
      const out: [number, number][] = [];
      const visited = new Set<string>();
      const stack: [number, number][] = [[sx, sy]];
      while (stack.length) {
        const [x, y] = stack.pop()!;
        if (x < 0 || y < 0 || x >= canvasW || y >= canvasH) continue;
        const key = `${x},${y}`;
        if (visited.has(key)) continue;
        if (colorDistance(pixels[y][x], target) > maxDist) continue;
        visited.add(key);
        out.push([x, y]);
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      return out;
    } else {
      // Non-contiguous: select ALL pixels within threshold across entire canvas
      const out: [number, number][] = [];
      for (let y = 0; y < canvasH; y++) {
        for (let x = 0; x < canvasW; x++) {
          if (colorDistance(pixels[y][x], target) <= maxDist) out.push([x, y]);
        }
      }
      return out;
    }
  };

  // Ray-casting point-in-polygon — used by lasso tool.
  const pointInPolygon = (px: number, py: number, polygon: [number, number][]): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  };

  const handleDown = (e: React.MouseEvent) => {
    if (activeTab !== 'editor' && activeTab !== 'split') return;

    // Middle-mouse always pans, whatever the active tool.
    if (e.button === 1) {
      e.preventDefault();
      panDragRef.current = { startX: e.clientX, startY: e.clientY, originX: panOffset.x, originY: panOffset.y };
      return;
    }
    if (e.button !== 0) return;  // ignore right-click
    e.preventDefault();

    // Pan: track raw screen coords, not pixel coords
    if (tool === 'pan') {
      panDragRef.current = { startX: e.clientX, startY: e.clientY, originX: panOffset.x, originY: panOffset.y };
      return;
    }

    const { x, y } = eventToPixel(e);
    if (x < 0 || y < 0 || x >= canvasW || y >= canvasH) return;
    const layer = frame.layers[activeLayerIdx];

    // Alt-click samples the color under the cursor with any drawing tool.
    if (e.altKey || tool === 'picker') {
      for (let i = frame.layers.length - 1; i >= 0; i--) {
        const L = frame.layers[i];
        if (L.visible && L.pixels[y][x]) { onColorPick(L.pixels[y][x] as string); return; }
      }
      return;
    }

    if (tool === 'fill') {
      onStrokeBegin?.();
      const target = layer.pixels[y][x];
      let newPx: PixelGrid;
      if (!toolOptions.contiguous) {
        // Non-contiguous: replace ALL matching pixels (within selection if active)
        newPx = layer.pixels.map((row, py) =>
          row.map((col, px) => {
            if (!isInSelection(px, py)) return col;
            return col === target ? color : col;
          })
        );
      } else {
        newPx = floodFill(layer.pixels, x, y, target, color, selection ? isInSelection : undefined);
      }
      onPixelsChange(newPx);
      return;
    }

    // Wand: select pixels matching colour at click point (respects threshold + contiguous)
    if (tool === 'wand') {
      const coords = wandSelect(
        layer.pixels, x, y, layer.pixels[y][x],
        toolOptions.threshold ?? 0,
        toolOptions.contiguous ?? true,
      );
      if (coords.length > 0) {
        const xs = coords.map((c) => c[0]);
        const ys = coords.map((c) => c[1]);
        onSelectionChange({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), pixels: coords });
      }
      return;
    }

    if (tool === 'pencil' || tool === 'eraser') {
      onStrokeBegin?.();
      const draft = layer.pixels.map((r) => r.slice());
      setPixelInDraft(draft, x, y, tool === 'eraser' ? null : color);
      onPixelsChange(draft);
      setDrag({ tool, lastX: x, lastY: y, draft });

    } else if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      onStrokeBegin?.();
      setDrag({ tool, x0: x, y0: y, x1: x, y1: y, preview: [[x, y]] });

    } else if (tool === 'select') {
      if (selection && isInSelection(x, y)) {
        // Click inside existing selection → start moving the marquee (not pixels)
        setDrag({
          tool: 'select-move',
          x0: x, y0: y, x1: x, y1: y,
          selOrigX0: Math.min(selection.x0, selection.x1),
          selOrigY0: Math.min(selection.y0, selection.y1),
          selOrigX1: Math.max(selection.x0, selection.x1),
          selOrigY1: Math.max(selection.y0, selection.y1),
          selOrigPixels: selection.pixels,
        });
      } else {
        // Click outside (or no selection) → clear and start drawing new selection
        onSelectionChange(null);
        setDrag({ tool: 'select', x0: x, y0: y, x1: x, y1: y });
      }

    } else if (tool === 'lasso') {
      onSelectionChange(null);
      setDrag({ tool: 'lasso', x0: x, y0: y, x1: x, y1: y, lassoPath: [[x, y]] });

    } else if (tool === 'move') {
      onStrokeBegin?.();
      if (selection) {
        // Prepare floating selection — lift selected pixels on first actual movement
        const { x0: sx0, y0: sy0, x1: sx1, y1: sy1, pixels: selPixels } = selection;
        const minX = Math.min(sx0, sx1), maxX = Math.max(sx0, sx1);
        const minY = Math.min(sy0, sy1), maxY = Math.max(sy0, sy1);
        const fw = maxX - minX + 1, fh = maxY - minY + 1;

        // Relative mask for irregular (wand / lasso) selections
        let floatMask: Set<string> | undefined;
        if (selPixels) {
          floatMask = new Set(selPixels.map(([spx, spy]) => `${spx - minX},${spy - minY}`));
        }

        // Extract the float pixel colors
        const floatCols: (string | null)[][] = Array.from({ length: fh }, (_, ry) =>
          Array.from({ length: fw }, (_, rx) => {
            if (floatMask && !floatMask.has(`${rx},${ry}`)) return null;
            return layer.pixels[minY + ry]?.[minX + rx] ?? null;
          })
        );

        // Base = layer with selected region cleared (the "hole")
        const basePixels: PixelGrid = layer.pixels.map((row, py) =>
          row.map((col, px) => {
            if (px < minX || px > maxX || py < minY || py > maxY) return col;
            if (floatMask && !floatMask.has(`${px - minX},${py - minY}`)) return col;
            return null;
          })
        );

        setDrag({
          tool: 'move',
          draft: layer.pixels.map((r) => r.slice()),
          basePixels,
          floatCols,
          floatX: minX,
          floatY: minY,
          floatW: fw,
          floatH: fh,
          floatMask,
          floatOrigPixels: selPixels,
          x0: x, y0: y, x1: x, y1: y,
          hasLifted: false,
        });
      } else {
        // No selection → move entire layer
        const orig = layer.pixels.map((r) => r.slice());
        setDrag({ tool: 'move', x0: x, y0: y, x1: x, y1: y, draft: orig });
      }
    }
  };

  const handleMove = (e: React.MouseEvent) => {
    // Pan: update offset using raw screen coords, skip pixel cursor
    if (panDragRef.current) {
      const dx = e.clientX - panDragRef.current.startX;
      const dy = e.clientY - panDragRef.current.startY;
      setPanOffset({ x: panDragRef.current.originX + dx, y: panDragRef.current.originY + dy });
      return;
    }

    // If mouse button was released outside the canvas, finalize the stroke now.
    if (drag && e.buttons === 0) {
      handleUp();
      return;
    }

    const { x, y } = eventToPixel(e);
    onCursorChange({ x, y });
    // Update cursor feedback: show move cursor when hovering inside active selection
    setHoverInSel(!!(selection && isInSelection(x, y)));

    if (!drag) return;

    if (drag.tool === 'pencil' || drag.tool === 'eraser') {
      const draft = drag.draft!;
      // Clamp the target pixel to canvas bounds so that dragging outside and
      // re-entering doesn't draw a long diagonal line across the canvas.
      const cx = Math.max(0, Math.min(canvasW - 1, x));
      const cy = Math.max(0, Math.min(canvasH - 1, y));
      const segs = linePixels(drag.lastX!, drag.lastY!, cx, cy);
      segs.forEach(([px, py]) => setPixelInDraft(draft, px, py, drag.tool === 'eraser' ? null : color));
      onPixelsChange(draft);
      setDrag({ ...drag, lastX: cx, lastY: cy });

    } else if (drag.tool === 'line') {
      let x1 = x, y1 = y;
      if (e.shiftKey || toolOptions.perfectShapes) {
        // Snap to nearest standard pixel-art angle:
        // 0° (H), ~18° (3:1), ~27° (2:1), 45° (1:1), ~63° (1:2), ~72° (1:3), 90° (V)
        const dx = x - drag.x0!, dy = y - drag.y0!;
        const sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1;
        const adx = Math.abs(dx), ady = Math.abs(dy);
        const angle = Math.atan2(ady, adx);
        const ratios: [number, number][] = [[1,0],[3,1],[2,1],[1,1],[1,2],[1,3],[0,1]];
        let bestR: [number, number] = [1, 0], bestDiff = Infinity;
        for (const r of ratios) {
          const diff = Math.abs(angle - Math.atan2(r[1], r[0]));
          if (diff < bestDiff) { bestDiff = diff; bestR = r; }
        }
        const [rx, ry] = bestR;
        if (rx === 0)      { x1 = drag.x0!;   y1 = drag.y0! + sy * ady; }
        else if (ry === 0) { x1 = drag.x0! + sx * adx; y1 = drag.y0!; }
        else {
          // Project drag onto the ray, round to nearest integer step
          const t = Math.max(1, Math.round((adx * rx + ady * ry) / (rx * rx + ry * ry)));
          x1 = drag.x0! + sx * t * rx;
          y1 = drag.y0! + sy * t * ry;
        }
      }
      setDrag({ ...drag, x1, y1, preview: linePixels(drag.x0!, drag.y0!, x1, y1) });
    } else if (drag.tool === 'rect') {
      let x1 = x, y1 = y;
      if (e.shiftKey || toolOptions.perfectShapes) {
        // Shift or toggle: constrain to square
        const dx = x - drag.x0!, dy = y - drag.y0!;
        const size = Math.min(Math.abs(dx), Math.abs(dy));
        x1 = drag.x0! + Math.sign(dx) * size;
        y1 = drag.y0! + Math.sign(dy) * size;
      }
      setDrag({ ...drag, x1, y1, preview: rectPixels(drag.x0!, drag.y0!, x1, y1, toolOptions.filled) });
    } else if (drag.tool === 'circle') {
      let x1 = x, y1 = y;
      if (e.shiftKey || toolOptions.perfectShapes) {
        // Shift or toggle: constrain to perfect circle
        const dx = x - drag.x0!, dy = y - drag.y0!;
        const size = Math.min(Math.abs(dx), Math.abs(dy));
        x1 = drag.x0! + Math.sign(dx) * size;
        y1 = drag.y0! + Math.sign(dy) * size;
      }
      setDrag({ ...drag, x1, y1, preview: circlePixels(drag.x0!, drag.y0!, x1, y1, toolOptions.filled) });

    } else if (drag.tool === 'select') {
      setDrag({ ...drag, x1: x, y1: y });

    } else if (drag.tool === 'select-move') {
      // Move the selection marquee (not pixels)
      const dx = x - drag.x0!;
      const dy = y - drag.y0!;
      const newSel = {
        x0: drag.selOrigX0! + dx,
        y0: drag.selOrigY0! + dy,
        x1: drag.selOrigX1! + dx,
        y1: drag.selOrigY1! + dy,
        pixels: drag.selOrigPixels?.map(([spx, spy]) => [spx + dx, spy + dy] as [number, number]),
      };
      onSelectionChange(newSel);
      setDrag({ ...drag, x1: x, y1: y });

    } else if (drag.tool === 'lasso') {
      const path: [number, number][] = [...drag.lassoPath!, [x, y]];
      setDrag({ ...drag, x1: x, y1: y, lassoPath: path });

    } else if (drag.tool === 'move') {
      const dx = x - drag.x0!;
      const dy = y - drag.y0!;

      if (drag.floatCols) {
        // ── Floating selection move ─────────────────────────────────────────
        if (dx === 0 && dy === 0) return; // no actual movement yet

        // First movement: apply the lift (create the hole)
        if (!drag.hasLifted) {
          onPixelsChange(drag.basePixels!);
          setDrag({ ...drag, hasLifted: true, x1: x, y1: y });
          return;
        }

        // Stamp the float at its new position on top of the base (hole) layer
        const curFloatX = drag.floatX! + dx;
        const curFloatY = drag.floatY! + dy;
        const combined: PixelGrid = drag.basePixels!.map((row) => row.slice());
        for (let ry = 0; ry < drag.floatH!; ry++) {
          for (let rx = 0; rx < drag.floatW!; rx++) {
            const col = drag.floatCols[ry][rx];
            if (col === null) continue;
            const px = curFloatX + rx, py = curFloatY + ry;
            if (px >= 0 && px < canvasW && py >= 0 && py < canvasH) combined[py][px] = col;
          }
        }
        onPixelsChange(combined);

        // Move the selection marquee to follow the float
        const newSel = drag.floatOrigPixels
          ? {
              x0: curFloatX, y0: curFloatY,
              x1: curFloatX + drag.floatW! - 1, y1: curFloatY + drag.floatH! - 1,
              pixels: drag.floatOrigPixels.map(([spx, spy]) => [spx + dx, spy + dy] as [number, number]),
            }
          : { x0: curFloatX, y0: curFloatY, x1: curFloatX + drag.floatW! - 1, y1: curFloatY + drag.floatH! - 1 };
        onSelectionChange(newSel);
        setDrag({ ...drag, x1: x, y1: y });

      } else {
        // ── Whole-layer move (no selection) ────────────────────────────────
        const orig = drag.draft!;
        const shifted: PixelGrid = Array.from({ length: canvasH }, (_, py) =>
          Array.from({ length: canvasW }, (_, px) => {
            const srcX = px - dx, srcY = py - dy;
            if (srcX >= 0 && srcX < canvasW && srcY >= 0 && srcY < canvasH) return orig[srcY][srcX];
            return null;
          })
        );
        onPixelsChange(shifted);
        setDrag({ ...drag, x1: x, y1: y });
      }
    }
  };

  const handleUp = () => {
    panDragRef.current = null;
    if (!drag) return;
    const layer = frame.layers[activeLayerIdx];

    if (drag.tool === 'line' || drag.tool === 'rect' || drag.tool === 'circle') {
      const draft = layer.pixels.map((r) => r.slice());
      drag.preview!.forEach(([px, py]) => setPixelInDraft(draft, px, py, color, { size: 1 }));
      onPixelsChange(draft);

    } else if (drag.tool === 'select') {
      const x0 = Math.min(drag.x0!, drag.x1!);
      const y0 = Math.min(drag.y0!, drag.y1!);
      const x1 = Math.max(drag.x0!, drag.x1!);
      const y1 = Math.max(drag.y0!, drag.y1!);
      if (x0 !== x1 || y0 !== y1) {
        onSelectionChange({ x0, y0, x1, y1 });
      } else {
        // Single click (no drag) → deselect
        onSelectionChange(null);
      }

    } else if (drag.tool === 'select-move') {
      // Marquee already updated live in handleMove — nothing more to do.

    } else if (drag.tool === 'lasso') {
      const path = drag.lassoPath ?? [];
      if (path.length >= 3) {
        const coords: [number, number][] = [];
        for (let py = 0; py < canvasH; py++) {
          for (let px = 0; px < canvasW; px++) {
            if (pointInPolygon(px + 0.5, py + 0.5, path)) coords.push([px, py]);
          }
        }
        if (coords.length > 0) {
          const xs = coords.map((c) => c[0]);
          const ys = coords.map((c) => c[1]);
          onSelectionChange({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), pixels: coords });
        }
      }

    } else if (drag.tool === 'move' && drag.floatCols) {
      if (!drag.hasLifted) {
        // User clicked without dragging — no change, push nothing.
      } else {
        // Ensure the float is stamped at the final position (handles edge case
        // where handleMove's last call had dx/dy already applied).
        // The last onPixelsChange in handleMove already committed it; this is a no-op re-stamp.
        const dx = drag.x1! - drag.x0!;
        const dy = drag.y1! - drag.y0!;
        const curFloatX = drag.floatX! + dx;
        const curFloatY = drag.floatY! + dy;
        const combined: PixelGrid = drag.basePixels!.map((row) => row.slice());
        for (let ry = 0; ry < drag.floatH!; ry++) {
          for (let rx = 0; rx < drag.floatW!; rx++) {
            const col = drag.floatCols[ry][rx];
            if (col === null) continue;
            const px = curFloatX + rx, py = curFloatY + ry;
            if (px >= 0 && px < canvasW && py >= 0 && py < canvasH) combined[py][px] = col;
          }
        }
        onPixelsChange(combined);
      }
      // move pixels committed; keep selection at new position (already updated live)
    }
    // Whole-layer move: pixels already committed via onPixelsChange in handleMove.

    setDrag(null);
  };

  const handleLeave = () => onCursorChange(null);

  // Escape cancels an in-flight drag (shape preview, selection, or move).
  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A lifted floating selection must be stamped back where it started.
      if (drag.tool === 'move' && drag.hasLifted && drag.draft) {
        onPixelsChange(drag.draft);
      }
      setDrag(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drag, onPixelsChange]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    const next = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, zoomIdx + delta));
    if (next !== zoomIdx) {
      // Anchor the zoom at the cursor: shift the pan offset so the point under
      // the mouse stays put. The artboard is centered, so growth is symmetric
      // around its center plus the pan offset.
      const board = baseRef.current;
      if (board) {
        const rect = board.getBoundingClientRect();
        const fx = (e.clientX - rect.left) / rect.width;
        const fy = (e.clientY - rect.top) / rect.height;
        if (fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1) {
          const newW = canvasW * ZOOM_LEVELS[next];
          const newH = canvasH * ZOOM_LEVELS[next];
          setPanOffset((p) => ({
            x: p.x - (fx - 0.5) * (newW - rect.width),
            y: p.y - (fy - 0.5) * (newH - rect.height),
          }));
        }
      }
      onZoomChange(next);
      setZoomBadgeVisible(true);
      clearTimeout(zoomBadgeTimerRef.current ?? undefined);
      zoomBadgeTimerRef.current = setTimeout(() => setZoomBadgeVisible(false), 600);
    }
  };

  useEffect(() => {
    const c = minimapRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const mScale = c.width / canvasW;
    for (let yy = 0; yy < canvasH; yy++) {
      for (let xx = 0; xx < canvasW; xx++) {
        ctx.fillStyle = ((Math.floor(xx / 4) + Math.floor(yy / 4)) % 2) ? '#0a0e14' : '#11161d';
        ctx.fillRect(xx * mScale, yy * mScale, mScale, mScale);
      }
    }
    frame.layers.forEach((L: Layer) => {
      if (!L.visible) return;
      ctx.globalAlpha = L.opacity;
      for (let yy = 0; yy < canvasH; yy++) {
        for (let xx = 0; xx < canvasW; xx++) {
          const col = L.pixels[yy][xx];
          if (!col) continue;
          ctx.fillStyle = col;
          ctx.fillRect(xx * mScale, yy * mScale, mScale, mScale);
        }
      }
    });
    ctx.globalAlpha = 1;
  }, [frame]);

  // Show a move cursor when hovering inside an active selection with select or move tool.
  const cursorCss =
    tool === 'pan' ? 'grab'
    : tool === 'move' ? 'move'
    : (tool === 'select' && hoverInSel) ? 'move'
    : ({ pencil: 'crosshair', eraser: 'crosshair', fill: 'cell', picker: 'crosshair',
         line: 'crosshair', rect: 'crosshair', circle: 'crosshair',
         select: 'crosshair', lasso: 'crosshair', wand: 'crosshair' } as Record<string, string>)[tool] ?? 'crosshair';

  return (
    <div style={cvStyles.root}>
      <div style={cvStyles.tabbar}>
        <div style={cvStyles.tab(activeTab === 'editor')}  onClick={() => onTabChange('editor')}>Editor</div>
        <div style={cvStyles.tab(activeTab === 'preview')} onClick={() => onTabChange('preview')}>Preview</div>
        <div style={cvStyles.tab(activeTab === 'split')}   onClick={() => onTabChange('split')}>Split</div>
        <div style={cvStyles.meta}>
          <span style={cvStyles.metaItem}>{canvasW} × {canvasH}</span>
          <span style={cvStyles.metaItem}>·</span>
          <span style={cvStyles.metaItem}>{zoom}×</span>
          <span style={{ ...cvStyles.metaItem, gap: 3 }}>
            <span style={cvStyles.zoomBtn} onClick={() => onZoomChange(Math.max(0, zoomIdx - 1))}>−</span>
            <span style={cvStyles.zoomBtn} onClick={() => onZoomChange(Math.min(ZOOM_LEVELS.length - 1, zoomIdx + 1))}>+</span>
          </span>
        </div>
      </div>

      <div style={cvStyles.viewport} onWheel={handleWheel} ref={viewportRef}>
        <div style={cvStyles.bgPattern}/>
        {zoomBadgeVisible && (
          <div style={cvStyles.zoomBadge}>{zoom}× zoom</div>
        )}
        {(activeTab === 'editor' || activeTab === 'split') && (
          <div style={{ ...cvStyles.artboardWrap, marginRight: activeTab === 'split' ? 24 : 0, transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }}>
            <span style={cvStyles.artboardLabel}>editor · {frame.id}</span>
            <div style={cvStyles.artboard(artboardW, artboardH)} data-spotlight="canvas-board">
              <canvas ref={baseRef}    style={cvStyles.canvasLayered} width={artboardW} height={artboardH}/>
              <canvas ref={onionRef}   style={{ ...cvStyles.canvasLayered, opacity: showOnionSkin ? 1 : 0 }} width={artboardW} height={artboardH}/>
              <canvas ref={ghostRef}   style={{ ...cvStyles.canvasLayered, opacity: ghost?.visible ? 1 : 0 }} width={artboardW} height={artboardH}/>
              <canvas ref={overlayRef} style={cvStyles.canvasLayered} width={artboardW} height={artboardH}/>
              <div
                style={{ position: 'absolute', inset: 0, cursor: cursorCss }}
                onMouseDown={handleDown}
                onMouseMove={handleMove}
                onMouseUp={handleUp}
                onMouseLeave={handleLeave}
                onContextMenu={e => { e.preventDefault(); onContextMenu?.(e.clientX, e.clientY); }}
              />
              {ghost?.visible && (
                <div style={cvStyles.ghostBanner}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconSparkle size={11} stroke="var(--amber)"/>
                    <span>proposed by sindri · {ghost.title}</span>
                  </span>
                  <span style={cvStyles.ghostActions}>
                    <span style={cvStyles.ghostBtn('reject')} onClick={onRejectGhost}>Reject</span>
                    <span style={cvStyles.ghostBtn('refine')} onClick={onRefineGhost}>Refine…</span>
                    <span style={cvStyles.ghostBtn('accept')} onClick={onAcceptGhost}>Accept</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {(activeTab === 'preview' || activeTab === 'split') && (
          <div style={cvStyles.previewWrap}>
            <span style={cvStyles.artboardLabel}>
              preview · {(1000 / (frames[0]?.duration || 120)).toFixed(1)} fps
            </span>
            <canvas ref={previewRef} width={canvasW * 8} height={canvasH * 8} style={cvStyles.previewArt(canvasW * 8, canvasH * 8)}/>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>
              frame {(isPlaying ? previewFrame : frameIdx) + 1} of {frames.length}
            </span>
          </div>
        )}

        {activeTab !== 'preview' && (
          <div style={{ ...cvStyles.minimap, right: miniPos.right, bottom: miniPos.bottom }}>
            <div
              style={{ ...cvStyles.minimapHead, ...(miniDrag ? cvStyles.minimapHeadActive : null) }}
              onMouseDown={startMiniDrag}
            >
              <span>
                <span style={cvStyles.minimapGrip}>
                  <span style={cvStyles.minimapGripDot}/><span style={cvStyles.minimapGripDot}/>
                  <span style={cvStyles.minimapGripDot}/><span style={cvStyles.minimapGripDot}/>
                </span>
                <span style={{ marginLeft: 8 }}><span style={cvStyles.minimapHeadDot}>●</span>preview</span>
              </span>
              <span>1 : 4</span>
            </div>
            <canvas
              ref={minimapRef}
              width={canvasW * 4} height={canvasH * 4}
              style={{ ...cvStyles.minimapCanvas, width: canvasW * 4, height: canvasH * 4 }}
            />
            <div style={cvStyles.minimapMeta}>
              <span>{canvasW} × {canvasH}</span>
              <span>frame {frameIdx + 1}/{frames.length}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
