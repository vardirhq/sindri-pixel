// Sindri Pixel — splitting an AI-generated sprite sheet into frames.
//
// Generators asked for "a sprite sheet" produce several poses in one image,
// but almost never on a real grid: spacing is uneven, rows sag, poses touch,
// bits float free (a sword flash, a strand of hair, a shadow), and labels get
// scribbled underneath. So nothing here assumes cells. The splitter finds the
// poses themselves:
//
//  1. Foreground. Transparent pixels, or pixels far from the backdrop color
//     (estimated from the border, with a tolerance learned from how noisy the
//     border is).
//  2. Blobs. Connected foreground regions on a coarse grid (fast, and blind to
//     anti-aliasing specks), grown by one cell so a pose's near-touching parts
//     stay together.
//  3. Clean-up. Small blobs join the nearest pose when close (detached bits),
//     or are dropped when far or text-like (specks, labels). A blob far wider
//     or taller than a typical pose, or with a near-empty row/column running
//     through it, is cut there — poses that touch — and each side keeps the
//     pixels it reaches first from its own core.
//  4. Order. Rows by vertical center, then left to right.
//
// Getting most poses right is the goal; the animation workspace (feet
// alignment, per-frame move/scale, onion skin) fixes the rest by hand.

import type { RGBAImage } from '../pixelReconstruction/types';

export interface Pose {
  /** Region of the sheet, in source pixels (padded, clipped to the image). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Blob id in `SheetSplit.labels`. */
  label: number;
}

export interface SheetSplit {
  poses: Pose[];
  /** Coarse-grid cell size in source pixels, and the grid's dimensions. */
  cell: number;
  gridWidth: number;
  gridHeight: number;
  /** Blob id per coarse cell (0 = none). */
  labels: Int32Array;
  /** Foreground mask per source pixel. */
  mask: Uint8Array;
}

/** Coarse grid resolution: about this many cells along the longer side. */
const GRID_TARGET = 384;
/** A cell is foreground if at least this share of its pixels are. */
const CELL_FILL = 0.15;
/** Blobs smaller than this share of the largest are fragments, not poses. */
const POSE_MIN_AREA = 0.25;
/** After cuts, a fragment this large vs the median pose is a pose after all. */
const POSE_PROMOTE_AREA = 0.4;
/** Fragments within this share of a typical pose height join that pose. */
const MERGE_GAP = 0.35;
/** A blob this many typical widths/heights across holds several poses. */
const SPLIT_RATIO = 1.6;
/** A row/column this sparse (vs the blob's median) is a gap between poses. */
const VALLEY_DEPTH = 0.25;

/** Which pixels are foreground: opaque art on transparency, or anything that
 *  stands out from a flat (possibly noisy) backdrop. */
export function foregroundMask(image: RGBAImage): Uint8Array {
  const { data, width, height } = image;
  const border: number[] = [];
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) border.push(y * width, y * width + width - 1);
  const mask = new Uint8Array(width * height);

  const clearBorder = border.filter((i) => data[i * 4 + 3] < 16).length;
  if (clearBorder > border.length / 2) {
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] >= 64 ? 1 : 0;
    return mask;
  }

  // Backdrop color: per-channel median of the border.
  const median = (k: number) => {
    const v = border.map((i) => data[i * 4 + k]).sort((a, b) => a - b);
    return v[v.length >> 1];
  };
  const bg = [median(0), median(1), median(2)];
  const dist = (o: number) => Math.hypot(data[o] - bg[0], data[o + 1] - bg[1], data[o + 2] - bg[2]);
  // Tolerance from the border's own noise (JPEG, gradients), with a floor.
  const bd = border.map((i) => dist(i * 4)).sort((a, b) => a - b);
  const tol = Math.max(36, 3 * bd[Math.floor(bd.length * 0.9)]);
  for (let i = 0; i < mask.length; i++) {
    const o = i * 4;
    mask[i] = data[o + 3] >= 64 && dist(o) > tol ? 1 : 0;
  }
  return mask;
}

interface Blob {
  label: number;
  area: number; // foreground cells
  x0: number;
  y0: number;
  x1: number; // exclusive
  y1: number;
}

const median = (values: number[]) => {
  const v = [...values].sort((a, b) => a - b);
  return v.length ? v[v.length >> 1] : 0;
};

