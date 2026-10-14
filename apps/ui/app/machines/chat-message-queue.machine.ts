/**
 * Owns one page's outbox advance effect. Items are a cache of the Home queue
 * file, refreshed by the supplied filesystem watch; the host log owns runs.
 */
import { z } from 'zod';
import { createActor, createAsyncLogic, createCallbackLogic, setup, types } from 'xstate';
import type { Actor, ActorOptions, AnyActorLogic } from 'xstate';
import type { QueuedChatMessage } from '#db/chat-message-queue-store.js';
import type { MachineActors } from '#lib/xstate.lib.js';

export type ChatMessageQueueMachineInput = Readonly<{ chatId: string; projectId: string }>;
export type QueueAdvanceResult = Readonly<{
  items: readonly QueuedChatMessage[];
  status: 'waiting' | 'changed' | 'blocked';
  error?: string;
}>;
export type ChatMessageQueueMachineContext = ChatMessageQueueMachineInput &
  Readonly<{
    items: readonly QueuedChatMessage[];
    revision: number;
    error: string | undefined;
    sendingId: string | undefined;
  }>;
export const chatMessageQueueIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [];
export const chatMessageQueueMachine = setup({
  schemas: {
    context: types<ChatMessageQueueMachineContext>(),
    events: {
      refresh: z.object({}),
      retry: z.object({}),
      watchFailed: z.object({ error: z.string() }),
      loaded: types<{ items: readonly QueuedChatMessage[]; sendingId?: string }>(),
    },
    input: z.object({ chatId: z.string().min(1), projectId: z.string().min(1) }),
  },
  actors: {
    advance: createAsyncLogic<
      QueueAdvanceResult & { revision: number },
      ChatMessageQueueMachineInput & { revision: number }
    >({
      run: async () => {
        throw new Error('chatMessageQueueMachine: advance was not provided.');
      },
    }),
    read: createAsyncLogic<QueueAdvanceResult, ChatMessageQueueMachineInput>({
      run: async () => {
        throw new Error('chatMessageQueueMachine: read was not provided.');
      },
    }),
    watch: createCallbackLogic(() => {
      throw new Error('chatMessageQueueMachine: watch was not provided.');
    }),
  },
}).createMachine({
  id: 'chat-message-queue',
  version: '1',
  context: ({ input }) => ({ ...input, items: [], revision: 0, error: undefined, sendingId: undefined }),
  initial: 'checking',
  on: {
    loaded: ({ event }) => ({ context: { items: event.items, sendingId: event.sendingId } }),
    watchFailed: ({ event }) => ({ target: '.failed', context: { error: event.error, sendingId: undefined } }),
  },
  onError: ({ event }) => ({ target: '.failed', context: { error: String(event.error) } }),
  invoke: { src: 'watch', id: 'queue-watch' },
  states: {
    checking: {
      invoke: {
        src: 'advance',
        id: 'advance',
        input: ({ context }) => ({ chatId: context.chatId, projectId: context.projectId, revision: context.revision }),
        onDone: ({ context, event }) => ({
          target:
            event.output.status === 'blocked'
              ? 'failed'
              : event.output.status === 'changed' || event.output.revision !== context.revision
                ? 'checking'
                : 'waiting',
          reenter: true,
          context: { items: event.output.items, error: event.output.error, sendingId: undefined },
        }),
        onError: ({ event }) => ({
          target: 'failed',
          context: { error: event.error instanceof Error ? event.error.message : String(event.error) },
        }),
      },
      on: {
        refresh: ({ context }) => ({ context: { revision: context.revision + 1 } }),
        retry: ({ context }) => ({ context: { revision: context.revision + 1 } }),
      },
    },
    waiting: { on: { refresh: { target: 'checking' }, retry: { target: 'checking' } } },
    refreshing: {
      invoke: {
        src: 'read',
        input: ({ context }) => ({ chatId: context.chatId, projectId: context.projectId }),
        onDone: ({ event }) => ({
          target: event.output.items.length === 0 ? 'waiting' : 'failed',
          context: {
            items: event.output.items,
            sendingId: undefined,
            ...(event.output.items.length === 0 ? { error: undefined } : {}),
          },
        }),
        onError: ({ event }) => ({ target: 'failed', context: { sendingId: undefined, error: String(event.error) } }),
      },
      on: { refresh: { target: 'refreshing', reenter: true }, retry: { target: 'checking' } },
    },
    failed: {
      on: {
        // A deterministic refusal waits for an explicit retry, not every streamed delta.
        refresh: { target: 'refreshing' },
        retry: { target: 'checking' },
      },
    },
  },
});
/** Named effect slots supplied by the queue composition root. */
export type ChatMessageQueueActors = MachineActors<typeof chatMessageQueueMachine>;
export type ChatMessageQueueActor = Actor<typeof chatMessageQueueMachine>;
export const createChatMessageQueueActor = (
  input: ChatMessageQueueMachineInput,
  dependencies: {
    advance: (signal: AbortSignal, canDeliver: boolean) => Promise<QueueAdvanceResult>;
    watch: (refresh: () => void) => () => void;
  },
  options: Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'> = {},
): ChatMessageQueueActor =>
  createActor(
    chatMessageQueueMachine.provide({
      actors: {
        advance: createAsyncLogic<
          QueueAdvanceResult & { revision: number },
          ChatMessageQueueMachineInput & { revision: number }
        >({
          run: async ({ input: request, signal }) => {
            const result = await dependencies.advance(signal, true);
            signal.throwIfAborted();
            return { ...result, revision: request.revision };
          },
        }),
        read: createAsyncLogic<QueueAdvanceResult, ChatMessageQueueMachineInput>({
          run: async ({ signal }) => dependencies.advance(signal, false),
        }),
        watch: createCallbackLogic(({ sendBack }) =>
          dependencies.watch(() => {
            sendBack({ type: 'refresh' });
          }),
        ),
      } satisfies Partial<ChatMessageQueueActors>,
    }),
    { ...options, input },
  );
