// Prompt shown when an image turns out to be a sprite sheet: offers to split
// it into one frame per pose. Shared by the web tool and the editor dialog.

import { Icon } from './icons';

export function SheetNotice({ poses, onSplit, compact = false }: { poses: number; onSplit: () => void; compact?: boolean }) {
  return (
    <div className={compact ? 'aa-sheet-notice compact' : 'aa-sheet-notice'} role="status">
      <div className="aa-sheet-art" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
      <div className="aa-sheet-text">
        <b>Sprite sheet · {poses} poses</b>
        {!compact && <span>Split it into frames to line them up and animate them.</span>}
      </div>
      <button type="button" className="aa-sheet-btn" onClick={onSplit}>
        <Icon name="grid" /> Split into {poses} frames
      </button>
    </div>
  );
}
