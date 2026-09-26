// Keyboard reference, toggled with "?".

const KEYS: [string, string][] = [
  ['Space', 'Play / pause'],
  [', / .', 'Previous / next frame'],
  ['Home / End', 'First / last frame'],
  ['← ↑ → ↓', 'Nudge frame 1px (⇧ 5px)'],
  ['Drag', 'Move frame on the stage'],
  ['Alt + ← / →', 'Move frame earlier / later'],
  ['F', 'Mirror frame'],
  ['O', 'Onion skin'],
  ['G', 'Pixel grid'],
  ['+ / − / 0', 'Zoom in / out / fit'],
  ['Ctrl D', 'Duplicate frame'],
  ['Delete', 'Remove frame'],
  ['Ctrl Z / Ctrl ⇧ Z', 'Undo / redo'],
  ['Ctrl V', 'Paste an image'],
  ['?', 'This list'],
];

export function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <div className="shortcuts-scrim" onClick={onClose}>
      <div className="shortcuts" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-head">
          <span>Keyboard</span>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Close</button>
        </div>
        <dl>
          {KEYS.map(([k, v]) => (
            <div key={k}>
              <dt>{k.split(' ').map((part, i) => (part === '/' || part === '+' ? <span key={i} className="sep">{part}</span> : <kbd key={i}>{part}</kbd>))}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
