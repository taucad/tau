// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- mock for AI SDK's Chat / DefaultChatTransport classes uses the SDK's own PascalCase names and `~`-prefixed subscriber method names verbatim so the mock surface matches the real one. */
/* eslint-disable @typescript-eslint/explicit-member-accessibility -- mock class constructors omit the `public` keyword to mirror the AI SDK's published shape. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentLauncher } from '@taucad/agent-host/launcher';
import { createNodeChatStore } from '@taucad/agent-host/node';
import { createTauCloudGatewayModelTransport } from '@taucad/agent-host';
import { createAgentHostClient } from '#services/agent-host-client.js';
import type { AgentHostClient } from '#services/agent-host-client.js';
import type { AgentHostTransport } from '#services/agent-host-transport.js';
import { pathToFileURL } from 'node:url';
import { createActor } from 'xstate';
import type { Chat as ChatEntity, ModelSupport, MyUIMessage } from '@taucad/chat';
import { errorCategory } from '@taucad/types/constants';
import type * as AiSdk from 'ai';
import type { WatchEvent } from '@taucad/filesystem';
import type { CatchUpFrame, CommandAnswer, HostCommand } from '@taucad/agent-host/wire';
import { chatSessionMachine } from '#machines/chat-session.machine.js';
import { chunksOf } from '#machines/chat-projection.logic.js';
import { sha256Bytes } from '@taucad/utils/hash';
import { uint8ArrayToBase64 } from 'uint8array-extras';
import type { ChatRequest, ChatTurnGesture } from '#machines/chat-session.machine.js';
import type { ProjectSessionActorRef } from '#machines/project-session.machine.js';
import { projectSessionMachine } from '#machines/project-session.machine.js';
import { spyOnSend } from '#lib/xstate-test.utils.js';
import {
  chatTurnAdmission,
  publishChatTurnAdmission,
  resetChatTurnServices,
} from '#chat-clients/_internal/chat-host-binding.js';
import {
  compactRow,
  lifecycleRow,
  logRow,
  publishLogPage,
  publishLogRows,
  runningRows,
  writerOwnedCatchUp,
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
  finish: (
    options?: Partial<{
      isAbort: boolean;
      isError: boolean;
      isDisconnect: boolean;
    }>,
  ) => void;
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
        finish: (
          options?: Partial<{
            isAbort: boolean;
            isError: boolean;
            isDisconnect: boolean;
          }>,
        ) => {
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
  [K in Exclude<keyof ChatSessionDeps, 'client' | 'watchRecordFile'>]: ReturnType<typeof vi.fn<ChatSessionDeps[K]>>;
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

/** Every store here runs its chats on this logic, so a row can record the turns a chat ends (PV-S5: the store owns each chat's root). */
const chatSession = chatSessionMachine.provide({
  actors: { admitTurn: chatTurnAdmission },
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
 * Publish what one chat's admission composes, as its route would.
 *
 * Deliberately separable from {@link startTurnOwner}: a loaded seed remains
 * durable and pending until the focused admission and connector both publish.
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
  // An SDK watch requires a visible admitted input; lifecycle-only logs cannot
  // seed a new response safely from an earlier assistant.
  const runningUserRows = (runId: string): Array<Record<string, unknown>> => {
    const message = {
      id: `user_${runId}`,
      role: 'user',
      content: 'Continue this turn',
    };
    return [
      {
        ...lifecycleRow(0, 'admitted', runId),
        admission: { kind: 'tau', turnId: message.id, message },
      },
      lifecycleRow(1, 'running', runId),
    ];
  };
  it('reopens a projected run watch after live delivery drops without another durable row or command', async () => {
    const store = createStore();
    const chatId = 'chat_live_drop';
    const projectId = 'project_live_drop';
    const hostCommand = vi.fn<AgentHostClient['hostCommand']>();
    let endLive: (() => void) | undefined;
    let deliverLive: Parameters<AgentHostClient['subscribeLive']>[1] | undefined;
    const subscribe = vi.fn((...parameters: Parameters<AgentHostClient['subscribe']>) => {
      const [{ cursor }] = parameters;
      queueMicrotask(() =>
        parameters[3]?.({
          status: 'batch',
          sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
          sourceGeneration: 'writer-live-drop',
          chatId,
          cursor,
          nextCursor: 2,
          endCursor: 2,
          events: cursor === 0 ? runningUserRows('run_live_drop') : [],
        }),
      );
      return vi.fn();
    });
    const connect = vi.fn(async () => ({
      hostCommand,
      catchUp: writerOwnedCatchUp,
      read: vi.fn<AgentHostClient['read']>(async ({ cursor }) => ({
        status: 'batch',
        chatId,
        sourceGeneration: 'writer-live-drop',
        sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
        cursor,
        nextCursor: cursor,
        endCursor: 2,
        events: [],
      })),
      subscribe,
      subscribeLive: (
        _chatId: string,
        listener: Parameters<AgentHostClient['subscribeLive']>[1],
        onEnded?: () => void,
      ) => {
        deliverLive = listener;
        endLive = onEnded;
        return vi.fn();
      },
      close: vi.fn(async () => undefined),
    }));
    const session = store.acquire(chatId, projectId);
    const unobserve = store.observe(chatId, projectId);
    const unpublish = store.publishProjectHostConnector(projectId, connect);
    const chat = harness.created.find((entry) => entry.id === chatId)!;
    await vi.waitFor(() => {
      expect(chat.resumeStream).toHaveBeenCalledTimes(1);
    });
    deliverLive?.(chatId, {
      sourceGeneration: 'writer-live-drop',
      type: 'text-delta',
      chatId,
      runId: 'run_live_drop',
      messageId: 'assistant-live',
      contentIndex: 0,
      delta: 'Preview',
    });
    expect(chunksOf(store.getProjection(chatId)?.live?.chunks)).toContainEqual(
      expect.objectContaining({ delta: 'Preview' }),
    );
    endLive?.();
    expect(store.getProjection(chatId)?.live).toBeUndefined();
    await vi.waitFor(
      () => {
        expect(connect).toHaveBeenCalledTimes(2);
      },
      { timeout: 2000 },
    );
    await vi.waitFor(() => {
      expect(chat.resumeStream).toHaveBeenCalledTimes(2);
    });
    expect(subscribe.mock.calls.map(([input]) => input.cursor)).toEqual([0, 2]);
    expect(store.getProjection(chatId)?.ledger.runs['run_live_drop']?.lifecycle).toBe('running');
    expect(hostCommand).not.toHaveBeenCalled();
    expect(session.chat).toBeDefined();
    unpublish();
    unobserve();
    store.release(chatId);
  });

  it('should prepare the latest transcript when another projection supersedes an in-flight handoff', async () => {
    const store = createStore();
    const session = store.acquire('chat_handoff', 'project_handoff');
    await vi.waitFor(() => {
      expect(session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
    });
    publishLogRows(store, session.chatId, [
      lifecycleRow(0, 'admitted'),
      logRow(1, { type: 'message.appended', message: { id: 'old-message', role: 'user', content: 'Original' } }),
      lifecycleRow(2, 'completed'),
    ]);
    const prepared = store.preparePresentation(session.chatId, new AbortController().signal);
    const alsoPrepared = store.preparePresentation(session.chatId, new AbortController().signal);
    // Both readers enter the existing materialization before the next projection supersedes it.
    await Promise.resolve();
    publishLogRows(
      store,
      session.chatId,
      [
        lifecycleRow(3, 'admitted', 'run_2'),
        logRow(4, {
          runId: 'run_2',
          type: 'message.appended',
          message: { id: 'new-message', role: 'user', content: 'Updated' },
        }),
        lifecycleRow(5, 'completed', 'run_2'),
      ],
      3,
    );
    await Promise.all([prepared, alsoPrepared]);
    expect(session.chat.messages.filter((message) => message.role === 'user').map((message) => message.id)).toEqual([
      'old-message',
      'new-message',
    ]);
    store.release(session.chatId);
    expect(store.get(session.chatId)).toBeUndefined();
  });

  it('reacquires an already observed completed transcript without another host answer', async () => {
    const store = createStore();
    const deps = createStubDeps();
    let finishMetadata!: (chat: ChatEntity | undefined) => void;
    const heldMetadata = new Promise<ChatEntity | undefined>((resolve) => {
      finishMetadata = resolve;
    });
    deps.getChat.mockResolvedValueOnce(undefined).mockReturnValue(heldMetadata);
    store.setDependencies(deps);
    const chatId = 'chat_retained_completed';
    const projectId = 'project_retained_completed';
    const rows: unknown[] = readFileSync(
      new URL(
        '../../../../packages/agent-host/specs/ChatLog/recorded/in-project-ping-pong-turn.jsonl',
        pathToFileURL(import.meta.filename),
      ),
      'utf8',
    )
      .trim()
      .split('\n')
      .map((line: string) => JSON.parse(line) as unknown);
    const unobserve = store.observe(chatId, projectId);
    const first = store.acquire(chatId, projectId);
    publishLogRows(store, chatId, rows);
    await vi.waitFor(() => {
      expect(first.messages.some((message) => message.role === 'assistant')).toBe(true);
    });
    const expected = first.messages;
    store.release(chatId);
    expect(store.get(chatId)).toBeUndefined();
    const replacement = store.acquire(chatId, projectId);
    await vi.waitFor(() => {
      expect(replacement.messages).toEqual(expected);
    });
    expect(replacement).not.toBe(first);
    finishMetadata(undefined);
    await heldMetadata;
    store.release(chatId);
    unobserve();
  });

  for (const resetCurrentWatch of [false, true]) {
    it(`retained display ${resetCurrentWatch ? 'retires on current foreign watch reset' : 'survives ordinary detach'} while a new scan is held`, async () => {
      const projectId = 'project_display_foreign_reset';
      const chatId = 'chat_display_foreign_reset';
      const directory = `/projects/${projectId}/.tau/chats/${chatId}/events`;
      const client = createMemoryClient();
      const rows = readFileSync(
        new URL(
          '../../../../packages/agent-host/specs/ChatLog/recorded/in-project-ping-pong-turn.jsonl',
          pathToFileURL(import.meta.filename),
        ),
        'utf8',
      );
      await client.writeFile(`${directory}/other-device.jsonl`, new TextEncoder().encode(rows));
      const scan = Promise.withResolvers<string[]>();
      let holdScan = false;
      const originalReadDirectory = client.readdir.bind(client);
      const readDirectory = vi.spyOn(client, 'readdir').mockImplementation(async (path) => {
        if (holdScan && path === directory) {
          return scan.promise;
        }
        return originalReadDirectory(path);
      });
      const callbacks: Array<(event: WatchEvent) => void> = [];
      const watch: NonNullable<ChatSessionDeps['watchRecordFile']> = (_path, listener) => {
        callbacks.push(listener);
        return {
          ready: Promise.resolve(),
          closed: new Promise<void>(() => {
            /* Owner-controlled watch. */
          }),
          dispose: vi.fn(),
        };
      };
      const store = new ChatSessionStore({ chatSession });
      store.setDependencies({ ...createStubDeps(client), watchRecordFile: watch });
      const capture = Promise.withResolvers<void>();
      let captures = 0;
      const catchUp = async function* (): AsyncIterable<CatchUpFrame> {
        captures += 1;
        if (captures > 1) {
          await capture.promise;
        }
        yield {
          type: 'validated',
          health: { historyIntact: true, newerHistory: false, quarantined: false },
          position: {
            cursor: 0,
            sourceGeneration: captures === 1 ? 'display-local-source' : 'display-replacement-source',
          },
          observedEndCursor: 0,
        };
      };
      const hostCommand = vi.fn<AgentHostClient['hostCommand']>();
      const subscribe = vi.fn<AgentHostClient['subscribe']>(() => () => undefined);
      const unpublish = store.publishProjectHostConnector(projectId, async () => ({
        catchUp,
        hostCommand,
        // Force the held-capture branch through a real source replacement observation.
        read: vi.fn<AgentHostClient['read']>(async () => ({ status: 'refused', chatId, reason: 'identity-mismatch' })),
        subscribe,
        close: async () => undefined,
      }));
      let unobserve = store.observe(chatId, projectId);
      try {
        const first = store.acquire(chatId, projectId);
        await vi.waitFor(() => {
          expect(first.messages.some((message) => message.role === 'assistant')).toBe(true);
          expect(store.historicalUsageReady(chatId, projectId)).toBe(true);
        });
        const expected = first.messages;
        unobserve();
        store.release(chatId);
        expect(store.get(chatId)).toBeUndefined();
        holdScan = true;
        readDirectory.mockClear();
        unobserve = store.observe(chatId, projectId);
        await vi.waitFor(() => {
          expect(callbacks).toHaveLength(2);
          expect(readDirectory).toHaveBeenCalledWith(directory);
          expect(captures).toBe(2);
        });
        if (resetCurrentWatch) {
          callbacks[1]!({ type: 'reset' });
          capture.resolve();
          await vi.waitFor(() => {
            expect(subscribe).toHaveBeenCalledTimes(2);
          });
        }
        const replacement = store.acquire(chatId, projectId);
        await vi.waitFor(() => {
          expect(replacement.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
        });
        if (resetCurrentWatch) {
          expect(replacement.messages).toEqual([]);
        } else {
          await vi.waitFor(() => {
            expect(replacement.messages).toEqual(expected);
          });
          callbacks[0]!({ type: 'reset' });
          expect(replacement.messages).toEqual(expected);
        }
        expect(store.historicalUsageReady(chatId, projectId)).toBe(false);
        expect(hostCommand).not.toHaveBeenCalled();
      } finally {
        holdScan = false;
        scan.resolve(await originalReadDirectory(directory));
        capture.resolve();
        unobserve();
        store.release(chatId);
        unpublish();
      }
    });
  }

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
          catchUp: writerOwnedCatchUp,
          read: vi.fn(),
          subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
            queueMicrotask(() =>
              parameters[3]?.({
                status: 'batch',
                sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
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

  it('hydrates a new project seed using the acquired project id before global project discovery', async () => {
    const chatId = 'chat_cold_project_seed';
    const projectId = 'project_cold_seed';
    const seed: MyUIMessage = {
      id: 'msg_cold_seed',
      role: 'user',
      parts: [{ type: 'text', text: 'Make a cube' }],
      metadata: { status: 'pending' },
    };
    const deps = createStubDeps();
    deps.getChat.mockImplementation(async (_chatId, knownProjectId) =>
      knownProjectId === projectId
        ? chatRow(chatId, projectId, {
            messages: [seed],
            startupRequest: {
              id: 'req_cold_seed',
              kind: 'regenerate-tail',
              messageId: seed.id,
              message: seed,
              source: 'homepage-initial-message',
              createdAt: 1,
            },
          })
        : undefined,
    );
    const store = new ChatSessionStore({ chatSession });
    store.setDependencies(deps);
    const session = store.acquire(chatId, projectId);
    await vi.waitFor(() => {
      expect(session.chat.messages).toContainEqual(seed);
    });
    expect(deps.getChat).toHaveBeenCalledWith(chatId, projectId);
    store.release(chatId);
  });

  it('does not resend an observed seed before its reset projection refetches the foreign accepted user', async () => {
    const chatId = 'chat_remote_seed';
    const projectId = 'project_remote_seed';
    const path = `/projects/${projectId}/.tau/chats/${chatId}/events/other-device.jsonl`;
    const seed: MyUIMessage = {
      id: 'msg_remote_seed',
      role: 'user',
      parts: [{ type: 'text', text: 'Make a cube' }],
      metadata: { status: 'pending' },
    };
    const client = createMemoryClient();
    await client.writeFile(
      path,
      new TextEncoder().encode(
        [
          lifecycleRow(0, 'admitted', 'req_remote_seed'),
          logRow(1, {
            runId: 'req_remote_seed',
            type: 'message.appended',
            message: { id: seed.id, role: 'user', content: 'Make a cube' },
          }),
          lifecycleRow(2, 'completed', 'req_remote_seed'),
        ]
          .map((row) => JSON.stringify(row))
          .join('\n'),
      ),
    );
    const deps = createStubDeps(client);
    deps.getChat.mockResolvedValue(
      chatRow(chatId, projectId, {
        messages: [seed],
        startupRequest: {
          id: 'req_remote_seed',
          kind: 'regenerate-tail',
          messageId: seed.id,
          message: seed,
          source: 'homepage-initial-message',
          createdAt: 1,
        },
      }),
    );
    const store = new ChatSessionStore({ chatSession });
    store.setDependencies(deps);
    const unobserve = store.observe(chatId, projectId);
    await store.refreshRemoteSegments(chatId, projectId);
    expect(
      Object.values(store.getProjection(chatId)?.remote?.views ?? {}).some((view) => view.user?.id === seed.id),
    ).toBe(true);

    const remoteReads = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
    let remoteReadCount = 0;
    const originalRead = client.readFile.bind(client);
    vi.spyOn(client, 'readFile').mockImplementation(async (file) => {
      if (file === path) {
        await remoteReads[remoteReadCount++]?.promise;
      }
      return originalRead(file);
    });
    const hostCommand = vi.fn<AgentHostClient['hostCommand']>();
    const unpublish = store.publishProjectHostConnector(projectId, async () =>
      mock<AgentHostClient>({ catchUp: writerOwnedCatchUp, hostCommand, close: vi.fn(async () => undefined) }),
    );
    publishAdmission(chatId, (gesture) => {
      if (gesture.kind !== 'regenerate' || gesture.requestId === undefined) {
        throw new Error('Expected seeded regenerate.');
      }
      return {
        kind: 'regenerate',
        command: {
          type: 'start',
          commandId: gesture.requestId,
          payload: {
            chatId,
            runId: gesture.requestId,
            message: { id: seed.id, role: 'user', content: 'Make a cube' },
            trigger: 'submit',
          },
        },
      };
    });
    const session = store.acquire(chatId, projectId);
    await vi.waitFor(() => {
      expect(session.chat.messages).toContainEqual(seed);
      expect(remoteReadCount).toBe(1);
    });
    const newerRefresh = store.refreshRemoteSegments(chatId, projectId);
    await vi.waitFor(() => {
      expect(remoteReadCount).toBe(2);
    });
    publishLogRows(store, chatId, []);
    await settle();
    expect(hostCommand).not.toHaveBeenCalled();
    remoteReads[0]?.resolve();
    await settle();
    expect(hostCommand).not.toHaveBeenCalled();
    expect(deps.consumeChatStartupRequest).not.toHaveBeenCalled();
    remoteReads[1]?.resolve();
    await newerRefresh;
    await vi.waitFor(() => {
      expect(deps.consumeChatStartupRequest).toHaveBeenCalledWith(chatId, 'req_remote_seed');
    });
    expect(hostCommand).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(session.chat.messages.filter((message) => message.id === seed.id)).toHaveLength(1);
    });
    store.release(chatId);
    unobserve();
    unpublish();
  });

  it.each(['missing', 'zero-byte'] as const)(
    'keeps a seed through reload and starts it when the %s host log long-polls',
    async (localLogFile) => {
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
            message: seed,
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

      if (localLogFile === 'zero-byte') {
        await deps.client.writeFile(
          '/projects/project_seed_waiting_ack/.tau/chats/chat_seed_waiting_ack/events.jsonl',
          new Uint8Array(),
        );
      }
      const reloaded = new ChatSessionStore({ chatSession });
      reloaded.setDependencies(deps);
      // A sidebar read before this session exists is not a fresh seed-admission read.
      publishLogRows(reloaded, 'chat_seed_waiting_ack', []);
      expect(reloaded.observedChatIdsOf('project_seed_waiting_ack')).toEqual([]);
      reloaded.acquire('chat_seed_waiting_ack', 'project_seed_waiting_ack');
      await vi.waitFor(() => {
        expect(reloaded.get('chat_seed_waiting_ack')?.chat.messages).toContainEqual(seed);
      });
      expect(deps.consumeChatStartupRequest).not.toHaveBeenCalled();
      expect(
        reloaded
          .get('chat_seed_waiting_ack')
          ?.stateActorRef.getSnapshot()
          .matches({ run: { queued: 'admitting' } }),
      ).toBe(false);

      const hostCommand = vi.fn(
        async (command: HostCommand): Promise<CommandAnswer> => ({
          commandId: command.commandId,
          generation: 0,
          status: 'applied',
          effect: 'durable',
          cursor: 1,
        }),
      );
      // The browser launcher parks an empty read; no batch is emitted until a writer wakes it.
      const subscribe = vi.fn<AgentHostClient['subscribe']>(() => vi.fn());
      const unpublishConnector = reloaded.publishProjectHostConnector('project_seed_waiting_ack', async () =>
        mock<AgentHostClient>({
          catchUp: writerOwnedCatchUp,
          hostCommand,
          subscribe,
          close: vi.fn(async () => undefined),
        }),
      );
      expect(hostCommand).not.toHaveBeenCalled();
      const unpublishAdmission = publishChatTurnAdmission('chat_seed_waiting_ack', async (gesture) => {
        if (gesture.kind !== 'regenerate' || gesture.requestId === undefined) {
          throw new Error('Expected the durable seeded regenerate gesture.');
        }
        const runId = gesture.requestId;
        return {
          runId,
          leaseTurnId: undefined,
          request: {
            kind: 'regenerate',
            command: {
              type: 'start',
              commandId: runId,
              payload: {
                chatId: 'chat_seed_waiting_ack',
                runId,
                message: { id: seed.id, role: 'user', content: 'Make a cube' },
                trigger: 'submit',
              },
            },
          },
        };
      });
      await vi.waitFor(() => {
        expect(subscribe).toHaveBeenCalledOnce();
      });
      expect(reloaded.observedChatIdsOf('project_seed_waiting_ack')).toEqual(['chat_seed_waiting_ack']);
      reloaded.startPendingSeed('chat_seed_waiting_ack');
      await vi.waitFor(() => {
        expect(hostCommand).toHaveBeenCalledOnce();
        expect(deps.consumeChatStartupRequest).toHaveBeenCalledWith('chat_seed_waiting_ack', 'req_seed_waiting_ack');
      });
      reloaded.startPendingSeed('chat_seed_waiting_ack');
      expect(hostCommand).toHaveBeenCalledOnce();
      unpublishAdmission();
      unpublishConnector();
      first.release('chat_seed_waiting_ack');
      reloaded.release('chat_seed_waiting_ack');
    },
  );

  it.each(['unreadable', 'owner-fenced', 'identity-mismatch', 'local-io-error'] as const)(
    'does not dispatch a seeded Start after %s before an authoritative host read',
    async (failure) => {
      const chatId = `chat_seed_${failure}`;
      const projectId = `project_seed_${failure}`;
      const seed: MyUIMessage = {
        id: `msg_seed_${failure}`,
        role: 'user',
        parts: [{ type: 'text', text: 'Make a cube' }],
        metadata: { status: 'pending' },
      };
      const deps = createStubDeps();
      deps.getChat.mockResolvedValue(
        chatRow(chatId, projectId, {
          messages: [seed],
          startupRequest: {
            id: `req_seed_${failure}`,
            kind: 'regenerate-tail',
            messageId: seed.id,
            message: seed,
            source: 'homepage-initial-message',
            createdAt: 1,
          },
        }),
      );
      const store = new ChatSessionStore({ chatSession });
      store.setDependencies(deps);
      const originalRead = deps.client.readFile.bind(deps.client);
      deps.client.readFile = async (path) => {
        if (!path.endsWith('/events.jsonl')) {
          return originalRead(path);
        }
        return new Promise<Uint8Array<ArrayBuffer>>((_resolve, reject) => {
          queueMicrotask(() => {
            if (failure !== 'local-io-error') {
              store.receiveHostReadAnswer(chatId, { status: 'refused', reason: failure });
            }
            reject(failure === 'local-io-error' ? Object.assign(new Error('EIO'), { code: 'EIO' }) : notFound(path));
          });
        });
      };
      const hostCommand = vi.fn<AgentHostClient['hostCommand']>(async (command) => ({
        commandId: command.commandId,
        generation: 0,
        status: 'applied',
        effect: 'durable',
        cursor: 1,
      }));
      const unpublishConnector = store.publishProjectHostConnector(projectId, async () =>
        mock<AgentHostClient>({
          catchUp: writerOwnedCatchUp,
          hostCommand,
          subscribe: vi.fn(() => vi.fn()),
          close: vi.fn(async () => undefined),
        }),
      );
      publishAdmission(chatId, (gesture) => {
        if (gesture.kind !== 'regenerate' || gesture.requestId === undefined) {
          throw new Error('Expected the durable seeded regenerate gesture.');
        }
        return {
          kind: 'regenerate',
          command: {
            type: 'start',
            commandId: gesture.requestId,
            payload: {
              chatId,
              runId: gesture.requestId,
              message: { id: seed.id, role: 'user', content: 'Make a cube' },
              trigger: 'submit',
            },
          },
        };
      });
      const session = store.acquire(chatId, projectId);
      await vi.waitFor(() => {
        expect(session.chat.messages).toContainEqual(seed);
      });
      await settle();
      expect(hostCommand).not.toHaveBeenCalled();
      expect(deps.consumeChatStartupRequest).not.toHaveBeenCalled();
      if (failure === 'local-io-error') {
        expect(session.persistenceActorRef.getSnapshot().context.persistedError).toBeDefined();
      }
      if (failure === 'identity-mismatch') {
        publishLogRows(store, chatId, []);
        await vi.waitFor(() => {
          expect(hostCommand).toHaveBeenCalledOnce();
        });
      }
      store.release(chatId);
      unpublishConnector();
    },
  );

  it('should not consume a seed from a previous session’s cached user before a fresh empty host read', async () => {
    const chatId = 'chat_stale_seed_read';
    const projectId = 'project_stale_seed_read';
    const seed: MyUIMessage = {
      id: 'msg_stale_seed_read',
      role: 'user',
      parts: [{ type: 'text', text: 'New design' }],
      metadata: { status: 'pending' },
    };
    let stored = chatRow(chatId, projectId);
    const deps = createStubDeps();
    deps.getChat.mockImplementation(async () => stored);
    const store = new ChatSessionStore({ chatSession });
    store.setDependencies(deps);
    store.acquire(chatId, projectId);
    await vi.waitFor(() => {
      expect(deps.getChat).toHaveBeenCalledOnce();
    });
    publishLogRows(store, chatId, [
      lifecycleRow(0, 'admitted', 'req_old_log'),
      logRow(1, {
        runId: 'req_old_log',
        type: 'message.appended',
        message: { id: 'msg_old_log', role: 'user', content: 'Old design' },
      }),
      lifecycleRow(2, 'completed', 'req_old_log'),
    ]);
    store.release(chatId);
    await vi.waitFor(() => {
      expect(store.get(chatId)).toBeUndefined();
    });

    stored = chatRow(chatId, projectId, {
      messages: [seed],
      startupRequest: {
        id: 'req_stale_seed_read',
        kind: 'regenerate-tail',
        messageId: seed.id,
        message: seed,
        source: 'fix-with-ai-new-chat',
        createdAt: 1,
      },
    });
    const releaseSidebar = store.observe(chatId, projectId);
    const session = store.acquire(chatId, projectId);
    await vi.waitFor(() => {
      expect(session.chat.messages).toContainEqual(seed);
    });
    expect(deps.consumeChatStartupRequest).not.toHaveBeenCalled();
    store.receiveHostReadAnswer(chatId, { status: 'refused', reason: 'identity-mismatch' });
    publishLogRows(store, chatId, []);
    await settle();
    expect(session.chat.messages).toContainEqual(seed);
    expect(deps.consumeChatStartupRequest).not.toHaveBeenCalled();
    store.release(chatId);
    await vi.waitFor(() => {
      expect(store.get(chatId)).toBeUndefined();
    });
    expect(store.observedChatIdsOf(projectId)).toEqual([chatId]);
    releaseSidebar();
    expect(store.observedChatIdsOf(projectId)).toEqual([]);
  });

  it('should keep the seeded user message while an empty caught-up host log precedes Start', async () => {
    const chatId = 'chat_seed_before_start';
    const projectId = 'project_seed_before_start';
    const seed: MyUIMessage = {
      id: 'msg_seed_before_start',
      role: 'user',
      parts: [{ type: 'text', text: 'Make a cube' }],
      metadata: { status: 'pending' },
    };
    const deps = createStubDeps();
    deps.getChat.mockResolvedValue(
      chatRow(chatId, projectId, {
        messages: [seed],
        startupRequest: {
          id: 'req_seed_before_start',
          kind: 'regenerate-tail',
          messageId: seed.id,
          message: seed,
          source: 'homepage-initial-message',
          createdAt: 1,
        },
      }),
    );
    const store = new ChatSessionStore({ chatSession });
    store.setDependencies(deps);
    const session = store.acquire(chatId, projectId);
    await vi.waitFor(() => {
      expect(session.chat.messages).toContainEqual(seed);
    });

    publishLogRows(store, chatId, []);
    await settle();

    expect(session.chat.messages).toContainEqual(seed);
    expect(deps.consumeChatStartupRequest).not.toHaveBeenCalled();

    publishLogRows(store, chatId, [
      lifecycleRow(0, 'admitted', 'req_seed_before_start'),
      logRow(1, {
        runId: 'req_seed_before_start',
        type: 'message.appended',
        message: { id: seed.id, role: 'user', content: 'Make a cube' },
      }),
      lifecycleRow(2, 'completed', 'req_seed_before_start'),
    ]);
    await settle();
    expect(session.chat.messages.filter((message) => message.id === seed.id)).toHaveLength(1);
    store.release(chatId);
    expect(store.observedChatIdsOf(projectId)).toEqual([]);
  });

  it('does not overwrite a displayed transcript from a chat-record refresh with no transcript bytes', async () => {
    const chatId = 'chat_projected_refresh';
    const projectId = 'project_projected_refresh';
    const client = createMemoryClient();
    const rows = readFileSync(
      new URL(
        '../../../../packages/agent-host/specs/ChatLog/recorded/in-project-ping-pong-turn.jsonl',
        pathToFileURL(import.meta.filename),
      ),
      'utf8',
    );
    const segmentPath = `/projects/${projectId}/.tau/chats/${chatId}/events/other-device.jsonl`;
    await client.writeFile(segmentPath, new TextEncoder().encode(rows));
    const deps = createStubDeps(client);
    deps.getChat.mockResolvedValue(chatRow(chatId, projectId));
    const store = new ChatSessionStore({ chatSession });
    store.setDependencies(deps);
    const session = store.acquire(chatId, projectId);
    await vi.waitFor(() => {
      expect(deps.getChat).toHaveBeenCalledOnce();
    });
    await settle();
    await store.refreshRemoteSegments(chatId, projectId);
    await vi.waitFor(() => {
      expect(session.chat.messages.some((message) => message.role === 'assistant')).toBe(true);
    });
    await store.refreshFromStorage(chatId);
    expect(session.chat.messages.some((message) => message.role === 'assistant')).toBe(true);
    await client.writeFile(
      segmentPath,
      new TextEncoder().encode(
        rows.replace('Browser host completed the workspace change.', 'Browser host verified the workspace change.'),
      ),
    );
    await store.refreshFromStorage(chatId);
    await vi.waitFor(() => {
      expect(JSON.stringify(session.chat.messages)).toContain('Browser host verified the workspace change.');
    });
    store.release(chatId);
  });

  it('should not replay a refused seed while a durable manual Start waits for intent clearing and log catch-up', async () => {
    const chatId = 'chat_seed_superseded';
    const projectId = 'project_seed_superseded';
    const seed: MyUIMessage = {
      id: 'msg_seed_superseded',
      role: 'user',
      parts: [{ type: 'text', text: 'First request' }],
      metadata: { status: 'pending' },
    };
    const manual: MyUIMessage = {
      id: 'msg_manual_after_seed',
      role: 'user',
      parts: [{ type: 'text', text: 'New request' }],
      metadata: { status: 'pending' },
    };
    let stored = chatRow(chatId, projectId, {
      messages: [seed],
      startupRequest: {
        id: 'req_seed_superseded',
        kind: 'regenerate-tail',
        messageId: seed.id,
        message: seed,
        source: 'homepage-initial-message',
        createdAt: 1,
      },
    });
    const deps = createStubDeps();
    deps.getChat.mockImplementation(async () => stored);
    const consumeGate = Promise.withResolvers<void>();
    deps.consumeChatStartupRequest.mockImplementation(async (_chatId, requestId) => {
      await consumeGate.promise;
      if (stored.startupRequest?.id === requestId) {
        stored = { ...stored, startupRequest: undefined };
      }
      return stored;
    });
    const manualAnswer = Promise.withResolvers<CommandAnswer>();
    const hostCommand = vi.fn(
      async (command: HostCommand): Promise<CommandAnswer> =>
        command.commandId === 'req_seed_superseded'
          ? {
              commandId: command.commandId,
              generation: 1,
              status: 'refused',
              effect: 'not-applied',
              code: 'REVISIONS_UNAVAILABLE',
              message: 'Try again.',
            }
          : manualAnswer.promise,
    );
    const store = new ChatSessionStore({ chatSession });
    store.setDependencies(deps);
    const session = store.acquire(chatId, projectId);
    await vi.waitFor(() => {
      expect(session.chat.messages).toContainEqual(seed);
    });
    publishLogRows(store, chatId, []);
    const unpublishAdmission = publishChatTurnAdmission(chatId, async (gesture) => {
      const seeded = gesture.kind === 'regenerate';
      const requestId = seeded ? 'req_seed_superseded' : 'req_manual_after_seed';
      const command: HostCommand = {
        type: 'start',
        commandId: requestId,
        payload: {
          chatId,
          runId: requestId,
          message: {
            id: seeded ? seed.id : manual.id,
            role: 'user',
            content: seeded ? 'First request' : 'New request',
          },
          trigger: 'submit',
        },
      };
      return {
        runId: requestId,
        leaseTurnId: seeded ? seed.id : manual.id,
        request: seeded ? { kind: 'regenerate', command } : { kind: 'send', message: manual, command },
      };
    });
    const unpublishConnector = store.publishProjectHostConnector(projectId, async () =>
      mock<AgentHostClient>({
        catchUp: writerOwnedCatchUp,
        hostCommand,
        subscribe: (...args) => {
          queueMicrotask(() =>
            args[3]?.({
              status: 'batch',
              sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
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
      }),
    );
    await vi.waitFor(() => {
      expect(hostCommand).toHaveBeenCalledTimes(1);
      expect(session.stateActorRef.getSnapshot().matches({ run: 'failed' })).toBe(true);
    });
    expect(stored.startupRequest?.id).toBe('req_seed_superseded');
    expect(deps.consumeChatStartupRequest).not.toHaveBeenCalled();

    await store.requestTurn(chatId, { kind: 'send', message: manual });
    await vi.waitFor(() => {
      expect(hostCommand).toHaveBeenCalledTimes(2);
    });
    expect(stored.startupRequest?.id).toBe('req_seed_superseded');
    expect(deps.consumeChatStartupRequest).not.toHaveBeenCalled();
    manualAnswer.resolve({
      commandId: 'req_manual_after_seed',
      generation: 1,
      status: 'applied',
      effect: 'durable',
      cursor: 0,
    });
    await vi.waitFor(() => {
      expect(deps.consumeChatStartupRequest).toHaveBeenCalledWith(chatId, 'req_seed_superseded');
    });
    expect(stored.startupRequest?.id).toBe('req_seed_superseded');
    const manualRows = [
      lifecycleRow(0, 'admitted', 'req_manual_after_seed'),
      logRow(1, {
        runId: 'req_manual_after_seed',
        type: 'message.appended',
        message: { id: manual.id, role: 'user', content: 'New request' },
      }),
      lifecycleRow(2, 'completed', 'req_manual_after_seed'),
    ];
    publishLogRows(store, chatId, manualRows);
    await settle();
    expect(session.chat.messages.some((message) => message.id === seed.id)).toBe(false);
    expect(session.chat.messages.filter((message) => message.id === manual.id)).toHaveLength(1);

    // The durable manual Start has written the local log even though this reloaded reader has not caught up to it.
    await deps.client.writeFile(
      `/projects/${projectId}/.tau/chats/${chatId}/events.jsonl`,
      new TextEncoder().encode(manualRows.map((row) => JSON.stringify(row)).join('\n')),
    );
    const reloaded = new ChatSessionStore({ chatSession });
    reloaded.setDependencies(deps);
    const reloadedSession = reloaded.acquire(chatId, projectId);
    await vi.waitFor(() => {
      expect(reloadedSession.chat.messages).toContainEqual(seed);
    });
    const unpublishReloadConnector = reloaded.publishProjectHostConnector(projectId, async () =>
      mock<AgentHostClient>({
        catchUp: writerOwnedCatchUp,
        hostCommand,
        subscribe: () => vi.fn(),
        close: vi.fn(async () => undefined),
      }),
    );
    await settle();
    expect(hostCommand).toHaveBeenCalledTimes(2);
    publishLogPage(reloaded, chatId, manualRows.slice(0, 2), { cursor: 0, endCursor: 3 });
    await settle();
    expect(hostCommand).toHaveBeenCalledTimes(2);
    expect(reloadedSession.chat.messages).toContainEqual(seed);
    publishLogPage(reloaded, chatId, manualRows.slice(2), { cursor: 2, endCursor: 3 });
    await vi.waitFor(() => {
      expect(deps.consumeChatStartupRequest).toHaveBeenCalledTimes(2);
    });
    expect(deps.consumeChatStartupRequest).toHaveBeenLastCalledWith(chatId, 'req_seed_superseded');
    await settle();
    expect(reloadedSession.chat.messages.some((message) => message.id === seed.id)).toBe(false);
    expect(reloadedSession.chat.messages.filter((message) => message.id === manual.id)).toHaveLength(1);
    expect(hostCommand).toHaveBeenCalledTimes(2);
    consumeGate.resolve();
    await vi.waitFor(() => {
      expect(stored.startupRequest).toBeUndefined();
    });
    unpublishReloadConnector();
    reloaded.release(chatId);
    store.release(chatId);
    unpublishConnector();
    unpublishAdmission();
  });

  it('dispatches one admitted Start before the SDK watches its projected run', async () => {
    const store = createStore();
    const chatId = 'chat_live_command';
    const projectId = 'project_live_command';
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
    const unpublish = store.publishProjectHostConnector(projectId, async () =>
      mock<AgentHostClient>({
        catchUp: writerOwnedCatchUp,
        hostCommand,
        close,
        subscribe: () => () => undefined,
        subscribeLive: () => () => undefined,
      }),
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
    expect(close).toHaveBeenCalledTimes(1);
    unpublish();
  });

  for (const runningBeforeAck of [false, true]) {
    it(`should watch a resumed attempt only after its running row ${runningBeforeAck ? 'already folded' : 'arrives later'}`, async () => {
      const store = createStore();
      const chatId = `chat_retry_watch_${runningBeforeAck}`;
      const projectId = `project_retry_watch_${runningBeforeAck}`;
      const runId = `req_retry_watch_${runningBeforeAck}`;
      const command: HostCommand = {
        type: 'resume',
        commandId: `req_resume_watch_${runningBeforeAck}`,
        payload: { chatId, runId },
      };
      const reply = Promise.withResolvers<CommandAnswer>();
      const hostCommand = vi.fn(async () => reply.promise);
      const close = vi.fn(async () => undefined);
      const unpublish = store.publishProjectHostConnector(projectId, async () =>
        mock<AgentHostClient>({ catchUp: writerOwnedCatchUp, hostCommand, close }),
      );
      startTurnOwner(store, projectId);
      const session = store.acquire(chatId, projectId);
      await vi.waitFor(() => {
        expect(session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
      });
      publishLogRows(store, chatId, [...runningUserRows(runId), lifecycleRow(2, 'failed', runId)]);
      expect(store.getProjection(chatId)?.ledger.runs[runId]?.lifecycle).toBe('failed');
      const chat = harness.created.find((entry) => entry.id === chatId)!;
      const unpublishAdmission = publishChatTurnAdmission(chatId, async () => ({
        runId,
        leaseTurnId: undefined,
        request: { kind: 'continue', command },
      }));
      const requested = store.requestTurn(chatId, { kind: 'continue' });
      await vi.waitFor(() => {
        expect(hostCommand).toHaveBeenCalledExactlyOnceWith(command);
      });
      const reopened = logRow(3, { runId, type: 'run.lifecycle', state: 'running', attempt: 2 });
      if (runningBeforeAck) {
        publishLogRows(store, chatId, [reopened], 3);
      }
      reply.resolve({ commandId: command.commandId, generation: 1, status: 'applied', effect: 'durable', cursor: 4 });
      await requested;
      await vi.waitFor(() => {
        expect(close).toHaveBeenCalledOnce();
      });
      if (!runningBeforeAck) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
        expect(chat.resumeStream).not.toHaveBeenCalled();
        publishLogRows(store, chatId, [reopened], 3);
      }
      await vi.waitFor(() => {
        expect(chat.resumeStream).toHaveBeenCalledOnce();
      });
      expect(hostCommand).toHaveBeenCalledOnce();
      unpublishAdmission();
      unpublish();
      store.release(chatId);
    });
  }

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
    const connect = async (): Promise<
      Pick<AgentHostClient, 'hostCommand' | 'read' | 'catchUp' | 'subscribe' | 'close'>
    > => ({
      hostCommand,
      close,
      catchUp: writerOwnedCatchUp,
      read: vi.fn<AgentHostClient['read']>(async () => ({
        status: 'batch',
        sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
        chatId,
        cursor: 0,
        nextCursor: rows.length,
        endCursor: rows.length,
        events: rows,
      })),
      subscribe: (...args) => {
        args[3]?.({
          status: 'batch',
          sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
          chatId,
          cursor: 0,
          nextCursor: rows.length,
          endCursor: rows.length,
          events: rows,
        });
        return () => undefined;
      },
    });

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
          catchUp: writerOwnedCatchUp,
          read: vi.fn<AgentHostClient['read']>(async () => ({
            status: 'batch',
            sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
            chatId,
            cursor: 0,
            nextCursor: 0,
            endCursor: 0,
            events: [],
          })),
          subscribe: (...args: Parameters<AgentHostClient['subscribe']>) => {
            args[3]?.({
              status: 'batch',
              sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
              chatId,
              cursor: 0,
              nextCursor: 0,
              endCursor: 0,
              events: [],
            });
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
    const connect = async (): Promise<
      Pick<AgentHostClient, 'hostCommand' | 'read' | 'catchUp' | 'subscribe' | 'close'>
    > => ({
      hostCommand,
      close: vi.fn(async () => undefined),
      catchUp: writerOwnedCatchUp,
      read: vi.fn<AgentHostClient['read']>(async () => ({
        status: 'batch',
        sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
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
      sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
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
      sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
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
      sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
      chatId,
      cursor: 2,
      nextCursor: 3,
      endCursor: 3,
      events: [lifecycleRow(2, 'completed', 'run_prior')],
    });
    answers[0]?.({
      status: 'batch',
      sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
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
    const heard: Array<{
      type: string;
      runs: string[];
      stoppableRuns: string[];
    }> = [];
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
    publishLogRows(store, 'chat-a', runningRows());
    expect(projectA.heard).toContainEqual({ type: 'projectedRunsChanged', runs: ['chat-a'], stoppableRuns: [] });

    /* The person navigates to B while A's run is still going. */
    store.setProjectSession('proj_b', projectB.ref);
    store.setFocusedProject('proj_b');
    publishLogRows(store, 'chat-a', [lifecycleRow(2, 'completed')], 2);

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
    store.acquire('chat-a', 'proj_a');
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
      expect(deps.getChat).toHaveBeenCalledWith('chat_a', 'proj_a');
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
    publishLogRows(store, 'chat_a', runningRows());

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
      (
        store.get(chatId)!.stateActorRef.getSnapshot().value as {
          revision: Record<string, string>;
        }
      ).revision;

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
        expect(deps.getChat).toHaveBeenCalledWith('chat_delayed_release', 'proj_b');
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

  it('should reread an empty replacement generation before certifying its read authority', async () => {
    const chatId = 'chat_empty_generation_handoff';
    const projectId = 'project_empty_generation_handoff';
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-store-generation-'));
    const model = { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000, maxTokens: 4096 } as const;
    const createOwner = () =>
      createAgentLauncher({
        chats: createNodeChatStore({ workspaceRoot }),
        modelTransport: createTauCloudGatewayModelTransport({
          baseUrl: 'https://gateway.example',
          model,
          auth: () => 'fixture',
          fetch: async () => {
            throw new Error('Read-only generation handoff must not invoke a model.');
          },
        }),
        credential: () => ({ mode: 'session' }),
        systemPrompt: 'Read-only fixture',
        model,
        toolRegistry: { list: () => [], invoke: async () => ({ content: 'unused', isError: true }) },
      });
    const original = createOwner();
    const replacement = createOwner();
    const beginReplacement = Promise.withResolvers<void>();
    const validationHeld = Promise.withResolvers<void>();
    const releaseNextRead = Promise.withResolvers<void>();
    let reads = 0;
    let captures = 0;
    const transport: AgentHostTransport = {
      ready: Promise.resolve(),
      execute: async (command) => replacement.execute(command),
      async *catchUp(input) {
        captures += 1;
        const owner = captures === 1 ? original : replacement;
        for await (const frame of owner.catchUp(input)) {
          if (captures > 1 && frame.type === 'validated') {
            validationHeld.resolve();
            await releaseNextRead.promise;
          }
          yield frame;
        }
      },
      liveEvents: (id, signal) => replacement.liveEvents({ chatId: id, signal }),
      close: () => undefined,
      read: async (input) => {
        reads += 1;
        if (reads === 1) {
          await beginReplacement.promise;
        }
        return replacement.read(input);
      },
    };
    const client = createAgentHostClient(transport);
    const store = new ChatSessionStore({ chatSession });
    const deps = createStubDeps();
    deps.getChat.mockResolvedValue(chatRow(chatId, projectId));
    store.setDependencies(deps);
    const unpublish = store.publishProjectHostConnector(projectId, async () => client);
    const unobserve = store.observe(chatId, projectId);
    try {
      await vi.waitFor(() => {
        expect(reads).toBe(1);
        expect(store.historicalUsageReady(chatId, projectId)).toBe(true);
      });
      beginReplacement.resolve();
      await validationHeld.promise;
      const requested = store.getProjection(chatId)?.ledger.position;
      // Old authority is gone before fresh empty capture validates and ordinary follow resumes.
      expect({
        cursor: requested?.cursor,
        sourceGeneration: requested?.sourceGeneration,
        sourceHealth: store.getProjection(chatId)?.sourceHealth,
        usageReady: store.historicalUsageReady(chatId, projectId),
        attached: store.getAttachmentStatus(chatId) === 'attached',
      }).toEqual({
        cursor: 0,
        sourceGeneration: undefined,
        sourceHealth: undefined,
        usageReady: false,
        attached: false,
      });
      releaseNextRead.resolve();
      await vi.waitFor(() => {
        expect(reads).toBe(2);
        expect(captures).toBe(2);
        expect(store.historicalUsageReady(chatId, projectId)).toBe(true);
        expect(store.getAttachmentStatus(chatId)).toBe('attached');
      });
    } finally {
      beginReplacement.resolve();
      releaseNextRead.resolve();
      unobserve();
      unpublish();
      await client.close();
      await original.close();
      await replacement.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  for (const replacementEmpty of [false, true]) {
    it(`should retain mounted SDK messages until reset recapture validates ${replacementEmpty ? 'an empty' : 'a changed'} source`, async () => {
      const chatId = 'chat_mounted_reset_capture';
      const projectId = 'project_mounted_reset_capture';
      const runId = 'run_mounted_reset_capture';
      const store = new ChatSessionStore({ chatSession });
      const deps = createStubDeps();
      deps.getChat.mockResolvedValue(chatRow(chatId, projectId));
      store.setDependencies(deps);
      const rows = (content: string) => [
        ...runningRows(runId),
        logRow(2, {
          runId,
          type: 'message.appended',
          message: { id: 'mounted-reply', role: 'assistant', content },
        }),
        lifecycleRow(3, 'completed', runId),
      ];
      const reset = Promise.withResolvers<void>();
      const validation = Promise.withResolvers<void>();
      const caughtReplacement = Promise.withResolvers<void>();
      const catchUp = vi.fn<AgentHostTransport['catchUp']>(async function* (): AsyncIterable<CatchUpFrame> {
        const recovering = catchUp.mock.calls.length > 1;
        const sourceGeneration = recovering ? 'replacement' : 'original';
        const captured =
          recovering && replacementEmpty ? [] : rows(recovering ? 'New validated reply' : 'Previous reply');
        if (captured.length > 0) {
          yield {
            type: 'page',
            answer: {
              status: 'batch',
              chatId,
              sourceGeneration,
              cursor: 0,
              nextCursor: captured.length,
              endCursor: captured.length,
              facts: captured.map((row) => compactRow(row)),
            },
          };
        }
        if (recovering) {
          caughtReplacement.resolve();
          await validation.promise;
        }
        yield {
          type: 'validated',
          health: { historyIntact: true, newerHistory: false, quarantined: false },
          position: {
            cursor: captured.length,
            sourceGeneration,
            ...(captured.length === 0 ? {} : { last: { leaderEpoch: 'g1', sequence: 3 } }),
          },
          observedEndCursor: captured.length,
        };
      });
      const read = vi.fn<AgentHostTransport['read']>(async (input) => {
        if (read.mock.calls.length === 1) {
          await reset.promise;
          return { status: 'refused', chatId, reason: 'identity-mismatch' };
        }
        await new Promise<void>((resolve) => {
          if (input.signal?.aborted) {
            resolve();
          } else {
            input.signal?.addEventListener(
              'abort',
              () => {
                resolve();
              },
              { once: true },
            );
          }
        });
        throw new DOMException('Read stopped', 'AbortError');
      });
      const client = createAgentHostClient({
        ready: Promise.resolve(),
        read,
        catchUp,
        async *liveEvents(_id, signal) {
          await new Promise<void>((resolve) => {
            signal.addEventListener(
              'abort',
              () => {
                resolve();
              },
              { once: true },
            );
          });
          yield* [];
        },
        execute: async () => {
          throw new Error('Recovery must not send a command.');
        },
        close: () => undefined,
      });
      const unpublish = store.publishProjectHostConnector(projectId, async () => client);
      const session = store.acquire(chatId, projectId);
      try {
        await vi.waitFor(() => {
          expect(JSON.stringify(session.messages)).toContain('Previous reply');
          expect(read).toHaveBeenCalledOnce();
          expect(store.historicalUsageReady(chatId, projectId)).toBe(true);
        });
        const { messages } = session.chat;
        const first = messages[0];
        reset.resolve();
        await vi.waitFor(() => {
          expect(store.getProjection(chatId)?.ledger.position.cursor).toBe(0);
          expect(store.historicalUsageReady(chatId, projectId)).toBe(false);
        });
        // Existing store/SDK boundary control: revoking authority must not overwrite mounted messages.
        expect(session.chat.messages).toBe(messages);
        expect(session.messages[0]).toBe(first);
        expect(store.getAttachmentStatus(chatId)).not.toBe('attached');
        expect(await store.steerProjectedRun(chatId, 'must not target the retired run')).toBe(false);
        expect(await store.cancelProjectedRun(chatId)).toBe('absent');
        await vi.waitFor(() => {
          expect(catchUp).toHaveBeenCalledTimes(2);
        });
        await caughtReplacement.promise;
        expect(session.chat.messages).toBe(messages);
        expect(store.getProjection(chatId)?.ledger.runs[runId]).toBeUndefined();
        expect(read).toHaveBeenCalledOnce();
        validation.resolve();
        await vi.waitFor(() => {
          expect(store.historicalUsageReady(chatId, projectId)).toBe(true);
          expect(store.getProjection(chatId)?.ledger.position.sourceGeneration).toBe('replacement');
          if (replacementEmpty) {
            expect(session.messages).toEqual([]);
          } else {
            expect(JSON.stringify(session.messages)).toContain('New validated reply');
            expect(JSON.stringify(session.messages)).not.toContain('Previous reply');
          }
        });
        expect(store.get(chatId)).toBe(session);
      } finally {
        reset.resolve();
        validation.resolve();
        store.release(chatId);
        unpublish();
        await client.close();
      }
    });
  }

  for (const nonempty of [false, true]) {
    it(`should withhold currentness and retain live ownership during a cursor-zero ${nonempty ? 'nonempty' : 'empty'} generation reset`, async () => {
      const chatId = 'chat_zero_generation_reset';
      const projectId = 'project_zero_generation_reset';
      const runId = 'run_zero_generation_reset';
      const store = new ChatSessionStore({ chatSession });
      const deps = createStubDeps();
      deps.getChat.mockResolvedValue(chatRow(chatId, projectId));
      store.setDependencies(deps);
      const rows = nonempty
        ? [
            ...runningRows(runId),
            logRow(2, {
              runId,
              type: 'message.appended',
              message: { id: 'zero-reply', role: 'assistant', content: 'New zero reply' },
            }),
            lifecycleRow(3, 'completed', runId),
          ]
        : [];
      const reset = Promise.withResolvers<void>();
      const validation = Promise.withResolvers<void>();
      let liveSignal: AbortSignal | undefined;
      const close = vi.fn();
      const catchUp = vi.fn<AgentHostTransport['catchUp']>(async function* (): AsyncIterable<CatchUpFrame> {
        const recovering = catchUp.mock.calls.length > 1;
        const sourceGeneration = recovering ? 'replacement-zero' : 'original-zero';
        const captured = recovering ? rows : [];
        if (captured.length > 0) {
          yield {
            type: 'page',
            answer: {
              status: 'batch',
              chatId,
              sourceGeneration,
              cursor: 0,
              nextCursor: captured.length,
              endCursor: captured.length,
              facts: captured.map((row) => compactRow(row)),
            },
          };
        }
        if (recovering) {
          await validation.promise;
        }
        yield {
          type: 'validated',
          health: { historyIntact: true, newerHistory: false, quarantined: false },
          position: {
            cursor: captured.length,
            sourceGeneration,
            ...(captured.length === 0 ? {} : { last: { leaderEpoch: 'g1', sequence: 3 } }),
          },
          observedEndCursor: captured.length,
        };
      });
      const read = vi.fn<AgentHostTransport['read']>(async (input) => {
        if (read.mock.calls.length === 1) {
          await reset.promise;
          return {
            status: 'batch',
            chatId,
            sourceGeneration: 'replacement-zero',
            sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
            cursor: 0,
            nextCursor: rows.length,
            endCursor: rows.length,
            events: rows,
          };
        }
        await new Promise<void>((resolve) => {
          if (input.signal?.aborted) {
            resolve();
          } else {
            input.signal?.addEventListener(
              'abort',
              () => {
                resolve();
              },
              { once: true },
            );
          }
        });
        throw new DOMException('Read stopped', 'AbortError');
      });
      const liveEvents = vi.fn<AgentHostTransport['liveEvents']>(async function* (_id, signal) {
        liveSignal = signal;
        await new Promise<void>((resolve) => {
          signal.addEventListener(
            'abort',
            () => {
              resolve();
            },
            { once: true },
          );
        });
        yield* [];
      });
      const client = createAgentHostClient({
        ready: Promise.resolve(),
        read,
        catchUp,
        liveEvents,
        close,
        execute: async () => {
          throw new Error('Read reset cannot send commands.');
        },
      });
      const unpublish = store.publishProjectHostConnector(projectId, async () => client);
      const session = store.acquire(chatId, projectId);
      let unsubscribe: () => void = () => undefined;
      try {
        await vi.waitFor(() => {
          expect(read).toHaveBeenCalledOnce();
          expect(store.historicalUsageReady(chatId, projectId)).toBe(true);
          expect(session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
        });
        const { messages } = session.chat;
        const snapshots: Array<{ current: boolean; attached: boolean }> = [];
        unsubscribe = store.subscribeProjection(chatId, () => {
          snapshots.push({
            current: store.historicalUsageReady(chatId, projectId),
            attached: store.getAttachmentStatus(chatId) === 'attached',
          });
        });
        reset.resolve();
        await vi.waitFor(() => {
          expect(catchUp).toHaveBeenCalledTimes(2);
        });
        await settle();
        expect.soft(snapshots.length).toBeGreaterThan(0);
        expect.soft(snapshots.some((snapshot) => snapshot.current || snapshot.attached)).toBe(false);
        expect.soft(store.historicalUsageReady(chatId, projectId)).toBe(false);
        expect.soft(liveSignal?.aborted).toBe(false);
        expect.soft(close).not.toHaveBeenCalled();
        expect.soft(session.chat.messages).toBe(messages);
        expect.soft(read).toHaveBeenCalledOnce();
        unsubscribe();
        validation.resolve();
        await vi.waitFor(() => {
          expect(store.historicalUsageReady(chatId, projectId)).toBe(true);
          expect(store.getProjection(chatId)?.ledger.position.sourceGeneration).toBe('replacement-zero');
          expect(store.getProjection(chatId)?.ledger.position.cursor).toBe(rows.length);
        });
        expect(liveEvents).toHaveBeenCalledOnce();
      } finally {
        unsubscribe();
        reset.resolve();
        validation.resolve();
        store.release(chatId);
        unpublish();
        await client.close();
      }
    });
  }

  it('materializes validated warm catch-up before and after delayed metadata hydration', async () => {
    const chatId = 'chat_validated_warm_hydration';
    const projectId = 'project_validated_warm_hydration';
    const runId = 'run_validated_warm_hydration';
    const store = new ChatSessionStore({ chatSession });
    const deps = createStubDeps();
    const metadata = Promise.withResolvers<ChatEntity>();
    const validation = Promise.withResolvers<void>();
    deps.getChat.mockResolvedValueOnce(chatRow(chatId, projectId)).mockReturnValue(metadata.promise);
    store.setDependencies(deps);
    const rows = [
      ...runningRows(runId),
      logRow(2, {
        runId,
        type: 'message.appended',
        message: { id: 'msg_validated_warm', role: 'assistant', content: 'Canonical warm reply' },
      }),
      lifecycleRow(3, 'completed', runId),
    ];
    let captures = 0;
    const catchUp = async function* (): AsyncIterable<CatchUpFrame> {
      captures += 1;
      const capture = captures;
      const sourceGeneration = capture === 1 ? 'warm-source' : 'fresh-warm-source';
      const capturedRows =
        capture === 1
          ? rows
          : [
              ...runningRows(runId),
              logRow(2, {
                runId,
                type: 'message.appended',
                message: { id: 'msg_validated_warm', role: 'assistant', content: 'Fresh validated warm reply' },
              }),
              lifecycleRow(3, 'completed', runId),
            ];
      yield {
        type: 'page',
        answer: {
          status: 'batch',
          chatId,
          sourceGeneration,
          cursor: 0,
          nextCursor: rows.length,
          endCursor: rows.length,
          facts: capturedRows.map((row) => compactRow(row)),
        },
      };
      if (capture === 2) {
        await validation.promise;
      }
      yield {
        type: 'validated',
        health: { historyIntact: true, newerHistory: false, quarantined: false },
        position: { cursor: rows.length, sourceGeneration, last: { leaderEpoch: 'g1', sequence: 3 } },
        observedEndCursor: rows.length,
      };
    };
    // The replaced source refuses the retained prefix; only its validated capture can establish authority.
    const read = vi.fn<AgentHostClient['read']>(async () => ({
      status: 'refused',
      chatId,
      reason: 'identity-mismatch',
    }));
    const subscribe = vi.fn<AgentHostClient['subscribe']>(() => () => undefined);
    const unpublish = store.publishProjectHostConnector(projectId, async () => ({
      hostCommand: vi.fn<AgentHostClient['hostCommand']>(),
      close: async () => undefined,
      catchUp,
      read,
      subscribe,
    }));
    try {
      const first = store.acquire(chatId, projectId);
      await vi.waitFor(() => {
        expect(first.messages.map((message) => message.id)).toEqual([runId]);
        expect(JSON.stringify(first.messages)).toContain('Canonical warm reply');
        expect(first.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
      });
      const expected = first.messages;
      store.release(chatId);
      expect(store.get(chatId)).toBeUndefined();
      const replacement = store.acquire(chatId, projectId);
      expect(replacement).not.toBe(first);
      await vi.waitFor(() => {
        expect(captures).toBe(2);
        expect(deps.getChat).toHaveBeenCalledTimes(2);
      });
      expect(replacement.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(true);
      metadata.resolve(chatRow(chatId, projectId));
      await vi.waitFor(() => {
        expect(replacement.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
        // The last validated projection remains displayable while fresh private pages are held.
        expect(replacement.messages).toEqual(expected);
      });
      // Displaying retained validated history must not certify current command or usage authority.
      expect(store.historicalUsageReady(chatId, projectId)).toBe(false);
      expect(read).toHaveBeenCalledExactlyOnceWith({
        chatId,
        cursor: rows.length,
        sourceGeneration: 'warm-source',
        last: { leaderEpoch: 'g1', sequence: 3 },
      });
      validation.resolve();
      await vi.waitFor(() => {
        expect(subscribe).toHaveBeenCalledTimes(2);
        expect(JSON.stringify(replacement.messages)).toContain('Fresh validated warm reply');
        expect(JSON.stringify(replacement.messages)).not.toContain('Canonical warm reply');
      });
      expect(replacement.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
      expect(JSON.stringify(replacement.chat.messages)).toContain('Fresh validated warm reply');
      expect(read).toHaveBeenCalledExactlyOnceWith({
        chatId,
        cursor: rows.length,
        sourceGeneration: 'warm-source',
        last: { leaderEpoch: 'g1', sequence: 3 },
      });
    } finally {
      validation.resolve();
      metadata.resolve(chatRow(chatId, projectId));
      store.release(chatId);
      unpublish();
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
        expect(deps.getChat).toHaveBeenCalledWith('chat_early_settlement', 'proj_a');
      });
      const runId = 'req_early_settlement';
      publishLogRows(store, 'chat_early_settlement', runningRows(runId));
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
      publishLogRows(store, 'chat_early_settlement', [lifecycleRow(2, 'completed', runId)], 2);

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
    const heard: Array<{
      type: string;
      runs: string[];
      stoppableRuns: string[];
    }> = [];
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

    publishLogRows(store, 'chat_history', [...runningRows('run_old'), lifecycleRow(2, 'completed', 'run_old')]);

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
    publishLogPage(store, 'chat_pages', runningRows(), { cursor: 0, endCursor: 3 });
    expect(actor.getSnapshot().matches({ run: 'idle' })).toBe(true);
    expect(project.heard).toEqual([]);

    publishLogRows(
      store,
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
    publishLogRows(store, chatId, [
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

  describe('bounded inactive projection retention (D25)', () => {
    const completedRows = (text = 'Completed') => [
      ...runningRows(),
      logRow(2, { type: 'message.appended', message: { id: 'answer', role: 'assistant', content: text } }),
      lifecycleRow(3, 'completed'),
    ];
    const retire = (store: StoreType, chatId: string, options: { projectId?: string; text?: string } = {}) => {
      const release = store.observe(chatId, options.projectId ?? 'project_retention');
      publishLogRows(store, chatId, completedRows(options.text));
      const projection = store.getProjection(chatId);
      expect(
        chunksOf(projection!.views['run_1']!.chunks).reduce(
          (length, chunk) => length + (chunk.type === 'text-delta' ? chunk.delta.length : 0),
          0,
        ),
      ).toBe((options.text ?? 'Completed').length);
      release();
      return projection;
    };

    it('evicts the oldest of five inactive projections and keeps a recently reopened projection warm', () => {
      const store = createStore();
      const projections = Array.from({ length: 5 }, (_, index) => retire(store, `retired_${String(index)}`));
      expect(store.getProjection('retired_0')).toBeUndefined();
      for (let index = 1; index < 5; index++) {
        expect(store.getProjection(`retired_${String(index)}`)).toBe(projections[index]);
      }
      const release = store.observe('retired_1', 'project_retention');
      expect(store.getProjection('retired_1')).toBe(projections[1]);
      release();
      retire(store, 'retired_5');
      expect(store.getProjection('retired_2')).toBeUndefined();
      expect(store.getProjection('retired_1')).toBe(projections[1]);
    });

    it('bounds aggregate representation weight before reaching the entry limit', () => {
      const store = createStore();
      for (let index = 0; index < 3; index++) {
        retire(store, `weighted_${String(index)}`, { text: 'x'.repeat(3 * 1024 * 1024) });
      }
      expect(store.getProjection('weighted_0')).toBeUndefined();
      expect(store.getProjection('weighted_2')).toBeDefined();
    });

    it('immediately evicts one oversized projection after its final observation releases', () => {
      const store = createStore();
      const release = store.observe('oversized', 'project_retention');
      publishLogRows(store, 'oversized', completedRows('x'.repeat(9 * 1024 * 1024)));
      expect(store.getProjection('oversized')).toBeDefined();
      release();
      expect(store.getProjection('oversized')).toBeUndefined();
    });

    it('preserves observed and mounted projections under pressure and retires after the final owner releases', () => {
      const store = createStore();
      const release = store.observe('observed', 'project_retention');
      publishLogRows(store, 'observed', completedRows());
      const observed = store.getProjection('observed');
      store.acquire('mounted', 'project_retention');
      publishLogRows(store, 'mounted', completedRows());
      const mounted = store.getProjection('mounted');
      for (let index = 0; index < 8; index++) {
        retire(store, `pressure_${String(index)}`);
      }
      expect(store.getProjection('observed')).toBe(observed);
      expect(store.getProjection('mounted')).toBe(mounted);
      store.release('mounted');
      release();
      expect(store.getProjection('mounted')).toBe(mounted);
      expect(store.getProjection('observed')).toBe(observed);
      for (let index = 8; index < 12; index++) {
        retire(store, `pressure_${String(index)}`);
      }
      expect(store.getProjection('mounted')).toBeUndefined();
      expect(store.getProjection('observed')).toBeUndefined();
    });

    it('keeps an admission-owned session and projection when its last view releases under pressure', async () => {
      const store = createStore();
      const session = store.acquire('admitting_retention', 'project_retention');
      startTurnOwner(store, 'project_retention');
      publishAdmission('admitting_retention', async () => Promise.withResolvers<never>().promise);
      void store.requestTurn('admitting_retention', { kind: 'regenerate' });
      await vi.waitFor(() => {
        expect(session.stateActorRef.getSnapshot().matches({ run: { queued: 'admitting' } })).toBe(true);
      });
      store.release('admitting_retention');
      for (let index = 0; index < 8; index++) {
        retire(store, `admission_pressure_${String(index)}`);
      }
      expect(store.get('admitting_retention')).toBe(session);
      expect(store.getProjection('admitting_retention')).toBeDefined();
    });

    it('pins an in-flight background command through deletion without implicit cancellation', async () => {
      const store = createStore();
      const chatId = 'background_retention';
      const projectId = 'project_retention';
      const message: MyUIMessage = { id: 'background_message', role: 'user', parts: [{ type: 'text', text: 'Work' }] };
      const command: HostCommand = {
        type: 'start',
        commandId: 'background_command',
        payload: {
          chatId,
          runId: 'background_run',
          message: { id: message.id, role: 'user', content: 'Work' },
          trigger: 'submit',
        },
      };
      const reply = Promise.withResolvers<CommandAnswer>();
      const hostCommand = vi.fn(async () => reply.promise);
      const unpublish = store.publishProjectHostConnector(projectId, async () =>
        mock<AgentHostClient>({
          catchUp: writerOwnedCatchUp,
          hostCommand,
          close: async () => undefined,
          subscribe: () => () => undefined,
          subscribeLive: () => () => undefined,
        }),
      );
      startTurnOwner(store, projectId);
      const session = store.acquire(chatId, projectId);
      publishAdmission(chatId, () => ({ kind: 'send', message, command }));
      const requested = store.requestTurn(chatId, { kind: 'send', message });
      await vi.waitFor(() => {
        expect(hostCommand).toHaveBeenCalledExactlyOnceWith(command);
      });
      store.release(chatId);
      await store.removeChat(chatId);
      for (let index = 0; index < 8; index++) {
        retire(store, `background_pressure_${String(index)}`);
      }
      expect(store.get(chatId)).toBe(session);
      expect(store.getProjection(chatId)).toBeDefined();
      expect(hostCommand).toHaveBeenCalledOnce();
      reply.resolve({ commandId: command.commandId, generation: 1, status: 'applied', effect: 'durable', cursor: 0 });
      await requested;
      unpublish();
    });

    it('does not retain unowned incomplete or paused runs indefinitely', () => {
      const store = createStore();
      const releaseIncomplete = store.observe('incomplete', 'project_retention');
      publishLogPage(store, 'incomplete', runningRows(), { cursor: 0, endCursor: 3 });
      releaseIncomplete();
      expect(store.getProjection('incomplete')).toBeUndefined();
      const releasePaused = store.observe('paused', 'project_retention');
      publishLogRows(store, 'paused', [...runningRows(), lifecycleRow(2, 'paused')]);
      releasePaused();
      for (let index = 0; index < 5; index++) {
        retire(store, `after_pause_${String(index)}`);
      }
      expect(store.getProjection('paused')).toBeUndefined();
    });

    it('requires fresh catchup after eviction and preserves projection topic subscribers', () => {
      const store = createStore();
      const notify = vi.fn();
      const unsubscribe = store.subscribeProjection('evicted', notify);
      retire(store, 'evicted');
      for (let index = 0; index < 4; index++) {
        retire(store, `newer_${String(index)}`);
      }
      expect(store.getProjection('evicted')).toBeUndefined();
      notify.mockClear();
      const release = store.observe('evicted', 'project_retention');
      expect(store.getProjection('evicted')?.ledger.position.cursor).toBe(0);
      expect(store.historicalUsageReady('evicted', 'project_retention')).toBe(false);
      publishLogRows(store, 'evicted', completedRows('Fresh answer'));
      expect(notify).toHaveBeenCalled();
      expect(store.getProjection('evicted')?.ledger.position.cursor).toBe(4);
      release();
      unsubscribe();
    });

    it('purges deleted inactive chats and projects without removing another project', async () => {
      const store = createStore();
      retire(store, 'deleted_chat');
      await store.removeChat('deleted_chat');
      expect(store.getProjection('deleted_chat')).toBeUndefined();
      retire(store, 'deleted_project_chat', { projectId: 'deleted_project' });
      const kept = retire(store, 'kept_project_chat', { projectId: 'kept_project' });
      await store.removeProject('deleted_project');
      expect(store.getProjection('deleted_project_chat')).toBeUndefined();
      expect(store.getProjection('kept_project_chat')).toBe(kept);
    });

    it('keeps deletion ineligible through delayed answers but permits a fresh same-id actor after release', async () => {
      const store = createStore();
      const release = store.observe('deleted_owned', 'project_retention');
      publishLogRows(store, 'deleted_owned', completedRows());
      await store.refreshRemoteSegments('deleted_owned', 'project_retention');
      expect(store.historicalUsageReady('deleted_owned', 'project_retention')).toBe(true);
      await store.removeChat('deleted_owned');
      publishLogRows(store, 'deleted_owned', [logRow(4, { type: 'unrecognized.future-event' })], 4);
      expect(store.historicalUsageReady('deleted_owned', 'project_retention')).toBe(false);
      await expect(store.getHistoricalUsage('deleted_owned')).rejects.toThrow(/superseded/iu);
      release();
      expect(store.getProjection('deleted_owned')).toBeUndefined();
      const releaseFresh = store.observe('deleted_owned', 'project_retention');
      publishLogRows(store, 'deleted_owned', completedRows('Newly created chat'));
      await store.refreshRemoteSegments('deleted_owned', 'project_retention');
      expect(store.historicalUsageReady('deleted_owned', 'project_retention')).toBe(true);
      await expect(store.getHistoricalUsage('deleted_owned')).resolves.toBeDefined();
      releaseFresh();
      expect(store.getProjection('deleted_owned')).toBeDefined();
    });

    it('refuses delayed validated attachment eligibility after deletion of an observed actor', async () => {
      const store = createStore();
      const chatId = 'deleted_capture';
      const validation = Promise.withResolvers<void>();
      const pageSent = Promise.withResolvers<void>();
      const rows = completedRows();
      const catchUp = async function* (): AsyncIterable<CatchUpFrame> {
        yield {
          type: 'page',
          answer: {
            status: 'batch',
            chatId,
            sourceGeneration: 'deleted-capture-source',
            cursor: 0,
            nextCursor: rows.length,
            endCursor: rows.length,
            facts: rows.map((row) => compactRow(row)),
          },
        };
        pageSent.resolve();
        await validation.promise;
        yield {
          type: 'validated',
          health: { historyIntact: true, newerHistory: false, quarantined: false },
          position: {
            cursor: rows.length,
            sourceGeneration: 'deleted-capture-source',
            last: { leaderEpoch: 'g1', sequence: 3 },
          },
          observedEndCursor: rows.length,
        };
      };
      const subscribe = vi.fn<AgentHostClient['subscribe']>(() => () => undefined);
      const unpublish = store.publishProjectHostConnector('project_retention', async () => ({
        catchUp,
        subscribe,
        read: vi.fn<AgentHostClient['read']>(),
        hostCommand: vi.fn<AgentHostClient['hostCommand']>(),
        close: async () => undefined,
      }));
      const release = store.observe(chatId, 'project_retention');
      try {
        await pageSent.promise;
        await store.removeChat(chatId);
        validation.resolve();
        await vi.waitFor(() => {
          expect(subscribe).toHaveBeenCalledOnce();
        });
        expect(store.getAttachmentStatus(chatId)).not.toBe('attached');
        expect(store.historicalUsageReady(chatId, 'project_retention')).toBe(false);
        await expect(store.getHistoricalUsage(chatId)).rejects.toThrow(/superseded/iu);
      } finally {
        validation.resolve();
        release();
        unpublish();
      }
      expect(store.getProjection(chatId)).toBeUndefined();
    });

    it('refuses an obsolete usage summary without clearing a reacquired summary', async () => {
      const store = createStore();
      const release = store.observe('usage_replaced', 'project_retention');
      publishLogRows(store, 'usage_replaced', completedRows('Old answer'));
      const oldSummary = store.getHistoricalUsage('usage_replaced');
      const rejected = expect(oldSummary).rejects.toThrow(/superseded/iu);
      release();
      const releaseCurrent = store.observe('usage_replaced', 'project_retention');
      publishLogRows(store, 'usage_replaced', [logRow(4, { type: 'unrecognized.future-event' })], 4);
      const current = store.getHistoricalUsage('usage_replaced');
      await rejected;
      const summary = await current;
      expect(await store.getHistoricalUsage('usage_replaced')).toBe(summary);
      releaseCurrent();
    });

    it('refuses an in-flight usage summary when its observed chat is deleted', async () => {
      const store = createStore();
      const release = store.observe('usage_deleted', 'project_retention');
      publishLogRows(store, 'usage_deleted', completedRows());
      const pending = store.getHistoricalUsage('usage_deleted');
      const rejected = expect(pending).rejects.toThrow(/superseded/iu);
      await store.removeChat('usage_deleted');
      await rejected;
      release();
      expect(store.getProjection('usage_deleted')).toBeUndefined();
    });
  });

  it('refreshes the presented middle assistant after a durable envelope correction with unchanged transcript edges', async () => {
    const store = createStore();
    const chatId = 'chat_middle_correction';
    const session = store.acquire(chatId, 'project_middle_correction');
    try {
      await vi.waitFor(() => {
        expect(session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
      });
      const rows = ['first', 'middle', 'last'].flatMap((name, index) => {
        const sequence = index * 4;
        const runId = `run_${name}`;
        return [
          lifecycleRow(sequence, 'admitted', runId),
          logRow(sequence + 1, {
            runId,
            type: 'message.appended',
            message: { id: `user_${name}`, role: 'user', content: `Question ${name}` },
          }),
          logRow(sequence + 2, {
            runId,
            type: 'message.appended',
            message: { id: `assistant_${name}`, role: 'assistant', content: `Answer ${name}` },
          }),
          lifecycleRow(sequence + 3, 'completed', runId),
        ];
      });
      publishLogRows(store, chatId, rows);
      await store.preparePresentation(chatId, new AbortController().signal);
      const original = session.messages;
      expect(original.map((message) => message.role)).toEqual([
        'user',
        'assistant',
        'user',
        'assistant',
        'user',
        'assistant',
      ]);
      const middleId = original[3]!.id;
      const before = store.getMessagePresentation(chatId);
      expect(before.messagesById.get(middleId)?.parts).toContainEqual(
        expect.objectContaining({ type: 'text', text: 'Answer middle' }),
      );

      publishLogRows(
        store,
        chatId,
        [
          logRow(12, {
            runId: 'run_middle',
            type: 'message.envelope-replaced',
            messageId: 'assistant_middle',
            replacement: { id: 'assistant_middle', role: 'assistant', content: 'Corrected durable answer' },
          }),
        ],
        12,
      );
      await store.preparePresentation(chatId, new AbortController().signal);

      expect(session.messages).toHaveLength(original.length);
      expect(session.messages[0]).toBe(original[0]);
      expect(session.messages.at(-1)).toBe(original.at(-1));
      expect(session.messages.find((message) => message.id === middleId)?.parts).toContainEqual(
        expect.objectContaining({ type: 'text', text: 'Corrected durable answer' }),
      );
      const after = store.getMessagePresentation(chatId);
      expect(after.messagesById.get(middleId)?.parts).toContainEqual(
        expect.objectContaining({ type: 'text', text: 'Corrected durable answer' }),
      );
      expect(after.order).toEqual(before.order);
      expect(after.groups).toEqual(before.groups);
    } finally {
      store.release(chatId);
    }
  });

  it('keeps structural and command selections stable across a long text-only stream', () => {
    const store = createStore();
    const session = store.acquire('chat_presented', 'project_1');
    let indexedReads = 0;
    const messages = new Proxy(
      Array.from(
        { length: 1000 },
        (_, index): MyUIMessage => ({
          id: `message-${String(index)}`,
          role: index % 2 === 0 ? 'user' : 'assistant',
          parts: [{ type: 'text', text: 'first' }],
        }),
      ),
      {
        get(target, key, receiver) {
          if (typeof key === 'string' && /^\d+$/.test(key)) {
            indexedReads++;
          }
          // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- Proxy's Reflect.get is dynamically typed.
          return Reflect.get(target, key, receiver) as unknown;
        },
      },
    );
    session.chat.messages = messages;
    const before = store.getMessagePresentation('chat_presented');
    const replaceTail = (parts: MyUIMessage['parts']): void => {
      const tail = messages.at(-1);
      if (tail === undefined) {
        throw new Error('Missing transcript tail');
      }
      messages[messages.length - 1] = { ...tail, parts };
    };
    indexedReads = 0;
    replaceTail([{ type: 'text', text: 'next token' }]);
    indexedReads = 0;
    const after = store.getMessagePresentation('chat_presented');
    expect(after.order).toBe(before.order);
    expect(after.groups).toBe(before.groups);
    expect(after.agentInvocations).toBe(before.agentInvocations);
    expect(indexedReads).toBeLessThan(10);

    const acp = (name: string): MyUIMessage['parts'][number] => ({
      type: 'data-acp-session',
      data: {
        type: 'acp-session',
        id: 'session-1',
        agentId: 'codex',
        commands: [{ name, description: '' }],
        configOptions: [],
      },
    });
    replaceTail([acp('help')]);
    expect(store.getMessagePresentation('chat_presented').agentInvocations).toBe('/help');
    replaceTail([acp('next')]);
    expect(store.getMessagePresentation('chat_presented').agentInvocations).toBe('/next');

    messages.push({ id: 'new-user', role: 'user', parts: [{ type: 'text', text: 'next turn' }] });
    const appended = store.getMessagePresentation('chat_presented');
    expect(appended.order.at(-1)).toBe('new-user');
    expect(appended.groups.at(-1)?.messageIds).toEqual(['new-user']);
    store.release('chat_presented');
  });

  it('retains completed active-message parts while accepting a changed earlier part', () => {
    const store = createStore();
    const session = store.acquire('chat_parts', 'project_1');
    const first: MyUIMessage = {
      id: 'assistant',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Completed paragraph', state: 'done' },
        { type: 'text', text: 'Live', state: 'streaming' },
      ],
    };
    session.chat.messages = [first];
    const before = store.getMessagePresentation('chat_parts').messagesById.get('assistant')!;
    session.chat.messages = [
      {
        ...first,
        parts: [{ ...first.parts[0]! }, { type: 'text', text: 'Live grows', state: 'streaming' }],
      },
    ];
    const next = store.getMessagePresentation('chat_parts').messagesById.get('assistant')!;
    expect(next.parts[0]).toBe(before.parts[0]);
    expect(next.parts[1]).not.toBe(before.parts[1]);
    session.chat.messages = [
      {
        ...first,
        parts: [{ type: 'text', text: 'Corrected earlier paragraph', state: 'done' }, next.parts[1]!],
      },
    ];
    const corrected = store.getMessagePresentation('chat_parts').messagesById.get('assistant')!;
    expect(corrected.parts[0]).not.toBe(before.parts[0]);
    expect(corrected.parts[1]).toBe(next.parts[1]);
    store.release('chat_parts');
  });

  it('snapshots mutable SDK tail parts while retaining unchanged renderer identities', () => {
    const store = createStore();
    const session = store.acquire('chat_mutable_tail', 'project_1');
    const raw: MyUIMessage = {
      id: 'assistant',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Completed paragraph', state: 'done' },
        { type: 'reasoning', text: 'alpha', state: 'streaming' },
      ],
    };
    session.chat.messages = [raw];
    const before = store.getMessagePresentation('chat_mutable_tail');
    const prior = before.messagesById.get('assistant')!;
    const part = raw.parts[1];
    if (part?.type !== 'reasoning') {
      throw new Error('Missing live reasoning');
    }
    part.text = 'alpha beta';
    const after = store.getMessagePresentation('chat_mutable_tail');
    const next = after.messagesById.get('assistant')!;
    expect(prior.parts[1]).toMatchObject({ text: 'alpha' });
    expect(next.parts[1]).toMatchObject({ text: 'alpha beta' });
    expect(next).not.toBe(prior);
    expect(next.parts[0]).toBe(prior.parts[0]);
    expect(after.order).toBe(before.order);
    expect(after.groups).toBe(before.groups);
    expect(store.getMessagePresentation('chat_mutable_tail').messagesById.get('assistant')).toBe(next);
    part.text = 'alpha beta final';
    session.chat.messages = [raw, { id: 'next-user', role: 'user', parts: [{ type: 'text', text: 'Next turn' }] }];
    const promoted = store.getMessagePresentation('chat_mutable_tail').messagesById.get('assistant')!;
    expect(promoted.parts[1]).toMatchObject({ text: 'alpha beta final' });
    expect(promoted.parts[0]).toBe(next.parts[0]);
    expect(next.parts[1]).toMatchObject({ text: 'alpha beta' });
    store.release('chat_mutable_tail');
  });

  it('derives funded operation IDs and tokens from a foreign accepted host log', async () => {
    const client = createMemoryClient();
    const store = new ChatSessionStore({ chatSession });
    store.setDependencies(createStubDeps(client));
    const unobserve = store.observe('chat_usage', 'project_1');
    const rows = [
      ...runningRows(),
      logRow(2, {
        type: 'message.appended',
        message: {
          id: 'assistant-usage',
          role: 'assistant',
          content: [{ type: 'text', text: 'Done' }],
          metadata: {
            model: 'test-model',
            usage: {
              input: 12,
              output: 7,
              cacheRead: 3,
              cacheWrite: 2,
              totalTokens: 24,
              cost: { input: 0.12, output: 0.07, cacheRead: 0.03, cacheWrite: 0.02, total: 0.24 },
            },
            tauInternal: {
              kind: 'billing-invocation',
              operationId: 'operation-1',
              attemptId: 'attempt-1',
              status: 'terminal',
            },
          },
        },
      }),
      lifecycleRow(3, 'completed'),
    ];
    client.files.set(
      '/projects/project_1/.tau/chats/chat_usage/events/foreign.jsonl',
      new TextEncoder().encode(`${rows.map((row) => JSON.stringify(row)).join('\n')}\n`),
    );
    expect(store.historicalUsageReady('chat_usage', 'project_1')).toBe(false);
    publishLogRows(store, 'chat_usage', []);
    await store.refreshRemoteSegments('chat_usage', 'project_1');
    expect(store.historicalUsageReady('chat_usage', 'project_1')).toBe(true);
    expect(
      chunksOf(store.getProjection('chat_usage')?.remote?.views['run_1']?.chunks).map((chunk) => chunk.type),
    ).toContain('data-usage');
    const first = await store.getHistoricalUsage('chat_usage');
    expect(first).toMatchObject({
      operationIds: ['operation-1'],
      inputTokens: 12,
      outputTokens: 7,
      cacheReadTokens: 3,
      cacheWriteTokens: 2,
      parts: 1,
    });
    const priorProjection = store.getProjection('chat_usage');
    publishLogRows(store, 'chat_usage', [logRow(0, { type: 'unrecognized.future-event' })]);
    expect(store.getProjection('chat_usage')).not.toBe(priorProjection);
    expect(await store.getHistoricalUsage('chat_usage')).toBe(first);
    unobserve();
  });

  it('routes accepted user activity through the current dependency set', async () => {
    const store = new ChatSessionStore({ chatSession });
    const deps = createStubDeps();
    store.setDependencies(deps);

    await store.touchChatRecency('chat_activity', 123);

    expect(deps.touchChatRecency).toHaveBeenCalledWith('chat_activity', 123);
  });

  it('acknowledges foreign watches before reading and fences a held read across a burst and final release', async () => {
    const store = new ChatSessionStore({ chatSession });
    const client = createMemoryClient();
    const path = '/projects/project/.tau/chats/chat_foreign/events/peer.jsonl';
    const bytes = (text: string): Uint8Array<ArrayBuffer> => {
      const message = { id: 'user', role: 'user', content: text };
      return new TextEncoder().encode(
        [
          {
            ...lifecycleRow(0, 'admitted'),
            admission: { kind: 'tau', turnId: message.id, message },
          },
          lifecycleRow(1, 'running'),
          lifecycleRow(2, 'completed'),
        ]
          .map((row) => JSON.stringify(row))
          .join('\n'),
      );
    };
    client.files.set(path, bytes('Old input'));
    const ready = Promise.withResolvers<void>();
    const closed = Promise.withResolvers<void>();
    const held = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    const readFile = client.readFile.bind(client);
    let first = true;
    client.readFile = vi.fn(async (selected: string) => {
      if (first && selected === path) {
        first = false;
        return held.promise;
      }
      return readFile(selected);
    });
    let listener: ((event: WatchEvent) => void) | undefined;
    const dispose = vi.fn(() => {
      closed.resolve();
    });
    const watchRecordFile = vi.fn((_directory: string, callback: (event: WatchEvent) => void) => {
      listener = callback;
      return { ready: ready.promise, closed: closed.promise, dispose };
    });
    store.setDependencies({ ...createStubDeps(client), watchRecordFile });
    const published: string[] = [];
    const unsubscribe = store.subscribeProjection('chat_foreign', () => {
      const part = store.getProjection('chat_foreign')?.remote?.views['run_1']?.user?.parts[0];
      if (part?.type === 'text') {
        published.push(part.text);
      }
    });
    const release = store.observe('chat_foreign', 'project');
    await settle();
    expect(client.readFile).not.toHaveBeenCalled();
    ready.resolve();
    await vi.waitFor(() => {
      expect(client.readFile).toHaveBeenCalledOnce();
    });
    client.files.set(path, bytes('Current input'));
    for (let index = 0; index < 100; index++) {
      listener?.({
        type: 'change',
        path: '.tau/chats/chat_foreign/events/peer.jsonl',
      });
      // Deliver separate event-loop ticks while the first read remains held.
      // eslint-disable-next-line no-await-in-loop -- Each fact must arrive in its own tick during the held read.
      await Promise.resolve();
    }
    held.resolve(bytes('Old input'));
    await vi.waitFor(() => {
      expect(published).toEqual(['Current input']);
    });
    expect(client.readFile).toHaveBeenCalledTimes(2);
    release();
    expect(dispose).toHaveBeenCalledOnce();
    listener?.({ type: 'reset' });
    await settle();
    expect(client.readFile).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('updates the active tool name from the log when counts stay unchanged (PV-S7)', () => {
    const store = createStore();
    const session = store.acquire('chat_tool_name', 'project_1');
    const actor = session.stateActorRef;
    const toolRow = (sequence: number, message: Readonly<{ role: string; toolCallId: string; toolName: string }>) =>
      logRow(sequence, {
        type: 'message.appended',
        message: {
          id: `m${String(sequence)}`,
          content: {},
          ...message,
          ...(message.role === 'tool-output' ? { isError: false } : {}),
        },
      });

    publishLogRows(store, 'chat_tool_name', [
      ...runningRows(),
      toolRow(2, { role: 'tool-input', toolCallId: 'tool_1', toolName: 'search' }),
    ]);
    expect(actor.getSnapshot().context).toMatchObject({ toolsInFlight: 1, toolName: 'search' });

    publishLogRows(
      store,
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
    const ended = (store: StoreType, chatId: string, state: string): void => {
      publishLogRows(store, chatId, [...runningRows(), lifecycleRow(2, state)]);
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

      ended(store, 'chat_success', 'completed');
      ended(store, 'chat_error', 'failed');
      ended(store, 'chat_cancelled', 'cancelled');

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

      publishLogRows(store, 'chat_approval', [...runningRows(), requested]);

      expect(store.isUnread('chat_approval')).toBe(true);
    });

    /* L3 D1: an empty resume appends no row. With W0.2's guard reverted the SDK finishes that request, and a store
     * that marked unread on the request's finish marked a chat nothing ran in. */
    it('never marks unread for an empty resume, even when the SDK finishes its request', async () => {
      const { store } = storeInProject();
      store.acquire('chat_opened', projectId);
      store.focusChat('chat_opened');
      ended(store, 'chat_opened', 'completed');
      expect(store.isUnread('chat_opened')).toBe(false);
      store.focusChat('chat_next');
      store.blurChat('chat_opened');

      /* The resume replays the rows the projection already holds, then the SDK walks submitted → ready. */
      ended(store, 'chat_opened', 'completed');
      finishRun(harness.created[0]!);
      await settle();

      expect(store.isUnread('chat_opened')).toBe(false);
    });

    it('reads a chat the person is looking at through each new attention row, writing that row as its receipt', async () => {
      const { store, deps } = storeInProject();
      store.acquire('chat_active', projectId);
      store.focusChat('chat_active');

      publishLogRows(store, 'chat_active', [...runningRows(), requested]);
      publishLogRows(store, 'chat_active', [lifecycleRow(3, 'completed')], 3);

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

      ended(store, 'chat_listed', 'completed');

      expect(store.isUnread('chat_listed')).toBe(true);
    });

    it('marks a run that ends while its focused view is hidden, and clears it when the person looks', async () => {
      vi.stubGlobal('document', { visibilityState: 'hidden', hasFocus: () => false });
      const { store, deps } = storeInProject();
      store.acquire('chat_hidden', projectId);
      store.focusChat('chat_hidden');

      ended(store, 'chat_hidden', 'completed');
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
        store,
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

      admission.resolve({ kind: 'regenerate' });
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

    it('keeps replacement listener buckets when the retired session unsubscribes late', () => {
      const store = createStore();
      store.acquire('chat_a', 'project_test');
      const stale = vi.fn();
      const staleProjection = vi.fn();
      const unsubscribeStale = store.subscribeChat('chat_a', stale);
      const unsubscribeStaleProjection = store.subscribeProjection('chat_a', staleProjection);
      store.release('chat_a');

      store.acquire('chat_a', 'project_test');
      const replacement = harness.created.at(-1)!;
      const fresh = vi.fn();
      const freshProjection = vi.fn();
      const unsubscribeFresh = store.subscribeChat('chat_a', fresh);
      const unsubscribeFreshProjection = store.subscribeProjection('chat_a', freshProjection);
      try {
        unsubscribeStale();
        unsubscribeStaleProjection();
        replacement.emitMessagesChange();
        expect(fresh).toHaveBeenCalledTimes(1);
        publishLogRows(store, 'chat_a', runningRows());
        expect(freshProjection).toHaveBeenCalledTimes(1);
        expect(stale).not.toHaveBeenCalled();
        expect(staleProjection).not.toHaveBeenCalled();
      } finally {
        unsubscribeFresh();
        unsubscribeFreshProjection();
        store.release('chat_a');
      }
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
      publishLogRows(store, chatId, [
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

      const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      store.stopRun(chatId, 'stop-button');
      await vi.waitFor(() => {
        expect(hostCommand).toHaveBeenCalledTimes(1);
      });
      const cancel = hostCommand.mock.calls[0]?.[0];
      expect(cancel?.type).toBe('cancel');
      /* The host labels every cancel USER_STOPPED; only this line says which gesture sent it. */
      expect(info).toHaveBeenCalledWith('[ChatSessionStore] host cancel', {
        chatId,
        runId,
        commandId: cancel?.commandId,
        origin: 'stop-button',
      });
      info.mockRestore();
      expect(session.draftActorRef.getSnapshot().context.draftText).toBe('');

      publishLogRows(store, chatId, [lifecycleRow(3, 'cancelled', runId)], 3);
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
      publishLogRows(store, chatId, [
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

      store.stopRun(chatId, 'stop-shortcut');
      await vi.waitFor(() => {
        expect(hostCommand).toHaveBeenCalledTimes(1);
      });
      publishLogRows(store, chatId, [lifecycleRow(4, 'cancelled', runId)], 4);
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

      expect(deps.getChat).toHaveBeenCalledWith('chat_a', 'resource_1');
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

    it('clears hydrated history only after an authoritative empty host answer', async () => {
      const store = new ChatSessionStore({ chatSession });
      const deps = createStubDeps();
      const previous: MyUIMessage = {
        id: 'obsolete-user',
        role: 'user',
        parts: [{ type: 'text', text: 'Old source' }],
      };
      deps.getChat.mockResolvedValue(chatRow('chat_verified_empty', 'project_1', { messages: [previous] }));
      store.setDependencies(deps);
      const session = store.acquire('chat_verified_empty', 'project_1');
      await settle();
      expect(session.chat.messages).toEqual([previous]);
      publishLogPage(store, 'chat_verified_empty', [], { cursor: 0, endCursor: 0 });
      await vi.waitFor(() => {
        expect(session.chat.messages).toEqual([]);
      });
      store.release('chat_verified_empty');
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
  type SelectedModel = {
    readonly name: string;
    readonly support: ModelSupport;
  };
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
    publishLogRows(first.store, chatId, log);
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
    publishLogRows(second.store, chatId, log);
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
    publishLogRows(store, chatId, runningRows(runId));
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

    publishLogRows(store, chatId, [...runningRows(), lifecycleRow(2, 'completed')]);
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
    publishLogRows(first.store, chatId, [...runningRows(), lifecycleRow(2, 'completed')]);
    expect(first.store.isUnread(chatId)).toBe(true);
    first.store.release(chatId);

    const second = openStore(client);
    second.store.acquire(chatId, projectId);
    const woke = vi.fn();
    second.store.subscribeUnread(woke);
    publishLogRows(second.store, chatId, [...runningRows(), lifecycleRow(2, 'completed')]);

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
