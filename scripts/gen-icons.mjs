#!/usr/bin/env node
// gen-icons.mjs
//
// Dependency-free PNG icon generator for "YouTube Time Slipper".
// Uses only Node.js built-in modules (node:zlib, node:fs, node:path,
// node:buffer) to hand-roll a minimal PNG encoder (8-bit RGBA, color
// type 6) and rasterizes a simple "clock running backwards" icon with
// distance-field shapes and smoothstep anti-aliasing.
//
// Run with: node scripts/gen-icons.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// PNG encoding (minimal, dependency-free)
// ---------------------------------------------------------------------------

/** Precomputed CRC32 lookup table. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** Standard PNG/zlib CRC32 over a Buffer. */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Build one PNG chunk: 4-byte length + 4-byte type + data + 4-byte CRC. */
function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcSource = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcSource), 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Encode an RGBA pixel buffer (width*height*4 bytes, row-major, no padding)
 * into a PNG file buffer.
 */
function encodePNG(width, height, rgba) {
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method

  // Raw scanlines, each prefixed with filter byte 0 (None)
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: None
    rgba.copy(raw, rowStart + 1, y * stride, y * stride + stride);
  }

  const idatData = deflateSync(raw, { level: 9 });

  const chunks = [
    PNG_SIGNATURE,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0)),
  ];

  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// Small math / SDF helpers
// ---------------------------------------------------------------------------

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

/** GLSL-style smoothstep. */
function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Convert a signed distance (negative = inside shape) into a 0..1 coverage
 * value, anti-aliased over roughly a 1px band around the edge.
 */
function coverageFromSD(sd) {
  return 1 - smoothstep(-0.5, 0.5, sd);
}

/** Signed distance to an axis-aligned rounded rectangle centered at (cx,cy). */
function sdRoundRect(px, py, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(px - cx) - halfW + radius;
  const qy = Math.abs(py - cy) - halfH + radius;
  const outsideDist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return Math.min(Math.max(qx, qy), 0) + outsideDist - radius;
}

/** Euclidean distance from point (px,py) to segment (x1,y1)-(x2,y2). */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = clamp(t, 0, 1);
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Mix two 0-255 color channels by t in [0,1]. */
function mixChannel(a, b, t) {
  return a + (b - a) * t;
}

// ---------------------------------------------------------------------------
// Icon rendering: dark navy rounded square + cyan clock face with hands
// pointing backwards (hour -> ~10 o'clock, minute -> ~8 o'clock).
// ---------------------------------------------------------------------------

const BG_COLOR = { r: 0x10, g: 0x13, b: 0x1c }; // #10131c
const FG_COLOR = { r: 0x7f, g: 0xdf, b: 0xff }; // #7fdfff

/** Position on a unit clock face for hour mark N (1-12), 12 = straight up. */
function clockPoint(n) {
  const theta = (n / 12) * 2 * Math.PI;
  return { x: Math.sin(theta), y: -Math.cos(theta) };
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);

  const cx = size / 2;
  const cy = size / 2;

  // Rounded square background geometry.
  const margin = size * 0.03;
  const halfW = size / 2 - margin;
  const halfH = size / 2 - margin;
  const cornerRadius = size * 0.22;

  // Clock face geometry.
  const clockRadius = size * 0.32;
  const ringStroke = Math.max(size * 0.09, 1.3);
  const handStroke = Math.max(size * 0.08, 1.15);

  // Hands point "backwards": hour hand toward 10 o'clock, minute hand
  // toward 8 o'clock.
  const hourDir = clockPoint(10);
  const minuteDir = clockPoint(8);
  const hourLen = clockRadius * 0.5;
  const minuteLen = clockRadius * 0.8;

  const hourEnd = { x: cx + hourDir.x * hourLen, y: cy + hourDir.y * hourLen };
  const minuteEnd = {
    x: cx + minuteDir.x * minuteLen,
    y: cy + minuteDir.y * minuteLen,
  };

  const centerDotRadius = Math.max(size * 0.045, 0.8);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Sample at pixel center for stable anti-aliasing.
      const px = x + 0.5;
      const py = y + 0.5;

      const sdSquare = sdRoundRect(px, py, cx, cy, halfW, halfH, cornerRadius);
      const squareCoverage = coverageFromSD(sdSquare);

      // Clock ring: band around the circle outline.
      const distFromCenter = Math.hypot(px - cx, py - cy);
      const ringSD = Math.abs(distFromCenter - clockRadius) - ringStroke / 2;
      const ringCoverage = coverageFromSD(ringSD);

      // Hands (capsules).
      const hourSD =
        distToSegment(px, py, cx, cy, hourEnd.x, hourEnd.y) - handStroke / 2;
      const minuteSD =
        distToSegment(px, py, cx, cy, minuteEnd.x, minuteEnd.y) -
        handStroke / 2;
      const hourCoverage = coverageFromSD(hourSD);
      const minuteCoverage = coverageFromSD(minuteSD);

      // Center dot where the hands meet.
      const dotSD = distFromCenter - centerDotRadius;
      const dotCoverage = coverageFromSD(dotSD);

      const fgCoverage = clamp(
        Math.max(ringCoverage, hourCoverage, minuteCoverage, dotCoverage),
        0,
        1
      );

      const r = mixChannel(BG_COLOR.r, FG_COLOR.r, fgCoverage);
      const g = mixChannel(BG_COLOR.g, FG_COLOR.g, fgCoverage);
      const b = mixChannel(BG_COLOR.b, FG_COLOR.b, fgCoverage);
      const a = squareCoverage * 255;

      const idx = (y * size + x) * 4;
      rgba[idx] = Math.round(r);
      rgba[idx + 1] = Math.round(g);
      rgba[idx + 2] = Math.round(b);
      rgba[idx + 3] = Math.round(a);
    }
  }

  return rgba;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = join(scriptDir, '..');
  const outDir = join(projectRoot, 'public', 'icons');

  mkdirSync(outDir, { recursive: true });

  const sizes = [16, 48, 128];

  for (const size of sizes) {
    const rgba = renderIcon(size);
    const png = encodePNG(size, size, rgba);
    const outPath = join(outDir, `icon${size}.png`);
    writeFileSync(outPath, png);
    console.log(`Wrote ${outPath} (${png.length} bytes)`);
  }
}

main();
