/// <reference types="node" />
// A PNG encoder for the command line (the app encodes in Rust or through a
// canvas; Node has neither). RGBA8, no filtering: pixel art compresses well
// as it is, and simple is what a build step wants.

import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Nearest-neighbour upscale of flat RGBA by a whole factor. */
export function upscale(rgba: ArrayLike<number>, w: number, h: number, scale: number): Uint8Array {
  const s = Math.max(1, Math.floor(scale));
  const out = new Uint8Array(w * s * h * s * 4);
  for (let y = 0; y < h * s; y++) for (let x = 0; x < w * s; x++) {
    const from = ((Math.floor(y / s) * w) + Math.floor(x / s)) * 4;
    out.set([rgba[from], rgba[from + 1], rgba[from + 2], rgba[from + 3]], (y * w * s + x) * 4);
  }
  return out;
}

/** Flat RGBA (0–255) → PNG bytes. */
export function encodePng(rgba: ArrayLike<number>, w: number, h: number): Uint8Array {
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, w);
  hv.setUint32(4, h);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, deflate, no filter, no interlace
  const raw = new Uint8Array(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let i = 0; i < w * 4; i++) raw[y * (w * 4 + 1) + 1 + i] = rgba[y * w * 4 + i];
  }
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
