// Sindri Pixel — lesson format.
//
// A lesson is data: where the canvas starts (size, frames, palette) and a
// list of steps. Each step says what to do (instruction, hint), where to look
// (a spotlight on a panel, a highlighted region of the canvas), which tools
// it needs, an optional example to trace, and the checks that decide when
// the step is done. Built-in lessons and lessons made in the builder use the
// same format and the same check engine.

import type { Frame, PixelGrid, Tool, SymmetryMode } from '../../types';

export const LESSON_FORMAT = 'sindri-lesson';
export const LESSON_FORMAT_VERSION = 1;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Colour families a check can ask for, so a lesson accepts "any red"
 *  rather than one exact hex. `dark` and `light` are about brightness. */
export type ColorFamily =
  | 'dark' | 'light' | 'grey'
  | 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'purple' | 'pink';

export type Check =
  /** The active tool. */
  | { type: 'tool'; tool: Tool }
  /** The active colour. */
  | { type: 'color'; family?: ColorFamily; hex?: string[] }
  /** At least `min` painted pixels on the current frame (in `region`, of a
   *  family or exact colours, when given). */
  | { type: 'pixels'; min: number; region?: Rect; family?: ColorFamily; hex?: string[] }
  /** The painted pixels in `region` enclose at least `minInterior` empty
   *  pixels — a closed outline. */
  | { type: 'closed'; region?: Rect; minInterior?: number }
  /** At least `share` (0–1) of `region` is painted (in a family / colours). */
  | { type: 'filled'; region: Rect; share: number; family?: ColorFamily; hex?: string[] }
  /** The current frame matches the step's example: at least `share` of the
   *  example's pixels are there, within a colour tolerance. */
  | { type: 'matches'; share: number }
  /** Document shape. */
  | { type: 'frames'; min: number }
  | { type: 'layers'; min: number }
  | { type: 'tags'; min: number }
  /** At most this many distinct colours in the whole sprite. */
  | { type: 'maxColors'; max: number }
  /** Editor state. */
  | { type: 'onion'; on: boolean }
  | { type: 'symmetry'; mode: SymmetryMode }
  | { type: 'playing' }
  | { type: 'frameIndex'; index: number };

export type SpotlightTarget = 'canvas' | 'toolbar' | 'palette' | 'layers' | 'timeline';

export interface LessonStep {
  id: string;
  title: string;
  instruction: string;
  hint?: string;
  /** A panel to light up, or the canvas (with `region`, that part of it). */
  spotlight?: SpotlightTarget | null;
  region?: Rect | null;
  /** Tools this step needs; others are dimmed. Omit to allow all. */
  tools?: Tool[] | null;
  /** Art to trace, shown faintly over the canvas; also what `matches` compares to. */
  example?: PixelGrid | null;
  /** All must pass for the step to complete. Empty = read-and-continue. */
  checks: Check[];
}

export interface Lesson {
  format: typeof LESSON_FORMAT;
  version: typeof LESSON_FORMAT_VERSION;
  id: string;
  title: string;
  author: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  minutes: number;
  summary: string;
  /** Shown before the first step. */
  intro: string;
  /** Shown when every step is done. */
  outro: string;
  /** The canvas the lesson starts on. */
  start: { w: number; h: number; frames?: Frame[]; swatches?: string[] };
  /** Library card art (defaults to the last example). */
  cover?: PixelGrid | null;
  steps: LessonStep[];
}

/** What the checks look at: a snapshot of the editor. */
export interface EditorState {
  tool: Tool;
  color: string;
  /** The current frame, all visible layers composited (colour or null). */
  frame: (string | null)[][];
  /** Every frame composited, for sprite-wide checks. */
  allFrames: (string | null)[][][];
  frameIndex: number;
  frameCount: number;
  layerCount: number;
  tagCount: number;
  onion: boolean;
  symmetry: SymmetryMode;
  playing: boolean;
}

export interface CheckResult {
  label: string;
  met: boolean;
  /** Progress towards a count, when there is one ("12 / 18"). */
  progress?: string;
}
