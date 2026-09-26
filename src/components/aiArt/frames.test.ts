import { describe, expect, it, vi } from 'vitest';
import { EMPTY_HISTORY, framesReducer, makeFrame, naturalCompare, type FrameHistory } from './frames';
import { frameDuration, playOrder } from './useAnimation';

const img = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
const withFrames = (n: number): FrameHistory =>
  framesReducer(EMPTY_HISTORY, { type: 'add', frames: Array.from({ length: n }, (_, i) => makeFrame(`f${i}.png`, img)) });
const names = (h: FrameHistory) => h.present.map((f) => f.name);

describe('frame history', () => {
  it('adds, moves and removes frames', () => {
    let h = withFrames(4);
    h = framesReducer(h, { type: 'move', from: 0, to: 3 }); // drop before index 3
    expect(names(h)).toEqual(['f1.png', 'f2.png', 'f0.png', 'f3.png']);
    h = framesReducer(h, { type: 'move', from: 3, to: 0 });
    expect(names(h)).toEqual(['f3.png', 'f1.png', 'f2.png', 'f0.png']);
    h = framesReducer(h, { type: 'remove', ids: [h.present[1].id] });
    expect(names(h)).toEqual(['f3.png', 'f2.png', 'f0.png']);
  });

  it('duplicates a frame right after itself, with its settings', () => {
    let h = withFrames(2);
    h = framesReducer(h, { type: 'patch', id: h.present[0].id, patch: { offsetX: 4, flipX: true } });
    h = framesReducer(h, { type: 'duplicate', id: h.present[0].id, newId: 'copy' });
    expect(h.present.map((f) => f.id)[1]).toBe('copy');
    expect(h.present[1]).toMatchObject({ offsetX: 4, flipX: true, name: 'f0.png' });
  });

  it('undoes and redoes', () => {
    let h = withFrames(2);
    const id = h.present[0].id;
    h = framesReducer(h, { type: 'patch', id, patch: { scale: 0.5 } });
    h = framesReducer(h, { type: 'undo' });
    expect(h.present[0].scale).toBe(1);
    h = framesReducer(h, { type: 'redo' });
    expect(h.present[0].scale).toBe(0.5);
    h = framesReducer(h, { type: 'undo' });
    h = framesReducer(h, { type: 'undo' }); // back past the add
    expect(h.present).toHaveLength(0);
  });

  it('coalesces a burst of the same edit into one undo step', () => {
    vi.useFakeTimers();
    let h = withFrames(1);
    const id = h.present[0].id;
    for (let i = 1; i <= 5; i++) {
      h = framesReducer(h, { type: 'patch', id, patch: { offsetX: -i }, coalesce: 'nudge' });
      vi.advanceTimersByTime(100);
    }
    expect(h.present[0].offsetX).toBe(-5);
    h = framesReducer(h, { type: 'undo' });
    expect(h.present[0].offsetX).toBe(0);
    // …but a pause starts a new step.
    h = framesReducer(h, { type: 'redo' });
    vi.advanceTimersByTime(2000);
    h = framesReducer(h, { type: 'patch', id, patch: { offsetX: -9 }, coalesce: 'nudge' });
    h = framesReducer(h, { type: 'undo' });
    expect(h.present[0].offsetX).toBe(-5);
    vi.useRealTimers();
  });

  it('expands one frame into several in place, as one undo step', () => {
    let h = withFrames(3);
    const parts = [makeFrame('sheet 01.png', img), makeFrame('sheet 02.png', img)];
    h = framesReducer(h, { type: 'expand', id: h.present[1].id, frames: parts });
    expect(names(h)).toEqual(['f0.png', 'sheet 01.png', 'sheet 02.png', 'f2.png']);
    h = framesReducer(h, { type: 'undo' });
    expect(names(h)).toEqual(['f0.png', 'f1.png', 'f2.png']);
  });

  it('resets', () => {
    expect(framesReducer(withFrames(3), { type: 'reset' })).toBe(EMPTY_HISTORY);
  });
});

describe('playback helpers', () => {
  it('orders loop and ping-pong cycles', () => {
    expect(playOrder(4, 'loop')).toEqual([0, 1, 2, 3]);
    expect(playOrder(4, 'pingpong')).toEqual([0, 1, 2, 3, 2, 1]);
    expect(playOrder(2, 'pingpong')).toEqual([0, 1]);
  });

  it('holds frames for their own duration or the frame rate', () => {
    const f = makeFrame('a', img);
    expect(frameDuration(f, 8)).toBe(125);
    expect(frameDuration({ ...f, duration: 300 }, 8)).toBe(300);
  });

  it('sorts file names naturally', () => {
    expect(['walk_10.png', 'walk_2.png', 'walk_1.png'].sort(naturalCompare)).toEqual(['walk_1.png', 'walk_2.png', 'walk_10.png']);
  });
});
