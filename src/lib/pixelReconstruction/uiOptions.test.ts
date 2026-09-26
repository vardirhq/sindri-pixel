import { describe, expect, it } from 'vitest';
import { buildOptions, clampPixelSize, CLEAN_SPRITE_PRESET, detectionNotice, type UiChoices } from './uiOptions';
import type { GridDetectionResult } from './types';

const choices = (over: Partial<UiChoices>): UiChoices => ({
  ...CLEAN_SPRITE_PRESET,
  gridChoice: 'auto',
  pixelSize: 3,
  customWidth: 64,
  customHeight: 64,
  transparentBackground: true,
  ...over,
});

const det = (over: Partial<GridDetectionResult>): GridDetectionResult => ({
  cellSize: 3,
  gridWidth: 512,
  gridHeight: 341,
  confidence: 'high',
  cellWidth: 3,
  cellHeight: 3,
  offsetX: 0,
  offsetY: 0,
  capped: false,
  detectedCellSize: 3,
  ...over,
});

describe('buildOptions', () => {
  it('maps a pixel size to a cell-size override', () => {
    const o = buildOptions(choices({ gridChoice: 'pixel', pixelSize: 3 }));
    expect(o.autoDetectGrid).toBe(false);
    expect(o.cellSize).toBe(3);
    expect(o.targetWidth).toBeUndefined();
  });

  it('keeps output-size choices free of a cell size', () => {
    const o = buildOptions(choices({ gridChoice: 'custom', customWidth: 40, customHeight: 30 }));
    expect(o.cellSize).toBeUndefined();
    expect([o.targetWidth, o.targetHeight]).toEqual([40, 30]);
    expect(buildOptions(choices({})).autoDetectGrid).toBe(true);
  });

  it('clamps pixel sizes to a sane range, keeping one decimal', () => {
    expect(clampPixelSize(0)).toBe(1);
    expect(clampPixelSize(NaN)).toBe(1);
    expect(clampPixelSize(2.54)).toBe(2.5);
    expect(clampPixelSize(1000)).toBe(64);
  });
});

describe('detectionNotice', () => {
  const source = { width: 1536, height: 1024 };

  it('is silent for a trusted, uncapped grid', () => {
    expect(detectionNotice(det({}), source)).toBeNull();
  });

  it('explains a capped low-confidence grid and suggests the detected pixel size', () => {
    const n = detectionNotice(
      det({ confidence: 'low', capped: true, gridWidth: 128, gridHeight: 85, cellSize: 12, detectedCellSize: 3 }),
      source,
    );
    expect(n?.message).toMatch(/Low confidence/);
    expect(n?.message).toMatch(/512 × 341/);
    expect(n?.message).toMatch(/128 × 85/);
    expect(n?.message).toMatch(/Pixel size/);
    expect(n?.suggestedPixelSize).toBe(3);
  });

  it('flags a low-confidence grid even when it was not capped', () => {
    const n = detectionNotice(det({ confidence: 'low', gridWidth: 113, gridHeight: 75 }), source);
    expect(n?.message).toMatch(/Pixel size/);
    expect(n?.suggestedPixelSize).toBeUndefined();
  });

  it('reports a grid resampled to the output limit', () => {
    const n = detectionNotice(det({ capped: true, detectedCellSize: 1 }), source);
    expect(n?.message).toMatch(/1536 × 1024 exceeds the 512px output limit/);
  });
});
