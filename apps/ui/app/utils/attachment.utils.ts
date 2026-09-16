/**
 * Content-addressed attachment identity (blueprint D12/D17).
 *
 * An attachment is bytes named by their SHA-256 and referenced as
 * `attachments/<sha256>.<ext>`, relative to the directory of the record or log
 * that holds the reference. This module owns the naming, the URL shape and the
 * per-kind size caps; `#db/attachment-store.js` owns the bytes.
 */

/** Images are sent to the model inline; documents are materialised per provider. */
export type AttachmentKind = 'image' | 'document';

/** The part of an attachment its stored name is derived from. */
export type AttachmentName = Pick<Attachment, 'hash' | 'mediaType'>;

/** A stored attachment. `hash` is the lowercase hex SHA-256 of the bytes. */
export type Attachment = {
  readonly hash: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly filename?: string;
};

/**
 * The media types this wave stores, and the extension each one is written as.
 * A type outside this table is refused at ingest rather than mapped to a
 * generic extension.
 */
const attachmentExtensions = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
} as const;

/** A media type the attachment store accepts. */
export type SupportedAttachmentMediaType = keyof typeof attachmentExtensions;

/** Every media type the attachment store accepts, for composer `accept` lists and validation. */
export const supportedAttachmentMediaTypes = Object.keys(
  attachmentExtensions,
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Object.keys widens the literal union to string
) as readonly SupportedAttachmentMediaType[];

/** Whether the attachment store will accept bytes of this media type. */
export const isSupportedAttachmentMediaType = (mediaType: string): mediaType is SupportedAttachmentMediaType =>
  mediaType in attachmentExtensions;

/** `application/pdf` is the only document type in this wave; everything else stored is an image. */
export const attachmentKind = (mediaType: string): AttachmentKind =>
  mediaType.startsWith('image/') ? 'image' : 'document';

/**
 * The file name an attachment is written under.
 *
 * Takes only the fields the name is made of: a reference read back from a file
 * part names its hash and media type but has no byte length to offer.
 *
 * @throws When `mediaType` is unsupported. Only store-produced attachments are
 *   passed here, and the store refuses an unsupported type before writing.
 */
export const attachmentFileName = (attachment: AttachmentName): string => {
  if (!isSupportedAttachmentMediaType(attachment.mediaType)) {
    throw new Error(`Unsupported attachment type: ${attachment.mediaType}`);
  }
  return `${attachment.hash}.${attachmentExtensions[attachment.mediaType]}`;
};

/** The reference stored in a file part or log row, relative to the owning directory. */
export const attachmentUrl = (attachment: AttachmentName): string => `attachments/${attachmentFileName(attachment)}`;

/** Cap after processing: images 4 MiB (captures included), documents 20 MiB (D17). */
export const attachmentCapBytes = (kind: AttachmentKind): number => (kind === 'image' ? 4 : 20) * 1024 * 1024;

const attachmentDirectory = 'attachments/';
const attachmentFileNamePattern = /^[\da-f]{64}\.(?:jpg|png|webp|gif|pdf)$/;

/** Whether a URL is an attachment reference, as opposed to a `data:` URL or anything else. */
export const isAttachmentUrl = (url: string): boolean =>
  url.startsWith(attachmentDirectory) && attachmentFileNamePattern.test(url.slice(attachmentDirectory.length));
