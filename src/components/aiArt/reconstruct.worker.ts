// Web Worker host for the reconstruction engine. Sources are sent once when
// frames are added; each settings change posts a `run`, and a newer run
// cancels an older one between frames.

import { EngineState, type WorkerIn, type WorkerOut } from './engine';

const state = new EngineState();
const post = (msg: WorkerOut, transfer: Transferable[] = []) =>
  (self as unknown as { postMessage(m: WorkerOut, t: Transferable[]): void }).postMessage(msg, transfer);

self.onmessage = async (event: MessageEvent<WorkerIn>) => {
  const msg = event.data;
  if (msg.type === 'add') state.add(msg.id, msg.image);
  else if (msg.type === 'remove') state.remove(msg.ids);
  else {
    try {
      const result = await state.run(msg, (done, total) => post({ type: 'progress', job: msg.job, done, total }));
      if (result) post({ type: 'result', ...result }, result.results.map((r) => r.sprite.data.buffer as ArrayBuffer));
    } catch (e) {
      post({ type: 'error', job: msg.job, message: e instanceof Error ? e.message : 'Reconstruction failed' });
    }
  }
};
