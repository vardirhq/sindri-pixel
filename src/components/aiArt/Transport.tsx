// Playback and view controls under the stage.

import { Icon, type IconName } from './icons';
import type { Player } from './useAnimation';

export interface TransportProps {
  player: Player;
  count: number;
  fps: number;
  onFps: (fps: number) => void;
  playback: 'loop' | 'pingpong';
  onPlayback: (p: 'loop' | 'pingpong') => void;
  onion: boolean;
  onOnion: (v: boolean) => void;
  pixelGrid: boolean;
  onPixelGrid: (v: boolean) => void;
  zoom: number | 'fit';
  resolvedZoom: number;
  onZoom: (z: number | 'fit') => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  cycleMs: number;
}

function IconButton({ icon, label, onClick, active, disabled, primary, shortcut }: {
  icon: IconName; label: string; onClick: () => void; active?: boolean; disabled?: boolean; primary?: boolean; shortcut?: string;
}) {
  return (
    <button
      type="button"
      className={['aa-icon-btn', active ? 'active' : '', primary ? 'primary' : ''].join(' ')}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      <Icon name={icon} size={primary ? 14 : 12} />
    </button>
  );
}

const ZOOMS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32];

export function Transport(p: TransportProps) {
  const { player, count } = p;
  const zoomStep = (dir: 1 | -1) => {
    const cur = p.resolvedZoom;
    const next = dir > 0 ? ZOOMS.find((z) => z > cur) ?? cur : [...ZOOMS].reverse().find((z) => z < cur) ?? cur;
    p.onZoom(next);
  };
  return (
    <div className="aa-transport">
      <div className="aa-group">
        <IconButton icon="prev" label="Previous frame" shortcut="," onClick={() => player.step(-1)} disabled={count < 2} />
        <IconButton
          icon={player.playing ? 'pause' : 'play'}
          label={player.playing ? 'Pause' : 'Play'}
          shortcut="Space"
          primary
          onClick={() => player.setPlaying(!player.playing)}
          disabled={count < 2}
        />
        <IconButton icon="next" label="Next frame" shortcut="." onClick={() => player.step(1)} disabled={count < 2} />
        <span className="aa-counter" aria-live="off">
          <b>{String(Math.min(count, player.index + 1)).padStart(2, '0')}</b> / {String(count).padStart(2, '0')}
        </span>
      </div>

      <div className="aa-group">
        <label className="aa-fps">
          <input
            type="number"
            min={1}
            max={60}
            value={p.fps}
            onChange={(e) => p.onFps(Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 1)))}
            aria-label="Frames per second"
          />
          <span>fps</span>
        </label>
        <div className="aa-toggle-pair" role="radiogroup" aria-label="Playback">
          <IconButton icon="loop" label="Loop" active={p.playback === 'loop'} onClick={() => p.onPlayback('loop')} />
          <IconButton icon="pingpong" label="Ping-pong" active={p.playback === 'pingpong'} onClick={() => p.onPlayback('pingpong')} />
        </div>
        <span className="aa-cycle" title="One full cycle">{(p.cycleMs / 1000).toFixed(2)}s</span>
      </div>

      <div className="aa-group">
        <IconButton icon="onion" label="Onion skin" shortcut="O" active={p.onion} onClick={() => p.onOnion(!p.onion)} />
        <IconButton icon="grid" label="Pixel grid" shortcut="G" active={p.pixelGrid} onClick={() => p.onPixelGrid(!p.pixelGrid)} />
        <span className="aa-sep" />
        <IconButton icon="minus" label="Zoom out" shortcut="−" onClick={() => zoomStep(-1)} />
        <button type="button" className={p.zoom === 'fit' ? 'aa-zoom fit' : 'aa-zoom'} onClick={() => p.onZoom('fit')} title="Fit to stage (0)">
          {p.resolvedZoom}×
        </button>
        <IconButton icon="plus" label="Zoom in" shortcut="+" onClick={() => zoomStep(1)} />
        <span className="aa-sep" />
        <IconButton icon="undo" label="Undo" shortcut="Ctrl+Z" onClick={p.onUndo} disabled={!p.canUndo} />
        <IconButton icon="redo" label="Redo" shortcut="Ctrl+Shift+Z" onClick={p.onRedo} disabled={!p.canRedo} />
      </div>
    </div>
  );
}
