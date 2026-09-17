// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- mock for AI SDK's Chat / DefaultChatTransport classes uses the SDK's own PascalCase names and `~`-prefixed subscriber method names verbatim so the mock surface matches the real one. */
/* eslint-disable @typescript-eslint/explicit-member-accessibility -- mock class constructors omit the `public` keyword to mirror the AI SDK's published shape. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor } from 'xstate';
import type { Chat as ChatEntity, ModelSupport, MyUIMessage } from '@taucad/chat';
import type * as AiSdk from 'ai';
import { chatTurnRequestSchema } from '@taucad/chat/schemas';
import type { AgentHostClient } from '#services/agent-host-client.js';
import { clearLedger, recordRpcOutcome } from '#services/rpc-ledger.js';
import { chatSessionMachine } from '#machines/chat-session.machine.js';
import { sha256Bytes } from '@taucad/utils/hash';
import { uint8ArrayToBase64 } from 'uint8array-extras';
import type { ChatSessionActorRef } from '#machines/chat-session.machine.js';
import type { ProjectSessionActorRef } from '#machines/project-session.machine.js';

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
const { attachmentSendBlockReason, buildUserMessage } = await import('#utils/chat.utils.js');
const { bindDurableChatRun, sharedChatTransport } = await import('#chat-clients/_internal/shared-chat-transport.js');
const { recordHostFinalizedTurn, recordHostTurnSettlement, registerAgentHost } =
  await import('#chat-clients/_internal/browser-agent-host-transport.js');
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

function createStore(): StoreType {
  const store = new ChatSessionStore();
  store.setDependencies(createStubDeps());
  return store;
}

/** A host whose run ended on the one failure a resume is allowed to continue. */
function refusedAgentHostClient(chatId: string, runId: string): AgentHostClient {
  return {
    start: vi.fn(),
    steer: vi.fn(),
    cancel: vi.fn(),
    resume: vi.fn(),
    resolveInterrupt: vi.fn(),
    attach: vi.fn(async () => ({
      cursor: 0,
      nextCursor: 0,
      endCursor: 0,
      events: [],
      snapshot: {
        chatId,
        runId,
        turnId: 'm_user',
        state: 'failed',
        messages: [],
        failure: {
          code: 'INSUFFICIENT_CREDIT',
          message: 'Insufficient Tau credit for this model request.',
          status: 402,
          details: {
            requiredCreditAtoms: '3084332',
            availableCreditAtoms: '1000000',
            routeId: 'openai-gpt-6-astra',
          },
        },
      } as const,
    })),
    tail: vi.fn(async () => ({ cursor: 0, nextCursor: 0, endCursor: 0, events: [] })),
    subscribe: vi.fn(() => () => undefined),
    close: vi.fn(async () => undefined),
  };
}

const testRunBody = Object.freeze({
  agent: Object.freeze({
    profile: 'cad',
    execution: Object.freeze({ kind: 'tau', model: 'openai-gpt-5.5' }),
    kernel: 'replicad',
    mode: 'agent',
    toolChoice: 'auto',
    testingEnabled: true,
  }),
  projectId: 'project_test',
  execution: Object.freeze({
    hostId: 'host_test',
    workspaceId: 'workspace_test',
    baseRevisionId: 'revision_test',
  }),
  admission: Object.freeze({ version: 1, idempotencyKey: 'req_test_chat_session_store' }),
});

