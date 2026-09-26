// Canvas helpers for the AI-art frame workspace.

import React from 'react';
import type { RGBAImage } from '../../lib/pixelReconstruction';

const bitmapCache = new WeakMap<RGBAImage, HTMLCanvasElement>();

/** An RGBAImage as a 1:1 canvas, cached per image object. */
export function imageCanvas(image: RGBAImage): HTMLCanvasElement {
  let c = bitmapCache.get(image);
  if (!c) {
    c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
    bitmapCache.set(image, c);
  }
  return c;
}

const tintCache = new WeakMap<RGBAImage, Map<string, HTMLCanvasElement>>();

/** The image's silhouette filled with a flat color (for onion skins). */
export function tintedCanvas(image: RGBAImage, color: string): HTMLCanvasElement {
  let byColor = tintCache.get(image);
  if (!byColor) {
    byColor = new Map();
    tintCache.set(image, byColor);
  }
  let c = byColor.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(imageCanvas(image), 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, c.width, c.height);
    byColor.set(color, c);
  }
  return c;
}

/** Read a CSS custom property from the document (design tokens). */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Paint an RGBAImage to fill `box` as closely as possible.
 *
 * Reconstructed sprites are drawn at an integer zoom with nearest-neighbor so
 * pixels stay square and crisp; source rasters (usually far larger than the
 * pane) are drawn at a fractional scale with smoothing, which is the honest
 * preview of what the input actually looks like.
 */
export function paintFitted(
  canvas: HTMLCanvasElement | null,
  image: RGBAImage | null,
  box: { w: number; h: number },
  crisp: boolean,
): void {
  if (!canvas || !image || image.width === 0 || image.height === 0) return;
  if (box.w < 1 || box.h < 1) return;

  const fit = Math.min(box.w / image.width, box.h / image.height);
  const scale = crisp && fit >= 1 ? Math.floor(fit) : fit;
  const cssW = Math.max(1, Math.floor(image.width * scale));
  const cssH = Math.max(1, Math.floor(image.height * scale));

  // Back the canvas with device pixels so the preview stays sharp on
  // HiDPI displays, then let CSS lay it out in logical pixels.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = !crisp;
  ctx.drawImage(imageCanvas(image), 0, 0, canvas.width, canvas.height);
}

/** Track an element's content-box size. Takes the element via callback ref. */
export function useBoxSize(): [(el: HTMLElement | null) => void, { w: number; h: number }] {
  const [el, setEl] = React.useState<HTMLElement | null>(null);
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  React.useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, box];
}

/**
 * Repaint `image` into a canvas whenever it or the containing box changes.
 *
 * The frame and canvas are tracked as state via callback refs, not plain refs:
 * they only mount once an image is loaded, so an effect keyed on mount alone
 * would attach the observer to a null element and never paint anything.
 */
export function useFittedCanvas(image: RGBAImage | null, crisp: boolean) {
  const [frameRef, box] = useBoxSize();
  const [canvasEl, setCanvasEl] = React.useState<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    paintFitted(canvasEl, image, box, crisp);
  }, [canvasEl, image, box, crisp]);
  return { frameRef, canvasRef: setCanvasEl };
}
