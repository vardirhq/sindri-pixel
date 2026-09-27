import { describe, expect, it } from 'vitest';
import {
  clampTags, freshTagName, nextPlayFrame, tagSequence, tagsAfterDelete, tagsAfterInsert, tagsAfterMove, validateTags,
  type FrameTag,
} from './tags';

const tag = (from: number, to: number, direction: FrameTag['direction'] = 'forward', name = 't'): FrameTag =>
  ({ id: name, name, from, to, direction });
const ranges = (ts: FrameTag[]) => ts.map((t) => [t.from, t.to]);

describe('tags follow frame edits', () => {
  // idle 0–3, run 4–9
  const tags = [tag(0, 3, 'forward', 'idle'), tag(4, 9, 'forward', 'run')];

  it('grow when a frame is inserted inside, shift when before', () => {
    expect(ranges(tagsAfterInsert(tags, 2))).toEqual([[0, 4], [5, 10]]);
    expect(ranges(tagsAfterInsert(tags, 0))).toEqual([[1, 4], [5, 10]]);
    // Right after idle's last frame: the new frame starts run, not idle.
    expect(ranges(tagsAfterInsert(tags, 4))).toEqual([[0, 3], [5, 10]]);
  });

  it('shrink when a frame is deleted, and vanish when emptied', () => {
    expect(ranges(tagsAfterDelete(tags, 0))).toEqual([[0, 2], [3, 8]]);
    expect(ranges(tagsAfterDelete(tags, 9))).toEqual([[0, 3], [4, 8]]);
    expect(tagsAfterDelete([tag(2, 2)], 2)).toEqual([]);
  });

  it('let a moved frame leave one tag and join another', () => {
    // Frame 1 (idle) moves to index 6 (inside run).
    expect(ranges(tagsAfterMove(tags, 1, 6))).toEqual([[0, 2], [3, 9]]);
    // A one-frame tag travels with its frame.
    expect(ranges(tagsAfterMove([tag(2, 2)], 2, 7))).toEqual([[7, 7]]);
    expect(tagsAfterMove(tags, 3, 3)).toBe(tags);
  });

  it('clamp to the frame count', () => {
    expect(ranges(clampTags([tag(2, 12), tag(20, 22)], 10))).toEqual([[2, 9]]);
  });
});

describe('tag playback', () => {
  it('orders frames by direction', () => {
    expect(tagSequence(tag(2, 5))).toEqual([2, 3, 4, 5]);
    expect(tagSequence(tag(2, 5, 'reverse'))).toEqual([5, 4, 3, 2]);
    expect(tagSequence(tag(2, 5, 'pingpong'))).toEqual([2, 3, 4, 5, 4, 3]);
    expect(tagSequence(tag(2, 3, 'pingpong'))).toEqual([2, 3]);
  });

  it('loops inside the tag, ping-pong passing frames twice', () => {
    const t = tag(1, 3, 'pingpong');
    const frames: number[] = [];
    let step = 0;
    for (let i = 0; i < 8; i++) {
      const next = nextPlayFrame(10, t, step);
      frames.push(next.frame);
      step = next.step;
    }
    expect(frames).toEqual([2, 3, 2, 1, 2, 3, 2, 1]);
    // Without a tag: every frame, forward.
    expect(nextPlayFrame(3, null, 2)).toEqual({ frame: 0, step: 0 });
  });
});

describe('tag names and files', () => {
  it('suggests an unused name', () => {
    expect(freshTagName([])).toBe('tag');
    expect(freshTagName([tag(0, 0, 'forward', 'tag'), tag(0, 0, 'forward', 'tag 2')])).toBe('tag 3');
  });

  it('accepts valid tags and rejects broken ones', () => {
    expect(validateTags(undefined, 4)).toEqual([]);
    expect(validateTags([tag(0, 3, 'pingpong', 'run')], 4)).toEqual([tag(0, 3, 'pingpong', 'run')]);
    expect(() => validateTags([tag(0, 4)], 4)).toThrow(/outside/);
    expect(() => validateTags([{ ...tag(0, 1), direction: 'sideways' }], 4)).toThrow(/direction/);
    expect(() => validateTags('run', 4)).toThrow(/list/);
  });
});
