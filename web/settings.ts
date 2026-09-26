// Tool settings: the shared downscale knobs (the same vocabulary as the
// editor's import dialog, via uiOptions) plus the animation and export
// preferences. Remembered per browser, so a returning visitor lands back in
// their own setup.

import React from 'react';
import { CLEAN_SPRITE_PRESET, type UiChoices } from '../src/lib/pixelReconstruction';
import type { Anchor, SheetColumns } from '../src/lib/animation';

export interface Settings extends UiChoices {
  matchPixelSize: boolean;
  anchor: Anchor;
  canvasMode: 'auto' | 'fixed';
  canvasWidth: number;
  canvasHeight: number;
  fps: number;
  playback: 'loop' | 'pingpong';
  onion: boolean;
  pixelGrid: boolean;
  sheetColumns: SheetColumns;
  sheetPadding: number;
  exportScale: number;
}

export const DEFAULT_SETTINGS: Settings = {
  ...CLEAN_SPRITE_PRESET,
  gridChoice: 'auto',
  pixelSize: 4,
  customWidth: 64,
  customHeight: 64,
  transparentBackground: true,
  removeBackground: true,
  matchPixelSize: true,
  anchor: 'feet',
  canvasMode: 'auto',
  canvasWidth: 64,
  canvasHeight: 64,
  fps: 8,
  playback: 'loop',
  onion: false,
  pixelGrid: false,
  sheetColumns: 'auto',
  sheetPadding: 0,
  exportScale: 1,
};

const STORAGE_KEY = 'sindri-pixel:web-settings:v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // Private mode or blocked storage: defaults are fine.
  }
  return DEFAULT_SETTINGS;
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = React.useState<Settings>(load);
  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Not persisted this time.
    }
  }, [settings]);
  const update = React.useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  return [settings, update];
}
