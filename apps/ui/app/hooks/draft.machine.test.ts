import { describe, it, expect, vi, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor, waitFor } from 'xstate';
import type { MyUIMessage } from '@taucad/chat';
import type { ChatMode } from '@taucad/chat/constants';
import { sha256Bytes } from '@taucad/utils/hash';
import { attachmentKinds, draftMachine } from '#hooks/draft.machine.js';
import type { DraftAttachmentModel, DraftEmittedEvents } from '#hooks/draft.machine.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import type { Attachment } from '#utils/attachment.utils.js';

type PersistDraftInput = { draft: MyUIMessage };
type PersistEditInput = { messageId: string; draft: MyUIMessage };
type PersistSelectionInput = { toolChoice?: string | string[]; mode?: ChatMode };
type StoreInput = { bytes: Uint8Array<ArrayBuffer>; mediaType: string; filename?: string };

// Three bytes each, so a stored attachment's hash and length are checkable.
const pngA = 'data:image/png;base64,AAEC';
const pngB = 'data:image/png;base64,AwQF';
const pngC = 'data:image/png;base64,BgcI';
const jpegResized = 'data:image/jpeg;base64,CQoL';
const pdf = 'data:application/pdf;base64,JVBERg==';

const imageAndPdfModel: DraftAttachmentModel = {
  name: 'Claude Sonnet',
  support: { modalities: { input: ['text', 'image', 'pdf'], output: ['text'] } },
};
const imageOnlyModel: DraftAttachmentModel = {
  name: 'Gemini Flash',
  support: { modalities: { input: ['text', 'image'], output: ['text'] } },
};
const textOnlyModel: DraftAttachmentModel = {
  name: 'Text Model',
  support: { modalities: { input: ['text'], output: ['text'] } },
};

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

const bytesOf = (dataUrl: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (character) => character.charCodeAt(0));

/** The attachment the fake store returns for these bytes: the real hash, so URLs are checkable. */
const storedAs = async (dataUrl: string, filename?: string): Promise<Attachment> => {
  const bytes = bytesOf(dataUrl);
  return {
    hash: await sha256Bytes(bytes),
    mediaType: dataUrl.slice(5, dataUrl.indexOf(';')),
    byteLength: bytes.byteLength,
    ...(filename === undefined ? {} : { filename }),
  };
};

const userMessage = (parts: MyUIMessage['parts']): MyUIMessage => ({
  id: 'draft',
  role: 'user',
  parts,
  metadata: { createdAt: 1, status: 'pending' },
});

const originalMessage = (text: string): MyUIMessage =>
  mock<MyUIMessage>({
    id: 'msg-1',
    role: 'user',
    parts: [{ type: 'text', text }],
    metadata: { createdAt: Date.now(), status: 'pending' },
  });

const pendingForever = async (): Promise<never> =>
  new Promise<never>(() => {
    // Never settles, so the entry stays in flight while the test acts.
  });

type HarnessOptions = {
  initialDraft?: MyUIMessage;
  resize?: (image: string) => Promise<string>;
  store?: (input: StoreInput) => Promise<Attachment>;
  /** Hold every draft persist open until the test resolves it. */
  deferDraftPersist?: boolean;
};

/**
 * One draft actor with every actor replaced by a recording fake.
 *
 * The persistence fakes resolve at once, as `draftPersistenceFor` does: each
 * write is a hand-off to the record machine.
 */
function createHarness(options: HarnessOptions = {}) {
  const drafts: PersistDraftInput[] = [];
  const edits: PersistEditInput[] = [];
  const selections: PersistSelectionInput[] = [];
  const stored: StoreInput[] = [];
  const resized: string[] = [];
  const draftResolvers: Array<() => void> = [];

  const machine = draftMachine.provide({
    actors: {
      persistDraftActor: fromSafeAsync(async ({ input }: { input: PersistDraftInput }) => {
        drafts.push(input);
        if (options.deferDraftPersist) {
          await new Promise<void>((resolve) => {
            draftResolvers.push(resolve);
          });
        }
      }),
      persistEditDraftActor: fromSafeAsync(async ({ input }: { input: PersistEditInput }) => {
        edits.push(input);
      }),
      persistSelectionActor: fromSafeAsync(async ({ input }: { input: PersistSelectionInput }) => {
        selections.push(input);
      }),
      // oxlint-disable-next-line no-empty-function -- mock stub
      clearMessageEditActor: fromSafeAsync(async () => {}),
      resizeImageActor: fromSafeAsync<
        { type: 'imageResized'; resized: string },
        { image: string; preserveOriginal: boolean }
      >(async ({ input }) => {
        resized.push(input.image);
        const resizer = options.resize ?? (async (image) => image);
        return { type: 'imageResized', resized: await resizer(input.image) };
      }),
      storeAttachmentActor: fromSafeAsync<{ type: 'attachmentStored'; attachment: Attachment }, StoreInput>(
        async ({ input }) => {
          stored.push(input);
          const put =
            options.store ??
            (async ({ bytes, mediaType, filename }: StoreInput) => ({
              hash: await sha256Bytes(bytes),
              mediaType,
              byteLength: bytes.byteLength,
              ...(filename === undefined ? {} : { filename }),
            }));
          return { type: 'attachmentStored', attachment: await put(input) };
        },
      ),
    },
  });

  const actor = createActor(machine, { input: { initialDraft: options.initialDraft } });
  return { actor, drafts, edits, selections, stored, resized, draftResolvers };
}

const settled = async (actor: ReturnType<typeof createHarness>['actor']) =>
  waitFor(
    actor,
    (snapshot) => snapshot.context.attachmentQueue.length === 0 && snapshot.matches({ attachmentProcessing: 'idle' }),
  );

