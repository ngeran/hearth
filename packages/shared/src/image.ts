import { PHOTO_MAX_BYTES, PHOTO_MAX_DIMENSION, PHOTO_MIN_DIMENSION } from "./profile";

export type ImageContentType = "image/jpeg" | "image/png";

export type ImageValidationCode =
  | "empty"
  | "too_large"
  | "unsupported_type"
  | "invalid_image"
  | "invalid_dimensions";

export class ImageValidationError extends Error {
  readonly code: ImageValidationCode;

  constructor(code: ImageValidationCode, message: string) {
    super(message);
    this.name = "ImageValidationError";
    this.code = code;
  }
}

export interface SanitizedImage {
  contentType: ImageContentType;
  bytes: Uint8Array;
  width: number;
  height: number;
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Chunks that can carry user identifiers, camera data or capture times. */
const PNG_METADATA_CHUNKS = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

function readU16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }

  return result;
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.byteLength < prefix.byteLength) {
    return false;
  }

  return prefix.every((value, index) => bytes[index] === value);
}

export function sniffImageType(bytes: Uint8Array): ImageContentType | null {
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (startsWith(bytes, PNG_SIGNATURE)) {
    return "image/png";
  }

  return null;
}

function readJpegDimensions(input: Uint8Array): { width: number; height: number } | null {
  let offset = 2;

  while (offset + 1 < input.byteLength) {
    while (offset < input.byteLength && input[offset] === 0xff) {
      offset += 1;
    }

    const marker = input[offset];
    offset += 1;

    if (marker === undefined || marker === 0x00) {
      return null;
    }

    if (marker === 0xd9 || marker === 0xda) {
      return null;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    const length = readU16(input, offset);
    if (length < 2 || offset + length > input.byteLength) {
      return null;
    }

    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isStartOfFrame) {
      const height = readU16(input, offset + 3);
      const width = readU16(input, offset + 5);

      if (width === 0 || height === 0) {
        return null;
      }

      return { width, height };
    }

    offset += length;
  }

  return null;
}

function readPngDimensions(input: Uint8Array): { width: number; height: number } | null {
  if (input.byteLength < 24) {
    return null;
  }

  const chunkLength = readU32(input, 8);
  const type = String.fromCharCode(input[12] ?? 0, input[13] ?? 0, input[14] ?? 0, input[15] ?? 0);

  if (chunkLength !== 13 || type !== "IHDR") {
    return null;
  }

  const width = readU32(input, 16);
  const height = readU32(input, 20);

  if (width === 0 || height === 0) {
    return null;
  }

  return { width, height };
}

export function readImageDimensions(input: Uint8Array): { width: number; height: number } | null {
  const contentType = sniffImageType(input);

  if (contentType === "image/jpeg") {
    return readJpegDimensions(input);
  }

  if (contentType === "image/png") {
    return readPngDimensions(input);
  }

  return null;
}

/**
 * Drops EXIF/XMP/IPTC/comment segments but keeps the pixels and colour data
 * (JFIF, ICC and Adobe APP14). The scan data after SOS is copied verbatim.
 */
export function stripJpegMetadata(input: Uint8Array): Uint8Array {
  if (sniffImageType(input) !== "image/jpeg") {
    throw new ImageValidationError("unsupported_type", "Expected a JPEG image.");
  }

  const parts: Uint8Array[] = [Uint8Array.from([0xff, 0xd8])];
  let offset = 2;

  while (offset < input.byteLength) {
    while (offset < input.byteLength && input[offset] === 0xff) {
      offset += 1;
    }

    const marker = input[offset];
    offset += 1;

    if (marker === undefined || marker === 0x00) {
      throw new ImageValidationError("invalid_image", "The JPEG marker stream is invalid.");
    }

    if (marker === 0xd9) {
      parts.push(Uint8Array.from([0xff, 0xd9]));
      return concatBytes(parts);
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(Uint8Array.from([0xff, marker]));
      continue;
    }

    const length = readU16(input, offset);
    const end = offset + length;

    if (length < 2 || end > input.byteLength) {
      throw new ImageValidationError("invalid_image", "The JPEG segment is truncated.");
    }

    if (marker === 0xda) {
      parts.push(Uint8Array.from([0xff, marker]));
      parts.push(input.subarray(offset, end));
      parts.push(input.subarray(end));
      return concatBytes(parts);
    }

    const isMetadata =
      marker === 0xe1 || (marker >= 0xe3 && marker <= 0xed) || marker === 0xef || marker === 0xfe;

    if (!isMetadata) {
      parts.push(Uint8Array.from([0xff, marker]));
      parts.push(input.subarray(offset, end));
    }

    offset = end;
  }

  throw new ImageValidationError("invalid_image", "The JPEG has no end marker.");
}

/**
 * Drops PNG text, timestamp and EXIF chunks. Structural, palette, transparency,
 * colour-profile and animation chunks are preserved untouched.
 */
export function stripPngMetadata(input: Uint8Array): Uint8Array {
  if (sniffImageType(input) !== "image/png") {
    throw new ImageValidationError("unsupported_type", "Expected a PNG image.");
  }

  const parts: Uint8Array[] = [input.subarray(0, PNG_SIGNATURE.byteLength)];
  let offset = PNG_SIGNATURE.byteLength;

  while (offset + 8 <= input.byteLength) {
    const length = readU32(input, offset);
    const type = String.fromCharCode(
      input[offset + 4] ?? 0,
      input[offset + 5] ?? 0,
      input[offset + 6] ?? 0,
      input[offset + 7] ?? 0,
    );
    const end = offset + 12 + length;

    if (end > input.byteLength) {
      throw new ImageValidationError("invalid_image", "The PNG chunk is truncated.");
    }

    if (!PNG_METADATA_CHUNKS.has(type)) {
      parts.push(input.subarray(offset, end));
    }

    offset = end;

    if (type === "IEND") {
      return concatBytes(parts);
    }
  }

  throw new ImageValidationError("invalid_image", "The PNG has no end chunk.");
}

/**
 * The only entry point the Worker should call. It enforces size and dimensions,
 * sniffs the real format, then removes metadata before the bytes reach R2.
 */
export function sanitizeImage(input: Uint8Array): SanitizedImage {
  if (input.byteLength === 0) {
    throw new ImageValidationError("empty", "Choose an image to upload.");
  }

  if (input.byteLength > PHOTO_MAX_BYTES) {
    throw new ImageValidationError("too_large", "The image must be 5 MB or smaller.");
  }

  const contentType = sniffImageType(input);

  if (!contentType) {
    throw new ImageValidationError("unsupported_type", "Use a JPEG or PNG image.");
  }

  const bytes = contentType === "image/jpeg" ? stripJpegMetadata(input) : stripPngMetadata(input);
  const dimensions = readImageDimensions(bytes);

  if (!dimensions) {
    throw new ImageValidationError("invalid_image", "The image could not be read.");
  }

  if (
    dimensions.width < PHOTO_MIN_DIMENSION ||
    dimensions.height < PHOTO_MIN_DIMENSION ||
    dimensions.width > PHOTO_MAX_DIMENSION ||
    dimensions.height > PHOTO_MAX_DIMENSION
  ) {
    throw new ImageValidationError(
      "invalid_dimensions",
      `The image must be between ${PHOTO_MIN_DIMENSION} and ${PHOTO_MAX_DIMENSION} pixels per side.`,
    );
  }

  return { contentType, bytes, ...dimensions };
}
