// Sindri Pixel — the lesson maker's model.
//
// Lessons are made by doing, not by filling in forms: the maker records a
// step (press record, do the thing on the canvas, press done), and the
// difference between the canvas before and after becomes the step — where
// it happened, what it asks for, an example to trace, and a first draft of
// the wording. The author then tweaks.
//
// A draft keeps a snapshot of the whole document after each step, so any
// step can be played from exactly the canvas the learner would have there.
// Like a Mario Maker course, a draft must be *cleared* by its author —
// played start to finish without skipping — before it can be shared, and
// any edit un-clears it.

import type { Frame, SymmetryMode, Tool } from '../../types';
import type { FrameTag } from '../tags';
import { compositeGrid } from '../sprite';
import { enclosedPixels, inFamily, toolName } from './checks';
import { LESSON_FORMAT, LESSON_FORMAT_VERSION, type Check, type ColorFamily, type Lesson, type LessonStep, type Rect } from './types';

/** The whole document at a moment. */
export interface MakerSnapshot {
  frames: Frame[];
  w: number;
  h: number;
  swatches: string[];
  tags: FrameTag[];
  frameIdx: number;
}

/** Editor settings a step can be about. */
export interface MakerContext {
  tool: Tool;
  color: string;
  onion: boolean;
  symmetry: SymmetryMode;
}

export interface MakerStep extends LessonStep {
  /** The document after this step (what the next step starts from). */
  after: MakerSnapshot | null;
}

export interface MakerDraft {
  id: string;
  title: string;
  author: string;
  difficulty: Lesson['difficulty'];
  minutes: number;
  summary: string;
  intro: string;
  outro: string;
  start: MakerSnapshot;
  steps: MakerStep[];
  /** Played start to finish by its author, unchanged since. */
  cleared: boolean;
  updatedAt: number;
}

const FAMILIES: ColorFamily[] = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'dark', 'light', 'grey'];

/** The family that best names a colour (hues first, then grey/dark/light). */
export function familyOf(hex: string): ColorFamily {
  return FAMILIES.find((f) => inFamily(hex, f)) ?? 'dark';
}

/** Grow a rect by `pad`, clamped to the canvas. */
function padRect(r: Rect, pad: number, w: number, h: number): Rect {
  const x = Math.max(0, r.x - pad);
  const y = Math.max(0, r.y - pad);
  return { x, y, w: Math.min(w, r.x + r.w + pad) - x, h: Math.min(h, r.y + r.h + pad) - y };
}

export interface RecordedStep {
  title: string;
  instruction: string;
  checks: Check[];
  region: Rect | null;
  spotlight: LessonStep['spotlight'];
  tools: Tool[] | null;
  example: (string | null)[][] | null;
}

/**
 * Turn what the author did (before → after, plus the editor settings at the
 * end) into a step. Drawing becomes "place N pixels of this colour family
 * here" (and "close the outline" / "fill the area" when that's what it was);
 * document changes become frame/tag checks; settings become tool, colour,
 * onion or symmetry checks.
 */
