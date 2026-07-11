// src/lib/storage.ts
// ── Types ────────────────────────────────────────────────────────────────────

export interface RecentFile {
  id: string;           // uuid-ish, stable across sessions
  name: string;         // display name, e.g. "drone_idle.spr"
  path: string;         // absolute FS path (used for re-opening)
  spec: string;         // human label, e.g. "32 × 32 · 4 frames"
  timestamp: number;    // Date.now() at last open/create
}

export interface SavedTemplate {
  id: string;
  name: string;
  w: number;
  h: number;
  frames: number;
  animated: boolean;
  profile: string;
}

// ── Keys ─────────────────────────────────────────────────────────────────────

const RECENT_KEY    = 'sindri_recent';
const TEMPLATE_KEY  = 'sindri_templates';
const MAX_RECENT    = 8;

// ── Helpers ───────────────────────────────────────────────────────────────────

function load<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]') as T[];
  } catch {
    return [];
  }
}

function save<T>(key: string, items: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch { /* storage full — silently skip */ }
}

// ── Recent files ──────────────────────────────────────────────────────────────

export function getRecents(): RecentFile[] {
  return load<RecentFile>(RECENT_KEY);
}

/** Upsert an entry by path, bump it to the front, trim to MAX_RECENT. */
export function pushRecent(entry: Omit<RecentFile, 'id'>): RecentFile {
  const existing = load<RecentFile>(RECENT_KEY);
  const id = crypto.randomUUID();
  const next: RecentFile = { ...entry, id, timestamp: Date.now() };
  const filtered = existing.filter((r) => r.path !== entry.path);
  save(RECENT_KEY, [next, ...filtered].slice(0, MAX_RECENT));
  return next;
}

export function clearRecents(): void {
  save(RECENT_KEY, []);
}

// ── Saved templates ────────────────────────────────────────────────────────────

export function getSavedTemplates(): SavedTemplate[] {
  return load<SavedTemplate>(TEMPLATE_KEY);
}

export function saveTemplate(t: Omit<SavedTemplate, 'id'>): SavedTemplate {
  const existing = load<SavedTemplate>(TEMPLATE_KEY);
  const id = crypto.randomUUID();
  const entry: SavedTemplate = { ...t, id };
  save(TEMPLATE_KEY, [...existing, entry]);
  return entry;
}

export function deleteTemplate(id: string): void {
  const existing = load<SavedTemplate>(TEMPLATE_KEY);
  save(TEMPLATE_KEY, existing.filter((t) => t.id !== id));
}

// ── Autosave / crash recovery ─────────────────────────────────────────────────

const AUTOSAVE_KEY = 'sindri_autosave';

export interface AutosaveSnapshot {
  savedAt: number;
  projectName: string;
  path: string | null;
  w: number;
  h: number;
  // Frames are stored as opaque JSON — typed by the caller on restore.
  frames: unknown[];
  swatches: string[];
  dirty: boolean;
}

export function writeAutosave(snap: AutosaveSnapshot): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snap));
  } catch { /* storage full — silently skip */ }
}

export function readAutosave(): AutosaveSnapshot | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as AutosaveSnapshot;
    if (!snap || !Array.isArray(snap.frames) || snap.frames.length === 0) return null;
    return snap;
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* ignore */ }
}
