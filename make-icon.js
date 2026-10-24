// 生成粉色记账图标（icon.png / icon.ico）
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;
const px = new Uint8Array(SIZE * SIZE * 4);

function set(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
}

function drawLine(x0, y0, x1, y1, thick, r, g, b) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = 0; s <= steps; s++) {
    const t = steps === 0 ? 0 : s / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    for (let dy = -thick; dy <= thick; dy++) {
      for (let dx = -thick; dx <= thick; dx++) {
        set(x + dx, y + dy, r, g, b, 255);
      }
    }
  }
}

// 粉色渐变圆形背景
const cx = 128, cy = 128, R = 122;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d <= R) {
      const t = d / R;
      const r = Math.min(255, Math.round(251 + t * 8));
      const g = Math.round(111 + t * 40);
      const b = Math.round(146 + t * 30);
      set(x, y, r, g, b, 255);
    }
  }
}

// 白色 ¥ 符号
drawLine(128, 80, 128, 180, 6, 255, 255, 255);
drawLine(88, 112, 168, 112, 6, 255, 255, 255);
drawLine(88, 142, 168, 142, 6, 255, 255, 255);
drawLine(96, 80, 128, 112, 6, 255, 255, 255);
drawLine(160, 80, 128, 112, 6, 255, 255, 255);

// ---- PNG 编码 ----
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    const o = y * (SIZE * 4 + 1) + 1 + x * 4;
    raw[o] = px[i]; raw[o + 1] = px[i + 1]; raw[o + 2] = px[i + 2]; raw[o + 3] = px[i + 3];
  }
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0))
]);

fs.writeFileSync(path.join(__dirname, 'src', 'icon.png'), png);

// ---- 打包 ICO（嵌入 PNG）----
const pngSize = png.length;
const icondir = Buffer.alloc(6);
icondir.writeUInt16LE(0, 0);
icondir.writeUInt16LE(1, 2);
icondir.writeUInt16LE(1, 4);

const entry = Buffer.alloc(16);
entry[0] = 0; entry[1] = 0; entry[2] = 0; entry[3] = 0;
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(pngSize, 8);
entry.writeUInt32LE(22, 12);

const ico = Buffer.concat([icondir, entry, png]);
fs.writeFileSync(path.join(__dirname, 'src', 'icon.ico'), ico);

console.log('图标生成完成: src/icon.png, src/icon.ico');
