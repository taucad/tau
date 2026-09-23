/**
 * Draft Machine
 *
 * XState machine for the composer's draft and edit state with debounced
 * persistence. Actors are provided via `machine.provide()` by each surface; a
 * surface with a composer record uses `draftPersistenceFor` from
 * `#hooks/composer-record.js`, whose actors hand each write to the record
 * machine and resolve at once.
 *
 * ## Attachment ingest chokepoint
 *
 * The `attachmentProcessing` region is the SINGLE path by which bytes enter a
 * draft. `addDraftAttachment` / `addEditDraftAttachment` accept a raw data URL
 * (or a document's bytes) and enqueue it in `context.attachmentQueue`, after refusing a kind the
 * selected model cannot read (D20). Entries are processed FIFO: images pass
 * through `resizing` (`resizeImageActor`), documents skip it, and every entry
 * then enters `storing`, where `storeAttachmentActor` hashes and writes the
 * bytes. Only a stored attachment is referenced by the draft, so the blob is
 * durable before the reference (D18). Failures emit `imageResizeFailed` or
 * `attachmentStoreFailed` and add nothing; refusals emit `attachmentRefused`.
 *
 * Callers MUST send raw data URLs and MUST NOT pre-resize.
 *
 * ## Hydration (D7)
 *
 * The composer is interactive before its record is read. `hydrateDraft`
 * applies the record to every field the user has not touched since the
 * machine started — all of them while the composer is pristine. It writes
 * nothing: every touched field was already patched when it was touched, and
 * the record merges those patches over what it read (R5).
 */

