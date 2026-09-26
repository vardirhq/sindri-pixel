// The animation workspace: stage + transport, the selected frame's
// inspector, and the frame strip, wired to the frame history and keyboard.
// Both the web tool's Animate mode and the editor's Import AI Art dialog embed
// this component, so the two behave identically.

import React from 'react';
import type { Anchor } from '../../lib/animation';
import type { EngineOutput } from './useEngine';
import { splitFrame } from './files';
import { newFrameId, type FrameAction, type FrameHistory, type FramePatch } from './frames';
import { Inspector } from './Inspector';
import { Stage } from './Stage';
import { Timeline } from './Timeline';
import { Transport } from './Transport';
import { frameDuration, type Composition, type Player } from './useAnimation';
import './aiArt.css';

export interface WorkspaceView {
  anchor: Anchor;
  fps: number;
  playback: 'loop' | 'pingpong';
  onion: boolean;
  pixelGrid: boolean;
}

export interface FrameWorkspaceProps {
  history: FrameHistory;
  dispatch: React.Dispatch<FrameAction>;
  engine: EngineOutput;
  composition: Composition;
  player: Player;
  view: WorkspaceView;
  onViewChange: (patch: Partial<WorkspaceView>) => void;
  /** Open a file picker; new frames go at `at`. */
  onPickFiles: (at: number) => void;
  onDropFiles: (files: File[], at: number) => void;
  /** Handle keyboard shortcuts (false while a modal on top has focus). */
  keyboard?: boolean;
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName));

