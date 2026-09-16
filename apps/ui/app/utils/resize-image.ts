/* eslint-disable @typescript-eslint/naming-convention -- Domain constants use SCREAMING_SNAKE_CASE */

/**
 * Maximum dimension (width or height) for chat images.
 * Anthropic internally resizes to 1568px — pre-resizing avoids
 * paying to transmit and process oversized data.
 */
const MAX_DIMENSION = 1568;

/** Maximum base64 data URL length (~1 MB raw after base64 expansion). */
export const MAX_DATA_URL_LENGTH = 1_398_102;

/** JPEG quality steps tried in order until the output fits. */
const QUALITY_LADDER = [0.85, 0.7, 0.5, 0.3];

/** Last-resort maximum dimension when quality alone can't fit. */
const LAST_RESORT_DIMENSION = 800;

/** Last-resort JPEG quality. */
const LAST_RESORT_QUALITY = 0.3;

/* eslint-enable @typescript-eslint/naming-convention -- Re-enable after constant declarations */

/**
 * Thrown when even the last-resort compression stays over
 * {@link MAX_DATA_URL_LENGTH}. Distinguishable from a generic compression
 * failure so the caller can toast "too large" rather than "failed".
 */
export class ImageTooLargeError extends Error {
  public override readonly name = 'ImageTooLargeError';

  public constructor(length: number) {
    super(`Image is too large to attach: ${length} bytes after compression exceeds ${MAX_DATA_URL_LENGTH}.`);
  }
}

/**
 * Resizes and compresses an image data URL for chat transmission.
 *
 * - Caps dimensions at 1568×1568 (preserving aspect ratio)
 * - Converts to JPEG with a quality ladder until output ≤ 1 MB
 * - Falls back to 800px max + q=0.3 as a last resort
 *
 * Images already within limits are returned unchanged.
 */
export const resizeImageForChat = async (dataUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!dataUrl.startsWith('data:image/')) {
      reject(new Error('Invalid image data URL'));
      return;
    }

    const img = new Image();

    img.addEventListener('load', () => {
      const { naturalWidth: origW, naturalHeight: origH } = img;

      if (origW === 0 || origH === 0) {
        reject(new Error('Image has zero dimensions'));
        return;
      }

      if (origW <= MAX_DIMENSION && origH <= MAX_DIMENSION && dataUrl.length <= MAX_DATA_URL_LENGTH) {
        resolve(dataUrl);
        return;
      }

      try {
        const result = compressWithCanvas(img, origW, origH);
        resolve(result);
      } catch (error) {
        reject(error instanceof ImageTooLargeError ? error : new Error('Failed to compress image'));
      }
    });

    img.addEventListener('error', () => {
      reject(new Error('Failed to load image'));
    });

    img.src = dataUrl;
  });
};

function compressWithCanvas(img: HTMLImageElement, origW: number, origH: number): string {
  const scale = Math.min(1, MAX_DIMENSION / Math.max(origW, origH));
  let width = Math.round(origW * scale);
  let height = Math.round(origH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context unavailable');
  }
  context.drawImage(img, 0, 0, width, height);

  for (const quality of QUALITY_LADDER) {
    const result = canvas.toDataURL('image/jpeg', quality);
    if (result.length <= MAX_DATA_URL_LENGTH) {
      return result;
    }
  }

  const lastResortScale = Math.min(1, LAST_RESORT_DIMENSION / Math.max(width, height));
  width = Math.round(width * lastResortScale);
  height = Math.round(height * lastResortScale);
  canvas.width = width;
  canvas.height = height;
  context.drawImage(img, 0, 0, width, height);

  const lastResort = canvas.toDataURL('image/jpeg', LAST_RESORT_QUALITY);
  if (lastResort.length > MAX_DATA_URL_LENGTH) {
    // D17: the ladder's last resort enforces the image cap or rejects; it never
    // returns an over-cap data URL for the caller to store.
    throw new ImageTooLargeError(lastResort.length);
  }
  return lastResort;
}
