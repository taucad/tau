/**
 * The composer-record plumbing `ChatSessionStore` binds each chat to
 * (blueprint W7, D7, D9): a record store that waits for the chat's project,
 * the drain that lets a closing chat keep its last keystroke, and the
 * attachment references a draft still holds.
 */

import type { ActorRefFrom } from 'xstate';
import type { MyUIMessage } from '@taucad/chat';
import type { composerRecordMachine } from '#machines/composer-record.machine.js';
import type { ComposerRecordStore } from '#db/composer-record-store.js';
import type { AttachmentStore } from '#db/attachment-store.js';
import { attachmentUrl, isAttachmentUrl } from '#utils/attachment.utils.js';
import type { AttachmentName } from '#utils/attachment.utils.js';

type ComposerRecordRef = ActorRefFrom<typeof composerRecordMachine>;

/** The parts of the draft machine's context that reference attachments. */
type DraftReferences = {
  readonly draftAttachments: readonly AttachmentName[];
  readonly editDraftAttachments: readonly AttachmentName[];
  readonly messageEdits: Readonly<Record<string, MyUIMessage>>;
};

/** Where one chat's composer lives, once its project is known. */
export type ComposerBinding = {
  readonly projectId: string;
  readonly record: ComposerRecordStore;
  /** The chat's own `.tau/chats/<chatId>/attachments`, where sent bytes live (D13). */
  readonly chatAttachments: AttachmentStore;
};

/** One project's unread record (D9) and the live set the store keeps beside it. */
export type UnreadRecord = {
  readonly ref: ComposerRecordRef;
  readonly chats: Set<string>;
  /** Cleared before the record was read, so the read must not bring them back. */
  readonly clearedBeforeLoad: Set<string>;
  loaded: boolean;
};

/**
 * A record store whose I/O waits for the chat's project to be known.
 *
 * The record actor and the draft actor exist before the chat row has said which
 * project it belongs to, and the acquire-time project can be a stale focus. So
 * the machine starts at once and its read and writes resolve against the real
 * path once `bound` does; a patch made before that is held by the record
 * machine, not lost.
 *
 * A chat with no project (`undefined`) has nowhere to keep a composer: its
 * record reads as absent and its record writes are dropped, so an ownerless
 * draft lives in memory without a failure to report. Attachment bytes still
 * fail, because a draft cannot hold an attachment it has nowhere to store.
 *
 * @param bound - Settles with the chat's binding, or `undefined` for none.
 * @returns A store that delegates to the bound one.
 */
export const deferredRecordStore = (bound: Promise<ComposerBinding | undefined>): ComposerRecordStore => {
  const record = async (): Promise<ComposerRecordStore> => {
    const binding = await bound;
    if (binding === undefined) {
      throw new Error('This chat belongs to no project, so its composer is not saved.');
    }
    return binding.record;
  };
  const attachments = async (): Promise<AttachmentStore> => {
    const store = await record();
    return store.attachments;
  };
  return {
    async read() {
      const binding = await bound;
      return binding === undefined ? { status: 'absent' } : binding.record.read();
    },
    async patch(fields) {
      const binding = await bound;
      await binding?.record.patch(fields);
    },
    async remove() {
      const binding = await bound;
      await binding?.record.remove();
    },
    attachments: {
      async put(bytes, mediaType, filename) {
        const store = await attachments();
        return store.put(bytes, mediaType, filename);
      },
      async read(ref) {
        const store = await attachments();
        return store.read(ref);
      },
      async has(ref) {
        const store = await attachments();
        return store.has(ref);
      },
      async copyTo(target, attachment) {
        const store = await attachments();
        return store.copyTo(target, attachment);
      },
      async remove(ref) {
        const store = await attachments();
        return store.remove(ref);
      },
      async retainOnly(referenced) {
        const store = await attachments();
        return store.retainOnly(referenced);
      },
      async removeAll() {
        const store = await attachments();
        return store.removeAll();
      },
    },
  };
};

/**
 * Stop a record actor once no write is on the wire, so a closing chat keeps
 * its last keystroke. A retrying write is abandoned; it is failing anyway.
 *
 * @param ref - The record actor to stop.
 */
export const stopWhenWritesSettle = async (ref: ComposerRecordRef): Promise<void> => {
  const settled = (snapshot: ReturnType<ComposerRecordRef['getSnapshot']>): boolean =>
    snapshot.status !== 'active' || !snapshot.matches({ writes: 'persisting' });
  if (!settled(ref.getSnapshot())) {
    await new Promise<void>((resolve) => {
      const subscription = ref.subscribe((snapshot) => {
        if (settled(snapshot)) {
          subscription.unsubscribe();
          resolve();
        }
      });
    });
  }
  ref.stop();
};

/**
 * Remove a record through its actor and wait for the actor to finish (D11).
 * `removed` is terminal, so the actor drops every patch sent afterwards.
 *
 * @param ref - The record actor whose record is going away.
 */
export const removeRecord = async (ref: ComposerRecordRef): Promise<void> => {
  if (ref.getSnapshot().status !== 'active') {
    return;
  }
  const finished = new Promise<void>((resolve) => {
    const subscription = ref.subscribe({
      next: (snapshot) => {
        if (snapshot.status !== 'active') {
          subscription.unsubscribe();
          resolve();
        }
      },
      complete: resolve,
    });
  });
  ref.send({ type: 'remove' });
  await finished;
};

/**
 * Every attachment reference a draft context still holds: the draft, the open
 * edit and the saved edits. `retainOnly` keeps exactly these.
 *
 * @param context - The draft machine's context.
 * @returns The `attachments/…` URLs still referenced.
 */
export const referencedAttachments = (context: DraftReferences): string[] => [
  ...[...context.draftAttachments, ...context.editDraftAttachments].map((attachment) => attachmentUrl(attachment)),
  ...Object.values(context.messageEdits).flatMap((edit) =>
    edit.parts.flatMap((part) => (part.type === 'file' && isAttachmentUrl(part.url) ? [part.url] : [])),
  ),
];
