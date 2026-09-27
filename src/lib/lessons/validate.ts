// Sindri Pixel — reading lesson files safely.
//
// Lessons will come from files people share, so everything is checked before
// use: known check types, regions and examples inside the canvas, sane sizes.

import { LESSON_FORMAT, LESSON_FORMAT_VERSION, type Check, type Lesson, type LessonStep, type Rect } from './types';

const TOOLS = ['pencil', 'eraser', 'shade', 'fill', 'picker', 'line', 'rect', 'circle', 'select', 'wand', 'lasso', 'move', 'pan'];
const FAMILIES = ['dark', 'light', 'grey', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'];
const TARGETS = ['canvas', 'toolbar', 'palette', 'layers', 'timeline'];
const HEX = /^#[0-9a-f]{6}$/i;
const MAX_SIDE = 256;
const MAX_STEPS = 100;

function fail(msg: string): never {
  throw new Error(`Invalid lesson: ${msg}`);
}

const isInt = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

function checkRect(r: unknown, w: number, h: number, where: string): Rect {
  const rect = r as Rect;
  if (!rect || !isInt(rect.x) || !isInt(rect.y) || !isInt(rect.w, 1) || !isInt(rect.h, 1) || rect.x + rect.w > w || rect.y + rect.h > h) {
    fail(`${where}: region must lie inside the ${w}×${h} canvas`);
  }
  return rect;
}

function checkGrid(g: unknown, w: number, h: number, where: string): void {
  if (!Array.isArray(g) || g.length !== h || !g.every((row) => Array.isArray(row) && row.length === w && row.every((c) => c === null || (typeof c === 'string' && HEX.test(c))))) {
    fail(`${where}: must be a ${w}×${h} grid of #rrggbb colours or null`);
  }
}

function checkCheck(c: unknown, w: number, h: number, where: string): Check {
  const k = c as Check & Record<string, unknown>;
  if (!k || typeof k !== 'object') fail(`${where}: not an object`);
  const colors = () => {
    if (k.family !== undefined && !FAMILIES.includes(k.family as string)) fail(`${where}: unknown colour family ${String(k.family)}`);
    if (k.hex !== undefined && (!Array.isArray(k.hex) || !(k.hex as unknown[]).every((x) => typeof x === 'string' && HEX.test(x)))) fail(`${where}: hex must be #rrggbb colours`);
  };
  switch (k.type) {
    case 'tool': if (!TOOLS.includes(k.tool as string)) fail(`${where}: unknown tool`); break;
    case 'color': colors(); break;
    case 'pixels': if (!isInt(k.min, 1)) fail(`${where}: min must be ≥ 1`); if (k.region) checkRect(k.region, w, h, where); colors(); break;
    case 'closed': if (k.region) checkRect(k.region, w, h, where); if (k.minInterior !== undefined && !isInt(k.minInterior, 1)) fail(`${where}: minInterior must be ≥ 1`); break;
    case 'filled': checkRect(k.region, w, h, where); colors(); if (typeof k.share !== 'number' || k.share <= 0 || k.share > 1) fail(`${where}: share must be in (0, 1]`); break;
    case 'matches': if (typeof k.share !== 'number' || k.share <= 0 || k.share > 1) fail(`${where}: share must be in (0, 1]`); break;
    case 'frames': case 'layers': case 'tags': if (!isInt(k.min, 1, 10_000)) fail(`${where}: min must be ≥ 1`); break;
    case 'maxColors': if (!isInt(k.max, 1, 65_536)) fail(`${where}: max must be ≥ 1`); break;
    case 'onion': if (typeof k.on !== 'boolean') fail(`${where}: on must be true or false`); break;
    case 'symmetry': if (!['off', 'v', 'h', 'both'].includes(k.mode as string)) fail(`${where}: unknown symmetry mode`); break;
    case 'playing': break;
    case 'frameIndex': if (!isInt(k.index, 0, 10_000)) fail(`${where}: index must be ≥ 0`); break;
    default: fail(`${where}: unknown check type ${String((c as { type?: unknown }).type)}`);
  }
  return k;
}

/** Parse and check a lesson (from JSON text or an object). */
export function validateLesson(input: unknown): Lesson {
  const raw = (typeof input === 'string' ? (() => { try { return JSON.parse(input); } catch { fail('not valid JSON'); } })() : input) as Lesson;
  if (!raw || typeof raw !== 'object') fail('not an object');
  if (raw.format !== LESSON_FORMAT) fail('not a Sindri lesson file');
  if (!isInt(raw.version, 1) || raw.version > LESSON_FORMAT_VERSION) fail(`version ${String(raw.version)} is not supported by this app`);
  for (const key of ['id', 'title', 'author', 'summary', 'intro', 'outro'] as const) {
    if (typeof raw[key] !== 'string') fail(`${key} must be text`);
  }
  if (!raw.id) fail('id is empty');
  if (!['beginner', 'intermediate', 'advanced'].includes(raw.difficulty)) fail('unknown difficulty');
  if (!isInt(raw.minutes, 1, 600)) fail('minutes must be 1–600');
  const { w, h } = raw.start ?? {};
  if (!isInt(w, 1, MAX_SIDE) || !isInt(h, 1, MAX_SIDE)) fail(`canvas must be 1–${MAX_SIDE} pixels a side`);
  raw.start.frames?.forEach((f, i) => {
    if (!f?.layers?.length) fail(`start frame ${i + 1} has no layers`);
    f.layers.forEach((l, k) => checkGrid(l.pixels, w, h, `start frame ${i + 1}, layer ${k + 1}`));
  });
  if (raw.start.swatches && !raw.start.swatches.every((c) => typeof c === 'string' && HEX.test(c))) fail('swatches must be #rrggbb colours');
  if (raw.cover) checkGrid(raw.cover, raw.cover[0]?.length ?? 0, raw.cover.length, 'cover');
  if (!Array.isArray(raw.steps) || !raw.steps.length || raw.steps.length > MAX_STEPS) fail(`a lesson needs 1–${MAX_STEPS} steps`);
  raw.steps.forEach((s: LessonStep, i) => {
    const where = `step ${i + 1}`;
    if (typeof s.id !== 'string' || typeof s.title !== 'string' || typeof s.instruction !== 'string') fail(`${where}: needs an id, a title and an instruction`);
    if (s.spotlight && !TARGETS.includes(s.spotlight)) fail(`${where}: unknown spotlight ${s.spotlight}`);
    if (s.region) checkRect(s.region, w, h, where);
    if (s.tools && !(Array.isArray(s.tools) && s.tools.every((t) => TOOLS.includes(t)))) fail(`${where}: unknown tool in tools`);
    if (s.example) checkGrid(s.example, w, h, `${where} example`);
    if (!Array.isArray(s.checks)) fail(`${where}: checks must be a list`);
    s.checks.forEach((c, k) => checkCheck(c, w, h, `${where}, check ${k + 1}`));
    if (s.checks.some((c) => c.type === 'matches') && !s.example) fail(`${where}: a matches check needs an example`);
  });
  return raw;
}
