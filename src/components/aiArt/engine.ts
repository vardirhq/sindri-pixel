// Reconstruction engine for the AI-art frame workspace (web tool and
// editor): turns a set of source frames into downscaled sprites with one
// shared palette. Runs inside a Web Worker (see reconstruct.worker.ts) so the
// page stays responsive while large images are analyzed; `useEngine` falls
// back to the main thread where workers are unavailable.

import {
  countDistinctColors,
  reconstructSequence,
  type GridDetectionResult,
  type PixelArtOptions,
  type RGBAImage,
} from '../../lib/pixelReconstruction';
import { planGrids, type GridCache } from '../../lib/animation';

export interface JobFrame {
  id: string;
  scale: number;
}

export interface JobRequest {
  job: number;
  frames: JobFrame[];
  options: PixelArtOptions;
  matchPixelSize: boolean;
}

export interface FrameResult {
  id: string;
  sprite: RGBAImage;
  detection: GridDetectionResult;
  colorCount: number;
}

export interface JobResult {
  job: number;
  results: FrameResult[];
  sharedCellSize: number | null;
}

export type WorkerIn =
  | { type: 'add'; id: string; image: RGBAImage }
  | { type: 'remove'; ids: string[] }
  | ({ type: 'run' } & JobRequest);

export type WorkerOut =
  | { type: 'progress'; job: number; done: number; total: number }
  | ({ type: 'result' } & JobResult)
  | { type: 'error'; job: number; message: string };

/** Frame sources plus the grid cache that makes re-runs cheap. */
export class EngineState {
  sources = new Map<string, RGBAImage>();
  cache: GridCache = new Map();
  latestJob = 0;

  add(id: string, image: RGBAImage) {
    this.sources.set(id, image);
  }

  remove(ids: string[]) {
    for (const id of ids) {
      this.sources.delete(id);
      for (const key of [...this.cache.keys()]) if (key.startsWith(`${id}:`)) this.cache.delete(key);
    }
  }

  /**
   * Run one job, yielding between frames so a newer job can cancel it (the
   * slider moved again) and progress can be reported. Resolves null if
   * superseded.
   */
  async run(req: JobRequest, progress: (done: number, total: number) => void): Promise<JobResult | null> {
    this.latestJob = req.job;
    const frames = req.frames
      .filter((f) => this.sources.has(f.id))
      .map((f) => ({ id: f.id, source: this.sources.get(f.id)!, scale: f.scale }));
    const stale = () => this.latestJob !== req.job;
    const tick = () => new Promise((r) => setTimeout(r, 0));

    // Warm the per-frame grid cache one frame at a time (the slow part).
    for (let i = 0; i < frames.length; i++) {
      await tick();
      if (stale()) return null;
      planGrids([frames[i]], req.options, false, this.cache);
      progress(i + 1, frames.length);
    }
    await tick();
    if (stale()) return null;
    const plan = planGrids(frames, req.options, req.matchPixelSize, this.cache);
    const out = reconstructSequence(
      frames.map((f, i) => ({ source: f.source, grid: plan.grids[i] })),
      req.options,
    );
    return {
      job: req.job,
      sharedCellSize: plan.sharedCellSize,
      results: out.map((r, i) => ({
        id: frames[i].id,
        sprite: r.result,
        detection: r.detection,
        colorCount: countDistinctColors(r.result),
      })),
    };
  }
}
