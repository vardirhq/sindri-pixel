import { describe, expect, it } from 'vitest';
import type { Frame } from '../types';
import { PROJECT_FORMAT_VERSION, parseProject, serializeProject } from './project-format';

const frame: Frame = {
  id: 'frame-1',
  duration: 120,
  layers: [{
    id: 'layer-1',
    name: 'base',
    visible: true,
    opacity: 1,
    pixels: [['#ff0000', null], [null, '#00ff00']],
  }],
};

describe('Sindri Pixel project format', () => {
  it('round-trips a versioned project', () => {
    const encoded = serializeProject({ name: 'hero.spr', w: 2, h: 2, frames: [frame], swatches: ['#ff0000'] });
    expect(parseProject(encoded)).toEqual({
      format: 'sindri-pixel',
      version: 2,
      name: 'hero.spr',
      w: 2,
      h: 2,
      frames: [frame],
      swatches: ['#ff0000'],
      tags: [],
    });
  });

  it('round-trips animation tags', () => {
    const tags = [
      { id: 't1', name: 'idle', from: 0, to: 1, direction: 'pingpong' as const },
      { id: 't2', name: 'blink', from: 1, to: 1, direction: 'forward' as const },
    ];
    const encoded = serializeProject({ name: 'hero.spr', w: 2, h: 2, frames: [frame, { ...frame, id: 'frame-2' }], swatches: [], tags });
    expect(parseProject(encoded).tags).toEqual(tags);
  });

  it('opens version 1 files, which have no tags', () => {
    const v1 = JSON.stringify({ format: 'sindri-pixel', version: 1, name: 'old.spr', w: 2, h: 2, frames: [frame], swatches: [] });
    expect(parseProject(v1).tags).toEqual([]);
  });

  it('rejects a tag outside the frames', () => {
    const bad = JSON.stringify({
      format: 'sindri-pixel', version: 2, name: 'x.spr', w: 2, h: 2, frames: [frame], swatches: [],
      tags: [{ id: 't', name: 'run', from: 0, to: 3, direction: 'forward' }],
    });
    expect(() => parseProject(bad)).toThrow(/tag 1 is outside the frames/);
  });

  it('migrates legacy unversioned .spr files', () => {
    const legacy = JSON.stringify({ name: 'legacy.spr', w: 2, h: 2, frames: [frame] });
    const project = parseProject(legacy);
    expect(project.version).toBe(PROJECT_FORMAT_VERSION);
    expect(project.swatches).toEqual([]);
    expect(project.tags).toEqual([]);
  });

  it('rejects future versions', () => {
    const json = JSON.stringify({ format: 'sindri-pixel', version: 99, name: 'future.spr', w: 2, h: 2, frames: [frame] });
    expect(() => parseProject(json)).toThrow('newer than this app supports');
  });

  it('rejects malformed pixel grids', () => {
    const malformed = structuredClone(frame);
    malformed.layers[0].pixels = [['#ff0000']];
    const json = JSON.stringify({ name: 'broken.spr', w: 2, h: 2, frames: [malformed] });
    expect(() => parseProject(json)).toThrow('wrong height');
  });
});

describe('linked cels in files', () => {
  it('round-trips links and re-syncs linked drawings on load', () => {
    const a: Frame = { ...frame, layers: [{ ...frame.layers[0], link: 'L' }] };
    const b: Frame = { ...frame, id: 'frame-2', layers: [{ ...frame.layers[0], id: 'layer-2', link: 'L', pixels: [[null, null], [null, null]] }] };
    const project = parseProject(serializeProject({ name: 'hero.spr', w: 2, h: 2, frames: [a, b], swatches: [] }));
    expect(project.frames[1].layers[0].link).toBe('L');
    expect(project.frames[1].layers[0].pixels).toEqual(frame.layers[0].pixels);
  });

  it('rejects a malformed link', () => {
    const bad = JSON.stringify({ format: 'sindri-pixel', version: 1, name: 'x.spr', w: 2, h: 2, frames: [{ ...frame, layers: [{ ...frame.layers[0], link: 7 }] }] });
    expect(() => parseProject(bad)).toThrow(/invalid link/);
  });
});
