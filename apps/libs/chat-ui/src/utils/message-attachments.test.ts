import { describe, expect, it } from 'vitest';
import type { MessageAnnotations } from '@taucad/chat/annotations';
import type { MyUIMessage } from '@taucad/chat';
import { attachmentReferenceOf, attachmentUrl } from '#utils/attachment.utils.js';
import type { StoredAttachmentRef } from '#utils/attachment.utils.js';
import { attachmentReferencesOf, unflattened } from '#utils/message-attachments.js';

const hashOf = (digit: string): string => digit.repeat(64);

const stored = (digit: string, mediaType = 'image/webp'): StoredAttachmentRef =>
  attachmentReferenceOf({ url: `attachments/${hashOf(digit)}.webp`, mediaType })!;

const flattened = stored('f');
const original = stored('a');
const plain = stored('b');

const sent: MessageAnnotations = {
  version: 1,
  comments: [{ number: 1, text: 'Taller', image: 'img-1', model: { point: [0, 0, 0] } }],
  images: [
    {
      id: 'img-1',
      attachment: attachmentUrl(flattened),
      source: { hash: original.hash, mediaType: original.mediaType },
      width: 4,
      height: 3,
      marks: [],
    },
  ],
};

const message = (annotations?: MessageAnnotations): Pick<MyUIMessage, 'parts' | 'metadata'> => ({
  parts: [
    { type: 'text', text: 'Look' },
    { type: 'file', mediaType: 'image/webp', url: attachmentUrl(flattened) },
    { type: 'file', mediaType: 'image/webp', url: attachmentUrl(plain) },
  ],
  metadata: { createdAt: 1, status: 'pending', ...(annotations === undefined ? {} : { annotations }) },
});

describe('attachmentReferencesOf', () => {
  it("should name a message's file parts and the originals of its flattened images, each once", () => {
    expect(attachmentReferencesOf(message(sent)).map((reference) => reference.hash)).toEqual([
      flattened.hash,
      plain.hash,
      original.hash,
    ]);
  });

  it('should name only the file parts of a message without annotations', () => {
    expect(attachmentReferencesOf(message()).map((reference) => reference.hash)).toEqual([flattened.hash, plain.hash]);
  });
});

describe('unflattened', () => {
  it('should put each original back where its flattened image stood and forget the source', () => {
    const editable = unflattened([flattened, plain], sent);

    expect(editable.attachments.map((attachment) => attachment.hash)).toEqual([original.hash, plain.hash]);
    expect(editable.annotations?.images).toEqual([
      { id: 'img-1', attachment: attachmentUrl(original), width: 4, height: 3, marks: [] },
    ]);
    expect(editable.annotations?.comments).toEqual(sent.comments);
  });

  it('should leave a draft that was never flattened as it is', () => {
    const draft: MessageAnnotations = {
      ...sent,
      images: [{ id: 'img-1', attachment: attachmentUrl(plain), width: 4, height: 3, marks: [] }],
    };

    expect(unflattened([plain], draft)).toEqual({ attachments: [plain], annotations: draft });
    expect(unflattened([plain], undefined)).toEqual({ attachments: [plain], annotations: undefined });
  });
});
