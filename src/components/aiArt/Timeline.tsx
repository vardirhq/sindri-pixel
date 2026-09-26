// The frame strip: one thumbnail per frame, in play order. Drag a frame to
// reorder it; drop image files between frames to insert them there. The
// thumbnail shows the composed frame, so alignment problems are visible at a
// glance, and a marker follows playback.

import React from 'react';
import type { RGBAImage } from '../../lib/pixelReconstruction';
import { paintFitted } from './canvas';
import type { FrameItem } from './frames';
import { Icon } from './icons';

export interface TimelineProps {
  frames: FrameItem[];
  composed: (RGBAImage | null)[];
  durations: number[];
  selected: number;
  playing: boolean;
  onSelect: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onDropFiles: (files: File[], at: number) => void;
}

const THUMB = 64;

function Thumb({ image }: { image: RGBAImage | null }) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    if (image) paintFitted(ref.current, image, { w: THUMB, h: THUMB }, true);
  }, [image]);
  return image ? <canvas ref={ref} className="crisp" /> : <span className="aa-thumb-pending" aria-label="Preparing" />;
}

export function Timeline({
  frames, composed, durations, selected, playing, onSelect, onMove, onDuplicate, onRemove, onAdd, onDropFiles,
}: TimelineProps) {
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [insertAt, setInsertAt] = React.useState<number | null>(null);
  const stripRef = React.useRef<HTMLDivElement | null>(null);

  // Keep the selected frame scrolled into view (playback, keyboard stepping).
  React.useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selected]);

  const slotFor = (e: React.DragEvent, i: number) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientX < r.left + r.width / 2 ? i : i + 1;
  };
  const onDragOver = (e: React.DragEvent, i: number) => {
    const files = e.dataTransfer.types.includes('Files');
    if (dragFrom === null && !files) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = files ? 'copy' : 'move';
    setInsertAt(slotFor(e, i));
  };
  const onDrop = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    const at = slotFor(e, i);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length) onDropFiles(files, at);
    else if (dragFrom !== null) onMove(dragFrom, at);
    setDragFrom(null);
    setInsertAt(null);
  };

  return (
    <div className="aa-timeline" onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setInsertAt(null); }}>
      <div className="aa-strip" ref={stripRef} role="listbox" aria-label="Frames" aria-orientation="horizontal">
        {frames.map((f, i) => (
          <div
            key={f.id}
            data-index={i}
            role="option"
            aria-selected={i === selected}
            tabIndex={i === selected ? 0 : -1}
            title={f.name}
            className={[
              'aa-card',
              i === selected ? 'selected' : '',
              playing && i === selected ? 'live' : '',
              dragFrom === i ? 'dragging' : '',
              insertAt === i ? 'insert-before' : '',
              insertAt === i + 1 && i === frames.length - 1 ? 'insert-after' : '',
            ].join(' ')}
            draggable
            onClick={() => onSelect(i)}
            onDragStart={(e) => {
              setDragFrom(i);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', f.name);
            }}
            onDragEnd={() => { setDragFrom(null); setInsertAt(null); }}
            onDragOver={(e) => onDragOver(e, i)}
            onDrop={(e) => onDrop(e, i)}
          >
            <div className="aa-thumb"><Thumb image={composed[i]} /></div>
            <div className="aa-card-meta">
              <span className="num">{String(i + 1).padStart(2, '0')}</span>
              <span className={f.duration !== null ? 'dur custom' : 'dur'}>{durations[i]}ms</span>
            </div>
            <div className="aa-card-actions">
              <button type="button" title="Duplicate frame" aria-label={`Duplicate frame ${i + 1}`} onClick={(e) => { e.stopPropagation(); onDuplicate(f.id); }}>
                <Icon name="duplicate" />
              </button>
              <button type="button" title="Remove frame" aria-label={`Remove frame ${i + 1}`} onClick={(e) => { e.stopPropagation(); onRemove(f.id); }}>
                <Icon name="trash" />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="aa-add"
          onClick={onAdd}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); setInsertAt(frames.length); } }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setInsertAt(null);
            const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
            if (files.length) onDropFiles(files, frames.length);
          }}
        >
          <Icon name="plus" size={12} />
          <span>Add frames</span>
        </button>
      </div>
    </div>
  );
}
