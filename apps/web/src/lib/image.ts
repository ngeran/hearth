import { PHOTO_OUTPUT_SIZE } from "@hearth/shared";

/**
 * Re-encoding through a canvas drops EXIF/GPS data in the browser. The Worker
 * sanitizes again, so a compromised client cannot bypass the guarantee.
 */
export async function reencodePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, PHOTO_OUTPUT_SIZE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close();
    throw new Error("Canvas is unavailable.");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.86);
  });

  if (!blob) {
    throw new Error("The image could not be encoded.");
  }

  return blob;
}