const allSavingIdle = (actor: ReturnType<typeof createHarness>['actor']): boolean => {
  const snapshot = actor.getSnapshot();
  return (
    snapshot.matches({ inputSaving: 'idle' }) &&
    snapshot.matches({ editSaving: 'idle' }) &&
    snapshot.matches({ selectionSaving: 'idle' })
  );
};

describe('draftMachine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ===========================================================================
  // Context initialization
  // ===========================================================================
  describe('context initialization', () => {
    it('should initialize with correct defaults', () => {
      const { actor } = createHarness();
      actor.start();
      const { context } = actor.getSnapshot();
      expect(context.draftText).toBe('');
      expect(context.draftAttachments).toEqual([]);
      expect(context.draftToolChoice).toBe('auto');
      expect(context.draftMode).toBe('agent');
      expect(context.messageEdits).toEqual({});
      expect(context.activeEditMessageId).toBeUndefined();
      expect(context.editDraftText).toBe('');
      expect(context.editDraftAttachments).toEqual([]);
      actor.stop();
    });

    it('hydrates a draft without a synthetic persistence id', () => {
      const { actor } = createHarness({
        initialDraft: userMessage([
          { type: 'text', text: 'restored prompt' },
          { type: 'file', url: `attachments/${hashA}.png`, mediaType: 'image/png' },
        ]),
      });
      actor.start();
      expect(actor.getSnapshot().context).toMatchObject({
        draftText: 'restored prompt',
        draftAttachments: [{ hash: hashA, mediaType: 'image/png' }],
      });
      expect(actor.getSnapshot().context).not.toHaveProperty('chatId');
      actor.stop();
    });

    it('should store a legacy data: URL from the initial draft as an attachment', async () => {
      const { actor, stored } = createHarness({
        initialDraft: userMessage([{ type: 'file', url: pngA, mediaType: 'image/png' }]),
      });
      actor.start();
      await waitFor(actor, (snapshot) => snapshot.context.draftAttachments.length === 1);
      expect(stored).toHaveLength(1);
      expect(actor.getSnapshot().context.draftAttachments).toEqual([await storedAs(pngA)]);
      actor.stop();
    });
  });

  // ===========================================================================
  // Draft text events
  // ===========================================================================
  describe('draft text events', () => {
    it('should set draft text', () => {
      const { actor } = createHarness();
      actor.start();
      actor.send({ type: 'setDraftText', text: 'hello world' });
      expect(actor.getSnapshot().context.draftText).toBe('hello world');
      actor.stop();
    });

    it('should load a draft from a message transiently without invoking persistence', async () => {
      const { actor, drafts } = createHarness();
      actor.start();

      actor.send({
        type: 'loadDraftFromMessageTransient',
        draft: userMessage([
          { type: 'text', text: 'restored prompt' },
          { type: 'file', url: `attachments/${hashA}.pdf`, mediaType: 'application/pdf', filename: 'spec.pdf' },
        ]),
      });

      await Promise.resolve();

      expect(actor.getSnapshot().context.draftText).toBe('restored prompt');
      expect(actor.getSnapshot().context.draftAttachments).toEqual([
        { hash: hashA, mediaType: 'application/pdf', filename: 'spec.pdf' },
      ]);
      expect(drafts).toEqual([]);
      actor.stop();
    });

    it('should add draft image (after resize chokepoint settles)', async () => {
      const { actor } = createHarness();
      actor.start();
      actor.send({ type: 'addDraftAttachment', dataUrl: pngA, model: imageOnlyModel });
      await waitFor(actor, (s) => s.context.draftAttachments.length === 1);
      expect(actor.getSnapshot().context.draftAttachments).toEqual([await storedAs(pngA)]);
      actor.send({ type: 'addDraftAttachment', dataUrl: pngB, model: imageOnlyModel });
      await waitFor(actor, (s) => s.context.draftAttachments.length === 2);
      expect(actor.getSnapshot().context.draftAttachments).toHaveLength(2);
      actor.stop();
    });

    it('should remove draft image by index (after resize chokepoint settles)', async () => {
      const { actor } = createHarness();
      actor.start();
      actor.send({ type: 'addDraftAttachment', dataUrl: pngA, model: imageOnlyModel });
      actor.send({ type: 'addDraftAttachment', dataUrl: pngB, model: imageOnlyModel });
      actor.send({ type: 'addDraftAttachment', dataUrl: pngC, model: imageOnlyModel });
      await waitFor(actor, (s) => s.context.draftAttachments.length === 3);
      actor.send({ type: 'removeDraftAttachment', index: 1 });
      expect(actor.getSnapshot().context.draftAttachments).toEqual([await storedAs(pngA), await storedAs(pngC)]);
      actor.stop();
    });

    it('should clear draft (text, images, tool choice)', () => {
      const { actor } = createHarness();
      actor.start();
      actor.send({ type: 'setDraftText', text: 'some text' });
      actor.send({ type: 'addDraftAttachment', dataUrl: pngA, model: imageOnlyModel });
      actor.send({ type: 'setDraftToolChoice', toolChoice: 'required' });
      actor.send({ type: 'clearDraft' });
      const { context } = actor.getSnapshot();
      expect(context.draftText).toBe('');
      expect(context.draftAttachments).toEqual([]);
      expect(context.draftToolChoice).toBe('auto');
      actor.stop();
    });

    it('should set draft mode', () => {
      const { actor } = createHarness();
      actor.start();
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- intentionally invalid value for error-path testing
      actor.send({ type: 'setDraftMode', mode: 'edit' as unknown as ChatMode });
      expect(actor.getSnapshot().context.draftMode).toBe('edit');
      actor.stop();
    });

    it('should set draft tool choice', () => {
      const { actor } = createHarness();
      actor.start();
      actor.send({ type: 'setDraftToolChoice', toolChoice: 'required' });
      expect(actor.getSnapshot().context.draftToolChoice).toBe('required');
      actor.stop();
    });

    it('should persist the draft with attachment references, never data: URLs', async () => {
      vi.useFakeTimers();
      const { actor, drafts } = createHarness();
      actor.start();
      actor.send({ type: 'setDraftText', text: 'model the bracket' });
      actor.send({ type: 'addDraftAttachment', dataUrl: pdf, filename: 'spec.pdf', model: imageAndPdfModel });
      await vi.waitFor(() => {
        expect(actor.getSnapshot().context.draftAttachments).toHaveLength(1);
      });
      await vi.advanceTimersByTimeAsync(200);
      const { hash } = await storedAs(pdf);
      expect(drafts.at(-1)?.draft.parts).toEqual([
        { type: 'text', text: 'model the bracket' },
        { type: 'file', mediaType: 'application/pdf', filename: 'spec.pdf', url: `attachments/${hash}.pdf` },
      ]);
      actor.stop();
    });
  });

  // ===========================================================================
  // Tool choice and mode reach the record
  // ===========================================================================
  describe('selection persistence', () => {
    it('should patch the tool choice through when it is set', async () => {
      const { actor, selections } = createHarness();
      actor.start();
      actor.send({ type: 'setDraftToolChoice', toolChoice: ['web_search'] });
      await waitFor(actor, () => selections.length === 1);
      expect(selections).toEqual([{ toolChoice: ['web_search'] }]);
      actor.stop();
    });

    it('should patch the mode through when it is set', async () => {
      const { actor, selections } = createHarness();
      actor.start();
      actor.send({ type: 'setDraftMode', mode: 'plan' });
      await waitFor(actor, () => selections.length === 1);
      expect(selections).toEqual([{ mode: 'plan' }]);
      actor.stop();
    });

    it('should patch the tool choice reset when the draft is cleared', async () => {
      const { actor, selections } = createHarness();
      actor.start();
      actor.send({ type: 'setDraftMode', mode: 'plan' });
      actor.send({ type: 'setDraftToolChoice', toolChoice: 'required' });
      actor.send({ type: 'clearDraft' });
      await waitFor(actor, () => allSavingIdle(actor));
      expect(selections.at(-1)).toEqual({ toolChoice: 'auto', mode: 'plan' });
      actor.stop();
    });
  });

  // ===========================================================================
  // inputSaving state
  // ===========================================================================
  describe('inputSaving', () => {
    it('should enter pending on setDraftText', () => {
      const { actor } = createHarness();
      actor.start();
      actor.send({ type: 'setDraftText', text: 'typing...' });
      expect(actor.getSnapshot().matches({ inputSaving: 'pending' })).toBe(true);
      actor.stop();
    });

    it('should keep unchanged draft text idle', () => {
      const { actor } = createHarness();
      actor.start();

      actor.send({ type: 'setDraftText', text: '' });

      expect(actor.getSnapshot().matches({ inputSaving: 'idle' })).toBe(true);
      actor.stop();
    });

    it('should persist after debounce without a target identifier', async () => {
      vi.useFakeTimers();
      const { actor } = createHarness();
      actor.start();
      actor.send({ type: 'setDraftText', text: 'save me' });
      expect(actor.getSnapshot().matches({ inputSaving: 'pending' })).toBe(true);

      await vi.advanceTimersByTimeAsync(200);
      await waitFor(actor, (s) => s.matches({ inputSaving: 'idle' }));
      expect(actor.getSnapshot().matches({ inputSaving: 'idle' })).toBe(true);
      actor.stop();
    });
  });

  // ===========================================================================
  // clearDraft persistence across inputSaving states
  // ===========================================================================
  describe('clearDraft persistence', () => {
    it('should persist empty draft when clearDraft fires during idle state', async () => {
      vi.useFakeTimers();
      const { actor, drafts } = createHarness();
      actor.start();

      actor.send({ type: 'setDraftText', text: 'will be cleared' });
      await vi.advanceTimersByTimeAsync(200);
      await waitFor(actor, (s) => s.matches({ inputSaving: 'idle' }));

      drafts.length = 0;
      actor.send({ type: 'clearDraft' });

      expect(actor.getSnapshot().matches({ inputSaving: 'persisting' })).toBe(true);

      await waitFor(actor, (s) => s.matches({ inputSaving: 'idle' }));
      expect(drafts).toHaveLength(1);
      expect(drafts[0]!.draft.parts).toEqual([]);
      actor.stop();
    });

    it('should persist empty draft when clearDraft fires during pending state', async () => {
      vi.useFakeTimers();
      const { actor, drafts } = createHarness();
      actor.start();
      actor.send({ type: 'setDraftText', text: 'typed before send' });
      expect(actor.getSnapshot().matches({ inputSaving: 'pending' })).toBe(true);

      // Fire clearDraft while still in pending (before 200ms debounce)
      actor.send({ type: 'clearDraft' });

      // Should bypass debounce and go straight to persisting
      expect(actor.getSnapshot().matches({ inputSaving: 'persisting' })).toBe(true);
      expect(actor.getSnapshot().context.draftText).toBe('');

      await waitFor(actor, (s) => s.matches({ inputSaving: 'idle' }));
      expect(drafts).toHaveLength(1);
      expect(drafts[0]!.draft.parts).toEqual([]);
      actor.stop();
    });

    it('should re-persist empty draft when clearDraft fires during persisting state', async () => {
      vi.useFakeTimers();
      const { actor, drafts, draftResolvers } = createHarness({ deferDraftPersist: true });
      actor.start();
      actor.send({ type: 'setDraftText', text: 'stale content' });
      expect(actor.getSnapshot().matches({ inputSaving: 'pending' })).toBe(true);

      // Let debounce fire so inputSaving enters persisting with stale text
      await vi.advanceTimersByTimeAsync(200);
      expect(actor.getSnapshot().matches({ inputSaving: 'persisting' })).toBe(true);
      expect(drafts).toHaveLength(1);
      expect(drafts[0]!.draft.parts.find((p) => p.type === 'text')?.text).toBe('stale content');

      // Fire clearDraft while the stale persist is in-flight
      actor.send({ type: 'clearDraft' });

      // Should re-enter persisting, cancelling the stale invoke
      expect(actor.getSnapshot().matches({ inputSaving: 'persisting' })).toBe(true);
      expect(actor.getSnapshot().context.draftText).toBe('');

      // The re-enter started a NEW persist invoke with the empty draft
      expect(drafts).toHaveLength(2);
      expect(drafts[1]!.draft.parts).toEqual([]);

      // Resolve the new persist so the machine settles
      draftResolvers.at(-1)?.();
      await waitFor(actor, (s) => s.matches({ inputSaving: 'idle' }));
      actor.stop();
    });
  });

  // ===========================================================================
  // Edit mode
  // ===========================================================================
  describe('edit mode', () => {
    it('should start editing a message', () => {
      const { actor } = createHarness();
      actor.start();
      actor.send({
        type: 'startEditingMessage',
        messageId: 'msg-1',
        originalMessage: originalMessage('original text'),
      });
      expect(actor.getSnapshot().context.activeEditMessageId).toBe('msg-1');
      expect(actor.getSnapshot().context.editDraftText).toBe('original text');
      actor.stop();
    });

    it('should set edit draft text', () => {
      const { actor } = createHarness();
      actor.start();
      actor.send({ type: 'startEditingMessage', messageId: 'msg-1', originalMessage: originalMessage('original') });
      actor.send({ type: 'setEditDraftText', text: 'edited text' });
      expect(actor.getSnapshot().context.editDraftText).toBe('edited text');
      actor.stop();
    });

    it('should exit edit mode and save to messageEdits', () => {
      const { actor } = createHarness();
      actor.start();
      actor.send({ type: 'startEditingMessage', messageId: 'msg-1', originalMessage: originalMessage('original') });
      actor.send({ type: 'setEditDraftText', text: 'edited' });
      actor.send({ type: 'exitEditMode' });

      const { context } = actor.getSnapshot();
      expect(context.activeEditMessageId).toBeUndefined();
      expect(context.editDraftText).toBe('');
      expect(context.messageEdits['msg-1']).toBeDefined();
      const savedParts = context.messageEdits['msg-1']!.parts;
      const textPart = savedParts.find((p) => p.type === 'text');
      expect(textPart?.text).toBe('edited');
      actor.stop();
    });

    it('saves a pending edit under its own message id when the box closes', async () => {
      const { actor, edits } = createHarness();
      actor.start();
      actor.send({ type: 'startEditingMessage', messageId: 'msg-1', originalMessage: originalMessage('original') });
      // Exit inside the 200 ms debounce: the save is still pending here.
      actor.send({ type: 'setEditDraftText', text: 'edited' });
      actor.send({ type: 'exitEditMode' });

      await waitFor(actor, () => edits.length > 0);
      expect(edits).toHaveLength(1);
      expect(edits[0]?.messageId).toBe('msg-1');
      expect(edits[0]?.draft.parts.find((part) => part.type === 'text')?.text).toBe('edited');
      actor.stop();
    });

    it('should clear message edit', () => {
      const { actor } = createHarness();
      actor.start();
      actor.send({ type: 'startEditingMessage', messageId: 'msg-1', originalMessage: originalMessage('original') });
      actor.send({ type: 'exitEditMode' });
      expect(actor.getSnapshot().context.messageEdits['msg-1']).toBeDefined();

      actor.send({ type: 'clearMessageEdit', messageId: 'msg-1' });
      expect(actor.getSnapshot().context.messageEdits['msg-1']).toBeUndefined();
      actor.stop();
    });

    it('should load an edited message attachment as a reference', () => {
      const { actor } = createHarness();
      actor.start();
      actor.send({
        type: 'startEditingMessage',
        messageId: 'msg-1',
        originalMessage: userMessage([
          { type: 'text', text: 'see image' },
          { type: 'file', url: `attachments/${hashB}.jpg`, mediaType: 'image/jpeg' },
        ]),
      });
      expect(actor.getSnapshot().context.editDraftAttachments).toEqual([{ hash: hashB, mediaType: 'image/jpeg' }]);
      actor.stop();
    });

    it('should discard an edit attachment that lands after its edit box closed', async () => {
      let release: (() => void) | undefined;
      const { actor, stored } = createHarness({
        store: async ({ bytes, mediaType }) => {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return { hash: await sha256Bytes(bytes), mediaType, byteLength: bytes.byteLength };
        },
      });
      actor.start();
      actor.send({ type: 'startEditingMessage', messageId: 'msg-1', originalMessage: originalMessage('first') });
      actor.send({ type: 'addEditDraftAttachment', dataUrl: pngA, model: imageOnlyModel });
      await waitFor(actor, () => stored.length === 1);
      actor.send({ type: 'exitEditMode' });
      actor.send({ type: 'startEditingMessage', messageId: 'msg-2', originalMessage: originalMessage('second') });
      release?.();
      await settled(actor);
      expect(actor.getSnapshot().context.activeEditMessageId).toBe('msg-2');
      expect(actor.getSnapshot().context.editDraftAttachments).toEqual([]);
      actor.stop();
    });
  });

  // ===========================================================================
  // editSaving state
  // ===========================================================================
  describe('editSaving', () => {
    it('should enter pending on setEditDraftText', () => {
      const { actor } = createHarness();
      actor.start();
      actor.send({ type: 'setEditDraftText', text: 'editing...' });
      expect(actor.getSnapshot().matches({ editSaving: 'pending' })).toBe(true);
      actor.stop();
    });
  });

  // ===========================================================================
  // initializeFromChat
  // ===========================================================================
  describe('initializeFromChat', () => {
    it('should reset the open edit and leave every composer field alone', () => {
      const { actor } = createHarness();
      actor.start();
      actor.send({ type: 'setDraftText', text: 'typed' });
      actor.send({ type: 'setDraftMode', mode: 'plan' });
      actor.send({ type: 'startEditingMessage', messageId: 'msg-1', originalMessage: originalMessage('original') });
      actor.send({ type: 'initializeFromChat' });
      const { context } = actor.getSnapshot();
      expect(context).toMatchObject({
        draftText: 'typed',
        draftMode: 'plan',
        editDraftText: '',
        editDraftAttachments: [],
      });
      expect(context.activeEditMessageId).toBeUndefined();
      actor.stop();
    });
  });

  // ===========================================================================
  // Hydration (D7)
  // ===========================================================================
  describe('hydrateDraft', () => {
    const recordDraft = userMessage([
      { type: 'text', text: 'stored prompt' },
      { type: 'file', url: `attachments/${hashA}.pdf`, mediaType: 'application/pdf', filename: 'spec.pdf' },
    ]);
    const storedEdit = userMessage([{ type: 'text', text: 'stored edit' }]);

    it('should populate every field on a pristine composer without persisting', async () => {
      const { actor, drafts, edits, selections, stored } = createHarness();
      actor.start();
      actor.send({
        type: 'hydrateDraft',
        draft: recordDraft,
        messageEdits: { 'msg-1': storedEdit },
        toolChoice: 'required',
        mode: 'plan',
      });

      const { context } = actor.getSnapshot();
      expect(context).toMatchObject({
        draftText: 'stored prompt',
        draftAttachments: [{ hash: hashA, mediaType: 'application/pdf', filename: 'spec.pdf' }],
        messageEdits: { 'msg-1': storedEdit },
        draftToolChoice: 'required',
        draftMode: 'plan',
      });
      expect(allSavingIdle(actor)).toBe(true);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 250);
      });
      expect({ drafts, edits, selections, stored }).toEqual({ drafts: [], edits: [], selections: [], stored: [] });
      actor.stop();
    });

    it('should keep typed text and write it back when the composer was edited first', async () => {
      const { actor, drafts } = createHarness();
      actor.start();
      actor.send({ type: 'setDraftText', text: 'typed before the read' });
      actor.send({ type: 'hydrateDraft', draft: recordDraft, toolChoice: 'required', mode: 'plan' });

      const { context } = actor.getSnapshot();
      expect(context.draftText).toBe('typed before the read');
      expect(context.draftAttachments).toEqual([]);
      // Untouched fields still converge on the record.
      expect(context).toMatchObject({ draftToolChoice: 'required', draftMode: 'plan' });
      // The write-back skips the debounce.
      expect(actor.getSnapshot().matches({ inputSaving: 'persisting' })).toBe(true);
      await waitFor(actor, () => drafts.length === 1);
      expect(drafts[0]!.draft.parts).toEqual([{ type: 'text', text: 'typed before the read' }]);
      actor.stop();
    });

    it('should keep a locally chosen mode and write back only what was touched', async () => {
      const { actor, drafts, selections } = createHarness();
      actor.start();
      actor.send({ type: 'setDraftMode', mode: 'ask' });
      await waitFor(actor, () => selections.length === 1);
      actor.send({ type: 'hydrateDraft', draft: recordDraft, toolChoice: 'required', mode: 'plan' });

      const { context } = actor.getSnapshot();
      expect(context.draftMode).toBe('ask');
      expect(context.draftToolChoice).toBe('required');
      // The draft was never touched, so the stored one applies.
      expect(context.draftText).toBe('stored prompt');
      await waitFor(actor, () => selections.length === 2);
      expect(selections[1]).toEqual({ mode: 'ask' });
      expect(drafts).toEqual([]);
      actor.stop();
    });

    it('should apply stored edits only for messages the user has not edited', () => {
      const { actor } = createHarness();
      actor.start();
      actor.send({ type: 'startEditingMessage', messageId: 'msg-1', originalMessage: originalMessage('local edit') });
      actor.send({ type: 'exitEditMode' });
      actor.send({ type: 'startEditingMessage', messageId: 'msg-3', originalMessage: originalMessage('open edit') });
      actor.send({ type: 'clearMessageEdit', messageId: 'msg-4' });
      actor.send({
        type: 'hydrateDraft',
        messageEdits: {
          'msg-1': storedEdit,
          'msg-2': storedEdit,
          'msg-3': storedEdit,
          'msg-4': storedEdit,
        },
      });

      const { context } = actor.getSnapshot();
      expect(Object.keys(context.messageEdits).toSorted()).toEqual(['msg-1', 'msg-2']);
      expect(context.messageEdits['msg-1']!.parts).toEqual([{ type: 'text', text: 'local edit' }]);
      expect(context.messageEdits['msg-2']).toEqual(storedEdit);
      expect(context.editDraftText).toBe('open edit');
      actor.stop();
    });

    it('should convert a legacy data: URL in the record into a stored attachment and write it back', async () => {
      const { actor, drafts } = createHarness();
      actor.start();
      actor.send({
        type: 'hydrateDraft',
        draft: userMessage([
          { type: 'text', text: 'legacy' },
          { type: 'file', url: pngA, mediaType: 'image/png' },
        ]),
      });
      const attachment = await storedAs(pngA);
      await waitFor(actor, () => drafts.length === 1, { timeout: 1000 });
      expect(actor.getSnapshot().context.draftAttachments).toEqual([attachment]);
      expect(drafts[0]!.draft.parts).toEqual([
        { type: 'text', text: 'legacy' },
        { type: 'file', mediaType: 'image/png', url: `attachments/${attachment.hash}.png` },
      ]);
      actor.stop();
    });
  });

  // ===========================================================================
  // Attachment ingest
  //
  // `addDraftAttachment` / `addEditDraftAttachment` enqueue a data URL. Images
  // pass through `resizeImageActor` FIFO (captures may be preserved byte for
  // byte); documents skip it. Every entry then enters `storing`, where
  // `storeAttachmentActor` writes the bytes before the draft references them.
  // Failures surface via typed emits and add nothing.
  // ===========================================================================
  describe('attachment ingest', () => {
    it('should append the stored resized image to draftAttachments once the actors settle', async () => {
      const { actor, stored } = createHarness({ resize: async () => jpegResized });
      actor.start();
      actor.send({ type: 'addDraftAttachment', dataUrl: pngA, model: imageOnlyModel });
      await waitFor(actor, (snap) => snap.context.draftAttachments.length === 1);
      const snapshot = actor.getSnapshot();
      expect(snapshot.context.draftAttachments).toEqual([await storedAs(jpegResized)]);
      expect(stored[0]?.mediaType).toBe('image/jpeg');
      expect(snapshot.context.attachmentQueue).toEqual([]);
      actor.stop();
    });

    it('should append to editDraftAttachments when addEditDraftAttachment triggers the queue', async () => {
      const { actor } = createHarness({ resize: async () => jpegResized });
      actor.start();
      actor.send({ type: 'startEditingMessage', messageId: 'msg-1', originalMessage: originalMessage('original') });
      actor.send({ type: 'addEditDraftAttachment', dataUrl: pngA, model: imageOnlyModel });
      await waitFor(actor, (snap) => snap.context.editDraftAttachments.length === 1);
      const snapshot = actor.getSnapshot();
      expect(snapshot.context.editDraftAttachments).toEqual([await storedAs(jpegResized)]);
      expect(snapshot.context.draftAttachments).toEqual([]);
      expect(snapshot.context.attachmentQueue).toEqual([]);
      actor.stop();
    });

    it('should preserve FIFO insertion order when multiple images are sent in a burst', async () => {
      const delayByInput = new Map<string, number>([
        [pngA, 50],
        [pngB, 5],
        [pngC, 10],
      ]);
      const { actor } = createHarness({
        resize: async (image) => {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, delayByInput.get(image) ?? 0);
          });
          return image;
        },
      });
      actor.start();
      actor.send({ type: 'addDraftAttachment', dataUrl: pngA, model: imageOnlyModel });
      actor.send({ type: 'addDraftAttachment', dataUrl: pngB, model: imageOnlyModel });
      actor.send({ type: 'addDraftAttachment', dataUrl: pngC, model: imageOnlyModel });
      await waitFor(actor, (snap) => snap.context.draftAttachments.length === 3);
      expect(actor.getSnapshot().context.draftAttachments).toEqual([
        await storedAs(pngA),
        await storedAs(pngB),
        await storedAs(pngC),
      ]);
      actor.stop();
    });

    it('should preserve FIFO order across N enqueues with mixed targets, kinds and adversarial delays', async () => {
      const delayByInput = new Map<string, number>([
        [pngA, 50],
        [pngB, 40],
        [pngC, 30],
      ]);
      const { actor, stored } = createHarness({
        resize: async (image) => {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, delayByInput.get(image) ?? 0);
          });
          return image;
        },
      });
      actor.start();
      actor.send({ type: 'startEditingMessage', messageId: 'msg-1', originalMessage: originalMessage('original') });
      actor.send({ type: 'addDraftAttachment', dataUrl: pngA, model: imageAndPdfModel });
      actor.send({ type: 'addDraftAttachment', dataUrl: pdf, filename: 'spec.pdf', model: imageAndPdfModel });
      actor.send({ type: 'addEditDraftAttachment', dataUrl: pngB, model: imageAndPdfModel });
      actor.send({ type: 'addDraftAttachment', dataUrl: pngC, model: imageAndPdfModel });
      actor.send({ type: 'addEditDraftAttachment', dataUrl: pngA, model: imageAndPdfModel });
      await settled(actor);
      const snapshot = actor.getSnapshot();
      expect(snapshot.context.draftAttachments).toEqual([
        await storedAs(pngA),
        await storedAs(pdf, 'spec.pdf'),
        await storedAs(pngC),
      ]);
      expect(snapshot.context.editDraftAttachments).toEqual([await storedAs(pngB), await storedAs(pngA)]);
      expect(stored.map((entry) => entry.mediaType)).toEqual([
        'image/png',
        'application/pdf',
        'image/png',
        'image/png',
        'image/png',
      ]);
      actor.stop();
    });

    it('should store a PDF without resizing it', async () => {
      const { actor, resized, stored } = createHarness();
      actor.start();
      actor.send({ type: 'addDraftAttachment', dataUrl: pdf, filename: 'spec.pdf', model: imageAndPdfModel });
      await waitFor(actor, (snap) => snap.context.draftAttachments.length === 1);
      expect(resized).toEqual([]);
      expect(stored).toEqual([{ bytes: bytesOf(pdf), mediaType: 'application/pdf', filename: 'spec.pdf' }]);
      expect(actor.getSnapshot().context.draftAttachments).toEqual([await storedAs(pdf, 'spec.pdf')]);
      actor.stop();
    });

    it('should emit imageResizeFailed when the resize actor rejects', async () => {
      const { actor } = createHarness({
        resize: async () => {
          throw new Error('Failed to load image');
        },
      });
      const emitSpy = vi.fn<(event: Extract<DraftEmittedEvents, { type: 'imageResizeFailed' }>) => void>();
      actor.on('imageResizeFailed', emitSpy);
      actor.start();
      actor.send({ type: 'addDraftAttachment', dataUrl: pngA, model: imageOnlyModel });
      await settled(actor);
      expect(emitSpy).toHaveBeenCalledOnce();
      const event = emitSpy.mock.calls[0]![0];
      expect(event.error).toBeInstanceOf(Error);
      expect(event.error.message).toBe('Failed to load image');
      expect(event.error.name).toBe('Error');
      expect(actor.getSnapshot().context.draftAttachments).toEqual([]);
      actor.stop();
    });

    it('should emit attachmentStoreFailed and add nothing when storing rejects', async () => {
      const { actor, drafts } = createHarness({
        store: async () => {
          throw new Error('Attachment exceeds the 20 MB limit for documents.');
        },
      });
      const emitSpy = vi.fn<(event: Extract<DraftEmittedEvents, { type: 'attachmentStoreFailed' }>) => void>();
      actor.on('attachmentStoreFailed', emitSpy);
      actor.start();
      actor.send({ type: 'addDraftAttachment', dataUrl: pdf, model: imageAndPdfModel });
      await settled(actor);
      expect(emitSpy).toHaveBeenCalledOnce();
      expect(emitSpy.mock.calls[0]![0].error.message).toBe('Attachment exceeds the 20 MB limit for documents.');
      expect(actor.getSnapshot().context.draftAttachments).toEqual([]);
      expect(actor.getSnapshot().matches({ inputSaving: 'idle' })).toBe(true);
      expect(drafts).toEqual([]);
      actor.stop();
    });

    it('should emit attachmentStoreFailed without storing when the source is not a base64 data URL', async () => {
      const { actor, stored, resized } = createHarness();
      const emitSpy = vi.fn<(event: Extract<DraftEmittedEvents, { type: 'attachmentStoreFailed' }>) => void>();
      actor.on('attachmentStoreFailed', emitSpy);
      actor.start();
      actor.send({ type: 'addDraftAttachment', dataUrl: 'not a data url', model: imageAndPdfModel });
      expect(emitSpy).toHaveBeenCalledOnce();
      expect(emitSpy.mock.calls[0]![0].error.message).toBe('The attachment is not a base64 data URL.');
      expect(actor.getSnapshot().context.attachmentQueue).toEqual([]);
      await settled(actor);
      expect({ stored, resized }).toEqual({ stored: [], resized: [] });
      actor.stop();
    });

    it('should refuse a PDF before storing when the selected model cannot read PDFs', async () => {
      const { actor, stored, resized } = createHarness();
      const emitSpy = vi.fn<(event: Extract<DraftEmittedEvents, { type: 'attachmentRefused' }>) => void>();
      actor.on('attachmentRefused', emitSpy);
      actor.start();
      actor.send({ type: 'addDraftAttachment', dataUrl: pdf, filename: 'spec.pdf', model: imageOnlyModel });
      expect(emitSpy).toHaveBeenCalledOnce();
      expect(emitSpy.mock.calls[0]![0]).toEqual({
        type: 'attachmentRefused',
        kind: 'document',
        mediaType: 'application/pdf',
        modelName: 'Gemini Flash',
      });
      expect(actor.getSnapshot().context.attachmentQueue).toEqual([]);
      await settled(actor);
      expect({ stored, resized }).toEqual({ stored: [], resized: [] });
      expect(actor.getSnapshot().context.draftAttachments).toEqual([]);
      actor.stop();
    });

    it('should refuse an image before resizing when the selected model cannot read images', () => {
      const { actor, resized } = createHarness();
      const emitSpy = vi.fn<(event: Extract<DraftEmittedEvents, { type: 'attachmentRefused' }>) => void>();
      actor.on('attachmentRefused', emitSpy);
      actor.start();
      actor.send({ type: 'addEditDraftAttachment', dataUrl: pngA, model: textOnlyModel });
      expect(emitSpy.mock.calls[0]![0]).toMatchObject({ kind: 'image', modelName: 'Text Model' });
      expect(actor.getSnapshot().context.attachmentQueue).toEqual([]);
      expect(resized).toEqual([]);
      actor.stop();
    });

    it('should drain the queue past a single failure (subsequent images still process)', async () => {
      const emitSpy = vi.fn();
      const { actor } = createHarness({
        resize: async (image) => {
          if (image === pngA) {
            throw new Error('boom');
          }
          return image;
        },
      });
      actor.on('imageResizeFailed', emitSpy);
      actor.start();
      actor.send({ type: 'addDraftAttachment', dataUrl: pngA, model: imageOnlyModel });
      actor.send({ type: 'addDraftAttachment', dataUrl: pngB, model: imageOnlyModel });
      await waitFor(actor, (snap) => snap.context.draftAttachments.length === 1);
      expect(actor.getSnapshot().context.draftAttachments).toEqual([await storedAs(pngB)]);
      expect(emitSpy).toHaveBeenCalledOnce();
      actor.stop();
    });

    it('should not invoke the resize actor when the queue is empty', async () => {
      const resizeSpy = vi.fn(async (image: string) => image);
      const { actor } = createHarness({ resize: resizeSpy });
      actor.start();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(resizeSpy).not.toHaveBeenCalled();
      actor.stop();
    });

    it('should clear pending queue entries on clearDraft', () => {
      const { actor } = createHarness({ resize: pendingForever });
      actor.start();
      actor.send({ type: 'addDraftAttachment', dataUrl: pngA, model: imageOnlyModel });
      actor.send({ type: 'addDraftAttachment', dataUrl: pngB, model: imageOnlyModel });
      expect(actor.getSnapshot().context.attachmentQueue.length).toBeGreaterThan(0);
      actor.send({ type: 'clearDraft' });
      expect(actor.getSnapshot().context.attachmentQueue).toEqual([]);
      expect(actor.getSnapshot().context.draftAttachments).toEqual([]);
      actor.stop();
    });

    it('should clear pending edit queue entries on clearEditDraft', () => {
      const { actor } = createHarness({ resize: pendingForever });
      actor.start();
      actor.send({ type: 'addEditDraftAttachment', dataUrl: pngA, model: imageOnlyModel });
      actor.send({ type: 'addEditDraftAttachment', dataUrl: pngB, model: imageOnlyModel });
      expect(actor.getSnapshot().context.attachmentQueue.length).toBeGreaterThan(0);
      actor.send({ type: 'clearEditDraft' });
      expect(actor.getSnapshot().context.attachmentQueue).toEqual([]);
      expect(actor.getSnapshot().context.editDraftAttachments).toEqual([]);
      actor.stop();
    });

    it('should not attach an in-flight main attachment to the edit draft after clearDraft', async () => {
      let release: (() => void) | undefined;
      const { actor, stored } = createHarness({
        store: async ({ bytes, mediaType }) => {
          if (stored.length === 1) {
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          }
          return { hash: await sha256Bytes(bytes), mediaType, byteLength: bytes.byteLength };
        },
      });
      actor.start();
      actor.send({ type: 'startEditingMessage', messageId: 'msg-1', originalMessage: originalMessage('original') });
      actor.send({ type: 'addDraftAttachment', dataUrl: pngA, model: imageOnlyModel });
      actor.send({ type: 'addEditDraftAttachment', dataUrl: pngB, model: imageOnlyModel });
      await waitFor(actor, () => stored.length === 1);
      actor.send({ type: 'clearDraft' });
      release?.();
      await settled(actor);
      const { context } = actor.getSnapshot();
      expect(context.draftAttachments).toEqual([]);
      expect(context.editDraftAttachments).toEqual([await storedAs(pngB)]);
      actor.stop();
    });

    it('should NOT append directly when addDraftAttachment event fires (must go through queue + resize)', async () => {
      const { actor } = createHarness({ resize: pendingForever });
      actor.start();
      actor.send({ type: 'addDraftAttachment', dataUrl: pngA, model: imageOnlyModel });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
      const snapshot = actor.getSnapshot();
      expect(snapshot.context.draftAttachments).toEqual([]);
      expect(snapshot.context.attachmentQueue.length).toBe(1);
      actor.stop();
    });

    it('should stop the in-flight resize actor without surfacing unhandled rejection when the parent actor stops', () => {
      const { actor } = createHarness({ resize: pendingForever });
      actor.start();
      actor.send({ type: 'addDraftAttachment', dataUrl: pngA, model: imageOnlyModel });
      expect(() => actor.stop()).not.toThrow();
      expect(actor.getSnapshot().status).toBe('stopped');
    });
  });

  // ===========================================================================
  // attachmentKinds — what the send gate checks against the selected model
  // ===========================================================================
  describe('attachmentKinds', () => {
    it('should report the kinds each draft holds', async () => {
      const { actor } = createHarness();
      actor.start();
      expect(attachmentKinds(actor.getSnapshot().context, 'main')).toEqual([]);
      actor.send({ type: 'addDraftAttachment', dataUrl: pdf, model: imageAndPdfModel });
      await waitFor(actor, (snap) => snap.context.draftAttachments.length === 1);
      expect(attachmentKinds(actor.getSnapshot().context, 'main')).toEqual(['document']);
      actor.send({ type: 'addDraftAttachment', dataUrl: pngA, model: imageAndPdfModel });
      await waitFor(actor, (snap) => snap.context.draftAttachments.length === 2);
      expect(attachmentKinds(actor.getSnapshot().context, 'main')).toEqual(['image', 'document']);
      expect(attachmentKinds(actor.getSnapshot().context, 'edit')).toEqual([]);
      actor.send({ type: 'removeDraftAttachment', index: 0 });
      expect(attachmentKinds(actor.getSnapshot().context, 'main')).toEqual(['image']);
      actor.stop();
    });

    it('should return the same array for the same kinds, so selectors do not re-render', async () => {
      const { actor } = createHarness();
      actor.start();
      actor.send({ type: 'addDraftAttachment', dataUrl: pngA, model: imageOnlyModel });
      await waitFor(actor, (snap) => snap.context.draftAttachments.length === 1);
      const first = attachmentKinds(actor.getSnapshot().context, 'main');
      actor.send({ type: 'setDraftText', text: 'x' });
      expect(attachmentKinds(actor.getSnapshot().context, 'main')).toBe(first);
      actor.stop();
    });
  });
});
