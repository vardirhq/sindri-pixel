// Sindri Pixel — the lessons that ship with the app.
//
// Art is written as character grids (one character per pixel) and built up
// step by step, so each step's example is exactly the previous result plus
// what that step adds.

import type { Frame, PixelGrid } from '../../types';
import { enclosedPixels } from './checks';
import { LESSON_FORMAT, LESSON_FORMAT_VERSION, type Lesson } from './types';

type Grid = (string | null)[][];

/** Decode rows of characters through a colour key ('.' = empty). */
function art(rows: string[], key: Record<string, string>): Grid {
  return rows.map((r) => [...r].map((ch) => key[ch] ?? null));
}

const clone = (g: Grid): Grid => g.map((r) => r.slice());

/** Paint every enclosed empty pixel (the inside of the outlines). */
function fillInside(g: Grid, color: string): Grid {
  const out = clone(g);
  const h = g.length;
  const w = g[0].length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (out[y][x]) continue;
      // Enclosed if, with only this pixel's neighbourhood considered, it is
      // not reachable from the edge: reuse the checker on a one-pixel region.
      if (enclosedPixels(g, { x, y, w: 1, h: 1 }) === 1) out[y][x] = color;
    }
  }
  return out;
}

function paint(g: Grid, color: string, pixels: [number, number][]): Grid {
  const out = clone(g);
  for (const [x, y] of pixels) out[y][x] = color;
  return out;
}

const blank = (w: number, h: number): Grid => Array.from({ length: h }, () => Array(w).fill(null));

const frameOf = (id: string, pixels: PixelGrid): Frame => ({
  id, duration: 140, layers: [{ id: `${id}_l0`, name: 'sprite', visible: true, opacity: 1, pixels }],
});

// ── Shared colours ───────────────────────────────────────────────────────────

const INK = '#1a1c2c';
const GREEN_DARK = '#1e5e3b';
const GREEN = '#38b764';
const GREEN_LIGHT = '#8fe08a';
const RED = '#e05555';
const RED_LIGHT = '#ffb0a0';

// ── 1 · Your first sprite: a slime ───────────────────────────────────────────

const SLIME_OUTLINE = art([
  '................',
  '................',
  '................',
  '................',
  '......kkkk......',
  '....kk....kk....',
  '...k........k...',
  '..k..........k..',
  '..k..........k..',
  '.k............k.',
  '.k............k.',
  '.k............k.',
  '.k............k.',
  '..kkkkkkkkkkkk..',
  '................',
  '................',
], { k: INK });

const SLIME_FILLED = fillInside(SLIME_OUTLINE, GREEN);
const SLIME_EYES = paint(SLIME_FILLED, INK, [[6, 8], [6, 9], [9, 8], [9, 9]]);
const SLIME_SHADED = paint(SLIME_EYES, GREEN_DARK, [
  ...Array.from({ length: 12 }, (_, i) => [2 + i, 12] as [number, number]),
  [2, 11], [3, 11], [12, 11], [13, 11],
]);
const SLIME_DONE = paint(SLIME_SHADED, GREEN_LIGHT, [[5, 6], [6, 6], [4, 7]]);

