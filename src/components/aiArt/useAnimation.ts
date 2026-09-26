// Composition and playback for the AI-art frame workspace.

import React from 'react';
import { composeFrame, layoutFrames, type Anchor, type Layout } from '../../lib/animation';
import type { RGBAImage } from '../../lib/pixelReconstruction';
import type { FrameResult } from './engine';
import type { FrameItem } from './frames';

export interface AnimSettings {
  anchor: Anchor;
  canvasMode: 'auto' | 'fixed';
  canvasWidth: number;
  canvasHeight: number;
  fps: number;
  playback: 'loop' | 'pingpong';
}

export interface Composition {
  layout: Layout;
  /** Composed frame per input frame (null until its sprite is ready). */
  composed: (RGBAImage | null)[];
  durations: number[];
  ready: boolean;
}

/** Hold time of a frame in ms. */
export function frameDuration(frame: FrameItem, fps: number): number {
  return frame.duration ?? Math.round(1000 / Math.max(1, fps));
}

/** Lay out and compose every frame whose sprite is ready. */
export function useComposition(frames: FrameItem[], results: Map<string, FrameResult>, s: AnimSettings): Composition {
  return React.useMemo(() => {
    const ready = frames.filter((f) => results.has(f.id));
    const inputs = ready.map((f) => ({ sprite: results.get(f.id)!.sprite, offsetX: f.offsetX, offsetY: f.offsetY, flipX: f.flipX }));
    const layout = layoutFrames(
      inputs,
      s.anchor,
      1,
      s.canvasMode === 'fixed' ? { width: s.canvasWidth, height: s.canvasHeight } : undefined,
    );
    const byId = new Map(ready.map((f, i) => [f.id, composeFrame(inputs[i], layout.positions[i], layout.width, layout.height)]));
    const positions = new Map(ready.map((f, i) => [f.id, layout.positions[i]]));
    return {
      layout: { ...layout, positions: frames.map((f) => positions.get(f.id) ?? { x: 0, y: 0 }) },
      composed: frames.map((f) => byId.get(f.id) ?? null),
      durations: frames.map((f) => frameDuration(f, s.fps)),
      ready: ready.length === frames.length,
    };
  }, [frames, results, s.anchor, s.canvasMode, s.canvasWidth, s.canvasHeight, s.fps]);
}

/** The play order of frame indices for one cycle. */
export function playOrder(count: number, playback: 'loop' | 'pingpong'): number[] {
  const forward = Array.from({ length: count }, (_, i) => i);
  if (playback === 'loop' || count < 3) return forward;
  return [...forward, ...forward.slice(1, -1).reverse()];
}

export interface Player {
  index: number;
  playing: boolean;
  setIndex: (i: number) => void;
  setPlaying: (p: boolean) => void;
  step: (delta: number) => void;
}

/**
 * Playback clock: advances `index` by each frame's own duration, looping or
 * ping-ponging. Pausing leaves you on the current frame; stepping pauses.
 */
export function usePlayer(count: number, durations: number[], playback: 'loop' | 'pingpong'): Player {
  const [index, setIndexState] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const cursor = React.useRef(0); // position within playOrder
  const durationsRef = React.useRef(durations);
  durationsRef.current = durations;

  React.useEffect(() => {
    if (index >= count) setIndexState(Math.max(0, count - 1));
  }, [count, index]);

  React.useEffect(() => {
    if (!playing || count < 2) return;
    const order = playOrder(count, playback);
    let pos = Math.max(0, order.indexOf(index));
    cursor.current = pos;
    let last = performance.now();
    let acc = 0;
    let raf = 0;
    const tick = (now: number) => {
      acc += now - last;
      last = now;
      let changed = false;
      for (let guard = 0; guard < 64 && acc >= (durationsRef.current[order[pos]] ?? 100); guard++) {
        acc -= durationsRef.current[order[pos]] ?? 100;
        pos = (pos + 1) % order.length;
        changed = true;
      }
      if (changed) {
        cursor.current = pos;
        setIndexState(order[pos]);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Restart the clock only when play state or the sequence shape changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, count, playback]);

  const setIndex = React.useCallback((i: number) => {
    setPlaying(false);
    setIndexState(i);
  }, []);
  const step = React.useCallback(
    (delta: number) => {
      setPlaying(false);
      setIndexState((i) => (count ? (i + delta + count) % count : 0));
    },
    [count],
  );
  return { index, playing, setIndex, setPlaying, step };
}
