import { annotationsOf } from '@taucad/chat/annotations';
import type { AnnotatedImage, MessageAnnotations } from '@taucad/chat/annotations';
import type { MyUIMessage } from '@taucad/chat';
import { attachmentReferenceOf, attachmentUrl } from '#utils/attachment.utils.js';
import type { StoredAttachmentRef } from '#utils/attachment.utils.js';

/** The stored original a flattened image keeps a hold on. */
const sourceOf = (image: AnnotatedImage): StoredAttachmentRef | undefined =>
  image.source === undefined
    ? undefined
    : attachmentReferenceOf({
        url: attachmentUrl(image.source),
        mediaType: image.source.mediaType,
        ...(image.source.filename === undefined ? {} : { filename: image.source.filename }),
      });

/**
 * Every stored attachment a message holds: its file parts, and the untouched originals of its flattened images
 * (comment pins charter I1). Whatever keeps, copies or returns a message's bytes reads them through this, so an edit
 * can always start again from the originals.
 *
 * @param message - A stored message.
 * @returns Its attachment references, each once.
 */
export function attachmentReferencesOf(message: Pick<MyUIMessage, 'parts' | 'metadata'>): StoredAttachmentRef[] {
  const references = new Map<string, StoredAttachmentRef>();
  for (const part of message.parts) {
    const reference = part.type === 'file' ? attachmentReferenceOf(part) : undefined;
    if (reference !== undefined) {
      references.set(attachmentUrl(reference), reference);
    }
  }
  for (const image of annotationsOf(message.metadata)?.images ?? []) {
    const source = sourceOf(image);
    if (source !== undefined && !references.has(attachmentUrl(source))) {
      references.set(attachmentUrl(source), source);
    }
  }
  return [...references.values()];
}

/** A message's attachments and annotations as a draft edits them. */
export type EditableAnnotated = {
  attachments: StoredAttachmentRef[];
  annotations: MessageAnnotations | undefined;
};

/**
 * A sent message's attachments and annotations as a draft edits them: each flattened image gives its place back to
 * its untouched original, so comments and marks are drawn once more at the next send and never twice.
 *
 * @param attachments - The message's attachments.
 * @param annotations - The message's annotations.
 * @returns The same attachments and record when nothing was flattened.
 */
export function unflattened(
  attachments: readonly StoredAttachmentRef[],
  annotations: MessageAnnotations | undefined,
): EditableAnnotated {
  if (annotations?.images.some((image) => image.source !== undefined) !== true) {
    return { attachments: [...attachments], annotations };
  }
  const originals = new Map<string, StoredAttachmentRef>();
  const images = annotations.images.map((image) => {
    const original = sourceOf(image);
    if (original === undefined || image.attachment === undefined) {
      return image;
    }
    originals.set(image.attachment, original);
    const { source: _flattenedFrom, ...rest } = image;
    return { ...rest, attachment: attachmentUrl(original) };
  });
  return {
    attachments: attachments.map((attachment) => originals.get(attachmentUrl(attachment)) ?? attachment),
    annotations: { ...annotations, images },
  };
}
