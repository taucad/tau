/** Chat metadata persistence: loading, execution, kernel and command refusals. */

import { createAsyncLogic, setup, types } from 'xstate';
import type { CadAgentExecution, Chat, TauAgentHostId } from '@taucad/chat';
import type { ChatError } from '@taucad/types';
import type { KernelId } from '@taucad/types/constants';
import { eventSchemas } from '#lib/xstate.lib.js';

/** @public */
export type ChatPersistenceMachineInput = {
  activeChatId?: string;
  resourceId?: string;
};

/** The interrupted tool renderer still uses the request's terminal cause. @public */
export type RequestTerminationCause = 'user_stop' | 'preempt' | 'disconnect' | 'error' | 'success';

/** @public */
export type ChatPersistenceMachineContext = {
  activeChatId?: string;
  resourceId?: string;
  isLoadingChat: boolean;
  loadError?: Error;
  /** The last refused command; host run failures are selected from the log. */
  persistedError?: ChatError;
  /**
   * The execution this device runs the chat on: the chat record's portable
   * execution with this device's own placement for the chat put back on it.
   * `persistActiveExecutionActor` splits it again on write, so `chat.json`
   * never holds a device-relative host (cross-device chat handoff, XD2).
   */
  activeExecution?: CadAgentExecution;
  /**
   * This device's placement for the chat that this tab cannot reach (a loopback daemon another tab was handed, or
   * `origin` on a page no daemon served), so `activeExecution` runs locally instead and the composer says so (XD2).
   */
  heldPlacement?: TauAgentHostId;
  activeKernel?: KernelId;
  fault?: string;
};

/** What loading a chat answers: its row, or `undefined` when it has none yet. @public */
export type ChatLoadOutput = Readonly<{ chat: Chat | undefined; heldPlacement?: TauAgentHostId | undefined }>;

type ChatPersistenceMachineEvents =
  | { type: 'setActiveChatId'; chatId: string }
  | { type: 'handleError'; error: Error }
  | { type: 'setPersistedError'; error: ChatError }
  | { type: 'clearPersistedError' }
  | { type: 'turnRequested' }
  | { type: 'setActiveExecution'; execution: CadAgentExecution | undefined }
  /* This tab can now reach this device's held placement for the chat: run on it, persisting nothing (XD2). */
  | { type: 'placementReachable'; execution: CadAgentExecution }
  | { type: 'setActiveKernel'; kernel: KernelId | undefined };

/**
 * The held placement a newly chosen execution leaves standing: only while the chat stays on this tab's local Tau,
 * which is what the held placement explains. Any other choice — a daemon, a paired device, an external agent — ends it.
 */
const stillHeld = (
  context: ChatPersistenceMachineContext,
  execution: CadAgentExecution | undefined,
): TauAgentHostId | undefined =>
  execution?.kind === 'tau' && execution.hostId === undefined ? context.heldPlacement : undefined;

const loadChatActor = createAsyncLogic<ChatLoadOutput, { chatId: string }>({
  run: async () => {
    throw new Error('chatPersistenceMachine: the loadChatActor actor was not provided.');
  },
});

const persistErrorActor = createAsyncLogic<void, { chatId: string; error: ChatError }>({
  run: async () => {
    throw new Error('chatPersistenceMachine: the persistErrorActor actor was not provided.');
  },
});

const clearErrorActor = createAsyncLogic<void, { chatId: string }>({
  run: async () => {
    throw new Error('chatPersistenceMachine: the clearErrorActor actor was not provided.');
  },
});

const persistActiveExecutionActor = createAsyncLogic<
  void,
  { chatId: string; activeExecution: CadAgentExecution | undefined }
>({
  run: async () => {
    throw new Error('chatPersistenceMachine: the persistActiveExecutionActor actor was not provided.');
  },
});

const persistActiveKernelActor = createAsyncLogic<void, { chatId: string; activeKernel: KernelId | undefined }>({
  run: async () => {
    throw new Error('chatPersistenceMachine: the persistActiveKernelActor actor was not provided.');
  },
});

const hasValidChatId = (context: ChatPersistenceMachineContext): boolean =>
  Boolean(context.activeChatId?.startsWith('chat_'));

const canPersist = (context: ChatPersistenceMachineContext): boolean =>
  !context.isLoadingChat && hasValidChatId(context);

const logPersistenceError = (error: unknown): void => {
  console.error('Chat persistence error:', error);
};

