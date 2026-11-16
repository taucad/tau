/**
 * Composer intake: what a picked, dropped or pasted file is, read from its bytes (I1).
 *
 * `File.type` comes from the operating system's guess at the file name, so a
 * PNG saved as `photo.jpg` arrives as `image/jpeg`, and a JPEG from some
 * pickers arrives as `image/jpg`, `image/pjpeg` or `''`. The declared type
 * only decides whether the file is worth reading; the bytes decide what it is
 * stored and sent as.
 */

import { attachmentMedia, isAttachmentMediaType, sniffAttachmentMediaType } from '@taucad/agent-host/wire';
import type { AttachmentMediaType } from '@taucad/agent-host/wire';

/** The largest file intake reads; larger files are refused before any byte is read. */
export const attachmentIntakeMaxBytes = 64 * 1024 * 1024;

/** Declared types that browsers and pickers give JPEG files besides `image/jpeg`; `''` is "unknown". */
const looseDeclaredTypes: ReadonlySet<string> = new Set(['image/jpg', 'image/pjpeg', '']);

/**
 * Whether a file declared with this type may hold an attachment, and so is worth reading.
 *
 * @param declaredType - The file's `type`, as the browser reports it.
 * @returns `true` for a stored media type, a JPEG alias, or an unknown (empty) type.
 */
export const mayHoldAttachment = (declaredType: string): boolean =>
  isAttachmentMediaType(declaredType) || looseDeclaredTypes.has(declaredType);

/**
 * What the composer hands the draft: an image as a `data:` URL whose media
 * type is the one its bytes hold, a document as its bytes (S7).
 */
export type AttachmentIntakeSource =
  | string
  | { readonly bytes: Uint8Array<ArrayBuffer>; readonly mediaType: AttachmentMediaType };

/** The outcome of reading one file at intake. */
export type AttachmentIntake =
  | {
      readonly outcome: 'admitted';
      readonly kind: 'image' | 'document';
      readonly mediaType: AttachmentMediaType;
      readonly source: AttachmentIntakeSource;
    }
  | { readonly outcome: 'refused'; readonly reason: 'unsupported' | 'too-large' };

/**
 * Read a blob as a `data:` URL using `FileReader`.
 *
 * @param blob - The bytes to encode; the URL carries the blob's `type`.
 * @returns The `data:` URL.
 */
export const readFileAsDataUrl = async (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', (event) => {
      const result = event.target?.result;
      if (typeof result === 'string' && result !== '') {
        resolve(result);
      } else {
        reject(new Error('Invalid file read result'));
      }
    });
    reader.addEventListener('error', () => {
      reject(new Error('Failed to read file'));
    });
    reader.readAsDataURL(blob);
  });

/**
 * Read one picked, dropped or pasted file and label it from its bytes.
 *
 * A declared type that cannot hold an attachment (`text/plain`, `image/heic`)
 * and a file over {@link attachmentIntakeMaxBytes} are refused without reading.
 * Otherwise the whole file is read once, labelled with
 * `sniffAttachmentMediaType`, and refused when its bytes are not a stored
 * type. A WebP named `.jpg` is admitted as `image/webp`; a JPEG typed `''`
 * is admitted as `image/jpeg`.
 *
 * @param file - The file the user chose.
 * @returns The admitted source and its media type, or the reason it was refused.
 * @throws When the file cannot be read.
 */
export const readAttachmentFile = async (file: File): Promise<AttachmentIntake> => {
  if (!mayHoldAttachment(file.type)) {
    return { outcome: 'refused', reason: 'unsupported' };
  }
  if (file.size > attachmentIntakeMaxBytes) {
    return { outcome: 'refused', reason: 'too-large' };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mediaType = sniffAttachmentMediaType(bytes);
  if (mediaType === undefined) {
    return { outcome: 'refused', reason: 'unsupported' };
  }
  const { kind } = attachmentMedia[mediaType];
  if (kind === 'document') {
    return { outcome: 'admitted', kind, mediaType, source: { bytes, mediaType } };
  }
  // A re-typed copy, so the `data:` URL names what the bytes are rather than what the file claimed.
  const dataUrl = await readFileAsDataUrl(new File([bytes], file.name, { type: mediaType }));
  return { outcome: 'admitted', kind, mediaType, source: dataUrl };
};
