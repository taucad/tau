import type { MessageAnnotations } from '@taucad/chat/annotations';
import { attachmentUrl } from '@taucad/chat-ui/utils/attachment.utils';
import type { StoredAttachment, StoredAttachmentRef } from '@taucad/chat-ui/utils/attachment.utils';
import { sendableAnnotations } from '#components/comments/draft-comments.js';
import type { flattenImage, ImageBytes } from '#components/comments/flatten-image.js';

/** The draft's attachment bytes, as the send step reads and writes them. */
export type DraftAttachmentBytes = Readonly<{
  read: (attachment: StoredAttachmentRef) => Promise<Uint8Array<ArrayBuffer> | undefined>;
  put: (bytes: Uint8Array<ArrayBuffer>, mediaType: string, filename?: string) => Promise<StoredAttachment>;
}>;

/** What a message with annotations is sent with. */
export type AnnotatedSend = Readonly<{
  /** The message's attachments: a flattened image stands where its original stood. */
  attachments: readonly StoredAttachmentRef[];
  annotations: MessageAnnotations | undefined;
  /** The untouched originals of the flattened images: kept with the chat, never sent to the model. */
  originals: readonly StoredAttachmentRef[];
}>;

/**
 * Turns a draft's attachments and annotations into what is sent (charter D8): each image with pins or marks is
 * flattened into a new attachment that takes its place, and its original is kept and named by `source`. A comment
 * without words stays behind, with a picture taken only for it.
 *
 * @param input - The draft's attachments and annotations, its attachment bytes and the painter.
 * @returns The attachments and annotations to send, and the originals to keep.
 * @throws When an annotated image's bytes are gone; nothing should be sent then.
 */
export async function prepareAnnotatedSend(input: {
  readonly attachments: readonly StoredAttachmentRef[];
  readonly annotations: MessageAnnotations | undefined;
  readonly store: DraftAttachmentBytes;
  readonly flatten: typeof flattenImage;
}): Promise<AnnotatedSend> {
  if (input.annotations === undefined) {
    return { attachments: input.attachments, annotations: undefined, originals: [] };
  }
  const { annotations: sendable, orphanedAttachments } = sendableAnnotations(input.annotations);
  const left = new Set(orphanedAttachments);
  const attachments = input.attachments.filter((attachment) => !left.has(attachmentUrl(attachment)));
  const originals: StoredAttachmentRef[] = [];
  const images = [];
  for (const image of sendable.images) {
    const index = attachments.findIndex((attachment) => attachmentUrl(attachment) === image.attachment);
    const original = attachments[index];
    const hasPins = sendable.comments.some((comment) => comment.image === image.id);
    // An image already flattened (an edit of a sent message) keeps the picture it was sent with.
    if (original === undefined || image.source !== undefined || (!hasPins && image.marks.length === 0)) {
      images.push(image);
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- a message carries at most eight images; one at a time bounds memory.
    const bytes = await input.store.read(original);
    if (bytes === undefined) {
      throw new Error('An image with comments could not be read, so the message was not sent.');
    }
    const source: ImageBytes = { bytes, mediaType: original.mediaType };
    // oxlint-disable-next-line no-await-in-loop -- as above.
    const flattened = await input.flatten(source, image, sendable.comments);
    // oxlint-disable-next-line no-await-in-loop -- as above.
    const stored = await input.store.put(flattened.bytes, flattened.mediaType, original.filename);
    attachments[index] = stored;
    originals.push(original);
    images.push({
      ...image,
      attachment: attachmentUrl(stored),
      source: {
        hash: original.hash,
        mediaType: original.mediaType,
        ...(original.filename === undefined ? {} : { filename: original.filename }),
        ...(original.byteLength === undefined ? {} : { byteLength: original.byteLength }),
      },
    });
  }
  const annotations = { ...sendable, images };
  return {
    attachments,
    annotations: annotations.comments.length > 0 || annotations.images.length > 0 ? annotations : undefined,
    originals,
  };
}