describe('ChatSessionStore — run accounting per project (R2)', () => {
  /**
   * A project session, reduced to what the store sends it.
   *
   * The real machine is driven in `project-session.machine.test.ts`; what this
   * pin is about is *which* session hears a run start and settle.
   */
  const fakeSession = (projectId: string) => {
    const heard: Array<{ type: string; chatId?: string }> = [];
    return {
      projectId,
      heard,
      ref: {
        send: (event: { type: string; chatId?: string }) => {
          heard.push(event);
        },
        getSnapshot: () => ({ context: { chatRefs: {} } }),
      } as unknown as Parameters<StoreType['setProjectSession']>[1],
    };
  };

  it('sends a settling run to the chat’s own project, not the focused one', async () => {
    const store = createStore();
    const projectA = fakeSession('proj_a');
    const projectB = fakeSession('proj_b');

    store.setProjectSession('proj_a', projectA.ref);
    store.setFocusedProject('proj_a');
    store.acquire('chat-a');
    const fake = harness.created.find((entry) => entry.id === 'chat-a')!;
    fake.status = 'streaming';
    fake.emitStatusChange();

    /* The person navigates to B while A's run is still going. */
    store.setProjectSession('proj_b', projectB.ref);
    store.setFocusedProject('proj_b');
    fake.status = 'ready';
    fake.emitStatusChange();

    expect(projectA.heard.filter((event) => event.type === 'runSettled')).toEqual([
      { type: 'runSettled', chatId: 'chat-a' },
    ]);
    expect(projectB.heard.filter((event) => event.type === 'runSettled')).toEqual([]);
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

    expect(projectA.heard).toContainEqual({ type: 'openChat', chatId: 'chat-a' });
    expect(projectB.heard).not.toContainEqual({ type: 'openChat', chatId: 'chat-a' });
    store.release('chat-a');
    store.setProjectSession('proj_a', undefined);
    store.setProjectSession('proj_b', undefined);
  });

  it('rebinds a chat acquired during a focus switch to its durable project before the run starts', async () => {
    const store = new ChatSessionStore();
    const deps = createStubDeps();
    let resolveLoadedChat!: (chat: ChatEntity) => void;
    const loadedChat = new Promise<ChatEntity>((resolve) => {
      resolveLoadedChat = resolve;
    });
    deps.getChat.mockImplementation(async () => loadedChat);
    store.setDependencies(deps);

    const boundSession = (projectId: string) => {
      const heard: Array<{ type: string; chatId?: string }> = [];
      const chatRef = { send: vi.fn() } as unknown as ChatSessionActorRef;
      const chatReferences = new Map<string, ChatSessionActorRef>();
      const ref = {
        send: (event: { type: string; chatId?: string }) => {
          heard.push(event);
          if (event.type === 'openChat' && event.chatId !== undefined) {
            chatReferences.set(event.chatId, chatRef);
          } else if (event.type === 'chatClosed' && event.chatId !== undefined) {
            chatReferences.delete(event.chatId);
          }
        },
        getSnapshot: () => ({ context: { chatRefs: Object.fromEntries(chatReferences) } }),
      } as unknown as ProjectSessionActorRef;
      return { projectId, heard, chatRef, ref };
    };
    const projectA = boundSession('proj_a');
    const projectB = boundSession('proj_b');
    store.setProjectSession('proj_a', projectA.ref);
    store.setProjectSession('proj_b', projectB.ref);
    store.setFocusedProject('proj_b');

    /* React renders A's new chat before ProjectSessionBinding's focus effect
     * runs, so acquisition still sees B. The durable chat row is the first
     * authoritative ownership fact available to the store. */
    const session = store.acquire('chat_a');
    expect(session.stateActorRef).toBe(projectB.chatRef);
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
      expect(session.stateActorRef).toBe(projectA.chatRef);
    });
    const fake = harness.created.find((entry) => entry.id === 'chat_a')!;
    fake.status = 'streaming';
    fake.emitStatusChange();

    expect(projectB.heard).toContainEqual({ type: 'chatClosed', chatId: 'chat_a' });
    expect(projectA.heard).toContainEqual({ type: 'openChat', chatId: 'chat_a' });
    expect(projectA.heard).toContainEqual({ type: 'runStarted', chatId: 'chat_a' });
    expect(projectB.heard).not.toContainEqual({ type: 'runStarted', chatId: 'chat_a' });
    store.release('chat_a');
    store.setProjectSession('proj_a', undefined);
    store.setProjectSession('proj_b', undefined);
  });

  it('should ignore a delayed hydration after the session is released', async () => {
    const store = new ChatSessionStore();
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
      store.acquire('chat_delayed_release');
      await vi.waitFor(() => {
        expect(deps.getChat).toHaveBeenCalledWith('chat_delayed_release');
      });
      store.release('chat_delayed_release');
      resolveLoadedChat({
        id: 'chat_delayed_release',
        resourceId: 'proj_a',
        name: 'Released chat',
        messages: [],
        createdAt: 0,
        updatedAt: 0,
      });
      await loadedChat;
      await Promise.resolve();
      await Promise.resolve();

      expect(store.get('chat_delayed_release')).toBeUndefined();
      expect(projectA.heard).toEqual([]);
      expect(projectB.heard).toEqual([
        { type: 'openChat', chatId: 'chat_delayed_release' },
        { type: 'chatClosed', chatId: 'chat_delayed_release' },
      ]);
    } finally {
      store.setProjectSession('proj_a', undefined);
      store.setProjectSession('proj_b', undefined);
    }
  });

  it('should not let a released hydration close a reacquired replacement', async () => {
    const store = new ChatSessionStore();
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
      const released = store.acquire('chat_reacquired');
      await vi.waitFor(() => {
        expect(deps.getChat).toHaveBeenCalledTimes(1);
      });
      store.release('chat_reacquired');
      const replacement = store.acquire('chat_reacquired');
      await vi.waitFor(() => {
        expect(deps.getChat).toHaveBeenCalledTimes(2);
      });
      expect(replacement).not.toBe(released);

      resolveFirstLoad({
        id: 'chat_reacquired',
        resourceId: 'proj_a',
        name: 'Reacquired chat',
        messages: [],
        createdAt: 0,
        updatedAt: 0,
      });
      await firstLoad;
      await Promise.resolve();
      await Promise.resolve();

      expect(store.get('chat_reacquired')).toBe(replacement);
      expect(projectA.heard).toEqual([]);
      expect(projectB.heard).toEqual([
        { type: 'openChat', chatId: 'chat_reacquired' },
        { type: 'chatClosed', chatId: 'chat_reacquired' },
        { type: 'openChat', chatId: 'chat_reacquired' },
      ]);
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

  it('should bind admission before an early settlement arrives during hydration', async () => {
    const store = new ChatSessionStore();
    const deps = createStubDeps();
    let resolveLoadedChat!: (chat: ChatEntity) => void;
    const loadedChat = new Promise<ChatEntity>((resolve) => {
      resolveLoadedChat = resolve;
    });
    deps.getChat.mockImplementation(async () => loadedChat);
    store.setDependencies(deps);

    const realSession = (projectId: string) => {
      const heard: Array<{ type: string; chatId?: string }> = [];
      const chatReferences = new Map<string, ChatSessionActorRef>();
      const ref = mock<ProjectSessionActorRef>();
      const snapshot = mock<ReturnType<ProjectSessionActorRef['getSnapshot']>>();
      Object.defineProperty(snapshot, 'context', {
        get: () => ({ chatRefs: Object.fromEntries(chatReferences) }),
      });
      vi.mocked(ref.send).mockImplementation((event) => {
        heard.push(event);
        if (event.type === 'openChat' && !chatReferences.has(event.chatId)) {
          chatReferences.set(
            event.chatId,
            createActor(chatSessionMachine, { input: { chatId: event.chatId, projectId } }).start(),
          );
        } else if (event.type === 'chatClosed') {
          chatReferences.get(event.chatId)?.stop();
          chatReferences.delete(event.chatId);
        }
      });
      vi.mocked(ref.getSnapshot).mockReturnValue(snapshot);
      return { heard, chatReferences, ref };
    };
    const projectA = realSession('proj_a');
    const projectB = realSession('proj_b');
    store.setProjectSession('proj_a', projectA.ref);
    store.setProjectSession('proj_b', projectB.ref);
    store.setFocusedProject('proj_b');

    try {
      const session = store.acquire('chat_early_settlement');
      await vi.waitFor(() => {
        expect(deps.getChat).toHaveBeenCalledWith('chat_early_settlement');
      });
      const runId = 'req_early_settlement';
      store.startRun('chat_early_settlement', {
        ...testRunBody,
        projectId: 'proj_a',
        admission: { version: 1, idempotencyKey: runId },
      });
      const fake = harness.created.find((entry) => entry.id === 'chat_early_settlement')!;
      fake.status = 'streaming';
      fake.emitStatusChange();
      recordHostFinalizedTurn({
        type: 'turn.finalized',
        turnId: 'turn_early_settlement',
        runId,
        chatId: 'chat_early_settlement',
        projectId: 'proj_a',
        checkoutId: 'live',
        changedPaths: [],
        trigger: 'turn',
        runIds: [runId],
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
      fake.status = 'ready';
      fake.emitStatusChange();

      const chatA = projectA.chatReferences.get('chat_early_settlement');
      expect(chatA?.getSnapshot().matches({ run: 'done' })).toBe(true);
      expect(projectA.heard.filter((event) => event.type === 'runStarted')).toEqual([
        { type: 'runStarted', chatId: 'chat_early_settlement' },
      ]);
      expect(projectA.heard.filter((event) => event.type === 'runSettled')).toEqual([
        { type: 'runSettled', chatId: 'chat_early_settlement' },
      ]);
      expect(projectB.heard.filter((event) => event.type === 'runStarted' || event.type === 'runSettled')).toEqual([]);
    } finally {
      store.endRun('chat_early_settlement');
      store.release('chat_early_settlement');
      store.setProjectSession('proj_a', undefined);
      store.setProjectSession('proj_b', undefined);
      for (const actor of [...projectA.chatReferences.values(), ...projectB.chatReferences.values()]) {
        actor.stop();
      }
    }
  });
});

describe('ChatSessionStore — host-attested settlement (P71)', () => {
  const sessionProjectRef = (chatId: string, actor: ChatSessionActorRef) => {
    const ref = mock<ProjectSessionActorRef>();
    const chatReferences: Record<string, ChatSessionActorRef> = {};
    const snapshot = mock<ReturnType<ProjectSessionActorRef['getSnapshot']>>({
      context: { chatRefs: chatReferences },
    });
    chatReferences[chatId] = actor;
    vi.mocked(ref.getSnapshot).mockReturnValue(snapshot);
    return ref;
  };

  it('buffers an early matching settlement until the run enters finishing', () => {
    const store = createStore();
    const chatId = 'chat-ordered-settlement';
    const runId = testRunBody.admission.idempotencyKey;
    const actor = createActor(chatSessionMachine, {
      input: { chatId, projectId: 'project-settlement' },
    }).start();

    try {
      store.setFocusedProject('project-settlement');
      store.setProjectSession('project-settlement', sessionProjectRef(chatId, actor));
      store.acquire(chatId);
      store.startRun(chatId, testRunBody);
      const fake = harness.created.find((entry) => entry.id === chatId);
      expect(fake).toBeDefined();
      if (fake === undefined) {
        return;
      }
      fake.status = 'streaming';
      fake.emitStatusChange();

      recordHostFinalizedTurn({
        type: 'turn.finalized',
        turnId: 'turn-ordered-settlement',
        runId,
        chatId,
        projectId: 'project-settlement',
        checkoutId: 'live',
        changedPaths: [],
        trigger: 'turn',
        runIds: [runId],
      });
      expect(actor.getSnapshot().matches({ run: 'running' })).toBe(true);

      fake.status = 'ready';
      fake.emitStatusChange();
      expect(actor.getSnapshot().matches({ run: 'done' })).toBe(true);
    } finally {
      store.release(chatId);
      store.setProjectSession('project-settlement', undefined);
      actor.stop();
    }
  });

  it('does not settle a newer run with an older settlement from the same chat', () => {
    const store = createStore();
    const chatId = 'chat-correlated-settlement';
    const currentRunId = 'req_current_chat_session_store';
    const actor = createActor(chatSessionMachine, {
      input: { chatId, projectId: 'project-settlement' },
    }).start();

    try {
      store.setFocusedProject('project-settlement');
      store.setProjectSession('project-settlement', sessionProjectRef(chatId, actor));
      store.acquire(chatId);
      store.startRun(chatId, {
        ...testRunBody,
        admission: { version: 1, idempotencyKey: currentRunId },
      });
      const fake = harness.created.find((entry) => entry.id === chatId);
      expect(fake).toBeDefined();
      if (fake === undefined) {
        return;
      }
      fake.status = 'streaming';
      fake.emitStatusChange();
      fake.status = 'ready';
      fake.emitStatusChange();
      expect(actor.getSnapshot().matches({ run: 'finishing' })).toBe(true);

      recordHostFinalizedTurn({
        type: 'turn.finalized',
        turnId: 'turn-old',
        runId: 'run-old',
        chatId,
        projectId: 'project-settlement',
        checkoutId: 'live',
        changedPaths: [],
        trigger: 'turn',
        runIds: ['run-old'],
      });
      expect(actor.getSnapshot().matches({ run: 'finishing' })).toBe(true);

      recordHostFinalizedTurn({
        type: 'turn.finalized',
        turnId: 'turn-current',
        runId: currentRunId,
        chatId,
        projectId: 'project-settlement',
        checkoutId: 'live',
        changedPaths: [],
        trigger: 'turn',
        runIds: [currentRunId],
      });
      expect(actor.getSnapshot().matches({ run: 'done' })).toBe(true);
    } finally {
      store.release(chatId);
      store.setProjectSession('project-settlement', undefined);
      actor.stop();
    }
  });

  it("keeps a completed run finishing until that chat's own settlement is observed", () => {
    const store = createStore();
    const chatA = createActor(chatSessionMachine, {
      input: { chatId: 'chat-a', projectId: 'project-settlement' },
    }).start();
    const chatB = createActor(chatSessionMachine, {
      input: { chatId: 'chat-b', projectId: 'project-settlement' },
    }).start();
    const projectRef = {
      send: () => undefined,
      getSnapshot: () => ({ context: { chatRefs: { 'chat-a': chatA, 'chat-b': chatB } } }),
    } as unknown as Parameters<StoreType['setProjectSession']>[1];

    try {
      store.setFocusedProject('project-settlement');
      store.setProjectSession('project-settlement', projectRef);
      store.acquire('chat-a');
      store.acquire('chat-b');
      chatA.send({ type: 'runLifecycle', phase: 'running', runId: 'run-a' });
      chatA.send({ type: 'runLifecycle', phase: 'completed', runId: 'run-a' });

      expect(chatA.getSnapshot().matches({ run: 'finishing' })).toBe(true);
      recordHostFinalizedTurn({
        type: 'turn.finalized',
        turnId: 'turn-b',
        runId: 'run-b',
        chatId: 'chat-b',
        projectId: 'project-settlement',
        checkoutId: 'live',
        changedPaths: [],
        trigger: 'turn',
        runIds: ['run-b'],
      });
      expect(chatA.getSnapshot().matches({ run: 'finishing' })).toBe(true);

      recordHostFinalizedTurn({
        type: 'turn.finalized',
        turnId: 'turn-a',
        runId: 'run-a',
        chatId: 'chat-a',
        projectId: 'project-settlement',
        checkoutId: 'live',
        changedPaths: [],
        trigger: 'turn',
        runIds: ['run-a'],
      });
      expect(chatA.getSnapshot().matches({ run: 'done' })).toBe(true);
    } finally {
      store.release('chat-a');
      store.release('chat-b');
      store.setProjectSession('project-settlement', undefined);
      chatA.stop();
      chatB.stop();
    }
  });

  it('routes failed and conflicted outcomes only to their matching chats', () => {
    const store = createStore();
    const failed: Array<Record<string, unknown>> = [];
    const conflicted: Array<Record<string, unknown>> = [];
    const projectRef = {
      send: () => undefined,
      getSnapshot: () => ({
        context: {
          chatRefs: {
            'chat-failed': { send: (event: Record<string, unknown>) => failed.push(event) },
            'chat-conflicted': { send: (event: Record<string, unknown>) => conflicted.push(event) },
          },
        },
      }),
    } as unknown as Parameters<StoreType['setProjectSession']>[1];

    store.setFocusedProject('project-settlement');
    store.setProjectSession('project-settlement', projectRef);
    store.acquire('chat-failed');
    store.acquire('chat-conflicted');
    try {
      recordHostTurnSettlement({
        type: 'turn.failed',
        turnId: 'turn-failed',
        runId: 'run-failed',
        chatId: 'chat-failed',
        checkoutId: 'live',
        reason: 'revision cut failed',
      });
      recordHostTurnSettlement({
        type: 'turn.conflicted',
        turnId: 'turn-conflicted',
        runId: 'run-conflicted',
        chatId: 'chat-conflicted',
        checkoutId: 'live',
      });

      expect(failed).toContainEqual({
        type: 'turnFailedObserved',
        runId: 'run-failed',
        turnId: 'turn-failed',
        reason: 'revision cut failed',
      });
      expect(failed).not.toContainEqual({
        type: 'turnConflictedObserved',
        runId: 'run-conflicted',
        turnId: 'turn-conflicted',
      });
      expect(conflicted).toContainEqual({
        type: 'turnConflictedObserved',
        runId: 'run-conflicted',
        turnId: 'turn-conflicted',
      });
      expect(conflicted).not.toContainEqual({
        type: 'turnFailedObserved',
        runId: 'run-failed',
        turnId: 'turn-failed',
        reason: 'revision cut failed',
      });
    } finally {
      store.release('chat-failed');
      store.release('chat-conflicted');
      store.setProjectSession('project-settlement', undefined);
    }
  });

  it('rehydrates a terminal chat card from its durable settlement', () => {
    const store = createStore();
    const chatId = 'chat-persisted-settlement';
    const chat = createActor(chatSessionMachine, {
      input: { chatId, projectId: 'project-persisted-settlement' },
    }).start();
    const projectRef = {
      send: () => undefined,
      getSnapshot: () => ({ context: { chatRefs: { [chatId]: chat } } }),
    } as unknown as Parameters<StoreType['setProjectSession']>[1];
    recordHostFinalizedTurn({
      type: 'turn.finalized',
      turnId: 'turn-persisted-settlement',
      runId: 'run-persisted-settlement',
      chatId,
      projectId: 'project-persisted-settlement',
      checkoutId: 'live',
      branch: 'main',
      changedPaths: [],
      trigger: 'turn',
      runIds: ['run-persisted-settlement'],
    });

    store.setFocusedProject('project-persisted-settlement');
    store.acquire(chatId);
    store.setProjectSession('project-persisted-settlement', projectRef);

    expect(chat.getSnapshot().matches({ run: 'done' })).toBe(true);
    expect(chat.getSnapshot().matches({ read: 'unread' })).toBe(true);

    store.release(chatId);
    store.setProjectSession('project-persisted-settlement', undefined);
    chat.stop();
  });

  it('replays a settlement discovered while the durable chat is loading', async () => {
    const store = new ChatSessionStore();
    const deps = createStubDeps();
    const chatId = 'chat-loading-settlement';
    const projectId = 'project-loading-settlement';
    const chat = createActor(chatSessionMachine, { input: { chatId, projectId } }).start();
    const loading = Promise.withResolvers<Awaited<ReturnType<ChatSessionDeps['getChat']>>>();
    const projectRef = {
      send: () => undefined,
      getSnapshot: () => ({ context: { chatRefs: { [chatId]: chat } } }),
    } as unknown as Parameters<StoreType['setProjectSession']>[1];
    deps.getChat.mockImplementation(async () => loading.promise);
    store.setDependencies(deps);
    store.setProjectSession(projectId, projectRef);
    store.acquire(chatId, projectId);
    recordHostFinalizedTurn({
      type: 'turn.finalized',
      turnId: 'turn-loading-settlement',
      runId: 'run-loading-settlement',
      chatId,
      projectId,
      checkoutId: 'live',
      branch: 'main',
      changedPaths: [],
      trigger: 'turn',
      runIds: ['run-loading-settlement'],
    });
    loading.resolve({
      id: chatId,
      name: 'Loaded chat',
      resourceId: projectId,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await vi.waitFor(() => {
      expect(chat.getSnapshot().matches({ run: 'done' })).toBe(true);
      expect(chat.getSnapshot().matches({ read: 'unread' })).toBe(true);
    });

    store.release(chatId);
    store.setProjectSession(projectId, undefined);
    chat.stop();
  });
});

describe('ChatSessionStore — persisted failure replay (P59)', () => {
  /* A reload finds the failed turn in IndexedDB, not on a live run: nothing
   * ever sent the chat's machine a lifecycle for it, so the row read `Idle`
   * for work that ended badly. Binding is the moment to say so. */
  it('replays a persisted failure into the chat machine as it binds, and settles no run', () => {
    const store = createStore();
    const heard: Array<Record<string, unknown>> = [];
    const projectHeard: Array<{ type: string }> = [];
    const projectRef = {
      send: (event: { type: string }) => {
        projectHeard.push(event);
      },
      getSnapshot: () => ({
        context: {
          chatRefs: {
            'chat-reloaded': {
              send: (event: Record<string, unknown>) => {
                heard.push(event);
              },
            },
          },
        },
      }),
    } as unknown as Parameters<StoreType['setProjectSession']>[1];

    store.setFocusedProject('proj_reload');
    store.acquire('chat-reloaded');
    const fake = harness.created.find((entry) => entry.id === 'chat-reloaded')!;
    fake.status = 'error';
    fake.error = new Error('the model refused');

    store.setProjectSession('proj_reload', projectRef);

    expect(heard).toContainEqual({ type: 'runLifecycle', phase: 'failed', reason: 'the model refused' });
    /* A historical failure is not a run this session admitted (P59). */
    expect(projectHeard.filter((event) => event.type === 'runSettled')).toEqual([]);
    store.release('chat-reloaded');
    store.setProjectSession('proj_reload', undefined);
  });

  it('leaves a live run alone, replaying nothing over it', () => {
    const store = createStore();
    const heard: Array<Record<string, unknown>> = [];
    const projectRef = {
      send: () => undefined,
      getSnapshot: () => ({
        context: {
          chatRefs: {
            'chat-streaming': {
              send: (event: Record<string, unknown>) => {
                heard.push(event);
              },
            },
          },
        },
      }),
    } as unknown as Parameters<StoreType['setProjectSession']>[1];

    store.setFocusedProject('proj_live');
    store.acquire('chat-streaming');
    const fake = harness.created.find((entry) => entry.id === 'chat-streaming')!;
    fake.status = 'streaming';
    fake.emitStatusChange();
    fake.error = new Error('an error from the turn before');

    store.setProjectSession('proj_live', projectRef);

    expect(heard.filter((event) => event['phase'] === 'failed')).toEqual([]);
    store.release('chat-streaming');
    store.setProjectSession('proj_live', undefined);
  });
});

describe('ChatSessionStore', () => {
  beforeEach(() => {
    harness.created = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('routes accepted user activity through the current dependency set', async () => {
    const store = new ChatSessionStore();
    const deps = createStubDeps();
    store.setDependencies(deps);

    await store.touchChatRecency('chat_activity', 123);

    expect(deps.touchChatRecency).toHaveBeenCalledWith('chat_activity', 123);
  });

  it('updates the active dynamic tool name when counts stay unchanged', () => {
    const store = createStore();
    const session = store.acquire('chat_tool_name');
    const fake = harness.created.find((entry) => entry.id === 'chat_tool_name')!;
    const actor = createActor(chatSessionMachine, {
      input: { chatId: 'chat_tool_name', projectId: 'project_1' },
    }).start();
    session.stateActorRef = actor;
    const activeToolMessage = (toolName: string): MyUIMessage => ({
      id: 'assistant_1',
      role: 'assistant',
      parts: [{ type: 'dynamic-tool', toolName, toolCallId: 'tool_1', state: 'input-streaming', input: {} }],
    });

    fake.messages = [activeToolMessage('search')];
    fake.emitMessagesChange();
    expect(actor.getSnapshot().context.toolName).toBe('search');

    fake.messages = [activeToolMessage('edit_file')];
    fake.emitMessagesChange();
    expect(actor.getSnapshot().context.toolName).toBe('edit_file');

    actor.stop();
  });

  /* Rewritten for W7: the store's unread decision is written to the project's
   * unread record (D9) instead of `setChatUnreadState`, which is gone. Each row
   * keeps its original trigger and asserts the record on disk. */
  describe('unread lifecycle', () => {
    const projectId = 'proj_unread';
    const unreadPath = `/.tau/composers/chats/${projectId}/unread.json`;
    const storeInProject = (): { store: StoreType; deps: StubDeps } => {
      const store = new ChatSessionStore();
      const deps = createStubDeps();
      deps.getChat.mockImplementation(async (chatId) => chatRow(chatId, projectId));
      store.setDependencies(deps);
      return { store, deps };
    };
    const unreadWrites = (deps: StubDeps): number =>
      vi.mocked(deps.client.writeFile).mock.calls.filter(([path]) => path === unreadPath).length;

    it('marks unattended terminal success and error, but not abort or disconnect', async () => {
      const { store, deps } = storeInProject();

      for (const [chatId, options] of [
        ['chat_success', {}],
        ['chat_error', { isError: true }],
        ['chat_abort', { isAbort: true }],
        ['chat_disconnect', { isDisconnect: true }],
      ] as const) {
        store.retainDurableRun({ chatId, runId: `run_${chatId}` });
        harness.created.at(-1)!.finish(options);
      }

      await vi.waitFor(() => {
        expect(deps.client.json(unreadPath)).toEqual({
          version: 1,
          unread: { chat_success: true, chat_error: true },
        });
      });
      await settle();
      expect(deps.client.json(unreadPath)).toEqual({ version: 1, unread: { chat_success: true, chat_error: true } });
    });

    it('marks a new unattended approval once while it remains pending', async () => {
      const { store, deps } = storeInProject();
      vi.spyOn(deps.client, 'writeFile');
      store.retainDurableRun({ chatId: 'chat_approval', runId: 'run_approval' });
      const chat = harness.created[0]!;
      const approval = {
        type: 'tool-delete_file',
        toolCallId: 'tool-1',
        state: 'approval-requested',
        input: { targetFile: 'main.ts' },
        approval: { id: 'approval-1' },
      } as unknown as MyUIMessage['parts'][number];
      chat.messages = [{ id: 'assistant-1', role: 'assistant', parts: [approval] }];

      chat.emitMessagesChange();
      chat.emitMessagesChange();

      await vi.waitFor(() => {
        expect(deps.client.json(unreadPath)).toEqual({ version: 1, unread: { chat_approval: true } });
      });
      await settle();
      expect(unreadWrites(deps)).toBe(1);
    });

    it('does not mark terminal or approval events viewed in an active document', async () => {
      const { store, deps } = storeInProject();
      store.acquire('chat_active');
      store.focusChat('chat_active');
      const chat = harness.created[0]!;
      chat.messages = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            {
              type: 'tool-delete_file',
              toolCallId: 'tool-1',
              state: 'approval-requested',
              input: { targetFile: 'main.ts' },
              approval: { id: 'approval-1' },
            } as unknown as MyUIMessage['parts'][number],
          ],
        },
      ];

      chat.emitMessagesChange();
      chat.finish();

      await vi.waitFor(() => {
        expect(deps.getChat).toHaveBeenCalledWith('chat_active');
      });
      await settle();
      expect(deps.client.json(unreadPath)).toBeUndefined();
      expect(store.isUnread('chat_active')).toBe(false);
    });

    /* R3: every sidebar row holds a view of its chat, so a view alone is not the person reading it. */
    it('should mark a chat that finishes while another chat is focused in an active document', async () => {
      const { store, deps } = storeInProject();
      store.acquire('chat_listed');
      store.acquire('chat_focused');
      store.focusChat('chat_focused');

      harness.created[0]!.finish();

      await vi.waitFor(() => {
        expect(deps.client.json(unreadPath)).toEqual({ version: 1, unread: { chat_listed: true } });
      });
      expect(store.isUnread('chat_listed')).toBe(true);
    });

    it('should mark the focused chat once focus has moved away from it', async () => {
      const { store, deps } = storeInProject();
      store.acquire('chat_left');
      store.focusChat('chat_left');
      store.focusChat('chat_next');
      store.blurChat('chat_left');

      harness.created[0]!.finish();

      await vi.waitFor(() => {
        expect(deps.client.json(unreadPath)).toEqual({ version: 1, unread: { chat_left: true } });
      });
    });

    it('marks a terminal event when its mounted view is hidden', async () => {
      vi.stubGlobal('document', { visibilityState: 'hidden', hasFocus: () => false });
      const { store, deps } = storeInProject();
      store.acquire('chat_hidden');

      harness.created[0]!.finish();

      await vi.waitFor(() => {
        expect(deps.client.json(unreadPath)).toEqual({ version: 1, unread: { chat_hidden: true } });
      });
      expect(store.isUnread('chat_hidden')).toBe(true);
    });
  });

  // ===========================================================================
  // acquire / release refcounting
  // ===========================================================================

  describe('acquire / release', () => {
    it('retains and resumes an API-discovered run without a focused view', async () => {
      const store = createStore();

      const session = store.retainDurableRun({ chatId: 'chat_background', runId: 'run_background' });

      expect(store.list()).toContain('chat_background');
      expect(session).toBe(store.get('chat_background'));
      await vi.waitFor(() => {
        expect(harness.created[0]?.resumeStream).toHaveBeenCalledOnce();
      });
    });

    it('restores one canonical user row before its durable assistant idempotently', () => {
      const store = createStore();
      const session = store.retainDurableRun({
        chatId: 'chat_durable_user',
        runId: 'run_durable_user',
        state: 'terminal',
      });
      session.chat.messages = [{ id: 'run_durable_user', role: 'assistant', parts: [] }];
      const message: MyUIMessage = {
        id: 'message_durable_user',
        role: 'user',
        parts: [{ type: 'text', text: 'Restore me.' }],
        metadata: { status: 'success' },
      };

      expect(
        store.reconcileDurableUserMessage({
          chatId: 'chat_durable_user',
          runId: 'run_durable_user',
          message,
        }),
      ).toBe(true);
      expect(
        store.reconcileDurableUserMessage({
          chatId: 'chat_durable_user',
          runId: 'run_durable_user',
          message,
        }),
      ).toBe(false);
      expect(session.chat.messages.map(({ id }) => id)).toEqual(['message_durable_user', 'run_durable_user']);
    });

    it('resumes a durable run discovered after the mounted chat finished loading', async () => {
      const store = new ChatSessionStore();
      const deps = createStubDeps();
      deps.getChat.mockResolvedValue({
        id: 'chat_recovery',
        resourceId: 'project_test',
        name: 'Recovery chat',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        recencyAt: 1,
      });
      store.setDependencies(deps);
      const session = store.acquire('chat_recovery');

      await vi.waitFor(() => {
        expect(session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
      });
      store.retainDurableRun({ chatId: 'chat_recovery', runId: 'run_recovery', state: 'active' });

      await vi.waitFor(() => {
        expect(harness.created[0]?.resumeStream).toHaveBeenCalledOnce();
      });
    });

    it('fences release of a waiting run after an approval admission replaces its runId', () => {
      const store = createStore();
      store.retainDurableRun({ chatId: 'chat_approval', runId: 'run_waiting', state: 'active' });
      store.retainDurableRun({ chatId: 'chat_approval', runId: 'run_approval', state: 'active' });

      store.releaseDurableRun({ chatId: 'chat_approval', runId: 'run_waiting' });

      expect(store.getDurableRunId('chat_approval')).toBe('run_approval');
      expect(store.get('chat_approval')).toBeDefined();
    });

    it('adopts a freshly admitted transport run before settling a waiting response', () => {
      const store = createStore();
      store.acquire('chat_fresh_waiting');
      bindDurableChatRun('chat_fresh_waiting', 'run_fresh_waiting');

      harness.created[0]?.finish();

      expect(store.getDurableRunId('chat_fresh_waiting')).toBe('run_fresh_waiting');
      expect(store.getDurableRunState('chat_fresh_waiting')).toBe('terminal');
    });

    it('creates a session lazily on first acquire', () => {
      const store = createStore();
      const session = store.acquire('chat_a');

      expect(session.chatId).toBe('chat_a');
      expect(session.chat.id).toBe('chat_a');
      expect(session.persistenceActorRef).toBeDefined();
      expect(session.draftActorRef).toBeDefined();
      expect(harness.created).toHaveLength(1);
    });

    it('does not resume a loaded chat without a durable run', async () => {
      const store = new ChatSessionStore();
      const deps = createStubDeps();
      deps.getChat.mockResolvedValue({
        id: 'chat_idle',
        resourceId: 'project_test',
        name: 'Idle chat',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        recencyAt: 1,
      });
      store.setDependencies(deps);

      store.acquire('chat_idle');

      await vi.waitFor(() => {
        expect(deps.getChat).toHaveBeenCalledWith('chat_idle');
      });
      expect(harness.created[0]?.resumeStream).not.toHaveBeenCalled();
    });

    it('reattaches a host-placed chat to its host log, once per host', async () => {
      const store = new ChatSessionStore();
      const deps = createStubDeps();
      deps.getChat.mockResolvedValue({
        id: 'chat_daemon',
        resourceId: 'project_test',
        name: 'Daemon chat',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        recencyAt: 1,
      });
      store.setDependencies(deps);
      const session = store.acquire('chat_daemon');
      await vi.waitFor(() => {
        expect(session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
      });

      // The registration effect re-runs whenever the per-turn agent config
      // changes; only the first one may reattach.
      store.reattachHostChat({ chatId: 'chat_daemon', hostId: 'origin' });
      store.reattachHostChat({ chatId: 'chat_daemon', hostId: 'origin' });

      await vi.waitFor(() => {
        expect(harness.created[0]?.resumeStream).toHaveBeenCalledOnce();
      });
    });

    /*
     * A chat whose seeded first turn this page is dispatching has nothing to
     * reattach to: the dispatch opens the host stream itself. Reattaching
     * anyway opened a *second* one — and on rung 2 that means a second relay
     * session, which the daemon (capacity 1) refused with 409 BUSY 325 ms after
     * the first, so the seeded turn never ran (live proof 2026-09-03 06:20:33).
     */
    it('leaves a seeded first turn to its own dispatch instead of reattaching over it', async () => {
      const store = new ChatSessionStore();
      const deps = createStubDeps();
      const seededMessage: MyUIMessage = {
        id: 'msg_seeded_pending',
        role: 'user',
        parts: [{ type: 'text', text: 'Build a bracket.' }],
        metadata: { createdAt: 1_700_000_000_000, status: 'pending' },
      };
      const seededChat: ChatEntity = {
        id: 'chat_seeded_daemon',
        resourceId: 'project_test',
        name: 'Seeded daemon chat',
        messages: [seededMessage],
        startupRequest: {
          id: 'req_seeded',
          kind: 'regenerate-tail',
          messageId: seededMessage.id,
          source: 'homepage-initial-message',
          createdAt: 1_700_000_000_000,
        },
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      };
      deps.getChat.mockResolvedValue(seededChat);
      deps.consumeChatStartupRequest.mockResolvedValue({ ...seededChat, startupRequest: undefined });
      store.setDependencies(deps);
      store.acquire('chat_seeded_daemon');
      await vi.waitFor(() => {
        expect(deps.consumeChatStartupRequest).toHaveBeenCalledWith('chat_seeded_daemon', 'req_seeded');
      });

      store.reattachHostChat({ chatId: 'chat_seeded_daemon', hostId: 'origin' });

      await Promise.resolve();
      const seededSession = harness.created.find((entry) => entry.id === 'chat_seeded_daemon');
      expect(seededSession?.resumeStream).not.toHaveBeenCalled();
    });

    it('never reattaches a host-placed chat over a run of its own', async () => {
      const store = new ChatSessionStore();
      const deps = createStubDeps();
      deps.getChat.mockResolvedValue({
        id: 'chat_daemon_busy',
        resourceId: 'project_test',
        name: 'Busy daemon chat',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        recencyAt: 1,
      });
      store.setDependencies(deps);
      const session = store.acquire('chat_daemon_busy');
      await vi.waitFor(() => {
        expect(session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
      });
      const chat = harness.created[0]!;
      chat.status = 'streaming';
      chat.emitStatusChange();

      store.reattachHostChat({ chatId: 'chat_daemon_busy', hostId: 'origin' });

      await Promise.resolve();
      expect(chat.resumeStream).not.toHaveBeenCalled();
    });

    /*
     * The transcript this store restored from local persistence already holds
     * the run the host is about to replay from cursor 0, and the AI SDK
     * *continues* a trailing assistant message on a resume — so the replay used
     * to append a second copy of every text block to it (tool and data parts
     * are keyed and merge; text parts are keyed by nothing). The log is the
     * authority: the transport names the run once `attach` has answered, and
     * the store drops that run's own message so the replay rebuilds it.
     */
    it('drops the run a host reattach is about to rebuild from its transcript', async () => {
      const store = createStore();
      const chatId = 'chat_reattach_rebuild';
      const runId = 'run_reattach_rebuild';
      const userMessage: MyUIMessage = {
        id: 'msg_reattach_rebuild',
        role: 'user',
        parts: [{ type: 'text', text: 'Build it.' }],
      };
      const session = store.acquire(chatId);
      session.chat.messages = [userMessage, { id: runId, role: 'assistant', parts: [{ type: 'text', text: 'Done.' }] }];
      const hostClient: AgentHostClient = {
        start: vi.fn(),
        steer: vi.fn(),
        cancel: vi.fn(),
        resume: vi.fn(),
        resolveInterrupt: vi.fn(),
        attach: vi.fn(async () => ({
          cursor: 0,
          nextCursor: 0,
          endCursor: 0,
          events: [],
          snapshot: { chatId, runId, turnId: userMessage.id, state: 'completed', messages: [] } as const,
        })),
        tail: vi.fn(async () => ({ cursor: 0, nextCursor: 0, endCursor: 0, events: [] })),
        subscribe: vi.fn(() => () => undefined),
        close: vi.fn(async () => undefined),
      };
      const unregister = registerAgentHost(chatId, {
        projectStorage: async () => {
          throw new Error('A daemon-placed turn reads its workspace from the daemon.');
        },
        createClient: async () => hostClient,
        markRunId: async () => undefined,
      });

      const stream = await sharedChatTransport.reconnectToStream({ chatId, metadata: undefined });

      expect(session.chat.messages).toEqual([userMessage]);
      await stream?.getReader().cancel();
      unregister();
      store.release(chatId);
    });

    /*
     * The banner's Resume dispatches `continue`. Reattaching only recovers a run
     * the host is still driving, so a turn the gateway refused at admission — no
     * credit, rate limit, a dead tool — left nothing to attach to and Resume did
     * nothing at all. It has to dispatch the turn again instead.
     */
    it('re-runs the turn when a browser-placed chat has no resumable run', async () => {
      const store = createStore();
      const chatId = 'chat_terminal_run';
      const session = store.acquire(chatId);
      const unregister = registerAgentHost(chatId, {
        projectStorage: async () => {
          throw new Error('Unused by this dispatch.');
        },
        createClient: async () => {
          throw new Error('Unused by this dispatch.');
        },
        markRunId: async () => undefined,
      });

      session.persistenceActorRef.send({
        type: 'startRequest',
        request: { kind: 'continue', body: testRunBody },
      });
      await vi.waitFor(() => {
        expect(harness.created.at(-1)?.regenerate).toHaveBeenCalledOnce();
      });

      expect(harness.created.at(-1)?.resumeStream).not.toHaveBeenCalled();
      unregister();
      store.release(chatId);
    });

    /*
     * R9 / Journey 2. The gateway refuses the third call of a tool loop with a
     * 402: the two calls already settled are the customer's, and the turn ends
     * at that boundary. Nothing in the failure path may spend them again —
     * `finalizeInterruptedToolParts` rewrites only a dangling tail, so the
     * `output-available` parts reach the durable row intact, and Resume
     * dispatches rather than sitting inert on a terminal host run.
     *
     * And the dispatch is a `continue`, not a `regenerate`: a regenerate rewinds
     * the host history to before the user turn, so the two settled calls would
     * be dropped and paid for a second time. The host continues the refused run
     * at the one call it could not fund (`tau-agent-host.ts` `resume`).
     */
    it('keeps the tool results a mid-run credit denial already paid for, and continues on Resume', async () => {
      const chatId = 'chat_credit_denied_midrun';
      const store = new ChatSessionStore();
      const deps = createStubDeps();
      store.setDependencies(deps);
      const session = store.acquire(chatId);
      await Promise.resolve();
      deps.patchChat.mockClear();
      const hostClient = refusedAgentHostClient(chatId, 'run_credit_denied_midrun');
      const unregister = registerAgentHost(chatId, {
        projectStorage: async () => {
          throw new Error('Unused by this dispatch.');
        },
        createClient: async () => hostClient,
        markRunId: async () => undefined,
      });
      const fake = harness.created.at(-1)!;
      const settledTool = (toolCallId: string, targetFile: string): MyUIMessage['parts'][number] => ({
        type: 'tool-create_file',
        toolCallId,
        state: 'output-available',
        input: { targetFile, content: '//' },
        output: {
          message: '',
          diffStats: { linesAdded: 1, linesRemoved: 0, originalContent: '', modifiedContent: '//' },
        },
      });
      fake.messages = [
        { id: 'm_user', role: 'user', metadata: { createdAt: 1 }, parts: [{ type: 'text', text: 'Build it.' }] },
        {
          id: 'm_assistant',
          role: 'assistant',
          metadata: { createdAt: 2 },
          parts: [settledTool('tc_first', 'a.scad'), settledTool('tc_second', 'b.scad')],
        },
      ];

      session.persistenceActorRef.send({ type: 'startRequest', request: { kind: 'regenerate' } });
      // The third call's hold is refused; the run fails at that tool boundary.
      session.persistenceActorRef.send({
        type: 'requestFinished',
        messages: [...fake.messages],
        isAbort: false,
        isError: true,
        isDisconnect: false,
      });
      await vi.waitFor(() => {
        expect(deps.patchChat).toHaveBeenCalledWith(chatId, 'messages', expect.anything());
      });
      const persistedMessages = deps.patchChat.mock.calls.findLast(([, field]) => field === 'messages')?.[2] as
        | readonly MyUIMessage[]
        | undefined;
      expect(persistedMessages?.at(-1)?.parts.map((part) => (part as { state?: string }).state)).toEqual([
        'output-available',
        'output-available',
      ]);
      // The card reads its shortfall off the same durable row that kept them.
      session.persistenceActorRef.send({
        type: 'setPersistedError',
        error: {
          category: 'credits',
          title: 'Credit Limit Reached',
          message: 'Add 208.43 more credits to start a turn on GPT-6 Astra.',
          code: 'INSUFFICIENT_CREDIT',
          httpStatus: 402,
          details: { requiredCreditAtoms: '3084332', availableCreditAtoms: '1000000', routeId: 'openai-gpt-6-astra' },
        },
      });
      await vi.waitFor(() => {
        expect(deps.patchChat).toHaveBeenCalledWith(
          chatId,
          'error',
          expect.objectContaining({ category: 'credits', code: 'INSUFFICIENT_CREDIT' }),
        );
      });

      // The tab learns the refused run from the host's own log, exactly as a
      // reload would; the reattach itself spends nothing.
      const reattached = await sharedChatTransport.reconnectToStream({ chatId, metadata: undefined });
      await reattached?.getReader().cancel();

      expect(hostClient.resume).not.toHaveBeenCalled();

      // Resume, once the balance is topped up.
      session.persistenceActorRef.send({
        type: 'startRequest',
        request: { kind: 'continue', body: testRunBody },
      });
      await vi.waitFor(() => {
        expect(fake.resumeStream).toHaveBeenCalledOnce();
      });
      expect(fake.resumeStream).toHaveBeenCalledWith({ body: testRunBody });
      // Never a regenerate: that rewinds the host history past the settled
      // calls and pays for them twice.
      expect(fake.regenerate).not.toHaveBeenCalled();
      // The store never slices the transcript on the way out.
      expect(fake.messages.at(-1)?.parts).toHaveLength(2);

      unregister();
      store.release(chatId);
    });

    it('still reattaches for a chat no browser host is placed on', async () => {
      const store = createStore();
      const session = store.acquire('chat_api_placed');

      session.persistenceActorRef.send({
        type: 'startRequest',
        request: { kind: 'continue', body: testRunBody },
      });
      await vi.waitFor(() => {
        expect(harness.created.at(-1)?.resumeStream).toHaveBeenCalledOnce();
      });

      expect(harness.created.at(-1)?.regenerate).not.toHaveBeenCalled();
      store.release('chat_api_placed');
    });

    /*
     * The host resume request is one-shot and only a browser-host stream consumes
     * it. A `continue` on a chat no host is placed on must not arm it: nothing
     * clears it on that path, so the next browser-placed stream for the same chat
     * — a reattach nobody asked for — would inherit it and drive the host's
     * resume, spending on a turn the user never pressed Resume for.
     */
    it('does not arm the host resume from a continue no browser host can consume', async () => {
      const chatId = 'chat_resume_request_unplaced';
      const store = createStore();
      const session = store.acquire(chatId);
      const fake = harness.created.at(-1)!;

      session.persistenceActorRef.send({
        type: 'startRequest',
        request: { kind: 'continue', body: testRunBody },
      });
      await vi.waitFor(() => {
        expect(fake.resumeStream).toHaveBeenCalledOnce();
      });

      // The same chat later gains a browser host whose run ended on a refusal a
      // resume could continue. Reattaching it is a read, and must spend nothing.
      const hostClient = refusedAgentHostClient(chatId, 'run_resume_request_unplaced');
      const unregister = registerAgentHost(chatId, {
        projectStorage: async () => {
          throw new Error('Unused by this reattach.');
        },
        createClient: async () => hostClient,
        markRunId: async () => undefined,
      });
      const reattached = await sharedChatTransport.reconnectToStream({ chatId, metadata: undefined });
      await reattached?.getReader().cancel();

      expect(hostClient.resume).not.toHaveBeenCalled();

      unregister();
      store.release(chatId);
    });

    it('returns the same session on subsequent acquires for the same chatId', () => {
      const store = createStore();
      const first = store.acquire('chat_a');
      const second = store.acquire('chat_a');

      expect(second).toBe(first);
      expect(second.chat).toBe(first.chat);
      expect(second.persistenceActorRef).toBe(first.persistenceActorRef);
      expect(second.draftActorRef).toBe(first.draftActorRef);
      expect(harness.created).toHaveLength(1);
    });

    it('keeps the session live until the final release', () => {
      const store = createStore();
      store.acquire('chat_a');
      store.acquire('chat_a');

      store.release('chat_a');
      expect(store.get('chat_a')).toBeDefined();

      store.release('chat_a');
      expect(store.get('chat_a')).toBeUndefined();
    });

    it('disposes the persistence and draft actors on the final release', () => {
      const store = createStore();
      const session = store.acquire('chat_a');
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
      store.acquire('chat_a');
      store.release('chat_a');

      expect(() => {
        store.release('chat_a');
      }).not.toThrow();
      expect(store.get('chat_a')).toBeUndefined();
    });

    it('creates a fresh session after a previous release (no zombie state)', () => {
      const store = createStore();
      const first = store.acquire('chat_a');
      store.release('chat_a');

      const second = store.acquire('chat_a');
      expect(second).not.toBe(first);
      expect(second.chat).not.toBe(first.chat);
      expect(harness.created).toHaveLength(2);
    });

    it('keeps a streaming chat alive across focused navigation and releases only its view reference', async () => {
      const store = createStore();
      const chatA = store.acquire('chat_a');
      chatA.persistenceActorRef.send({
        type: 'startRequest',
        request: { kind: 'continue', body: testRunBody },
      });

      store.release('chat_a');
      const chatB = store.acquire('chat_b');

      expect(store.get('chat_a')).toBe(chatA);
      expect(store.get('chat_b')).toBe(chatB);
      expect(chatA.persistenceActorRef.getSnapshot().status).toBe('active');

      chatA.persistenceActorRef.send({
        type: 'requestFinished',
        messages: [],
        isAbort: false,
        isError: false,
        isDisconnect: false,
      });
      await Promise.resolve();

      expect(store.get('chat_a')).toBeUndefined();
      expect(store.get('chat_b')).toBe(chatB);
    });

    it('releases the non-view run hold after cancellation reaches terminal state', async () => {
      const store = createStore();
      const session = store.acquire('chat_cancelled');
      session.persistenceActorRef.send({
        type: 'startRequest',
        request: { kind: 'continue', body: testRunBody },
      });
      store.release('chat_cancelled');

      session.persistenceActorRef.send({ type: 'stopRequest' });
      session.persistenceActorRef.send({
        type: 'requestFinished',
        messages: [
          {
            id: 'msg_cancelled',
            role: 'user',
            parts: [{ type: 'text', text: 'cancel me' }],
            metadata: { createdAt: 1, status: 'pending' },
          },
        ],
        isAbort: true,
        isError: false,
        isDisconnect: false,
      });
      await Promise.resolve();

      expect(store.get('chat_cancelled')).toBeUndefined();
      expect(session.persistenceActorRef.getSnapshot().status).toBe('stopped');
      expect(session.draftActorRef.getSnapshot().status).toBe('stopped');
    });
  });

  // ===========================================================================
  // distinct sessions per chatId
  // ===========================================================================

  describe('per-chatId isolation', () => {
    it('creates an independent session for each chatId', () => {
      const store = createStore();
      const a = store.acquire('chat_a');
      const b = store.acquire('chat_b');

      expect(a.chat).not.toBe(b.chat);
      expect(a.persistenceActorRef).not.toBe(b.persistenceActorRef);
      expect(a.draftActorRef).not.toBe(b.draftActorRef);
      expect(harness.created).toHaveLength(2);
    });

    it('releasing one session does not affect the other', () => {
      const store = createStore();
      const a = store.acquire('chat_a');
      const b = store.acquire('chat_b');

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

      store.acquire('chat_a');
      // Membership notifications fan out on a microtask so an in-render
      // acquire never triggers a re-entrant React update.
      await Promise.resolve();
      expect(listener).toHaveBeenCalledTimes(1);

      store.acquire('chat_a');
      await Promise.resolve();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('notifies membership subscribers on final release only', async () => {
      const store = createStore();
      store.acquire('chat_a');
      store.acquire('chat_a');
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

      store.acquire('chat_a');
      store.acquire('chat_b');
      store.acquire('chat_c');
      expect(listener).not.toHaveBeenCalled();

      await Promise.resolve();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('exposes a stable list reference until membership changes', () => {
      const store = createStore();
      store.acquire('chat_a');
      const first = store.list();
      const second = store.list();
      expect(second).toBe(first);

      store.acquire('chat_b');
      expect(store.list()).not.toBe(first);
      expect([...store.list()].sort()).toEqual(['chat_a', 'chat_b']);
    });

    it('stops invoking membership listeners after unsubscribe', async () => {
      const store = createStore();
      const listener = vi.fn();
      const unsubscribe = store.subscribeMembership(listener);
      unsubscribe();

      store.acquire('chat_a');
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
      store.acquire('chat_a');
      const fake = harness.created[0]!;
      const listener = vi.fn();
      store.subscribeChat('chat_a', listener);

      fake.emitMessagesChange();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('fires when the underlying chat status changes', () => {
      const store = createStore();
      store.acquire('chat_a');
      const fake = harness.created[0]!;
      const listener = vi.fn();
      store.subscribeChat('chat_a', listener);

      fake.emitStatusChange();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does not wake subscribers from a different chatId', () => {
      const store = createStore();
      store.acquire('chat_a');
      store.acquire('chat_b');
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

      store.acquire('chat_a');
      const fake = harness.created[0]!;
      fake.emitMessagesChange();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('stops invoking listeners after unsubscribe', () => {
      const store = createStore();
      store.acquire('chat_a');
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
      const sessions = ids.map((id) => store.acquire(id));

      for (const session of sessions) {
        expect(session.persistenceActorRef.getSnapshot().status).toBe('active');
        expect(session.draftActorRef.getSnapshot().status).toBe('active');
      }
      expect([...store.list()].sort()).toEqual([...ids].sort());
      expect(harness.created).toHaveLength(ids.length);
    });

    it("releasing one chat does not stop another chat's actors or unsubscribe its listeners", () => {
      const store = createStore();
      const a = store.acquire('chat_a');
      const b = store.acquire('chat_b');

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
      store.acquire('chat_a');
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
      store.acquire('chat_a');
      const stale = vi.fn();
      const unsubscribeStale = store.subscribeChat('chat_a', stale);
      store.release('chat_a');
      unsubscribeStale();

      // Second lifecycle: a brand-new Chat instance + a new subscriber.
      store.acquire('chat_a');
      const fake = harness.created.at(-1)!;
      const fresh = vi.fn();
      store.subscribeChat('chat_a', fresh);

      fake.emitMessagesChange();

      expect(fresh).toHaveBeenCalledTimes(1);
      expect(stale).not.toHaveBeenCalled();
    });

    it('subscribeStatus notifies only its own chatId', () => {
      const store = createStore();
      store.acquire('chat_a');
      store.acquire('chat_b');

      const fakeA = harness.created.find((chat) => chat.id === 'chat_a')!;
      const fakeB = harness.created.find((chat) => chat.id === 'chat_b')!;

      const statusA = vi.fn();
      const statusB = vi.fn();
      store.subscribeStatus('chat_a', statusA);
      store.subscribeStatus('chat_b', statusB);

      fakeA.status = 'streaming';
      fakeA.emitStatusChange();

      expect(statusA).toHaveBeenCalledTimes(1);
      expect(statusB).not.toHaveBeenCalled();

      fakeB.status = 'submitted';
      fakeB.emitStatusChange();

      expect(statusA).toHaveBeenCalledTimes(1);
      expect(statusB).toHaveBeenCalledTimes(1);
    });
  });

  describe('milestone incremental persistence', () => {
    it('queues debounced IndexedDB persistence when milestone parts appear on the trailing assistant row', async () => {
      vi.useFakeTimers();
      const chatIdForMilestonePersistence = 'chat_milestone_integration';
      const store = new ChatSessionStore();
      const deps = createStubDeps();
      store.setDependencies(deps);

      store.acquire(chatIdForMilestonePersistence);
      await vi.runOnlyPendingTimersAsync();
      deps.patchChat.mockClear();

      const fake = harness.created.at(-1)!;
      fake.messages = [
        {
          id: 'm_as_ms',
          role: 'assistant',
          metadata: { createdAt: 1 },
          parts: [
            {
              type: 'tool-create_file',
              toolCallId: 'tc_done_ms',
              state: 'output-available',
              input: { targetFile: 'a.scad', content: '//' },
              output: {
                message: 'ok',
                diffStats: {
                  linesAdded: 1,
                  linesRemoved: 0,
                  originalContent: '',
                  modifiedContent: '//',
                },
              },
            },
          ],
        },
      ];

      fake.emitMessagesChange();
      await vi.advanceTimersByTimeAsync(100);
      await vi.runOnlyPendingTimersAsync();

      expect(deps.patchChat).toHaveBeenCalledTimes(1);
      expect(deps.patchChat).toHaveBeenCalledWith(chatIdForMilestonePersistence, 'messages', fake.messages);

      vi.useRealTimers();

      store.release(chatIdForMilestonePersistence);
    });

    it('preserves ledger-success tools through stop finalization while restoring output on the stalled tool part', async () => {
      vi.useFakeTimers();

      try {
        const chatLedgerStopIntegration = 'chat_stop_ledger_integration';
        const diffOutputB = {
          message: '',
          diffStats: {
            linesAdded: 1,
            linesRemoved: 0,
            originalContent: '',
            modifiedContent: '// b',
          },
        };

        const store = new ChatSessionStore();
        const deps = createStubDeps();
        store.setDependencies(deps);

        const session = store.acquire(chatLedgerStopIntegration);
        await Promise.resolve();

        deps.patchChat.mockClear();

        const fake = harness.created.at(-1)!;
        fake.messages = [
          {
            id: 'm_as_ls',
            role: 'assistant',
            metadata: { createdAt: 2 },
            parts: [
              {
                type: 'tool-create_file',
                toolCallId: 'tool_call_settled_integration',
                state: 'output-available',
                input: { targetFile: 'a.scad', content: '// a' },
                output: {
                  message: '',
                  diffStats: {
                    linesAdded: 1,
                    linesRemoved: 0,
                    originalContent: '',
                    modifiedContent: '// a',
                  },
                },
              },
              {
                type: 'tool-create_file',
                toolCallId: 'tool_call_rpc_settled_but_ui_pending',
                state: 'input-available',
                input: { targetFile: 'b.scad', content: '// b' },
              },
            ],
          },
        ];

        session.persistenceActorRef.send({ type: 'startRequest', request: { kind: 'regenerate' } });
        session.persistenceActorRef.send({ type: 'stopRequest' });

        recordRpcOutcome(chatLedgerStopIntegration, 'tool_call_rpc_settled_but_ui_pending', {
          kind: 'success',
          output: diffOutputB,
        });

        session.persistenceActorRef.send({
          type: 'requestFinished',
          messages: [...fake.messages],
          isAbort: true,
          isError: false,
          isDisconnect: false,
        });

        await vi.advanceTimersByTimeAsync(100);
        await vi.runOnlyPendingTimersAsync();

        const lastPatchCallArgs = deps.patchChat.mock.calls.at(-1);
        expect(lastPatchCallArgs).toBeDefined();
        const persistedMessages = lastPatchCallArgs![2];
        expect(Array.isArray(persistedMessages)).toBe(true);
        const msgs = persistedMessages as MyUIMessage[];

        const lastAssistant = msgs.at(-1);
        expect(lastAssistant?.role).toBe('assistant');
        const parts = lastAssistant?.parts ?? [];
        expect((parts[0] as { state: string }).state).toBe('output-available');

        expect((parts[1] as { state: string }).state).toBe('output-available');
        expect((parts[1] as { output: typeof diffOutputB }).output).toEqual(diffOutputB);

        store.release(chatLedgerStopIntegration);
        clearLedger(chatLedgerStopIntegration);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('empty-cancel draft restore', () => {
    it('lifts the cancelled user message back into the draft, truncates chat.messages, and atomically persists transcript plus draft', async () => {
      vi.useFakeTimers();
      try {
        const chatId = 'chat_restore_empty_cancel';
        const projectId = 'proj_restore';
        const store = new ChatSessionStore();
        const deps = createStubDeps();
        deps.getChat.mockResolvedValue(chatRow(chatId, projectId));
        deps.client.files.set(`${chatAttachmentsDirectory(projectId, chatId)}/${pngHash}.png`, pngBytes);
        store.setDependencies(deps);

        const session = store.acquire(chatId);
        await vi.runOnlyPendingTimersAsync();
        deps.patchChat.mockClear();

        const fake = harness.created.at(-1)!;
        const priorUser: MyUIMessage = {
          id: 'msg_user_prior',
          role: 'user',
          parts: [{ type: 'text', text: 'prior turn' }],
          metadata: { createdAt: 0, status: 'pending' },
        };
        const priorAssistant: MyUIMessage = {
          id: 'msg_assistant_prior',
          role: 'assistant',
          parts: [{ type: 'text', text: 'prior reply' }],
          metadata: { createdAt: 1, status: 'pending' },
        };
        const cancelledUser: MyUIMessage = {
          id: 'msg_user_cancelled',
          role: 'user',
          parts: [
            { type: 'text', text: 'help me iterate on this' },
            { type: 'file', url: pngUrl, mediaType: 'image/png' },
          ],
          metadata: { createdAt: 2, status: 'pending' },
        };
        const emptyAssistantPlaceholder: MyUIMessage = {
          id: 'msg_assistant_empty',
          role: 'assistant',
          parts: [],
          metadata: { createdAt: 3, status: 'pending' },
        };
        fake.messages = [priorUser, priorAssistant, cancelledUser, emptyAssistantPlaceholder];

        session.persistenceActorRef.send({
          type: 'startRequest',
          request: { kind: 'send', message: cancelledUser },
        });
        session.persistenceActorRef.send({ type: 'stopRequest' });
        session.persistenceActorRef.send({
          type: 'requestFinished',
          messages: [...fake.messages],
          isAbort: true,
          isError: false,
          isDisconnect: false,
        });

        // The trailing user message + empty assistant placeholder both come off
        // chat.messages; only the older turn remains.
        expect(fake.messages).toEqual([priorUser, priorAssistant]);

        const draftSnapshot = session.draftActorRef.getSnapshot();
        expect(draftSnapshot.context.draftText).toBe('help me iterate on this');
        // Rewritten for W7: the draft holds the attachment by reference, not a data URL.
        expect(draftSnapshot.context.draftAttachments).toEqual([{ hash: pngHash, mediaType: 'image/png' }]);

        // The bytes are copied back beside the record before the record references them (D18).
        await vi.waitFor(() => {
          expect(deps.commitCancelledDraftRestore).toHaveBeenCalledTimes(1);
        });
        expect(deps.client.files.get(`${draftAttachmentsDirectory(projectId, chatId)}/${pngHash}.png`)).toEqual(
          pngBytes,
        );
        await vi.waitFor(() => {
          expect(deps.client.json(composerPath(projectId, chatId))).toMatchObject({
            draft: { parts: cancelledUser.parts },
          });
        });
        const [restoreChatId, restoreInput] = deps.commitCancelledDraftRestore.mock.calls[0]!;
        expect(restoreChatId).toBe(chatId);
        expect(restoreInput.messages).toEqual([priorUser, priorAssistant]);
        // W8: the draft is the composer record's (asserted above), never the chat row's.
        expect(restoreInput).not.toHaveProperty('draft');
        expect(deps.patchChat.mock.calls.some(([, key]) => key === 'messages')).toBe(false);

        store.release(chatId);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not restore the draft when an assistant message has already streamed content (cancel-after-stream keeps applyStoppedRequest behaviour)', async () => {
      vi.useFakeTimers();
      try {
        const chatId = 'chat_restore_after_stream';
        const store = new ChatSessionStore();
        const deps = createStubDeps();
        store.setDependencies(deps);

        const session = store.acquire(chatId);
        await vi.runOnlyPendingTimersAsync();
        deps.patchChat.mockClear();

        const fake = harness.created.at(-1)!;
        const userMessage: MyUIMessage = {
          id: 'msg_user_partial',
          role: 'user',
          parts: [{ type: 'text', text: 'should stay in transcript' }],
          metadata: { createdAt: 0, status: 'pending' },
        };
        const assistantWithContent: MyUIMessage = {
          id: 'msg_assistant_partial',
          role: 'assistant',
          parts: [{ type: 'text', text: 'partial token' }],
          metadata: { createdAt: 1, status: 'pending' },
        };
        fake.messages = [userMessage, assistantWithContent];

        session.persistenceActorRef.send({
          type: 'startRequest',
          request: { kind: 'send', message: userMessage },
        });
        session.persistenceActorRef.send({ type: 'stopRequest' });
        session.persistenceActorRef.send({
          type: 'requestFinished',
          messages: [...fake.messages],
          isAbort: true,
          isError: false,
          isDisconnect: false,
        });

        // `chat.messages` is preserved (both turns still on screen); the prior
        // `applyStoppedRequest` path runs and finalises the partial assistant.
        expect(fake.messages).toHaveLength(2);
        expect(fake.messages[0]?.id).toBe('msg_user_partial');
        expect(fake.messages[1]?.id).toBe('msg_assistant_partial');

        // Draft must remain untouched.
        const draftSnapshot = session.draftActorRef.getSnapshot();
        expect(draftSnapshot.context.draftText).toBe('');
        expect(draftSnapshot.context.draftAttachments).toEqual([]);

        await vi.advanceTimersByTimeAsync(100);
        await vi.runOnlyPendingTimersAsync();

        store.release(chatId);
      } finally {
        vi.useRealTimers();
      }
    });

    it('persists empty-cancel restore across immediate release and reacquire without replaying the startup request', async () => {
      const chatId = 'chat_release_reacquire_after_empty_cancel';
      const cancelledUser: MyUIMessage = {
        id: 'msg_initial_prompt',
        role: 'user',
        parts: [{ type: 'text', text: 'make a planetary gear' }],
        metadata: { createdAt: 1, status: 'pending' },
      };
      const emptyAssistant: MyUIMessage = {
        id: 'msg_empty_assistant',
        role: 'assistant',
        parts: [],
        metadata: { createdAt: 2, status: 'pending' },
      };
      let storedChat: ChatEntity = {
        id: chatId,
        resourceId: 'resource_release_reacquire',
        name: 'Initial design',
        messages: [cancelledUser],
        startupRequest: {
          id: 'req_initial_prompt',
          kind: 'regenerate-tail',
          messageId: cancelledUser.id,
          source: 'homepage-initial-message',
          createdAt: 0,
        },
        createdAt: 0,
        updatedAt: 0,
      };
      const store = new ChatSessionStore();
      const deps = createStubDeps();
      deps.getChat.mockImplementation(async () => storedChat);
      deps.consumeChatStartupRequest.mockImplementation(async () => {
        storedChat = { ...storedChat, startupRequest: undefined };
        return storedChat;
      });
      // Rewritten for W7: the row no longer carries the draft; the chat's composer record does.
      deps.commitCancelledDraftRestore.mockImplementation(async (_chatId, input) => {
        storedChat = {
          ...storedChat,
          messages: input.messages,
          startupRequest:
            input.clearStartupRequestId && storedChat.startupRequest?.id === input.clearStartupRequestId
              ? undefined
              : storedChat.startupRequest,
        };
        return storedChat;
      });
      store.setDependencies(deps);

      const firstSession = store.acquire(chatId);
      store.setLatestAgentBody(chatId, async () => ({
        agent: { profile: 'cad', execution: { kind: 'tau', model: 'cad-default' }, kernel: 'replicad' },
      }));

      const firstFake = harness.created.find((entry) => entry.id === chatId)!;
      await vi.waitFor(() => {
        expect(firstFake.regenerate).toHaveBeenCalledTimes(1);
      });

      firstFake.messages = [cancelledUser, emptyAssistant];
      firstSession.persistenceActorRef.send({ type: 'stopRequest' });
      firstSession.persistenceActorRef.send({
        type: 'requestFinished',
        messages: [...firstFake.messages],
        isAbort: true,
        isError: false,
        isDisconnect: false,
      });

      store.release(chatId);
      // The draft reaches the record before the transcript is truncated, so the truncation is awaited here.
      await vi.waitFor(() => {
        expect(storedChat.messages).toEqual([]);
      });
      const secondSession = store.acquire(chatId);

      await vi.waitFor(() => {
        expect(secondSession.draftActorRef.getSnapshot().context.draftText).toBe('make a planetary gear');
      });
      expect(deps.client.json(composerPath('resource_release_reacquire', chatId))).toMatchObject({
        draft: { parts: cancelledUser.parts },
      });

      const secondFake = harness.created.at(-1)!;
      expect(secondFake.id).toBe(chatId);
      expect(secondFake.regenerate).not.toHaveBeenCalled();
      expect(secondFake.messages).toEqual([]);

      store.release(chatId);
    });
  });

  describe('hydration on acquire', () => {
    it('calls deps.getChat on first acquire so hydration kicks off', async () => {
      const store = new ChatSessionStore();
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

      store.acquire('chat_a');

      // Microtask flush so the persistence actor's loadChatActor invokes deps.getChat.
      await Promise.resolve();
      await Promise.resolve();

      expect(deps.getChat).toHaveBeenCalledWith('chat_a');
    });

    it('waits for latestAgentBody before dispatching a consumed startup request', async () => {
      const store = new ChatSessionStore();
      const deps = createStubDeps();
      store.setDependencies(deps);

      const legacyStartupMetadata: NonNullable<MyUIMessage['metadata']> & Record<string, unknown> = {
        createdAt: 1_700_000_000_000,
        status: 'pending',
        // Legacy extra fields must never become wire config; they remain
        // display metadata only.
        model: 'legacy-stale-model',
        kernel: 'replicad',
        mode: 'agent',
        toolChoice: 'auto',
        testingEnabled: false,
      };
      const startupUserMessage: MyUIMessage = {
        id: 'msg_startup_pending',
        role: 'user',
        parts: [{ type: 'text', text: 'homepage prompt' }],
        metadata: legacyStartupMetadata,
      };

      const startupChat: ChatEntity = {
        id: 'chat_startup_hydration',
        resourceId: 'resource_startup',
        name: 'Startup chat',
        messages: [startupUserMessage],
        startupRequest: {
          id: 'req_startup',
          kind: 'regenerate-tail',
          messageId: startupUserMessage.id,
          source: 'homepage-initial-message',
          createdAt: 1_700_000_000_000,
        },
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      };
      const consumedChat = { ...startupChat, startupRequest: undefined };
      deps.getChat.mockResolvedValue(startupChat);
      deps.consumeChatStartupRequest.mockResolvedValue(consumedChat);

      const liveBody = {
        agent: {
          profile: 'cad',
          execution: { kind: 'tau', model: 'openai-gpt-5.5' },
          kernel: 'replicad',
          mode: 'agent',
          toolChoice: 'auto',
          testingEnabled: true,
        },
        projectId: 'project_startup',
        execution: {
          hostId: 'host_startup',
          workspaceId: 'workspace_startup',
          baseRevisionId: 'revision_startup',
        },
      };
      store.acquire('chat_startup_hydration');

      // Reproduce the real mount order: IndexedDB hydration can consume the
      // startup marker before workspace preparation publishes the required
      // project/agent/execution body.
      await vi.waitFor(() => {
        expect(deps.consumeChatStartupRequest).toHaveBeenCalledWith('chat_startup_hydration', 'req_startup');
      });

      const fake = harness.created.find((entry) => entry.id === 'chat_startup_hydration')!;
      expect(fake.regenerate).not.toHaveBeenCalled();

      store.setLatestAgentBody('chat_startup_hydration', async () => liveBody);
      await vi.waitFor(() => {
        expect(fake.regenerate).toHaveBeenCalledTimes(1);
      });

      expect(fake.regenerate).toHaveBeenCalledTimes(1);
      const dispatchedOptions = fake.regenerate.mock.calls[0]![0] as { body?: Record<string, unknown> } | undefined;
      expect(dispatchedOptions?.body).toEqual({
        ...liveBody,
        admission: { version: 1, idempotencyKey: expect.stringMatching(/^req_/u) as unknown },
      });

      const wireBody = {
        id: 'chat_startup_hydration',
        messages: startupChat.messages,
        ...dispatchedOptions?.body,
      };
      const parsed = chatTurnRequestSchema.parse(wireBody);
      expect(parsed.agent).toMatchObject({
        profile: 'cad',
        // Live agent values survive — never the legacy persisted metadata.
        execution: { kind: 'tau', model: 'openai-gpt-5.5' },
        testingEnabled: true,
      });

      store.release('chat_startup_hydration');
    });

    it('restores a plain pending user tail to draft on hydration without regenerating', async () => {
      const store = new ChatSessionStore();
      const deps = createStubDeps();
      store.setDependencies(deps);

      const pendingUserMessage: MyUIMessage = {
        id: 'msg_orphan_pending',
        role: 'user',
        parts: [{ type: 'text', text: 'do not auto run' }],
        metadata: { createdAt: 1, status: 'pending' },
      };
      const orphanChat: ChatEntity = {
        id: 'chat_orphan_pending',
        resourceId: 'resource_orphan',
        name: 'Orphan pending',
        messages: [pendingUserMessage],
        createdAt: 0,
        updatedAt: 0,
      };
      const restoredChat: ChatEntity = { ...orphanChat, messages: [] };
      deps.getChat.mockResolvedValue(orphanChat);
      deps.commitCancelledDraftRestore.mockResolvedValue(restoredChat);

      const session = store.acquire('chat_orphan_pending');

      // The restored draft reaches its record before the transcript is truncated (W7), which takes more than two ticks.
      await vi.waitFor(() => {
        expect(deps.commitCancelledDraftRestore).toHaveBeenCalledOnce();
      });

      const fake = harness.created.find((entry) => entry.id === 'chat_orphan_pending')!;
      expect(fake.regenerate).not.toHaveBeenCalled();
      expect(deps.consumeChatStartupRequest).not.toHaveBeenCalled();
      const [restoreChatId, restoreInput] = deps.commitCancelledDraftRestore.mock.calls[0]!;
      expect(restoreChatId).toBe('chat_orphan_pending');
      expect(restoreInput.messages).toEqual([]);
      // W8: the restored draft goes to the composer (asserted below), never the chat row.
      expect(restoreInput).not.toHaveProperty('draft');
      expect(restoreInput.clearStartupRequestId).toBeUndefined();
      expect(fake.messages).toEqual([]);
      expect(session.draftActorRef.getSnapshot().context.draftText).toBe('do not auto run');

      store.release('chat_orphan_pending');
    });

    it('trims an empty assistant placeholder when healing an orphan pending tail', async () => {
      const store = new ChatSessionStore();
      const deps = createStubDeps();
      store.setDependencies(deps);

      const priorAssistant: MyUIMessage = {
        id: 'msg_prior_assistant',
        role: 'assistant',
        parts: [{ type: 'text', text: 'prior' }],
        metadata: { createdAt: 0, status: 'success' },
      };
      const pendingUserMessage: MyUIMessage = {
        id: 'msg_orphan_pending_with_placeholder',
        role: 'user',
        parts: [{ type: 'text', text: 'recover me' }],
        metadata: { createdAt: 1, status: 'pending' },
      };
      const emptyAssistant: MyUIMessage = {
        id: 'msg_empty_assistant',
        role: 'assistant',
        parts: [],
        metadata: { createdAt: 2, status: 'pending' },
      };
      const orphanChat: ChatEntity = {
        id: 'chat_orphan_placeholder',
        resourceId: 'resource_orphan',
        name: 'Orphan placeholder',
        messages: [priorAssistant, pendingUserMessage, emptyAssistant],
        createdAt: 0,
        updatedAt: 0,
      };
      deps.getChat.mockResolvedValue(orphanChat);

      const session = store.acquire('chat_orphan_placeholder');

      // The restored draft reaches its record before the transcript is truncated (W7), which takes more than two ticks.
      await vi.waitFor(() => {
        expect(deps.commitCancelledDraftRestore).toHaveBeenCalledOnce();
      });

      const fake = harness.created.find((entry) => entry.id === 'chat_orphan_placeholder')!;
      expect(fake.regenerate).not.toHaveBeenCalled();
      const [restoreChatId, restoreInput] = deps.commitCancelledDraftRestore.mock.calls[0]!;
      expect(restoreChatId).toBe('chat_orphan_placeholder');
      expect(restoreInput.messages).toEqual([priorAssistant]);
      // W8: the restored draft goes to the composer (asserted below), never the chat row.
      expect(restoreInput).not.toHaveProperty('draft');
      expect(restoreInput.clearStartupRequestId).toBeUndefined();
      expect(fake.messages).toEqual([priorAssistant]);
      expect(session.draftActorRef.getSnapshot().context.draftText).toBe('recover me');

      store.release('chat_orphan_placeholder');
    });
  });

  // ===========================================================================
  // R4 + R1: onFinish forwards isDisconnect, dispatchRequest({kind:'continue'})
  // calls makeRequest({trigger:'submit-message'}) without slicing chat.messages
  // ===========================================================================
  describe('resumable streams (R4 plumbing + R1 continue dispatch)', () => {
    it('dispatchRequest { kind: "continue" } calls chat.resumeStream() and does NOT mutate chat.messages', async () => {
      const store = createStore();
      const session = store.acquire('chat_resume');
      const fake = harness.created.find((entry) => entry.id === 'chat_resume')!;
      const before: MyUIMessage[] = [
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal MyUIMessage shape for test
        {
          id: 'msg_user_1',
          role: 'user',
          parts: [{ type: 'text', text: 'hi' }],
          metadata: { createdAt: 0 },
        },
      ];
      fake.messages = before;
      const beforeRef = fake.messages;

      session.persistenceActorRef.send({
        type: 'startRequest',
        request: { kind: 'continue', body: testRunBody },
      });

      // The dispatchRequest listener defers AI SDK calls onto a microtask
      // so they never run nested inside an outer makeRequest's finally
      // (see docs/research/chat-followup-message-swallow.md).
      await Promise.resolve();

      expect(fake.resumeStream).toHaveBeenCalledTimes(1);
      expect(fake.resumeStream).toHaveBeenCalledWith({ body: testRunBody });
      // Identity check: chat.messages reference unchanged.
      expect(fake.messages).toBe(beforeRef);
      expect(fake.regenerate).not.toHaveBeenCalled();
      expect(fake.sendMessage).not.toHaveBeenCalled();
    });

    /**
     * Regression: when the user clicks the "Try again" button on the
     * `ChatErrorServiceUnavailable` banner (or the persistence machine's
     * transparent auto-retry fires), the resumed POST must still carry the
     * top-level `agent` block required by `chatTurnRequestSchema`. Before the
     * fix the `continue` dispatch resumed without forwarding a body,
     * with no body, the AI SDK transport produced `{ id, messages, trigger }`,
     * and the API rejected it with `agent: expected object, received undefined`.
     */
    it('forwards latestAgentBody as `body` on `continue` so the resumed POST carries the agent block', async () => {
      const store = createStore();
      const session = store.acquire('chat_resume_agent');
      const fake = harness.created.find((entry) => entry.id === 'chat_resume_agent')!;

      const latestBody = {
        agent: { profile: 'cad', execution: { kind: 'tau', model: 'cad-default' }, kernel: 'replicad' },
      };
      store.setLatestAgentBody('chat_resume_agent', async () => latestBody);

      session.persistenceActorRef.send({ type: 'startRequest', request: { kind: 'continue' } });

      await vi.waitFor(() => {
        expect(fake.resumeStream).toHaveBeenCalledTimes(1);
      });
      expect(fake.resumeStream).toHaveBeenCalledWith({
        body: {
          ...latestBody,
          admission: { version: 1, idempotencyKey: expect.stringMatching(/^req_/u) as unknown },
        },
      });
    });
  });

  // ===========================================================================
  // Edit-resubmit dispatch
  //
  // The API reads agent config (model/kernel/mode/toolChoice/testingEnabled)
  // from the top-level `agent` block on the wire body (built inside the
  // chat-client from `useCadAgentConfig`), NOT from per-message metadata.
  // `buildEditedMessage` therefore only resets the user-facing fields
  // (text/image parts, createdAt, status) and forwards `request.body` to
  // `chat.regenerate` so model selection travels via `body.agent`.
  // ===========================================================================
  describe('edit-resubmit dispatch', () => {
    it('rebuilds the edited message with refreshed createdAt/status and forwards `request.body` to chat.regenerate', async () => {
      const store = createStore();
      const session = store.acquire('chat_edit_kernel');
      const fake = harness.created.find((entry) => entry.id === 'chat_edit_kernel')!;

      const originalMessage: MyUIMessage = {
        id: 'msg_original',
        role: 'user',
        parts: [{ type: 'text', text: 'original prompt' }],
        metadata: { createdAt: 100, status: 'error' },
      };
      fake.messages = [originalMessage];

      const overrideBody = {
        agent: { profile: 'cad', execution: { kind: 'tau', model: 'new-model' }, kernel: 'replicad' },
      };
      session.persistenceActorRef.send({
        type: 'startRequest',
        request: {
          kind: 'edit',
          messageId: 'msg_original',
          content: 'edited prompt',
          body: overrideBody,
        },
      });

      await Promise.resolve();

      expect(fake.regenerate).toHaveBeenCalledTimes(1);
      expect(fake.regenerate).toHaveBeenCalledWith({
        body: {
          ...overrideBody,
          admission: { version: 1, idempotencyKey: expect.stringMatching(/^req_/u) as unknown },
        },
      });
      const rebuilt = fake.messages.at(-1)!;
      expect(rebuilt.id).toBe('msg_original');
      expect(rebuilt.role).toBe('user');
      const text = rebuilt.parts.find((part): part is { type: 'text'; text: string } => part.type === 'text');
      expect(text?.text).toBe('edited prompt');
      expect(rebuilt.metadata?.status).toBe('pending');
      expect(typeof rebuilt.metadata?.createdAt).toBe('number');
    });
  });

  // ===========================================================================
  // Retry rebuild
  //
  // The retry helper slices the assistant tail and forwards `request.body`
  // to `chat.regenerate`; model selection travels via `body.agent.execution`
  // (composed by the chat-client), never via metadata patching.
  // ===========================================================================
  describe('retry rebuild', () => {
    it('slices the assistant tail and forwards `request.body` to chat.regenerate', async () => {
      const store = createStore();
      const session = store.acquire('chat_retry_metadata');
      const fake = harness.created.find((entry) => entry.id === 'chat_retry_metadata')!;

      const userMessage: MyUIMessage = {
        id: 'msg_user_retry',
        role: 'user',
        parts: [{ type: 'text', text: 'do thing' }],
        metadata: { createdAt: 1, status: 'success' },
      };
      const assistantMessage: MyUIMessage = {
        id: 'msg_assistant_retry',
        role: 'assistant',
        parts: [{ type: 'text', text: 'partial reply', state: 'done' }],
        metadata: { createdAt: 2, status: 'success' },
      };
      fake.messages = [userMessage, assistantMessage];

      const overrideBody = {
        agent: { profile: 'cad', execution: { kind: 'tau', model: 'new-model' }, kernel: 'replicad' },
      };
      session.persistenceActorRef.send({
        type: 'startRequest',
        request: {
          kind: 'retry',
          messageId: 'msg_assistant_retry',
          body: overrideBody,
        },
      });

      await Promise.resolve();

      expect(fake.regenerate).toHaveBeenCalledTimes(1);
      expect(fake.regenerate).toHaveBeenCalledWith({
        body: {
          ...overrideBody,
          admission: { version: 1, idempotencyKey: expect.stringMatching(/^req_/u) as unknown },
        },
      });
      // The assistant turn was sliced off; the previous user message is
      // unchanged (no metadata patching — model selection lives in
      // `body.agent.execution`).
      expect(fake.messages).toHaveLength(1);
      expect(fake.messages[0]!.id).toBe('msg_user_retry');
    });
  });

  // ===========================================================================
  // Body fallback for request dispatch (R10/t17)
  //
  // Startup-request hydration and continue requests flow through the same
  // `dispatchRequest` listener; without an explicit `request.body` they fall
  // back to `session.latestAgentBody` published by `useCadChatClient` so the
  // wire body still carries an `agent` block.
  // ===========================================================================
  describe('request body fallback (R10/t17)', () => {
    it('falls back to latestAgentBody when no explicit body is supplied on regenerate', async () => {
      const store = createStore();
      const session = store.acquire('chat_hydration_regen');
      const fake = harness.created.find((entry) => entry.id === 'chat_hydration_regen')!;

      const latestBody = {
        agent: { profile: 'cad', execution: { kind: 'tau', model: 'cad-default' }, kernel: 'replicad' },
      };
      store.setLatestAgentBody('chat_hydration_regen', async () => latestBody);

      session.persistenceActorRef.send({ type: 'startRequest', request: { kind: 'regenerate' } });

      await vi.waitFor(() => {
        expect(fake.regenerate).toHaveBeenCalledTimes(1);
      });
      expect(fake.regenerate).toHaveBeenCalledWith({
        body: {
          ...latestBody,
          admission: { version: 1, idempotencyKey: expect.stringMatching(/^req_/u) as unknown },
        },
      });
    });
  });

  // ===========================================================================
  // Preempt-clobber defense: the dispatchRequest listener must not call into
  // AI SDK's `Chat.sendMessage` / `Chat.regenerate` / `Chat.makeRequest`
  // synchronously inside the persistence machine's emit transition.
  //
  // Why: `chat.onFinish` synchronously sends `requestFinished` to the
  // machine from inside AI SDK's `Chat.makeRequest` finally block. When the
  // machine resumes a queued `pendingRequest` from `stopping → invoking`,
  // it emits `applyResumedRequest` followed by `dispatchRequest` in the
  // same transition. If `dispatchRequest`'s listener calls `chat.sendMessage`
  // synchronously, the new `makeRequest`'s `this.activeResponse = ...`
  // assignment lands BEFORE the outer makeRequest's finally runs its trailing
  // `this.activeResponse = void 0`. The outer finally clobbers the new
  // activeResponse, and when the new makeRequest's own finally later accesses
  // `this.activeResponse.state.message` (no optional chaining in ai@6.0.175)
  // it throws a TypeError that the surrounding try/catch swallows --
  // `onFinish` for the new request never fires, the machine never receives
  // `requestFinished`, and follow-up sends are silently dropped.
  //
  // See docs/research/chat-followup-message-swallow.md for the full trace.
  // ===========================================================================
  describe('preempt-clobber defense', () => {
    it('does NOT call chat.sendMessage synchronously inside startRequest dispatch (deferred onto a microtask)', async () => {
      const store = createStore();
      const session = store.acquire('chat_clobber_send');
      const fake = harness.created.find((entry) => entry.id === 'chat_clobber_send')!;

      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal MyUIMessage shape for test
      const message: MyUIMessage = {
        id: 'msg_user_B',
        role: 'user',
        parts: [{ type: 'text', text: 'follow-up' }],
        metadata: { createdAt: 0, status: 'pending' },
      } as MyUIMessage;

      session.persistenceActorRef.send({
        type: 'startRequest',
        request: { kind: 'send', message, body: testRunBody },
      });

      // Synchronous assertion: the listener has NOT touched the AI SDK yet.
      // This is the core fix -- a synchronous call would re-enter
      // `Chat.makeRequest` inside an outer makeRequest's finally and trigger
      // the activeResponse clobber.
      expect(fake.sendMessage).not.toHaveBeenCalled();

      await Promise.resolve();

      expect(fake.sendMessage).toHaveBeenCalledTimes(1);
      expect(fake.sendMessage).toHaveBeenCalledWith(message, { body: testRunBody });
    });

    it('does NOT call chat.regenerate synchronously inside startRequest dispatch', async () => {
      const store = createStore();
      const session = store.acquire('chat_clobber_regen');
      const fake = harness.created.find((entry) => entry.id === 'chat_clobber_regen')!;

      session.persistenceActorRef.send({
        type: 'startRequest',
        request: { kind: 'regenerate', body: testRunBody },
      });

      expect(fake.regenerate).not.toHaveBeenCalled();

      await Promise.resolve();

      expect(fake.regenerate).toHaveBeenCalledTimes(1);
    });

    it('does NOT call chat.resumeStream synchronously inside continue dispatch', async () => {
      const store = createStore();
      const session = store.acquire('chat_clobber_continue');
      const fake = harness.created.find((entry) => entry.id === 'chat_clobber_continue')!;

      session.persistenceActorRef.send({
        type: 'startRequest',
        request: { kind: 'continue', body: testRunBody },
      });

      expect(fake.resumeStream).not.toHaveBeenCalled();

      await Promise.resolve();

      expect(fake.resumeStream).toHaveBeenCalledTimes(1);
      expect(fake.resumeStream).toHaveBeenCalledWith({ body: testRunBody });
    });

    it('end-to-end preempt path: applyResumedRequest mutates chat.messages SYNCHRONOUSLY, dispatchRequest defers chat.sendMessage onto the next microtask', async () => {
      // This is the critical ordering. `applyResumedRequest` must mutate
      // `chat.messages = sanitized` synchronously inside the transition so
      // that when the deferred `dispatchRequest` listener fires
      // `chat.sendMessage(B)` on the next microtask, the AI SDK sees the
      // sanitized message tail (with the partial assistant turn finalised)
      // rather than the in-flight pre-preempt array.
      const store = createStore();
      const session = store.acquire('chat_preempt_ordering');
      const fake = harness.created.find((entry) => entry.id === 'chat_preempt_ordering')!;

      const initialMessages: MyUIMessage[] = [
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal MyUIMessage shape for test
        {
          id: 'msg_user_A',
          role: 'user',
          parts: [{ type: 'text', text: 'first turn' }],
          metadata: { createdAt: 0 },
        },
      ];
      fake.messages = initialMessages;

      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal MyUIMessage shape for test
      const pendingMessage: MyUIMessage = {
        id: 'msg_user_B',
        role: 'user',
        parts: [{ type: 'text', text: 'preempting follow-up' }],
        metadata: { createdAt: 1, status: 'pending' },
      } as MyUIMessage;

      // Kick off A (idle -> invoking).
      session.persistenceActorRef.send({
        type: 'startRequest',
        request: { kind: 'send', message: initialMessages[0]!, body: testRunBody },
      });
      // Drain the microtask so the listener fires for A.
      await Promise.resolve();
      fake.sendMessage.mockClear();

      // Preempt with B (invoking -> stopping, pendingRequest = B-send).
      session.persistenceActorRef.send({
        type: 'startRequest',
        request: { kind: 'send', message: pendingMessage, body: testRunBody },
      });
      expect(session.persistenceActorRef.getSnapshot().matches({ requestLifecycle: 'stopping' })).toBe(true);

      // Simulate AI SDK's onFinish wiring: AI SDK aborts A, then calls onFinish
      // with the current messages. This is the synchronous re-entry we are
      // defending against.
      session.persistenceActorRef.send({
        type: 'requestFinished',
        messages: initialMessages,
        isAbort: true,
        isError: false,
        isDisconnect: false,
      });

      // Synchronous post-conditions:
      // 1. Machine has transitioned stopping -> invoking (preempt branch).
      expect(session.persistenceActorRef.getSnapshot().matches({ requestLifecycle: 'invoking' })).toBe(true);
      // 2. applyResumedRequest fired synchronously and mutated chat.messages.
      //    `finalizeInterruptedToolParts` returns the same reference when no
      //    sanitisation is needed, so we observe identity preservation.
      expect(fake.messages).toBe(initialMessages);
      // 3. dispatchRequest's chat.sendMessage call was deferred (not yet seen).
      expect(fake.sendMessage).not.toHaveBeenCalled();

      // Drain the microtask: chat.sendMessage(B) now fires.
      await Promise.resolve();
      expect(fake.sendMessage).toHaveBeenCalledTimes(1);
      expect(fake.sendMessage).toHaveBeenCalledWith(pendingMessage, { body: testRunBody });
    });

    it('should finalize static and dynamic in-progress tool parts before dispatching a preempting follow-up', async () => {
      const store = createStore();
      const session = store.acquire('chat_preempt_tools');
      const fake = harness.created.find((entry) => entry.id === 'chat_preempt_tools')!;

      const interruptedMessages: MyUIMessage[] = [
        {
          id: 'msg_user_A',
          role: 'user',
          parts: [{ type: 'text', text: 'first turn' }],
          metadata: { createdAt: 0 },
        },
        {
          id: 'msg_assistant_A',
          role: 'assistant',
          parts: [
            {
              type: 'tool-edit_file',
              toolCallId: 'tc_edit',
              state: 'input-available',
              input: { targetFile: 'main.scad', codeEdit: 'cube([1, 1, 1]);' },
            },
            {
              type: 'dynamic-tool',
              toolName: 'provider_native_search',
              toolCallId: 'tc_dynamic',
              state: 'input-streaming',
              input: ['partial', { nested: true }],
            },
          ],
          metadata: { createdAt: 1 },
        },
      ];
      fake.messages = interruptedMessages;

      const pendingMessage: MyUIMessage = {
        id: 'msg_user_B',
        role: 'user',
        parts: [{ type: 'text', text: 'preempting follow-up' }],
        metadata: { createdAt: 2, status: 'pending' },
      };

      session.persistenceActorRef.send({
        type: 'startRequest',
        request: { kind: 'send', message: interruptedMessages[0]!, body: testRunBody },
      });
      await Promise.resolve();
      fake.sendMessage.mockClear();

      session.persistenceActorRef.send({
        type: 'startRequest',
        request: { kind: 'send', message: pendingMessage, body: testRunBody },
      });
      session.persistenceActorRef.send({
        type: 'requestFinished',
        messages: interruptedMessages,
        isAbort: true,
        isError: false,
        isDisconnect: false,
      });

      expect(fake.messages).not.toBe(interruptedMessages);
      const assistant = fake.messages.at(-1);
      if (assistant?.role !== 'assistant') {
        throw new Error('expected finalized assistant tail');
      }
      const [staticTool, dynamicTool] = assistant.parts;
      expect(staticTool).toMatchObject({
        type: 'tool-edit_file',
        toolCallId: 'tc_edit',
        state: 'output-error',
      });
      expect(dynamicTool).toMatchObject({
        type: 'dynamic-tool',
        toolName: 'provider_native_search',
        toolCallId: 'tc_dynamic',
        state: 'output-error',
        input: ['partial', { nested: true }],
      });
      if (!staticTool || !('errorText' in staticTool) || typeof staticTool.errorText !== 'string') {
        throw new Error('expected finalized static tool errorText');
      }
      if (!dynamicTool || !('errorText' in dynamicTool) || typeof dynamicTool.errorText !== 'string') {
        throw new Error('expected finalized dynamic tool errorText');
      }
      expect(JSON.parse(staticTool.errorText) as Record<string, unknown>).toMatchObject({
        errorCode: 'USER_INTERRUPTED',
        toolName: 'edit_file',
        toolCallId: 'tc_edit',
      });
      expect(JSON.parse(dynamicTool.errorText) as Record<string, unknown>).toMatchObject({
        errorCode: 'USER_INTERRUPTED',
        toolName: 'provider_native_search',
        toolCallId: 'tc_dynamic',
      });
      expect(fake.sendMessage).not.toHaveBeenCalled();

      await Promise.resolve();
      expect(fake.sendMessage).toHaveBeenCalledTimes(1);
      expect(fake.sendMessage).toHaveBeenCalledWith(pendingMessage, { body: testRunBody });
    });
  });

  describe('tool cause attribution (TT3)', () => {
    it('does not persist on disconnect retry; completion persists after streamResumed + messages', async () => {
      vi.useFakeTimers();
      try {
        const chatId = 'chat_tt3_retry';
        const store = new ChatSessionStore();
        const deps = createStubDeps();
        store.setDependencies(deps);

        const session = store.acquire(chatId);
        await Promise.resolve();
        deps.patchChat.mockClear();

        const fake = harness.created.at(-1)!;
        fake.messages = [
          {
            id: 'm_as',
            role: 'assistant',
            metadata: { createdAt: 2 },
            parts: [
              {
                type: 'tool-create_file',
                toolCallId: 'tc_tt3',
                state: 'input-streaming',
                input: { targetFile: 'z.scad', content: '//' },
              },
            ],
          },
        ];

        session.persistenceActorRef.send({ type: 'startRequest', request: { kind: 'regenerate' } });

        session.persistenceActorRef.send({
          type: 'requestFinished',
          messages: [...fake.messages],
          isAbort: false,
          isError: true,
          isDisconnect: true,
        });

        expect(session.persistenceActorRef.getSnapshot().matches({ requestLifecycle: 'retrying' })).toBe(true);
        expect((fake.messages[0]!.parts[0] as { state: string }).state).toBe('input-streaming');
        expect(deps.patchChat).not.toHaveBeenCalled();

        const output = {
          message: '',
          diffStats: {
            linesAdded: 1,
            linesRemoved: 0,
            originalContent: '',
            modifiedContent: '// ok',
          },
        };

        fake.messages = [
          {
            ...fake.messages[0]!,
            parts: [
              {
                type: 'tool-create_file',
                toolCallId: 'tc_tt3',
                state: 'output-available',
                input: { targetFile: 'z.scad', content: '//' },
                output,
              },
            ],
          },
        ];

        session.persistenceActorRef.send({ type: 'streamResumed' });
        fake.emitMessagesChange();

        await vi.advanceTimersByTimeAsync(100);
        await vi.runOnlyPendingTimersAsync();

        expect(deps.patchChat).toHaveBeenCalled();
        const persisted = deps.patchChat.mock.calls.at(-1)![2] as MyUIMessage[];
        const persistedPart = persisted.at(-1)?.parts[0] as { state: string; output: typeof output };
        expect(persistedPart.state).toBe('output-available');
        expect(persistedPart.output).toEqual(output);

        store.release(chatId);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('streamResumed (R6)', () => {
    it('T21: sends streamResumed to the persistence actor only on transition into streaming', () => {
      const store = createStore();
      const session = store.acquire('chat_r6');
      const fake = harness.created.find((entry) => entry.id === 'chat_r6')!;
      const sendSpy = vi.spyOn(session.persistenceActorRef, 'send');

      const countStreamResumed = (): number =>
        sendSpy.mock.calls.filter((call) => call[0].type === 'streamResumed').length;

      fake.status = 'submitted';
      fake.emitStatusChange();
      const afterSubmitted = countStreamResumed();

      fake.status = 'streaming';
      fake.emitStatusChange();
      const afterStreaming = countStreamResumed();

      expect(afterSubmitted).toBe(0);
      expect(afterStreaming).toBe(1);

      // Idempotent repeated "streaming" emissions without a status change.
      fake.emitStatusChange();
      expect(countStreamResumed()).toBe(1);
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
    const store = new ChatSessionStore();
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
    const session = first.store.acquire(chatId);
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
    const restored = second.store.acquire(chatId);
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

  it('keeps unread across a fresh store and clears it when the chat is viewed', async () => {
    vi.stubGlobal('document', { visibilityState: 'hidden', hasFocus: () => false });
    const client = createMemoryClient();
    const first = openStore(client);
    first.store.acquire(chatId);
    harness.created.at(-1)!.finish();
    await vi.waitFor(() => {
      expect(client.json(unreadPath)).toEqual({ version: 1, unread: { [chatId]: true } });
    });
    first.store.release(chatId);

    const second = openStore(client);
    second.store.acquire(chatId);
    await vi.waitFor(() => {
      expect(second.store.isUnread(chatId)).toBe(true);
    });

    second.store.markViewed(chatId);

    await vi.waitFor(() => {
      expect(client.json(unreadPath)).toEqual({ version: 1 });
    });
    expect(second.store.isUnread(chatId)).toBe(false);
    second.store.release(chatId);
  });

  it('promotes both blobs into the chat directory on send and clears the draft-stage copies', async () => {
    const client = createMemoryClient();
    const { store } = openStore(client);
    const session = store.acquire(chatId);
    const fake = harness.created.at(-1)!;
    await attachBoth(session);
    const { draftAttachments } = session.draftActorRef.getSnapshot().context;

    await store.promoteDraftAttachments(chatId, draftAttachments);

    expect(client.files.get(`${chatAttachmentsDirectory(projectId, chatId)}/${pngHash}.png`)).toEqual(pngBytes);
    expect(client.files.get(`${chatAttachmentsDirectory(projectId, chatId)}/${pdfHash}.pdf`)).toEqual(pdfBytes);

    // What `useChatActions().sendMessage` does once the message is built.
    const message = buildUserMessage({ text: 'read the spec', attachments: draftAttachments });
    session.draftActorRef.send({ type: 'clearDraft' });
    await store.releaseDraftAttachments(chatId);
    session.persistenceActorRef.send({ type: 'startRequest', request: { kind: 'send', message, body: testRunBody } });

    await vi.waitFor(() => {
      expect(fake.sendMessage).toHaveBeenCalledOnce();
    });
    expect(fake.sendMessage.mock.calls[0]![0]).toMatchObject({
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
    const session = store.acquire(chatId);
    await attachBoth(session);
    const before = session.draftActorRef.getSnapshot().context.draftAttachments;
    client.files.delete(`${draftAttachmentsDirectory(projectId, chatId)}/${pdfHash}.pdf`);

    await expect(store.promoteDraftAttachments(chatId, before)).rejects.toThrow(/missing/u);

    expect(session.draftActorRef.getSnapshot().context.draftAttachments).toEqual(before);
    // The image copied before the PDF failed is taken back: nothing references it (G10).
    expect(client.namesUnder(chatAttachmentsDirectory(projectId, chatId))).toEqual([]);
    expect(harness.created.at(-1)!.sendMessage).not.toHaveBeenCalled();
    store.release(chatId);
  });

  it('should keep a blob an earlier message holds when a later promotion fails (G10)', async () => {
    const client = createMemoryClient();
    const { store } = openStore(client);
    const session = store.acquire(chatId);
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

  it('still opens the chat when its record cannot be read', async () => {
    const client = createMemoryClient();
    client.failingReads.add(composerPath(projectId, chatId));
    const transcript: MyUIMessage[] = [{ id: 'msg_1', role: 'user', parts: [{ type: 'text', text: 'earlier' }] }];
    const { store } = openStore(client, chatRow(chatId, projectId, { messages: transcript }));
    const session = store.acquire(chatId);
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
    const session = store.acquire(chatId);
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

  /** A store over one device's disk, with a live project session holding a real chat machine. */
  const openStore = (client: MemoryClient) => {
    const store = new ChatSessionStore();
    const deps = createStubDeps(client);
    deps.getChat.mockImplementation(async (id) => chatRow(id, projectId));
    store.setDependencies(deps);
    const chat = createActor(chatSessionMachine, { input: { chatId, projectId } }).start();
    const projectRef = {
      send: () => undefined,
      getSnapshot: () => ({ context: { chatRefs: { [chatId]: chat }, runs: new Set() } }),
    } as unknown as Parameters<StoreType['setProjectSession']>[1];
    store.setProjectSession(projectId, projectRef);
    return { store, chat };
  };

  beforeEach(() => {
    harness.created = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('restores unread into the chat machine of a fresh store (unreadRestored)', async () => {
    vi.stubGlobal('document', { visibilityState: 'hidden', hasFocus: () => false });
    const client = createMemoryClient();
    const first = openStore(client);
    first.store.acquire(chatId, projectId);
    harness.created.at(-1)!.finish();
    await vi.waitFor(() => {
      expect(client.json(unreadPath)).toEqual({ version: 1, unread: { [chatId]: true } });
    });
    first.store.release(chatId);

    const second = openStore(client);
    expect(second.chat.getSnapshot().matches({ read: 'read' })).toBe(true);
    second.store.acquire(chatId, projectId);

    await vi.waitFor(() => {
      expect(second.chat.getSnapshot().matches({ read: 'unread' })).toBe(true);
    });
    expect(second.store.isUnread(chatId)).toBe(true);
    second.store.release(chatId);
    first.chat.stop();
    second.chat.stop();
  });

  it('stops the live record actor when its chat is deleted, so a later patch cannot write the record back', async () => {
    const client = createMemoryClient();
    const { store, chat } = openStore(client);
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
    chat.stop();
  });

  it('does not recreate unread.json for a late unread decision after its project is deleted', async () => {
    vi.stubGlobal('document', { visibilityState: 'hidden', hasFocus: () => false });
    const client = createMemoryClient();
    const { store, chat } = openStore(client);
    store.acquire(chatId, projectId);
    store.markViewed(chatId);
    await settle();

    await store.removeProject(projectId);
    harness.created.at(-1)!.finish();
    await settle();

    expect(client.json(unreadPath)).toBeUndefined();
    expect(client.namesUnder(`/.tau/composers/chats/${projectId}`)).toEqual([]);
    store.release(chatId);
    chat.stop();
  });
});
