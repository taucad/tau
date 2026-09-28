// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- mock for AI SDK's Chat / DefaultChatTransport classes uses the SDK's own PascalCase names and `~`-prefixed subscriber method names verbatim so the mock surface matches the real one. */
/* eslint-disable @typescript-eslint/explicit-member-accessibility -- mock class constructors omit the `public` keyword to mirror the AI SDK's published shape. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createActor } from 'xstate';
import type { Chat as ChatEntity, ModelSupport, MyUIMessage } from '@taucad/chat';
import { errorCategory } from '@taucad/types/constants';
import type * as AiSdk from 'ai';
import type { AgentHostClient } from '#services/agent-host-client.js';
import type { CommandAnswer, HostCommand } from '@taucad/agent-host/wire';
import { chatSessionMachine } from '#machines/chat-session.machine.js';
import { sha256Bytes } from '@taucad/utils/hash';
import { uint8ArrayToBase64 } from 'uint8array-extras';
import type { ChatRequest, ChatTurnGesture, ChatTurnSettlementInput } from '#machines/chat-session.machine.js';
import type { ProjectSessionActorRef } from '#machines/project-session.machine.js';
import { projectSessionMachine } from '#machines/project-session.machine.js';
import { spyOnSend } from '#lib/xstate-test.utils.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import {
  chatTurnAdmission,
  publishChatTurnAdmission,
  resetChatTurnServices,
} from '#chat-clients/_internal/chat-host-binding.js';
import {
  lifecycleRow,
  logRow,
  publishLogPage,
  publishLogRows,
  runningRows,
} from '#machines/chat-projection.fixture.js';

// ---------------------------------------------------------------------------
// Hoisted test harness
//
// Mocks the AI SDK's `Chat` class so the tests can drive snapshot callbacks
// (`~registerMessagesCallback`, `~registerStatusCallback`,
// `~registerErrorCallback`) deterministically and assert that
// `ChatSessionStore` mirrors them into per-chat subscriptions.
//
// Each `new Chat({ id, ... })` records the constructor input and is exposed
// via `harness.created` so the test can drive callbacks per chat instance.
// ---------------------------------------------------------------------------

type FakeChatInstance = {
  id: string;
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  error: Error | undefined;
  messages: MyUIMessage[];
  sendMessage: ReturnType<typeof vi.fn>;
  regenerate: ReturnType<typeof vi.fn>;
  resumeStream: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  makeRequest: ReturnType<typeof vi.fn>;
  finish: (options?: Partial<{ isAbort: boolean; isError: boolean; isDisconnect: boolean }>) => void;
  // Test driver — invoke any registered messages callback
  emitMessagesChange: () => void;
  emitStatusChange: () => void;
  emitErrorChange: () => void;
  '~registerMessagesCallback': (onChange: () => void) => () => void;
  '~registerStatusCallback': (onChange: () => void) => () => void;
  '~registerErrorCallback': (onChange: () => void) => () => void;
};

/**
 * Finish a run that streamed a reply: the status walk the AI SDK makes before `onFinish`.
 *
 * @param chat - The chat whose request ends.
 */
function finishRun(chat: FakeChatInstance): void {
  for (const status of ['submitted', 'streaming', 'ready'] as const) {
    chat.status = status;
    chat.emitStatusChange();
  }
  chat.finish();
}

const harness = vi.hoisted(() => ({
  created: [] as FakeChatInstance[],
  envApi: 'http://test.local',
}));

vi.mock('@ai-sdk/react', () => ({
  // oxlint-disable-next-line typescript-eslint/no-extraneous-class -- mock requires a `new`able value
  Chat: class {
    public id: string;
    public status: 'submitted' | 'streaming' | 'ready' | 'error' = 'ready';
    public error: Error | undefined = undefined;
    public messages: MyUIMessage[] = [];
    public sendMessage = vi.fn().mockResolvedValue(undefined);
    public regenerate = vi.fn().mockResolvedValue(undefined);
    public resumeStream = vi.fn().mockResolvedValue(undefined);
    public stop = vi.fn().mockResolvedValue(undefined);
    public makeRequest = vi.fn().mockResolvedValue(undefined);
    readonly #messagesListeners = new Set<() => void>();
    readonly #statusListeners = new Set<() => void>();
    readonly #errorListeners = new Set<() => void>();

    constructor(init: {
      id: string;
      messages?: MyUIMessage[];
      onFinish?: (input: {
        messages: MyUIMessage[];
        isAbort: boolean;
        isError: boolean;
        isDisconnect: boolean;
      }) => void;
    }) {
      this.id = init.id;
      this.messages = init.messages ?? [];
      const fake: FakeChatInstance = Object.assign(this, {
        emitMessagesChange: () => {
          for (const listener of this.#messagesListeners) {
            listener();
          }
        },
        emitStatusChange: () => {
          for (const listener of this.#statusListeners) {
            listener();
          }
        },
        emitErrorChange: () => {
          for (const listener of this.#errorListeners) {
            listener();
          }
        },
        finish: (options?: Partial<{ isAbort: boolean; isError: boolean; isDisconnect: boolean }>) => {
          init.onFinish?.({
            messages: this.messages,
            isAbort: options?.isAbort ?? false,
            isError: options?.isError ?? false,
            isDisconnect: options?.isDisconnect ?? false,
          });
        },
      });
      harness.created.push(fake);
    }

    public '~registerMessagesCallback' = (onChange: () => void): (() => void) => {
      this.#messagesListeners.add(onChange);
      return () => {
        this.#messagesListeners.delete(onChange);
      };
    };

    public '~registerStatusCallback' = (onChange: () => void): (() => void) => {
      this.#statusListeners.add(onChange);
      return () => {
        this.#statusListeners.delete(onChange);
      };
    };

    public '~registerErrorCallback' = (onChange: () => void): (() => void) => {
      this.#errorListeners.add(onChange);
      return () => {
        this.#errorListeners.delete(onChange);
      };
    };
  },
}));

vi.mock('ai', async (importOriginal) => ({
  // The composer record store validates drafts with the real `safeValidateUIMessages`.
  ...(await importOriginal<typeof AiSdk>()),
  // oxlint-disable-next-line typescript-eslint/no-extraneous-class -- mock requires a `new`able value
  DefaultChatTransport: class {},
  lastAssistantMessageIsCompleteWithApprovalResponses: vi.fn(() => false),
}));

vi.mock('#environment.config.js', () => ({
  ENV: { TAU_API_URL: harness.envApi },
}));

vi.mock('#machines/inspector.js', () => ({
  inspect: undefined,
}));

const { ChatSessionStore } = await import('#services/chat-session-store.js');
const { selectVisibleChatError } = await import('#routes/w.$workspace.$project/chat-error.js');
const { attachmentSendBlockReason, buildUserMessage } = await import('#utils/chat.utils.js');
type StoreType = InstanceType<typeof ChatSessionStore>;
type ChatSessionDeps = Parameters<StoreType['setDependencies']>[0];

/**
 * Use vitest's generic `vi.fn<T>()` form so each mock carries the precise
 * callable signature declared by `ChatSessionDeps`. Without the generic,
 * `vi.fn()` defaults to a permissive `Constructable | Procedure` shape
 * that doesn't structurally match the typed closure fields.
 */
type StubDeps = {
  [K in Exclude<keyof ChatSessionDeps, 'client'>]: ReturnType<typeof vi.fn<ChatSessionDeps[K]>>;
} & { client: MemoryClient };

const notFound = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });

/**
 * The worker filesystem client, in memory. One instance stands for one
 * device's disk, so two stores over it are a reload.
 */
function createMemoryClient() {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const under = (path: string): string[] =>
    [...files.keys()].filter((entry) => entry.startsWith(`${path}/`)).map((entry) => entry.slice(path.length + 1));
  return {
    files,
    /** Paths whose reads reject with an I/O error rather than a not-found. */
    failingReads: new Set<string>(),
    json(path: string): unknown {
      const bytes = files.get(path);
      return bytes === undefined ? undefined : JSON.parse(new TextDecoder().decode(bytes));
    },
    namesUnder(path: string): string[] {
      return under(path).sort();
    },
    async readFile(path: string): Promise<Uint8Array<ArrayBuffer>> {
      if (this.failingReads.has(path)) {
        throw Object.assign(new Error(`EIO: ${path}`), { code: 'EIO' });
      }
      const bytes = files.get(path);
      if (bytes === undefined) {
        throw notFound(path);
      }
      return bytes;
    },
    async writeFile(path: string, data: Uint8Array<ArrayBuffer>): Promise<void> {
      files.set(path, data);
    },
    async exists(path: string): Promise<boolean> {
      return files.has(path) || under(path).length > 0;
    },
    async readdir(path: string): Promise<string[]> {
      const names = under(path);
      if (names.length === 0) {
        throw notFound(path);
      }
      return names;
    },
    async unlink(path: string): Promise<void> {
      if (!files.delete(path)) {
        throw notFound(path);
      }
    },
    async rmdir(path: string): Promise<void> {
      for (const name of under(path)) {
        files.delete(`${path}/${name}`);
      }
    },
  };
}
type MemoryClient = ReturnType<typeof createMemoryClient>;

function createStubDeps(client: MemoryClient = createMemoryClient()): StubDeps {
  return {
    getChat: vi.fn<ChatSessionDeps['getChat']>().mockResolvedValue(undefined),
    patchChat: vi.fn<ChatSessionDeps['patchChat']>().mockResolvedValue(undefined),
    touchChatRecency: vi.fn<ChatSessionDeps['touchChatRecency']>().mockResolvedValue(undefined),
    consumeChatStartupRequest: vi.fn<ChatSessionDeps['consumeChatStartupRequest']>().mockResolvedValue(undefined),
    commitCancelledDraftRestore: vi.fn<ChatSessionDeps['commitCancelledDraftRestore']>().mockResolvedValue(undefined),
    client,
  };
}

const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const pdfBytes = new TextEncoder().encode('%PDF-1.7\nbracket: hole 7.3 mm, plate 4.5 mm\n');
const pngHash = await sha256Bytes(pngBytes);
const pdfHash = await sha256Bytes(pdfBytes);
const pngUrl = `attachments/${pngHash}.png`;
const pdfUrl = `attachments/${pdfHash}.pdf`;
const dataUrlOf = (mediaType: string, bytes: Uint8Array<ArrayBuffer>): string =>
  `data:${mediaType};base64,${uint8ArrayToBase64(bytes)}`;
const composerPath = (projectId: string, chatId: string): string => `/.tau/composers/chats/${projectId}/${chatId}.json`;
const draftAttachmentsDirectory = (projectId: string, chatId: string): string =>
  `/.tau/composers/chats/${projectId}/${chatId}/attachments`;
const chatAttachmentsDirectory = (projectId: string, chatId: string): string =>
  `/projects/${projectId}/.tau/chats/${chatId}/attachments`;

/** A chat row owned by `projectId`, as `getChat` returns it. */
function chatRow(chatId: string, projectId: string, overrides: Partial<ChatEntity> = {}): ChatEntity {
  return { id: chatId, resourceId: projectId, name: '', messages: [], createdAt: 0, updatedAt: 0, ...overrides };
}

/** Let promise chains and zero-delay timers run out. */
async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each round drains what the previous one scheduled
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

/* The host settles every turn (W8 TS-S6); these rows assert which run the chat's session actor ends, and how. */
const recordedSettlements = new Map<string, ChatTurnSettlementInput[]>();
const recordingSettlement = fromSafeAsync<void, ChatTurnSettlementInput>(async ({ input }) => {
  recordedSettlements.get(input.chatId)?.push(input);
});

/** Every store here runs its chats on this logic, so a row can record the turns a chat ends (PV-S5: the store owns each chat's root). */
const chatSession = chatSessionMachine.provide({
  actors: { admitTurn: chatTurnAdmission, settleTurn: recordingSettlement },
});

function createStore(): StoreType {
  const store = new ChatSessionStore({ chatSession });
  store.setDependencies(createStubDeps());
  return store;
}

/** Project sessions a row started, stopped after it. */
const turnOwners: Array<{ stop: () => void }> = [];

/**
 * Register the project session that owns a chat's turns (C3).
 *
 * `store.requestTurn` reaches the chat's session actor and nothing else, so a
 * row that drives a verb — or a seeded first turn — has to give the chat the
 * owner the app gives it.
 *
 * @param store - The store under test.
 * @param projectId - The project whose session owns the chat.
 */
