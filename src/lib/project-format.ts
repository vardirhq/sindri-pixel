import type { Frame } from '../types';

export const PROJECT_FORMAT = 'sindri-pixel';
export const PROJECT_FORMAT_VERSION = 1;

export interface SpriteProject {
  format: typeof PROJECT_FORMAT;
  version: typeof PROJECT_FORMAT_VERSION;
  name: string;
  w: number;
  h: number;
  frames: Frame[];
  swatches: string[];
}

interface ProjectInput {
  name?: unknown;
  w?: unknown;
  h?: unknown;
  frames?: unknown;
  swatches?: unknown;
  format?: unknown;
  version?: unknown;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MAX_CANVAS_SIZE = 512;
const MAX_FRAMES = 10_000;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid Sindri Pixel project: ${message}`);
}

function validateFrame(frame: unknown, frameIndex: number, w: number, h: number): asserts frame is Frame {
  assert(frame !== null && typeof frame === 'object', `frame ${frameIndex + 1} is not an object`);
  const candidate = frame as Partial<Frame>;
  assert(typeof candidate.id === 'string' && candidate.id.length > 0, `frame ${frameIndex + 1} has no id`);
  assert(
    typeof candidate.duration === 'number' && Number.isFinite(candidate.duration) && candidate.duration >= 10 && candidate.duration <= 60_000,
    `frame ${frameIndex + 1} has an invalid duration`,
  );
  assert(Array.isArray(candidate.layers) && candidate.layers.length > 0, `frame ${frameIndex + 1} has no layers`);

  candidate.layers.forEach((layer, layerIndex) => {
    assert(layer !== null && typeof layer === 'object', `frame ${frameIndex + 1}, layer ${layerIndex + 1} is invalid`);
    assert(typeof layer.id === 'string' && layer.id.length > 0, `frame ${frameIndex + 1}, layer ${layerIndex + 1} has no id`);
    assert(typeof layer.name === 'string', `frame ${frameIndex + 1}, layer ${layerIndex + 1} has no name`);
    assert(typeof layer.visible === 'boolean', `frame ${frameIndex + 1}, layer ${layerIndex + 1} has invalid visibility`);
    assert(
      typeof layer.opacity === 'number' && Number.isFinite(layer.opacity) && layer.opacity >= 0 && layer.opacity <= 1,
      `frame ${frameIndex + 1}, layer ${layerIndex + 1} has invalid opacity`,
    );
    assert(Array.isArray(layer.pixels) && layer.pixels.length === h, `frame ${frameIndex + 1}, layer ${layerIndex + 1} has the wrong height`);
    layer.pixels.forEach((row, y) => {
      assert(Array.isArray(row) && row.length === w, `frame ${frameIndex + 1}, layer ${layerIndex + 1}, row ${y + 1} has the wrong width`);
      row.forEach((pixel, x) => {
        assert(pixel === null || (typeof pixel === 'string' && HEX_COLOR.test(pixel)), `frame ${frameIndex + 1}, layer ${layerIndex + 1} has an invalid pixel at ${x},${y}`);
      });
    });
  });
}

export function parseProject(json: string, fallbackName = 'untitled.spr'): SpriteProject {
  let raw: ProjectInput;
  try {
    raw = JSON.parse(json) as ProjectInput;
  } catch {
    throw new Error('Invalid Sindri Pixel project: the file is not valid JSON');
  }

  assert(raw !== null && typeof raw === 'object', 'the root value is not an object');
  if (raw.format !== undefined) assert(raw.format === PROJECT_FORMAT, `unsupported format ${String(raw.format)}`);
  if (raw.version !== undefined) {
    assert(typeof raw.version === 'number' && Number.isInteger(raw.version), 'the format version is invalid');
    assert(raw.version <= PROJECT_FORMAT_VERSION, `version ${raw.version} is newer than this app supports`);
    assert(raw.version >= 1, `version ${raw.version} is not supported`);
  }

  const w = raw.w;
  const h = raw.h;
  assert(Number.isInteger(w) && Number(w) >= 1 && Number(w) <= MAX_CANVAS_SIZE, `width must be between 1 and ${MAX_CANVAS_SIZE}`);
  assert(Number.isInteger(h) && Number(h) >= 1 && Number(h) <= MAX_CANVAS_SIZE, `height must be between 1 and ${MAX_CANVAS_SIZE}`);
  assert(Array.isArray(raw.frames) && raw.frames.length >= 1 && raw.frames.length <= MAX_FRAMES, `frame count must be between 1 and ${MAX_FRAMES}`);

  raw.frames.forEach((frame, index) => validateFrame(frame, index, Number(w), Number(h)));
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name : fallbackName;
  const swatches = Array.isArray(raw.swatches)
    ? raw.swatches.filter((color): color is string => typeof color === 'string' && HEX_COLOR.test(color))
    : [];

  return {
    format: PROJECT_FORMAT,
    version: PROJECT_FORMAT_VERSION,
    name,
    w: Number(w),
    h: Number(h),
    frames: raw.frames,
    swatches,
  };
}

export function serializeProject(project: Omit<SpriteProject, 'format' | 'version'>): string {
  return JSON.stringify({
    format: PROJECT_FORMAT,
    version: PROJECT_FORMAT_VERSION,
    ...project,
  });
}
