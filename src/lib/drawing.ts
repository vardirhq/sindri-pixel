// Sindri Pixel — stroke helpers shared by the drawing tools.
//
// Pixel-perfect strokes: a freehand line drawn with the mouse steps through
// pixels 8-connectedly, and every diagonal step made as "right, then down"
// leaves an extra corner pixel — a doubled, jagged "L". Pixel artists remove
// those by hand; `pixelPerfect` drops them as the stroke is drawn, leaving a
// clean one-pixel line.
//
// Shading: the Shade tool steps each pixel one shade lighter or darker along
// its colour ramp. Classic editors make you arrange ramps in the palette by
// hand; here the ramp is found from the colours available — the next colour
// of the same family (similar hue, or both greys) that is brighter or darker.
// That works on AI-imported sprites, whose palettes come in no order.

export type Point = [number, number];

/** Drop the corner pixel of every "L" (two orthogonal steps making one
 *  diagonal), so a freehand stroke stays one pixel thin. */
export function pixelPerfect(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    out.push(p);
    if (out.length < 3) continue;
    const [a, b, c] = out.slice(-3);
    const diagonal = Math.abs(a[0] - c[0]) === 1 && Math.abs(a[1] - c[1]) === 1;
    const corner = (b[0] === a[0] || b[1] === a[1]) && (b[0] === c[0] || b[1] === c[1]);
    if (diagonal && corner) out.splice(out.length - 2, 1);
  }
  return out;
}

interface Swatch {
  hex: string;
  luma: number;
  hue: number; // degrees
  sat: number; // 0..1
}

const parse = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

function describe(hex: string): Swatch {
  const [r, g, b] = parse(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hue = 0;
  if (d > 0) {
    if (max === r) hue = ((g - b) / d + 6) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
  }
  return { hex, luma: 0.299 * r + 0.587 * g + 0.114 * b, hue: hue * 60, sat: max === 0 ? 0 : d / max };
}

/** Below this saturation a colour counts as grey. */
const NEUTRAL_SAT = 0.12;
/** Hue a ramp may drift per step (pixel-art ramps hue-shift toward warm
 *  highlights and cool shadows). */
const RAMP_HUE = 40;
/** Smallest brightness step that counts as a different shade. */
const MIN_STEP = 3;
/** Cost of hue and saturation drift, against brightness steps (0–255). */
const HUE_COST = 1.5;
const SAT_COST = 120;

function sameFamily(a: Swatch, b: Swatch): boolean {
  const aGrey = a.sat < NEUTRAL_SAT;
  const bGrey = b.sat < NEUTRAL_SAT;
  if (aGrey || bGrey) return aGrey && bGrey;
  const dh = Math.abs(a.hue - b.hue);
  return Math.min(dh, 360 - dh) <= RAMP_HUE;
}

/**
 * Build a shader over `palette`: `shade(hex, 'lighten' | 'darken')` returns
 * the next colour along that colour's ramp, or the colour itself at the end
 * of the ramp (or when nothing in the palette is of its family).
 */
export function makeShader(palette: Iterable<string>): (hex: string, dir: 'lighten' | 'darken') => string {
  const swatches = [...new Set([...palette].map((h) => h.toLowerCase()))].map(describe);
  const cache = new Map<string, string>();
  return (hex, dir) => {
    const key = `${hex.toLowerCase()}|${dir}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const c = describe(hex.toLowerCase());
    let best: Swatch | null = null;
    let bestCost = Infinity;
    for (const s of swatches) {
      const step = dir === 'lighten' ? s.luma - c.luma : c.luma - s.luma;
      if (step < MIN_STEP || !sameFamily(c, s)) continue;
      // The nearest shade that stays in character: skin and orange hair
      // share a hue, but not a saturation, so they are different ramps.
      const dh = Math.abs(c.hue - s.hue);
      const cost = step + HUE_COST * Math.min(dh, 360 - dh) + SAT_COST * Math.abs(c.sat - s.sat);
      if (cost < bestCost) {
        best = s;
        bestCost = cost;
      }
    }
    const out = best ? best.hex : hex;
    cache.set(key, out);
    return out;
  };
}

/** A selection: a rectangle, optionally narrowed to listed pixels (wand,
 *  lasso). */
export interface SelectionShape {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  pixels?: [number, number][];
}

/** Capture a custom brush from the selected pixels of a layer, trimmed to
 *  its painted pixels. Null when the selection holds nothing painted. */
export function brushFromSelection(layer: (string | null)[][], sel: SelectionShape): (string | null)[][] | null {
  const minX = Math.min(sel.x0, sel.x1), maxX = Math.max(sel.x0, sel.x1);
  const minY = Math.min(sel.y0, sel.y1), maxY = Math.max(sel.y0, sel.y1);
  const picked = sel.pixels ? new Set(sel.pixels.map(([x, y]) => `${x},${y}`)) : null;
  const at = (x: number, y: number) => (picked && !picked.has(`${x},${y}`) ? null : layer[y]?.[x] ?? null);
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!at(x, y)) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return null;
  return Array.from({ length: y1 - y0 + 1 }, (_, dy) => Array.from({ length: x1 - x0 + 1 }, (_, dx) => at(x0 + dx, y0 + dy)));
}
