// Sindri Pixel — animation tags.
//
// A tag names a range of frames — "idle", "run", "attack" — so one sprite
// holds all of a character's animations. Ranges are frame indices, inclusive,
// exactly as Aseprite stores them, so they export straight into the sheet
// JSON's `frameTags` that engines read. Frame edits keep them in step: frames
// inserted inside a tag join it, deleting frames shrinks it (and a tag whose
// frames are all gone disappears), and moving a frame moves it in or out.

export type TagDirection = 'forward' | 'reverse' | 'pingpong';

export interface FrameTag {
  id: string;
  name: string;
  /** First and last frame, inclusive. */
  from: number;
  to: number;
  direction: TagDirection;
}

export const TAG_DIRECTIONS: TagDirection[] = ['forward', 'reverse', 'pingpong'];

/** A frame was inserted at index `at`. */
export function tagsAfterInsert(tags: FrameTag[], at: number): FrameTag[] {
  return tags.map((t) => ({ ...t, from: t.from >= at ? t.from + 1 : t.from, to: t.to >= at ? t.to + 1 : t.to }));
}

/** The frame at index `at` was deleted. */
export function tagsAfterDelete(tags: FrameTag[], at: number): FrameTag[] {
  return tags
    .map((t) => ({ ...t, from: t.from > at ? t.from - 1 : t.from, to: t.to >= at ? t.to - 1 : t.to }))
    .filter((t) => t.to >= t.from);
}

/** The frame at `from` was moved so that it now sits at index `to`. */
export function tagsAfterMove(tags: FrameTag[], from: number, to: number): FrameTag[] {
  if (from === to) return tags;
  // Keep every tag (even one holding only the moved frame): lift the frame
  // out without dropping empty ranges, then put it back in.
  const lifted = tags.map((t) => ({ ...t, from: t.from > from ? t.from - 1 : t.from, to: t.to >= from ? t.to - 1 : t.to }));
  return lifted.map((t) =>
    t.to < t.from
      ? { ...t, from: to, to } // it held only the moved frame: follow it
      : { ...t, from: t.from >= to ? t.from + 1 : t.from, to: t.to >= to ? t.to + 1 : t.to },
  );
}

/** Keep tags inside `count` frames (after loading, or a frame-count change). */
export function clampTags(tags: FrameTag[], count: number): FrameTag[] {
  return tags
    .map((t) => ({ ...t, from: Math.max(0, t.from), to: Math.min(count - 1, t.to) }))
    .filter((t) => t.to >= t.from);
}

/** Frame indices one cycle of the tag plays, in order. */
export function tagSequence(tag: Pick<FrameTag, 'from' | 'to' | 'direction'>): number[] {
  const seq: number[] = [];
  for (let i = tag.from; i <= tag.to; i++) seq.push(i);
  if (tag.direction === 'reverse') return seq.reverse();
  if (tag.direction === 'pingpong' && seq.length > 2) return [...seq, ...seq.slice(1, -1).reverse()];
  return seq;
}

/** The frame after `current` when playing `tag` (or all `count` frames).
 *  `step` is the position within the cycle, since a ping-pong passes most
 *  frames twice; the result carries the next position. */
export function nextPlayFrame(
  count: number,
  tag: FrameTag | null,
  step: number,
): { frame: number; step: number } {
  const seq = tag ? tagSequence(tag) : tagSequence({ from: 0, to: count - 1, direction: 'forward' });
  const next = (step + 1) % seq.length;
  return { frame: seq[next], step: next };
}

/** A default name that isn't taken yet: "tag", "tag 2", … */
export function freshTagName(tags: FrameTag[], base = 'tag'): string {
  const names = new Set(tags.map((t) => t.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** Validate tags read from a file; throws on anything malformed. */
export function validateTags(raw: unknown, frameCount: number): FrameTag[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error('tags must be a list');
  return raw.map((t, i) => {
    const tag = t as Partial<FrameTag>;
    const where = `tag ${i + 1}`;
    if (!tag || typeof tag !== 'object') throw new Error(`${where} is not an object`);
    if (typeof tag.id !== 'string' || !tag.id) throw new Error(`${where} has no id`);
    if (typeof tag.name !== 'string') throw new Error(`${where} has no name`);
    if (!Number.isInteger(tag.from) || !Number.isInteger(tag.to)) throw new Error(`${where} has an invalid range`);
    if (tag.from! < 0 || tag.to! < tag.from! || tag.to! >= frameCount) throw new Error(`${where} is outside the frames`);
    if (!TAG_DIRECTIONS.includes(tag.direction as TagDirection)) throw new Error(`${where} has an unknown direction`);
    return { id: tag.id, name: tag.name, from: tag.from!, to: tag.to!, direction: tag.direction as TagDirection };
  });
}