/** Metadata and refusal persistence; the host log alone owns the transcript and run state. @public */
export const chatPersistenceMachine = setup({
  schemas: {
    context: types<ChatPersistenceMachineContext>(),
    events: eventSchemas<ChatPersistenceMachineEvents>(),
    input: types<ChatPersistenceMachineInput>(),
  },
  actors: {
    loadChatActor,
    persistErrorActor,
    clearErrorActor,
    persistActiveExecutionActor,
    persistActiveKernelActor,
  },
}).createMachine({
  id: 'chatPersistence',
  version: '2',
  onError: ({ event }) => ({
    context: { fault: event.error instanceof Error ? event.error.message : 'chat persistence fault' },
  }),
  context: ({ input }) => ({
    activeChatId: input.activeChatId,
    resourceId: input.resourceId,
    isLoadingChat: false,
    loadError: undefined,
    persistedError: undefined,
    activeExecution: undefined,
    activeKernel: undefined,
  }),
  type: 'parallel',
  states: {
    chatLoading: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            setActiveChatId: ({ event }) =>
              event.chatId.startsWith('chat_')
                ? {
                    target: 'loading',
                    context: { activeChatId: event.chatId, isLoadingChat: true, loadError: undefined },
                  }
                : undefined,
          },
        },
        loading: {
          invoke: {
            src: 'loadChatActor',
            input: ({ context }) => ({ chatId: context.activeChatId! }),
            onDone: {
              target: 'idle',
              context: ({ event }) => ({
                isLoadingChat: false,
                persistedError: event.output.chat?.error,
                activeExecution: event.output.chat?.activeExecution,
                heldPlacement: event.output.heldPlacement,
                activeKernel: event.output.chat?.activeKernel,
              }),
            },
            onError: {
              target: 'idle',
              context: ({ event }) => ({ isLoadingChat: false, loadError: event.error as Error }),
            },
          },
          on: {
            setActiveChatId: ({ event }) =>
              event.chatId.startsWith('chat_')
                ? {
                    target: 'loading',
                    reenter: true,
                    context: { activeChatId: event.chatId, loadError: undefined },
                  }
                : undefined,
          },
        },
      },
    },
    activeExecutionPersistence: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            setActiveExecution: ({ context, event }) =>
              hasValidChatId(context)
                ? {
                    target: 'persisting',
                    context: { activeExecution: event.execution, heldPlacement: stillHeld(context, event.execution) },
                  }
                : undefined,
            placementReachable: ({ event }) => ({
              context: { activeExecution: event.execution, heldPlacement: undefined },
            }),
          },
        },
        persisting: {
          invoke: {
            src: 'persistActiveExecutionActor',
            input: ({ context }) => ({ chatId: context.activeChatId!, activeExecution: context.activeExecution }),
            onDone: { target: 'idle' },
            onError: { target: 'idle' },
          },
          on: {
            setActiveExecution: ({ context, event }) =>
              hasValidChatId(context)
                ? {
                    target: 'persisting',
                    reenter: true,
                    context: { activeExecution: event.execution, heldPlacement: stillHeld(context, event.execution) },
                  }
                : undefined,
            placementReachable: ({ event }) => ({
              context: { activeExecution: event.execution, heldPlacement: undefined },
            }),
          },
        },
      },
    },
    activeKernelPersistence: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            setActiveKernel: ({ context, event }) =>
              hasValidChatId(context) ? { target: 'persisting', context: { activeKernel: event.kernel } } : undefined,
          },
        },
        persisting: {
          invoke: {
            src: 'persistActiveKernelActor',
            input: ({ context }) => ({ chatId: context.activeChatId!, activeKernel: context.activeKernel }),
            onDone: { target: 'idle' },
            onError: { target: 'idle' },
          },
          on: {
            setActiveKernel: ({ context, event }) =>
              hasValidChatId(context)
                ? { target: 'persisting', reenter: true, context: { activeKernel: event.kernel } }
                : undefined,
          },
        },
      },
    },
    errorPersistence: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            setPersistedError: ({ context, event }) =>
              canPersist(context) ? { target: 'persisting', context: { persistedError: event.error } } : undefined,
            clearPersistedError: ({ context }) =>
              canPersist(context) ? { target: 'clearing', context: { persistedError: undefined } } : undefined,
          },
        },
        persisting: {
          invoke: {
            src: 'persistErrorActor',
            input: ({ context }) => ({ chatId: context.activeChatId!, error: context.persistedError! }),
            onDone: { target: 'idle' },
            onError: { target: 'idle' },
          },
          on: {
            setPersistedError: {
              target: 'persisting',
              reenter: true,
              context: ({ event }) => ({ persistedError: event.error }),
            },
            clearPersistedError: { target: 'clearing', context: { persistedError: undefined } },
          },
        },
        clearing: {
          invoke: {
            src: 'clearErrorActor',
            input: ({ context }) => ({ chatId: context.activeChatId! }),
            onDone: { target: 'idle', context: { persistedError: undefined } },
            onError: { target: 'idle', context: { persistedError: undefined } },
          },
          on: {
            setPersistedError: { target: 'persisting', context: ({ event }) => ({ persistedError: event.error }) },
          },
        },
      },
    },
  },
  on: {
    turnRequested: (_args, enq) => {
      enq.raise({ type: 'clearPersistedError' });
      return {};
    },
    handleError: ({ event }, enq) => {
      enq(logPersistenceError, event.error);
      return {};
    },
  },
});

/** State and event pairs intentionally ignored by the metadata machine (MC-R17). @public */
export const chatPersistenceIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ['errorPersistence.idle', 'setPersistedError'],
  ['errorPersistence.idle', 'clearPersistedError'],
  ['activeExecutionPersistence.idle', 'setActiveExecution'],
  ['activeExecutionPersistence.persisting', 'setActiveExecution'],
  ['activeKernelPersistence.idle', 'setActiveKernel'],
  ['activeKernelPersistence.persisting', 'setActiveKernel'],
];

export type ChatPersistenceMachineState = ReturnType<typeof chatPersistenceMachine.getInitialSnapshot>;
export type ChatPersistenceMachineActor = typeof chatPersistenceMachine;
