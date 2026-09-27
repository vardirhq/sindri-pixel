import { describe, expect, it } from 'vitest';
import { makeShader } from '../drawing';
import { BUILTIN_LESSONS } from './builtin';
import { evaluateStep, stepDone } from './checks';
import type { EditorState, Lesson } from './types';
import { validateLesson } from './validate';

const blank = (w: number, h: number): (string | null)[][] => Array.from({ length: h }, () => Array(w).fill(null));
const lesson = (id: string): Lesson => BUILTIN_LESSONS.find((l) => l.id === id)!;
const state = (l: Lesson, over: Partial<EditorState>): EditorState => ({
  tool: 'pencil', color: '#1a1c2c', frame: blank(l.start.w, l.start.h), allFrames: [], frameIndex: 0, frameCount: 1,
  layerCount: 1, tagCount: 0, onion: false, symmetry: 'off', playing: false, ...over,
});
const done = (l: Lesson, stepId: string, s: EditorState) => stepDone(evaluateStep(l.steps.find((x) => x.id === stepId)!, s));

describe('built-in lessons', () => {
  it('are valid lesson files', () => {
    for (const l of BUILTIN_LESSONS) expect(validateLesson(JSON.parse(JSON.stringify(l))).id).toBe(l.id);
    expect(new Set(BUILTIN_LESSONS.map((l) => l.id)).size).toBe(BUILTIN_LESSONS.length);
  });

  describe('Your first sprite', () => {
    const l = lesson('first-sprite');
    const ex = (id: string) => l.steps.find((s) => s.id === id)!.example!;

    it('each step passes on its own example and not on the state before it', () => {
      expect(done(l, 'outline', state(l, { frame: blank(16, 16) }))).toBe(false);
      expect(done(l, 'outline', state(l, { frame: ex('outline') }))).toBe(true);
      expect(done(l, 'fill', state(l, { frame: ex('outline') }))).toBe(false);
      expect(done(l, 'fill', state(l, { frame: ex('eyes') }))).toBe(true);
      expect(done(l, 'eyes', state(l, { frame: ex('eyes') }))).toBe(true);
      expect(done(l, 'shadow', state(l, { frame: ex('eyes') }))).toBe(false);
      expect(done(l, 'shadow', state(l, { frame: ex('shadow') }))).toBe(true);
      expect(done(l, 'highlight', state(l, { frame: ex('shadow') }))).toBe(false);
      expect(done(l, 'highlight', state(l, { frame: ex('highlight') }))).toBe(true);
    });

    it('an outline with a gap does not pass', () => {
      const gap = ex('outline').map((r) => r.slice());
      gap[10][1] = null;
      expect(done(l, 'outline', state(l, { frame: gap }))).toBe(false);
    });

    it('the Shade tool finds the lesson’s green ramp from its palette', () => {
      const shade = makeShader(l.start.swatches!);
      expect(shade('#38b764', 'darken')).toBe('#1e5e3b');
      expect(shade('#38b764', 'lighten')).toBe('#8fe08a');
    });
  });

  describe('Onion skin: a bouncing ball', () => {
    const l = lesson('bouncing-ball');
    it('steps follow the timeline and the drawing', () => {
      expect(done(l, 'frame2', state(l, { frameCount: 2, frameIndex: 1 }))).toBe(true);
      const low = l.steps.find((s) => s.id === 'squash')!.example!;
      expect(done(l, 'squash', state(l, { frameCount: 2, frameIndex: 1, frame: low }))).toBe(true);
      expect(done(l, 'squash', state(l, { frameCount: 2, frameIndex: 0, frame: low }))).toBe(false);
      const mid = l.steps.find((s) => s.id === 'frame3')!.example!;
      expect(done(l, 'frame3', state(l, { frameCount: 3, frameIndex: 2, frame: mid }))).toBe(true);
      expect(done(l, 'tag', state(l, { tagCount: 1 }))).toBe(true);
    });
  });

  describe('Cleaning up an AI import', () => {
    const l = lesson('ai-cleanup');
    const start = l.start.frames![0].layers[0].pixels;
    const colours = (g: (string | null)[][]) => new Set(g.flat().filter(Boolean)).size;
    const merge = (g: (string | null)[][], map: Record<string, string>) => g.map((r) => r.map((c) => (c && map[c]) || c));

    it('starts with 8 colours and finishes at 4 once the strays are merged', () => {
      expect(colours(start)).toBe(8);
      expect(done(l, 'greens', state(l, { allFrames: [start] }))).toBe(false);
      const greens = merge(start, { '#3ab866': '#38b764', '#34b25f': '#38b764' });
      expect(done(l, 'greens', state(l, { allFrames: [greens] }))).toBe(true);
      const all = merge(greens, { '#1d1f30': '#1a1c2c', '#21623f': '#1e5e3b' });
      expect(done(l, 'rest', state(l, { allFrames: [all] }))).toBe(true);
    });
  });
});

describe('lesson validation', () => {
  const base = JSON.parse(JSON.stringify(BUILTIN_LESSONS[0]));
  it('rejects broken files with a clear reason', () => {
    expect(() => validateLesson('nope')).toThrow(/not valid JSON/);
    expect(() => validateLesson({ ...base, format: 'other' })).toThrow(/not a Sindri lesson/);
    expect(() => validateLesson({ ...base, version: 9 })).toThrow(/version 9/);
    const badRegion = { ...base, steps: [{ ...base.steps[2], region: { x: 10, y: 10, w: 10, h: 2 } }] };
    expect(() => validateLesson(badRegion)).toThrow(/step 1: region must lie inside/);
    const badCheck = { ...base, steps: [{ ...base.steps[0], checks: [{ type: 'teleport' }] }] };
    expect(() => validateLesson(badCheck)).toThrow(/unknown check type teleport/);
    const noExample = { ...base, steps: [{ ...base.steps[2], example: null }] };
    expect(() => validateLesson(noExample)).toThrow(/matches check needs an example/);
  });
});