export function FrameWorkspace({
  history, dispatch, engine, composition, player, view, onViewChange, onPickFiles, onDropFiles, keyboard = true,
}: FrameWorkspaceProps) {
  const frames = history.present;
  const index = Math.min(player.index, Math.max(0, frames.length - 1));
  const frame = frames[index];
  const [zoom, setZoom] = React.useState<number | 'fit'>('fit');
  const [resolvedZoom, setResolvedZoom] = React.useState(1);

  const patch = React.useCallback(
    (p: FramePatch, coalesce?: string) => frame && dispatch({ type: 'patch', id: frame.id, patch: p, coalesce }),
    [dispatch, frame],
  );
  const remove = React.useCallback((id: string) => {
    const i = frames.findIndex((f) => f.id === id);
    dispatch({ type: 'remove', ids: [id] });
    if (i <= player.index) player.setIndex(Math.max(0, player.index - 1));
  }, [dispatch, frames, player]);
  const duplicate = React.useCallback((id: string) => {
    const i = frames.findIndex((f) => f.id === id);
    dispatch({ type: 'duplicate', id, newId: newFrameId() });
    player.setIndex(i + 1);
  }, [dispatch, frames, player]);
  const split = React.useCallback(() => {
    if (!frame) return;
    dispatch({ type: 'expand', id: frame.id, frames: splitFrame(frame) });
    player.setIndex(index);
  }, [dispatch, frame, index, player]);
  const move = React.useCallback((from: number, to: number) => {
    dispatch({ type: 'move', from, to });
    player.setIndex(to > from ? to - 1 : to);
  }, [dispatch, player]);

  // Drag on the stage: offsets relative to where the drag started.
  const dragBase = React.useRef<{ x: number; y: number } | null>(null);
  const onDrag = (dx: number, dy: number, phase: 'move' | 'end') => {
    if (!frame) return;
    if (!dragBase.current) dragBase.current = { x: frame.offsetX, y: frame.offsetY };
    patch({ offsetX: dragBase.current.x + dx, offsetY: dragBase.current.y + dy }, 'drag');
    if (phase === 'end') dragBase.current = null;
  };

  React.useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key;
      // Capture phase + stopImmediatePropagation: a host app's own shortcuts
      // (the editor behind the import dialog) must not also fire.
      const handled = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (mod && k.toLowerCase() === 'z') { handled(); dispatch({ type: e.shiftKey ? 'redo' : 'undo' }); return; }
      if (mod && k.toLowerCase() === 'y') { handled(); dispatch({ type: 'redo' }); return; }
      if (mod && k.toLowerCase() === 'd') { handled(); if (frame) duplicate(frame.id); return; }
      if (mod || e.altKey && !k.startsWith('Arrow')) return;
      if (k === ' ') { handled(); player.setPlaying(!player.playing); return; }
      if (k === ',') { handled(); player.step(-1); return; }
      if (k === '.') { handled(); player.step(1); return; }
      if (k === 'Home') { handled(); player.setIndex(0); return; }
      if (k === 'End') { handled(); player.setIndex(frames.length - 1); return; }
      if (!frame) return;
      if (k.startsWith('Arrow')) {
        handled();
        if (e.altKey && (k === 'ArrowLeft' || k === 'ArrowRight')) {
          const to = k === 'ArrowLeft' ? index - 1 : index + 2;
          if (to >= 0 && to <= frames.length) move(index, to);
          return;
        }
        player.setPlaying(false);
        const step = e.shiftKey ? 5 : 1;
        const dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0;
        const dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
        patch({ offsetX: frame.offsetX + dx, offsetY: frame.offsetY + dy }, 'nudge');
        return;
      }
      if (k === 'Delete' || k === 'Backspace') { handled(); remove(frame.id); return; }
      const lower = k.toLowerCase();
      if (lower === 'o') { handled(); onViewChange({ onion: !view.onion }); return; }
      if (lower === 'g') { handled(); onViewChange({ pixelGrid: !view.pixelGrid }); return; }
      if (lower === 'f') { handled(); patch({ flipX: !frame.flipX }); return; }
      if (k === '0') { handled(); setZoom('fit'); return; }
      if (k === '+' || k === '=') { handled(); setZoom(Math.min(32, resolvedZoom + 1)); return; }
      if (k === '-') { handled(); setZoom(Math.max(1, resolvedZoom - 1)); return; }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [keyboard, dispatch, frame, frames.length, index, player, patch, remove, duplicate, move, view, onViewChange, resolvedZoom]);

  const cycleMs = composition.durations.reduce((a, b) => a + b, 0);
  const status = engine.busy
    ? engine.progress
      ? `Reading frames ${engine.progress.done}/${engine.progress.total}`
      : 'Updating…'
    : engine.error;

  return (
    <div className="aa-workspace">
      <div className="aa-main">
        <Stage
          composition={composition}
          index={index}
          onion={view.onion}
          pixelGrid={view.pixelGrid}
          anchor={view.anchor}
          zoom={zoom}
          onZoomResolved={setResolvedZoom}
          draggable={!player.playing && !!composition.composed[index]}
          onDrag={onDrag}
          status={status ? <><span className={engine.busy ? 'aa-spinner' : 'aa-dot-error'} />{status}</> : null}
        />
        <Transport
          player={player}
          count={frames.length}
          fps={view.fps}
          onFps={(fps) => onViewChange({ fps })}
          playback={view.playback}
          onPlayback={(playback) => onViewChange({ playback })}
          onion={view.onion}
          onOnion={(onion) => onViewChange({ onion })}
          pixelGrid={view.pixelGrid}
          onPixelGrid={(pixelGrid) => onViewChange({ pixelGrid })}
          zoom={zoom}
          resolvedZoom={resolvedZoom}
          onZoom={setZoom}
          canUndo={history.past.length > 0}
          canRedo={history.future.length > 0}
          onUndo={() => dispatch({ type: 'undo' })}
          onRedo={() => dispatch({ type: 'redo' })}
          cycleMs={cycleMs}
        />
      </div>
      {frame && (
        <Inspector
          frame={frame}
          index={index}
          result={engine.results.get(frame.id)}
          globalDuration={frameDuration({ ...frame, duration: null }, view.fps)}
          onPatch={patch}
          onSplit={split}
        />
      )}
      <Timeline
        frames={frames}
        composed={composition.composed}
        durations={composition.durations}
        selected={index}
        playing={player.playing}
        onSelect={player.setIndex}
        onMove={move}
        onDuplicate={duplicate}
        onRemove={remove}
        onAdd={() => onPickFiles(frames.length)}
        onDropFiles={onDropFiles}
      />
    </div>
  );
}
