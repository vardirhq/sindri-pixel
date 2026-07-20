import type { Frame, PixelGrid } from '../types';

const MAX_CANVAS_SIZE = 512;
const MAX_SPRITE_SHEET_PIXELS = 4_194_304;

export function frameFromPackedPixels(w: number, h: number, pixelInts: number[]): Frame {
  if (w > MAX_CANVAS_SIZE || h > MAX_CANVAS_SIZE) throw new Error(`Imported images cannot exceed ${MAX_CANVAS_SIZE} × ${MAX_CANVAS_SIZE} pixels`);
  if (w < 1 || h < 1 || pixelInts.length !== w * h) throw new Error('Packed pixel data does not match its dimensions');
  const pixels: PixelGrid = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      const value = pixelInts[y * w + x];
      if (!value || (value >>> 24) === 0) return null;
      const r = (value >> 16) & 0xff;
      const g = (value >> 8) & 0xff;
      const b = value & 0xff;
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }),
  );
  return {
    id: 'frame_0',
    duration: 120,
    layers: [{ id: 'l0', name: 'layer 1', visible: true, opacity: 1, pixels }],
  };
}

export function compositeFrame(frame: Frame, width: number, height: number): number[] {
  const output = new Array<number>(width * height * 4).fill(0);
  for (const layer of frame.layers) {
    if (!layer.visible) continue;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const color = layer.pixels[y]?.[x];
        if (!color) continue;
        const sourceRed = parseInt(color.slice(1, 3), 16);
        const sourceGreen = parseInt(color.slice(3, 5), 16);
        const sourceBlue = parseInt(color.slice(5, 7), 16);
        const sourceAlpha = layer.opacity;
        const index = (y * width + x) * 4;
        const destinationAlpha = output[index + 3] / 255;
        const alpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
        if (alpha > 0) {
          output[index] = Math.round((sourceRed * sourceAlpha + output[index] * destinationAlpha * (1 - sourceAlpha)) / alpha);
          output[index + 1] = Math.round((sourceGreen * sourceAlpha + output[index + 1] * destinationAlpha * (1 - sourceAlpha)) / alpha);
          output[index + 2] = Math.round((sourceBlue * sourceAlpha + output[index + 2] * destinationAlpha * (1 - sourceAlpha)) / alpha);
          output[index + 3] = Math.round(alpha * 255);
        }
      }
    }
  }
  return output;
}

export function buildSpriteSheet(frames: Frame[], width: number, height: number, columns: number): { pixels: number[]; width: number; height: number } {
  if (frames.length === 0) throw new Error('A sprite sheet requires at least one frame');
  const columnCount = Math.max(1, Math.min(columns, frames.length));
  const rowCount = Math.ceil(frames.length / columnCount);
  const sheetWidth = width * columnCount;
  const sheetHeight = height * rowCount;
  if (!Number.isSafeInteger(sheetWidth * sheetHeight) || sheetWidth * sheetHeight > MAX_SPRITE_SHEET_PIXELS) {
    throw new Error('The requested sprite sheet is too large to export safely');
  }
  const sheet = new Array<number>(sheetWidth * sheetHeight * 4).fill(0);

  frames.forEach((frame, frameIndex) => {
    const pixels = compositeFrame(frame, width, height);
    const tileX = (frameIndex % columnCount) * width;
    const tileY = Math.floor(frameIndex / columnCount) * height;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const source = (y * width + x) * 4;
        const destination = ((tileY + y) * sheetWidth + tileX + x) * 4;
        sheet[destination] = pixels[source];
        sheet[destination + 1] = pixels[source + 1];
        sheet[destination + 2] = pixels[source + 2];
        sheet[destination + 3] = pixels[source + 3];
      }
    }
  });

  return { pixels: sheet, width: sheetWidth, height: sheetHeight };
}
