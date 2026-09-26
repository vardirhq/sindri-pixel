// The animation stage: the current frame at a crisp integer zoom over a
// checkerboard, with onion skins of its neighbors, the ground/center guide
// the frames are aligned to, an optional pixel grid, and drag-to-position.

import React from 'react';
import type { Anchor } from '../../lib/animation';
import { imageCanvas, tintedCanvas, token, useBoxSize } from './canvas';
import type { Composition } from './useAnimation';

export interface StageProps {
  composition: Composition;
  index: number;
  onion: boolean;
  pixelGrid: boolean;
  anchor: Anchor;
  /** 'fit' picks the largest integer zoom that fits. */
  zoom: number | 'fit';
  onZoomResolved?: (zoom: number) => void;
  /** Whether the current frame can be dragged (paused, sprite ready). */
  draggable: boolean;
  /** Drag delta in art pixels since the pointer went down. */
  onDrag?: (dx: number, dy: number, phase: 'move' | 'end') => void;
  status?: React.ReactNode;
}

const MAX_ZOOM = 32;

export function Stage({ composition, index, onion, pixelGrid, anchor, zoom, onZoomResolved, draggable, onDrag, status }: StageProps) {
  const [boxRef, box] = useBoxSize();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const { layout, composed } = composition;
  const W = layout.width;
  const H = layout.height;
  const fitZoom = Math.max(1, Math.min(MAX_ZOOM, Math.floor(Math.min((box.w - 32) / W, (box.h - 32) / H)) || 1));
  const z = zoom === 'fit' ? fitZoom : zoom;

  React.useEffect(() => {
    onZoomResolved?.(z);
  }, [z, onZoomResolved]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * z * dpr);
    canvas.height = Math.round(H * z * dpr);
    canvas.style.width = `${W * z}px`;
    canvas.style.height = `${H * z}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    const px = z * dpr;
    const draw = (img: CanvasImageSource) => ctx.drawImage(img, 0, 0, W * px, H * px);

    const n = composed.length;
    if (onion && n > 1) {
      const prev = composed[(index - 1 + n) % n];
      const next = composed[(index + 1) % n];
      ctx.globalAlpha = 0.3;
      if (next && n > 2) draw(tintedCanvas(next, token('--cyan') || '#6dbcdb'));
      if (prev) draw(tintedCanvas(prev, token('--red') || '#e05555'));
      ctx.globalAlpha = 1;
    }
    const current = composed[index];
    if (current) draw(imageCanvas(current));

    if (pixelGrid && z >= 4) {
      ctx.fillStyle = 'rgba(230, 225, 212, 0.07)';
      for (let x = 1; x < W; x++) ctx.fillRect(Math.round(x * px), 0, 1, canvas.height);
      for (let y = 1; y < H; y++) ctx.fillRect(0, Math.round(y * px), canvas.width, 1);
    }

    // Alignment guide: where every frame's anchor lands.
    if (anchor !== 'none') {
      const amber = token('--amber') || '#f0c050';
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = amber;
      const gx = Math.round(layout.origin.x * px);
      const gy = Math.round(layout.origin.y * px);
      const t = Math.max(1, Math.round(dpr));
      if (anchor === 'feet') {
        ctx.fillRect(0, gy - t, canvas.width, t);
        ctx.fillRect(gx, gy - Math.round(3 * px), t, Math.round(3 * px));
      } else {
        ctx.fillRect(gx - Math.round(2 * px), gy, Math.round(4 * px), t);
        ctx.fillRect(gx, gy - Math.round(2 * px), t, Math.round(4 * px));
      }
      ctx.globalAlpha = 1;
    }
  }, [composed, index, onion, pixelGrid, anchor, W, H, z, layout.origin.x, layout.origin.y]);

  // Drag to reposition the current frame, in whole art pixels.
  const drag = React.useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const [dragDelta, setDragDelta] = React.useState<{ dx: number; dy: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (!draggable || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
    setDragDelta({ dx: 0, dy: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = Math.round((e.clientX - d.x) / z);
    const dy = Math.round((e.clientY - d.y) / z);
    if (dx === d.dx && dy === d.dy) return;
    d.dx = dx;
    d.dy = dy;
    setDragDelta({ dx, dy });
    onDrag?.(dx, dy, 'move');
  };
  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragDelta(null);
    onDrag?.(d.dx, d.dy, 'end');
  };

  const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');

  return (
    <div className="aa-stage" ref={boxRef}>
      <div className="aa-stage-canvas" style={{ width: W * z, height: H * z }}>
        <canvas
          ref={canvasRef}
          className={draggable ? (dragDelta ? 'grabbing' : 'grab') : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          aria-label={`Frame ${index + 1} of ${composed.length}`}
          role="img"
        />
      </div>
      {dragDelta && (
        <div className="aa-stage-hud">
          x {signed(dragDelta.dx)} · y {signed(dragDelta.dy)}
        </div>
      )}
      {status && <div className="aa-stage-status">{status}</div>}
      <div className="aa-stage-dims">{W} × {H}px · {z}×</div>
    </div>
  );
}
