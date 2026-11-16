/**
 * The media Tau stores and sends as a chat attachment, and the one way to name it: from the bytes (I1).
 *
 * A declared type, a file name or an extension can say anything; Anthropic
 * refuses PNG bytes declared `image/jpeg`, and a chat that stored them could
 * not be resumed. Every host labels attachment bytes with
 * {@link sniffAttachmentMediaType}, on intake and again on every read.
 */

import { imageFormats, probeImage } from '@taucad/utils/image-probe';

/**
 * The media types an attachment may be stored and sent as, each with its
 * extensions, canonical (the one a stored file is named with) first.
 *
 * GIF stays so that chats which already hold one still load.
 *
 * @public
 */
export const attachmentMedia = {
  'image/jpeg': { kind: 'image', extensions: imageFormats.jpeg.extensions },
  'image/png': { kind: 'image', extensions: imageFormats.png.extensions },
  'image/webp': { kind: 'image', extensions: imageFormats.webp.extensions },
  'image/gif': { kind: 'image', extensions: imageFormats.gif.extensions },
  'application/pdf': { kind: 'document', extensions: ['pdf'] },
} as const satisfies Record<
  string,
  { readonly kind: 'image' | 'document'; readonly extensions: readonly [string, ...string[]] }
>;

/**
 * A media type Tau stores and sends as an attachment.
 *
 * @public
 */
export type AttachmentMediaType = keyof typeof attachmentMedia;

/**
 * Whether a media type is one Tau stores and sends as an attachment.
 *
 * @param mediaType - Any media type string.
 * @returns `true` for a key of {@link attachmentMedia}.
 * @public
 */
export const isAttachmentMediaType = (mediaType: string): mediaType is AttachmentMediaType =>
  Object.hasOwn(attachmentMedia, mediaType);

const pdfSignature = [0x25, 0x50, 0x44, 0x46, 0x2d] as const; // `%PDF-`

/**
 * The attachment media type the bytes themselves say they are.
 *
 * Reads only signatures and headers. An image whose header does not parse, a
 * format Tau does not store (HEIC, AVIF, TIFF and the like) and anything that
 * is neither an image nor a PDF give `undefined`; the caller decides whether
 * to refuse or to keep a recorded label.
 *
 * @param bytes - The decoded attachment payload, whatever type it was declared as.
 * @returns The stored media type the bytes hold, or `undefined`.
 * @public
 */
export const sniffAttachmentMediaType = (bytes: Uint8Array<ArrayBuffer>): AttachmentMediaType | undefined => {
  if (pdfSignature.every((byte, index) => bytes[index] === byte)) {
    return 'application/pdf';
  }
  const probe = probeImage(bytes);
  const mediaType = probe === undefined ? undefined : imageFormats[probe.format].mediaType;
  return mediaType !== undefined && isAttachmentMediaType(mediaType) ? mediaType : undefined;
};
