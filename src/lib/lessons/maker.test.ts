import { describe, expect, it } from 'vitest';
import type { Frame } from '../../types';
import { evaluateStep, stepDone } from './checks';
import { draftToLesson, familyOf, newDraft, recordStep, snapshotBefore, touch, type MakerContext, type MakerSnapshot } from './maker';
import type { EditorState } from './types';

const W = 12;
const blank = () => Array.from({ length: W }, () => Array<string | null>(W).fill(null));
const frame = (pixels: (string | null)[][], id = 'f'): Frame => ({ id, duration: 100, layers: [{ id: `${id}l`, name: 'l', visible: true, opacity: 1, pixels }] });
const snap = (frames: Frame[], over: Partial<MakerSnapshot> = {}): MakerSnapshot => ({ frames, w: W, h: W, swatches: [], tags: [], frameIdx: 0, ...over });
const ctx = (over: Partial<MakerContext> = {}): MakerContext => ({ tool: 'pencil', color: '#1a1c2c', onion: false, symmetry: 'off', ...over });
const box = (g: (string | null)[][], c: string) => {
  for (let i = 2; i <= 7; i++) { g[2][i] = c; g[7][i] = c; g[i][2] = c; g[i][7] = c; }
  return g;
};
const learner = (frameGrid: (string | null)[][], over: Partial<EditorState> = {}): EditorState => ({
  tool: 'pencil', color: '#1a1c2c', frame: frameGrid, allFrames: [frameGrid], frameIndex: 0, frameCount: 1,
  layerCount: 1, tagCount: 0, onion: false, symmetry: 'off', playing: false, ...over,
});

describe('recording a step', () => {
  it('drawing an outline becomes “draw the outline, closed, here”', () => {
    const after = box(blank(), '#1a1c2c');
    const r = recordStep(snap([frame(blank())]), snap([frame(after)]), ctx(), ctx());
    expect(r.title).toBe('Draw the outline');
    expect(r.region).toEqual({ x: 1, y: 1, w: 8, h: 8 });
    expect(r.spotlight).toBe('canvas');
    expect(r.tools).toEqual(['pencil']);
    expect(r.checks).toEqual([
      { type: 'pixels', min: 16, region: { x: 1, y: 1, w: 8, h: 8 }, family: 'dark' },
      { type: 'closed', region: { x: 1, y: 1, w: 8, h: 8 }, minInterior: 13 },
    ]);
    // The recorded step is passable by what the author drew, not by less.
    const step = { id: 's', ...r };
    expect(stepDone(evaluateStep(step, learner(after)))).toBe(true);
    const gap = box(blank(), '#1a1c2c'); gap[4][2] = null;
    expect(stepDone(evaluateStep(step, learner(gap)))).toBe(false);
  });

  it('a fill becomes “fill the area”', () => {
    const before = box(blank(), '#1a1c2c');
    const after = box(blank(), '#1a1c2c');
    for (let y = 3; y <= 6; y++) for (let x = 3; x <= 6; x++) after[y][x] = '#38b764';
    const r = recordStep(snap([frame(before)]), snap([frame(after)]), ctx(), ctx({ tool: 'fill' }));
    expect(r.title).toBe('Fill the area');
    expect(r.checks).toEqual([{ type: 'filled', region: { x: 3, y: 3, w: 4, h: 4 }, share: 0.9, family: 'green' }]);
  });

  it('settings-only steps: tool, colour, onion, symmetry', () => {
    const s = snap([frame(blank())]);
    expect(recordStep(s, s, ctx(), ctx({ tool: 'shade' }))).toMatchObject({ title: 'Pick the Shade', checks: [{ type: 'tool', tool: 'shade' }], spotlight: 'toolbar' });
    expect(recordStep(s, s, ctx(), ctx({ color: '#e05555' }))).toMatchObject({ title: 'Pick a red', checks: [{ type: 'color', family: 'red' }], spotlight: 'palette' });
    expect(recordStep(s, s, ctx(), ctx({ onion: true }))).toMatchObject({ title: 'Turn on onion skin', checks: [{ type: 'onion', on: true }] });
    expect(recordStep(s, s, ctx(), ctx({ symmetry: 'v' })).checks).toEqual([{ type: 'symmetry', mode: 'v' }]);
    expect(recordStep(s, s, ctx(), ctx())).toMatchObject({ title: 'Read this', checks: [] });
  });

  it('timeline changes: frames and tags', () => {
    const one = snap([frame(blank(), 'a')]);
    const two = snap([frame(blank(), 'a'), frame(blank(), 'b')], { frameIdx: 1 });
    expect(recordStep(one, two, ctx(), ctx())).toMatchObject({
      title: 'Add a frame', spotlight: 'timeline',
      checks: [{ type: 'frames', min: 2 }, { type: 'frameIndex', index: 1 }],
    });
    const tagged = { ...two, tags: [{ id: 't', name: 'run', from: 0, to: 1, direction: 'forward' as const }] };
    expect(recordStep(two, tagged, ctx(), ctx())).toMatchObject({ title: 'Tag the frames', checks: [{ type: 'tags', min: 1 }] });
  });

  it('names colours by family', () => {
    expect(familyOf('#38b764')).toBe('green');
    expect(familyOf('#1a1c2c')).toBe('dark');
    expect(familyOf('#f4f4f4')).toBe('light');
    expect(familyOf('#1a1a1a')).toBe('dark');
    expect(familyOf('#808080')).toBe('grey');
  });
});

describe('drafts', () => {
  const start = snap([frame(blank())]);
  it('become lessons that start where a step starts', () => {
    const d = newDraft(start);
    const afterOne = snap([frame(box(blank(), '#1a1c2c'))]);
    d.steps.push({ id: 's1', title: 'Outline', instruction: 'i', checks: [], after: afterOne });
    d.steps.push({ id: 's2', title: 'Fill', instruction: 'i', checks: [], after: null });
    expect(snapshotBefore(d, 0)).toBe(d.start);
    expect(snapshotBefore(d, 1)).toBe(afterOne);
    expect(snapshotBefore(d, 2)).toBe(afterOne); // step 2 recorded nothing: falls back
    const fromTwo = draftToLesson(d, 1);
    expect(fromTwo.start.frames![0].layers[0].pixels).toEqual(afterOne.frames[0].layers[0].pixels);
    expect(fromTwo.steps).toHaveLength(2);
    expect('after' in fromTwo.steps[0]).toBe(false);
  });

  it('any edit un-clears', () => {
    const d = { ...newDraft(start), cleared: true };
    expect(touch(d, { title: 'New' })).toMatchObject({ title: 'New', cleared: false });
  });
});
