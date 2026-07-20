import { describe, expect, it } from 'vitest';
import type { Frame } from '../types';
import { parseProject, serializeProject } from './project-format';

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
      version: 1,
      name: 'hero.spr',
      w: 2,
      h: 2,
      frames: [frame],
      swatches: ['#ff0000'],
    });
  });

  it('migrates legacy unversioned .spr files', () => {
    const legacy = JSON.stringify({ name: 'legacy.spr', w: 2, h: 2, frames: [frame] });
    const project = parseProject(legacy);
    expect(project.version).toBe(1);
    expect(project.swatches).toEqual([]);
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
