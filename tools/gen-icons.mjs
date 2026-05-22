// Generates icons/icon{16,48,128}.png — a white map-pin on a teal rounded tile.
// Pure Node (zlib only); run with `node tools/gen-icons.mjs`.
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function png(N, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const stride = N * 4;
  const raw = Buffer.alloc((stride + 1) * N);
  for (let y = 0; y < N; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function inRoundedRect(x, y, N, r) {
  let dx = 0; let dy = 0;
  if (x < r) dx = r - x; else if (x > N - r) dx = x - (N - r);
  if (y < r) dy = r - y; else if (y > N - r) dy = y - (N - r);
  return Math.hypot(dx, dy) <= r;
}
function inPin(u, v) {
  const cx = 0.5; const headY = 0.40; const headR = 0.205; const holeR = 0.085; const tipY = 0.86;
  const dh = Math.hypot(u - cx, v - headY);
  if (dh <= headR && dh >= holeR) return true;
  const baseY = 0.46; const bw = 0.175;
  if (v >= baseY && v <= tipY) {
    const half = bw * (1 - (v - baseY) / (tipY - baseY));
    if (Math.abs(u - cx) <= half) return true;
  }
  return false;
}

function makeIcon(N) {
  const rgba = Buffer.alloc(N * N * 4);
  const SS = 4;
  const r = 0.2 * N;
  const teal = [14, 124, 102];
  const white = [255, 255, 255];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let bg = 0; let pin = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (inRoundedRect(px, py, N, r)) bg++;
          if (inPin(px / N, py / N)) pin++;
        }
      }
      const tot = SS * SS;
      const a = bg / tot;
      const p = a > 0 ? Math.min(pin / tot, a) / a : 0;
      const i = (y * N + x) * 4;
      rgba[i] = Math.round(teal[0] * (1 - p) + white[0] * p);
      rgba[i + 1] = Math.round(teal[1] * (1 - p) + white[1] * p);
      rgba[i + 2] = Math.round(teal[2] * (1 - p) + white[2] * p);
      rgba[i + 3] = Math.round(a * 255);
    }
  }
  return png(N, rgba);
}

mkdirSync('icons', { recursive: true });
for (const N of [16, 48, 128]) {
  writeFileSync(`icons/icon${N}.png`, makeIcon(N));
  console.log(`wrote icons/icon${N}.png`);
}
