// Sindri Pixel — the lesson check engine.
//
// Each check reads a snapshot of the editor and says whether it is met, in
// words a learner understands ("Pick a dark colour"), with progress where
// there is a count ("12 / 18 pixels"). Everything here is pure: the player
// re-evaluates on every change, and the step completes when all checks pass.

import type { Tool } from '../../types';
import type { Check, CheckResult, ColorFamily, EditorState, LessonStep, Rect } from './types';

const TOOL_NAMES: Record<Tool, string> = {
  pencil: 'Pencil', eraser: 'Eraser', shade: 'Shade', fill: 'Fill', picker: 'Eyedropper', line: 'Line',
  rect: 'Rectangle', circle: 'Circle', select: 'Marquee', wand: 'Magic wand', lasso: 'Lasso', move: 'Move', pan: 'Pan',
};

export const toolName = (t: Tool): string => TOOL_NAMES[t] ?? t;

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** Brightness 0–255 (Rec. 601). */
export const luma = (hex: string): number => {
  const [r, g, b] = rgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

/** Does a colour belong to a family? Hue families need some saturation and
 *  brightness (a near-black red is "dark", not "red"). */
export function inFamily(hex: string, family: ColorFamily): boolean {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const y = luma(hex);
  if (family === 'dark') return y < 90;
  if (family === 'light') return y > 170;
  if (family === 'grey') return sat < 0.15;
  if (sat < 0.25 || max < 60) return false;
  const d = max - min;
  let h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  switch (family) {
    case 'red': return h < 15 || h >= 345;
    case 'orange': return h >= 15 && h < 45;
    case 'yellow': return h >= 45 && h < 70;
    case 'green': return h >= 70 && h < 165;
    case 'cyan': return h >= 165 && h < 200;
    case 'blue': return h >= 200 && h < 255;
    case 'purple': return h >= 255 && h < 300;
    case 'pink': return h >= 300 && h < 345;
  }
  return false;
}

const FAMILY_WORD: Record<ColorFamily, string> = {
  dark: 'a dark colour', light: 'a light colour', grey: 'a grey',
  red: 'a red', orange: 'an orange', yellow: 'a yellow', green: 'a green', cyan: 'a cyan', blue: 'a blue', purple: 'a purple', pink: 'a pink',
};

/** Does a colour pass a family / exact-colours filter (no filter = any)? */
function colorOk(c: string, family?: ColorFamily, hex?: string[]): boolean {
  if (hex?.length) return hex.some((h) => h.toLowerCase() === c.toLowerCase());
  if (family) return inFamily(c, family);
  return true;
}

function inRect(x: number, y: number, r?: Rect | null): boolean {
  return !r || (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h);
}

function countPixels(frame: (string | null)[][], region?: Rect, family?: ColorFamily, hex?: string[]): number {
  let n = 0;
  frame.forEach((row, y) => row.forEach((c, x) => { if (c && inRect(x, y, region) && colorOk(c, family, hex)) n++; }));
  return n;
}

/** Empty pixels inside `region` that a flood from the canvas edge can't
 *  reach without crossing paint: the interior of a closed outline. */
export function enclosedPixels(frame: (string | null)[][], region?: Rect | null): number {
  const h = frame.length;
  const w = frame[0]?.length ?? 0;
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (x: number, y: number) => {
    const i = y * w + x;
    if (!frame[y][x] && !outside[i]) { outside[i] = 1; stack.push(i); }
  };
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) seed(x - 1, y);
    if (x < w - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < h - 1) seed(x, y + 1);
  }
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!frame[y][x] && !outside[y * w + x] && inRect(x, y, region)) n++;
  return n;
}

/** Colours are "the same" within this per-channel difference (matches). */
const MATCH_TOLERANCE = 48;

function near(a: string, b: string): boolean {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.max(Math.abs(r1 - r2), Math.abs(g1 - g2), Math.abs(b1 - b2)) <= MATCH_TOLERANCE;
}

