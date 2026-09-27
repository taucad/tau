/**
 * PV-A26 (I37, PV-R12; RV1-F6): attachment records name stored bytes. Only an attachment store's `put` mints a
 * {@link StoredAttachmentRef}, and the row, draft and composer writers require one, so a plain content hash is refused.
 */

import { describe, expectTypeOf, it } from 'vitest';
import type { AttachmentStore } from '#db/attachment-store.js';
import type { EventFrom } from 'xstate';
import type { DraftAttachment, draftMachine } from '#hooks/draft.machine.js';
import { buildDraftMessage } from '#hooks/draft.machine.js';
import type { AttachmentReference, StoredAttachment, StoredAttachmentRef } from '#utils/attachment.utils.js';
import { buildUserMessage } from '#utils/chat.utils.js';

declare const plain: AttachmentReference;
declare const stored: StoredAttachmentRef;

describe('StoredAttachmentRef', () => {
  it('is minted by the store and required by every writer', () => {
    expectTypeOf<Awaited<ReturnType<AttachmentStore['put']>>>().toEqualTypeOf<StoredAttachment>();
    expectTypeOf<AttachmentReference>().not.toExtend<StoredAttachmentRef>();

    // The row writer.
    buildUserMessage({ text: 'ok', attachments: [stored] });
    // @ts-expect-error -- a plain content hash names no stored bytes.
    buildUserMessage({ text: 'refused', attachments: [plain] });

    // The composer writer.
    buildDraftMessage('ok', [stored]);
    // @ts-expect-error -- a plain content hash names no stored bytes.
    buildDraftMessage('refused', [plain]);

    // The draft writer: its only way in is the store's answer.
    expectTypeOf<DraftAttachment>().toEqualTypeOf<StoredAttachmentRef>();
    expectTypeOf<
      Extract<EventFrom<typeof draftMachine>, { type: 'attachmentStored' }>['attachment']
    >().toEqualTypeOf<StoredAttachment>();
  });
});