const firstSprite: Lesson = {
  format: LESSON_FORMAT,
  version: LESSON_FORMAT_VERSION,
  id: 'first-sprite',
  title: 'Your first sprite',
  author: 'Sindri team',
  difficulty: 'beginner',
  minutes: 5,
  summary: 'Outline, fill and shade a slime: the three moves behind almost every sprite.',
  intro: 'A clean one-pixel outline, a flat fill, then light and shadow. You’ll draw on a fresh 16×16 canvas; your own sprite is put aside and comes back when you leave.',
  outro: 'That’s the whole loop: outline, fill, shade. Try it on your own sprite next, and use the Shade tool (D) whenever a flat area needs depth.',
  start: { w: 16, h: 16, swatches: [INK, GREEN_DARK, GREEN, GREEN_LIGHT, '#f4f4f4', '#b13e53', '#ef7d57', '#ffcd75', '#29366f', '#3b5dc9', '#41a6f6'] },
  cover: SLIME_DONE,
  steps: [
    {
      id: 'pencil',
      title: 'Pick the pencil',
      instruction: 'Press P, or click the pencil at the top of the tools panel.',
      spotlight: 'toolbar',
      checks: [{ type: 'tool', tool: 'pencil' }],
    },
    {
      id: 'ink',
      title: 'Pick a dark ink for the outline',
      instruction: 'In the Palette tab, click the darkest colour. Outlines read best when they’re much darker than what they surround.',
      hint: 'Any dark colour works. The lesson checks brightness, not the exact colour.',
      spotlight: 'palette',
      checks: [{ type: 'color', family: 'dark' }],
    },
    {
      id: 'outline',
      title: 'Trace the outline',
      instruction: 'Trace the faint slime shape. Drag with the pencil. Pixel-perfect strokes (on by default) keep curves one pixel thin.',
      hint: 'Missed a pixel? The gap has to be closed for the next step. Eraser is E; switch back with P.',
      spotlight: 'canvas',
      region: { x: 1, y: 4, w: 14, h: 10 },
      tools: ['pencil', 'eraser'],
      example: SLIME_OUTLINE,
      checks: [{ type: 'matches', share: 0.85 }, { type: 'closed', region: { x: 1, y: 4, w: 14, h: 10 }, minInterior: 40 }],
    },
    {
      id: 'fill',
      title: 'Fill the body',
      instruction: `Press G for Fill, pick the middle green (${GREEN}), and click inside the outline.`,
      hint: 'If the whole canvas turned green, the outline has a gap: undo (⌘Z), close it with the pencil, and fill again.',
      spotlight: 'canvas',
      region: { x: 3, y: 7, w: 10, h: 5 },
      tools: ['fill', 'pencil', 'eraser'],
      checks: [{ type: 'filled', region: { x: 3, y: 7, w: 10, h: 5 }, share: 0.9, hex: [GREEN] }],
    },
    {
      id: 'eyes',
      title: 'Give it eyes',
      instruction: 'With the pencil and the dark ink, add two small eyes. Two pixels tall reads as “looking at you”.',
      spotlight: 'canvas',
      region: { x: 4, y: 7, w: 8, h: 4 },
      tools: ['pencil', 'eraser'],
      example: SLIME_EYES,
      checks: [{ type: 'pixels', min: 2, region: { x: 4, y: 7, w: 8, h: 4 }, family: 'dark' }],
    },
    {
      id: 'shadow',
      title: 'Shade the bottom',
      instruction: 'Press D for the Shade tool and drag along the bottom of the slime. Each pixel steps one shade darker, whatever colour it is.',
      hint: 'Shade finds the ramp itself: the darker green is the next colour of the same family. Hold Shift to lighten instead.',
      spotlight: 'canvas',
      region: { x: 2, y: 11, w: 12, h: 2 },
      tools: ['shade'],
      example: SLIME_SHADED,
      checks: [{ type: 'pixels', min: 8, region: { x: 2, y: 11, w: 12, h: 2 }, hex: [GREEN_DARK] }],
    },
    {
      id: 'highlight',
      title: 'Add a highlight',
      instruction: 'Still on Shade, hold Shift and dab the top-left of the body: light comes from above-left in most pixel art.',
      spotlight: 'canvas',
      region: { x: 3, y: 5, w: 5, h: 3 },
      tools: ['shade'],
      example: SLIME_DONE,
      checks: [{ type: 'pixels', min: 2, region: { x: 3, y: 5, w: 5, h: 3 }, hex: [GREEN_LIGHT] }],
    },
  ],
};

// ── 2 · Onion skin: a bouncing ball ─────────────────────────────────────────

const BALL_KEY = { k: INK, r: RED, l: RED_LIGHT };
function place(g: Grid, piece: Grid, x0: number, y0: number): Grid {
  const out = clone(g);
  piece.forEach((row, y) => row.forEach((c, x) => { if (c) out[y0 + y][x0 + x] = c; }));
  return out;
}
const BALL = art(['.kkkk.', 'klrrrk', 'krrrrk', 'krrrrk', 'krrrrk', '.kkkk.'], BALL_KEY);
const BALL_SQUASH = art(['.kkkkkk.', 'klrrrrrk', 'krrrrrrk', '.kkkkkk.'], BALL_KEY);
const BALL_TOP = place(blank(16, 16), BALL, 5, 1);
const BALL_LOW = place(blank(16, 16), BALL_SQUASH, 4, 11);
const BALL_MID = place(blank(16, 16), BALL, 5, 6);