function startTurnOwner(store: StoreType, projectId: string): void {
  const session = createActor(projectSessionMachine, { input: { projectId } });
  session.start();
  turnOwners.push(session);
  store.setFocusedProject(projectId);
  store.setProjectSession(projectId, session);
}

/**
 * Record any page-side settlement attempt; a projected terminal run must not make one.
 *
 * @param chatId - The chat whose settlements to record.
 * @returns The settlements the chat's session actor asked for, in order.
 */
function publishSettlementRecorder(chatId: string): ChatTurnSettlementInput[] {
  const settlements: ChatTurnSettlementInput[] = [];
  recordedSettlements.set(chatId, settlements);
  return settlements;
}

/**
 * Publish what one chat's admission composes, as its route would.
 *
 * Deliberately separable from {@link startTurnOwner}: the seeded first turn is
 * requested before the route has mounted, and the admission actor waits for
 * this rather than timing out on it.
 *
 * @param chatId - The chat this admission belongs to.
 * @param request - What the admission composes, or a throw to refuse the turn.
 */
function publishAdmission(
  chatId: string,
  request: (gesture: ChatTurnGesture) => Promise<ChatRequest> | ChatRequest,
): void {
  publishChatTurnAdmission(chatId, async (gesture) => ({
    runId: `run_${chatId}`,
    leaseTurnId: undefined,
    request: await request(gesture),
  }));
}

describe('ChatSessionStore — host command/watch cutover (PV-S10/S11)', () => {
  it('materializes a reopened completed chat from a foreign segment and refreshes changed bytes', async () => {
    const projectId = 'project_remote_transcript';
    const chatId = 'chat_remote_transcript';
    const path = `/projects/${projectId}/.tau/chats/${chatId}/events/other-device.jsonl`;
    const rows = readFileSync(
      new URL(
        '../../../../packages/agent-host/specs/ChatLog/recorded/in-project-ping-pong-turn.jsonl',
        pathToFileURL(import.meta.filename),
      ),
      'utf8',
    );
    const client = createMemoryClient();
    await client.writeFile(path, new TextEncoder().encode(rows));
    const store = new ChatSessionStore({ chatSession });
    store.setDependencies(createStubDeps(client));
    const hostCommand = vi.fn();
    const unpublish = store.publishProjectHostConnector(
      projectId,
      async () =>
        ({
          hostCommand,
          read: vi.fn(),
          subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
            queueMicrotask(() =>
              parameters[3]?.({
                status: 'batch',
                chatId,
                cursor: 0,
                nextCursor: 0,
                endCursor: 0,
                events: [],
              }),
            );
            return vi.fn();
          },
          close: vi.fn(async () => undefined),
        }) as unknown as AgentHostClient,
    );
    const unobserve = store.observe(chatId, projectId);
    const session = store.acquire(chatId, projectId);

    await store.refreshRemoteSegments(chatId, projectId);
    await vi.waitFor(() => {
      expect(session.chat.messages.some((message) => message.role === 'assistant')).toBe(true);
    });

    await client.writeFile(
      path,
      new TextEncoder().encode(
        rows.replace('Browser host completed the workspace change.', 'Browser host verified the workspace change.'),
      ),
    );
    await store.refreshRemoteSegments(chatId, projectId);
    await vi.waitFor(() => {
      expect(JSON.stringify(session.chat.messages)).toContain('Browser host verified the workspace change.');
    });
    expect(hostCommand).not.toHaveBeenCalled();
    store.release(chatId);
    unobserve();
    unpublish();
  });

  it('keeps a seed intent and exact user message through reload before durable Start acknowledgement', async () => {
    const deps = createStubDeps();
    const seed: MyUIMessage = {
      id: 'msg_seed_waiting_ack',
      role: 'user',
      parts: [{ type: 'text', text: 'Make a cube' }],
      metadata: { status: 'pending' },
    };
    deps.getChat.mockResolvedValue(
      chatRow('chat_seed_waiting_ack', 'project_seed_waiting_ack', {
        messages: [seed],
        startupRequest: {
          id: 'req_seed_waiting_ack',
          kind: 'regenerate-tail',
          messageId: seed.id,
          source: 'homepage-initial-message',
          createdAt: 1,
        },
      }),
    );
    const first = new ChatSessionStore({ chatSession });
    first.setDependencies(deps);
    first.acquire('chat_seed_waiting_ack', 'project_seed_waiting_ack');
    await vi.waitFor(() => {
      expect(first.get('chat_seed_waiting_ack')?.chat.messages).toContainEqual(seed);
    });
    expect(deps.consumeChatStartupRequest).not.toHaveBeenCalled();

    const reloaded = new ChatSessionStore({ chatSession });
    reloaded.setDependencies(deps);
    reloaded.acquire('chat_seed_waiting_ack', 'project_seed_waiting_ack');
    await vi.waitFor(() => {
      expect(reloaded.get('chat_seed_waiting_ack')?.chat.messages).toContainEqual(seed);
    });
    expect(deps.consumeChatStartupRequest).not.toHaveBeenCalled();
  });

  it('dispatches one admitted Start before the SDK watches its projected run', async () => {
    const store = createStore();
    const chatId = 'chat_live_command';
    const projectId = 'project_live_command';
    const settlements = publishSettlementRecorder(chatId);
    const command: HostCommand = {
      type: 'start',
      commandId: 'req_live_command',
      payload: {
        chatId,
        runId: 'req_live_command',
        message: { id: 'msg_live_command', role: 'user', content: 'Make a cube' },
        trigger: 'submit',
      },
    };
    const reply = Promise.withResolvers<CommandAnswer>();
    const hostCommand = vi.fn(async () => reply.promise);
    const close = vi.fn(async () => undefined);
    const unpublish = store.publishProjectHostConnector(
      projectId,
      async () => ({ hostCommand, close }) as unknown as AgentHostClient,
    );
    startTurnOwner(store, projectId);
    store.acquire(chatId, projectId);
    publishAdmission(chatId, () => ({
      kind: 'send',
      message: { id: 'msg_live_command', role: 'user', parts: [{ type: 'text', text: 'Make a cube' }] },
      command,
    }));
    const requested = store.requestTurn(chatId, {
      kind: 'send',
      message: { id: 'msg_live_command', role: 'user', parts: [{ type: 'text', text: 'Make a cube' }] },
    });
    await vi.waitFor(() => {
      expect(hostCommand).toHaveBeenCalledExactlyOnceWith(command);
    });
    const chat = harness.created.find((entry) => entry.id === chatId)!;
    expect(chat.sendMessage).not.toHaveBeenCalled();
    reply.resolve({ commandId: command.commandId, generation: 1, status: 'applied', effect: 'durable', cursor: 1 });
    await requested;
    await vi.waitFor(() => {
      expect(chat.sendMessage).toHaveBeenCalledTimes(1);
    });
    expect(settlements).toEqual([]);
    expect(close).toHaveBeenCalledTimes(1);
    unpublish();
  });

  it('retires a hydrated legacy connection card after read-only catch-up, fresh output, and reload', async () => {
    const chatId = 'chat_recovered_connection';
    const projectId = 'project_recovered_connection';
    const legacyError = {
      category: errorCategory.generic,
      title: 'Something went wrong',
      message: 'Channel closed (local)',
    };
    const deps = createStubDeps();
    deps.getChat.mockResolvedValue(chatRow(chatId, projectId, { error: legacyError }));
    const rows = [
      ...runningRows('run_recovered_connection'),
      logRow(2, {
        runId: 'run_recovered_connection',
        type: 'message.appended',
        message: { id: 'msg_recovered_reply', role: 'assistant', content: 'Resumed output' },
      }),
      lifecycleRow(3, 'completed', 'run_recovered_connection'),
    ];
    const hostCommand = vi.fn<AgentHostClient['hostCommand']>();
    const close = vi.fn(async () => undefined);
    const connect = async (): Promise<Pick<AgentHostClient, 'hostCommand' | 'read' | 'subscribe' | 'close'>> => ({
      hostCommand,
      close,
      read: vi.fn<AgentHostClient['read']>(async () => ({
        status: 'batch',
        chatId,
        cursor: 0,
        nextCursor: rows.length,
        endCursor: rows.length,
        events: rows,
      })),
      subscribe: (...args) => {
        args[3]?.({
          status: 'batch',
          chatId,
          cursor: 0,
          nextCursor: rows.length,
          endCursor: rows.length,
          events: rows,
        });
        return () => undefined;
      },
    });
    const settlements = publishSettlementRecorder(chatId);

    const open = async () => {
      const store = new ChatSessionStore({ chatSession });
      store.setDependencies(deps);
      const session = store.acquire(chatId, projectId);
      await vi.waitFor(() => {
        expect(session.persistenceActorRef.getSnapshot().context.persistedError).toEqual(legacyError);
      });
      const visibleError = () =>
        selectVisibleChatError({
          error: session.chat.error,
          persistedError: session.persistenceActorRef.getSnapshot().context.persistedError,
          projection: store.getProjection(chatId),
          attachmentStatus: store.getAttachmentStatus(chatId),
        });
      expect(visibleError()).toEqual(legacyError);
      const unobserve = store.observe(chatId, projectId);
      const unpublish = store.publishProjectHostConnector(projectId, connect);
      await vi.waitFor(() => {
        expect(store.getAttachmentStatus(chatId)).toBe('attached');
        expect(
          session.chat.messages.some((message) =>
            message.parts.some((part) => part.type === 'text' && part.text === 'Resumed output'),
          ),
        ).toBe(true);
      });
      expect(visibleError()).toBeUndefined();
      store.release(chatId);
      unobserve();
      unpublish();
    };

    await open();
    await open();
    expect(hostCommand).not.toHaveBeenCalled();
    expect(settlements).toEqual([]);
  });

  it('keeps the chat root idle after an empty caught-up log retires a legacy error', async () => {
    const chatId = 'chat_empty_recovery';
    const projectId = 'project_empty_recovery';
    const deps = createStubDeps();
    deps.getChat.mockResolvedValue(
      chatRow(chatId, projectId, {
        error: { category: errorCategory.generic, title: 'Old fault', message: 'Old channel closed' },
      }),
    );
    const store = new ChatSessionStore({ chatSession });
    store.setDependencies(deps);
    const session = store.acquire(chatId, projectId);
    await vi.waitFor(() => {
      expect(session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
    });
    const unobserve = store.observe(chatId, projectId);
    const hostCommand = vi.fn<AgentHostClient['hostCommand']>();
    const unpublish = store.publishProjectHostConnector(
      projectId,
      async () =>
        ({
          hostCommand,
          read: vi.fn<AgentHostClient['read']>(async () => ({
            status: 'batch',
            chatId,
            cursor: 0,
            nextCursor: 0,
            endCursor: 0,
            events: [],
          })),
          subscribe: (...args: Parameters<AgentHostClient['subscribe']>) => {
            args[3]?.({ status: 'batch', chatId, cursor: 0, nextCursor: 0, endCursor: 0, events: [] });
            return () => undefined;
          },
          close: vi.fn(async () => undefined),
        }) as unknown as AgentHostClient,
    );
    await vi.waitFor(() => {
      expect(store.getAttachmentStatus(chatId)).toBe('attached');
    });
    expect(session.stateActorRef.getSnapshot().matches({ run: 'idle' })).toBe(true);
    expect(hostCommand).not.toHaveBeenCalled();
    unpublish();
    unobserve();
    store.release(chatId);
  });

  it('ignores a retired attachment callback after a newer run fails', async () => {
    const chatId = 'chat_attachment_generation';
    const projectId = 'project_attachment_generation';
    const store = createStore();
    const answers: Array<Parameters<AgentHostClient['subscribe']>[3]> = [];
    const hostCommand = vi.fn<AgentHostClient['hostCommand']>();
    const connect = async (): Promise<Pick<AgentHostClient, 'hostCommand' | 'read' | 'subscribe' | 'close'>> => ({
      hostCommand,
      close: vi.fn(async () => undefined),
      read: vi.fn<AgentHostClient['read']>(async () => ({
        status: 'batch',
        chatId,
        cursor: 0,
        nextCursor: 0,
        endCursor: 0,
        events: [],
      })),
      subscribe: (...args) => {
        answers.push(args[3]);
        return () => undefined;
      },
    });
    const unpublishOld = store.publishProjectHostConnector(projectId, connect);
    const unobserve = store.observe(chatId, projectId);
    await vi.waitFor(() => {
      expect(answers).toHaveLength(1);
    });
    answers[0]?.({
      status: 'batch',
      chatId,
      cursor: 0,
      nextCursor: 2,
      endCursor: 2,
      events: runningRows('run_prior'),
    });
    expect(store.getAttachmentStatus(chatId)).toBe('attached');

    const unpublishCurrent = store.publishProjectHostConnector(projectId, connect);
    await vi.waitFor(() => {
      expect(answers).toHaveLength(2);
    });
    answers[1]?.({
      status: 'batch',
      chatId,
      cursor: 2,
      nextCursor: 5,
      endCursor: 5,
      events: [
        lifecycleRow(2, 'admitted', 'run_current'),
        lifecycleRow(3, 'running', 'run_current'),
        logRow(4, {
          runId: 'run_current',
          type: 'run.lifecycle',
          state: 'failed',
          attempt: 1,
          detail: { message: 'Current failure' },
        }),
      ],
    });
    const visibleError = () =>
      selectVisibleChatError({
        error: undefined,
        persistedError: undefined,
        projection: store.getProjection(chatId),
        attachmentStatus: store.getAttachmentStatus(chatId),
      });
    expect(store.getAttachmentStatus(chatId)).toBe('attached');
    expect(store.getProjection(chatId)?.ledger.currentRunId).toBe('run_current');
    expect(store.getProjection(chatId)?.ledger.runs['run_current']?.lifecycle).toBe('failed');
    expect(store.getProjection(chatId)?.failure?.text).toContain('Current failure');
    expect(visibleError()?.message).toContain('Current failure');

    answers[0]?.({
      status: 'batch',
      chatId,
      cursor: 2,
      nextCursor: 3,
      endCursor: 3,
      events: [lifecycleRow(2, 'completed', 'run_prior')],
    });
    answers[0]?.({
      status: 'batch',
      chatId,
      cursor: 2,
      nextCursor: 3,
      endCursor: 3,
      events: [
        logRow(2, {
          runId: 'run_prior',
          type: 'run.lifecycle',
          state: 'failed',
          attempt: 1,
          detail: { message: 'Old failure' },
        }),
      ],
    });
    expect(visibleError()?.message).toContain('Current failure');
    expect(hostCommand).not.toHaveBeenCalled();
    unobserve();
    unpublishCurrent();
    unpublishOld();
  });
});

