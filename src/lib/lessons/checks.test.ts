import { describe, expect, it } from 'vitest';
import { enclosedPixels, evaluate, evaluateStep, inFamily, stepDone } from './checks';
import type { EditorState, LessonStep } from './types';

const blank = (w: number, h: number): (string | null)[][] => Array.from({ length: h }, () => Array(w).fill(null));
const state = (over: Partial<EditorState> = {}): EditorState => ({
  tool: 'pencil', color: '#1a1a1a', frame: blank(8, 8), allFrames: [blank(8, 8)], frameIndex: 0, frameCount: 1,
  layerCount: 1, tagCount: 0, onion: false, symmetry: 'off', playing: false, ...over,
});
/** A square outline of `c` from (x0,y0) to (x1,y1) inclusive. */
const box = (f: (string | null)[][], x0: number, y0: number, x1: number, y1: number, c = '#1a1a1a') => {
  for (let x = x0; x <= x1; x++) { f[y0][x] = c; f[y1][x] = c; }
  for (let y = y0; y <= y1; y++) { f[y][x0] = c; f[y][x1] = c; }
  return f;
};

describe('colour families', () => {
  it('classifies by brightness and hue', () => {
    expect(inFamily('#1a1a1a', 'dark')).toBe(true);
    expect(inFamily('#e6e1d4', 'light')).toBe(true);
    expect(inFamily('#808080', 'grey')).toBe(true);
    expect(inFamily('#e05555', 'red')).toBe(true);
    expect(inFamily('#d4541e', 'orange')).toBe(true);
    expect(inFamily('#9bb070', 'green')).toBe(true);
    expect(inFamily('#2f4fbf', 'blue')).toBe(true);
    expect(inFamily('#6dbcdb', 'cyan')).toBe(true);
    // A near-black red is dark, not red; a grey is no hue.
    expect(inFamily('#2a0505', 'red')).toBe(false);
    expect(inFamily('#808080', 'red')).toBe(false);
  });
});

describe('checks', () => {
  it('tool and colour', () => {
    expect(evaluate({ type: 'tool', tool: 'pencil' }, state())).toMatchObject({ label: 'Use the Pencil', met: true });
    expect(evaluate({ type: 'tool', tool: 'fill' }, state()).met).toBe(false);
    expect(evaluate({ type: 'color', family: 'dark' }, state())).toMatchObject({ label: 'Pick a dark colour', met: true });
    expect(evaluate({ type: 'color', family: 'red' }, state()).met).toBe(false);
    expect(evaluate({ type: 'color', hex: ['#1A1A1A'] }, state()).met).toBe(true);
  });

  it('counts pixels in a region, with progress', () => {
    const f = blank(8, 8);
    f[1][1] = '#e05555'; f[1][2] = '#e05555'; f[6][6] = '#e05555';
    const r = evaluate({ type: 'pixels', min: 3, region: { x: 0, y: 0, w: 4, h: 4 }, family: 'red' }, state({ frame: f }));
    expect(r).toMatchObject({ met: false, progress: '2 / 3' });
    expect(r.label).toBe('Place 3 pixels of a red in the highlighted area');
  });

  it('knows a closed outline from one with a gap', () => {
    const closed = box(blank(8, 8), 1, 1, 5, 5);
    expect(enclosedPixels(closed)).toBe(9);
    expect(evaluate({ type: 'closed', minInterior: 4 }, state({ frame: closed })).met).toBe(true);
    const open = box(blank(8, 8), 1, 1, 5, 5);
    open[3][5] = null; // a one-pixel gap
    expect(enclosedPixels(open)).toBe(0);
    expect(evaluate({ type: 'closed' }, state({ frame: open })).met).toBe(false);
    // Only interiors inside the region count.
    expect(enclosedPixels(closed, { x: 0, y: 0, w: 3, h: 3 })).toBe(1);
  });

  it('measures how much of a region is filled', () => {
    const f = box(blank(8, 8), 0, 0, 3, 3, '#e05555');
    const r = evaluate({ type: 'filled', region: { x: 0, y: 0, w: 4, h: 4 }, share: 0.9, family: 'red' }, state({ frame: f }));
    expect(r).toMatchObject({ met: false, progress: '75%' });
  });

  it('compares with the example within a tolerance', () => {
    const example = blank(8, 8);
    example[2][2] = '#e05555'; example[2][3] = '#e05555'; example[2][4] = '#e05555'; example[2][5] = '#e05555';
    const f = blank(8, 8);
    f[2][2] = '#d84f50'; f[2][3] = '#e05555'; f[2][4] = '#e05555'; // close enough; one missing
    expect(evaluate({ type: 'matches', share: 0.7 }, state({ frame: f }), example)).toMatchObject({ met: true, progress: '75%' });
    expect(evaluate({ type: 'matches', share: 0.9 }, state({ frame: f }), example).met).toBe(false);
  });

  it('document and editor state', () => {
    const s = state({ frameCount: 3, layerCount: 2, tagCount: 1, onion: true, symmetry: 'v', playing: true, frameIndex: 1 });
    expect(evaluate({ type: 'frames', min: 3 }, s).met).toBe(true);
    expect(evaluate({ type: 'layers', min: 3 }, s)).toMatchObject({ met: false, progress: '2 / 3' });
    expect(evaluate({ type: 'tags', min: 1 }, s).met).toBe(true);
    expect(evaluate({ type: 'onion', on: true }, s).met).toBe(true);
    expect(evaluate({ type: 'symmetry', mode: 'v' }, s).label).toBe('Turn on vertical symmetry');
    expect(evaluate({ type: 'playing' }, s).met).toBe(true);
    expect(evaluate({ type: 'frameIndex', index: 1 }, s)).toMatchObject({ label: 'Go to frame 2', met: true });
  });

  it('counts colours across the whole sprite', () => {
    const a = blank(4, 4); a[0][0] = '#111111'; a[0][1] = '#222222';
    const b = blank(4, 4); b[0][0] = '#333333'; b[1][1] = '#111111';
    expect(evaluate({ type: 'maxColors', max: 2 }, state({ allFrames: [a, b] }))).toMatchObject({ met: false, progress: '3 now' });
  });

  it('a step is done only when every check passes', () => {
    const step: LessonStep = { id: 's', title: 't', instruction: 'i', checks: [{ type: 'tool', tool: 'pencil' }, { type: 'color', family: 'red' }] };
    expect(stepDone(evaluateStep(step, state()))).toBe(false);
    expect(stepDone(evaluateStep(step, state({ color: '#e05555' })))).toBe(true);
    expect(stepDone([])).toBe(false);
  });
});