const bouncingBall: Lesson = {
  format: LESSON_FORMAT,
  version: LESSON_FORMAT_VERSION,
  id: 'bouncing-ball',
  title: 'Onion skin: a bouncing ball',
  author: 'Sindri team',
  difficulty: 'beginner',
  minutes: 6,
  summary: 'Animate a ball with squash, seeing the previous frame through the one you draw.',
  intro: 'Animation is drawing the next pose where the last one was. Onion skin shows the neighbouring frames faintly, so you can place each pose with confidence.',
  outro: 'You animated a loop with squash, tagged it and played it. The same flow scales to walk cycles: tag each animation so one sprite holds them all.',
  start: { w: 16, h: 16, frames: [frameOf('ball_1', BALL_TOP)], swatches: [INK, RED, RED_LIGHT, '#b13e53', '#f4f4f4'] },
  cover: place(BALL_LOW, BALL, 5, 2),
  steps: [
    {
      id: 'onion',
      title: 'Turn on onion skin',
      instruction: 'Click “onion skin” in the timeline (or press ⇧O).',
      spotlight: 'timeline',
      checks: [{ type: 'onion', on: true }],
    },
    {
      id: 'frame2',
      title: 'Add a second frame',
      instruction: 'Click the + at the end of the timeline. The new frame is empty, but the ball from frame 1 shows through faintly.',
      spotlight: 'timeline',
      checks: [{ type: 'frames', min: 2 }, { type: 'frameIndex', index: 1 }],
    },
    {
      id: 'squash',
      title: 'Draw the ball squashed on the ground',
      instruction: 'On frame 2, draw the ball at the bottom, wider and flatter: it squashes when it lands. Trace the example, or draw your own.',
      hint: 'Use the dark ink for the outline and red for the inside. Fill (G) works inside a closed outline.',
      spotlight: 'canvas',
      region: { x: 3, y: 10, w: 10, h: 6 },
      tools: ['pencil', 'eraser', 'fill', 'picker'],
      example: BALL_LOW,
      checks: [{ type: 'frameIndex', index: 1 }, { type: 'pixels', min: 14, region: { x: 3, y: 10, w: 10, h: 6 } }],
    },
    {
      id: 'frame3',
      title: 'Add the in-between',
      instruction: 'Add a third frame and draw the ball halfway, round again. Onion skin now shows frame 2 below it.',
      spotlight: 'canvas',
      region: { x: 4, y: 5, w: 8, h: 7 },
      tools: ['pencil', 'eraser', 'fill', 'picker'],
      example: BALL_MID,
      checks: [{ type: 'frames', min: 3 }, { type: 'frameIndex', index: 2 }, { type: 'pixels', min: 14, region: { x: 4, y: 5, w: 8, h: 7 } }],
    },
    {
      id: 'tag',
      title: 'Tag the animation',
      instruction: 'Click frame 1, shift-click frame 3, then click “+ tag” in the timeline. Tags name animations (“bounce”, “idle”) and export to game engines.',
      spotlight: 'timeline',
      checks: [{ type: 'tags', min: 1 }],
    },
    {
      id: 'play',
      title: 'Play it',
      instruction: 'Press Space to play. Click the tag to switch its direction to ping-pong (⇄) for a smooth up-and-down.',
      spotlight: 'timeline',
      checks: [{ type: 'playing' }],
    },
  ],
};

// ── 3 · Cleaning up an AI import ────────────────────────────────────────────

/** Near-miss colours an AI image leaves after downscaling. */
const STRAYS: Record<string, string[]> = {
  [GREEN]: ['#3ab866', '#34b25f'],
  [INK]: ['#1d1f30'],
  [GREEN_DARK]: ['#21623f'],
};
function withStrays(g: Grid): Grid {
  let n = 0;
  return g.map((row) => row.map((c) => {
    if (!c || !STRAYS[c]) return c;
    n++;
    const alts = STRAYS[c];
    return n % 3 === 0 ? alts[n % alts.length] : c;
  }));
}
const MESSY_SLIME = withStrays(SLIME_DONE);

const aiCleanup: Lesson = {
  format: LESSON_FORMAT,
  version: LESSON_FORMAT_VERSION,
  id: 'ai-cleanup',
  title: 'Cleaning up an AI import',
  author: 'Sindri team',
  difficulty: 'intermediate',
  minutes: 4,
  summary: 'AI images come back with near-duplicate colours. Merge them into a clean palette in a few clicks.',
  intro: 'After Import AI Art, a sprite often has colours that are almost, but not quite, the same: #38b764 and #3ab866 look identical but count as two. Clean pixel art uses a few deliberate colours.',
  outro: 'Four colours, each doing a job. Do this after every AI import: fewer colours make shading with the Shade tool and palette swaps behave.',
  start: { w: 16, h: 16, frames: [frameOf('messy', MESSY_SLIME)], swatches: [INK, GREEN_DARK, GREEN, GREEN_LIGHT] },
  cover: MESSY_SLIME,
  steps: [
    {
      id: 'look',
      title: 'Count the colours',
      instruction: 'Open the Palette tab and look at “In artwork”: 8 colours for a sprite that needs 4. The extra ones are near-copies scattered through the body.',
      spotlight: 'palette',
      checks: [],
    },
    {
      id: 'greens',
      title: 'Merge the stray greens',
      instruction: `Double-click a stray green under “In artwork” and type ${GREEN.slice(1)} into its hex field. Every pixel of it becomes the real green, in every frame. Do the same for the other stray green.`,
      hint: 'The strays sit next to the real green in “In artwork” and look the same; their hex values are a few steps off.',
      spotlight: 'palette',
      checks: [{ type: 'maxColors', max: 6 }],
    },
    {
      id: 'rest',
      title: 'Merge the rest',
      instruction: `The outline and the shadow each have a near-copy too. Merge them into ${INK} and ${GREEN_DARK}.`,
      spotlight: 'palette',
      checks: [{ type: 'maxColors', max: 4 }],
    },
  ],
};

export const BUILTIN_LESSONS: Lesson[] = [firstSprite, bouncingBall, aiCleanup];
