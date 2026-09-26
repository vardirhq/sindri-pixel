import { describe, expect, it } from 'vitest';
import { cropPose, splitSheet } from './splitSheet';
import { lcg, makeImage, put } from '../pixelReconstruction/__fixtures__/synthetic';
import type { RGBA, RGBAImage } from '../pixelReconstruction/types';

// ── A messy, AI-style sheet ─────────────────────────────────────────────────
// Poses are pixel-art "characters" (a head on a body, 6px pixels, each pose in
// its own colors) scattered the way generators do it: uneven spacing, sagging
// rows, one pose with a detached sword flash, two poses touching, and a text
// label under the last row.

const PIX = 6;

interface Placed { x: number; y: number; w: number; h: number; color: RGBA }

function drawPose(img: RGBAImage, x: number, y: number, color: RGBA, rnd: () => number): Placed {
  const cols = 9;
  const rows = 15;
  const shade = (k: number): RGBA => ({ r: Math.max(0, color.r - k), g: Math.max(0, color.g - k), b: Math.max(0, color.b - k), a: 255 });
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const head = gy < 5 && gx >= 2 && gx < 7;
      const body = gy >= 5 && gy < 11 && gx >= 1 && gx < 8;
      const legs = gy >= 11 && (gx === 2 || gx === 3 || gx === 5 || gx === 6);
      if (!head && !body && !legs) continue;
      const eye = gy === 2 && (gx === 3 || gx === 5);
      const c = eye ? { r: 250, g: 250, b: 248, a: 255 } : shade(Math.floor(rnd() * 40));
      for (let dy = 0; dy < PIX; dy++) for (let dx = 0; dx < PIX; dx++) put(img, x + gx * PIX + dx, y + gy * PIX + dy, c);
    }
  }
  // The art spans columns 1–7 (the body is widest).
  return { x: x + PIX, y, w: 7 * PIX, h: rows * PIX, color };
}

const COLORS: RGBA[] = [
  { r: 200, g: 60, b: 50, a: 255 }, { r: 60, g: 90, b: 200, a: 255 }, { r: 70, g: 160, b: 70, a: 255 },
  { r: 190, g: 140, b: 40, a: 255 }, { r: 150, g: 70, b: 170, a: 255 }, { r: 40, g: 150, b: 160, a: 255 },
  { r: 170, g: 90, b: 60, a: 255 },
];

function messySheet(transparent: boolean) {
  const W = 520;
  const H = 400;
  const img = makeImage(W, H);
  const rnd = lcg(21);
  if (!transparent) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = Math.floor(rnd() * 6);
      put(img, x, y, { r: 244 + n, g: 243 + n, b: 238 + n, a: 255 }); // noisy paper
    }
  }
  // Row 1 sags; spacing is uneven. Poses 4 & 5 (0-based 3, 4) touch.
  const spots: [number, number][] = [[20, 20], [120, 34], [250, 26], [360, 40], [414, 44], [40, 220], [200, 236]];
  const poses = spots.map(([x, y], i) => drawPose(img, x, y, COLORS[i], rnd));
  // Detached sword flash beside pose 2 (index 1), a few px away.
  for (let y = 70; y < 76; y++) for (let x = 180; x < 198; x++) put(img, x, y, { r: 240, g: 230, b: 120, a: 255 });
  // A thin text-like label far below the second row.
  for (let y = 372; y < 378; y++) for (let x = 180; x < 330; x++) if ((x >> 2) % 3) put(img, x, y, { r: 30, g: 30, b: 30, a: 255 });
  return { img, poses };
}

const contains = (r: { x: number; y: number; w: number; h: number }, p: Placed) =>
  r.x <= p.x && r.y <= p.y && r.x + r.w >= p.x + p.w && r.y + r.h >= p.y + p.h;

