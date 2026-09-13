import { describe, it, expect, vi, afterEach } from 'vitest';
import { createActor, waitFor } from 'xstate';
import type { Chat, MyUIMessage } from '@taucad/chat';
import type { ChatError } from '@taucad/types';
import type { KernelId } from '@taucad/types/constants';
import { chatPersistenceMachine } from '#hooks/chat-persistence.machine.js';
import type { ChatRequest, ChatRetrievedEvent, RequestTerminationCause } from '#hooks/chat-persistence.machine.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';

type MockMessage = { id: string; role: string; parts: Array<{ type: string; text?: string }> };

function createMockChat(overrides?: Partial<Chat>): Chat {
  return {
    id: 'chat_test',
    resourceId: '',
    name: '',
    messages: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function createTestActor(options?: {
  loadResult?: Chat | undefined | (() => Promise<Chat | undefined>);
  persistResult?: () => Promise<void>;
  persistErrorResult?: () => Promise<void>;
  clearErrorResult?: () => Promise<void>;
  activeChatId?: string;
}) {
  const machine = chatPersistenceMachine.provide({
    actors: {
      loadChatActor: fromSafeAsync(async () => {
        const chat = typeof options?.loadResult === 'function' ? await options.loadResult() : options?.loadResult;
        return { type: 'chatRetrieved', chat };
      }),
      persistMessagesActor: fromSafeAsync(async () => {
        // oxlint-disable-next-line no-empty-function -- mock stub
        await (options?.persistResult ?? (async () => {}))();
      }),
      persistErrorActor: fromSafeAsync(async () => {
        // oxlint-disable-next-line no-empty-function -- mock stub
        await (options?.persistErrorResult ?? (async () => {}))();
      }),
      clearErrorActor: fromSafeAsync(async () => {
        // oxlint-disable-next-line no-empty-function -- mock stub
        await (options?.clearErrorResult ?? (async () => {}))();
      }),
    },
  });

  return createActor(machine, {
    input: { activeChatId: options?.activeChatId },
  });
}

type EmittedEvent =
  | { type: 'dispatchRequest'; request: ChatRequest }
  | { type: 'dispatchStop' }
  | { type: 'applyFinishedRequest'; messages: MyUIMessage[]; cause: RequestTerminationCause }
  | { type: 'applyStoppedRequest'; messages: MyUIMessage[]; cause: 'user_stop' }
  | {
      type: 'restoreCancelledDraft';
      userMessage: MyUIMessage;
      truncatedMessages: MyUIMessage[];
      cause: 'user_stop';
    }
  | { type: 'applyResumedRequest'; messages: MyUIMessage[]; pendingRequest: ChatRequest; cause: 'preempt' };

/**
 * Variant of `createTestActor` that also captures every requestLifecycle
 * emit into an `emitLog`. Listeners are registered before `actor.start()`
 * so the log captures the very first transition.
 */
function createTestActorWithEmits(options?: Parameters<typeof createTestActor>[0]) {
  const actor = createTestActor(options);
  const emitLog: EmittedEvent[] = [];

  actor.on('dispatchRequest', (event) => emitLog.push(event));
  actor.on('dispatchStop', (event) => emitLog.push(event));
  actor.on('applyFinishedRequest', (event) => emitLog.push(event));
  actor.on('applyStoppedRequest', (event) => emitLog.push(event));
  actor.on('restoreCancelledDraft', (event) => emitLog.push(event));
  actor.on('applyResumedRequest', (event) => emitLog.push(event));

  return { actor, emitLog };
}

const sampleMessage: MyUIMessage = {
  id: 'msg_user_1',
  role: 'user',
  parts: [{ type: 'text', text: 'hi' }],
  metadata: { createdAt: 0, status: 'pending' },
};

const sampleChatError: ChatError = {
  category: 'generic',
  title: 'Boom',
  message: 'Something failed',
  code: 'INTERNAL_ERROR',
};

describe('chatPersistenceMachine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // chatLoading
  // ===========================================================================
  describe('chatLoading', () => {
    it('should start with chatLoading in idle state', () => {
      const actor = createTestActor();
      actor.start();
      expect(actor.getSnapshot().matches({ chatLoading: 'idle' })).toBe(true);
      actor.stop();
    });

    it('should transition to loading on setActiveChatId with valid chat ID', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'setActiveChatId', chatId: 'chat_abc123' });
      expect(actor.getSnapshot().matches({ chatLoading: 'loading' })).toBe(true);
      expect(actor.getSnapshot().context.activeChatId).toBe('chat_abc123');
      expect(actor.getSnapshot().context.isLoadingChat).toBe(true);
      actor.stop();
    });

    it('should NOT load with invalid chat ID (no chat_ prefix)', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'setActiveChatId', chatId: 'invalid-id' });
      expect(actor.getSnapshot().matches({ chatLoading: 'idle' })).toBe(true);
      expect(actor.getSnapshot().context.isLoadingChat).toBe(false);
      actor.stop();
    });

    it('should set persistedError from loaded chat error field', async () => {
      const mockError: ChatError = {
        category: 'generic',
        title: 'Error',
        message: 'Something went wrong',
        code: 'INTERNAL_ERROR',
      };
      const mockChat = createMockChat({ id: 'chat_abc', error: mockError });
      const actor = createTestActor({ loadResult: mockChat });
      actor.start();
      actor.send({ type: 'setActiveChatId', chatId: 'chat_abc' });
      await waitFor(actor, (s) => s.matches({ chatLoading: 'idle' }));
      expect(actor.getSnapshot().context.persistedError).toEqual(mockError);
      actor.stop();
    });

    it('should clear isLoadingChat after load completes', async () => {
      const mockChat = createMockChat({ id: 'chat_abc' });
      const actor = createTestActor({ loadResult: mockChat });
      actor.start();
      actor.send({ type: 'setActiveChatId', chatId: 'chat_abc' });
      expect(actor.getSnapshot().context.isLoadingChat).toBe(true);
      await waitFor(actor, (s) => s.matches({ chatLoading: 'idle' }));
      expect(actor.getSnapshot().context.isLoadingChat).toBe(false);
      actor.stop();
    });

    it('should handle load error gracefully', async () => {
      const actor = createTestActor({
        loadResult: async () => {
          throw new Error('network failure');
        },
      });
      actor.start();
      actor.send({ type: 'setActiveChatId', chatId: 'chat_abc' });
      await waitFor(actor, (s) => s.matches({ chatLoading: 'idle' }));
      expect(actor.getSnapshot().context.isLoadingChat).toBe(false);
      expect(actor.getSnapshot().context.loadError).toBeDefined();
      expect(actor.getSnapshot().context.loadError?.message).toBe('network failure');
      actor.stop();
    });
  });

  // ===========================================================================
  // messagePersistence
  // ===========================================================================
  describe('messagePersistence', () => {
    it('should start with messagePersistence in idle state', () => {
      const actor = createTestActor();
      actor.start();
      expect(actor.getSnapshot().matches({ messagePersistence: 'idle' })).toBe(true);
      actor.stop();
    });

    it('should enter pending on queuePersist with valid chatId and not loading', () => {
      const actor = createTestActor({ activeChatId: 'chat_abc' });
      actor.start();
      const messages: MockMessage[] = [{ id: 'msg1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }];
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock<T>() proxy not assignable to MyUIMessage[]
      actor.send({ type: 'queuePersist', messages: messages as unknown as MyUIMessage[] });
      expect(actor.getSnapshot().matches({ messagePersistence: 'pending' })).toBe(true);
      actor.stop();
    });

    it('should persist after debounce (100ms)', async () => {
      vi.useFakeTimers();
      try {
        let persistCallCount = 0;
        const actor = createTestActor({
          activeChatId: 'chat_abc',
          persistResult: async () => {
            persistCallCount++;
          },
        });
        actor.start();
        const messages: MockMessage[] = [{ id: 'msg1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }];
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock<T>() proxy not assignable to MyUIMessage[]
        actor.send({ type: 'queuePersist', messages: messages as unknown as MyUIMessage[] });
        expect(actor.getSnapshot().matches({ messagePersistence: 'pending' })).toBe(true);

        await vi.advanceTimersByTimeAsync(100);
        await waitFor(actor, (s) => s.matches({ messagePersistence: 'idle' }));
        expect(persistCallCount).toBe(1);
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should reset debounce on new queuePersist', async () => {
      vi.useFakeTimers();
      try {
        let persistCallCount = 0;
        const actor = createTestActor({
          activeChatId: 'chat_abc',
          persistResult: async () => {
            persistCallCount++;
          },
        });
        actor.start();

        const message1: MockMessage[] = [{ id: 'msg1', role: 'user', parts: [{ type: 'text', text: 'first' }] }];
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock<T>() proxy not assignable to MyUIMessage[]
        actor.send({ type: 'queuePersist', messages: message1 as unknown as MyUIMessage[] });

        await vi.advanceTimersByTimeAsync(80);
        expect(persistCallCount).toBe(0);

        const message2: MockMessage[] = [{ id: 'msg2', role: 'user', parts: [{ type: 'text', text: 'second' }] }];
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock<T>() proxy not assignable to MyUIMessage[]
        actor.send({ type: 'queuePersist', messages: message2 as unknown as MyUIMessage[] });

        await vi.advanceTimersByTimeAsync(80);
        expect(persistCallCount).toBe(0);

        await vi.advanceTimersByTimeAsync(20);
        await waitFor(actor, (s) => s.matches({ messagePersistence: 'idle' }));
        expect(persistCallCount).toBe(1);
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should queue messages while chatLoading is in flight', async () => {
      // Regression: when a brand-new chat is created and the user submits a
      // message before `loadChatActor` resolves, `queuePersist` was dropped
      // because `canPersist` is gated on `!isLoadingChat`. Queuing must be
      // allowed during loading; the actual persist write is what should
      // wait. Otherwise the very first message on a freshly-created chat is
      // silently swallowed.
      let resolveLoad: (() => void) | undefined;
      const actor = createTestActor({
        loadResult: async () =>
          new Promise<undefined>((resolve) => {
            resolveLoad = () => {
              resolve(undefined);
            };
          }),
      });
      actor.start();
      actor.send({ type: 'setActiveChatId', chatId: 'chat_abc' });
      expect(actor.getSnapshot().matches({ chatLoading: 'loading' })).toBe(true);

      const messages: MockMessage[] = [{ id: 'msg1', role: 'user', parts: [{ type: 'text', text: 'queued' }] }];
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock<T>() proxy not assignable to MyUIMessage[]
      actor.send({ type: 'queuePersist', messages: messages as unknown as MyUIMessage[] });

      expect(actor.getSnapshot().matches({ messagePersistence: 'pending' })).toBe(true);
      expect(actor.getSnapshot().context.pendingMessages).toHaveLength(1);

      resolveLoad!();
      actor.stop();
    });

    it('should not transition pending to persisting when pendingMessages is empty', async () => {
      // Regression: `hasPendingMessages` previously checked `length >= 0`,
      // which is always true. An empty messages array would have triggered
      // a no-op persist write — wasted RPC plus a misleading "wrote zero
      // messages" footprint. Empty arrays must short-circuit the debounce.
      vi.useFakeTimers();
      try {
        let persistCallCount = 0;
        const actor = createTestActor({
          activeChatId: 'chat_abc',
          persistResult: async () => {
            persistCallCount++;
          },
        });
        actor.start();

        actor.send({ type: 'queuePersist', messages: [] });
        // Even though queuePersist fires, an empty array must not arm the
        // debounce → persist transition.
        await vi.advanceTimersByTimeAsync(200);

        expect(persistCallCount).toBe(0);
        expect(actor.getSnapshot().matches({ messagePersistence: 'persisting' })).toBe(false);
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should snapshot chatId on queuePersist so a mid-pending switch never persists to the new chat', async () => {
      // Regression: `setActiveChatId` mid-pending swapped `context.activeChatId`,
      // and the debounced `persistMessagesActor` invocation read the swapped
      // value — meaning messages typed for chat A could be written to chat B
      // if focus flipped within the 100 ms debounce window. The snapshot must
      // capture the chatId in effect at queuePersist time.
      vi.useFakeTimers();
      try {
        const persistCalls: Array<{ chatId: string }> = [];
        const actor = createTestActor({
          activeChatId: 'chat_a',
          loadResult: undefined,
          persistResult: async () => {
            // oxlint-disable-next-line no-empty-function -- recorded via mock body below
          },
        });
        // Re-provide persistMessagesActor so we can capture inputs.
        actor.stop();
        const { chatPersistenceMachine: machineRef } = await import('#hooks/chat-persistence.machine.js');
        const { fromSafeAsync: fromSafeAsyncRef } = await import('#lib/xstate.lib.js');
        const { createActor: createActorRef } = await import('xstate');
        const recordingMachine = machineRef.provide({
          actors: {
            loadChatActor: fromSafeAsyncRef<ChatRetrievedEvent, { chatId: string }>(async () => ({
              type: 'chatRetrieved',
              chat: undefined,
            })),
            persistMessagesActor: fromSafeAsyncRef<void, { chatId: string; messages: MyUIMessage[] }>(
              async ({ input }) => {
                persistCalls.push({ chatId: input.chatId });
              },
            ),
            persistErrorActor: fromSafeAsyncRef<void, { chatId: string; error: ChatError }>(async () => undefined),
            clearErrorActor: fromSafeAsyncRef<void, { chatId: string }>(async () => undefined),
          },
        });
        const recordingActor = createActorRef(recordingMachine, {
          input: { activeChatId: 'chat_a' },
        });
        recordingActor.start();
        // Drain the initial setActiveChatId so chatLoading reaches idle.
        recordingActor.send({ type: 'setActiveChatId', chatId: 'chat_a' });
        await vi.advanceTimersByTimeAsync(0);

        const messages: MockMessage[] = [{ id: 'msg1', role: 'user', parts: [{ type: 'text', text: 'for A' }] }];
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock<T>() proxy not assignable to MyUIMessage[]
        recordingActor.send({ type: 'queuePersist', messages: messages as unknown as MyUIMessage[] });

        // Switch focus to chat_b BEFORE debounce expires.
        recordingActor.send({ type: 'setActiveChatId', chatId: 'chat_b' });

        await vi.advanceTimersByTimeAsync(100);
        await waitFor(recordingActor, (s) => s.matches({ messagePersistence: 'idle' }));

        expect(persistCalls).toHaveLength(1);
        expect(persistCalls[0]?.chatId).toBe('chat_a');
        recordingActor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should flush immediately on flushNow', async () => {
      vi.useFakeTimers();
      try {
        let persistCallCount = 0;
        const actor = createTestActor({
          activeChatId: 'chat_abc',
          persistResult: async () => {
            persistCallCount++;
          },
        });
        actor.start();

        const messages: MockMessage[] = [{ id: 'msg1', role: 'user', parts: [{ type: 'text', text: 'flush me' }] }];
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock<T>() proxy not assignable to MyUIMessage[]
        actor.send({ type: 'queuePersist', messages: messages as unknown as MyUIMessage[] });
        expect(actor.getSnapshot().matches({ messagePersistence: 'pending' })).toBe(true);

        actor.send({ type: 'flushNow' });
        expect(actor.getSnapshot().matches({ messagePersistence: 'persisting' })).toBe(true);

        await vi.advanceTimersByTimeAsync(0);
        await waitFor(actor, (s) => s.matches({ messagePersistence: 'idle' }));
        expect(persistCallCount).toBe(1);
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ===========================================================================
  // errorPersistence
  // ===========================================================================
  describe('errorPersistence', () => {
    it('should persist error on setPersistedError', async () => {
      vi.useFakeTimers();
      try {
        let persistErrorCallCount = 0;
        const actor = createTestActor({
          activeChatId: 'chat_abc',
          persistErrorResult: async () => {
            persistErrorCallCount++;
          },
        });
        actor.start();

        const error: ChatError = { category: 'generic', title: 'AI Error', message: 'AI failed', code: 'AI_ERROR' };
        actor.send({ type: 'setPersistedError', error });
        expect(actor.getSnapshot().matches({ errorPersistence: 'persisting' })).toBe(true);
        expect(actor.getSnapshot().context.persistedError).toEqual(error);

        await vi.advanceTimersByTimeAsync(0);
        await waitFor(actor, (s) => s.matches({ errorPersistence: 'idle' }));
        expect(persistErrorCallCount).toBe(1);
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should clear error on clearPersistedError', async () => {
      vi.useFakeTimers();
      try {
        let clearErrorCallCount = 0;
        const actor = createTestActor({
          activeChatId: 'chat_abc',
          clearErrorResult: async () => {
            clearErrorCallCount++;
          },
        });
        actor.start();

        actor.send({ type: 'clearPersistedError' });
        expect(actor.getSnapshot().matches({ errorPersistence: 'clearing' })).toBe(true);

        await vi.advanceTimersByTimeAsync(0);
        await waitFor(actor, (s) => s.matches({ errorPersistence: 'idle' }));
        expect(clearErrorCallCount).toBe(1);
        expect(actor.getSnapshot().context.persistedError).toBeUndefined();
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should clear persistedError from context immediately when clearPersistedError is sent from idle', async () => {
      vi.useFakeTimers();
      try {
        let clearResolve: (() => void) | undefined;
        const actor = createTestActor({
          activeChatId: 'chat_abc',
          persistErrorResult: async () => {
            // oxlint-disable-next-line no-empty-function -- mock stub
          },
          clearErrorResult: async () =>
            new Promise<void>((resolve) => {
              clearResolve = resolve;
            }),
        });
        actor.start();

        // Set an error and wait for persistence to complete → back to idle
        const error: ChatError = { category: 'generic', title: 'Error', message: 'fail', code: 'ERR' };
        actor.send({ type: 'setPersistedError', error });
        await vi.advanceTimersByTimeAsync(0);
        await waitFor(actor, (s) => s.matches({ errorPersistence: 'idle' }));
        expect(actor.getSnapshot().context.persistedError).toEqual(error);

        // Send clearPersistedError — context must be cleared IMMEDIATELY,
        // even though the async IDB write (clearErrorActor) has not completed.
        actor.send({ type: 'clearPersistedError' });
        expect(actor.getSnapshot().matches({ errorPersistence: 'clearing' })).toBe(true);
        expect(actor.getSnapshot().context.persistedError).toBeUndefined();

        // Let the async actor finish
        clearResolve!();
        await vi.advanceTimersByTimeAsync(0);
        await waitFor(actor, (s) => s.matches({ errorPersistence: 'idle' }));
        expect(actor.getSnapshot().context.persistedError).toBeUndefined();
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ===========================================================================
  // activeSelectionPersistence — setActiveModel / setActiveKernel
  // patches Chat.activeModel / Chat.activeKernel via patchChat. Hydrates
  // from the loaded Chat row so reload preserves the chat-local choice.
  // ===========================================================================
  describe('activeSelectionPersistence', () => {
    it('should hydrate activeModel and activeKernel from the loaded Chat row', async () => {
      const mockChat = createMockChat({
        id: 'chat_abc',
        activeModel: 'gpt-5.4-medium',
        activeKernel: 'manifold',
      });
      const actor = createTestActor({ loadResult: mockChat });
      actor.start();
      actor.send({ type: 'setActiveChatId', chatId: 'chat_abc' });
      await waitFor(actor, (s) => s.matches({ chatLoading: 'idle' }));

      expect(actor.getSnapshot().context.activeModel).toBe('gpt-5.4-medium');
      expect(actor.getSnapshot().context.activeKernel).toBe('manifold');
      actor.stop();
    });

    it('should patch context and invoke persistActiveModelActor when setActiveModel fires', async () => {
      const persistCalls: Array<{ chatId: string; model: string | undefined }> = [];
      const machine = chatPersistenceMachine.provide({
        actors: {
          loadChatActor: fromSafeAsync<ChatRetrievedEvent, { chatId: string }>(async () => ({
            type: 'chatRetrieved',
            chat: undefined,
          })),
          // oxlint-disable-next-line no-empty-function -- mock stub
          persistMessagesActor: fromSafeAsync(async () => {}),
          // oxlint-disable-next-line no-empty-function -- mock stub
          persistErrorActor: fromSafeAsync(async () => {}),
          // oxlint-disable-next-line no-empty-function -- mock stub
          clearErrorActor: fromSafeAsync(async () => {}),
          persistActiveModelActor: fromSafeAsync<void, { chatId: string; activeModel: string | undefined }>(
            async ({ input }) => {
              persistCalls.push({ chatId: input.chatId, model: input.activeModel });
            },
          ),
          // oxlint-disable-next-line no-empty-function -- mock stub
          persistActiveKernelActor: fromSafeAsync(async () => {}),
        },
      });
      const actor = createActor(machine, { input: { activeChatId: 'chat_abc' } });
      actor.start();

      actor.send({ type: 'setActiveModel', model: 'gpt-5.4-medium' });

      expect(actor.getSnapshot().context.activeModel).toBe('gpt-5.4-medium');
      await waitFor(actor, (s) => s.matches({ activeModelPersistence: 'idle' }));
      expect(persistCalls).toEqual([{ chatId: 'chat_abc', model: 'gpt-5.4-medium' }]);
      actor.stop();
    });

    it('should patch context and invoke persistActiveKernelActor when setActiveKernel fires', async () => {
      const persistCalls: Array<{ chatId: string; kernel: string | undefined }> = [];
      const machine = chatPersistenceMachine.provide({
        actors: {
          loadChatActor: fromSafeAsync<ChatRetrievedEvent, { chatId: string }>(async () => ({
            type: 'chatRetrieved',
            chat: undefined,
          })),
          // oxlint-disable-next-line no-empty-function -- mock stub
          persistMessagesActor: fromSafeAsync(async () => {}),
          // oxlint-disable-next-line no-empty-function -- mock stub
          persistErrorActor: fromSafeAsync(async () => {}),
          // oxlint-disable-next-line no-empty-function -- mock stub
          clearErrorActor: fromSafeAsync(async () => {}),
          // oxlint-disable-next-line no-empty-function -- mock stub
          persistActiveModelActor: fromSafeAsync(async () => {}),
          persistActiveKernelActor: fromSafeAsync<void, { chatId: string; activeKernel: KernelId | undefined }>(
            async ({ input }) => {
              persistCalls.push({ chatId: input.chatId, kernel: input.activeKernel });
            },
          ),
        },
      });
      const actor = createActor(machine, { input: { activeChatId: 'chat_abc' } });
      actor.start();

      actor.send({ type: 'setActiveKernel', kernel: 'manifold' });

      expect(actor.getSnapshot().context.activeKernel).toBe('manifold');
      await waitFor(actor, (s) => s.matches({ activeKernelPersistence: 'idle' }));
      expect(persistCalls).toEqual([{ chatId: 'chat_abc', kernel: 'manifold' }]);
      actor.stop();
    });

    it('should ignore setActiveModel when no valid chatId is set', () => {
      const persistCalls: string[] = [];
      const machine = chatPersistenceMachine.provide({
        actors: {
          loadChatActor: fromSafeAsync<ChatRetrievedEvent, { chatId: string }>(async () => ({
            type: 'chatRetrieved',
            chat: undefined,
          })),
          // oxlint-disable-next-line no-empty-function -- mock stub
          persistMessagesActor: fromSafeAsync(async () => {}),
          // oxlint-disable-next-line no-empty-function -- mock stub
          persistErrorActor: fromSafeAsync(async () => {}),
          // oxlint-disable-next-line no-empty-function -- mock stub
          clearErrorActor: fromSafeAsync(async () => {}),
          persistActiveModelActor: fromSafeAsync<void, { chatId: string; activeModel: string | undefined }>(
            async ({ input }) => {
              persistCalls.push(input.chatId);
            },
          ),
          // oxlint-disable-next-line no-empty-function -- mock stub
          persistActiveKernelActor: fromSafeAsync(async () => {}),
        },
      });
      const actor = createActor(machine, { input: {} });
      actor.start();

      actor.send({ type: 'setActiveModel', model: 'gpt-5.4-medium' });

      // Context should not update without a valid chat id, and the actor must
      // never be invoked. The selection only makes sense bound to a chat.
      expect(actor.getSnapshot().context.activeModel).toBeUndefined();
      expect(persistCalls).toEqual([]);
      actor.stop();
    });

    it('should replace prior activeModel writes with the latest value when setActiveModel races', async () => {
      const persistCalls: string[] = [];
      const machine = chatPersistenceMachine.provide({
        actors: {
          loadChatActor: fromSafeAsync<ChatRetrievedEvent, { chatId: string }>(async () => ({
            type: 'chatRetrieved',
            chat: undefined,
          })),
          // oxlint-disable-next-line no-empty-function -- mock stub
          persistMessagesActor: fromSafeAsync(async () => {}),
          // oxlint-disable-next-line no-empty-function -- mock stub
          persistErrorActor: fromSafeAsync(async () => {}),
          // oxlint-disable-next-line no-empty-function -- mock stub
          clearErrorActor: fromSafeAsync(async () => {}),
          persistActiveModelActor: fromSafeAsync<void, { chatId: string; activeModel: string | undefined }>(
            async ({ input }) => {
              persistCalls.push(input.activeModel ?? '<undef>');
            },
          ),
          // oxlint-disable-next-line no-empty-function -- mock stub
          persistActiveKernelActor: fromSafeAsync(async () => {}),
        },
      });
      const actor = createActor(machine, { input: { activeChatId: 'chat_abc' } });
      actor.start();

      actor.send({ type: 'setActiveModel', model: 'first' });
      actor.send({ type: 'setActiveModel', model: 'second' });

      await waitFor(actor, (s) => s.matches({ activeModelPersistence: 'idle' }));
      expect(actor.getSnapshot().context.activeModel).toBe('second');
      expect(persistCalls.at(-1)).toBe('second');
      actor.stop();
    });
  });

  // ===========================================================================
  // requestLifecycle
  // ===========================================================================
  describe('requestLifecycle', () => {
    it('should start with requestLifecycle in idle', () => {
      const { actor } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();
      expect(actor.getSnapshot().matches({ requestLifecycle: 'idle' })).toBe(true);
      actor.stop();
    });

    it('should transition idle to invoking on startRequest and emit dispatchRequest with the request payload', () => {
      const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();

      const request: ChatRequest = { kind: 'send', message: sampleMessage };
      actor.send({ type: 'startRequest', request });

      expect(actor.getSnapshot().matches({ requestLifecycle: 'invoking' })).toBe(true);
      expect(emitLog).toEqual([{ type: 'dispatchRequest', request }]);
      actor.stop();
    });

    it('should clear persistedError synchronously when entering invoking from idle', () => {
      const { actor } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();

      // Seed an error directly via the existing setPersistedError event.
      actor.send({ type: 'setPersistedError', error: sampleChatError });
      expect(actor.getSnapshot().context.persistedError).toEqual(sampleChatError);

      // The clear must happen in the same tick as startRequest (no await).
      actor.send({ type: 'startRequest', request: { kind: 'regenerate' } });
      expect(actor.getSnapshot().context.persistedError).toBeUndefined();
      expect(actor.getSnapshot().matches({ requestLifecycle: 'invoking' })).toBe(true);
      actor.stop();
    });

    it('should transition invoking to stopping on a second startRequest, emit dispatchStop, store the new request as pendingRequest, and clear persistedError', () => {
      const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();

      const first: ChatRequest = { kind: 'send', message: sampleMessage };
      const second: ChatRequest = { kind: 'send', message: { ...sampleMessage, id: 'msg_user_2' } };

      actor.send({ type: 'startRequest', request: first });
      // Manually set persistedError to verify the second start clears it again.
      actor.send({ type: 'setPersistedError', error: sampleChatError });
      expect(actor.getSnapshot().context.persistedError).toEqual(sampleChatError);

      actor.send({ type: 'startRequest', request: second });

      expect(actor.getSnapshot().matches({ requestLifecycle: 'stopping' })).toBe(true);
      expect(actor.getSnapshot().context.pendingRequest).toEqual(second);
      expect(actor.getSnapshot().context.persistedError).toBeUndefined();
      expect(emitLog.map((event) => event.type)).toEqual(['dispatchRequest', 'dispatchStop']);
      actor.stop();
    });

    it('should transition invoking to stopping on stopRequest with no pendingRequest stored', () => {
      const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();

      actor.send({ type: 'startRequest', request: { kind: 'regenerate' } });
      actor.send({ type: 'stopRequest' });

      expect(actor.getSnapshot().matches({ requestLifecycle: 'stopping' })).toBe(true);
      expect(actor.getSnapshot().context.pendingRequest).toBeUndefined();
      expect(emitLog.map((event) => event.type)).toEqual(['dispatchRequest', 'dispatchStop']);
      actor.stop();
    });

    it('should transition invoking to idle on requestFinished without isError, emit applyFinishedRequest, and clear persistedError', () => {
      const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();

      actor.send({ type: 'startRequest', request: { kind: 'regenerate' } });
      // Stale error left over from a previous failed request: success path must clear it.
      actor.send({ type: 'setPersistedError', error: sampleChatError });

      const finalMessages: MyUIMessage[] = [sampleMessage];
      actor.send({
        type: 'requestFinished',
        messages: finalMessages,
        isAbort: false,
        isError: false,
        isDisconnect: false,
      });

      expect(actor.getSnapshot().matches({ requestLifecycle: 'idle' })).toBe(true);
      expect(actor.getSnapshot().context.persistedError).toBeUndefined();
      const lastEmit = emitLog.at(-1);
      expect(lastEmit).toEqual({ type: 'applyFinishedRequest', messages: finalMessages, cause: 'success' });
      actor.stop();
    });

    it('should transition invoking to idle on requestFinished with isError, emit applyFinishedRequest, and PRESERVE persistedError', () => {
      const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();

      actor.send({ type: 'startRequest', request: { kind: 'regenerate' } });
      // Mid-stream error, set by ChatInstance's onError handler before onFinish fires.
      actor.send({ type: 'setPersistedError', error: sampleChatError });

      const finalMessages: MyUIMessage[] = [sampleMessage];
      actor.send({
        type: 'requestFinished',
        messages: finalMessages,
        isAbort: false,
        isError: true,
        isDisconnect: false,
      });

      expect(actor.getSnapshot().matches({ requestLifecycle: 'idle' })).toBe(true);
      expect(actor.getSnapshot().context.persistedError).toEqual(sampleChatError);
      const lastEmit = emitLog.at(-1);
      expect(lastEmit).toEqual({ type: 'applyFinishedRequest', messages: finalMessages, cause: 'error' });
      actor.stop();
    });

    it('should emit applyFinishedRequest with cause user_stop when requestFinished has isAbort', () => {
      const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();

      actor.send({ type: 'startRequest', request: { kind: 'regenerate' } });
      const finalMessages: MyUIMessage[] = [sampleMessage];
      actor.send({
        type: 'requestFinished',
        messages: finalMessages,
        isAbort: true,
        isError: false,
        isDisconnect: false,
      });

      expect(actor.getSnapshot().matches({ requestLifecycle: 'idle' })).toBe(true);
      expect(emitLog.at(-1)).toEqual({ type: 'applyFinishedRequest', messages: finalMessages, cause: 'user_stop' });
      actor.stop();
    });

    it('should transition stopping to invoking on requestFinished when pendingRequest is set, emit applyResumedRequest then dispatchRequest, and clear pendingRequest', () => {
      const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();

      const first: ChatRequest = { kind: 'send', message: sampleMessage };
      const queued: ChatRequest = { kind: 'send', message: { ...sampleMessage, id: 'msg_user_2' } };

      actor.send({ type: 'startRequest', request: first });
      actor.send({ type: 'startRequest', request: queued });
      const interruptedMessages: MyUIMessage[] = [sampleMessage];
      actor.send({
        type: 'requestFinished',
        messages: interruptedMessages,
        isAbort: true,
        isError: false,
        isDisconnect: false,
      });

      expect(actor.getSnapshot().matches({ requestLifecycle: 'invoking' })).toBe(true);
      expect(actor.getSnapshot().context.pendingRequest).toBeUndefined();

      const types = emitLog.map((event) => event.type);
      expect(types).toEqual(['dispatchRequest', 'dispatchStop', 'applyResumedRequest', 'dispatchRequest']);

      const resumed = emitLog[2];
      const dispatched = emitLog[3];
      expect(resumed).toEqual({
        type: 'applyResumedRequest',
        messages: interruptedMessages,
        pendingRequest: queued,
        cause: 'preempt',
      });
      expect(dispatched).toEqual({ type: 'dispatchRequest', request: queued });
      actor.stop();
    });

    it('should transition stopping to idle on requestFinished without pendingRequest and emit applyStoppedRequest', () => {
      const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();

      actor.send({ type: 'startRequest', request: { kind: 'regenerate' } });
      actor.send({ type: 'stopRequest' });
      // Assistant has already streamed at least one part — the stop should
      // preserve the transcript via `applyStoppedRequest`, NOT lift the
      // user message back into the draft (which is what the new
      // `restoreCancelledDraft` branch covers below).
      const assistantWithContent: MyUIMessage = {
        id: 'msg_assistant_1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'partial reply' }],
        metadata: { createdAt: 0, status: 'pending' },
      };
      const interruptedMessages: MyUIMessage[] = [sampleMessage, assistantWithContent];
      actor.send({
        type: 'requestFinished',
        messages: interruptedMessages,
        isAbort: true,
        isError: false,
        isDisconnect: false,
      });

      expect(actor.getSnapshot().matches({ requestLifecycle: 'idle' })).toBe(true);
      const lastEmit = emitLog.at(-1);
      expect(lastEmit).toEqual({ type: 'applyStoppedRequest', messages: interruptedMessages, cause: 'user_stop' });
      expect(emitLog.filter((event) => event.type === 'restoreCancelledDraft').length).toBe(0);
      actor.stop();
    });

    it('should emit restoreCancelledDraft when stopping with no assistant placeholder appended', () => {
      const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();

      actor.send({ type: 'startRequest', request: { kind: 'send', message: sampleMessage } });
      actor.send({ type: 'stopRequest' });
      // AI SDK aborted before its onStart appended an assistant message --
      // the trailing message is still the user prompt.
      const interruptedMessages: MyUIMessage[] = [sampleMessage];
      actor.send({
        type: 'requestFinished',
        messages: interruptedMessages,
        isAbort: true,
        isError: false,
        isDisconnect: false,
      });

      expect(actor.getSnapshot().matches({ requestLifecycle: 'idle' })).toBe(true);
      const lastEmit = emitLog.at(-1);
      expect(lastEmit).toEqual({
        type: 'restoreCancelledDraft',
        userMessage: sampleMessage,
        truncatedMessages: [],
        cause: 'user_stop',
      });
      expect(emitLog.filter((event) => event.type === 'applyStoppedRequest').length).toBe(0);
      actor.stop();
    });

    it('should emit restoreCancelledDraft and strip the empty assistant placeholder when stopping mid-prefetch', () => {
      const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();

      const olderUser: MyUIMessage = {
        id: 'msg_user_0',
        role: 'user',
        parts: [{ type: 'text', text: 'first' }],
        metadata: { createdAt: 0, status: 'pending' },
      };
      const olderAssistant: MyUIMessage = {
        id: 'msg_assistant_0',
        role: 'assistant',
        parts: [{ type: 'text', text: 'first reply' }],
        metadata: { createdAt: 0, status: 'pending' },
      };
      const emptyAssistant: MyUIMessage = {
        id: 'msg_assistant_2',
        role: 'assistant',
        parts: [],
        metadata: { createdAt: 0, status: 'pending' },
      };

      actor.send({ type: 'startRequest', request: { kind: 'send', message: sampleMessage } });
      actor.send({ type: 'stopRequest' });
      const interruptedMessages: MyUIMessage[] = [olderUser, olderAssistant, sampleMessage, emptyAssistant];
      actor.send({
        type: 'requestFinished',
        messages: interruptedMessages,
        isAbort: true,
        isError: false,
        isDisconnect: false,
      });

      expect(actor.getSnapshot().matches({ requestLifecycle: 'idle' })).toBe(true);
      const lastEmit = emitLog.at(-1);
      expect(lastEmit).toEqual({
        type: 'restoreCancelledDraft',
        userMessage: sampleMessage,
        truncatedMessages: [olderUser, olderAssistant],
        cause: 'user_stop',
      });
      expect(emitLog.filter((event) => event.type === 'applyStoppedRequest').length).toBe(0);
      actor.stop();
    });

    it('should prefer the preempt-resume arm over restoreCancelledDraft when a startRequest is queued', () => {
      const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();

      const queued: ChatRequest = { kind: 'send', message: { ...sampleMessage, id: 'msg_user_queued' } };
      actor.send({ type: 'startRequest', request: { kind: 'send', message: sampleMessage } });
      actor.send({ type: 'startRequest', request: queued });

      const interruptedMessages: MyUIMessage[] = [sampleMessage];
      actor.send({
        type: 'requestFinished',
        messages: interruptedMessages,
        isAbort: true,
        isError: false,
        isDisconnect: false,
      });

      // Resume path must win over the empty-cancel restore arm.
      expect(actor.getSnapshot().matches({ requestLifecycle: 'invoking' })).toBe(true);
      const types = emitLog.map((event) => event.type);
      expect(types).toEqual(['dispatchRequest', 'dispatchStop', 'applyResumedRequest', 'dispatchRequest']);
      expect(emitLog.filter((event) => event.type === 'restoreCancelledDraft').length).toBe(0);
      actor.stop();
    });

    it('should replace pendingRequest if startRequest fires again while stopping', () => {
      const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();

      const first: ChatRequest = { kind: 'send', message: sampleMessage };
      const second: ChatRequest = { kind: 'send', message: { ...sampleMessage, id: 'msg_user_2' } };
      const third: ChatRequest = { kind: 'send', message: { ...sampleMessage, id: 'msg_user_3' } };

      actor.send({ type: 'startRequest', request: first });
      actor.send({ type: 'startRequest', request: second });
      // Third startRequest while still in stopping must REPLACE the pending request.
      actor.send({ type: 'startRequest', request: third });

      expect(actor.getSnapshot().matches({ requestLifecycle: 'stopping' })).toBe(true);
      expect(actor.getSnapshot().context.pendingRequest).toEqual(third);
      // No additional dispatchStop emit on the third tap.
      expect(emitLog.filter((event) => event.type === 'dispatchStop').length).toBe(1);
      actor.stop();
    });

    it('should ignore requestFinished while requestLifecycle is idle', () => {
      const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();

      actor.send({
        type: 'requestFinished',
        messages: [sampleMessage],
        isAbort: false,
        isError: false,
        isDisconnect: false,
      });

      expect(actor.getSnapshot().matches({ requestLifecycle: 'idle' })).toBe(true);
      expect(emitLog).toEqual([]);
      actor.stop();
    });

    it('should keep emit ordering deterministic across the resume path', () => {
      const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();

      const first: ChatRequest = { kind: 'regenerate' };
      const queued: ChatRequest = { kind: 'send', message: sampleMessage };

      actor.send({ type: 'startRequest', request: first });
      actor.send({ type: 'startRequest', request: queued });
      actor.send({
        type: 'requestFinished',
        messages: [sampleMessage],
        isAbort: true,
        isError: false,
        isDisconnect: false,
      });

      expect(emitLog.map((event) => event.type)).toEqual([
        'dispatchRequest',
        'dispatchStop',
        'applyResumedRequest',
        'dispatchRequest',
      ]);
      actor.stop();
    });

    /**
     * The listener-side fix in `chat-session-store.ts` (queueMicrotask wrap
     * around the `dispatchRequest` listener body — see
     * `docs/research/chat-followup-message-swallow.md`) relies on the
     * machine emitting `applyResumedRequest` IMMEDIATELY before the resumed
     * `dispatchRequest` in the same synchronous transition. If the order
     * ever changed, the React side's microtask-deferred `chat.sendMessage`
     * call would fire before `chat.messages` had been sanitised, so this
     * test pins that invariant down explicitly.
     */
    it('emits applyResumedRequest synchronously and immediately before dispatchRequest on the preempt branch', () => {
      const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();

      const first: ChatRequest = { kind: 'send', message: sampleMessage };
      const queued: ChatRequest = { kind: 'send', message: { ...sampleMessage, id: 'msg_user_2' } };
      const interruptedMessages: MyUIMessage[] = [sampleMessage];

      actor.send({ type: 'startRequest', request: first });
      actor.send({ type: 'startRequest', request: queued });
      const beforeFinish = emitLog.length;
      actor.send({
        type: 'requestFinished',
        messages: interruptedMessages,
        isAbort: true,
        isError: false,
        isDisconnect: false,
      });

      // Exactly two emits land synchronously on `requestFinished` in the
      // preempt branch: applyResumedRequest then dispatchRequest, with no
      // other interleaved events.
      const afterFinishSlice = emitLog.slice(beforeFinish);
      expect(afterFinishSlice).toHaveLength(2);
      const [resumed, dispatched] = afterFinishSlice;
      expect(resumed).toEqual({
        type: 'applyResumedRequest',
        messages: interruptedMessages,
        pendingRequest: queued,
        cause: 'preempt',
      });
      expect(dispatched).toEqual({ type: 'dispatchRequest', request: queued });
    });
  });

  // ===========================================================================
  // R2: transparent auto-retry on transport-level disconnects.
  //
  // The `requestLifecycle.retrying` substate gates on isError && isDisconnect
  // and dispatches a `{ kind: 'continue' }` request after an exponential
  // backoff delay (see `apps/ui/app/utils/backoff.utils.ts` for the curve).
  // ===========================================================================

  describe('requestLifecycle (auto-retry on disconnect)', () => {
    it('enters `retrying` and increments retryAttempt on isError + isDisconnect with budget remaining', () => {
      const { actor } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();
      actor.send({ type: 'startRequest', request: { kind: 'send', message: sampleMessage } });

      actor.send({
        type: 'requestFinished',
        messages: [sampleMessage],
        isAbort: false,
        isError: true,
        isDisconnect: true,
      });

      expect(actor.getSnapshot().matches({ requestLifecycle: 'retrying' })).toBe(true);
      expect(actor.getSnapshot().context.retryAttempt).toBe(1);
      actor.stop();
    });

    it('does not emit applyFinishedRequest when entering retrying (transparent reconnect)', () => {
      const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();
      actor.send({ type: 'startRequest', request: { kind: 'send', message: sampleMessage } });

      actor.send({
        type: 'requestFinished',
        messages: [sampleMessage],
        isAbort: false,
        isError: true,
        isDisconnect: true,
      });

      expect(actor.getSnapshot().matches({ requestLifecycle: 'retrying' })).toBe(true);
      expect(emitLog.map((event) => event.type)).toEqual(['dispatchRequest']);
      expect(emitLog.some((event) => event.type === 'applyFinishedRequest')).toBe(false);
      actor.stop();
    });

    it('after streamRetryDelay, emits dispatchRequest { kind: continue } and re-enters invoking', async () => {
      vi.useFakeTimers();
      try {
        const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
        actor.start();
        actor.send({ type: 'startRequest', request: { kind: 'send', message: sampleMessage } });

        actor.send({
          type: 'requestFinished',
          messages: [sampleMessage],
          isAbort: false,
          isError: true,
          isDisconnect: true,
        });

        // Initial backoff for attempt 1 is 500ms + up to 25% jitter.
        // Advancing past the upper bound (~625ms) guarantees the timer fires.
        await vi.advanceTimersByTimeAsync(700);

        expect(actor.getSnapshot().matches({ requestLifecycle: 'invoking' })).toBe(true);
        const lastEmit = emitLog.at(-1);
        expect(lastEmit).toEqual({ type: 'dispatchRequest', request: { kind: 'continue' } });
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('lands in `idle` when retryAttempt reaches retryMaxAttempts and preserves persistedError', async () => {
      vi.useFakeTimers();
      try {
        // Tight budget keeps the test cycle short — exhaust after 2 attempts.
        const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
        actor.start();
        // Override budget via input by recreating actor. The createActor in
        // createTestActor uses default. Use direct approach: assert retry
        // path trips the third disconnect into the `isError` non-retry guard.
        actor.send({ type: 'startRequest', request: { kind: 'send', message: sampleMessage } });
        actor.send({ type: 'setPersistedError', error: sampleChatError });

        // Walk the full default budget of 5 attempts.
        for (let attempt = 1; attempt <= 5; attempt++) {
          actor.send({
            type: 'requestFinished',
            messages: [sampleMessage],
            isAbort: false,
            isError: true,
            isDisconnect: true,
          });
          expect(actor.getSnapshot().matches({ requestLifecycle: 'retrying' })).toBe(true);
          expect(actor.getSnapshot().context.retryAttempt).toBe(attempt);
          // oxlint-disable-next-line no-await-in-loop -- sequential advancement is required to walk the retry chain
          await vi.advanceTimersByTimeAsync(60_000); // > 32s cap + jitter
          expect(actor.getSnapshot().matches({ requestLifecycle: 'invoking' })).toBe(true);
        }

        // 6th disconnect: budget exhausted -> non-retry isError guard -> idle.
        actor.send({
          type: 'requestFinished',
          messages: [sampleMessage],
          isAbort: false,
          isError: true,
          isDisconnect: true,
        });
        expect(actor.getSnapshot().matches({ requestLifecycle: 'idle' })).toBe(true);
        expect(actor.getSnapshot().context.persistedError).toEqual(sampleChatError);
        expect(emitLog.at(-1)).toEqual({
          type: 'applyFinishedRequest',
          messages: [sampleMessage],
          cause: 'disconnect',
        });
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('cancels the backoff timer and returns to idle on stopRequest', async () => {
      vi.useFakeTimers();
      try {
        const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
        actor.start();
        actor.send({ type: 'startRequest', request: { kind: 'send', message: sampleMessage } });
        actor.send({
          type: 'requestFinished',
          messages: [sampleMessage],
          isAbort: false,
          isError: true,
          isDisconnect: true,
        });
        expect(actor.getSnapshot().matches({ requestLifecycle: 'retrying' })).toBe(true);

        actor.send({ type: 'stopRequest' });
        expect(actor.getSnapshot().matches({ requestLifecycle: 'idle' })).toBe(true);
        expect(actor.getSnapshot().context.retryAttempt).toBe(0);

        // Advance past any plausible backoff to prove the timer was cancelled.
        await vi.advanceTimersByTimeAsync(60_000);
        expect(actor.getSnapshot().matches({ requestLifecycle: 'idle' })).toBe(true);
        const continueEmit = emitLog.find(
          (event) => event.type === 'dispatchRequest' && event.request.kind === 'continue',
        );
        expect(continueEmit).toBeUndefined();
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('cancels the backoff timer and dispatches the user-supplied request on startRequest', async () => {
      vi.useFakeTimers();
      try {
        const { actor, emitLog } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
        actor.start();
        actor.send({ type: 'startRequest', request: { kind: 'send', message: sampleMessage } });
        actor.send({
          type: 'requestFinished',
          messages: [sampleMessage],
          isAbort: false,
          isError: true,
          isDisconnect: true,
        });
        expect(actor.getSnapshot().matches({ requestLifecycle: 'retrying' })).toBe(true);

        const fresh: ChatRequest = { kind: 'send', message: { ...sampleMessage, id: 'msg_user_2' } };
        actor.send({ type: 'startRequest', request: fresh });

        expect(actor.getSnapshot().matches({ requestLifecycle: 'invoking' })).toBe(true);
        expect(actor.getSnapshot().context.retryAttempt).toBe(0);
        expect(actor.getSnapshot().context.persistedError).toBeUndefined();
        const lastEmit = emitLog.at(-1);
        expect(lastEmit).toEqual({ type: 'dispatchRequest', request: fresh });

        // Late-firing timer must NOT subsequently dispatch a continue.
        await vi.advanceTimersByTimeAsync(60_000);
        const continueEmits = emitLog.filter(
          (event) => event.type === 'dispatchRequest' && event.request.kind === 'continue',
        );
        expect(continueEmits).toHaveLength(0);
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('resets retryAttempt to 0 once a turn settles successfully after a retry chain', async () => {
      vi.useFakeTimers();
      try {
        const { actor } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
        actor.start();
        actor.send({ type: 'startRequest', request: { kind: 'send', message: sampleMessage } });

        // Two consecutive disconnects -> retryAttempt = 2.
        actor.send({
          type: 'requestFinished',
          messages: [sampleMessage],
          isAbort: false,
          isError: true,
          isDisconnect: true,
        });
        await vi.advanceTimersByTimeAsync(700);
        actor.send({
          type: 'requestFinished',
          messages: [sampleMessage],
          isAbort: false,
          isError: true,
          isDisconnect: true,
        });
        expect(actor.getSnapshot().context.retryAttempt).toBe(2);

        // Simulate the next continue running through (re-enter invoking,
        // then a successful finish).
        await vi.advanceTimersByTimeAsync(2000);
        expect(actor.getSnapshot().matches({ requestLifecycle: 'invoking' })).toBe(true);

        actor.send({
          type: 'requestFinished',
          messages: [sampleMessage],
          isAbort: false,
          isError: false,
          isDisconnect: false,
        });
        expect(actor.getSnapshot().matches({ requestLifecycle: 'idle' })).toBe(true);
        expect(actor.getSnapshot().context.retryAttempt).toBe(0);
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('does NOT enter `retrying` when isError but isDisconnect is false (e.g. 4xx/5xx)', () => {
      const { actor } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
      actor.start();
      actor.send({ type: 'startRequest', request: { kind: 'send', message: sampleMessage } });
      actor.send({ type: 'setPersistedError', error: sampleChatError });

      actor.send({
        type: 'requestFinished',
        messages: [sampleMessage],
        isAbort: false,
        isError: true,
        isDisconnect: false,
      });

      expect(actor.getSnapshot().matches({ requestLifecycle: 'idle' })).toBe(true);
      expect(actor.getSnapshot().context.retryAttempt).toBe(0);
      expect(actor.getSnapshot().context.persistedError).toEqual(sampleChatError);
      actor.stop();
    });

    it('respects the configurable retryMaxAttempts input', () => {
      // Pass a 1-attempt budget so a single disconnect exhausts immediately.
      const machine = chatPersistenceMachine.provide({
        actors: {
          loadChatActor: fromSafeAsync(async () => {
            const event: ChatRetrievedEvent = { type: 'chatRetrieved', chat: undefined };
            return event;
          }),
          // oxlint-disable-next-line no-empty-function -- mock stub
          persistMessagesActor: fromSafeAsync(async () => {}),
          // oxlint-disable-next-line no-empty-function -- mock stub
          persistErrorActor: fromSafeAsync(async () => {}),
          // oxlint-disable-next-line no-empty-function -- mock stub
          clearErrorActor: fromSafeAsync(async () => {}),
        },
      });
      const actor = createActor(machine, {
        input: { activeChatId: 'chat_abc', retryMaxAttempts: 1 },
      });
      actor.start();
      actor.send({ type: 'startRequest', request: { kind: 'send', message: sampleMessage } });

      // First disconnect uses the budget.
      actor.send({
        type: 'requestFinished',
        messages: [sampleMessage],
        isAbort: false,
        isError: true,
        isDisconnect: true,
      });
      expect(actor.getSnapshot().matches({ requestLifecycle: 'retrying' })).toBe(true);
      expect(actor.getSnapshot().context.retryAttempt).toBe(1);
      actor.stop();
    });
  });

  // ===========================================================================
  // R6: streamResumed — mid-turn recovery signal from AI SDK status → streaming
  // ===========================================================================

  describe('requestLifecycle (streamResumed)', () => {
    it('T17: streamResumed in invoking resets retryAttempt and clears persistedError', async () => {
      vi.useFakeTimers();
      try {
        const { actor } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
        actor.start();
        actor.send({ type: 'startRequest', request: { kind: 'send', message: sampleMessage } });
        actor.send({
          type: 'requestFinished',
          messages: [sampleMessage],
          isAbort: false,
          isError: true,
          isDisconnect: true,
        });
        await vi.advanceTimersByTimeAsync(700);
        expect(actor.getSnapshot().matches({ requestLifecycle: 'invoking' })).toBe(true);
        expect(actor.getSnapshot().context.retryAttempt).toBe(1);

        actor.send({ type: 'setPersistedError', error: sampleChatError });
        actor.send({ type: 'streamResumed' });

        expect(actor.getSnapshot().context.retryAttempt).toBe(0);
        expect(actor.getSnapshot().context.persistedError).toBeUndefined();
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('T18: streamResumed while in retrying is a no-op', async () => {
      vi.useFakeTimers();
      try {
        const { actor } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
        actor.start();
        actor.send({ type: 'startRequest', request: { kind: 'send', message: sampleMessage } });
        actor.send({ type: 'setPersistedError', error: sampleChatError });
        actor.send({
          type: 'requestFinished',
          messages: [sampleMessage],
          isAbort: false,
          isError: true,
          isDisconnect: true,
        });
        expect(actor.getSnapshot().matches({ requestLifecycle: 'retrying' })).toBe(true);
        const attemptBefore = actor.getSnapshot().context.retryAttempt;

        actor.send({ type: 'streamResumed' });

        expect(actor.getSnapshot().matches({ requestLifecycle: 'retrying' })).toBe(true);
        expect(actor.getSnapshot().context.retryAttempt).toBe(attemptBefore);
        expect(actor.getSnapshot().context.persistedError).toEqual(sampleChatError);
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('T19: each streamResumed resets the counter so the next disconnect starts at attempt 1', async () => {
      vi.useFakeTimers();
      try {
        const { actor } = createTestActorWithEmits({ activeChatId: 'chat_abc' });
        actor.start();
        actor.send({ type: 'startRequest', request: { kind: 'send', message: sampleMessage } });

        actor.send({
          type: 'requestFinished',
          messages: [sampleMessage],
          isAbort: false,
          isError: true,
          isDisconnect: true,
        });
        await vi.advanceTimersByTimeAsync(700);
        expect(actor.getSnapshot().context.retryAttempt).toBe(1);

        actor.send({ type: 'streamResumed' });
        expect(actor.getSnapshot().context.retryAttempt).toBe(0);

        actor.send({
          type: 'requestFinished',
          messages: [sampleMessage],
          isAbort: false,
          isError: true,
          isDisconnect: true,
        });
        expect(actor.getSnapshot().matches({ requestLifecycle: 'retrying' })).toBe(true);
        expect(actor.getSnapshot().context.retryAttempt).toBe(1);
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('T20: streamResumed raises clearPersistedError so errorPersistence clearing runs', async () => {
      vi.useFakeTimers();
      try {
        let clearErrorCallCount = 0;
        const actor = createTestActor({
          activeChatId: 'chat_abc',
          clearErrorResult: async () => {
            clearErrorCallCount++;
          },
        });
        actor.start();
        actor.send({ type: 'startRequest', request: { kind: 'send', message: sampleMessage } });
        actor.send({ type: 'setPersistedError', error: sampleChatError });
        await vi.advanceTimersByTimeAsync(0);
        await waitFor(actor, (s) => s.matches({ errorPersistence: 'idle' }));

        actor.send({ type: 'streamResumed' });
        expect(actor.getSnapshot().matches({ errorPersistence: 'clearing' })).toBe(true);

        await vi.advanceTimersByTimeAsync(0);
        await waitFor(actor, (s) => s.matches({ errorPersistence: 'idle' }));
        expect(clearErrorCallCount).toBe(1);
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
