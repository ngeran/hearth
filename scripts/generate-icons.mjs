import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";

const outputDirectory = resolve(process.cwd(), "apps/web/public/icons");
const terracotta = [200, 85, 61, 255];
const cream = [250, 247, 242, 255];
const amber = [232, 163, 61, 255];

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuffer, data]);
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  body.copy(output, 4);
  output.writeUInt32BE(crc32(body), 8 + data.length);
  return output;
}

function encodePng(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function setPixel(pixels, width, x, y, color) {
  if (x < 0 || y < 0 || x >= width) {
    return;
  }

  const index = (y * width + x) * 4;
  if (index < 0 || index + 3 >= pixels.length) {
    return;
  }

  pixels[index] = color[0];
  pixels[index + 1] = color[1];
  pixels[index + 2] = color[2];
  pixels[index + 3] = color[3];
}

function fillRect(pixels, size, x0, y0, x1, y1, color) {
  const left = Math.round(x0 * size);
  const top = Math.round(y0 * size);
  const right = Math.round(x1 * size);
  const bottom = Math.round(y1 * size);

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      setPixel(pixels, size, x, y, color);
    }
  }
}

function fillCircle(pixels, size, centerX, centerY, radius, color) {
  const cx = centerX * size;
  const cy = centerY * size;
  const r = radius * size;
  const left = Math.floor(cx - r);
  const top = Math.floor(cy - r);
  const right = Math.ceil(cx + r);
  const bottom = Math.ceil(cy + r);

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r ** 2) {
        setPixel(pixels, size, x, y, color);
      }
    }
  }
}

function sign(x1, y1, x2, y2, x3, y3) {
  return (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
}

function fillTriangle(pixels, size, points, color) {
  const scaled = points.map(([x, y]) => [x * size, y * size]);
  const xs = scaled.map(([x]) => x);
  const ys = scaled.map(([, y]) => y);
  const left = Math.floor(Math.min(...xs));
  const right = Math.ceil(Math.max(...xs));
  const top = Math.floor(Math.min(...ys));
  const bottom = Math.ceil(Math.max(...ys));
  const [a, b, c] = scaled;

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const d1 = sign(x, y, a[0], a[1], b[0], b[1]);
      const d2 = sign(x, y, b[0], b[1], c[0], c[1]);
      const d3 = sign(x, y, c[0], c[1], a[0], a[1]);
      const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
      const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;

      if (!(hasNegative && hasPositive)) {
        setPixel(pixels, size, x, y, color);
      }
    }
  }
}

function drawIcon(size) {
  const supersample = 4;
  const largeSize = size * supersample;
  const pixels = new Uint8Array(largeSize * largeSize * 4);

  fillRect(pixels, largeSize, 0, 0, 1, 1, terracotta);
  fillTriangle(
    pixels,
    largeSize,
    [
      [0.16, 0.43],
      [0.5, 0.14],
      [0.84, 0.43],
    ],
    cream,
  );
  fillRect(pixels, largeSize, 0.25, 0.38, 0.75, 0.84, cream);
  fillCircle(pixels, largeSize, 0.5, 0.54, 0.09, terracotta);
  fillRect(pixels, largeSize, 0.41, 0.54, 0.59, 0.84, terracotta);
  fillCircle(pixels, largeSize, 0.5, 0.64, 0.028, amber);
  fillTriangle(
    pixels,
    largeSize,
    [
      [0.5, 0.55],
      [0.47, 0.64],
      [0.53, 0.64],
    ],
    amber,
  );

  const output = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;

      for (let sy = 0; sy < supersample; sy += 1) {
        for (let sx = 0; sx < supersample; sx += 1) {
          const index = ((y * supersample + sy) * largeSize + (x * supersample + sx)) * 4;
          red += pixels[index];
          green += pixels[index + 1];
          blue += pixels[index + 2];
          alpha += pixels[index + 3];
        }
      }

      const samples = supersample * supersample;
      const index = (y * size + x) * 4;
      output[index] = Math.round(red / samples);
      output[index + 1] = Math.round(green / samples);
      output[index + 2] = Math.round(blue / samples);
      output[index + 3] = Math.round(alpha / samples);
    }
  }

  return encodePng(size, size, output);
}

mkdirSync(outputDirectory, { recursive: true });

const icons = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "maskable-192.png", size: 192 },
  { name: "maskable-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

for (const icon of icons) {
  writeFileSync(resolve(outputDirectory, icon.name), drawIcon(icon.size));
  console.log(`generated icons/${icon.name}`);
}
