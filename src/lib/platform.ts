// src/lib/platform.ts
// Tauri detection + browser fallbacks so the editor degrades gracefully when
// running as a plain web page (dev server, demos, tests).

export const IS_TAURI: boolean =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Trigger a browser download of `bytes` as `filename`. */
export function downloadBytes(bytes: Uint8Array, filename: string, mime: string): void {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Trigger a browser download of a text file. */
export function downloadText(text: string, filename: string): void {
  downloadBytes(new TextEncoder().encode(text), filename, 'application/octet-stream');
}

/** Open a browser file picker; resolves with the chosen file or null. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // Cancel produces no event on all engines; resolve null when focus returns.
    window.addEventListener('focus', () => setTimeout(() => resolve(null), 300), { once: true });
    input.click();
  });
}

/**
 * Encode a flat RGBA buffer as a PNG via an offscreen canvas.
 * Used as the browser fallback for the Rust `export_png` command.
 */
export async function encodePngInBrowser(
  pixels: number[],
  width: number,
  height: number,
  scale: number,
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const img = new ImageData(new Uint8ClampedArray(pixels), width, height);
  const tmp = document.createElement('canvas');
  tmp.width = width;
  tmp.height = height;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('PNG encode failed');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Decode a PNG File into { w, h, pixels } — browser fallback for `import_png`. */
export async function decodePngInBrowser(file: File): Promise<{ w: number; h: number; pixels: number[] }> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  const pixels: number[] = new Array(bmp.width * bmp.height);
  for (let i = 0; i < pixels.length; i++) {
    const a = data[i * 4 + 3];
    pixels[i] = a === 0
      ? 0
      : ((0xff << 24) | (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2]) >>> 0;
  }
  return { w: bmp.width, h: bmp.height, pixels };
}
