// Sindri Pixel — animated GIF encoding in the browser.
//
// The desktop app encodes GIFs in Rust; the web tool needs its own. Pixel art
// is the easy case for GIF: a small shared palette, hard-edged transparency,
// no dithering. One global palette serves every frame (index 0 is reserved
// for transparency), each frame fully replaces the last, and the image data
// is LZW-compressed with variable-width codes, following the same scheme as
// the widely used omggif writer.

import { quantize } from '../pixelReconstruction/paletteQuantize';
import type { RGBAImage } from '../pixelReconstruction/types';

export interface GifOptions {
  /** Loop forever (default) or play once. */
  loop?: boolean;
}

const TRANSPARENT = 0;
const ALPHA_CUTOFF = 128;

/** Encode same-sized RGBA frames as an animated GIF. */
export function encodeGif(frames: RGBAImage[], delaysMs: number[], options: GifOptions = {}): Uint8Array {
  if (frames.length === 0) throw new Error('A GIF needs at least one frame');
  const { width, height } = frames[0];
  if (width > 65535 || height > 65535) throw new Error('GIF dimensions are limited to 65535px');

  const indexed = indexFrames(frames);
  const colors = indexed.palette.length + 1; // + transparent slot
  let bits = 1;
  while (1 << bits < colors) bits++;
  const minCodeSize = Math.max(2, bits);

  const out = new ByteWriter();
  out.ascii('GIF89a');
  out.u16(width);
  out.u16(height);
  out.u8(0x80 | 0x70 | (bits - 1)); // global color table, 8-bit color resolution
  out.u8(TRANSPARENT); // background color index
  out.u8(0); // pixel aspect ratio
  for (let i = 0; i < 1 << bits; i++) {
    const c = i === TRANSPARENT ? 0 : indexed.palette[i - 1] ?? 0;
    out.u8((c >> 16) & 0xff);
    out.u8((c >> 8) & 0xff);
    out.u8(c & 0xff);
  }
  if (options.loop !== false) {
    out.bytes([0x21, 0xff, 0x0b]);
    out.ascii('NETSCAPE2.0');
    out.bytes([0x03, 0x01, 0x00, 0x00, 0x00]); // loop count 0 = forever
  }

  indexed.frames.forEach((indices, i) => {
    // Graphic control: restore to background after each frame (so frames
    // don't pile up through transparency), transparent index 0.
    const delay = Math.max(2, Math.round((delaysMs[i] ?? 100) / 10));
    out.bytes([0x21, 0xf9, 0x04, (2 << 2) | 0x01]);
    out.u16(delay);
    out.bytes([TRANSPARENT, 0x00]);
    out.u8(0x2c);
    out.u16(0);
    out.u16(0);
    out.u16(width);
    out.u16(height);
    out.u8(0); // no local color table, not interlaced
    out.u8(minCodeSize);
    const data = lzwEncode(indices, minCodeSize);
    for (let p = 0; p < data.length; p += 255) {
      const chunk = data.subarray(p, Math.min(data.length, p + 255));
      out.u8(chunk.length);
      out.bytes(chunk);
    }
    out.u8(0);
  });
  out.u8(0x3b);
  return out.result();
}

/**
 * Map every frame to palette indices over one shared palette of at most 255
 * colors (slot 0 is transparency). Frames with more colors between them are
 * quantized together, so a color stays the same index in every frame.
 */
function indexFrames(frames: RGBAImage[]): { palette: number[]; frames: Uint8Array[] } {
  const seen = new Set<number>();
  for (const f of frames) {
    for (let o = 0; o < f.data.length; o += 4) {
      if (f.data[o + 3] >= ALPHA_CUTOFF) seen.add((f.data[o] << 16) | (f.data[o + 1] << 8) | f.data[o + 2]);
    }
  }
  let source = frames;
  if (seen.size > 255) {
    const { width, height } = frames[0];
    const joined: RGBAImage = { data: new Uint8ClampedArray(width * height * frames.length * 4), width, height: height * frames.length };
    frames.forEach((f, i) => {
      joined.data.set(f.data, i * width * height * 4);
      // Quantize only what the GIF will show as opaque.
      for (let o = i * width * height * 4 + 3, end = (i + 1) * width * height * 4; o < end; o += 4) {
        joined.data[o] = joined.data[o] >= ALPHA_CUTOFF ? 255 : 0;
      }
    });
    const q = quantize(joined, 255).image;
    source = frames.map((_, i) => ({
      width,
      height,
      data: q.data.slice(i * width * height * 4, (i + 1) * width * height * 4),
    }));
  }

  const index = new Map<number, number>();
  const palette: number[] = [];
  const indexed = source.map((f) => {
    const out = new Uint8Array(f.width * f.height);
    for (let i = 0, o = 0; i < out.length; i++, o += 4) {
      if (f.data[o + 3] < ALPHA_CUTOFF) continue; // stays TRANSPARENT
      const rgb = (f.data[o] << 16) | (f.data[o + 1] << 8) | f.data[o + 2];
      let slot = index.get(rgb);
      if (slot === undefined) {
        palette.push(rgb);
        slot = palette.length; // 1-based: 0 is transparency
        index.set(rgb, slot);
      }
      out[i] = slot;
    }
    return out;
  });
  return { palette, frames: indexed };
}

/** GIF-flavored LZW: variable code width from minCodeSize+1 up to 12 bits. */
function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  const bytes: number[] = [];
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  let table = new Map<number, number>();
  let acc = 0;
  let accBits = 0;
  const emit = (code: number) => {
    acc |= code << accBits;
    accBits += codeSize;
    while (accBits >= 8) {
      bytes.push(acc & 0xff);
      acc >>>= 8;
      accBits -= 8;
    }
  };

  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const code = table.get(key);
    if (code !== undefined) {
      prefix = code;
      continue;
    }
    emit(prefix);
    if (next === 4096) {
      emit(clear);
      table = new Map();
      next = eoi + 1;
      codeSize = minCodeSize + 1;
    } else {
      if (next >= 1 << codeSize) codeSize++;
      table.set(key, next++);
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (accBits > 0) bytes.push(acc & 0xff);
  return Uint8Array.from(bytes);
}

class ByteWriter {
  private buf: number[] = [];
  u8(v: number) {
    this.buf.push(v & 0xff);
  }
  u16(v: number) {
    this.buf.push(v & 0xff, (v >> 8) & 0xff);
  }
  ascii(s: string) {
    for (let i = 0; i < s.length; i++) this.buf.push(s.charCodeAt(i));
  }
  bytes(b: ArrayLike<number>) {
    for (let i = 0; i < b.length; i++) this.buf.push(b[i]);
  }
  result(): Uint8Array {
    return Uint8Array.from(this.buf);
  }
}
