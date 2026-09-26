// Loading image files into frames, and splitting sprite sheets into them.

import { cropPose, splitSheet } from '../../lib/animation';
import { loadImageData } from '../../lib/platform';
import { makeFrame, naturalCompare, type FrameItem } from './frames';

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/*';

/** Open a (multi-select) image picker. Resolves [] if cancelled. */
export function pickImageFiles(multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = IMAGE_ACCEPT;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

/**
 * Decode image files into frames, in natural file-name order (walk_2 before
 * walk_10) so numbered exports land in sequence. Unreadable files are
 * reported, not fatal.
 */
export async function framesFromFiles(files: File[]): Promise<{ frames: FrameItem[]; errors: string[] }> {
  const sorted = [...files].filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(f.name));
  sorted.sort((a, b) => naturalCompare(a.name, b.name));
  const frames: FrameItem[] = [];
  const errors: string[] = [];
  for (const file of sorted) {
    try {
      const data = await loadImageData(file);
      frames.push(makeFrame(file.name, { data: data.data, width: data.width, height: data.height }));
    } catch {
      errors.push(`Couldn't read ${file.name}`);
    }
  }
  return { frames, errors };
}

/**
 * Split a frame whose source is a sprite sheet into one frame per pose, in
 * reading order. Each pose is cut out clean (its own pixels only) and keeps
 * the sheet's per-frame settings; a sheet with one pose comes back as is.
 */
export function splitFrame(frame: FrameItem): FrameItem[] {
  const split = splitSheet(frame.source);
  if (split.poses.length < 2) return [frame];
  const base = frame.name.replace(/\.[^.]+$/, '');
  const digits = String(split.poses.length).length;
  return split.poses.map((pose, i) => ({
    ...makeFrame(`${base} ${String(i + 1).padStart(Math.max(2, digits), '0')}.png`, cropPose(frame.source, split, pose)),
    scale: frame.scale,
    flipX: frame.flipX,
    duration: frame.duration,
  }));
}
