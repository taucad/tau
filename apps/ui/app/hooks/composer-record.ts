/**
 * The one seam between a composer surface and its durable record (blueprint
 * §"The seam").
 *
 * A surface that wants persistence needs a path, a `useComposerRecord` (or a
 * `createComposerRecordActor` off React) and a `draftPersistenceFor`. Before
 * this, three surfaces bound the same draft machine three different ways —
 * no-ops for the marketing composer, an in-actor try/catch for Home, and
 * closures with no failure handling for the chat session — so only one of them
 * could ever report a write that failed.
 *
 * The actors handed to `draftMachine` here `send` and resolve immediately: the
 * draft machine's `persisting` state is a hand-off, and the record machine owns
 * the write, its coalescing and its retry curve from that point on.
 */

import { useMemo } from 'react';
import { useActorRef } from '@xstate/react';
import { createActor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { MyUIMessage } from '@taucad/chat';
import type { ChatMode } from '@taucad/chat/constants';
import type { ComposerRecord, ComposerRecordStore } from '#db/composer-record-store.js';
import { createEmptyDraftMessage } from '#hooks/draft.machine.js';
import type { DraftHydration } from '#hooks/draft.machine.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { composerRecordActors, composerRecordMachine } from '#machines/composer-record.machine.js';
import type { Attachment } from '#utils/attachment.utils.js';

/** A running record actor, as every consumer of this seam holds it. */
export type ComposerRecordRef = ActorRefFrom<typeof composerRecordMachine>;

/** The actors `draftMachine` is provided with when its surface has a record. */
export type DraftPersistenceActors = {
  persistDraftActor: ReturnType<typeof persistDraftActorFor>;
  persistEditDraftActor: ReturnType<typeof persistEditDraftActorFor>;
  persistSelectionActor: ReturnType<typeof persistSelectionActorFor>;
  clearMessageEditActor: ReturnType<typeof clearMessageEditActorFor>;
  storeAttachmentActor: ReturnType<typeof storeAttachmentActorFor>;
};

const persistDraftActorFor = (recordRef: ComposerRecordRef) =>
  fromSafeAsync<void, { draft: MyUIMessage }>(async ({ input }) => {
    recordRef.send({ type: 'patch', fields: { draft: input.draft } });
  });

const persistEditDraftActorFor = (recordRef: ComposerRecordRef) =>
  fromSafeAsync<void, { messageId: string; draft: MyUIMessage }>(async ({ input }) => {
    recordRef.send({ type: 'patch', fields: { messageEdits: { [input.messageId]: input.draft } } });
  });

// The draft machine sends only the fields the user touched, so they pass through as given — no defaults.
const persistSelectionActorFor = (recordRef: ComposerRecordRef) =>
  fromSafeAsync<void, { toolChoice?: string | string[]; mode?: ChatMode }>(async ({ input }) => {
    recordRef.send({ type: 'patch', fields: input });
  });

const clearMessageEditActorFor = (recordRef: ComposerRecordRef) =>
  fromSafeAsync<void, { messageId: string }>(async ({ input }) => {
    // An edit with no parts is how the store spells "no edit" (D8); it omits
    // the entry on merge rather than writing an empty message down.
    recordRef.send({ type: 'patch', fields: { messageEdits: { [input.messageId]: createEmptyDraftMessage() } } });
  });

const storeAttachmentActorFor = (store: ComposerRecordStore) =>
  fromSafeAsync<
    { type: 'attachmentStored'; attachment: Attachment },
    { bytes: Uint8Array<ArrayBuffer>; mediaType: string; filename?: string }
  >(async ({ input }) => ({
    type: 'attachmentStored',
    attachment: await store.attachments.put(input.bytes, input.mediaType, input.filename),
  }));

/**
 * The `hydrateDraft` fields a loaded record carries: every composer field it
 * holds, and nothing for an absent one.
 *
 * @param record - What `recordLoaded` delivered.
 * @returns The fields to hydrate the draft with.
 */
export function draftHydrationOf(record: ComposerRecord | 'absent'): DraftHydration {
  if (record === 'absent') {
    return {};
  }
  const { draft, messageEdits, toolChoice, mode } = record;
  return {
    ...(draft === undefined ? {} : { draft }),
    ...(messageEdits === undefined ? {} : { messageEdits }),
    ...(toolChoice === undefined ? {} : { toolChoice }),
    ...(mode === undefined ? {} : { mode }),
  };
}

/**
 * Mount a record actor for the lifetime of the calling component.
 *
 * @param store - The store for this surface's record.
 * @returns The running actor; the composer is interactive before it resolves.
 */
export function useComposerRecord(store: ComposerRecordStore): ComposerRecordRef {
  const logic = useMemo(() => composerRecordMachine.provide(composerRecordActors(store)), [store]);

  return useActorRef(logic, { input: {} });
}

/**
 * Create a record actor outside React, for `ChatSessionStore`.
 *
 * The actor is returned **unstarted** so the caller can subscribe to
 * `recordLoaded` before the read can resolve; call `.start()` once its
 * subscriptions are in place.
 *
 * @param store - The store for the chat's or project's record.
 * @returns The unstarted actor.
 */
export function createComposerRecordActor(store: ComposerRecordStore): ComposerRecordRef {
  return createActor(composerRecordMachine.provide(composerRecordActors(store)), { input: {} });
}

/**
 * The `draftMachine` persistence actors for one record.
 *
 * @param recordRef - The record actor that owns the writes.
 * @param store - The same record's store, for attachment bytes.
 * @returns The five actors `draftMachine.provide()` expects.
 */
export function draftPersistenceFor(recordRef: ComposerRecordRef, store: ComposerRecordStore): DraftPersistenceActors {
  return {
    persistDraftActor: persistDraftActorFor(recordRef),
    persistEditDraftActor: persistEditDraftActorFor(recordRef),
    persistSelectionActor: persistSelectionActorFor(recordRef),
    clearMessageEditActor: clearMessageEditActorFor(recordRef),
    storeAttachmentActor: storeAttachmentActorFor(store),
  };
}
