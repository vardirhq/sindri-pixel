// Sindri Pixel — the lesson shelf: the lessons someone has made (drafts) and
// the ones people have shared with them (imported .sindri-lesson files).
//
// Pure list logic; storage and the UI live elsewhere.

import type { MakerDraft } from './maker';
import type { Lesson } from './types';
import { validateLesson } from './validate';

/** A draft nobody has worked on yet (not worth keeping on the shelf). */
export const isBlankDraft = (d: MakerDraft): boolean =>
  d.steps.length === 0 && (d.title.trim() === '' || d.title === 'Untitled lesson');

/** Put a draft on the shelf (replacing it by id), newest first; blank drafts
 *  are left off. */
export function shelveDraft(drafts: MakerDraft[], d: MakerDraft): MakerDraft[] {
  const rest = drafts.filter((x) => x.id !== d.id);
  return isBlankDraft(d) ? rest : [d, ...rest];
}

/** Drop what isn't a draft (storage can hold anything). */
export function readDrafts(raw: unknown[]): MakerDraft[] {
  return raw.filter((d): d is MakerDraft => {
    const x = d as MakerDraft;
    return !!x && typeof x === 'object' && typeof x.id === 'string' && Array.isArray(x.steps) && !!x.start && Array.isArray(x.start.frames);
  });
}

/** A copy of a draft to take somewhere new (fresh id, not cleared). */
export function copyDraft(d: MakerDraft): MakerDraft {
  return {
    ...(JSON.parse(JSON.stringify(d)) as MakerDraft),
    id: `lesson_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    title: `${d.title} (copy)`,
    cleared: false,
    updatedAt: Date.now(),
  };
}

/** Lessons from storage that still validate (a bad one is skipped, not fatal). */
export function readImported(raw: unknown[]): Lesson[] {
  const out: Lesson[] = [];
  for (const r of raw) {
    try { out.push(validateLesson(r)); } catch { /* skip */ }
  }
  return out;
}

export interface ImportResult {
  lessons: Lesson[];
  lesson: Lesson;
  /** An earlier copy of the same lesson was replaced (a newer version). */
  replaced: boolean;
}

/**
 * Add a shared lesson file to the imported list. Throws a readable error for
 * a file that isn't a valid lesson or that would stand in for a built-in one.
 */
export function importLesson(text: string, imported: Lesson[], builtinIds: string[]): ImportResult {
  const lesson = validateLesson(text);
  if (builtinIds.includes(lesson.id)) throw new Error(`“${lesson.title}” has the same id as a built-in lesson.`);
  const replaced = imported.some((l) => l.id === lesson.id);
  return { lessons: [lesson, ...imported.filter((l) => l.id !== lesson.id)], lesson, replaced };
}
