/**
 * The media Tau stores and sends as a chat attachment: the one stored-media table (I2) and the pure helpers derived
 * from it.
 *
 * It lives here, in the private bundled utilities, so that a package which only needs the table (such as
 * `@taucad/revisions`' attachment path pattern) bundles it without depending on `@taucad/agent-host`.
 * `@taucad/agent-host/wire` re-exports every name, and labelling, sniffing and the storage policy stay there.
 */

import { imageFormats } from '#image-probe.js';

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

/**
 * Every stored media type, in {@link attachmentMedia} order.
 *
 * @public
 */
export const attachmentMediaTypes: readonly AttachmentMediaType[] = Object.keys(attachmentMedia).filter((mediaType) =>
  isAttachmentMediaType(mediaType),
);

/**
 * A stored media type whose kind is `image`.
 *
 * @public
 */
export type AttachmentImageMediaType = {
  readonly [Type in AttachmentMediaType]: (typeof attachmentMedia)[Type]['kind'] extends 'image' ? Type : never;
}[AttachmentMediaType];

const isAttachmentImageMediaType = (mediaType: AttachmentMediaType): mediaType is AttachmentImageMediaType =>
  attachmentMedia[mediaType].kind === 'image';

/**
 * Every stored image media type, in {@link attachmentMedia} order, for schemas and data-URL checks.
 *
 * @public
 */
export const attachmentImageMediaTypes: readonly AttachmentImageMediaType[] = attachmentMediaTypes.filter((mediaType) =>
  isAttachmentImageMediaType(mediaType),
);

/**
 * The extension a stored attachment of this media type is named with: the first of its {@link attachmentMedia} extensions.
 *
 * @param mediaType - A stored media type.
 * @returns The canonical extension, without a dot.
 * @public
 */
export const attachmentExtensionOf = (mediaType: AttachmentMediaType): string =>
  attachmentMedia[mediaType].extensions[0];

/**
 * The canonical extension of every stored media type, in {@link attachmentMedia} order.
 *
 * Path patterns that admit `attachments/<sha256>.<ext>` are built from this list, so a type added to the table is
 * admitted everywhere at once.
 *
 * @public
 */
export const attachmentExtensions: readonly string[] = Object.values(attachmentMedia).map(
  (media) => media.extensions[0],
);
