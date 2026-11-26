import type { AnnotatedImage, AnnotationComment } from '@taucad/chat/annotations';
import { drawAnnotations, pinsOnImage } from '#components/comments/annotation-painter.js';

/** An image's bytes and what they are. */
export type ImageBytes = { bytes: Uint8Array<ArrayBuffer>; mediaType: string };

/**
 * Paints an image's marks and pins into a copy of it: the image the model reads. The original is left as it was.
 *
 * @param source - The untouched image.
 * @param image - Its annotations.
 * @param comments - The message's comments; the ones pinned on this image are drawn.
 * @returns The flattened image, as WebP where the browser encodes it and PNG otherwise.
 */
export async function flattenImage(
  source: ImageBytes,
  image: AnnotatedImage,
  comments: readonly AnnotationComment[],
): Promise<ImageBytes> {
  const bitmap = await createImageBitmap(new Blob([source.bytes], { type: source.mediaType }));
  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('This browser could not draw on the image.');
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  // Drawn at the image's real size: a stored record's size is what was asked for, not always what was delivered.
  drawAnnotations(context, { width, height }, image.marks, pinsOnImage({ ...image, width, height }, comments));
  // A browser that cannot encode WebP answers with PNG, which the attachment store takes as well.
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.92 });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mediaType: blob.type };
}