describe('sprite sheet splitting', () => {
  for (const transparent of [false, true]) {
    describe(transparent ? 'on transparency' : 'on noisy paper', () => {
      const { img, poses } = messySheet(transparent);
      const split = splitSheet(img);

      it('finds every pose, touching ones included, and nothing else', () => {
        expect(split.poses).toHaveLength(7);
      });

      it('orders poses in reading order despite the sagging row', () => {
        split.poses.forEach((r, i) => expect(contains(r, poses[i])).toBe(true));
      });

      it('keeps a detached piece with its pose', () => {
        const r = split.poses[1];
        expect(r.x + r.w).toBeGreaterThanOrEqual(198);
      });

      it('crops each pose clean: no neighbor, no backdrop, eyes kept', () => {
        const crop = cropPose(img, split, split.poses[3]);
        const own = poses[3].color;
        let foreign = 0;
        let opaque = 0;
        let whites = 0;
        for (let i = 0; i < crop.width * crop.height; i++) {
          const o = i * 4;
          if (crop.data[o + 3] === 0) continue;
          opaque++;
          const [r, g, b] = [crop.data[o], crop.data[o + 1], crop.data[o + 2]];
          if (r > 245 && g > 245) whites++;
          else if (Math.abs(r - own.r) > 45 || Math.abs(g - own.g) > 45 || Math.abs(b - own.b) > 45) foreign++;
        }
        expect(foreign).toBe(0); // nothing of the touching neighbor
        expect(whites).toBe(2 * PIX * PIX); // exactly the two eyes, no paper
        expect(opaque).toBeGreaterThan(80 * PIX * PIX);
      });
    });
  }

  it('separates rows packed so tight that hair touches the feet above', () => {
    // A 4×3 walk-cycle sheet: every column is one connected blob (a hair tip
    // bridges each row gap), so no pose-size ratio exists to go on — only the
    // near-empty rows between poses. Taken from a real AI sheet's layout.
    const img = makeImage(4 * 70, 3 * 96);
    const rnd = lcg(9);
    const placed: Placed[] = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        placed.push(drawPose(img, 8 + c * 70, 3 + r * 96, COLORS[(r * 4 + c) % COLORS.length], rnd));
        // Hair tip reaching up to touch the feet of the pose above.
        if (r > 0) for (let y = r * 96 - 6; y < r * 96 + 3; y++) for (let x = 8 + c * 70 + 22; x < 8 + c * 70 + 26; x++) put(img, x, y, COLORS[0]);
      }
    }
    const split = splitSheet(img);
    expect(split.poses).toHaveLength(12);
    split.poses.forEach((r, i) => {
      const p = placed[i];
      // Each box sits on its own pose (centers match) in reading order.
      expect(Math.abs(r.x + r.w / 2 - (p.x + p.w / 2))).toBeLessThan(8);
      expect(Math.abs(r.y + r.h / 2 - (p.y + p.h / 2))).toBeLessThan(12);
    });
  });

  it('keeps separate poses whole when another row is one long touching chain', () => {
    // Row 1: five poses joined fist-to-fist into one wide blob, larger than
    // four single poses. Row 2, just below: three poses standing apart. Next
    // to the chain they look small, but they are poses, not fragments to glue
    // onto the pose above.
    const img = makeImage(5 * 54 + 20, 250);
    const rnd = lcg(5);
    const placed: Placed[] = [];
    for (let c = 0; c < 5; c++) {
      placed.push(drawPose(img, 4 + c * 54, 4, COLORS[c], rnd));
      // A fist reaching across to the next pose.
      if (c < 4) for (let y = 40; y < 46; y++) for (let x = 4 + c * 54 + 48; x < 4 + (c + 1) * 54 + 6; x++) put(img, x, y, COLORS[c]);
    }
    for (let c = 0; c < 3; c++) placed.push(drawPose(img, 20 + c * 90, 4 + 15 * PIX + 14, COLORS[c + 2], rnd));
    const split = splitSheet(img);
    expect(split.poses).toHaveLength(8);
    split.poses.forEach((r, i) => {
      const p = placed[i];
      expect(Math.abs(r.x + r.w / 2 - (p.x + p.w / 2))).toBeLessThan(10);
      expect(Math.abs(r.y + r.h / 2 - (p.y + p.h / 2))).toBeLessThan(12);
    });
  });

  it('keeps a boot with its pose when it hangs down beside the hair below', () => {
    // Two rows, four columns, on a sheet large enough for a coarse 5px grid.
    // Each upper pose's boot reaches down past the top of the hair of the
    // pose below, 4px to its side: never touching, but closer than the grid
    // can see. The narrowest row is the boot's top, so a straight cut there
    // would give the boot to the pose below.
    const img = makeImage(1920, 700);
    const fill = (x0: number, y0: number, x1: number, y1: number, c: RGBA) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(img, x, y, c);
    };
    const BOOT: RGBA = { r: 120, g: 70, b: 40, a: 255 };
    const HAIR: RGBA = { r: 230, g: 100, b: 30, a: 255 };
    for (let c = 0; c < 4; c++) {
      const x = 40 + c * 470;
      fill(x + 40, 20, x + 160, 220, COLORS[1]); // upper torso
      fill(x + 70, 220, x + 90, 300, COLORS[1]); // legs
      fill(x + 110, 220, x + 130, 300, COLORS[1]);
      fill(x + 110, 300, x + 140, 340, BOOT); // boot, hanging low
      fill(x, 315, x + 106, 360, HAIR); // hair of the pose below, 4px left
      fill(x, 360, x + 170, 560, COLORS[2]); // lower head and body
    }
    const split = splitSheet(img);
    expect(split.poses).toHaveLength(8);
    const count = (crop: RGBAImage, c: RGBA) => {
      let n = 0;
      for (let i = 0; i < crop.width * crop.height; i++) {
        const o = i * 4;
        if (crop.data[o + 3] && crop.data[o] === c.r && crop.data[o + 1] === c.g && crop.data[o + 2] === c.b) n++;
      }
      return n;
    };
    for (let c = 0; c < 4; c++) {
      const upper = cropPose(img, split, split.poses[c]);
      const lower = cropPose(img, split, split.poses[4 + c]);
      expect(count(upper, BOOT)).toBe(30 * 40);
      expect(count(lower, BOOT)).toBe(0);
      expect(count(lower, HAIR)).toBe(106 * 45);
    }
  });

  it('leaves a single sprite (with a detached sword and a shadow) whole', () => {
    const img = makeImage(200, 200);
    const rnd = lcg(3);
    drawPose(img, 70, 40, COLORS[0], rnd);
    for (let y = 60; y < 66; y++) for (let x = 132; x < 150; x++) put(img, x, y, { r: 240, g: 230, b: 120, a: 255 });
    for (let y = 138; y < 142; y++) for (let x = 66; x < 130; x++) put(img, x, y, { r: 20, g: 20, b: 30, a: 120 });
    expect(splitSheet(img).poses).toHaveLength(1);
  });

  it('treats an empty image as one frame', () => {
    expect(splitSheet(makeImage(40, 40)).poses).toEqual([{ x: 0, y: 0, w: 40, h: 40, label: 0 }]);
  });
});
