import { describe, expect, it } from 'vitest';
import { createActor, createAsyncLogic, waitFor } from 'xstate';
import type { EventFromLogic } from 'xstate';
import { unansweredEvents } from '@taucad/xstate-testing/paths';
import type { Chat } from '@taucad/chat';
import type { ChatError } from '@taucad/types';
import { chatPersistenceIgnoredEvents, chatPersistenceMachine } from '#hooks/chat-persistence.machine.js';
import type { ChatLoadOutput } from '#hooks/chat-persistence.machine.js';

const refusal: ChatError = {
  category: 'generic',
  title: 'Could not start',
  message: 'The command was refused',
  code: 'HOST_CLOSED',
};

const chat = (id: string): Chat => ({
  id,
  resourceId: 'project_1',
  name: 'Chat',
  messages: [],
  createdAt: 0,
  updatedAt: 0,
  activeExecution: { kind: 'tau', model: 'model-a' },
  activeKernel: 'manifold',
  error: refusal,
});

describe('chatPersistenceMachine', () => {
  it('hydrates the selected chat, including its execution, kernel and refusal', async () => {
    const actor = createActor(
      chatPersistenceMachine.provide({
        actors: {
          loadChatActor: createAsyncLogic<ChatLoadOutput, { chatId: string }>({
            run: async () => ({ chat: chat('chat_a') }),
          }),
        },
      }),
      { input: {} },
    ).start();

    actor.send({ type: 'setActiveChatId', chatId: 'chat_a' });
    await waitFor(actor, (snapshot) => snapshot.matches({ chatLoading: 'idle' }));
    expect(actor.getSnapshot().context).toMatchObject({
      activeChatId: 'chat_a',
      activeExecution: { kind: 'tau', model: 'model-a' },
      activeKernel: 'manifold',
      persistedError: refusal,
    });
    actor.stop();
  });

  it('drops a stale load result after the active chat changes', async () => {
    let resolveFirst: ((value: { chat: Chat }) => void) | undefined;
    const actor = createActor(
      chatPersistenceMachine.provide({
        actors: {
          loadChatActor: createAsyncLogic<ChatLoadOutput, { chatId: string }>({
            run: async ({ input }) =>
              input.chatId === 'chat_a'
                ? new Promise<{ chat: Chat }>((resolve) => {
                    resolveFirst = resolve;
                  })
                : { chat: chat('chat_b') },
          }),
        },
      }),
      { input: {} },
    ).start();

    actor.send({ type: 'setActiveChatId', chatId: 'chat_a' });
    actor.send({ type: 'setActiveChatId', chatId: 'chat_b' });
    await waitFor(actor, (snapshot) => snapshot.matches({ chatLoading: 'idle' }));
    resolveFirst?.({ chat: chat('chat_a') });
    await Promise.resolve();
    expect(actor.getSnapshot().context.activeChatId).toBe('chat_b');
    expect(actor.getSnapshot().context.activeExecution).toEqual(chat('chat_b').activeExecution);
    actor.stop();
  });

  it('persists only chat metadata and refused commands', async () => {
    const writes: string[] = [];
    const actor = createActor(
      chatPersistenceMachine.provide({
        actors: {
          persistActiveExecutionActor: createAsyncLogic<
            void,
            { chatId: string; activeExecution: Chat['activeExecution'] }
          >({
            run: async ({ input }) => {
              writes.push(`execution:${input.chatId}:${input.activeExecution?.kind}`);
            },
          }),
          persistActiveKernelActor: createAsyncLogic<void, { chatId: string; activeKernel: Chat['activeKernel'] }>({
            run: async ({ input }) => {
              writes.push(`kernel:${input.chatId}:${input.activeKernel}`);
            },
          }),
          persistErrorActor: createAsyncLogic<void, { chatId: string; error: ChatError }>({
            run: async ({ input }) => {
              writes.push(`refusal:${input.chatId}:${input.error.code}`);
            },
          }),
          clearErrorActor: createAsyncLogic<void, { chatId: string }>({
            run: async ({ input }) => {
              writes.push(`clear:${input.chatId}`);
            },
          }),
        },
      }),
      { input: { activeChatId: 'chat_a' } },
    ).start();

    actor.send({ type: 'setActiveExecution', execution: { kind: 'tau', model: 'model-b' } });
    actor.send({ type: 'setActiveKernel', kernel: 'manifold' });
    actor.send({ type: 'setPersistedError', error: refusal });
    await waitFor(actor, (snapshot) =>
      snapshot.matches({
        activeExecutionPersistence: 'idle',
        activeKernelPersistence: 'idle',
        errorPersistence: 'idle',
      }),
    );
    expect(writes).toEqual(
      expect.arrayContaining(['execution:chat_a:tau', 'kernel:chat_a:manifold', 'refusal:chat_a:HOST_CLOSED']),
    );

    actor.send({ type: 'clearPersistedError' });
    expect(actor.getSnapshot().context.persistedError).toBeUndefined();
    await waitFor(actor, (snapshot) => snapshot.matches({ errorPersistence: 'idle' }));
    expect(writes).toContain('clear:chat_a');
    actor.stop();
  });

  it('answers its current events or declares them ignored', () => {
    const events = [
      { type: 'setActiveChatId', chatId: 'chat_a' },
      { type: 'handleError', error: new Error('x') },
      { type: 'setPersistedError', error: refusal },
      { type: 'clearPersistedError' },
      { type: 'turnRequested' },
      { type: 'setActiveExecution', execution: undefined },
      { type: 'setActiveKernel', kernel: undefined },
    ] satisfies Array<EventFromLogic<typeof chatPersistenceMachine>>;
    expect(
      unansweredEvents(chatPersistenceMachine, {
        input: {},
        events,
        limit: 20_000,
        ignore: chatPersistenceIgnoredEvents,
        serializeState: (snapshot) => JSON.stringify([snapshot.value, snapshot.context.isLoadingChat]),
      }),
    ).toEqual([]);
  });
});
