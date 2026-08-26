import { describe, it, expect, vi, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor, waitFor } from 'xstate';
import type { MyUIMessage } from '@taucad/chat';
import type { ChatMode } from '@taucad/chat/constants';
import { draftMachine } from '#hooks/draft.machine.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';

type PersistDraftInput = { chatId: string; draft: MyUIMessage };

function createTestActor(options?: { chatId?: string; resize?: (image: string) => Promise<string> }) {
  const machine = draftMachine.provide({
    actors: {
      // oxlint-disable-next-line no-empty-function -- mock stub
      persistDraftActor: fromSafeAsync(async () => {}),
      // oxlint-disable-next-line no-empty-function -- mock stub
      persistEditDraftActor: fromSafeAsync(async () => {}),
      // oxlint-disable-next-line no-empty-function -- mock stub
      clearMessageEditActor: fromSafeAsync(async () => {}),
      resizeImageActor: fromSafeAsync<
        { type: 'imageResized'; resized: string },
        { image: string; preserveOriginal: boolean }
      >(async ({ input }) => {
        const resizer = options?.resize ?? (async (image) => image);
        const resized = await resizer(input.image);
        return { type: 'imageResized', resized };
      }),
    },
  });

  return createActor(machine, {
    input: { chatId: options?.chatId },
  });
}

function createTestActorWithPersistCapture(options: { chatId: string; onPersist: (input: PersistDraftInput) => void }) {
  const machine = draftMachine.provide({
    actors: {
      persistDraftActor: fromSafeAsync(async ({ input }: { input: PersistDraftInput }) => {
        options.onPersist(input);
      }),
      // oxlint-disable-next-line no-empty-function -- mock stub
      persistEditDraftActor: fromSafeAsync(async () => {}),
      // oxlint-disable-next-line no-empty-function -- mock stub
      clearMessageEditActor: fromSafeAsync(async () => {}),
      resizeImageActor: fromSafeAsync<
        { type: 'imageResized'; resized: string },
        { image: string; preserveOriginal: boolean }
      >(async ({ input }) => ({ type: 'imageResized', resized: input.image })),
    },
  });

  return createActor(machine, {
    input: { chatId: options.chatId },
  });
}

function createTestActorWithDeferredPersist(options: {
  chatId: string;
  onPersist: (input: PersistDraftInput, resolve: () => void) => void;
}) {
  const machine = draftMachine.provide({
    actors: {
      persistDraftActor: fromSafeAsync(async ({ input }: { input: PersistDraftInput }) => {
        await new Promise<void>((resolve) => {
          options.onPersist(input, resolve);
        });
      }),
      // oxlint-disable-next-line no-empty-function -- mock stub
      persistEditDraftActor: fromSafeAsync(async () => {}),
      // oxlint-disable-next-line no-empty-function -- mock stub
      clearMessageEditActor: fromSafeAsync(async () => {}),
      resizeImageActor: fromSafeAsync<
        { type: 'imageResized'; resized: string },
        { image: string; preserveOriginal: boolean }
      >(async ({ input }) => ({ type: 'imageResized', resized: input.image })),
    },
  });

  return createActor(machine, {
    input: { chatId: options.chatId },
  });
}

