// Frame list state for the AI-art frame workspace, with undo/redo.
//
// Frames hold their decoded source (shared by reference, never copied) and the
// per-frame knobs the animation view edits. Every edit goes through the
// reducer so it can be undone; rapid repeats of the same edit (arrow-key
// nudges, dragging a slider) coalesce into one undo step.

import type { RGBAImage } from '../../lib/pixelReconstruction';

export interface FrameItem {
  id: string;
  name: string;
  source: RGBAImage;
  offsetX: number;
  offsetY: number;
  /** Size relative to the shared pixel grid (1 = as drawn). */
  scale: number;
  flipX: boolean;
  /** Hold time in ms; null follows the global frame rate. */
  duration: number | null;
}

export type FramePatch = Partial<Pick<FrameItem, 'offsetX' | 'offsetY' | 'scale' | 'flipX' | 'duration'>>;

export type FrameAction =
  | { type: 'add'; frames: FrameItem[]; at?: number }
  | { type: 'replace'; id: string; frame: FrameItem }
  | { type: 'remove'; ids: string[] }
  | { type: 'move'; from: number; to: number }
  | { type: 'patch'; id: string; patch: FramePatch; coalesce?: string }
  | { type: 'duplicate'; id: string; newId: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' };

export interface FrameHistory {
  past: FrameItem[][];
  present: FrameItem[];
  future: FrameItem[][];
  /** Coalescing key of the last edit and when it happened. */
  lastKey: string | null;
  lastAt: number;
}

export const EMPTY_HISTORY: FrameHistory = { past: [], present: [], future: [], lastKey: null, lastAt: 0 };

const COALESCE_MS = 700;
const HISTORY_LIMIT = 200;

let nextId = 1;
export const newFrameId = () => `f${nextId++}`;

export function makeFrame(name: string, source: RGBAImage): FrameItem {
  return { id: newFrameId(), name, source, offsetX: 0, offsetY: 0, scale: 1, flipX: false, duration: null };
}

/** File-name order a person expects: walk_2 before walk_10. */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function apply(frames: FrameItem[], action: FrameAction): FrameItem[] {
  switch (action.type) {
    case 'add': {
      const at = action.at ?? frames.length;
      return [...frames.slice(0, at), ...action.frames, ...frames.slice(at)];
    }
    case 'replace':
      return frames.map((f) => (f.id === action.id ? action.frame : f));
    case 'remove':
      return frames.filter((f) => !action.ids.includes(f.id));
    case 'move': {
      if (action.from === action.to) return frames;
      const next = [...frames];
      const [item] = next.splice(action.from, 1);
      next.splice(action.to > action.from ? action.to - 1 : action.to, 0, item);
      return next;
    }
    case 'patch':
      return frames.map((f) => (f.id === action.id ? { ...f, ...action.patch } : f));
    case 'duplicate': {
      const i = frames.findIndex((f) => f.id === action.id);
      if (i < 0) return frames;
      return [...frames.slice(0, i + 1), { ...frames[i], id: action.newId }, ...frames.slice(i + 1)];
    }
    default:
      return frames;
  }
}

export function framesReducer(state: FrameHistory, action: FrameAction): FrameHistory {
  if (action.type === 'reset') return EMPTY_HISTORY;
  if (action.type === 'undo') {
    if (!state.past.length) return state;
    return {
      past: state.past.slice(0, -1),
      present: state.past[state.past.length - 1],
      future: [state.present, ...state.future],
      lastKey: null,
      lastAt: 0,
    };
  }
  if (action.type === 'redo') {
    if (!state.future.length) return state;
    return {
      past: [...state.past, state.present],
      present: state.future[0],
      future: state.future.slice(1),
      lastKey: null,
      lastAt: 0,
    };
  }
  const present = apply(state.present, action);
  if (present === state.present) return state;
  const key = action.type === 'patch' && action.coalesce ? `${action.id}:${action.coalesce}` : null;
  const now = Date.now();
  if (key && key === state.lastKey && now - state.lastAt < COALESCE_MS) {
    return { ...state, present, future: [], lastAt: now };
  }
  return {
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    present,
    future: [],
    lastKey: key,
    lastAt: now,
  };
}
