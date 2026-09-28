/**
 * The composer-record plumbing `ChatSessionStore` binds each chat to
 * (blueprint W7, D7, D9): a record store that waits for the chat's project,
 * the drain that lets a closing chat keep its last keystroke, and the
 * attachment references a draft still holds.
 */

import type { MyUIMessage } from '@taucad/chat';
import type { RowKey } from '@taucad/agent-host';
import type { Actor } from 'xstate';
import type { composerRecordMachine } from '#machines/composer-record.machine.js';
import type { ComposerRecordStore } from '#db/composer-record-store.js';
import type { AttachmentStore } from '#db/attachment-store.js';
import { AgentHostWorkerError } from '#services/agent-host-client.js';
import { attachmentUrl, isAttachmentUrl } from '#utils/attachment.utils.js';
import type { AttachmentName } from '#utils/attachment.utils.js';

type ComposerRecordRef = Actor<typeof composerRecordMachine>;

/** Maximum wait for a chat row to name the project holding its composer. */
const composerBindingTimeout = 30_000;

const awaitComposerBinding = async (
  bound: Promise<ComposerBinding | undefined>,
): Promise<ComposerBinding | undefined> => {
  const expired = Promise.withResolvers<never>();
  const timer = globalThis.setTimeout(() => {
    expired.reject(
      new AgentHostWorkerError(
        'COMPOSER_BINDING_TIMEOUT',
        'This chat never found the project its draft is saved in. Reload the page and try again.',
      ),
    );
  }, composerBindingTimeout);
  try {
    return await Promise.race([bound, expired.promise]);
  } finally {
    globalThis.clearTimeout(timer);
  }
};

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

/** One project's read receipts (D9, W9 PV-S8) and the live copy the store keeps beside them. */
export type UnreadRecord = {
  readonly ref: ComposerRecordRef;
  /** Each chat's read receipt: the attention row the person last saw. */
  readonly readThrough: Map<string, RowKey>;
  /** Legacy `unread: true` marks: receipts that match no row, cleared when the chat is viewed. */
  readonly legacy: Set<string>;
  /** Chats viewed or removed before the record was read, so the read must not bring their old entries back. */
  readonly changedBeforeLoad: Set<string>;
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
 * Nothing this store does can outlast the composer's wait bound. `bound`
 * is settled by a peer — the chat row that names the owning project, behind a
 * released predecessor's drain — and an unbounded wait on it left the record
 * machine in `loading` for the life of the page: the saved draft never came
 * back, every keystroke queued behind a write that never started, and not one
 * of them was ever reported. Past the bound the read fails like any other
 * unreadable record, so the composer turns usable and says so (D7).
 *
 * @param bound - Settles with the chat's binding, or `undefined` for none.
 * @returns A store that delegates to the bound one.
 */
export const deferredRecordStore = (bound: Promise<ComposerBinding | undefined>): ComposerRecordStore => {
  const binding = async (): Promise<ComposerBinding | undefined> => awaitComposerBinding(bound);
  const record = async (): Promise<ComposerRecordStore> => {
    const owner = await binding();
    if (owner === undefined) {
      throw new Error('This chat belongs to no project, so its composer is not saved.');
    }
    return owner.record;
  };
  const attachments = async (): Promise<AttachmentStore> => {
    const store = await record();
    return store.attachments;
  };
  return {
    async read() {
      const owner = await binding();
      return owner === undefined ? { status: 'absent' } : owner.record.read();
    },
    async patch(fields) {
      const owner = await binding();
      await owner?.record.patch(fields);
    },
    async remove() {
      const owner = await binding();
      await owner?.record.remove();
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