describe('ChatSessionStore — run accounting per project (R2)', () => {
  /**
   * A project session, reduced to what the store sends it.
   *
   * The real machine is driven in `project-session.machine.test.ts`; what this
   * pin is about is *which* session hears a run start and settle.
   */
  const fakeSession = (projectId: string) => {
    const heard: Array<{ type: string; runs: string[]; stoppableRuns: string[] }> = [];
    let runs: string[] = [];
    let stoppableRuns: string[] = [];
    return {
      projectId,
      heard,
      ref: {
        send: (event: { type: string; runs: string[]; stoppableRuns: string[] }) => {
          heard.push(event);
          if (event.type === 'projectedRunsChanged') {
            runs = event.runs;
            stoppableRuns = event.stoppableRuns;
          }
        },
        getSnapshot: () => ({ context: { runs, stoppableRuns } }),
      } as unknown as Parameters<StoreType['setProjectSession']>[1],
    };
  };

  it('projects a run to the chat’s own project, not the focused one', async () => {
    const store = createStore();
    const projectA = fakeSession('proj_a');
    const projectB = fakeSession('proj_b');

    store.setProjectSession('proj_a', projectA.ref);
    store.setFocusedProject('proj_a');
    store.acquire('chat-a', 'proj_a');
    const stopObserving = store.observe('chat-a', 'proj_a');
    publishLogRows('chat-a', runningRows());
    expect(projectA.heard).toContainEqual({ type: 'projectedRunsChanged', runs: ['chat-a'], stoppableRuns: [] });

    /* The person navigates to B while A's run is still going. */
    store.setProjectSession('proj_b', projectB.ref);
    store.setFocusedProject('proj_b');
    publishLogRows('chat-a', [lifecycleRow(2, 'completed')], 2);

    expect(projectA.heard.at(-1)).toEqual({ type: 'projectedRunsChanged', runs: [], stoppableRuns: [] });
    expect(projectB.heard).toEqual([]);
    stopObserving();
    store.release('chat-a');
    store.setProjectSession('proj_a', undefined);
    store.setProjectSession('proj_b', undefined);
  });

  it('binds a retained project chat to its known owner while another project is focused', () => {
    const store = createStore();
    const projectA = fakeSession('proj_a');
    const projectB = fakeSession('proj_b');
    store.setProjectSession('proj_a', projectA.ref);
    store.setProjectSession('proj_b', projectB.ref);
    store.setFocusedProject('proj_b');

    store.acquire('chat-a', 'proj_a');
    // @ts-expect-error -- focus never names a chat's project: its caller does (PV-A10).
    store.acquire('chat-a');
    store.release('chat-a');

    expect([...store.chatRootsOf('proj_a').keys()]).toEqual(['chat-a']);
    expect(store.chatRootsOf('proj_b').size).toBe(0);
    store.release('chat-a');
    store.setProjectSession('proj_a', undefined);
    store.setProjectSession('proj_b', undefined);
  });

  it('binds a chat acquired during a focus switch to its caller’s project before its row loads', async () => {
    const store = new ChatSessionStore({ chatSession });
    const deps = createStubDeps();
    let resolveLoadedChat!: (chat: ChatEntity) => void;
    const loadedChat = new Promise<ChatEntity>((resolve) => {
      resolveLoadedChat = resolve;
    });
    deps.getChat.mockImplementation(async () => loadedChat);
    store.setDependencies(deps);

    const projectA = fakeSession('proj_a');
    const projectB = fakeSession('proj_b');
    store.setProjectSession('proj_a', projectA.ref);
    store.setProjectSession('proj_b', projectB.ref);
    store.setFocusedProject('proj_b');

    /* React renders A's new chat before ProjectSessionBinding's focus effect
     * runs, so focus still says B. The caller names A (PV-S4). */
    const session = store.acquire('chat_a', 'proj_a');
    const stopObserving = store.observe('chat_a', 'proj_a');
    expect(store.chatRootsOf('proj_a').get('chat_a')).toBe(session.stateActorRef);
    expect(session.persistenceActorRef.getSnapshot().value).toMatchObject({ chatLoading: 'loading' });
    await vi.waitFor(() => {
      expect(deps.getChat).toHaveBeenCalledWith('chat_a');
    });
    store.setFocusedProject('proj_a');
    resolveLoadedChat({
      id: 'chat_a',
      resourceId: 'proj_a',
      name: 'A chat',
      messages: [],
      createdAt: 0,
      updatedAt: 0,
    });

    await vi.waitFor(() => {
      expect(session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
    });
    publishLogRows('chat_a', runningRows());

    expect(projectB.heard).toEqual([]);
    expect(projectA.heard).toContainEqual({ type: 'projectedRunsChanged', runs: ['chat_a'], stoppableRuns: [] });
    stopObserving();
    store.release('chat_a');
    store.setProjectSession('proj_a', undefined);
    store.setProjectSession('proj_b', undefined);
  });

  it('takes a gesture made before any route effect registered its project, rather than parking it (PV-S5)', () => {
    const store = createStore();
    const session = store.acquire('chat_unbound', 'proj_unbound');
    const gesture: ChatTurnGesture = { kind: 'regenerate' };

    void store.requestTurn('chat_unbound', gesture);

    expect(session.stateActorRef.getSnapshot().context.pendingGesture).toBe(gesture);
    store.release('chat_unbound');
  });

  it('keeps the agents pane’s chat machine across a project session re-registration (PV-S5)', () => {
    const store = createStore();
    store.setProjectSession('proj_pane', fakeSession('proj_pane').ref);
    const session = store.acquire('chat_pane', 'proj_pane');
    const machine = session.stateActorRef;
    expect(machine).toBeDefined();

    /* The project's route remounts: its binding unregisters and registers a new session. */
    store.setProjectSession('proj_pane', undefined);
    store.setProjectSession('proj_pane', fakeSession('proj_pane').ref);

    /* The pane subscribed to `machine` when the chat joined; it must still be the chat's machine. */
    expect(session.stateActorRef).toBe(machine);
    expect(machine.getSnapshot().status).toBe('active');
    store.release('chat_pane');
    store.setProjectSession('proj_pane', undefined);
  });

  it('forwards its project’s revision facts to a chat, whether it joined before or after them (PV-S5)', () => {
    const store = createStore();
    const revisionOf = (chatId: string) =>
      (store.get(chatId)!.stateActorRef.getSnapshot().value as { revision: Record<string, string> }).revision;

    store.acquire('chat_facts_early', 'proj_facts');
    store.setRevisionFacts('proj_facts', { dirty: true, sync: 'pending', branch: 'main' });
    store.acquire('chat_facts_late', 'proj_facts');
    store.acquire('chat_facts_other', 'proj_other');

    for (const chatId of ['chat_facts_early', 'chat_facts_late']) {
      expect(revisionOf(chatId)).toMatchObject({ tree: 'dirty', sync: 'pending' });
    }
    expect(revisionOf('chat_facts_other')).not.toMatchObject({ tree: 'dirty' });
    for (const chatId of ['chat_facts_early', 'chat_facts_late', 'chat_facts_other']) {
      store.release(chatId);
    }
  });

  it('should ignore a delayed hydration after the session is released', async () => {
    const store = new ChatSessionStore({ chatSession });
    const deps = createStubDeps();
    let resolveLoadedChat!: (chat: ChatEntity) => void;
    const loadedChat = new Promise<ChatEntity>((resolve) => {
      resolveLoadedChat = resolve;
    });
    deps.getChat.mockImplementation(async () => loadedChat);
    store.setDependencies(deps);
    const projectA = fakeSession('proj_a');
    const projectB = fakeSession('proj_b');
    store.setProjectSession('proj_a', projectA.ref);
    store.setProjectSession('proj_b', projectB.ref);
    store.setFocusedProject('proj_b');

    try {
      const root = store.acquire('chat_delayed_release', 'proj_b').stateActorRef;
      await vi.waitFor(() => {
        expect(deps.getChat).toHaveBeenCalledWith('chat_delayed_release');
      });
      store.release('chat_delayed_release');
      resolveLoadedChat({
        id: 'chat_delayed_release',
        resourceId: 'proj_b',
        name: 'Released chat',
        messages: [],
        createdAt: 0,
        updatedAt: 0,
      });
      await loadedChat;
      await Promise.resolve();
      await Promise.resolve();

      expect(store.get('chat_delayed_release')).toBeUndefined();
      expect(root.getSnapshot().status).toBe('stopped');
      expect(store.chatRootsOf('proj_b').size).toBe(0);
      expect(projectA.heard).toEqual([]);
      expect(projectB.heard).toEqual([]);
    } finally {
      store.setProjectSession('proj_a', undefined);
      store.setProjectSession('proj_b', undefined);
    }
  });

  it('should not let a released hydration close a reacquired replacement', async () => {
    const store = new ChatSessionStore({ chatSession });
    const deps = createStubDeps();
    let resolveFirstLoad!: (chat: ChatEntity) => void;
    const firstLoad = new Promise<ChatEntity>((resolve) => {
      resolveFirstLoad = resolve;
    });
    let resolveReplacementLoad!: (chat: ChatEntity) => void;
    const replacementLoad = new Promise<ChatEntity>((resolve) => {
      resolveReplacementLoad = resolve;
    });
    deps.getChat.mockImplementationOnce(async () => firstLoad).mockImplementationOnce(async () => replacementLoad);
    store.setDependencies(deps);
    const projectA = fakeSession('proj_a');
    const projectB = fakeSession('proj_b');
    store.setProjectSession('proj_a', projectA.ref);
    store.setProjectSession('proj_b', projectB.ref);
    store.setFocusedProject('proj_b');

    try {
      const released = store.acquire('chat_reacquired', 'proj_b');
      await vi.waitFor(() => {
        expect(deps.getChat).toHaveBeenCalledTimes(1);
      });
      store.release('chat_reacquired');
      const replacement = store.acquire('chat_reacquired', 'proj_b');
      await vi.waitFor(() => {
        expect(deps.getChat).toHaveBeenCalledTimes(2);
      });
      expect(replacement).not.toBe(released);

      resolveFirstLoad({
        id: 'chat_reacquired',
        resourceId: 'proj_b',
        name: 'Reacquired chat',
        messages: [],
        createdAt: 0,
        updatedAt: 0,
      });
      await firstLoad;
      await Promise.resolve();
      await Promise.resolve();

      expect(store.get('chat_reacquired')).toBe(replacement);
      expect(released.stateActorRef.getSnapshot().status).toBe('stopped');
      expect(replacement.stateActorRef.getSnapshot().status).toBe('active');
      expect(store.chatRootsOf('proj_b').get('chat_reacquired')).toBe(replacement.stateActorRef);
      expect(projectA.heard).toEqual([]);
    } finally {
      store.release('chat_reacquired');
      resolveReplacementLoad({
        id: 'chat_reacquired',
        resourceId: 'proj_b',
        name: 'Replacement chat',
        messages: [],
        createdAt: 0,
        updatedAt: 0,
      });
      store.setProjectSession('proj_a', undefined);
      store.setProjectSession('proj_b', undefined);
    }
  });

  it('keeps an early projected run with its owner through hydration', async () => {
    const store = new ChatSessionStore({ chatSession });
    const deps = createStubDeps();
    let resolveLoadedChat!: (chat: ChatEntity) => void;
    const loadedChat = new Promise<ChatEntity>((resolve) => {
      resolveLoadedChat = resolve;
    });
    deps.getChat.mockImplementation(async () => loadedChat);
    store.setDependencies(deps);

    const projectA = fakeSession('proj_a');
    const projectB = fakeSession('proj_b');
    store.setProjectSession('proj_a', projectA.ref);
    store.setProjectSession('proj_b', projectB.ref);
    store.setFocusedProject('proj_b');
    const stopObserving = store.observe('chat_early_settlement', 'proj_a');

    try {
      const session = store.acquire('chat_early_settlement', 'proj_a');
      await vi.waitFor(() => {
        expect(deps.getChat).toHaveBeenCalledWith('chat_early_settlement');
      });
      const runId = 'req_early_settlement';
      publishLogRows('chat_early_settlement', runningRows(runId));
      expect(projectA.heard).toContainEqual({
        type: 'projectedRunsChanged',
        runs: ['chat_early_settlement'],
        stoppableRuns: [],
      });

      resolveLoadedChat({
        id: 'chat_early_settlement',
        resourceId: 'proj_a',
        name: 'Early settlement chat',
        messages: [],
        createdAt: 0,
        updatedAt: 0,
      });
      await vi.waitFor(() => {
        expect(session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
      });
      publishLogRows('chat_early_settlement', [lifecycleRow(2, 'completed', runId)], 2);

      const chatA = session.stateActorRef;
      expect(chatA.getSnapshot().matches({ run: 'done' })).toBe(true);
      expect(projectA.heard.at(-1)).toEqual({ type: 'projectedRunsChanged', runs: [], stoppableRuns: [] });
      expect(projectB.heard).toEqual([]);
    } finally {
      stopObserving();
      store.release('chat_early_settlement');
      store.setProjectSession('proj_a', undefined);
      store.setProjectSession('proj_b', undefined);
    }
  });
});

describe('ChatSessionStore — run phase from the log (PV-S7, G02)', () => {
  const countingProject = () => {
    const heard: Array<{ type: string; runs: string[]; stoppableRuns: string[] }> = [];
    let runs: string[] = [];
    let stoppableRuns: string[] = [];
    const ref = {
      send: (event: { type: string; runs: string[]; stoppableRuns: string[] }) => {
        heard.push(event);
        if (event.type === 'projectedRunsChanged') {
          runs = event.runs;
          stoppableRuns = event.stoppableRuns;
        }
      },
      getSnapshot: () => ({ context: { runs, stoppableRuns } }),
    } as unknown as ProjectSessionActorRef;
    return { heard, ref };
  };

  it('shows an idle chat none of the history its log replays, and counts no run (W0.2)', () => {
    const store = createStore();
    const project = countingProject();
    store.setProjectSession('proj_history', project.ref);
    const actor = store.acquire('chat_history', 'proj_history').stateActorRef;

    publishLogRows('chat_history', [...runningRows('run_old'), lifecycleRow(2, 'completed', 'run_old')]);

    expect(actor.getSnapshot().matches({ run: 'idle' })).toBe(true);
    expect(project.heard).toEqual([]);
    store.release('chat_history');
    store.setProjectSession('proj_history', undefined);
  });

  it('reports a replayed run only once the replay holds the log to its end', () => {
    const store = createStore();
    const project = countingProject();
    store.setProjectSession('proj_pages', project.ref);
    const actor = store.acquire('chat_pages', 'proj_pages').stateActorRef;
    const stopObserving = store.observe('chat_pages', 'proj_pages');

    /* The first page of a three-row log: the run it shows running may have ended in the next. */
    publishLogPage('chat_pages', runningRows(), { cursor: 0, endCursor: 3 });
    expect(actor.getSnapshot().matches({ run: 'idle' })).toBe(true);
    expect(project.heard).toEqual([]);

    publishLogRows(
      'chat_pages',
      [logRow(2, { type: 'message.appended', message: { id: 'm2', role: 'assistant', content: 'Hi.' } })],
      2,
    );
    expect(actor.getSnapshot().matches({ run: 'running' })).toBe(true);
    expect(project.heard).toEqual([{ type: 'projectedRunsChanged', runs: ['chat_pages'], stoppableRuns: [] }]);
    stopObserving();
    store.release('chat_pages');
    store.setProjectSession('proj_pages', undefined);
  });
});

describe('ChatSessionStore — historical host outcomes from the projection (PV-S13)', () => {
  it.each(['turn.failed', 'turn.conflicted'] as const)('retains a %s row without a page settlement replay', (type) => {
    const store = createStore();
    const chatId = `chat_historical_${type}`;
    const runId = `run_historical_${type}`;
    const stopObserving = store.observe(chatId, 'project_history');
    publishLogRows(chatId, [
      ...runningRows(runId),
      lifecycleRow(2, type === 'turn.failed' ? 'failed' : 'completed', runId),
      logRow(3, {
        type,
        runId,
        turnId: 'turn_history',
        chatId,
        ...(type === 'turn.failed' ? { reason: 'revision cut failed' } : {}),
      }),
    ]);

    expect(store.getProjection(chatId)?.ledger.runs[runId]?.settlements).toMatchObject([
      { event: { type, runId, turnId: 'turn_history', chatId } },
    ]);
    expect(store.get(chatId)).toBeUndefined();
    stopObserving();
  });
});
describe('ChatSessionStore — persisted failure diagnosis (P59)', () => {
  /* A chat-wide record error remains available to the card while attachment
   * is unknown, but it never manufactures a host run for the sidebar. */
  it('leaves a hydrated refusal diagnostic out of the chat run machine', async () => {
    const store = createStore();
    const heard: Array<Record<string, unknown>> = [];
    const projectHeard: Array<{ type: string }> = [];
    const projectRef = {
      send: (event: { type: string }) => {
        projectHeard.push(event);
      },
      getSnapshot: () => ({ context: { runs: [] } }),
    } as unknown as Parameters<StoreType['setProjectSession']>[1];

    store.setFocusedProject('proj_reload');
    store.setProjectSession('proj_reload', projectRef);
    const session = store.acquire('chat_reloaded', 'proj_reload');
    spyOnSend(session.stateActorRef, (event) => {
      heard.push(event);
    });
    const fake = harness.created.find((entry) => entry.id === 'chat_reloaded')!;
    fake.status = 'error';
    fake.error = new Error('the model refused');

    /* The chat's row lands: that is when its persisted failure is known (PV-S5). */
    await vi.waitFor(() => {
      expect(session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
    });

    expect(heard).toEqual([]);
    expect(session.stateActorRef.getSnapshot().matches({ run: 'idle' })).toBe(true);
    /* A refused command has no projected run for the project to count. */
    expect(projectHeard).toEqual([]);
    store.release('chat_reloaded');
    store.setProjectSession('proj_reload', undefined);
  });

  it('leaves a live run alone, replaying nothing over it', async () => {
    const store = createStore();
    const heard: Array<Record<string, unknown>> = [];
    const projectRef = {
      send: () => undefined,
      getSnapshot: () => ({ context: { runs: [] } }),
    } as unknown as Parameters<StoreType['setProjectSession']>[1];

    store.setFocusedProject('proj_live');
    store.setProjectSession('proj_live', projectRef);
    const session = store.acquire('chat_streaming', 'proj_live');
    spyOnSend(session.stateActorRef, (event) => {
      heard.push(event);
    });
    const fake = harness.created.find((entry) => entry.id === 'chat_streaming')!;
    fake.status = 'streaming';
    fake.emitStatusChange();
    fake.error = new Error('an error from the turn before');

    await vi.waitFor(() => {
      expect(session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
    });

    expect(heard.filter((event) => event['phase'] === 'failed')).toEqual([]);
    store.release('chat_streaming');
    store.setProjectSession('proj_live', undefined);
  });
});

describe('ChatSessionStore', () => {
  beforeEach(() => {
    harness.created = [];
    resetChatTurnServices();
  });

  afterEach(() => {
    for (const owner of turnOwners.splice(0)) {
      owner.stop();
    }
    resetChatTurnServices();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('routes accepted user activity through the current dependency set', async () => {
    const store = new ChatSessionStore({ chatSession });
    const deps = createStubDeps();
    store.setDependencies(deps);

    await store.touchChatRecency('chat_activity', 123);

    expect(deps.touchChatRecency).toHaveBeenCalledWith('chat_activity', 123);
  });

  it('updates the active tool name from the log when counts stay unchanged (PV-S7)', () => {
    const store = createStore();
    const session = store.acquire('chat_tool_name', 'project_1');
    const actor = session.stateActorRef;
    const toolRow = (sequence: number, message: Readonly<{ role: string; toolCallId: string; toolName: string }>) =>
      logRow(sequence, { type: 'message.appended', message: { id: `m${String(sequence)}`, ...message } });

    publishLogRows('chat_tool_name', [
      ...runningRows(),
      toolRow(2, { role: 'tool-input', toolCallId: 'tool_1', toolName: 'search' }),
    ]);
    expect(actor.getSnapshot().context).toMatchObject({ toolsInFlight: 1, toolName: 'search' });

    publishLogRows(
      'chat_tool_name',
      [
        toolRow(3, { role: 'tool-output', toolCallId: 'tool_1', toolName: 'search' }),
        toolRow(4, { role: 'tool-input', toolCallId: 'tool_2', toolName: 'edit_file' }),
      ],
      3,
    );
    expect(actor.getSnapshot().context).toMatchObject({ toolsInFlight: 1, toolName: 'edit_file' });
    store.release('chat_tool_name');
  });

  /* Rewritten for W7: the store's unread decision is written to the project's
   * unread record (D9) instead of `setChatUnreadState`, which is gone. Each row
   * keeps its original trigger and asserts the record on disk. */
  /* PV-S8: unread is derived. A chat is unread while its log's newest attention row (a run that completed or failed, or
   * an interrupt it opened) is not the row its read receipt names; the store writes a receipt only when the person
   * sees the chat. Nothing is written to say a chat is unread. */
  describe('unread lifecycle (PV-S8)', () => {
    const projectId = 'proj_unread';
    const unreadPath = `/.tau/composers/chats/${projectId}/unread.json`;
    const storeInProject = (): { store: StoreType; deps: StubDeps } => {
      const store = new ChatSessionStore({ chatSession });
      const deps = createStubDeps();
      deps.getChat.mockImplementation(async (chatId) => chatRow(chatId, projectId));
      store.setDependencies(deps);
      return { store, deps };
    };
    const ended = (chatId: string, state: string): void => {
      publishLogRows(chatId, [...runningRows(), lifecycleRow(2, state)]);
    };
    const requested = logRow(2, {
      type: 'interrupt.recorded',
      interruptId: 'i1',
      phase: 'requested',
      reason: 'approval',
    });

    it('marks an unattended run that completed or failed, and never one the person cancelled', async () => {
      const { store, deps } = storeInProject();
      for (const chatId of ['chat_success', 'chat_error', 'chat_cancelled']) {
        store.acquire(chatId, projectId);
      }

      ended('chat_success', 'completed');
      ended('chat_error', 'failed');
      ended('chat_cancelled', 'cancelled');

      expect(store.isUnread('chat_success')).toBe(true);
      expect(store.isUnread('chat_error')).toBe(true);
      expect(store.isUnread('chat_cancelled')).toBe(false);
      await settle();
      /* Unread is an answer, not a record: nothing is written until the person sees a chat. */
      expect(deps.client.json(unreadPath)).toBeUndefined();
    });

    it('marks an interrupt opened while the person is away', () => {
      const { store } = storeInProject();
      store.acquire('chat_approval', projectId);

      publishLogRows('chat_approval', [...runningRows(), requested]);

      expect(store.isUnread('chat_approval')).toBe(true);
    });

    /* L3 D1: an empty resume appends no row. With W0.2's guard reverted the SDK finishes that request, and a store
     * that marked unread on the request's finish marked a chat nothing ran in. */
    it('never marks unread for an empty resume, even when the SDK finishes its request', async () => {
      const { store } = storeInProject();
      store.acquire('chat_opened', projectId);
      store.focusChat('chat_opened');
      ended('chat_opened', 'completed');
      expect(store.isUnread('chat_opened')).toBe(false);
      store.focusChat('chat_next');
      store.blurChat('chat_opened');

      /* The resume replays the rows the projection already holds, then the SDK walks submitted → ready. */
      ended('chat_opened', 'completed');
      finishRun(harness.created[0]!);
      await settle();

      expect(store.isUnread('chat_opened')).toBe(false);
    });

    it('reads a chat the person is looking at through each new attention row, writing that row as its receipt', async () => {
      const { store, deps } = storeInProject();
      store.acquire('chat_active', projectId);
      store.focusChat('chat_active');

      publishLogRows('chat_active', [...runningRows(), requested]);
      publishLogRows('chat_active', [lifecycleRow(3, 'completed')], 3);

      expect(store.isUnread('chat_active')).toBe(false);
      await vi.waitFor(() => {
        expect(deps.client.json(unreadPath)).toEqual({
          version: 1,
          readThrough: { chat_active: { leaderEpoch: 'g1', sequence: 3 } },
        });
      });
    });

    /* R3: every sidebar row holds a view of its chat, so a view alone is not the person reading it. */
    it('should mark a chat that finishes while another chat is focused in an active document', () => {
      const { store } = storeInProject();
      store.acquire('chat_listed', projectId);
      store.acquire('chat_focused', projectId);
      store.focusChat('chat_focused');

      ended('chat_listed', 'completed');

      expect(store.isUnread('chat_listed')).toBe(true);
    });

    it('marks a run that ends while its focused view is hidden, and clears it when the person looks', async () => {
      vi.stubGlobal('document', { visibilityState: 'hidden', hasFocus: () => false });
      const { store, deps } = storeInProject();
      store.acquire('chat_hidden', projectId);
      store.focusChat('chat_hidden');

      ended('chat_hidden', 'completed');
      expect(store.isUnread('chat_hidden')).toBe(true);

      store.markViewed('chat_hidden');
      expect(store.isUnread('chat_hidden')).toBe(false);
      await vi.waitFor(() => {
        expect(deps.client.json(unreadPath)).toEqual({
          version: 1,
          readThrough: { chat_hidden: { leaderEpoch: 'g1', sequence: 2 } },
        });
      });
      /* A newer attention row is unread again: the receipt names the row the person saw. */
      publishLogRows(
        'chat_hidden',
        [
          lifecycleRow(3, 'admitted', 'run_2'),
          lifecycleRow(4, 'running', 'run_2'),
          lifecycleRow(5, 'completed', 'run_2'),
        ],
        3,
      );
      expect(store.isUnread('chat_hidden')).toBe(true);
    });
  });

  // ===========================================================================
  // acquire / release refcounting
  // ===========================================================================

  describe('acquire / release', () => {
    /*
     * T3-D2. Disposing a chat mid-admission stopped its actor, then deleted the
     * turn-service registries the abandoned admission's own release reads —
     * with `?.`, so the release was a silent no-op and the checkout's lease
     * stayed `admitted` forever. `drop` then refuses every later turn's release
     * and the chat cannot run again until reload. An actor that holds a turn or
     * is admitting one is a reference on the session, exactly as `runHeld` is.
     */
    it('should not dispose a chat whose turn owner is still admitting', async () => {
      const store = createStore();
      store.acquire('chat_dispose_admitting', 'resource_dispose_admitting');
      startTurnOwner(store, 'resource_dispose_admitting');
      publishChatTurnAdmission(
        'chat_dispose_admitting',
        async () =>
          new Promise<never>(() => {
            /* Never answers: the admission is in flight for the whole row. */
          }),
      );

      void store.requestTurn('chat_dispose_admitting', { kind: 'regenerate' });
      await vi.waitFor(() => {
        expect(
          store
            .get('chat_dispose_admitting')
            ?.stateActorRef.getSnapshot()
            .matches({ run: { queued: 'admitting' } }),
        ).toBe(true);
      });

      store.release('chat_dispose_admitting');

      expect(store.list()).toContain('chat_dispose_admitting');
    });

    /*
     * T3-D11 said an actor stopped mid-admission never emits again, so the composer's editable lock never settled.
     * The project session no longer owns the chat (PV-S5): stopping it leaves the chat's root admitting, and the
     * admission's answer is what releases the composer. The store never stops a root that is admitting.
     */
    it('keeps a turn admitting when its project session stops, since the store owns the chat (PV-S5)', async () => {
      const store = createStore();
      store.acquire('chat_stopped_admitting', 'resource_stopped_admitting');
      startTurnOwner(store, 'resource_stopped_admitting');
      const owner = turnOwners.at(-1)!;
      const admission = Promise.withResolvers<ChatRequest>();
      publishAdmission('chat_stopped_admitting', async () => admission.promise);
      const root = store.get('chat_stopped_admitting')!.stateActorRef;

      const requested = store.requestTurn('chat_stopped_admitting', { kind: 'regenerate' });
      await vi.waitFor(() => {
        expect(root.getSnapshot().matches({ run: { queued: 'admitting' } })).toBe(true);
      });

      // The idle policy stops the project session; the chat's root is the store's.
      owner.stop();
      expect(root.getSnapshot().status).toBe('active');

      admission.resolve({
        kind: 'regenerate',
        body: { agent: { profile: 'cad', execution: { kind: 'tau', model: 'cad-default' }, kernel: 'replicad' } },
      });
      await expect(requested).resolves.toBeUndefined();
      expect(root.getSnapshot().matches({ run: { queued: 'admitting' } })).toBe(false);
      store.release('chat_stopped_admitting');
    });

    it('creates a session lazily on first acquire', () => {
      const store = createStore();
      const session = store.acquire('chat_a', 'project_test');

      expect(session.chatId).toBe('chat_a');
      expect(session.chat.id).toBe('chat_a');
      expect(session.persistenceActorRef).toBeDefined();
      expect(session.draftActorRef).toBeDefined();
      expect(harness.created).toHaveLength(1);
    });

    it('returns the same session on subsequent acquires for the same chatId', () => {
      const store = createStore();
      const first = store.acquire('chat_a', 'project_test');
      const second = store.acquire('chat_a', 'project_test');

      expect(second).toBe(first);
      expect(second.chat).toBe(first.chat);
      expect(second.persistenceActorRef).toBe(first.persistenceActorRef);
      expect(second.draftActorRef).toBe(first.draftActorRef);
      expect(harness.created).toHaveLength(1);
    });

    it('keeps the session live until the final release', () => {
      const store = createStore();
      store.acquire('chat_a', 'project_test');
      store.acquire('chat_a', 'project_test');

      store.release('chat_a');
      expect(store.get('chat_a')).toBeDefined();

      store.release('chat_a');
      expect(store.get('chat_a')).toBeUndefined();
    });

    it('disposes the persistence and draft actors on the final release', () => {
      const store = createStore();
      const session = store.acquire('chat_a', 'project_test');
      const persistenceSnapshotBefore = session.persistenceActorRef.getSnapshot();
      const draftSnapshotBefore = session.draftActorRef.getSnapshot();

      expect(persistenceSnapshotBefore.status).toBe('active');
      expect(draftSnapshotBefore.status).toBe('active');

      store.release('chat_a');

      expect(session.persistenceActorRef.getSnapshot().status).toBe('stopped');
      expect(session.draftActorRef.getSnapshot().status).toBe('stopped');
    });

    it('does not throw when releasing an unknown chatId', () => {
      const store = createStore();
      expect(() => {
        store.release('chat_missing');
      }).not.toThrow();
    });

    it('does not throw when releasing more times than acquired', () => {
      const store = createStore();
      store.acquire('chat_a', 'project_test');
      store.release('chat_a');

      expect(() => {
        store.release('chat_a');
      }).not.toThrow();
      expect(store.get('chat_a')).toBeUndefined();
    });

    it('creates a fresh session after a previous release (no zombie state)', () => {
      const store = createStore();
      const first = store.acquire('chat_a', 'project_test');
      store.release('chat_a');

      const second = store.acquire('chat_a', 'project_test');
      expect(second).not.toBe(first);
      expect(second.chat).not.toBe(first.chat);
      expect(harness.created).toHaveLength(2);
    });
  });

  // ===========================================================================
  // distinct sessions per chatId
  // ===========================================================================

  describe('per-chatId isolation', () => {
    it('creates an independent session for each chatId', () => {
      const store = createStore();
      const a = store.acquire('chat_a', 'project_test');
      const b = store.acquire('chat_b', 'project_test');

      expect(a.chat).not.toBe(b.chat);
      expect(a.persistenceActorRef).not.toBe(b.persistenceActorRef);
      expect(a.draftActorRef).not.toBe(b.draftActorRef);
      expect(harness.created).toHaveLength(2);
    });

    it('releasing one session does not affect the other', () => {
      const store = createStore();
      const a = store.acquire('chat_a', 'project_test');
      const b = store.acquire('chat_b', 'project_test');

      store.release('chat_a');

      expect(store.get('chat_a')).toBeUndefined();
      expect(store.get('chat_b')).toBe(b);
      expect(a.persistenceActorRef.getSnapshot().status).toBe('stopped');
      expect(b.persistenceActorRef.getSnapshot().status).toBe('active');
    });
  });

  // ===========================================================================
  // membership listeners
  // ===========================================================================

  describe('membership notifications', () => {
    it('notifies membership subscribers on first acquire only', async () => {
      const store = createStore();
      const listener = vi.fn();
      store.subscribeMembership(listener);

      store.acquire('chat_a', 'project_test');
      // Membership notifications fan out on a microtask so an in-render
      // acquire never triggers a re-entrant React update.
      await Promise.resolve();
      expect(listener).toHaveBeenCalledTimes(1);

      store.acquire('chat_a', 'project_test');
      await Promise.resolve();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('notifies membership subscribers on final release only', async () => {
      const store = createStore();
      store.acquire('chat_a', 'project_test');
      store.acquire('chat_a', 'project_test');
      await Promise.resolve();

      const listener = vi.fn();
      store.subscribeMembership(listener);

      store.release('chat_a');
      await Promise.resolve();
      expect(listener).not.toHaveBeenCalled();

      store.release('chat_a');
      await Promise.resolve();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('coalesces a burst of membership changes into one notification', async () => {
      const store = createStore();
      const listener = vi.fn();
      store.subscribeMembership(listener);

      store.acquire('chat_a', 'project_test');
      store.acquire('chat_b', 'project_test');
      store.acquire('chat_c', 'project_test');
      expect(listener).not.toHaveBeenCalled();

      await Promise.resolve();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('exposes a stable list reference until membership changes', () => {
      const store = createStore();
      store.acquire('chat_a', 'project_test');
      const first = store.list();
      const second = store.list();
      expect(second).toBe(first);

      store.acquire('chat_b', 'project_test');
      expect(store.list()).not.toBe(first);
      expect([...store.list()].sort()).toEqual(['chat_a', 'chat_b']);
    });

    it('stops invoking membership listeners after unsubscribe', async () => {
      const store = createStore();
      const listener = vi.fn();
      const unsubscribe = store.subscribeMembership(listener);
      unsubscribe();

      store.acquire('chat_a', 'project_test');
      await Promise.resolve();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // subscribeChat fan-out
  // ===========================================================================

  describe('subscribeChat', () => {
    it('fires when the underlying chat messages change', () => {
      const store = createStore();
      store.acquire('chat_a', 'project_test');
      const fake = harness.created[0]!;
      const listener = vi.fn();
      store.subscribeChat('chat_a', listener);

      fake.emitMessagesChange();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('fires when the underlying chat status changes', () => {
      const store = createStore();
      store.acquire('chat_a', 'project_test');
      const fake = harness.created[0]!;
      const listener = vi.fn();
      store.subscribeChat('chat_a', listener);

      fake.emitStatusChange();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does not wake subscribers from a different chatId', () => {
      const store = createStore();
      store.acquire('chat_a', 'project_test');
      store.acquire('chat_b', 'project_test');
      const fakeA = harness.created[0]!;

      const listenerA = vi.fn();
      const listenerB = vi.fn();
      store.subscribeChat('chat_a', listenerA);
      store.subscribeChat('chat_b', listenerB);

      fakeA.emitMessagesChange();
      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerB).not.toHaveBeenCalled();
    });

    it('lets subscribers register before the session is acquired (subscribe-then-acquire ordering)', () => {
      const store = createStore();
      const listener = vi.fn();
      store.subscribeChat('chat_a', listener);

      store.acquire('chat_a', 'project_test');
      const fake = harness.created[0]!;
      fake.emitMessagesChange();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('stops invoking listeners after unsubscribe', () => {
      const store = createStore();
      store.acquire('chat_a', 'project_test');
      const fake = harness.created[0]!;
      const listener = vi.fn();
      const unsubscribe = store.subscribeChat('chat_a', listener);
      unsubscribe();

      fake.emitMessagesChange();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // concurrency invariants
  // ===========================================================================

  describe('concurrency invariants', () => {
    it('keeps every distinct session live and active under simultaneous acquires', () => {
      const store = createStore();
      const ids = ['chat_a', 'chat_b', 'chat_c', 'chat_d'];
      const sessions = ids.map((id) => store.acquire(id, 'project_test'));

      for (const session of sessions) {
        expect(session.persistenceActorRef.getSnapshot().status).toBe('active');
        expect(session.draftActorRef.getSnapshot().status).toBe('active');
      }
      expect([...store.list()].sort()).toEqual([...ids].sort());
      expect(harness.created).toHaveLength(ids.length);
    });

    it("releasing one chat does not stop another chat's actors or unsubscribe its listeners", () => {
      const store = createStore();
      const a = store.acquire('chat_a', 'project_test');
      const b = store.acquire('chat_b', 'project_test');

      const listenerA = vi.fn();
      const listenerB = vi.fn();
      store.subscribeChat('chat_a', listenerA);
      store.subscribeChat('chat_b', listenerB);

      store.release('chat_a');

      // Releasing A must not poison B's actors or its listener bucket.
      expect(b.persistenceActorRef.getSnapshot().status).toBe('active');
      expect(b.draftActorRef.getSnapshot().status).toBe('active');

      const fakeB = harness.created.find((chat) => chat.id === 'chat_b')!;
      fakeB.emitMessagesChange();
      expect(listenerB).toHaveBeenCalledTimes(1);
      expect(listenerA).not.toHaveBeenCalled();

      // And the released chat's actors are stopped.
      expect(a.persistenceActorRef.getSnapshot().status).toBe('stopped');
    });

    it('fans out a single chat event to every subscriber bound to that chatId', () => {
      const store = createStore();
      store.acquire('chat_a', 'project_test');
      const fake = harness.created[0]!;

      const listeners = [vi.fn(), vi.fn(), vi.fn()];
      for (const listener of listeners) {
        store.subscribeChat('chat_a', listener);
      }

      fake.emitMessagesChange();
      for (const listener of listeners) {
        expect(listener).toHaveBeenCalledTimes(1);
      }
    });

    it('per-chat listener buckets are isolated across re-acquire cycles', () => {
      const store = createStore();
      // First lifecycle: subscribe + drop the subscription via release.
      store.acquire('chat_a', 'project_test');
      const stale = vi.fn();
      const unsubscribeStale = store.subscribeChat('chat_a', stale);
      store.release('chat_a');
      unsubscribeStale();

      // Second lifecycle: a brand-new Chat instance + a new subscriber.
      store.acquire('chat_a', 'project_test');
      const fake = harness.created.at(-1)!;
      const fresh = vi.fn();
      store.subscribeChat('chat_a', fresh);

      fake.emitMessagesChange();

      expect(fresh).toHaveBeenCalledTimes(1);
      expect(stale).not.toHaveBeenCalled();
    });
  });

  describe('projected empty-cancel draft restore', () => {
    const open = async (chatId: string, projectId: string) => {
      const store = new ChatSessionStore({ chatSession });
      const deps = createStubDeps();
      deps.getChat.mockResolvedValue(chatRow(chatId, projectId));
      store.setDependencies(deps);
      const session = store.acquire(chatId, projectId);
      await vi.waitFor(() => {
        expect(session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
      });
      const hostCommand = vi.fn<AgentHostClient['hostCommand']>(async (command) => ({
        commandId: command.commandId,
        generation: 1,
        status: 'applied',
        effect: 'durable',
        cursor: 3,
      }));
      const unpublish = store.publishProjectHostConnector(
        projectId,
        async () => ({ hostCommand, close: vi.fn(async () => undefined) }) as unknown as AgentHostClient,
      );
      return { store, deps, session, hostCommand, unpublish };
    };

    it('restores a cancelled user-only turn and its attachment only after the host confirms cancellation', async () => {
      const chatId = 'chat_projected_empty_cancel';
      const projectId = 'project_projected_empty_cancel';
      const runId = 'run_projected_empty_cancel';
      const { store, deps, session, hostCommand, unpublish } = await open(chatId, projectId);
      deps.client.files.set(`${chatAttachmentsDirectory(projectId, chatId)}/${pngHash}.png`, pngBytes);
      publishLogRows(chatId, [
        ...runningRows(runId),
        logRow(2, {
          runId,
          type: 'message.appended',
          message: {
            id: 'msg_projected_cancel',
            role: 'user',
            content: [
              { type: 'text', text: 'Keep my prompt' },
              { type: 'file-ref', path: pngUrl, mimeType: 'image/png' },
            ],
          },
        }),
      ]);
      expect(store.getProjection(chatId)?.views[runId]?.user?.id).toBe('msg_projected_cancel');

      store.stopRun(chatId);
      await vi.waitFor(() => {
        expect(hostCommand).toHaveBeenCalledTimes(1);
      });
      expect(hostCommand.mock.calls[0]?.[0].type).toBe('cancel');
      expect(session.draftActorRef.getSnapshot().context.draftText).toBe('');

      publishLogRows(chatId, [lifecycleRow(3, 'cancelled', runId)], 3);
      expect(store.getProjection(chatId)?.ledger.runs[runId]?.lifecycle).toBe('cancelled');
      await vi.waitFor(() => {
        expect(session.draftActorRef.getSnapshot().context).toMatchObject({
          draftText: 'Keep my prompt',
          draftAttachments: [{ hash: pngHash, mediaType: 'image/png' }],
        });
        expect(deps.client.files.get(`${draftAttachmentsDirectory(projectId, chatId)}/${pngHash}.png`)).toEqual(
          pngBytes,
        );
      });
      expect(store.getProjection(chatId)?.views[runId]?.user?.id).toBe('msg_projected_cancel');
      expect(deps.commitCancelledDraftRestore).not.toHaveBeenCalled();
      expect(deps.patchChat.mock.calls.some(([, key]) => key === 'messages')).toBe(false);
      store.release(chatId);
      unpublish();
    });

    it('keeps a cancelled turn with assistant output in the transcript instead of restoring its draft', async () => {
      const chatId = 'chat_projected_partial_cancel';
      const projectId = 'project_projected_partial_cancel';
      const runId = 'run_projected_partial_cancel';
      const { store, deps, session, hostCommand, unpublish } = await open(chatId, projectId);
      publishLogRows(chatId, [
        ...runningRows(runId),
        logRow(2, {
          runId,
          type: 'message.appended',
          message: { id: 'msg_partial_user', role: 'user', content: 'Keep working' },
        }),
        logRow(3, {
          runId,
          type: 'message.appended',
          message: { id: 'msg_partial_assistant', role: 'assistant', content: 'Partial answer' },
        }),
      ]);

      store.stopRun(chatId);
      await vi.waitFor(() => {
        expect(hostCommand).toHaveBeenCalledTimes(1);
      });
      publishLogRows(chatId, [lifecycleRow(4, 'cancelled', runId)], 4);
      await vi.waitFor(() => {
        expect(session.chat.messages.flatMap((message) => message.parts)).toEqual(
          expect.arrayContaining([expect.objectContaining({ type: 'text', text: 'Partial answer' })]),
        );
      });
      expect(session.draftActorRef.getSnapshot().context.draftText).toBe('');
      expect(deps.commitCancelledDraftRestore).not.toHaveBeenCalled();
      store.release(chatId);
      unpublish();
    });
  });

  describe('hydration on acquire', () => {
    it('calls deps.getChat on first acquire so hydration kicks off', async () => {
      const store = new ChatSessionStore({ chatSession });
      const deps = createStubDeps();
      store.setDependencies(deps);

      const sampleChat: ChatEntity = {
        id: 'chat_a',
        resourceId: 'resource_1',
        name: '',
        messages: [],
        createdAt: 0,
        updatedAt: 0,
      };
      deps.getChat.mockResolvedValue(sampleChat);

      store.acquire('chat_a', 'resource_1');

      // Microtask flush so the persistence actor's loadChatActor invokes deps.getChat.
      await Promise.resolve();
      await Promise.resolve();

      expect(deps.getChat).toHaveBeenCalledWith('chat_a');
    });

    it('returns a displaced send to the composer whichever requestTurn call observes it', async () => {
      const store = createStore();
      const session = store.acquire('chat_two_sends', 'resource_two_sends');
      startTurnOwner(store, 'resource_two_sends');
      const admitted = Promise.withResolvers<void>();
      const second = buildUserMessage({ text: 'second message' });
      publishChatTurnAdmission('chat_two_sends', async (gesture) => {
        await admitted.promise;
        return {
          runId: 'run_two_sends',
          leaseTurnId: undefined,
          request:
            gesture.kind === 'send'
              ? { kind: 'send', message: gesture.message }
              : { kind: 'edit', messageId: 'msg_edit', content: 'edited' },
        };
      });

      const first = store.requestTurn('chat_two_sends', {
        kind: 'send',
        message: buildUserMessage({ text: 'first message' }),
      });
      await Promise.resolve();
      const displacing = store.requestTurn('chat_two_sends', { kind: 'send', message: second });
      admitted.resolve();
      await Promise.all([first, displacing]);

      await vi.waitFor(() => {
        expect(session.draftActorRef.getSnapshot().context.draftText).toBe('first message');
      });

      store.release('chat_two_sends');
    });

    /* The same ordering with an `edit` doing the displacing: the edit rewinds to
     * a message the transcript still holds, so the only text at risk is the
     * send's — and its own `requestTurn` resolves last, holding the clear. */
    it('returns a send displaced by an edit to the composer', async () => {
      const store = createStore();
      const session = store.acquire('chat_send_then_edit', 'resource_send_then_edit');
      startTurnOwner(store, 'resource_send_then_edit');
      const admitted = Promise.withResolvers<void>();
      publishChatTurnAdmission('chat_send_then_edit', async (gesture) => {
        await admitted.promise;
        return {
          runId: 'run_send_then_edit',
          leaseTurnId: undefined,
          request:
            gesture.kind === 'send'
              ? { kind: 'send', message: gesture.message }
              : { kind: 'edit', messageId: 'msg_edit', content: 'edited' },
        };
      });

      const sent = store.requestTurn('chat_send_then_edit', {
        kind: 'send',
        message: buildUserMessage({ text: 'unsent message' }),
      });
      await Promise.resolve();
      const edited = store.requestTurn('chat_send_then_edit', {
        kind: 'edit',
        messageId: 'msg_edit',
        text: 'edited',
      });
      admitted.resolve();
      await Promise.all([sent, edited]);

      await vi.waitFor(() => {
        expect(session.draftActorRef.getSnapshot().context.draftText).toBe('unsent message');
      });

      store.release('chat_send_then_edit');
    });

    it('does not rewrite or replay a log-derived pending tail without a seed intent', async () => {
      const store = new ChatSessionStore({ chatSession });
      const deps = createStubDeps();
      store.setDependencies(deps);

      const pendingUserMessage: MyUIMessage = {
        id: 'msg_orphan_pending',
        role: 'user',
        parts: [{ type: 'text', text: 'do not auto run' }],
        metadata: { createdAt: 1, status: 'pending' },
      };
      const logDerivedChat: ChatEntity = {
        id: 'chat_orphan_pending',
        resourceId: 'resource_orphan',
        name: 'Log-derived pending',
        messages: [pendingUserMessage],
        createdAt: 0,
        updatedAt: 0,
      };
      deps.getChat.mockResolvedValue(logDerivedChat);

      const session = store.acquire('chat_orphan_pending', 'resource_orphan');
      await vi.waitFor(() => {
        expect(session.chat.messages).toContainEqual(pendingUserMessage);
      });

      const fake = harness.created.find((entry) => entry.id === 'chat_orphan_pending')!;
      expect(fake.regenerate).not.toHaveBeenCalled();
      expect(deps.consumeChatStartupRequest).not.toHaveBeenCalled();
      expect(deps.commitCancelledDraftRestore).not.toHaveBeenCalled();
      expect(fake.messages).toContainEqual(pendingUserMessage);
      expect(session.draftActorRef.getSnapshot().context.draftText).toBe('');

      store.release('chat_orphan_pending');
    });
  });
});

// ===========================================================================
// Composer records (W7): per-device drafts, unread and attachments through the
// session store, on an in-memory filesystem that outlives each store.
// ===========================================================================
describe('ChatSessionStore — composer records (W7)', () => {
  const projectId = 'proj_composer';
  const chatId = 'chat_composer';
  const unreadPath = `/.tau/composers/chats/${projectId}/unread.json`;
  type SelectedModel = { readonly name: string; readonly support: ModelSupport };
  const pdfModel: SelectedModel = {
    name: 'Claude Test',
    support: { modalities: { input: ['text', 'image', 'pdf'], output: ['text'] } },
  };
  const imageOnlyModel: SelectedModel = {
    name: 'GPT Image',
    support: { modalities: { input: ['text', 'image'], output: ['text'] } },
  };

  beforeEach(() => {
    harness.created = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  const openStore = (client: MemoryClient, row: ChatEntity = chatRow(chatId, projectId)) => {
    const store = new ChatSessionStore({ chatSession });
    const deps = createStubDeps(client);
    deps.getChat.mockImplementation(async (id) => (id === row.id ? row : undefined));
    store.setDependencies(deps);
    return { store, deps };
  };

  const attachBoth = async (session: ReturnType<StoreType['acquire']>): Promise<void> => {
    session.draftActorRef.send({
      type: 'addDraftAttachment',
      dataUrl: dataUrlOf('image/png', pngBytes),
      preserveOriginal: true,
      model: pdfModel,
    });
    session.draftActorRef.send({
      type: 'addDraftAttachment',
      dataUrl: dataUrlOf('application/pdf', pdfBytes),
      filename: 'bracket-spec.pdf',
      model: pdfModel,
    });
    await vi.waitFor(() => {
      expect(session.draftActorRef.getSnapshot().context.draftAttachments).toHaveLength(2);
    });
  };

  it('restores the draft, both attachments, tool choice and mode through a fresh store', async () => {
    const client = createMemoryClient();
    const first = openStore(client);
    const session = first.store.acquire(chatId, projectId);
    await attachBoth(session);
    session.draftActorRef.send({ type: 'setDraftText', text: 'model the bracket per the spec' });
    session.draftActorRef.send({ type: 'setDraftToolChoice', toolChoice: 'none' });
    session.draftActorRef.send({ type: 'setDraftMode', mode: 'plan' });
    // Released inside the draft's debounce: the release itself must hand the text to the record.
    first.store.release(chatId);

    await vi.waitFor(() => {
      expect(client.json(composerPath(projectId, chatId))).toMatchObject({
        draft: { parts: [{ type: 'text', text: 'model the bracket per the spec' }, {}, {}] },
        toolChoice: 'none',
        mode: 'plan',
      });
    });
    expect(client.namesUnder(draftAttachmentsDirectory(projectId, chatId))).toEqual(
      [`${pngHash}.png`, `${pdfHash}.pdf`].sort(),
    );

    const second = openStore(client);
    const restored = second.store.acquire(chatId, projectId);
    await vi.waitFor(() => {
      expect(restored.draftActorRef.getSnapshot().context).toMatchObject({
        draftText: 'model the bracket per the spec',
        draftAttachments: [
          { hash: pngHash, mediaType: 'image/png' },
          { hash: pdfHash, mediaType: 'application/pdf', filename: 'bracket-spec.pdf' },
        ],
        draftToolChoice: 'none',
        draftMode: 'plan',
      });
    });
    second.store.release(chatId);
  });

  it('keeps a read receipt across a fresh store, and reads a legacy unread mark as a receipt that matches no row', async () => {
    vi.stubGlobal('document', { visibilityState: 'hidden', hasFocus: () => false });
    const client = createMemoryClient();
    const log = [...runningRows(), lifecycleRow(2, 'completed')];
    await client.writeFile(
      unreadPath,
      new TextEncoder().encode(JSON.stringify({ version: 1, unread: { [chatId]: true } })),
    );
    const first = openStore(client);
    first.store.acquire(chatId, projectId);
    /* Before this page reads the chat's log, the legacy mark answers (D9). */
    await vi.waitFor(() => {
      expect(first.store.isUnread(chatId)).toBe(true);
    });
    publishLogRows(chatId, log);
    expect(first.store.isUnread(chatId)).toBe(true);

    first.store.markViewed(chatId);
    expect(first.store.isUnread(chatId)).toBe(false);
    await vi.waitFor(() => {
      expect(client.json(unreadPath)).toEqual({
        version: 1,
        readThrough: { [chatId]: { leaderEpoch: 'g1', sequence: 2 } },
      });
    });
    first.store.release(chatId);

    const second = openStore(client);
    second.store.acquire(chatId, projectId);
    publishLogRows(chatId, log);
    await vi.waitFor(() => {
      expect(second.store.unreadRecordRef(projectId).getSnapshot().matches({ lifecycle: 'usable' })).toBe(true);
    });
    expect(second.store.isUnread(chatId)).toBe(false);
    second.store.release(chatId);
  });

  /*
   * I5 for attachments, ruling E2. A displaced send's text came back to the
   * composer but its files did not: the bytes were promoted into the chat's own
   * directory when the gesture was taken and the draft-stage copies released
   * with the draft, so the restored chips pointed at blobs the composer could
   * no longer read or re-send. The decision that hands a message back is the
   * decision that must not release — and must re-retain what it hands back.
   */
  it('should hand a displaced send back to the composer with its attachment still usable', async () => {
    const client = createMemoryClient();
    const { store } = openStore(client);
    const session = store.acquire(chatId, projectId);
    startTurnOwner(store, projectId);
    const runId = 'req_attachment_displacement';
    const command: HostCommand = {
      type: 'start',
      commandId: runId,
      payload: {
        chatId,
        runId,
        message: { id: 'msg_attachment_displacement', role: 'user', content: 'first message' },
        trigger: 'submit',
      },
    };
    const hostCommand = vi.fn(
      async (): Promise<CommandAnswer> => ({
        commandId: runId,
        generation: 1,
        status: 'applied',
        effect: 'durable',
        cursor: 1,
      }),
    );
    const unpublish = store.publishProjectHostConnector(
      projectId,
      async () => ({ hostCommand, close: vi.fn(async () => undefined) }) as unknown as AgentHostClient,
    );
    publishAdmission(chatId, (gesture) => ({
      kind: 'send',
      message: gesture.kind === 'send' ? gesture.message : buildUserMessage({ text: 'first message' }),
      command,
    }));
    await attachBoth(session);
    const { draftAttachments } = session.draftActorRef.getSnapshot().context;
    await store.promoteDraftAttachments(chatId, draftAttachments);
    const second = buildUserMessage({ text: 'second message', attachments: draftAttachments });

    await store.requestTurn(chatId, { kind: 'send', message: buildUserMessage({ text: 'first message' }) });
    await vi.waitFor(() => {
      expect(hostCommand).toHaveBeenCalledExactlyOnceWith(command);
    });
    publishLogRows(chatId, runningRows(runId));
    const displaced = store.requestTurn(chatId, { kind: 'send', message: second, attachments: draftAttachments });
    const third = store.requestTurn(chatId, { kind: 'send', message: buildUserMessage({ text: 'third message' }) });
    await Promise.all([displaced, third]);

    await vi.waitFor(() => {
      expect(session.draftActorRef.getSnapshot().context).toMatchObject({
        draftText: 'second message',
        draftAttachments: [
          { hash: pngHash, mediaType: 'image/png' },
          { hash: pdfHash, mediaType: 'application/pdf', filename: 'bracket-spec.pdf' },
        ],
      });
    });
    expect(client.namesUnder(draftAttachmentsDirectory(projectId, chatId))).toEqual(
      [`${pngHash}.png`, `${pdfHash}.pdf`].sort(),
    );
    store.release(chatId);
    unpublish();
  });

  it('promotes both blobs into the chat directory and clears the draft-stage copies', async () => {
    const client = createMemoryClient();
    const { store } = openStore(client);
    const session = store.acquire(chatId, projectId);
    await attachBoth(session);
    const { draftAttachments } = session.draftActorRef.getSnapshot().context;

    await store.promoteDraftAttachments(chatId, draftAttachments);

    expect(client.files.get(`${chatAttachmentsDirectory(projectId, chatId)}/${pngHash}.png`)).toEqual(pngBytes);
    expect(client.files.get(`${chatAttachmentsDirectory(projectId, chatId)}/${pdfHash}.pdf`)).toEqual(pdfBytes);

    const message = buildUserMessage({ text: 'read the spec', attachments: draftAttachments });
    session.draftActorRef.send({ type: 'clearDraft' });
    await store.releaseDraftAttachments(chatId);
    expect(message).toMatchObject({
      role: 'user',
      parts: [
        {
          type: 'file',
          mediaType: 'image/png',
          url: pngUrl,
          providerMetadata: { common: { byteLength: pngBytes.byteLength } },
        },
        {
          type: 'file',
          mediaType: 'application/pdf',
          filename: 'bracket-spec.pdf',
          url: pdfUrl,
          providerMetadata: { common: { byteLength: pdfBytes.byteLength } },
        },
        { type: 'text', text: 'read the spec' },
      ],
    });
    expect(client.namesUnder(draftAttachmentsDirectory(projectId, chatId))).toEqual([]);
    await vi.waitFor(() => {
      expect(client.json(composerPath(projectId, chatId))).not.toHaveProperty('draft');
    });
    store.release(chatId);
  });

  it('leaves the draft intact and copies nothing it cannot finish when promotion fails', async () => {
    const client = createMemoryClient();
    const { store } = openStore(client);
    const session = store.acquire(chatId, projectId);
    await attachBoth(session);
    const before = session.draftActorRef.getSnapshot().context.draftAttachments;
    client.files.delete(`${draftAttachmentsDirectory(projectId, chatId)}/${pdfHash}.pdf`);

    await expect(store.promoteDraftAttachments(chatId, before)).rejects.toThrow(/missing/u);

    expect(session.draftActorRef.getSnapshot().context.draftAttachments).toEqual(before);
    /* The image copied before the PDF failed stays: it is content-addressed, so another tab's send may name it
     * (PV-R12). An orphan lives until the chat is deleted. */
    expect(client.namesUnder(chatAttachmentsDirectory(projectId, chatId))).toEqual([`${pngHash}.png`]);
    store.release(chatId);
  });

  /*
   * PV-A9 (L4 D-108, I37). Blobs are content-addressed, so another tab's send can reference the very bytes a failing
   * promotion copied. The rollback that took them back deleted a blob a sent message names.
   */
  it('keeps a promoted blob when a concurrent send fails', async () => {
    const client = createMemoryClient();
    const tabA = openStore(client);
    const tabB = openStore(client);
    const sessionA = tabA.store.acquire(chatId, projectId);
    tabB.store.acquire(chatId, projectId);
    await attachBoth(sessionA);
    const before = sessionA.draftActorRef.getSnapshot().context.draftAttachments;
    const pdfDraft = `${draftAttachmentsDirectory(projectId, chatId)}/${pdfHash}.pdf`;
    const pdfRead = Promise.withResolvers<void>();
    const { readFile } = client;
    client.readFile = async function (path: string) {
      if (path === pdfDraft) {
        await pdfRead.promise;
        throw notFound(path);
      }
      return readFile.call(this, path);
    };
    const failing = tabA.store.promoteDraftAttachments(chatId, before);
    await vi.waitFor(() => {
      expect(client.namesUnder(chatAttachmentsDirectory(projectId, chatId))).toEqual([`${pngHash}.png`]);
    });

    // Tab B sends the same image: the chat already holds it, so B copies nothing and its message names it.
    await tabB.store.promoteDraftAttachments(chatId, before.slice(0, 1));
    pdfRead.resolve();

    await expect(failing).rejects.toThrow(/missing/u);
    expect(client.namesUnder(chatAttachmentsDirectory(projectId, chatId))).toEqual([`${pngHash}.png`]);
    tabA.store.release(chatId);
    tabB.store.release(chatId);
  });

  it('should keep a blob an earlier message holds when a later promotion fails (G10)', async () => {
    const client = createMemoryClient();
    const { store } = openStore(client);
    const session = store.acquire(chatId, projectId);
    await attachBoth(session);
    const before = session.draftActorRef.getSnapshot().context.draftAttachments;
    await store.promoteDraftAttachments(chatId, before.slice(0, 1));
    client.files.delete(`${draftAttachmentsDirectory(projectId, chatId)}/${pdfHash}.pdf`);

    await expect(store.promoteDraftAttachments(chatId, before)).rejects.toThrow(/missing/u);

    expect(client.namesUnder(chatAttachmentsDirectory(projectId, chatId))).toEqual([`${pngHash}.png`]);
    store.release(chatId);
  });

  it('should let a chat whose row cannot be read still be deleted (F7)', async () => {
    const client = createMemoryClient();
    const { store, deps } = openStore(client);
    deps.getChat.mockRejectedValue(new Error('row unreadable'));
    store.acquire(chatId, projectId);
    await settle();

    await expect(store.removeChat(chatId)).resolves.toBeUndefined();
    store.release(chatId);
  });

  it('should flush a chat released before its row loaded into the project it was opened in (F8)', async () => {
    const client = createMemoryClient();
    const { store, deps } = openStore(client);
    deps.getChat.mockReturnValue(Promise.withResolvers<never>().promise);
    const session = store.acquire(chatId, projectId);
    session.draftActorRef.send({ type: 'setDraftMode', mode: 'plan' });

    store.release(chatId);

    await vi.waitFor(() => {
      expect(client.json(composerPath(projectId, chatId))).toEqual({ version: 1, mode: 'plan' });
    });
  });

  it('should leave no record behind when a chat is deleted straight after release (F9)', async () => {
    const client = createMemoryClient();
    const { store } = openStore(client);
    const session = store.acquire(chatId, projectId);
    await vi.waitFor(() => {
      expect(session.composerRecordRef.getSnapshot().matches({ lifecycle: 'usable' })).toBe(true);
    });
    session.draftActorRef.send({ type: 'setDraftText', text: 'typed then deleted' });

    store.release(chatId);
    await store.removeChat(chatId);
    // What the chat store does once the live composer has let go.
    client.files.delete(composerPath(projectId, chatId));
    await settle();

    expect(client.json(composerPath(projectId, chatId))).toBeUndefined();
  });

  it('should resolve flushComposerRecords only once the record write on the wire has landed (R9)', async () => {
    const client = createMemoryClient();
    const { store } = openStore(client);
    const session = store.acquire(chatId, projectId);
    await vi.waitFor(() => {
      expect(session.composerRecordRef.getSnapshot().matches({ lifecycle: 'usable' })).toBe(true);
    });
    const onWire = Promise.withResolvers<void>();
    const write = client.writeFile.bind(client);
    vi.spyOn(client, 'writeFile').mockImplementationOnce(async (path, data) => {
      await onWire.promise;
      await write(path, data);
    });
    session.draftActorRef.send({ type: 'setDraftText', text: 'typed before hiding' });

    const flushing = store.flushComposerRecords();
    const early = await Promise.race([flushing.then(() => 'flushed'), settle().then(() => 'pending')]);
    expect(early).toBe('pending');

    onWire.resolve();
    await flushing;

    expect(client.json(composerPath(projectId, chatId))).toMatchObject({
      draft: { parts: [{ type: 'text', text: 'typed before hiding' }] },
    });
    store.release(chatId);
  });

  /* LT09: `waitFor` rejects when its actor stops first. A gone draft has nothing left to flush, and the close must
   * still flush every other record rather than fail on it. */
  it('flushes the other records when one draft actor is gone before its save lands (PV-S5, LT09)', async () => {
    const client = createMemoryClient();
    const { store } = openStore(client);
    const session = store.acquire(chatId, projectId);
    await vi.waitFor(() => {
      expect(session.composerRecordRef.getSnapshot().matches({ lifecycle: 'usable' })).toBe(true);
    });
    session.draftActorRef.send({ type: 'setDraftText', text: 'typed before the draft went away' });
    session.draftActorRef.stop();

    await expect(store.flushComposerRecords()).resolves.toBeUndefined();
    store.release(chatId);
  });

  it('should write a record that is waiting out a retry when flushed (R9)', async () => {
    const client = createMemoryClient();
    const { store } = openStore(client);
    const session = store.acquire(chatId, projectId);
    await vi.waitFor(() => {
      expect(session.composerRecordRef.getSnapshot().matches({ lifecycle: 'usable' })).toBe(true);
    });
    vi.spyOn(client, 'writeFile').mockRejectedValueOnce(Object.assign(new Error('EIO'), { code: 'EIO' }));
    session.draftActorRef.send({ type: 'setDraftMode', mode: 'plan' });
    await vi.waitFor(() => {
      expect(session.composerRecordRef.getSnapshot().matches({ writes: 'retrying' })).toBe(true);
    });

    await store.flushComposerRecords();

    expect(client.json(composerPath(projectId, chatId))).toEqual({ version: 1, mode: 'plan' });
    store.release(chatId);
  });

  it('should report a failed unread write on the project unread record actor (G2)', async () => {
    vi.stubGlobal('document', { visibilityState: 'hidden', hasFocus: () => false });
    const client = createMemoryClient();
    const { store } = openStore(client);
    store.acquire(chatId, projectId);
    const failed = vi.fn();
    store.unreadRecordRef(projectId).on('writeFailed', failed);
    vi.spyOn(client, 'writeFile').mockRejectedValueOnce(Object.assign(new Error('EACCES'), { code: 'EACCES' }));

    publishLogRows(chatId, [...runningRows(), lifecycleRow(2, 'completed')]);
    store.markViewed(chatId);

    await vi.waitFor(() => {
      expect(failed).toHaveBeenCalledOnce();
    });
    store.release(chatId);
  });

  it('still opens the chat when its record cannot be read', async () => {
    const client = createMemoryClient();
    client.failingReads.add(composerPath(projectId, chatId));
    const transcript: MyUIMessage[] = [{ id: 'msg_1', role: 'user', parts: [{ type: 'text', text: 'earlier' }] }];
    const { store } = openStore(client, chatRow(chatId, projectId, { messages: transcript }));
    const session = store.acquire(chatId, projectId);
    const unreadable = vi.fn();
    session.composerRecordRef.on('recordUnreadable', unreadable);

    await vi.waitFor(() => {
      expect(harness.created.at(-1)!.messages).toEqual(transcript);
    });
    await vi.waitFor(() => {
      expect(session.composerRecordRef.getSnapshot().matches({ lifecycle: 'usable' })).toBe(true);
    });
    expect(unreadable).toHaveBeenCalledOnce();
    expect(session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);

    // A read failure is not an absence, but the composer stays usable and writes still go out.
    client.failingReads.clear();
    session.draftActorRef.send({ type: 'setDraftMode', mode: 'plan' });
    await vi.waitFor(() => {
      expect(client.json(composerPath(projectId, chatId))).toEqual({ version: 1, mode: 'plan' });
    });
    store.release(chatId);
  });

  it('disables send with the reason when the selected model cannot read a PDF in the draft', async () => {
    const client = createMemoryClient();
    const { store } = openStore(client);
    const session = store.acquire(chatId, projectId);
    await attachBoth(session);
    const gate = (model: SelectedModel): string | undefined =>
      attachmentSendBlockReason(session.draftActorRef.getSnapshot().context.draftAttachments, model);

    expect(gate(pdfModel)).toBeUndefined();
    expect(gate(imageOnlyModel)).toBe("GPT Image can't read PDFs. Remove the PDF or pick another model.");

    session.draftActorRef.send({ type: 'removeDraftAttachment', index: 1 });
    expect(gate(imageOnlyModel)).toBeUndefined();
    store.release(chatId);
  });
});

/**
 * The unread record is the one source of unread (D9), and deletion reaches the
 * live composer (D11, W8).
 */
describe('ChatSessionStore — unread restore and live-record deletion (W8)', () => {
  const projectId = 'proj_w8';
  const chatId = 'chat_w8';
  const unreadPath = `/.tau/composers/chats/${projectId}/unread.json`;

  /** A store over one device's disk, with a live project session; the store owns the chat's machine (PV-S5). */
  const openStore = (client: MemoryClient) => {
    const store = new ChatSessionStore({ chatSession });
    const deps = createStubDeps(client);
    deps.getChat.mockImplementation(async (id) => chatRow(id, projectId));
    store.setDependencies(deps);
    const projectRef = {
      send: () => undefined,
      getSnapshot: () => ({ context: { runs: [] } }),
    } as unknown as Parameters<StoreType['setProjectSession']>[1];
    store.setProjectSession(projectId, projectRef);
    return { store };
  };

  beforeEach(() => {
    harness.created = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('answers unread for a fresh store from the chat’s log and the receipt on disk', async () => {
    vi.stubGlobal('document', { visibilityState: 'hidden', hasFocus: () => false });
    const client = createMemoryClient();
    const first = openStore(client);
    first.store.acquire(chatId, projectId);
    publishLogRows(chatId, [...runningRows(), lifecycleRow(2, 'completed')]);
    expect(first.store.isUnread(chatId)).toBe(true);
    first.store.release(chatId);

    const second = openStore(client);
    second.store.acquire(chatId, projectId);
    const woke = vi.fn();
    second.store.subscribeUnread(woke);
    publishLogRows(chatId, [...runningRows(), lifecycleRow(2, 'completed')]);

    expect(second.store.isUnread(chatId)).toBe(true);
    expect(woke).toHaveBeenCalled();
    second.store.release(chatId);
  });

  it('stops the live record actor when its chat is deleted, so a later patch cannot write the record back', async () => {
    const client = createMemoryClient();
    const { store } = openStore(client);
    const session = store.acquire(chatId, projectId);
    const draft = (text: string): MyUIMessage => ({
      id: 'draft',
      role: 'user',
      metadata: { createdAt: 1, status: 'pending' },
      parts: [{ type: 'text', text }],
    });
    session.composerRecordRef.send({ type: 'patch', fields: { draft: draft('before delete') } });
    await vi.waitFor(() => {
      expect(client.json(composerPath(projectId, chatId))).toMatchObject({ draft: { id: 'draft' } });
    });

    await store.removeChat(chatId);
    expect(client.json(composerPath(projectId, chatId))).toBeUndefined();

    session.composerRecordRef.send({ type: 'patch', fields: { draft: draft('after delete') } });
    session.draftActorRef.send({ type: 'setDraftText', text: 'typed after delete' });
    await settle();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 600);
    });
    expect(client.json(composerPath(projectId, chatId))).toBeUndefined();
    expect(session.composerRecordRef.getSnapshot().status).toBe('done');
    store.release(chatId);
  });

  it('does not recreate unread.json for a late unread decision after its project is deleted', async () => {
    vi.stubGlobal('document', { visibilityState: 'hidden', hasFocus: () => false });
    const client = createMemoryClient();
    const { store } = openStore(client);
    store.acquire(chatId, projectId);
    store.markViewed(chatId);
    await settle();

    await store.removeProject(projectId);
    finishRun(harness.created.at(-1)!);
    await settle();

    expect(client.json(unreadPath)).toBeUndefined();
    expect(client.namesUnder(`/.tau/composers/chats/${projectId}`)).toEqual([]);
    store.release(chatId);
  });
});
