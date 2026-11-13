import { describe, expect, it } from "vitest";

import {
  ImageValidationError,
  PHOTO_MAX_BYTES,
  readImageDimensions,
  sanitizeImage,
  sniffImageType,
  stripJpegMetadata,
  stripPngMetadata,
} from "./index";

const encoder = new TextEncoder();

function segment(marker: number, payload: Uint8Array): Uint8Array {
  const result = new Uint8Array(payload.byteLength + 4);
  result[0] = 0xff;
  result[1] = marker;
  result[2] = ((payload.byteLength + 2) >> 8) & 0xff;
  result[3] = (payload.byteLength + 2) & 0xff;
  result.set(payload, 4);
  return result;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function jpegWithMetadata(): Uint8Array {
  const app0 = segment(
    0xe0,
    concat(encoder.encode("JFIF"), new Uint8Array([0, 1, 1, 0, 0, 1, 0, 1, 0, 0])),
  );
  const app1 = segment(0xe1, encoder.encode("Exif\u0000\u0000GPS 37.98,23.72"));
  const comment = segment(0xfe, encoder.encode("private note"));
  const sof = segment(
    0xc0,
    new Uint8Array([8, 0x04, 0x38, 0x07, 0x80, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]),
  );
  const sos = segment(0xda, new Uint8Array([3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]));

  return concat(
    new Uint8Array([0xff, 0xd8]),
    app0,
    app1,
    comment,
    sof,
    sos,
    new Uint8Array([0x12, 0x34, 0x56]),
    new Uint8Array([0xff, 0xd9]),
  );
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const result = new Uint8Array(12 + data.byteLength);
  result[0] = (data.byteLength >>> 24) & 0xff;
  result[1] = (data.byteLength >>> 16) & 0xff;
  result[2] = (data.byteLength >>> 8) & 0xff;
  result[3] = data.byteLength & 0xff;
  result.set(encoder.encode(type), 4);
  result.set(data, 8);
  return result;
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngWithMetadata(width = 800, height = 600): Uint8Array {
  const ihdr = new Uint8Array([
    (width >>> 24) & 0xff,
    (width >>> 16) & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    (height >>> 24) & 0xff,
    (height >>> 16) & 0xff,
    (height >>> 8) & 0xff,
    height & 0xff,
    8,
    6,
    0,
    0,
    0,
  ]);

  return concat(
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("tEXt", encoder.encode("Author\u0000Eleni")),
    pngChunk("eXIf", encoder.encode("GPS 37.98,23.72")),
    pngChunk("tIME", new Uint8Array([0x07, 0xea, 3, 4, 5, 6, 7])),
    pngChunk("IDAT", encoder.encode("pixels")),
    pngChunk("IEND", new Uint8Array()),
  );
}

describe("image sanitizing", () => {
  it("sniffs real magic bytes instead of trusting a client header", () => {
    expect(sniffImageType(jpegWithMetadata())).toBe("image/jpeg");
    expect(sniffImageType(pngWithMetadata())).toBe("image/png");
    expect(sniffImageType(encoder.encode("GIF89a"))).toBeNull();
  });

  it("removes JPEG EXIF and comments but keeps image segments", () => {
    const stripped = stripJpegMetadata(jpegWithMetadata());
    const text = String.fromCharCode(...stripped);

    expect(text).not.toContain("Exif");
    expect(text).not.toContain("private note");
    expect(text).toContain("JFIF");
    expect(readImageDimensions(stripped)).toEqual({ width: 1920, height: 1080 });
  });

  it("removes PNG text, EXIF and time chunks but keeps pixel data", () => {
    const stripped = stripPngMetadata(pngWithMetadata());
    const text = String.fromCharCode(...stripped);

    expect(text).not.toContain("Author");
    expect(text).not.toContain("GPS");
    expect(text).toContain("IDAT");
    expect(readImageDimensions(stripped)).toEqual({ width: 800, height: 600 });
  });

  it("sanitizes both supported formats end to end", () => {
    const jpeg = sanitizeImage(jpegWithMetadata());
    const png = sanitizeImage(pngWithMetadata());

    expect(jpeg.contentType).toBe("image/jpeg");
    expect(jpeg.width).toBe(1920);
    expect(png.contentType).toBe("image/png");
    expect(png.height).toBe(600);
  });

  it("rejects empty, oversized, unsupported and truncated images", () => {
    expect(() => sanitizeImage(new Uint8Array())).toThrow(ImageValidationError);
    expect(() => sanitizeImage(new Uint8Array(PHOTO_MAX_BYTES + 1))).toThrow(ImageValidationError);
    expect(() => sanitizeImage(encoder.encode("GIF89a"))).toThrow(ImageValidationError);
    expect(() => sanitizeImage(new Uint8Array([0xff, 0xd8, 0xff]))).toThrow(ImageValidationError);
    expect(() =>
      sanitizeImage(concat(PNG_SIGNATURE, pngChunk("IHDR", new Uint8Array(13)))),
    ).toThrow(ImageValidationError);
  });
});
