import React from 'react';

const appMenuStyles = {
  scrim: { position: 'fixed', inset: 0, zIndex: 199, background: 'transparent' } as React.CSSProperties,
  popover: {
    position: 'fixed', zIndex: 200,
    background: 'var(--paper-2)', border: '1px solid var(--rule-2)',
    width: 320, color: 'var(--ink)', fontFamily: 'var(--font-sans)',
    boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
    display: 'flex', flexDirection: 'column',
    maxHeight: 'calc(100vh - 80px)', overflow: 'hidden',
  } as React.CSSProperties,
  tabs: {
    display: 'flex', borderBottom: '1px solid var(--rule)',
    padding: '0 16px', gap: 18, alignItems: 'flex-end',
  } as React.CSSProperties,
  tab: (active: boolean): React.CSSProperties => ({
    paddingTop: 12, paddingBottom: 10, fontSize: 12.5,
    color: active ? 'var(--ink)' : 'var(--ink-3)',
    fontWeight: active ? 500 : 400,
    borderBottom: active ? '2px solid var(--ink)' : '2px solid transparent',
    marginBottom: -1, cursor: 'pointer',
  }),
  body: { padding: '6px 0', overflowY: 'auto' } as React.CSSProperties,
  group: { borderBottom: '1px solid var(--rule)' } as React.CSSProperties,
  groupLast: { borderBottom: 'none' } as React.CSSProperties,
  item: (variant: string | undefined): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '7px 16px', cursor: 'pointer',
    color: variant === 'ai' ? 'var(--amber)' : variant === 'disabled' ? 'var(--ink-4)' : 'var(--ink-2)',
    fontSize: 12.5,
  }),
  itemHover: { background: 'var(--paper-3)', color: 'var(--ink)' } as React.CSSProperties,
  itemLabel: { flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as React.CSSProperties,
  shortcut: {
    fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)',
    letterSpacing: '0.04em', flex: 'none',
  } as React.CSSProperties,
  footer: {
    padding: '8px 16px', borderTop: '1px solid var(--rule-2)',
    background: 'var(--paper-2)',
    fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)',
    letterSpacing: '0.06em', display: 'flex', justifyContent: 'space-between',
  } as React.CSSProperties,
};

interface MenuItem {
  id: string;
  label: string;
  keys: string;
  variant?: string;
}

interface MenuSection {
  group: string;
  items: MenuItem[];
}

const MENU: Record<string, MenuSection[]> = {
  file: [
    { group: 'workspace', items: [
      { id: 'new',      label: 'New sprite',              keys: '⌘N' },
      { id: 'open',     label: 'Open…',                   keys: '⌘O' },
      { id: 'save',     label: 'Save',                    keys: '⌘S' },
      { id: 'save-as',  label: 'Save as…',                keys: '⇧⌘S' },
    ]},
    { group: 'transfer', items: [
      { id: 'import',     label: 'Import sprite…',          keys: '⌘I' },
      { id: 'import-ai',  label: 'Import AI art…',          keys: '' },
      { id: 'export-png', label: 'Export as PNG',           keys: '⌘E' },
      { id: 'export-gif', label: 'Export as animated GIF',  keys: '⇧⌘E' },
      { id: 'export-sheet', label: 'Export sprite sheet',   keys: '' },
    ]},
    { group: 'recent', items: [
      { id: 'recent-1', label: 'drone_idle.spr',            keys: '' },
      { id: 'recent-2', label: 'beacon.spr',                keys: '' },
      { id: 'recent-3', label: 'mushroom.spr',              keys: '' },
    ]},
  ],
  edit: [
    { group: 'history', items: [
      { id: 'undo', label: 'Undo',                          keys: '⌘Z' },
      { id: 'redo', label: 'Redo',                          keys: '⇧⌘Z' },
    ]},
    { group: 'clipboard', items: [
      { id: 'cut',   label: 'Cut',                          keys: '⌘X' },
      { id: 'copy',  label: 'Copy',                         keys: '⌘C' },
      { id: 'paste', label: 'Paste',                        keys: '⌘V' },
    ]},
    { group: 'canvas', items: [
      { id: 'resize',  label: 'Resize canvas…',             keys: '' },
      { id: 'crop',    label: 'Crop to selection',          keys: '' },
      { id: 'flip-h',  label: 'Flip horizontal',            keys: '' },
      { id: 'flip-v',  label: 'Flip vertical',              keys: '' },
      { id: 'rotate-cw',  label: 'Rotate 90° clockwise',        keys: '' },
      { id: 'rotate-ccw', label: 'Rotate 90° counter-clockwise', keys: '' },
    ]},
  ],
  view: [
    { group: 'overlays', items: [
      { id: 'toggle-grid',  label: 'Toggle pixel grid',     keys: '⇧G' },
      { id: 'toggle-onion', label: 'Toggle onion skin',     keys: '⇧O' },
      { id: 'toggle-ghost', label: 'Toggle AI ghost',       keys: '⇧A', variant: 'ai' },
    ]},
    { group: 'zoom', items: [
      { id: 'zoom-in',     label: 'Zoom in',                keys: '⌘+' },
      { id: 'zoom-out',    label: 'Zoom out',               keys: '⌘−' },
      { id: 'zoom-fit',    label: 'Fit to viewport',        keys: '⌘0' },
      { id: 'zoom-actual', label: 'Actual size',            keys: '⌘1' },
    ]},
  ],
  help: [
    { group: 'learning', items: [
      { id: 'lessons',       label: 'Open lessons library', keys: '⇧⌘L' },
      { id: 'create-lesson', label: 'Author a new lesson…', keys: '' },
      { id: 'shortcuts',     label: 'Keyboard shortcuts',   keys: '⌘/' },
    ]},
    { group: 'about', items: [
      { id: 'ask-sindri',    label: 'Ask Sindri anything',  keys: '⌘K', variant: 'ai' },
      { id: 'release-notes', label: 'Release notes',        keys: '' },
      { id: 'about',         label: 'About Sindri Pixel',   keys: '' },
    ]},
  ],
};

