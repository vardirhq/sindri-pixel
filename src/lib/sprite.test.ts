import { describe, expect, it } from 'vitest';
import type { Frame } from '../types';
import { buildSpriteSheet, compositeFrame, frameFromPackedPixels } from './sprite';

function frame(color: string, opacity = 1): Frame {
  return {
    id: color,
    duration: 120,
    layers: [{ id: 'layer', name: 'layer', visible: true, opacity, pixels: [[color]] }],
  };
}

describe('sprite export helpers', () => {
  it('converts packed pixels into editable colors', () => {
    const result = frameFromPackedPixels(2, 1, [0xffff0000, 0]);
    expect(result.layers[0].pixels).toEqual([['#ff0000', null]]);
  });

  it('alpha-composites visible layers', () => {
    const mixed: Frame = {
      id: 'mixed',
      duration: 120,
      layers: [frame('#ff0000').layers[0], frame('#0000ff', 0.5).layers[0]],
    };
    expect(compositeFrame(mixed, 1, 1)).toEqual([128, 0, 128, 255]);
  });

  it('lays frames out in a deterministic grid', () => {
    const result = buildSpriteSheet([frame('#ff0000'), frame('#00ff00'), frame('#0000ff')], 1, 1, 2);
    expect({ width: result.width, height: result.height }).toEqual({ width: 2, height: 2 });
    expect(result.pixels).toEqual([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 0, 0, 0, 0,
    ]);
  });

  it('rejects oversized sprite sheets before allocating them', () => {
    expect(() => buildSpriteSheet(new Array(20).fill(frame('#ff0000')), 512, 512, 1)).toThrow('too large');
  });
});
