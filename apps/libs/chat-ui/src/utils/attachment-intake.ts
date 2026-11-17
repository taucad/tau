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
import { detectImageFormat, imageFormats, probeImage } from '@taucad/utils/image-probe';
import type { ImageFormat } from '@taucad/utils/image-probe';

/** The largest file intake reads; larger files are refused before any byte is read. */
export const attachmentIntakeMaxBytes = 64 * 1024 * 1024;

/**
 * Declared types that say nothing about what a file holds: none at all, or a generic binary type. Some browsers and
 * pickers type a `.heic` photo or a `.psd` as `application/octet-stream`, so these are read and their bytes decide,
 * exactly as for an empty type.
 */
const unknownDeclaredTypes: ReadonlySet<string> = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

/** Declared types that browsers and pickers give JPEG files besides `image/jpeg`. */
const jpegAliasDeclaredTypes: ReadonlySet<string> = new Set(['image/jpg', 'image/pjpeg']);

/**
 * Whether a declared type says nothing about what the file holds, so only its bytes can.
 *
 * @param declaredType - The file's `type`, as the browser reports it.
 * @returns `true` for an empty type or a generic binary type such as `application/octet-stream`.
 */
export const isUnknownDeclaredType = (declaredType: string): boolean => unknownDeclaredTypes.has(declaredType);

/**
 * Whether a file declared with this type may hold an attachment, and so is worth reading.
 *
 * Any `image/*` type is read, so its bytes can name the format in a refusal ("HEIC images can't be attached") or be
 * converted when the host has an edge for it.
 *
 * @param declaredType - The file's `type`, as the browser reports it.
 * @returns `true` for a stored media type, any image type, a JPEG alias, or an unknown or generic type.
 */
export const mayHoldAttachment = (declaredType: string): boolean =>
  isAttachmentMediaType(declaredType) ||
  declaredType.startsWith('image/') ||
  jpegAliasDeclaredTypes.has(declaredType) ||
  isUnknownDeclaredType(declaredType);

/**
 * What the composer hands the draft: an image as a `data:` URL whose media
 * type is the one its bytes hold, a document as its bytes (S7).
 */
export type AttachmentIntakeSource =
  | string
  | { readonly bytes: Uint8Array<ArrayBuffer>; readonly mediaType: AttachmentMediaType };

/**
 * Why intake refused a file, in the storage policy's vocabulary (`AttachmentRefusalReason`).
 *
 * - `not-an-image`: neither an image nor a PDF, by its declared type or its bytes.
 * - `unsupported-format`: an image format this host neither stores nor converts; `format` names it.
 * - `unreadable`: the signature names an image format but its header is damaged.
 * - `too-large`: over {@link attachmentIntakeMaxBytes}, refused before any byte is read.
 */
export type AttachmentIntakeRefusalReason = 'not-an-image' | 'unsupported-format' | 'unreadable' | 'too-large';

/** A file intake refused, with the format its bytes hold when they were read and recognised. */
export type AttachmentIntakeRefusal = {
  readonly outcome: 'refused';
  readonly reason: AttachmentIntakeRefusalReason;
  readonly format?: ImageFormat;
};

/** The outcome of reading one file at intake. */
export type AttachmentIntake =
  | {
      readonly outcome: 'admitted';
      readonly kind: 'image' | 'document';
      /** A stored media type, or the media type of an image format the host converts. */
      readonly mediaType: string;
      readonly source: AttachmentIntakeSource;
    }
  | AttachmentIntakeRefusal;

/** What this host can convert at intake. */
export type AttachmentIntakeOptions = {
  /**
   * The image formats the host converts to a stored type: `deriveTranscodeSources(runtime, 'jpeg')` over the
   * host's runtime definition. A format outside it, and outside the stored set, is refused by name.
   */
  readonly transcodeSources?: readonly string[];
};

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

/** A `data:` URL of the bytes, labelled with the type they hold rather than the one the file claimed. */
const dataUrlOf = async (bytes: Uint8Array<ArrayBuffer>, name: string, mediaType: string): Promise<string> =>
  readFileAsDataUrl(new File([bytes], name, { type: mediaType }));

const refused = (reason: AttachmentIntakeRefusalReason, format?: ImageFormat): AttachmentIntakeRefusal => ({
  outcome: 'refused',
  reason,
  ...(format === undefined ? {} : { format }),
});

/**
 * Read one picked, dropped or pasted file and label it from its bytes.
 *
 * A declared type that cannot hold an attachment (`text/plain`, `application/zip`) and a file over
 * {@link attachmentIntakeMaxBytes} are refused without reading; an empty or generic type
 * (`application/octet-stream`) is read like any other. Otherwise the whole file is read once and labelled
 * from its bytes (I1):
 *
 * - bytes of a stored type are admitted under it: a WebP named `.jpg` as `image/webp`, a JPEG typed `''` as
 *   `image/jpeg`;
 * - an image whose format is in `transcodeSources` is admitted under its own media type, for the draft's
 *   conversion step;
 * - any other image is refused with its format, and anything else as `not-an-image`.
 *
 * @param file - The file the user chose.
 * @param options - The formats this host converts.
 * @returns The admitted source and its media type, or the reason it was refused.
 * @throws When the file cannot be read.
 */
export const readAttachmentFile = async (
  file: File,
  options: AttachmentIntakeOptions = {},
): Promise<AttachmentIntake> => {
  if (!mayHoldAttachment(file.type)) {
    return refused('not-an-image');
  }
  if (file.size > attachmentIntakeMaxBytes) {
    return refused('too-large');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mediaType = sniffAttachmentMediaType(bytes);
  if (mediaType !== undefined) {
    const { kind } = attachmentMedia[mediaType];
    return kind === 'document'
      ? { outcome: 'admitted', kind, mediaType, source: { bytes, mediaType } }
      : { outcome: 'admitted', kind, mediaType, source: await dataUrlOf(bytes, file.name, mediaType) };
  }
  const format = detectImageFormat(bytes);
  if (format === undefined) {
    return refused('not-an-image');
  }
  if (probeImage(bytes) === undefined) {
    return refused('unreadable', format);
  }
  if (!(options.transcodeSources ?? []).includes(format)) {
    return refused('unsupported-format', format);
  }
  const converted = imageFormats[format].mediaType;
  return {
    outcome: 'admitted',
    kind: 'image',
    mediaType: converted,
    source: await dataUrlOf(bytes, file.name, converted),
  };
};