export function recordStep(before: MakerSnapshot, after: MakerSnapshot, was: MakerContext, now: MakerContext): RecordedStep {
  const { w, h } = after;
  const b = compositeGrid(before.frames[after.frameIdx] ?? before.frames[before.frameIdx], w, h);
  const a = compositeGrid(after.frames[after.frameIdx], w, h);

  // What changed on the current frame.
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  const added = new Map<string, number>();
  let changed = 0;
  let addedCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (a[y][x] === b[y]?.[x]) continue;
      changed++;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      const c = a[y][x];
      if (c) { addedCount++; added.set(c, (added.get(c) ?? 0) + 1); }
    }
  }

  const checks: Check[] = [];
  let title = '';
  let instruction = '';
  let region: Rect | null = null;
  let spotlight: LessonStep['spotlight'] = null;
  let example: (string | null)[][] | null = null;
  const tools: Tool[] | null = changed ? [now.tool] : null;

  if (changed) {
    const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    region = padRect(box, 1, w, h);
    spotlight = 'canvas';
    example = a;
    const [main] = [...added.entries()].sort((p, q) => q[1] - p[1]);
    const family = main ? familyOf(main[0]) : undefined;
    const interiorBefore = enclosedPixels(b, region);
    const interiorAfter = enclosedPixels(a, region);
    const boxArea = box.w * box.h;
    if (now.tool === 'fill' && main && main[1] >= Math.max(4, boxArea * 0.5)) {
      checks.push({ type: 'filled', region: box, share: 0.9, ...(family ? { family } : {}) });
      title = 'Fill the area';
      instruction = `Use the Fill tool with ${family ? `a ${family}` : 'a colour'} and click inside the highlighted area.`;
    } else if (addedCount) {
      checks.push({ type: 'pixels', min: Math.max(1, Math.round(addedCount * 0.8)), region, ...(family ? { family } : {}) });
      title = now.tool === 'shade' ? 'Shade it' : 'Draw here';
      instruction = `With the ${toolName(now.tool)}, ${now.tool === 'shade' ? 'shade' : 'draw'} in the highlighted area — follow the faint example.`;
      if (interiorAfter > interiorBefore && interiorAfter >= 4) {
        checks.push({ type: 'closed', region, minInterior: Math.max(1, Math.round((interiorAfter - interiorBefore) * 0.8)) });
        title = 'Draw the outline';
        instruction = `With the ${toolName(now.tool)}, trace the outline in the highlighted area. It has to be closed — no gaps.`;
      }
    } else {
      title = 'Erase here';
      instruction = 'Erase the highlighted pixels.';
      checks.push({ type: 'matches', share: 0.9 });
    }
  }

  // Document changes.
  if (after.frames.length > before.frames.length) {
    checks.push({ type: 'frames', min: after.frames.length });
    if (!changed) { title = 'Add a frame'; instruction = 'Click + in the timeline to add a frame.'; spotlight = 'timeline'; }
  }
  if (after.tags.length > before.tags.length) {
    checks.push({ type: 'tags', min: after.tags.length });
    if (!changed) { title = 'Tag the frames'; instruction = 'Shift-click frames in the timeline to select them, then click “+ tag”.'; spotlight = 'timeline'; }
  }
  if (after.frameIdx !== before.frameIdx && after.frames.length > 1) checks.push({ type: 'frameIndex', index: after.frameIdx });

  // Settings (only when nothing was drawn, or they matter to the drawing).
  if (now.onion !== was.onion) {
    checks.push({ type: 'onion', on: now.onion });
    if (!title) { title = now.onion ? 'Turn on onion skin' : 'Turn off onion skin'; instruction = 'Click “onion skin” in the timeline.'; spotlight = 'timeline'; }
  }
  if (now.symmetry !== was.symmetry) {
    checks.push({ type: 'symmetry', mode: now.symmetry });
    if (!title) { title = 'Set symmetry'; instruction = 'Choose a symmetry mode in the tools panel.'; spotlight = 'toolbar'; }
  }
  if (!checks.length && now.color.toLowerCase() !== was.color.toLowerCase()) {
    const family = familyOf(now.color);
    checks.push({ type: 'color', family });
    title = `Pick a ${family === 'dark' || family === 'light' ? `${family} colour` : family}`;
    instruction = 'Pick the colour from the palette.';
    spotlight = 'palette';
  }
  if (!checks.length && now.tool !== was.tool) {
    checks.push({ type: 'tool', tool: now.tool });
    title = `Pick the ${toolName(now.tool)}`;
    instruction = `Choose the ${toolName(now.tool)} in the tools panel.`;
    spotlight = 'toolbar';
  }
  if (!checks.length) {
    title = 'Read this';
    instruction = 'Explain something here. The learner continues when ready.';
  }
  return { title, instruction, checks, region, spotlight, tools, example };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

let seq = 0;
export const newStepId = (): string => `step_${Date.now().toString(36)}_${(seq++).toString(36)}`;

/** A fresh draft that starts from `start`. */
export function newDraft(start: MakerSnapshot, author = 'you'): MakerDraft {
  return {
    id: `lesson_${Date.now().toString(36)}`,
    title: 'Untitled lesson',
    author,
    difficulty: 'beginner',
    minutes: 5,
    summary: '',
    intro: '',
    outro: 'You did it!',
    start: clone(start),
    steps: [],
    cleared: false,
    updatedAt: Date.now(),
  };
}

/** Any edit un-clears a draft (it has to be played through again). */
export function touch(draft: MakerDraft, patch: Partial<MakerDraft>): MakerDraft {
  return { ...draft, ...patch, cleared: false, updatedAt: Date.now() };
}

/** The document a step starts from: the previous step's result, or the start. */
export function snapshotBefore(draft: MakerDraft, stepIdx: number): MakerSnapshot {
  for (let i = stepIdx - 1; i >= 0; i--) if (draft.steps[i]?.after) return draft.steps[i].after!;
  return draft.start;
}

/** A playable lesson, optionally starting at `fromStep` (on that step's
 *  starting canvas). */
export function draftToLesson(draft: MakerDraft, fromStep = 0): Lesson {
  const start = snapshotBefore(draft, fromStep);
  return {
    format: LESSON_FORMAT,
    version: LESSON_FORMAT_VERSION,
    id: draft.id,
    title: draft.title,
    author: draft.author,
    difficulty: draft.difficulty,
    minutes: draft.minutes,
    summary: draft.summary,
    intro: draft.intro || draft.summary || `A lesson in ${draft.steps.length} steps.`,
    outro: draft.outro,
    start: { w: start.w, h: start.h, frames: clone(start.frames), swatches: [...start.swatches] },
    cover: [...draft.steps].reverse().find((s) => s.example)?.example ?? null,
    steps: draft.steps.map(({ after: _after, ...step }) => step),
  };
}