const TAB_LABELS: Record<string, string> = { file: 'File', edit: 'Edit', view: 'View', help: 'Help' };

export interface AppMenuProps {
  open: boolean;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onAction: (id: string) => void;
  initialTab?: string;
  recentFiles?: { id: string; name: string; path: string }[];
}

export function AppMenu({ open, anchorRect, onClose, onAction, initialTab, recentFiles }: AppMenuProps) {
  const [tab, setTab] = React.useState(initialTab ?? 'file');
  const [hoverId, setHoverId] = React.useState<string | null>(null);

  React.useEffect(() => { if (open) setTab(initialTab ?? 'file'); }, [open, initialTab]);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Inject live recent files into the File tab's 'recent' group.
  // Must be called before any early return to satisfy Rules of Hooks.
  const sections = React.useMemo(() => {
    const base = MENU[tab] ?? [];
    if (tab !== 'file') return base;
    return base.map((sec) => {
      if (sec.group !== 'recent') return sec;
      const items: MenuItem[] = recentFiles && recentFiles.length > 0
        ? recentFiles.slice(0, 8).map((f) => ({ id: `recent:${f.id}`, label: f.name, keys: '' }))
        : [{ id: 'recent-empty', label: 'No recent files', keys: '', variant: 'disabled' }];
      return { ...sec, items };
    });
  }, [tab, recentFiles]);

  if (!open || !anchorRect) return null;

  const top = anchorRect.bottom + 4;
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - 332));

  return (
    <React.Fragment>
      <div style={appMenuStyles.scrim} onClick={onClose} />
      <div style={{ ...appMenuStyles.popover, top, left }}>
        <div style={appMenuStyles.tabs}>
          {Object.keys(MENU).map((key) => (
            <div key={key} style={appMenuStyles.tab(tab === key)} onClick={() => setTab(key)}>
              {TAB_LABELS[key]}
            </div>
          ))}
        </div>
        <div style={appMenuStyles.body}>
          {sections.map((sec, si) => (
            <div key={sec.group} style={si === sections.length - 1 ? appMenuStyles.groupLast : appMenuStyles.group}>
              {sec.items.map((it) => {
                const hover = hoverId === it.id;
                return (
                  <div
                    key={it.id}
                    style={{ ...appMenuStyles.item(it.variant), ...(hover ? appMenuStyles.itemHover : null) }}
                    onMouseEnter={() => setHoverId(it.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onClick={() => { onAction(it.id); onClose(); }}
                  >
                    <span style={appMenuStyles.itemLabel}>{it.label}</span>
                    {it.keys && <span style={appMenuStyles.shortcut}>{it.keys}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={appMenuStyles.footer}>
          <span>sindri pixel · v0.1.0</span>
          <span>⌘K for anything</span>
        </div>
      </div>
    </React.Fragment>
  );
}