import { assertEvent, setup, types } from 'xstate';
import type { EnqueueObject, SystemRegistry } from 'xstate';
import { eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';
import type { MyUIMessage, ModelInputModality, ModelSupport } from '@taucad/chat';
import { modelSupportsInput } from '@taucad/chat';
import type { ChatMode } from '@taucad/chat/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import { base64ToUint8Array } from 'uint8array-extras';
import { attachmentKind, attachmentReferenceOf, attachmentUrl } from '#utils/attachment.utils.js';
import type { Attachment, AttachmentKind, AttachmentReference } from '#utils/attachment.utils.js';

/**
 * An attachment held by a draft: a reference, whose `byteLength` is known only
 * when this device stored the bytes (S3).
 */
export type DraftAttachment = AttachmentReference;

/** The selected model, as the kind refusal needs it: what it reads, and its name for the reason. */
export type DraftAttachmentModel = {
  readonly name: string;
  readonly support?: ModelSupport;
};

/** Which draft an event or queue entry addresses. */
export type DraftTarget = 'main' | 'edit';

// FIFO ingest queue entry. The machine processes one entry at a time via the
// `attachmentProcessing` region, preserving submission order.
type AttachmentQueueEntry = {
  /** Stable id for trace/debug; not consumed by the UI. */
  readonly id: string;
  readonly target: DraftTarget;
  /** The edit an `edit` entry belongs to; its attachment is dropped if that edit is no longer open. */
  readonly editMessageId?: string;
  readonly mediaType: string;
  readonly filename?: string;
  /** An image awaiting `resizing`. */
  readonly dataUrl?: string;
  readonly preserveOriginal: boolean;
  /** Set once the entry is ready for `storing`: at enqueue for a document, after `resizing` for an image. */
  readonly bytes?: Uint8Array<ArrayBuffer>;
};

/** The record fields the user has changed since the machine started; hydration never overwrites them. */
type DraftTouched = {
  readonly draft: boolean;
  readonly toolChoice: boolean;
  readonly mode: boolean;
  /** Messages the user has opened, saved or cleared an edit for. */
  readonly editIds: readonly string[];
};

// Context for draft state
export type DraftMachineContext = {
  // Main draft state
  draftText: string;
  draftAttachments: DraftAttachment[];
  draftToolChoice: string | string[];
  draftMode: ChatMode;
  // Edit draft state
  messageEdits: Record<string, MyUIMessage>;
  activeEditMessageId?: string;
  /**
   * The message an edit save writes to. Kept through `exitEditMode`, which
   * clears `activeEditMessageId` while a debounced save may still be pending.
   */
  savingEditMessageId?: string;
  editDraftText: string;
  editDraftAttachments: DraftAttachment[];
  /** FIFO queue of attachments awaiting `resizing` and `storing`. */
  attachmentQueue: readonly AttachmentQueueEntry[];
  touched: DraftTouched;
};

/**
 * Events the machine emits via `emit(...)`, for one toast subscriber per
 * surface — no per-caller try/catch needed.
 */
export type DraftEmittedEvents =
  | { type: 'imageResizeFailed'; error: Error }
  | { type: 'attachmentStoreFailed'; error: Error }
  | { type: 'attachmentRefused'; kind: AttachmentKind; mediaType: string; modelName: string };

export type DraftMachineInput = {
  initialDraft?: MyUIMessage;
};

/** The record fields `hydrateDraft` carries; the shape of a composer record's chat fields. */
export type DraftHydration = {
  draft?: MyUIMessage;
  messageEdits?: Readonly<Record<string, MyUIMessage>>;
  toolChoice?: string | string[];
  mode?: ChatMode;
};

/**
 * What an attachment arrives as: an image or document data URL, or a
 * document's bytes as read, so a large PDF is never base64-decoded on the
 * main thread (S7). Images always arrive as data URLs, for `resizing`.
 */
export type DraftAttachmentSource = string | { readonly bytes: Uint8Array<ArrayBuffer>; readonly mediaType: string };

type AttachmentInput = { dataUrl: string } | { bytes: Uint8Array<ArrayBuffer>; mediaType: string };

type AddAttachment = AttachmentInput & {
  filename?: string;
  /** Keep a generated capture byte for byte instead of resizing it. */
  preserveOriginal?: boolean;
  model: DraftAttachmentModel;
};

// Helper to build draft message from text and attachments
export function buildDraftMessage(text: string, attachments: readonly DraftAttachment[]): MyUIMessage {
  const parts: MyUIMessage['parts'] = [];

  if (text.trim().length > 0) {
    parts.push({
      type: 'text',
      text,
    });
  }

  for (const attachment of attachments) {
    parts.push({
      type: 'file',
      mediaType: attachment.mediaType,
      ...(attachment.filename === undefined ? {} : { filename: attachment.filename }),
      url: attachmentUrl(attachment),
    });
  }

  return {
    id: 'draft',
    role: 'user',
    metadata: {
      createdAt: Date.now(),
      status: 'pending',
    },
    parts,
  };
}

/**
 * The edit a save writes: the live text while the box is open, and the
 * snapshot `exitEditMode` took into `messageEdits` once it has closed.
 */
const editDraftToPersist = (context: DraftMachineContext): MyUIMessage => {
  const snapshot =
    context.savingEditMessageId === undefined ? undefined : context.messageEdits[context.savingEditMessageId];
  return context.activeEditMessageId === undefined && snapshot !== undefined
    ? snapshot
    : buildDraftMessage(context.editDraftText, context.editDraftAttachments);
};

// Helper to create empty draft
export function createEmptyDraftMessage(): MyUIMessage {
  return {
    id: '',
    role: 'user',
    parts: [],
    metadata: {
      createdAt: Date.now(),
      status: 'pending',
    },
  };
}

const dataUrlPattern = /^data:([^,;]+)(?:;[^,;]+)*;base64,/;

/** Decode a base64 data URL, or `undefined` when it is not one. Never throws. */
const decodeDataUrl = (dataUrl: string): { mediaType: string; bytes: Uint8Array<ArrayBuffer> } | undefined => {
  const header = dataUrlPattern.exec(dataUrl);
  if (!header) {
    return undefined;
  }
  try {
    return { mediaType: header[1]!.toLowerCase(), bytes: base64ToUint8Array(dataUrl.slice(header[0].length)) };
  } catch {
    return undefined;
  }
};

const notDataUrlError = (): Error => new Error('The attachment is not a base64 data URL.');

type Enqueued = { entry: AttachmentQueueEntry } | { error: Error };

/**
 * Build the queue entry for one attachment. A document's bytes are taken as
 * given, or decoded from its data URL; an image waits for `resizing`.
 */
const queueEntryFor = (
  source: AttachmentInput,
  options: { target: DraftTarget; editMessageId?: string; filename?: string; preserveOriginal: boolean },
): Enqueued => {
  const mediaType =
    'bytes' in source ? source.mediaType.toLowerCase() : dataUrlPattern.exec(source.dataUrl)?.[1]?.toLowerCase();
  if (mediaType === undefined) {
    return { error: notDataUrlError() };
  }
  const base = {
    id: generatePrefixedId(idPrefix.log),
    target: options.target,
    mediaType,
    preserveOriginal: options.preserveOriginal,
    ...(options.editMessageId === undefined ? {} : { editMessageId: options.editMessageId }),
    ...(options.filename === undefined ? {} : { filename: options.filename }),
  };
  if ('bytes' in source) {
    return attachmentKind(mediaType) === 'image'
      ? { error: new Error('An image must arrive as a data URL, so it can be resized.') }
      : { entry: { ...base, bytes: source.bytes } };
  }
  if (attachmentKind(mediaType) === 'image') {
    return { entry: { ...base, dataUrl: source.dataUrl } };
  }
  const decoded = decodeDataUrl(source.dataUrl);
  return decoded ? { entry: { ...base, bytes: decoded.bytes } } : { error: notDataUrlError() };
};

const modalityOf = (kind: AttachmentKind): ModelInputModality => (kind === 'image' ? 'image' : 'pdf');

type LoadedDraft = { text: string; attachments: DraftAttachment[]; legacy: string[] };

/**
 * Split a stored message into what the draft shows now and what must still be
 * stored. A reference loads as-is; a legacy `data:` URL is re-ingested so the
 * next write converts it (D14); anything else cannot be resolved and is dropped.
 */
const loadMessage = (message: MyUIMessage | undefined): LoadedDraft => {
  const loaded: LoadedDraft = { text: '', attachments: [], legacy: [] };
  for (const part of message?.parts ?? []) {
    const reference = part.type === 'file' ? attachmentReferenceOf(part) : undefined;
    if (part.type === 'text' && loaded.text === '') {
      loaded.text = part.text;
    } else if (reference !== undefined) {
      loaded.attachments.push(reference);
    } else if (part.type === 'file' && part.url.startsWith('data:')) {
      loaded.legacy.push(part.url);
    }
  }
  return loaded;
};

/**
 * Queue entries for a loaded message's legacy parts. A part that is not even a
 * data URL has already been filtered, so only undecodable bytes are dropped.
 */
const legacyEntries = (
  legacy: readonly string[],
  target: DraftTarget,
  editMessageId?: string,
): AttachmentQueueEntry[] =>
  legacy.flatMap((dataUrl) => {
    // Already processed when it was first attached, so it is kept byte for byte.
    const result = queueEntryFor({ dataUrl }, { target, editMessageId, preserveOriginal: true });
    return 'entry' in result ? [result.entry] : [];
  });

const touch = (
  touched: DraftTouched,
  fields: Partial<Omit<DraftTouched, 'editIds'>>,
  editId?: string,
): DraftTouched => ({
  ...touched,
  ...fields,
  editIds: editId === undefined || touched.editIds.includes(editId) ? touched.editIds : [...touched.editIds, editId],
});

const withoutEdit = (edits: Record<string, MyUIMessage>, messageId: string): Record<string, MyUIMessage> =>
  Object.fromEntries(Object.entries(edits).filter(([id]) => id !== messageId));

/** Whether the queue head is an attachment for `target` (and, for an edit, for the edit still open). */
const headAddresses = (context: DraftMachineContext, target: DraftTarget): boolean => {
  const head = context.attachmentQueue[0];
  if (head?.target !== target) {
    return false;
  }
  return target === 'main' || (head.editMessageId !== undefined && head.editMessageId === context.activeEditMessageId);
};

// Events
type DraftMachineEvents =
  | { type: 'initializeFromChat' }
  | ({ type: 'hydrateDraft' } & DraftHydration)
  | { type: 'setDraftText'; text: string }
  | ({ type: 'addDraftAttachment' } & AddAttachment)
  | { type: 'removeDraftAttachment'; index: number }
  | { type: 'setDraftToolChoice'; toolChoice: string | string[] }
  | { type: 'setDraftMode'; mode: ChatMode }
  | { type: 'clearDraft' }
  | { type: 'loadDraftFromMessageTransient'; draft: MyUIMessage }
  | { type: 'setEditDraftText'; text: string }
  | ({ type: 'addEditDraftAttachment' } & AddAttachment)
  | { type: 'removeEditDraftAttachment'; index: number }
  | {
      type: 'startEditingMessage';
      messageId: string;
      originalMessage?: MyUIMessage;
    }
  | { type: 'exitEditMode' }
  | { type: 'clearEditDraft' }
  | { type: 'clearMessageEdit'; messageId: string }
  // Flush pending state immediately (bypasses debounce, used on tab close)
  | { type: 'flushNow' }
  // Emitted by `resizeImageActor` when the queue head finishes resizing.
  // Internal — callers must not send this directly.
  | { type: 'imageResized'; resized: string }
  // Emitted by `storeAttachmentActor` once the queue head's bytes are durable.
  // Internal — callers must not send this directly.
  | { type: 'attachmentStored'; attachment: Attachment };

// Placeholder actors - actual implementations provided via machine.provide()
const persistDraftActor = fromSafeAsync<void, { draft: MyUIMessage }>(async () => {
  throw new Error('persistDraftActor not provided');
});

const persistEditDraftActor = fromSafeAsync<void, { messageId: string; draft: MyUIMessage }>(async () => {
  throw new Error('persistEditDraftActor not provided');
});

/** Patches the touched selector fields; an omitted field is left alone in the record. */
const persistSelectionActor = fromSafeAsync<void, { toolChoice?: string | string[]; mode?: ChatMode }>(async () => {
  throw new Error('persistSelectionActor not provided');
});

const clearMessageEditActor = fromSafeAsync<void, { messageId: string }>(async () => {
  throw new Error('clearMessageEditActor not provided');
});

/**
 * Placeholder resize actor. The real implementation lives in
 * `apps/ui/app/hooks/resize-image.actor.ts` and is provided via
 * `.provide({ actors: { resizeImageActor } })` by every ownership site.
 * Tests override with a deterministic fake.
 */
const resizeImageActor = fromSafeAsync<
  { type: 'imageResized'; resized: string },
  { image: string; preserveOriginal: boolean }
>(async () => {
  throw new Error('resizeImageActor not provided');
});

/**
 * Placeholder store actor. `draftPersistenceFor` provides one that `put`s the
 * bytes into the record's attachment store; the store enforces kind and cap.
 */
const storeAttachmentActor = fromSafeAsync<
  { type: 'attachmentStored'; attachment: Attachment },
  { bytes: Uint8Array<ArrayBuffer>; mediaType: string; filename?: string }
>(async () => {
  throw new Error('storeAttachmentActor not provided');
});

const asError = (error: unknown, fallback: string): Error =>
  error instanceof Error ? error : new Error(typeof error === 'string' ? error : fallback);

const draftActors = {
  persistDraftActor,
  persistEditDraftActor,
  persistSelectionActor,
  clearMessageEditActor,
  resizeImageActor,
  storeAttachmentActor,
};

type DraftEnqueue = EnqueueObject<DraftMachineEvents, DraftEmittedEvents, SystemRegistry, typeof draftActors>;
type DraftArgs<TType extends DraftMachineEvents['type']> = Readonly<{
  context: DraftMachineContext;
  event: Extract<DraftMachineEvents, { type: TType }>;
}>;

/** Refuse, reject or enqueue one added attachment. */
const enqueueAttachment = (
  { context, event }: DraftArgs<'addDraftAttachment' | 'addEditDraftAttachment'>,
  enq: DraftEnqueue,
) => {
  const target: DraftTarget = event.type === 'addDraftAttachment' ? 'main' : 'edit';
  const result = queueEntryFor(event, {
    target,
    editMessageId: target === 'edit' ? context.activeEditMessageId : undefined,
    filename: event.filename,
    preserveOriginal: event.preserveOriginal ?? false,
  });
  if ('error' in result) {
    enq.emit({ type: 'attachmentStoreFailed', error: result.error });
    return {};
  }
  const { entry } = result;
  const kind = attachmentKind(entry.mediaType);
  // D20: refused before any byte is resized or written.
  if (!modelSupportsInput(event.model.support, modalityOf(kind))) {
    enq.emit({ type: 'attachmentRefused', kind, mediaType: entry.mediaType, modelName: event.model.name });
    return {};
  }
  return { context: { attachmentQueue: [...context.attachmentQueue, entry] } };
};

/** A failed resize or store shifts the queue and says so, so it never blocks the entries behind it. */
const dropHeadWith =
  (fallback: string, type: 'imageResizeFailed' | 'attachmentStoreFailed') =>
  (
    { context, event }: Readonly<{ context: DraftMachineContext; event: Readonly<{ error: unknown }> }>,
    enq: DraftEnqueue,
  ) => {
    enq.emit({ type, error: asError(event.error, fallback) });
    return { target: 'idle', context: { attachmentQueue: context.attachmentQueue.slice(1) } };
  };

/** Clearing a draft abandons the in-flight step for its head, and only for its own target. */
const abandonHeadFor =
  (target: DraftTarget) =>
  ({ context }: Readonly<{ context: DraftMachineContext }>) =>
    context.attachmentQueue[0]?.target === target ? { target: 'idle' } : undefined;

const whenDraftTextChanged =
  (transition: Readonly<{ target: string; reenter?: boolean }>) =>
  ({ context, event }: DraftArgs<'setDraftText'>) =>
    event.text === context.draftText ? undefined : transition;

const whenEditDraftTextChanged =
  (transition: Readonly<{ target: string; reenter?: boolean }>) =>
  ({ context, event }: DraftArgs<'setEditDraftText'>) =>
    event.text === context.editDraftText ? undefined : transition;

const whenStoredFor =
  (target: DraftTarget, transition: Readonly<{ target: string; reenter?: boolean }>) =>
  ({ context }: Readonly<{ context: DraftMachineContext }>) =>
    headAddresses(context, target) ? transition : undefined;

export const draftMachine = setup({
  schemas: {
    context: types<DraftMachineContext>(),
    events: eventSchemas<DraftMachineEvents>(),
    input: types<DraftMachineInput>(),
    emitted: eventSchemas<DraftEmittedEvents>(),
  },
  actors: draftActors,
  delays: {
    saveDebounce: 200,
  },
}).createMachine({
  id: 'draft',
  context: ({ input }) => {
    const loaded = loadMessage(input.initialDraft);
    return {
      draftText: loaded.text,
      draftAttachments: loaded.attachments,
      draftToolChoice: 'auto',
      draftMode: 'agent' as ChatMode,
      messageEdits: {},
      activeEditMessageId: undefined,
      editDraftText: '',
      editDraftAttachments: [],
      attachmentQueue: legacyEntries(loaded.legacy, 'main'),
      touched: { draft: false, toolChoice: false, mode: false, editIds: [] },
    };
  },
  type: 'parallel',
  states: {
    // Handles all draft events and updates context
    events: {
      on: {
        // A (re)loaded chat opens with no edit box; composer fields come from `hydrateDraft`.
        initializeFromChat: {
          context: { activeEditMessageId: undefined, editDraftText: '', editDraftAttachments: [] },
        },
        hydrateDraft: {
          context: ({ context, event }) => {
            const { touched } = context;
            const loaded = touched.draft || event.draft === undefined ? undefined : loadMessage(event.draft);
            const storedEdits = Object.entries(event.messageEdits ?? {}).filter(
              ([id]) => !touched.editIds.includes(id),
            );
            return {
              ...(loaded && {
                draftText: loaded.text,
                draftAttachments: loaded.attachments,
                attachmentQueue: [...context.attachmentQueue, ...legacyEntries(loaded.legacy, 'main')],
              }),
              messageEdits: { ...context.messageEdits, ...Object.fromEntries(storedEdits) },
              ...(!touched.toolChoice && event.toolChoice !== undefined && { draftToolChoice: event.toolChoice }),
              ...(!touched.mode && event.mode !== undefined && { draftMode: event.mode }),
            };
          },
        },
        setDraftText: ({ context, event }) =>
          event.text === context.draftText
            ? undefined
            : { context: { draftText: event.text, touched: touch(context.touched, { draft: true }) } },
        addDraftAttachment: enqueueAttachment,
        removeDraftAttachment: {
          context: ({ context, event }) => ({
            draftAttachments: context.draftAttachments.filter((_, index) => index !== event.index),
            touched: touch(context.touched, { draft: true }),
          }),
        },
        setDraftToolChoice: {
          context: ({ context, event }) => ({
            draftToolChoice: event.toolChoice,
            touched: touch(context.touched, { toolChoice: true }),
          }),
        },
        setDraftMode: {
          context: ({ context, event }) => ({
            draftMode: event.mode,
            touched: touch(context.touched, { mode: true }),
          }),
        },
        clearDraft: {
          context: ({ context }) => ({
            draftText: '',
            draftAttachments: [],
            draftToolChoice: 'auto',
            // Purge any pending main-target entries so a cleared composer
            // doesn't sprout attachments from in-flight uploads.
            attachmentQueue: context.attachmentQueue.filter((entry) => entry.target !== 'main'),
            touched: touch(context.touched, { draft: true, toolChoice: true }),
          }),
        },
        loadDraftFromMessageTransient: {
          context: ({ context, event }) => {
            const loaded = loadMessage(event.draft);
            return {
              draftText: loaded.text,
              draftAttachments: loaded.attachments,
              attachmentQueue: [...context.attachmentQueue, ...legacyEntries(loaded.legacy, 'main')],
              touched: touch(context.touched, { draft: true }),
            };
          },
        },
        startEditingMessage: {
          context: ({ context, event }) => {
            const loaded = loadMessage(context.messageEdits[event.messageId] ?? event.originalMessage);
            const loadedEdit = {
              activeEditMessageId: event.messageId,
              savingEditMessageId: event.messageId,
              editDraftText: loaded.text,
              editDraftAttachments: loaded.attachments,
              attachmentQueue: [...context.attachmentQueue, ...legacyEntries(loaded.legacy, 'edit', event.messageId)],
              touched: touch(context.touched, {}, event.messageId),
            };

            // Save current edit if switching between edits
            if (context.activeEditMessageId && context.activeEditMessageId !== event.messageId) {
              return {
                ...loadedEdit,
                messageEdits: {
                  ...context.messageEdits,
                  [context.activeEditMessageId]: buildDraftMessage(context.editDraftText, context.editDraftAttachments),
                },
              };
            }

            return loadedEdit;
          },
        },
        exitEditMode: ({ context }) => {
          if (!context.activeEditMessageId) {
            return {};
          }
          return {
            context: {
              messageEdits: {
                ...context.messageEdits,
                [context.activeEditMessageId]: buildDraftMessage(context.editDraftText, context.editDraftAttachments),
              },
              activeEditMessageId: undefined,
              editDraftText: '',
              editDraftAttachments: [],
            },
          };
        },
        setEditDraftText: { context: ({ event }) => ({ editDraftText: event.text }) },
        addEditDraftAttachment: enqueueAttachment,
        removeEditDraftAttachment: {
          context: ({ context, event }) => ({
            editDraftAttachments: context.editDraftAttachments.filter((_, index) => index !== event.index),
          }),
        },
        clearEditDraft: {
          context: ({ context }) => ({
            editDraftText: '',
            editDraftAttachments: [],
            attachmentQueue: context.attachmentQueue.filter((entry) => entry.target !== 'edit'),
          }),
        },
        clearMessageEdit: {
          context: ({ context, event }) => ({
            messageEdits: withoutEdit(context.messageEdits, event.messageId),
            touched: touch(context.touched, {}, event.messageId),
          }),
        },
      },
    },
    // Debounced saving for new message input draft
    inputSaving: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            setDraftText: whenDraftTextChanged({ target: 'pending' }),
            // Persist once the attachment is stored and referenced; adding
            // only enqueues.
            attachmentStored: whenStoredFor('main', { target: 'pending' }),
            removeDraftAttachment: { target: 'pending' },
            // Handle draft clearing with immediate persistence
            clearDraft: { target: 'persisting' },
          },
        },
        pending: {
          after: {
            saveDebounce: { target: 'persisting' },
          },
          on: {
            setDraftText: whenDraftTextChanged({ target: 'pending', reenter: true }),
            attachmentStored: whenStoredFor('main', { target: 'pending', reenter: true }),
            removeDraftAttachment: { target: 'pending', reenter: true },
            // Immediately bypass debounce and persist
            flushNow: { target: 'persisting' },
            // Bypass debounce — persist the (now-empty) draft immediately
            clearDraft: { target: 'persisting' },
          },
        },
        persisting: {
          invoke: {
            src: 'persistDraftActor',
            input: ({ context }) => ({
              draft: buildDraftMessage(context.draftText, context.draftAttachments),
            }),
            onDone: { target: 'idle' },
            onError: { target: 'idle' },
          },
          on: {
            // Queue new changes while persisting
            setDraftText: whenDraftTextChanged({ target: 'pending' }),
            attachmentStored: whenStoredFor('main', { target: 'pending' }),
            removeDraftAttachment: { target: 'pending' },
            // Cancel stale in-flight persist and re-persist with empty draft
            clearDraft: { target: 'persisting', reenter: true },
          },
        },
      },
    },
    // Debounced saving for message edit draft
    editSaving: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            setEditDraftText: whenEditDraftTextChanged({ target: 'pending' }),
            // Persist once the attachment is stored; adding only enqueues.
            attachmentStored: whenStoredFor('edit', { target: 'pending' }),
            removeEditDraftAttachment: { target: 'pending' },
          },
        },
        pending: {
          after: {
            saveDebounce: { target: 'persisting' },
          },
          on: {
            setEditDraftText: whenEditDraftTextChanged({ target: 'pending', reenter: true }),
            attachmentStored: whenStoredFor('edit', { target: 'pending', reenter: true }),
            removeEditDraftAttachment: { target: 'pending', reenter: true },
            // Immediately bypass debounce and persist
            flushNow: { target: 'persisting' },
            // Closing the box mid-debounce still saves what was typed, under
            // the message the save targets rather than a cleared id.
            exitEditMode: { target: 'persisting' },
          },
        },
        persisting: {
          invoke: {
            src: 'persistEditDraftActor',
            input: ({ context }) => ({
              messageId: context.savingEditMessageId!,
              draft: editDraftToPersist(context),
            }),
            onDone: { target: 'idle' },
            onError: { target: 'idle' },
          },
          on: {
            // Queue new changes while persisting
            setEditDraftText: whenEditDraftTextChanged({ target: 'pending' }),
            attachmentStored: whenStoredFor('edit', { target: 'pending' }),
            removeEditDraftAttachment: { target: 'pending' },
            // Re-persist the snapshot the exit took over a stale in-flight save
            exitEditMode: { target: 'persisting', reenter: true },
          },
        },
      },
    },
    /**
     * Tool choice and mode reach the record as soon as they change; they are
     * discrete choices, so there is nothing to debounce. Only touched fields are
     * written, so an untouched default never overwrites a stored choice.
     */
    selectionSaving: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            setDraftToolChoice: { target: 'persisting' },
            setDraftMode: { target: 'persisting' },
            clearDraft: { target: 'persisting' },
          },
        },
        persisting: {
          invoke: {
            src: 'persistSelectionActor',
            input: ({ context }) => ({
              ...(context.touched.toolChoice && { toolChoice: context.draftToolChoice }),
              ...(context.touched.mode && { mode: context.draftMode }),
            }),
            onDone: { target: 'idle' },
            onError: { target: 'idle' },
          },
          // Leaf-level re-entry keeps the transition inside this region; a
          // region-level one would take the machine root as its domain.
          on: {
            setDraftToolChoice: { target: 'persisting', reenter: true },
            setDraftMode: { target: 'persisting', reenter: true },
            clearDraft: { target: 'persisting', reenter: true },
          },
        },
      },
    },
    /**
     * Attachment ingest FIFO chokepoint.
     *
     * While a queue entry exists, this region takes the head through
     * `resizing` (images without bytes yet) and `storing` (every entry), one
     * at a time so insertion order survives adversarial actor latency. The
     * store actor's `attachmentStored` event is consumed here (which appends
     * the attachment and shifts the queue) and by the saving regions (which
     * trigger debounced persistence). A failure at either step shifts the
     * queue and emits, so it never blocks the attachments behind it.
     *
     * Clearing a draft whose attachment is in flight abandons that step: the
     * actor is stopped with its state, so its result can never land on the
     * entry behind it. A blob it already wrote is reclaimed by `retainOnly`.
     */
    attachmentProcessing: {
      initial: 'idle',
      states: {
        idle: {
          always: ({ context }) => {
            const head = context.attachmentQueue[0];
            if (head === undefined) {
              return undefined;
            }
            return { target: head.bytes === undefined ? 'resizing' : 'storing' };
          },
        },
        resizing: {
          invoke: {
            src: 'resizeImageActor',
            input: ({ context }) => ({
              image: context.attachmentQueue[0]!.dataUrl!,
              preserveOriginal: context.attachmentQueue[0]!.preserveOriginal,
            }),
            onError: dropHeadWith('Image resize failed', 'imageResizeFailed'),
          },
          on: {
            /* Hand the resized head to `storing`, or drop it if the resized output is unusable. */
            imageResized: ({ context, event }, enq) => {
              const [head, ...rest] = context.attachmentQueue;
              if (!head) {
                return { target: 'idle' };
              }
              const decoded = decodeDataUrl(event.resized);
              if (!decoded) {
                enq.emit({ type: 'imageResizeFailed', error: new Error('Image resize produced no usable image.') });
                return { target: 'idle', context: { attachmentQueue: rest } };
              }
              const { dataUrl: _processed, ...ready } = head;
              return {
                target: 'idle',
                context: {
                  attachmentQueue: [{ ...ready, mediaType: decoded.mediaType, bytes: decoded.bytes }, ...rest],
                },
              };
            },
            clearDraft: abandonHeadFor('main'),
            clearEditDraft: abandonHeadFor('edit'),
          },
        },
        storing: {
          invoke: {
            src: 'storeAttachmentActor',
            input: ({ context }) => {
              const head = context.attachmentQueue[0]!;
              return {
                bytes: head.bytes!,
                mediaType: head.mediaType,
                ...(head.filename === undefined ? {} : { filename: head.filename }),
              };
            },
            onError: dropHeadWith('Attachment could not be stored', 'attachmentStoreFailed'),
          },
          on: {
            /* Reference the stored head from its draft; an edit that has since closed gets nothing. */
            attachmentStored: ({ context, event }) => {
              const [, ...rest] = context.attachmentQueue;
              // Only an attachment that lands touches its draft: a refused or failed one changes
              // nothing, so a late hydration still applies the stored draft (D7), and one that
              // lands after a hydration appends to the draft it brought.
              if (headAddresses(context, 'main')) {
                return {
                  target: 'idle',
                  context: {
                    draftAttachments: [...context.draftAttachments, event.attachment],
                    attachmentQueue: rest,
                    touched: touch(context.touched, { draft: true }),
                  },
                };
              }
              if (headAddresses(context, 'edit')) {
                return {
                  target: 'idle',
                  context: {
                    editDraftAttachments: [...context.editDraftAttachments, event.attachment],
                    attachmentQueue: rest,
                    touched: touch(context.touched, {}, context.activeEditMessageId),
                  },
                };
              }
              return { target: 'idle', context: { attachmentQueue: rest } };
            },
            clearDraft: abandonHeadFor('main'),
            clearEditDraft: abandonHeadFor('edit'),
          },
        },
      },
    },
    // Async clearing of message edits
    editClearing: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            clearMessageEdit: { target: 'clearing' },
          },
        },
        clearing: {
          invoke: {
            src: 'clearMessageEditActor',
            input: ({ event }) => {
              assertEvent(event, 'clearMessageEdit');
              return { messageId: event.messageId };
            },
            onDone: { target: 'idle' },
            onError: { target: 'idle' },
          },
        },
      },
    },
  },
});
