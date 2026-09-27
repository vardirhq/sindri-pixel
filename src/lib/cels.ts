// Sindri Pixel — linked cels.
//
// A cel is one layer's drawing in one frame. Linking cels makes several
// frames share one drawing: a head that stays the same through a walk cycle
// is drawn (and fixed) once, and every frame that links it changes with it.
//
// Each frame has its own layer list, so a link is an id carried by the
// layers that share a drawing (`Layer.link`). Every write to a linked layer
// goes to all layers with the same link; loading a file re-syncs them (the
// first one wins), and a link left with a single member is dropped.

import type { Frame, Layer, PixelGrid } from '../types';

let counter = 0;
/** A new link id. */
export const newLinkId = (): string => `link_${Date.now().toString(36)}_${(counter++).toString(36)}`;

/** Number of layers (across all frames) sharing each link. */
function linkCounts(frames: Frame[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const f of frames) for (const l of f.layers) if (l.link) counts.set(l.link, (counts.get(l.link) ?? 0) + 1);
  return counts;
}

/** How many cels share this layer's drawing (1 = not linked). */
export function linkSize(frames: Frame[], layer: Layer | undefined): number {
  return layer?.link ? linkCounts(frames).get(layer.link) ?? 1 : 1;
}

/** Give every layer sharing `link` these pixels. */
function spread(frames: Frame[], link: string, pixels: PixelGrid, except?: Layer): Frame[] {
  return frames.map((f) => {
    if (!f.layers.some((l) => l.link === link && l !== except)) return f;
    return { ...f, layers: f.layers.map((l) => (l.link === link && l !== except ? { ...l, pixels } : l)) };
  });
}

/** Set one layer's pixels, and every layer linked to it. */
export function writeLayerPixels(frames: Frame[], frameIdx: number, layerIdx: number, pixels: PixelGrid): Frame[] {
  const layer = frames[frameIdx]?.layers[layerIdx];
  if (!layer) return frames;
  if (layer.link) return spread(frames, layer.link, pixels);
  return frames.map((f, i) => (i !== frameIdx ? f : { ...f, layers: f.layers.map((l, k) => (k === layerIdx ? { ...l, pixels } : l)) }));
}

/** After a frame's layers were changed in place (a flip), carry the linked
 *  layers' new pixels to the frames they are linked into. */
export function propagateFrame(frames: Frame[], frameIdx: number): Frame[] {
  let out = frames;
  for (const l of frames[frameIdx]?.layers ?? []) if (l.link) out = spread(out, l.link, l.pixels, l);
  return out;
}

/** Drop links that no longer join anything (one member left). */
export function pruneLinks(frames: Frame[]): Frame[] {
  const counts = linkCounts(frames);
  if (![...counts.values()].some((n) => n < 2)) return frames;
  return frames.map((f) => ({
    ...f,
    layers: f.layers.map((l) => (l.link && (counts.get(l.link) ?? 0) < 2 ? withoutLink(l) : l)),
  }));
}

const withoutLink = (l: Layer): Layer => {
  const { link: _link, ...rest } = l;
  return rest;
};

/** Make one layer independent again (keeping its current drawing). */
export function unlinkLayer(frames: Frame[], frameIdx: number, layerIdx: number): Frame[] {
  const layer = frames[frameIdx]?.layers[layerIdx];
  if (!layer?.link) return frames;
  const unlinked = frames.map((f, i) => (i !== frameIdx ? f : {
    ...f,
    layers: f.layers.map((l, k) => (k === layerIdx ? { ...withoutLink(l), pixels: l.pixels.map((r) => r.slice()) } : l)),
  }));
  return pruneLinks(unlinked);
}

/** Link a layer to the layer at the same position in the previous frame:
 *  it takes that layer's drawing, and from now on they change together. */
export function linkToPrevious(frames: Frame[], frameIdx: number, layerIdx: number): Frame[] {
  const prev = frames[frameIdx - 1]?.layers[layerIdx];
  const layer = frames[frameIdx]?.layers[layerIdx];
  if (!prev || !layer) return frames;
  if (prev.link && prev.link === layer.link) return frames;
  const link = prev.link ?? newLinkId();
  const linked = frames.map((f, i) => {
    if (i === frameIdx - 1) return { ...f, layers: f.layers.map((l, k) => (k === layerIdx ? { ...l, link } : l)) };
    if (i === frameIdx) return { ...f, layers: f.layers.map((l, k) => (k === layerIdx ? { ...l, link, pixels: prev.pixels } : l)) };
    return f;
  });
  return pruneLinks(linked);
}

/** Copy frame `idx` right after itself with every layer linked to the
 *  original: the new frame starts identical and stays in step until a layer
 *  is unlinked. `ids` makes the new frame and layer ids. */
export function duplicateLinked(frames: Frame[], idx: number, ids: { frame: string; layer: (i: number) => string }): Frame[] {
  const src = frames[idx];
  if (!src) return frames;
  const links = src.layers.map((l) => l.link ?? newLinkId());
  const source: Frame = { ...src, layers: src.layers.map((l, k) => ({ ...l, link: links[k] })) };
  const copy: Frame = {
    id: ids.frame,
    duration: src.duration,
    layers: src.layers.map((l, k) => ({ ...l, id: ids.layer(k), link: links[k] })),
  };
  const out = frames.slice();
  out.splice(idx, 1, source, copy);
  return out;
}

/** Strip links from copied layers (a plain duplicate is independent). */
export function independentLayers(layers: Layer[]): Layer[] {
  return layers.map((l) => ({ ...withoutLink(l), pixels: l.pixels.map((r) => r.slice()) }));
}

/** After loading: every linked layer shares the first member's drawing, and
 *  lone links are dropped. */
export function syncLinks(frames: Frame[]): Frame[] {
  const first = new Map<string, PixelGrid>();
  for (const f of frames) for (const l of f.layers) if (l.link && !first.has(l.link)) first.set(l.link, l.pixels);
  if (!first.size) return frames;
  const synced = frames.map((f) => ({
    ...f,
    layers: f.layers.map((l) => (l.link ? { ...l, pixels: first.get(l.link)! } : l)),
  }));
  return pruneLinks(synced);
}
