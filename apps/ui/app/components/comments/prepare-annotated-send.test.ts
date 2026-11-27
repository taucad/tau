import { describe, expect, it, vi } from 'vitest';
import type { AnnotatedImage, MessageAnnotations } from '@taucad/chat/annotations';
import { attachmentUrl } from '@taucad/chat-ui/utils/attachment.utils';
import type { StoredAttachment, StoredAttachmentRef } from '@taucad/chat-ui/utils/attachment.utils';
import { prepareAnnotatedSend } from '#components/comments/prepare-annotated-send.js';
import type { DraftAttachmentBytes } from '#components/comments/prepare-annotated-send.js';

const stored = (letter: string, mediaType = 'image/webp'): StoredAttachment =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a test stand-in for what a store's `put` mints.
  ({ hash: letter.repeat(64), mediaType, byteLength: 10 }) as StoredAttachment;

const picture = stored('a');
const photo = stored('b', 'image/png');
const emptyPinPicture = stored('c');

const image = (id: string, attachment: StoredAttachmentRef, patch: Partial<AnnotatedImage> = {}): AnnotatedImage => ({
  id,
  attachment: attachmentUrl(attachment),
  width: 100,
  height: 100,
  marks: [],
  ...patch,
});

const draft: MessageAnnotations = {
  version: 1,
  nextNumber: 4,
  comments: [
    { number: 1, text: 'Round this edge', image: 'pin-picture', model: { point: [0, 0, 0], normal: [0, 0, 1] } },
    { number: 3, text: '   ', image: 'empty-pin-picture', model: { point: [0, 0, 0], normal: [0, 0, 1] } },
  ],
  images: [
    image('pin-picture', picture, { forPin: true }),
    image('empty-pin-picture', emptyPinPicture, { forPin: true }),
  ],
};

const bytesStore = (): DraftAttachmentBytes & { puts: string[] } => {
  const puts: string[] = [];
  return {
    puts,
    read: async (attachment) => new TextEncoder().encode(attachment.hash),
    async put(bytes, mediaType) {
      puts.push(new TextDecoder().decode(bytes));
      return stored('f', mediaType);
    },
  };
};

const flatten = vi.fn(async (source: { bytes: Uint8Array<ArrayBuffer>; mediaType: string }) => ({
  bytes: new TextEncoder().encode(`flat:${new TextDecoder().decode(source.bytes).slice(0, 1)}`),
  mediaType: 'image/webp',
}));

describe('prepareAnnotatedSend', () => {
  it('should send a flattened image in place of a commented one and keep its original', async () => {
    const store = bytesStore();

    const send = await prepareAnnotatedSend({
      attachments: [photo, picture, emptyPinPicture],
      annotations: draft,
      store,
      flatten,
    });

    expect(send.attachments.map((attachment) => attachment.hash[0])).toEqual(['b', 'f']);
    expect(store.puts).toEqual(['flat:a']);
    expect(send.originals).toEqual([picture]);
    expect(send.annotations?.images).toEqual([
      image('pin-picture', stored('f'), {
        forPin: true,
        source: { hash: picture.hash, mediaType: 'image/webp', byteLength: 10 },
      }),
    ]);
    expect(send.annotations?.comments.map(({ number }) => number)).toEqual([1]);
    expect(send.annotations?.nextNumber).toBeUndefined();
  });

  it('should send a draft without annotations exactly as it is', async () => {
    const send = await prepareAnnotatedSend({
      attachments: [photo],
      annotations: undefined,
      store: bytesStore(),
      flatten,
    });

    expect(send).toEqual({ attachments: [photo], annotations: undefined, originals: [] });
  });

  it('should leave an already flattened image alone', async () => {
    const store = bytesStore();
    const sent: MessageAnnotations = {
      version: 1,
      comments: [draft.comments[0]!],
      images: [image('pin-picture', picture, { source: { hash: 'e'.repeat(64), mediaType: 'image/webp' } })],
    };

    const send = await prepareAnnotatedSend({ attachments: [picture], annotations: sent, store, flatten });

    expect(store.puts).toEqual([]);
    expect(send.attachments).toEqual([picture]);
  });

  it('should refuse to send when an annotated image cannot be read', async () => {
    const store = { ...bytesStore(), read: async () => undefined };

    await expect(prepareAnnotatedSend({ attachments: [picture], annotations: draft, store, flatten })).rejects.toThrow(
      'could not be read',
    );
  });
});
