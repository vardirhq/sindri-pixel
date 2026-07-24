import React from 'react';
import type { AIStatus } from '../types';

const sbStyles = {
  bar: {
    height: 28, background: 'var(--paper-2)',
    borderTop: '1px solid var(--rule)',
    display: 'flex', alignItems: 'center', padding: '0 18px', gap: 16,
    fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)',
    letterSpacing: '0.06em',
    flex: 'none',
  } as React.CSSProperties,
  dot: (c: string): React.CSSProperties => ({ width: 6, height: 6, background: c, display: 'inline-block', marginRight: 6 }),
  right: { marginLeft: 'auto', display: 'flex', gap: 16 } as React.CSSProperties,
  sep: { color: 'var(--ink-4)' } as React.CSSProperties,
};

export interface StatusBarProps {
  aiStatus: AIStatus;
  cursor: { x: number; y: number } | null;
  canvasSize: { w: number; h: number };
  frameCount: number;
  layerCount: number;
  zoom: number;
}

export function StatusBar({ aiStatus, cursor, canvasSize, frameCount, layerCount, zoom }: StatusBarProps) {
  return (
    <footer style={sbStyles.bar}>
      <span><span style={sbStyles.dot('var(--moss)')} />engine ready</span>
      <span><span style={sbStyles.dot(aiStatus.kind === 'idle' ? 'var(--moss)' : 'var(--amber)')} />ollama · localhost:11434</span>
      <span style={sbStyles.sep}>·</span>
      <span style={{ color: aiStatus.amber ? 'var(--amber)' : 'inherit' }}>{aiStatus.text}</span>
      <div style={sbStyles.right}>
        {cursor && <span>x {String(cursor.x).padStart(2, '0')} · y {String(cursor.y).padStart(2, '0')}</span>}
        <span>{canvasSize.w} × {canvasSize.h}</span>
        <span>{zoom}×</span>
        <span>{frameCount} frames</span>
        <span>{layerCount} layers</span>
        <span>sindri-pixel v0.1.0</span>
      </div>
    </footer>
  );
}