describe('draftMachine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Context initialization
  // ===========================================================================
  describe('context initialization', () => {
    it('should initialize with correct defaults', () => {
      const actor = createTestActor();
      actor.start();
      const { context } = actor.getSnapshot();
      expect(context.draftText).toBe('');
      expect(context.draftImages).toEqual([]);
      expect(context.draftToolChoice).toBe('auto');
      expect(context.draftMode).toBe('agent');
      expect(context.messageEdits).toEqual({});
      expect(context.activeEditMessageId).toBeUndefined();
      expect(context.editDraftText).toBe('');
      expect(context.editDraftImages).toEqual([]);
      actor.stop();
    });
  });

  // ===========================================================================
  // Draft text events
  // ===========================================================================
  describe('draft text events', () => {
    it('should set draft text', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'setDraftText', text: 'hello world' });
      expect(actor.getSnapshot().context.draftText).toBe('hello world');
      actor.stop();
    });

    it('should load a draft from a message transiently without invoking persistence', async () => {
      const persistInputs: PersistDraftInput[] = [];
      const actor = createTestActorWithPersistCapture({
        chatId: 'chat_abc',
        onPersist(input) {
          persistInputs.push(input);
        },
      });
      actor.start();

      actor.send({
        type: 'loadDraftFromMessageTransient',
        draft: {
          id: 'draft',
          role: 'user',
          parts: [
            { type: 'text', text: 'restored prompt' },
            { type: 'file', url: 'data:image/png;base64,AAA', mediaType: 'image/png' },
          ],
          metadata: { createdAt: 1, status: 'pending' },
        },
      });

      await Promise.resolve();

      expect(actor.getSnapshot().context.draftText).toBe('restored prompt');
      expect(actor.getSnapshot().context.draftImages).toEqual(['data:image/png;base64,AAA']);
      expect(persistInputs).toEqual([]);
      actor.stop();
    });

    it('should add draft image (after resize chokepoint settles)', async () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'addDraftImage', image: 'data:image/png;base64,abc' });
      await waitFor(actor, (s) => s.context.draftImages.length === 1);
      expect(actor.getSnapshot().context.draftImages).toEqual(['data:image/png;base64,abc']);
      actor.send({ type: 'addDraftImage', image: 'data:image/png;base64,def' });
      await waitFor(actor, (s) => s.context.draftImages.length === 2);
      expect(actor.getSnapshot().context.draftImages).toHaveLength(2);
      actor.stop();
    });

    it('should remove draft image by index (after resize chokepoint settles)', async () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'addDraftImage', image: 'img-a' });
      actor.send({ type: 'addDraftImage', image: 'img-b' });
      actor.send({ type: 'addDraftImage', image: 'img-c' });
      await waitFor(actor, (s) => s.context.draftImages.length === 3);
      actor.send({ type: 'removeDraftImage', index: 1 });
      expect(actor.getSnapshot().context.draftImages).toEqual(['img-a', 'img-c']);
      actor.stop();
    });

    it('should clear draft (text, images, tool choice)', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'setDraftText', text: 'some text' });
      actor.send({ type: 'addDraftImage', image: 'img-a' });
      actor.send({ type: 'setDraftToolChoice', toolChoice: 'required' });
      actor.send({ type: 'clearDraft' });
      const { context } = actor.getSnapshot();
      expect(context.draftText).toBe('');
      expect(context.draftImages).toEqual([]);
      expect(context.draftToolChoice).toBe('auto');
      actor.stop();
    });

    it('should set draft mode', () => {
      const actor = createTestActor();
      actor.start();
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- intentionally invalid value for error-path testing
      actor.send({ type: 'setDraftMode', mode: 'edit' as unknown as ChatMode });
      expect(actor.getSnapshot().context.draftMode).toBe('edit');
      actor.stop();
    });

    it('should set draft tool choice', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'setDraftToolChoice', toolChoice: 'required' });
      expect(actor.getSnapshot().context.draftToolChoice).toBe('required');
      actor.stop();
    });
  });

  // ===========================================================================
  // inputSaving state
  // ===========================================================================
  describe('inputSaving', () => {
    it('should enter pending on setDraftText', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'setDraftText', text: 'typing...' });
      expect(actor.getSnapshot().matches({ inputSaving: 'pending' })).toBe(true);
      actor.stop();
    });

    it('should persist after debounce (200ms) when chatId is valid', async () => {
      vi.useFakeTimers();
      try {
        const actor = createTestActor({ chatId: 'chat_abc' });
        actor.start();
        actor.send({ type: 'setDraftText', text: 'save me' });
        expect(actor.getSnapshot().matches({ inputSaving: 'pending' })).toBe(true);

        await vi.advanceTimersByTimeAsync(200);
        await waitFor(actor, (s) => s.matches({ inputSaving: 'idle' }));
        expect(actor.getSnapshot().matches({ inputSaving: 'idle' })).toBe(true);
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should NOT persist when chatId is invalid (no chat_ prefix)', async () => {
      vi.useFakeTimers();
      try {
        const actor = createTestActor({ chatId: 'invalid-id' });
        actor.start();
        actor.send({ type: 'setDraftText', text: 'no save' });
        expect(actor.getSnapshot().matches({ inputSaving: 'pending' })).toBe(true);

        await vi.advanceTimersByTimeAsync(200);

        // Guard fails so it falls back to idle without persisting
        expect(actor.getSnapshot().matches({ inputSaving: 'idle' })).toBe(true);
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ===========================================================================
  // clearDraft persistence across inputSaving states
  // ===========================================================================
  describe('clearDraft persistence', () => {
    it('should persist empty draft when clearDraft fires during idle state', async () => {
      const persistInputs: Array<{ chatId: string; draft: MyUIMessage }> = [];
      const actor = createTestActorWithPersistCapture({
        chatId: 'chat_abc',
        onPersist(input) {
          persistInputs.push(input);
        },
      });
      actor.start();

      actor.send({ type: 'setDraftText', text: 'will be cleared' });
      // ClearDraft resets context immediately; we want inputSaving in idle first
      // so advance past the debounce to let the initial save complete
      vi.useFakeTimers();
      try {
        await vi.advanceTimersByTimeAsync(200);
        await waitFor(actor, (s) => s.matches({ inputSaving: 'idle' }));

        persistInputs.length = 0;
        actor.send({ type: 'clearDraft' });

        expect(actor.getSnapshot().matches({ inputSaving: 'persisting' })).toBe(true);

        await waitFor(actor, (s) => s.matches({ inputSaving: 'idle' }));
        expect(persistInputs).toHaveLength(1);
        expect(persistInputs[0]!.draft.parts).toEqual([]);
      } finally {
        actor.stop();
        vi.useRealTimers();
      }
    });

    it('should persist empty draft when clearDraft fires during pending state', async () => {
      const persistInputs: Array<{ chatId: string; draft: MyUIMessage }> = [];
      const actor = createTestActorWithPersistCapture({
        chatId: 'chat_abc',
        onPersist(input) {
          persistInputs.push(input);
        },
      });
      actor.start();
      vi.useFakeTimers();
      try {
        actor.send({ type: 'setDraftText', text: 'typed before send' });
        expect(actor.getSnapshot().matches({ inputSaving: 'pending' })).toBe(true);

        // Fire clearDraft while still in pending (before 200ms debounce)
        actor.send({ type: 'clearDraft' });

        // Should bypass debounce and go straight to persisting
        expect(actor.getSnapshot().matches({ inputSaving: 'persisting' })).toBe(true);
        expect(actor.getSnapshot().context.draftText).toBe('');

        await waitFor(actor, (s) => s.matches({ inputSaving: 'idle' }));
        expect(persistInputs).toHaveLength(1);
        expect(persistInputs[0]!.draft.parts).toEqual([]);
      } finally {
        actor.stop();
        vi.useRealTimers();
      }
    });

    it('should re-persist empty draft when clearDraft fires during persisting state', async () => {
      const persistInputs: Array<{ chatId: string; draft: MyUIMessage }> = [];
      let resolveCurrentPersist: (() => void) | undefined;

      const actor = createTestActorWithDeferredPersist({
        chatId: 'chat_abc',
        onPersist(input, resolve) {
          persistInputs.push(input);
          resolveCurrentPersist = resolve;
        },
      });
      actor.start();
      vi.useFakeTimers();
      try {
        actor.send({ type: 'setDraftText', text: 'stale content' });
        expect(actor.getSnapshot().matches({ inputSaving: 'pending' })).toBe(true);

        // Let debounce fire so inputSaving enters persisting with stale text
        await vi.advanceTimersByTimeAsync(200);
        expect(actor.getSnapshot().matches({ inputSaving: 'persisting' })).toBe(true);
        expect(persistInputs).toHaveLength(1);

        const staleParts = persistInputs[0]!.draft.parts;
        const staleTextPart = staleParts.find((p) => p.type === 'text');
        expect(staleTextPart?.text).toBe('stale content');

        // Fire clearDraft while the stale persist is in-flight
        actor.send({ type: 'clearDraft' });

        // Should re-enter persisting, cancelling the stale invoke
        expect(actor.getSnapshot().matches({ inputSaving: 'persisting' })).toBe(true);
        expect(actor.getSnapshot().context.draftText).toBe('');

        // The re-enter started a NEW persist invoke with the empty draft
        expect(persistInputs).toHaveLength(2);
        expect(persistInputs[1]!.draft.parts).toEqual([]);

        // Resolve the new persist so the machine settles
        resolveCurrentPersist?.();
        await waitFor(actor, (s) => s.matches({ inputSaving: 'idle' }));
      } finally {
        actor.stop();
        vi.useRealTimers();
      }
    });
  });

  // ===========================================================================
  // Edit mode
  // ===========================================================================
  describe('edit mode', () => {
    it('should start editing a message', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({
        type: 'startEditingMessage',
        messageId: 'msg-1',
        originalMessage: mock<MyUIMessage>({
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'original text' }],
          metadata: { createdAt: Date.now(), status: 'pending' },
        }),
      });
      expect(actor.getSnapshot().context.activeEditMessageId).toBe('msg-1');
      expect(actor.getSnapshot().context.editDraftText).toBe('original text');
      actor.stop();
    });

    it('should set edit draft text', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({
        type: 'startEditingMessage',
        messageId: 'msg-1',
        originalMessage: mock<MyUIMessage>({
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'original' }],
          metadata: { createdAt: Date.now(), status: 'pending' },
        }),
      });
      actor.send({ type: 'setEditDraftText', text: 'edited text' });
      expect(actor.getSnapshot().context.editDraftText).toBe('edited text');
      actor.stop();
    });

    it('should exit edit mode and save to messageEdits', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({
        type: 'startEditingMessage',
        messageId: 'msg-1',
        originalMessage: mock<MyUIMessage>({
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'original' }],
          metadata: { createdAt: Date.now(), status: 'pending' },
        }),
      });
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

    it('should clear message edit', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({
        type: 'startEditingMessage',
        messageId: 'msg-1',
        originalMessage: mock<MyUIMessage>({
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'original' }],
          metadata: { createdAt: Date.now(), status: 'pending' },
        }),
      });
      actor.send({ type: 'exitEditMode' });
      expect(actor.getSnapshot().context.messageEdits['msg-1']).toBeDefined();

      actor.send({ type: 'clearMessageEdit', messageId: 'msg-1' });
      expect(actor.getSnapshot().context.messageEdits['msg-1']).toBeUndefined();
      actor.stop();
    });
  });

  // ===========================================================================
  // editSaving state
  // ===========================================================================
  describe('editSaving', () => {
    it('should enter pending on setEditDraftText', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'setEditDraftText', text: 'editing...' });
      expect(actor.getSnapshot().matches({ editSaving: 'pending' })).toBe(true);
      actor.stop();
    });
  });

  // ===========================================================================
  // Image resize chokepoint
  //
  // The machine owns image processing. `addDraftImage` / `addEditDraftImage`
  // events enqueue raw data URLs; the `imageProcessing` parallel sub-region
  // invokes `resizeImageActor` FIFO to either resize user uploads or retain
  // generated captures byte-for-byte. Failures surface via the typed
  // `imageResizeFailed` emit.
  // ===========================================================================
  describe('image resize chokepoint', () => {
    it('should append the resized URL to draftImages once the resize actor settles', async () => {
      const actor = createTestActor({ resize: async () => 'data:image/jpeg;base64,RESIZED' });
      actor.start();
      actor.send({ type: 'addDraftImage', image: 'RAW' });
      await waitFor(actor, (snap) => snap.context.draftImages.length === 1);
      const snapshot = actor.getSnapshot();
      expect(snapshot.context.draftImages).toEqual(['data:image/jpeg;base64,RESIZED']);
      expect(snapshot.context.imageQueue).toEqual([]);
      actor.stop();
    });

    it('should append to editDraftImages when addEditDraftImage triggers the queue', async () => {
      const actor = createTestActor({ resize: async () => 'data:image/jpeg;base64,EDIT_RESIZED' });
      actor.start();
      actor.send({ type: 'addEditDraftImage', image: 'RAW_EDIT' });
      await waitFor(actor, (snap) => snap.context.editDraftImages.length === 1);
      const snapshot = actor.getSnapshot();
      expect(snapshot.context.editDraftImages).toEqual(['data:image/jpeg;base64,EDIT_RESIZED']);
      expect(snapshot.context.draftImages).toEqual([]);
      expect(snapshot.context.imageQueue).toEqual([]);
      actor.stop();
    });

    it('should preserve FIFO insertion order when multiple images are sent in a burst', async () => {
      const delayByInput = new Map<string, number>([
        ['A', 50],
        ['B', 5],
        ['C', 10],
      ]);
      const actor = createTestActor({
        resize: async (image) => {
          const head = image[0] ?? '';
          await new Promise<void>((resolve) => {
            setTimeout(resolve, delayByInput.get(head) ?? 0);
          });
          return `${image}_R`;
        },
      });
      actor.start();
      actor.send({ type: 'addDraftImage', image: 'A' });
      actor.send({ type: 'addDraftImage', image: 'B' });
      actor.send({ type: 'addDraftImage', image: 'C' });
      await waitFor(actor, (snap) => snap.context.draftImages.length === 3);
      expect(actor.getSnapshot().context.draftImages).toEqual(['A_R', 'B_R', 'C_R']);
      actor.stop();
    });

    it('should preserve FIFO order across N enqueues with mixed targets and adversarial delays', async () => {
      const delayByInput = new Map<string, number>([
        ['A', 50],
        ['B', 40],
        ['C', 30],
        ['D', 20],
        ['E', 10],
      ]);
      const callOrder: string[] = [];
      const actor = createTestActor({
        resize: async (image) => {
          callOrder.push(image);
          const head = image[0] ?? '';
          await new Promise<void>((resolve) => {
            setTimeout(resolve, delayByInput.get(head) ?? 0);
          });
          return `${image}_R`;
        },
      });
      actor.start();
      actor.send({ type: 'addDraftImage', image: 'A' });
      actor.send({ type: 'addDraftImage', image: 'B' });
      actor.send({ type: 'addEditDraftImage', image: 'C' });
      actor.send({ type: 'addDraftImage', image: 'D' });
      actor.send({ type: 'addEditDraftImage', image: 'E' });
      await waitFor(
        actor,
        (snap) => snap.context.draftImages.length === 3 && snap.context.editDraftImages.length === 2,
      );
      const snapshot = actor.getSnapshot();
      expect(snapshot.context.draftImages).toEqual(['A_R', 'B_R', 'D_R']);
      expect(snapshot.context.editDraftImages).toEqual(['C_R', 'E_R']);
      expect(callOrder).toEqual(['A', 'B', 'C', 'D', 'E']);
      actor.stop();
    });

    it('should emit imageResizeFailed when the resize actor rejects', async () => {
      const actor = createTestActor({
        resize: async () => {
          throw new Error('Failed to load image');
        },
      });
      const emitSpy = vi.fn<(event: { type: 'imageResizeFailed'; error: Error }) => void>();
      actor.on('imageResizeFailed', emitSpy);
      actor.start();
      actor.send({ type: 'addDraftImage', image: 'BAD' });
      await waitFor(actor, (snap) => snap.context.imageQueue.length === 0);
      expect(emitSpy).toHaveBeenCalledOnce();
      const event = emitSpy.mock.calls[0]![0];
      expect(event.error).toBeInstanceOf(Error);
      expect(event.error.message).toBe('Failed to load image');
      expect(event.error.name).toBe('Error');
      expect(actor.getSnapshot().context.draftImages).toEqual([]);
      actor.stop();
    });

    it('should drain the queue past a single failure (subsequent images still process)', async () => {
      const emitSpy = vi.fn();
      const actor = createTestActor({
        resize: async (image) => {
          if (image === 'BAD') {
            throw new Error('boom');
          }
          return `${image}_R`;
        },
      });
      actor.on('imageResizeFailed', emitSpy);
      actor.start();
      actor.send({ type: 'addDraftImage', image: 'BAD' });
      actor.send({ type: 'addDraftImage', image: 'GOOD' });
      await waitFor(actor, (snap) => snap.context.draftImages.length === 1);
      expect(actor.getSnapshot().context.draftImages).toEqual(['GOOD_R']);
      expect(emitSpy).toHaveBeenCalledOnce();
      actor.stop();
    });

    it('should not invoke the resize actor when the queue is empty', async () => {
      const resizeSpy = vi.fn(async (image: string) => image);
      const actor = createTestActor({ resize: resizeSpy });
      actor.start();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(resizeSpy).not.toHaveBeenCalled();
      actor.stop();
    });

    it('should clear pending queue entries on clearDraft', async () => {
      const actor = createTestActor({
        resize: async () =>
          new Promise<string>(() => {
            // Never resolves — keeps the in-flight resize pending so we can assert clear behavior.
          }),
        chatId: 'chat_abc',
      });
      actor.start();
      actor.send({ type: 'addDraftImage', image: 'A' });
      actor.send({ type: 'addDraftImage', image: 'B' });
      expect(actor.getSnapshot().context.imageQueue.length).toBeGreaterThan(0);
      actor.send({ type: 'clearDraft' });
      expect(actor.getSnapshot().context.imageQueue).toEqual([]);
      expect(actor.getSnapshot().context.draftImages).toEqual([]);
      actor.stop();
    });

    it('should clear pending edit queue entries on clearEditDraft', () => {
      const actor = createTestActor({
        resize: async () =>
          new Promise<string>(() => {
            // Never resolves — keeps the edit resize pending so we can assert clear behavior.
          }),
      });
      actor.start();
      actor.send({ type: 'addEditDraftImage', image: 'A' });
      actor.send({ type: 'addEditDraftImage', image: 'B' });
      expect(actor.getSnapshot().context.imageQueue.length).toBeGreaterThan(0);
      actor.send({ type: 'clearEditDraft' });
      expect(actor.getSnapshot().context.imageQueue).toEqual([]);
      expect(actor.getSnapshot().context.editDraftImages).toEqual([]);
      actor.stop();
    });

    it('should NOT append directly when addDraftImage event fires (must go through queue + resize)', async () => {
      const actor = createTestActor({
        resize: async () =>
          new Promise<string>(() => {
            // Never resolves — guarantees the queue entry stays pending so we can assert no direct append.
          }),
      });
      actor.start();
      actor.send({ type: 'addDraftImage', image: 'RAW' });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
      const snapshot = actor.getSnapshot();
      expect(snapshot.context.draftImages).toEqual([]);
      expect(snapshot.context.imageQueue.length).toBe(1);
      actor.stop();
    });

    it('should stop the in-flight resize actor without surfacing unhandled rejection when the parent actor stops', () => {
      const actor = createTestActor({
        resize: async () =>
          new Promise<string>(() => {
            // Never resolves — confirms the parent stop tears down the in-flight resize cleanly.
          }),
      });
      actor.start();
      actor.send({ type: 'addDraftImage', image: 'RAW' });
      expect(() => actor.stop()).not.toThrow();
    });
  });
});
