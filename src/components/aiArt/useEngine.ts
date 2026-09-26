// React binding for the reconstruction engine: keeps the worker's sources in
// sync with the frame list and reruns whenever frames or settings change.
// Results arrive asynchronously; the previous results stay on screen (marked
// stale) until the new ones land, so nothing flashes empty while dragging a
// slider.

import React from 'react';
import type { PixelArtOptions } from '../../lib/pixelReconstruction';
import { EngineState, type FrameResult, type WorkerIn, type WorkerOut } from './engine';
import type { FrameItem } from './frames';

interface EngineTransport {
  send(msg: WorkerIn): void;
  dispose(): void;
}

/** A worker when available, otherwise the same engine on the main thread. */
function createTransport(onMessage: (msg: WorkerOut) => void): EngineTransport {
  try {
    const worker = new Worker(new URL('./reconstruct.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerOut>) => onMessage(e.data);
    return { send: (msg) => worker.postMessage(msg), dispose: () => worker.terminate() };
  } catch {
    const state = new EngineState();
    return {
      send: (msg) => {
        if (msg.type === 'add') state.add(msg.id, msg.image);
        else if (msg.type === 'remove') state.remove(msg.ids);
        else {
          state
            .run(msg, (done, total) => onMessage({ type: 'progress', job: msg.job, done, total }))
            .then((r) => r && onMessage({ type: 'result', ...r }))
            .catch((e) => onMessage({ type: 'error', job: msg.job, message: e instanceof Error ? e.message : 'Reconstruction failed' }));
        }
      },
      dispose: () => {},
    };
  }
}

export interface EngineOutput {
  results: Map<string, FrameResult>;
  sharedCellSize: number | null;
  busy: boolean;
  progress: { done: number; total: number } | null;
  error: string | null;
}

export function useEngine(frames: FrameItem[], options: PixelArtOptions, matchPixelSize: boolean): EngineOutput {
  const [out, setOut] = React.useState<EngineOutput>({
    results: new Map(),
    sharedCellSize: null,
    busy: false,
    progress: null,
    error: null,
  });
  const jobRef = React.useRef(0);
  const transportRef = React.useRef<EngineTransport | null>(null);
  const sentRef = React.useRef(new Set<string>());

  React.useEffect(() => {
    const transport = createTransport((msg) => {
      if (msg.job !== jobRef.current) return;
      if (msg.type === 'progress') setOut((o) => ({ ...o, progress: { done: msg.done, total: msg.total } }));
      else if (msg.type === 'error') setOut((o) => ({ ...o, busy: false, progress: null, error: msg.message }));
      else {
        setOut({
          results: new Map(msg.results.map((r) => [r.id, r])),
          sharedCellSize: msg.sharedCellSize,
          busy: false,
          progress: null,
          error: null,
        });
      }
    });
    transportRef.current = transport;
    const sent = sentRef.current;
    return () => {
      transport.dispose();
      sent.clear();
    };
  }, []);

  // Keep the engine's sources in step with the frame list (by source object:
  // duplicated frames share one source but have their own id).
  React.useEffect(() => {
    const transport = transportRef.current;
    if (!transport) return;
    const live = new Set(frames.map((f) => f.id));
    const gone = [...sentRef.current].filter((id) => !live.has(id));
    if (gone.length) {
      transport.send({ type: 'remove', ids: gone });
      gone.forEach((id) => sentRef.current.delete(id));
    }
    for (const f of frames) {
      if (sentRef.current.has(f.id)) continue;
      transport.send({ type: 'add', id: f.id, image: f.source });
      sentRef.current.add(f.id);
    }
  }, [frames]);

  // Rerun on anything that affects reconstruction (not offsets or timing).
  const key = JSON.stringify([frames.map((f) => [f.id, f.scale]), options, matchPixelSize]);
  React.useEffect(() => {
    const transport = transportRef.current;
    if (!transport) return;
    const job = ++jobRef.current;
    if (frames.length === 0) {
      setOut({ results: new Map(), sharedCellSize: null, busy: false, progress: null, error: null });
      return;
    }
    setOut((o) => ({ ...o, busy: true, error: null }));
    transport.send({
      type: 'run',
      job,
      frames: frames.map((f) => ({ id: f.id, scale: f.scale })),
      options,
      matchPixelSize,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return out;
}
