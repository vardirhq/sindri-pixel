import { describe, expect, it } from 'vitest';
import type { Frame, Layer, PixelGrid } from '../types';
import {
  duplicateLinked, independentLayers, linkSize, linkToPrevious, propagateFrame, pruneLinks, syncLinks, unlinkLayer, writeLayerPixels,
} from './cels';

const grid = (c: string | null): PixelGrid => [[c, c], [c, c]];
const layer = (id: string, c: string | null, link?: string): Layer => ({ id, name: id, visible: true, opacity: 1, pixels: grid(c), ...(link ? { link } : {}) });
const frame = (id: string, ...layers: Layer[]): Frame => ({ id, duration: 100, layers });
const px = (f: Frame, k = 0) => f.layers[k].pixels[0][0];

describe('linked cels', () => {
  it('a write reaches every linked layer, and only those', () => {
    const frames = [frame('a', layer('a0', '#111111', 'L')), frame('b', layer('b0', '#222222', 'L')), frame('c', layer('c0', '#333333'))];
    const out = writeLayerPixels(frames, 1, 0, grid('#ff0000'));
    expect(out.map((f) => px(f))).toEqual(['#ff0000', '#ff0000', '#333333']);
    // An unlinked layer only changes itself.
    expect(writeLayerPixels(frames, 2, 0, grid('#00ff00')).map((f) => px(f))).toEqual(['#111111', '#222222', '#00ff00']);
  });

  it('duplicates a frame as linked: the copy follows the original', () => {
    const frames = [frame('a', layer('head', '#aa0000'), layer('body', '#00aa00'))];
    const dup = duplicateLinked(frames, 0, { frame: 'a2', layer: (k) => `a2_${k}` });
    expect(dup.map((f) => f.id)).toEqual(['a', 'a2']);
    expect(linkSize(dup, dup[1].layers[0])).toBe(2);
    const edited = writeLayerPixels(dup, 1, 1, grid('#0000ff'));
    expect(px(edited[0], 1)).toBe('#0000ff'); // body changed in both
    expect(px(edited[0], 0)).toBe('#aa0000'); // head untouched
  });

  it('links a layer to the previous frame, taking its drawing', () => {
    const frames = [frame('a', layer('a0', '#111111')), frame('b', layer('b0', '#222222'))];
    const out = linkToPrevious(frames, 1, 0);
    expect(px(out[1])).toBe('#111111');
    expect(out[0].layers[0].link).toBeDefined();
    expect(out[0].layers[0].link).toBe(out[1].layers[0].link);
    expect(linkToPrevious(frames, 0, 0)).toBe(frames); // no previous frame
  });

  it('unlinking keeps the drawing but stops sharing it, dropping a lone link', () => {
    const frames = [frame('a', layer('a0', '#111111', 'L')), frame('b', layer('b0', '#111111', 'L'))];
    const out = unlinkLayer(frames, 1, 0);
    expect(out[1].layers[0].link).toBeUndefined();
    expect(out[0].layers[0].link).toBeUndefined(); // one member left: not a link any more
    expect(px(out[1])).toBe('#111111');
    expect(px(writeLayerPixels(out, 1, 0, grid('#ffffff'))[0])).toBe('#111111');
  });

  it('carries an in-place frame edit (a flip) to linked frames', () => {
    const frames = [frame('a', layer('a0', '#111111', 'L')), frame('b', layer('b0', '#111111', 'L'))];
    const flipped = frames.map((f, i) => (i === 0 ? { ...f, layers: [{ ...f.layers[0], pixels: [['#ffffff', null], [null, null]] as PixelGrid }] } : f));
    expect(propagateFrame(flipped, 0)[1].layers[0].pixels).toEqual([['#ffffff', null], [null, null]]);
  });

  it('re-syncs links from a file and drops lone ones', () => {
    const loaded = [frame('a', layer('a0', '#111111', 'L'), layer('a1', '#999999', 'solo')), frame('b', layer('b0', '#222222', 'L'))];
    const out = syncLinks(loaded);
    expect(px(out[1])).toBe('#111111');
    expect(out[0].layers[1].link).toBeUndefined();
    expect(pruneLinks(out)).toBe(out);
  });

  it('a plain duplicate is independent', () => {
    const copy = independentLayers([layer('a0', '#111111', 'L')]);
    expect(copy[0].link).toBeUndefined();
  });
});