/** Find the poses on a sheet. A single sprite comes back as one pose. */
export function splitSheet(image: RGBAImage): SheetSplit {
  const { width, height } = image;
  const mask = foregroundMask(image);
  const cell = Math.max(1, Math.round(Math.max(width, height) / GRID_TARGET));
  const gw = Math.ceil(width / cell);
  const gh = Math.ceil(height / cell);

  // Coarse foreground cells.
  const counts = new Uint32Array(gw * gh);
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / cell) * gw;
    for (let x = 0; x < width; x++) if (mask[y * width + x]) counts[row + Math.floor(x / cell)]++;
  }
  const fg = new Uint8Array(gw * gh);
  const need = Math.max(1, CELL_FILL * cell * cell);
  for (let i = 0; i < fg.length; i++) fg[i] = counts[i] >= need ? 1 : 0;

  // Grow by one cell so near-touching parts of one pose connect.
  const grown = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (!fg[y * gw + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < gw && ny < gh) grown[ny * gw + nx] = 1;
        }
      }
    }
  }

  // 8-connected blobs on the grown mask; stats over true foreground cells.
  const labels = new Int32Array(gw * gh);
  let blobs: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < labels.length; start++) {
    if (!grown[start] || labels[start]) continue;
    const blob: Blob = { label: blobs.length + 1, area: 0, x0: gw, y0: gh, x1: 0, y1: 0 };
    labels[start] = blob.label;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % gw;
      const y = (i - x) / gw;
      if (fg[i]) {
        blob.area++;
        blob.x0 = Math.min(blob.x0, x);
        blob.y0 = Math.min(blob.y0, y);
        blob.x1 = Math.max(blob.x1, x + 1);
        blob.y1 = Math.max(blob.y1, y + 1);
      }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const j = ny * gw + nx;
          if (grown[j] && !labels[j]) {
            labels[j] = blob.label;
            stack.push(j);
          }
        }
      }
    }
    blobs.push(blob);
  }
  blobs = blobs.filter((b) => b.area > 0);
  if (blobs.length === 0) {
    return { poses: [{ x: 0, y: 0, w: width, h: height, label: 0 }], cell, gridWidth: gw, gridHeight: gh, labels, mask };
  }

  const relabel = (from: number, to: number) => {
    for (let i = 0; i < labels.length; i++) if (labels[i] === from) labels[i] = to;
  };

  // Poses vs fragments.
  const largest = Math.max(...blobs.map((b) => b.area));
  let poses = blobs.filter((b) => b.area >= POSE_MIN_AREA * largest);
  let fragments = blobs.filter((b) => b.area < POSE_MIN_AREA * largest);
  let typH = median(poses.map((b) => b.y1 - b.y0));
  let typW = median(poses.map((b) => b.x1 - b.x0));

  // Cut blobs that hold several touching poses (needs a typical size to
  // compare against, so only with more than one pose). This runs before
  // fragments are attached, so a pose plus its sword flash isn't mistaken
  // for two poses.
  let nextLabel = blobs.length + 1;
  // Two ways a blob can hold several poses:
  //  - `valley`: poses packed so close that a hair tip touches the feet
  //    above. The foreground count per row (column) all but vanishes between
  //    them, so cut at those near-empty rows — no pose size needed, which
  //    matters when every blob is a merged column and "typical" means nothing.
  //  - `ratio`: poses that overlap outright, no valley. Cut a blob far larger
  //    than a typical pose into equal-ish parts at its thinnest lines.
  const splitAxis = (b: Blob, horizontal: boolean, mode: 'valley' | 'ratio'): Blob[] => {
    const span = horizontal ? b.x1 - b.x0 : b.y1 - b.y0;
    const across = horizontal ? b.y1 - b.y0 : b.x1 - b.x0;
    // Foreground count per column (or row) inside this blob.
    const profile = new Array<number>(span).fill(0);
    for (let y = b.y0; y < b.y1; y++) {
      for (let x = b.x0; x < b.x1; x++) {
        const i = y * gw + x;
        if (labels[i] === b.label && fg[i]) profile[horizontal ? x - b.x0 : y - b.y0]++;
      }
    }
    const cuts: number[] = [];
    let typ: number;
    if (mode === 'valley') {
      // A pose is at least ~0.6 as long as the blob is wide (sprites aren't
      // slivers), which keeps cuts out of a single pose's narrow waist.
      typ = Math.max(2, Math.round(0.6 * across));
      const busy = median(profile.filter((v) => v > 0));
      const low = (t: number) => profile[t] <= VALLEY_DEPTH * busy;
      for (let t = typ; t <= span - typ; t++) {
        if (!low(t)) continue;
        let end = t;
        while (end + 1 <= span - typ && low(end + 1)) end++;
        let best = t;
        for (let u = t; u <= end; u++) if (profile[u] < profile[best]) best = u;
        if (best - (cuts[cuts.length - 1] ?? 0) >= typ) cuts.push(best);
        t = end;
      }
    } else {
      typ = horizontal ? typW : typH;
      const n = Math.round(span / typ);
      if (poses.length < 2 || span < SPLIT_RATIO * typ || n < 2) return [b];
      for (let k = 1; k < n; k++) {
        const target = Math.round((k * span) / n);
        const win = Math.max(1, Math.round(0.3 * typ));
        let best = target;
        for (let t = Math.max(1, target - win); t <= Math.min(span - 1, target + win); t++) {
          if (profile[t] < profile[best]) best = t;
        }
        cuts.push(best);
      }
    }
    if (cuts.length === 0) return [b];
    const bounds = [0, ...cuts, span];
    // Assign the blob's cells by growing from each pose's core at once (a
    // multi-source flood): cells well inside a slice seed it, and contested
    // cells near a cut go to whichever pose reaches them first along its own
    // pixels — so a fist reaching across the cut stays with its arm, where a
    // straight cut would slice it off.
    const margin = Math.max(1, Math.round(0.2 * typ));
    const partLabels = bounds.slice(0, -1).map((_, k) => (k === 0 ? b.label : nextLabel++));
    const owner = new Int32Array(gw * gh);
    const queue: number[] = [];
    for (let y = b.y0; y < b.y1; y++) {
      for (let x = b.x0; x < b.x1; x++) {
        const i = y * gw + x;
        if (labels[i] !== b.label) continue;
        const pos = horizontal ? x - b.x0 : y - b.y0;
        for (let k = 0; k < bounds.length - 1; k++) {
          const lo = k === 0 ? bounds[k] : bounds[k] + margin;
          const hi = k === bounds.length - 2 ? bounds[k + 1] : bounds[k + 1] - margin;
          if (pos >= lo && pos < hi) {
            owner[i] = partLabels[k];
            queue.push(i);
          }
        }
      }
    }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      const cx = i % gw;
      const cy = (i - cx) / gw;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const j = ny * gw + nx;
          if (labels[j] === b.label && !owner[j]) {
            owner[j] = owner[i];
            queue.push(j);
          }
        }
      }
    }
    const parts: Blob[] = partLabels.map((label) => ({ label, area: 0, x0: gw, y0: gh, x1: 0, y1: 0 }));
    for (let y = b.y0; y < b.y1; y++) {
      for (let x = b.x0; x < b.x1; x++) {
        const i = y * gw + x;
        if (labels[i] !== b.label || !owner[i]) continue;
        labels[i] = owner[i];
        if (!fg[i]) continue;
        const part = parts[partLabels.indexOf(owner[i])];
        part.area++;
        part.x0 = Math.min(part.x0, x);
        part.y0 = Math.min(part.y0, y);
        part.x1 = Math.max(part.x1, x + 1);
        part.y1 = Math.max(part.y1, y + 1);
      }
    }
    reattach(parts);
    return parts.filter((p) => p.area > 0);
  };

  // A straight cut through overlapping poses leaves slivers on the wrong
  // side (a fist reaching across). Any piece of a part not connected to that
  // part's main body goes back to the neighboring part it touches.
  const reattach = (parts: Blob[]) => {
    const ids = new Set(parts.map((p) => p.label));
    const seen = new Uint8Array(gw * gh);
    for (const part of parts) {
      const pieces: number[][] = [];
      for (let y = part.y0; y < part.y1; y++) {
        for (let x = part.x0; x < part.x1; x++) {
          const start = y * gw + x;
          if (seen[start] || !fg[start] || labels[start] !== part.label) continue;
          const piece: number[] = [];
          seen[start] = 1;
          const todo = [start];
          while (todo.length) {
            const i = todo.pop()!;
            piece.push(i);
            const cx = i % gw;
            const cy = (i - cx) / gw;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
                const j = ny * gw + nx;
                if (!seen[j] && fg[j] && labels[j] === part.label) {
                  seen[j] = 1;
                  todo.push(j);
                }
              }
            }
          }
          pieces.push(piece);
        }
      }
      pieces.sort((a, b) => b.length - a.length);
      for (const piece of pieces.slice(1)) {
        const votes = new Map<number, number>();
        for (const i of piece) {
          const cx = i % gw;
          const cy = (i - cx) / gw;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
              const l = labels[ny * gw + nx];
              if (l !== part.label && ids.has(l)) votes.set(l, (votes.get(l) ?? 0) + 1);
            }
          }
        }
        let to = 0;
        let most = 0;
        for (const [l, n] of votes) if (n > most) { most = n; to = l; }
        if (!to) continue;
        const target = parts.find((p) => p.label === to)!;
        for (const i of piece) {
          labels[i] = to;
          const cx = i % gw;
          const cy = (i - cx) / gw;
          part.area--;
          target.area++;
          target.x0 = Math.min(target.x0, cx);
          target.y0 = Math.min(target.y0, cy);
          target.x1 = Math.max(target.x1, cx + 1);
          target.y1 = Math.max(target.y1, cy + 1);
        }
      }
    }
  };
  const valleySplit = (bs: Blob[]) =>
    bs.flatMap((b) => splitAxis(b, false, 'valley')).flatMap((b) => splitAxis(b, true, 'valley'));
  poses = valleySplit(poses);
  // "Small next to the largest blob" was judged before the cuts. When the
  // largest was a chain of touching poses, a lone pose looked like a
  // fragment; measured against the poses the cuts produced, it isn't one.
  const typArea = median(poses.map((b) => b.area));
  const promoted = fragments.filter((f) => f.area >= POSE_PROMOTE_AREA * typArea);
  if (promoted.length) {
    poses = [...poses, ...valleySplit(promoted)];
    fragments = fragments.filter((f) => !promoted.includes(f));
  }
  typH = median(poses.map((b) => b.y1 - b.y0));
  typW = median(poses.map((b) => b.x1 - b.x0));
  poses = poses.flatMap((b) => splitAxis(b, true, 'ratio')).flatMap((b) => splitAxis(b, false, 'ratio'));

  const gap = (a: Blob, b: Blob) =>
    Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1), Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
  for (const f of fragments) {
    const fh = f.y1 - f.y0;
    const fw = f.x1 - f.x0;
    const textLike = fh < 0.18 * typH && fw > 5 * fh; // a line of words, not a sword
    let best: Blob | null = null;
    for (const p of poses) if (!best || gap(f, p) < gap(f, best)) best = p;
    if (best && !textLike && gap(f, best) <= MERGE_GAP * typH) {
      relabel(f.label, best.label);
      best.area += f.area;
      best.x0 = Math.min(best.x0, f.x0);
      best.y0 = Math.min(best.y0, f.y0);
      best.x1 = Math.max(best.x1, f.x1);
      best.y1 = Math.max(best.y1, f.y1);
    } else {
      relabel(f.label, 0);
    }
  }

  // Reading order: rows by vertical center, then left to right.
  const cy = (b: Blob) => (b.y0 + b.y1) / 2;
  const rows: Blob[][] = [];
  for (const b of [...poses].sort((a, c) => cy(a) - cy(c))) {
    const row = rows[rows.length - 1];
    const rowCy = row ? row.reduce((s, r) => s + cy(r), 0) / row.length : 0;
    if (row && Math.abs(cy(b) - rowCy) < 0.5 * typH) row.push(b);
    else rows.push([b]);
  }
  const ordered = rows.flatMap((row) => row.sort((a, c) => a.x0 + a.x1 - (c.x0 + c.x1)));

  // Back to source pixels, with a little breathing room.
  const pad = Math.max(2, Math.round(0.06 * Math.min(typW, typH) * cell));
  return {
    poses: ordered.map((b) => {
      const x = Math.max(0, b.x0 * cell - pad);
      const y = Math.max(0, b.y0 * cell - pad);
      return {
        x,
        y,
        w: Math.min(width, b.x1 * cell + pad) - x,
        h: Math.min(height, b.y1 * cell + pad) - y,
        label: b.label,
      };
    }),
    cell,
    gridWidth: gw,
    gridHeight: gh,
    labels,
    mask,
  };
}

/**
 * Cut one pose out of the sheet as its own image: its foreground pixels plus
 * anything they enclose (the white of an eye), everything else transparent —
 * so a neighbor reaching into the box, or the backdrop, doesn't come along.
 */
export function cropPose(image: RGBAImage, split: SheetSplit, pose: Pose): RGBAImage {
  const { data, width } = image;
  const { x: px, y: py, w, h } = pose;
  const keep = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = py + y;
    const crow = Math.floor(sy / split.cell) * split.gridWidth;
    for (let x = 0; x < w; x++) {
      const sx = px + x;
      if (split.mask[sy * width + sx] && split.labels[crow + Math.floor(sx / split.cell)] === pose.label) keep[y * w + x] = 1;
    }
  }
  // Outside = reachable from the crop's edge without crossing kept pixels.
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (i: number) => {
    if (!keep[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (i >= w) seed(i - w);
    if (i < w * (h - 1)) seed(i + w);
  }
  const out: RGBAImage = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (outside[i]) continue;
      const from = ((py + y) * width + px + x) * 4;
      out.data.set(data.subarray(from, from + 4), i * 4);
    }
  }
  return out;
}
