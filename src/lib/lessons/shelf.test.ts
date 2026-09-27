import { describe, expect, it } from 'vitest';
import { BUILTIN_LESSONS } from './builtin';
import { draftToLesson, newDraft, type MakerDraft, type MakerSnapshot } from './maker';
import { copyDraft, importLesson, isBlankDraft, readDrafts, readImported, shelveDraft } from './shelf';

const start: MakerSnapshot = {
  frames: [{ id: 'f', duration: 100, layers: [{ id: 'l', name: 'l', visible: true, opacity: 1, pixels: Array.from({ length: 4 }, () => Array(4).fill(null)) }] }],
  w: 4, h: 4, swatches: ['#000000'], tags: [], frameIdx: 0,
};
const withStep = (d: MakerDraft, title = 'Boxes'): MakerDraft => ({
  ...d, title,
  steps: [{ id: 's1', title: 'Pick', instruction: 'Pick a dark colour.', checks: [{ type: 'color', family: 'dark' }], after: null }],
});

describe('the drafts shelf', () => {
  it('keeps worked-on drafts newest first and leaves blank ones off', () => {
    const a = withStep({ ...newDraft(start), id: 'a' });
    const b = withStep({ ...newDraft(start), id: 'b' });
    const blank = { ...newDraft(start), id: 'c' };
    expect(isBlankDraft(blank)).toBe(true);
    expect(isBlankDraft({ ...blank, title: 'My lesson' })).toBe(false);
    let shelf = shelveDraft([], a);
    shelf = shelveDraft(shelf, b);
    shelf = shelveDraft(shelf, blank);
    expect(shelf.map((d) => d.id)).toEqual(['b', 'a']);
    shelf = shelveDraft(shelf, { ...a, title: 'Renamed' });
    expect(shelf.map((d) => d.title)).toEqual(['Renamed', 'Boxes']);
  });

  it('drops a draft emptied back to blank', () => {
    const a = withStep({ ...newDraft(start), id: 'a' });
    expect(shelveDraft([a], { ...a, steps: [], title: 'Untitled lesson' })).toEqual([]);
  });

  it('reads only draft-shaped things from storage', () => {
    const a = withStep({ ...newDraft(start), id: 'a' });
    expect(readDrafts([a, null, 3, { id: 'x' }, { id: 'y', steps: [], start: {} }])).toEqual([a]);
  });

  it('copies a draft as a new, uncleared one', () => {
    const a = { ...withStep({ ...newDraft(start), id: 'a' }), cleared: true };
    const c = copyDraft(a);
    expect(c.id).not.toBe('a');
    expect(c.cleared).toBe(false);
    expect(c.title).toBe('Boxes (copy)');
    c.steps[0].title = 'changed';
    expect(a.steps[0].title).toBe('Pick');
  });
});

describe('importing shared lessons', () => {
  const shared = draftToLesson({ ...withStep(newDraft(start)), id: 'shared_1' });

  it('adds a valid lesson file, and a newer copy replaces the old one', () => {
    const first = importLesson(JSON.stringify(shared), [], ['intro']);
    expect(first.replaced).toBe(false);
    expect(first.lessons.map((l) => l.id)).toEqual(['shared_1']);
    const again = importLesson(JSON.stringify({ ...shared, title: 'Boxes v2' }), first.lessons, ['intro']);
    expect(again.replaced).toBe(true);
    expect(again.lessons.map((l) => l.title)).toEqual(['Boxes v2']);
  });

  it('refuses files that are not lessons, or that pose as a built-in one', () => {
    expect(() => importLesson('{"hello":1}', [], [])).toThrow(/not a Sindri lesson/);
    expect(() => importLesson('nope', [], [])).toThrow(/not valid JSON/);
    const builtin = BUILTIN_LESSONS[0];
    expect(() => importLesson(JSON.stringify(builtin), [], BUILTIN_LESSONS.map((l) => l.id))).toThrow(/built-in/);
  });

  it('skips stored lessons that no longer validate', () => {
    expect(readImported([shared, { format: 'nope' }]).map((l) => l.id)).toEqual(['shared_1']);
  });
});