const where = (region?: Rect | null) => (region ? ' in the highlighted area' : '');
const ofColour = (family?: ColorFamily, hex?: string[]) =>
  hex?.length ? (hex.length === 1 ? ` of ${hex[0]}` : ' in the lesson colours') : family ? ` of ${FAMILY_WORD[family]}` : '';

/** Evaluate one check. `example` is the step's example (for `matches`). */
export function evaluate(check: Check, s: EditorState, example?: (string | null)[][] | null): CheckResult {
  switch (check.type) {
    case 'tool':
      return { label: `Use the ${toolName(check.tool)}`, met: s.tool === check.tool };
    case 'color': {
      const what = check.hex?.length ? (check.hex.length === 1 ? check.hex[0] : 'one of the lesson colours') : check.family ? FAMILY_WORD[check.family] : 'a colour';
      return { label: `Pick ${what}`, met: colorOk(s.color, check.family, check.hex) };
    }
    case 'pixels': {
      const n = countPixels(s.frame, check.region, check.family, check.hex);
      return {
        label: `Place ${check.min} pixel${check.min === 1 ? '' : 's'}${ofColour(check.family, check.hex)}${where(check.region)}`,
        met: n >= check.min,
        progress: `${Math.min(n, check.min)} / ${check.min}`,
      };
    }
    case 'closed': {
      const need = check.minInterior ?? 1;
      const n = enclosedPixels(s.frame, check.region);
      return { label: `Close the outline${where(check.region)} (no gaps)`, met: n >= need };
    }
    case 'filled': {
      const r = check.region;
      const total = r.w * r.h;
      const n = countPixels(s.frame, r, check.family, check.hex);
      const pct = Math.round((n / total) * 100);
      return {
        label: `Fill ${Math.round(check.share * 100)}% of the highlighted area${ofColour(check.family, check.hex)}`,
        met: n / total >= check.share,
        progress: `${pct}%`,
      };
    }
    case 'matches': {
      let want = 0;
      let got = 0;
      example?.forEach((row, y) => row.forEach((c, x) => {
        if (!c) return;
        want++;
        const have = s.frame[y]?.[x];
        if (have && near(have, c)) got++;
      }));
      const share = want ? got / want : 0;
      return {
        label: `Match the example (${Math.round(check.share * 100)}%)`,
        met: want > 0 && share >= check.share,
        progress: `${Math.round(share * 100)}%`,
      };
    }
    case 'frames':
      return { label: `Have ${check.min} frames`, met: s.frameCount >= check.min, progress: `${Math.min(s.frameCount, check.min)} / ${check.min}` };
    case 'layers':
      return { label: `Have ${check.min} layers on this frame`, met: s.layerCount >= check.min, progress: `${Math.min(s.layerCount, check.min)} / ${check.min}` };
    case 'tags':
      return { label: check.min === 1 ? 'Tag some frames' : `Create ${check.min} tags`, met: s.tagCount >= check.min };
    case 'maxColors': {
      const colors = new Set<string>();
      for (const f of s.allFrames) for (const row of f) for (const c of row) if (c) colors.add(c.toLowerCase());
      return { label: `Use at most ${check.max} colours in the sprite`, met: colors.size <= check.max, progress: `${colors.size} now` };
    }
    case 'onion':
      return { label: check.on ? 'Turn on onion skin' : 'Turn off onion skin', met: s.onion === check.on };
    case 'symmetry':
      return { label: check.mode === 'off' ? 'Turn symmetry off' : `Turn on ${check.mode === 'v' ? 'vertical' : check.mode === 'h' ? 'horizontal' : 'both-axis'} symmetry`, met: s.symmetry === check.mode };
    case 'playing':
      return { label: 'Press play (Space)', met: s.playing };
    case 'frameIndex':
      return { label: `Go to frame ${check.index + 1}`, met: s.frameIndex === check.index };
  }
}

/** Evaluate every check of a step. */
export function evaluateStep(step: LessonStep, s: EditorState): CheckResult[] {
  return step.checks.map((c) => evaluate(c, s, step.example));
}

/** A step is done when every check passes (a step without checks is read-only). */
export const stepDone = (results: CheckResult[]): boolean => results.length > 0 && results.every((r) => r.met);
