// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- mock for AI SDK's Chat / DefaultChatTransport classes uses the SDK's own PascalCase names and `~`-prefixed subscriber method names verbatim so the mock surface matches the real one. */
/* eslint-disable @typescript-eslint/explicit-member-accessibility -- mock class constructors omit the `public` keyword to mirror the AI SDK's published shape. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chat as ChatEntity, MyUIMessage } from '@taucad/chat';
import { chatTurnRequestSchema } from '@taucad/chat/schemas';
import type { AgentHostClient } from '#services/agent-host-client.js';
import { clearLedger, recordRpcOutcome } from '#services/rpc-ledger.js';

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

vi.mock('ai', () => ({
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
const { bindDurableChatRun, sharedChatTransport } = await import('#chat-clients/_internal/shared-chat-transport.js');
const { registerAgentHost } = await import('#chat-clients/_internal/browser-agent-host-transport.js');
type StoreType = InstanceType<typeof ChatSessionStore>;
type ChatSessionDeps = Parameters<StoreType['setDependencies']>[0];

/**
 * Use vitest's generic `vi.fn<T>()` form so each mock carries the precise
 * callable signature declared by `ChatSessionDeps`. Without the generic,
 * `vi.fn()` defaults to a permissive `Constructable | Procedure` shape
 * that doesn't structurally match the typed closure fields.
 */
type StubDeps = {
  [K in keyof ChatSessionDeps]: ReturnType<typeof vi.fn<ChatSessionDeps[K]>>;
};

function createStubDeps(): StubDeps {
  return {
    getChat: vi.fn<ChatSessionDeps['getChat']>().mockResolvedValue(undefined),
    patchChat: vi.fn<ChatSessionDeps['patchChat']>().mockResolvedValue(undefined),
    touchChatRecency: vi.fn<ChatSessionDeps['touchChatRecency']>().mockResolvedValue(undefined),
    setChatUnreadState: vi.fn<ChatSessionDeps['setChatUnreadState']>().mockResolvedValue(undefined),
    consumeChatStartupRequest: vi.fn<ChatSessionDeps['consumeChatStartupRequest']>().mockResolvedValue(undefined),
    commitCancelledDraftRestore: vi.fn<ChatSessionDeps['commitCancelledDraftRestore']>().mockResolvedValue(undefined),
    setMessageEdit: vi.fn<ChatSessionDeps['setMessageEdit']>().mockResolvedValue(undefined),
    clearMessageEdit: vi.fn<ChatSessionDeps['clearMessageEdit']>().mockResolvedValue(undefined),
  };
}

function createStore(): StoreType {
  const store = new ChatSessionStore();
  store.setDependencies(createStubDeps());
  return store;
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
  execution: Object.freeze({ workspaceId: 'workspace_test', baseRevisionId: 'revision_test', hostId: 'host_test' }),
  admission: Object.freeze({ version: 1, idempotencyKey: 'req_test_chat_session_store' }),
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

  describe('unread lifecycle', () => {
    it('marks unattended terminal success and error, but not abort or disconnect', () => {
      const store = new ChatSessionStore();
      const deps = createStubDeps();
      store.setDependencies(deps);

      for (const [chatId, options] of [
        ['chat_success', {}],
        ['chat_error', { isError: true }],
        ['chat_abort', { isAbort: true }],
        ['chat_disconnect', { isDisconnect: true }],
      ] as const) {
        store.retainDurableRun({ chatId, runId: `run_${chatId}` });
        harness.created.at(-1)!.finish(options);
      }

      expect(deps.setChatUnreadState.mock.calls).toEqual([
        ['chat_success', true],
        ['chat_error', true],
      ]);
    });

    it('marks a new unattended approval once while it remains pending', () => {
      const store = new ChatSessionStore();
      const deps = createStubDeps();
      store.setDependencies(deps);
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

      expect(deps.setChatUnreadState).toHaveBeenCalledOnce();
      expect(deps.setChatUnreadState).toHaveBeenCalledWith('chat_approval', true);
    });

    it('does not mark terminal or approval events viewed in an active document', () => {
      const store = new ChatSessionStore();
      const deps = createStubDeps();
      store.setDependencies(deps);
      store.acquire('chat_active');
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

      expect(deps.setChatUnreadState).not.toHaveBeenCalled();
    });

    it('marks a terminal event when its mounted view is hidden', () => {
      vi.stubGlobal('document', { visibilityState: 'hidden', hasFocus: () => false });
      const store = new ChatSessionStore();
      const deps = createStubDeps();
      store.setDependencies(deps);
      store.acquire('chat_hidden');

      harness.created[0]!.finish();

      expect(deps.setChatUnreadState).toHaveBeenCalledWith('chat_hidden', true);
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

    it('subscribeStatus and subscribeUsage notify only their respective chatIds', () => {
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

    it('publishes a zero usage aggregate after the only priced turn is removed', () => {
      const store = createStore();
      store.acquire('chat_usage_zero');
      const fake = harness.created.find((chat) => chat.id === 'chat_usage_zero')!;
      const usage = vi.fn();
      store.subscribeUsage('chat_usage_zero', usage);
      fake.messages = [
        {
          id: 'assistant_priced',
          role: 'assistant',
          metadata: { createdAt: 1 },
          parts: [{ type: 'data-usage', data: { totalCost: 0.42 } }],
        } as unknown as MyUIMessage,
      ];
      fake.emitMessagesChange();
      expect(store.getUsage('chat_usage_zero')?.totalCost).toBe(0.42);

      fake.messages = [];
      fake.emitMessagesChange();

      expect(store.getUsage('chat_usage_zero')?.totalCost).toBe(0);
      expect(usage).toHaveBeenCalledTimes(2);
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
        const store = new ChatSessionStore();
        const deps = createStubDeps();
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
            { type: 'file', url: 'data:image/png;base64,AAA', mediaType: 'image/png' },
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
        expect(draftSnapshot.context.draftImages).toEqual(['data:image/png;base64,AAA']);

        await Promise.resolve();

        expect(deps.commitCancelledDraftRestore).toHaveBeenCalledTimes(1);
        const [restoreChatId, restoreInput] = deps.commitCancelledDraftRestore.mock.calls[0]!;
        expect(restoreChatId).toBe(chatId);
        expect(restoreInput.messages).toEqual([priorUser, priorAssistant]);
        expect(restoreInput.draft.id).toBe('draft');
        expect(restoreInput.draft.role).toBe('user');
        expect(restoreInput.draft.parts).toEqual(cancelledUser.parts);
        expect(restoreInput.draft.metadata?.status).toBe('pending');
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
        expect(draftSnapshot.context.draftImages).toEqual([]);

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
      deps.commitCancelledDraftRestore.mockImplementation(async (_chatId, input) => {
        storedChat = {
          ...storedChat,
          messages: input.messages,
          draft: input.draft,
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
      await Promise.resolve();

      expect(storedChat.messages).toEqual([]);
      expect(storedChat.draft?.parts).toEqual(cancelledUser.parts);

      const secondSession = store.acquire(chatId);
      await Promise.resolve();
      await Promise.resolve();

      const secondFake = harness.created.at(-1)!;
      expect(secondFake.id).toBe(chatId);
      expect(secondFake.regenerate).not.toHaveBeenCalled();
      expect(secondFake.messages).toEqual([]);
      expect(secondSession.draftActorRef.getSnapshot().context.draftText).toBe('make a planetary gear');

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
        execution: { workspaceId: 'workspace_startup', baseRevisionId: 'revision_startup', hostId: 'host_startup' },
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
      const restoredChat: ChatEntity = {
        ...orphanChat,
        messages: [],
        draft: {
          id: 'draft',
          role: 'user',
          parts: pendingUserMessage.parts,
          metadata: { createdAt: 2, status: 'pending' },
        },
      };
      deps.getChat.mockResolvedValue(orphanChat);
      deps.commitCancelledDraftRestore.mockResolvedValue(restoredChat);

      const session = store.acquire('chat_orphan_pending');

      await Promise.resolve();
      await Promise.resolve();

      const fake = harness.created.find((entry) => entry.id === 'chat_orphan_pending')!;
      expect(fake.regenerate).not.toHaveBeenCalled();
      expect(deps.consumeChatStartupRequest).not.toHaveBeenCalled();
      const [restoreChatId, restoreInput] = deps.commitCancelledDraftRestore.mock.calls[0]!;
      expect(restoreChatId).toBe('chat_orphan_pending');
      expect(restoreInput.messages).toEqual([]);
      expect(restoreInput.draft.id).toBe('draft');
      expect(restoreInput.draft.role).toBe('user');
      expect(restoreInput.draft.parts).toEqual(pendingUserMessage.parts);
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

      await Promise.resolve();
      await Promise.resolve();

      const fake = harness.created.find((entry) => entry.id === 'chat_orphan_placeholder')!;
      expect(fake.regenerate).not.toHaveBeenCalled();
      const [restoreChatId, restoreInput] = deps.commitCancelledDraftRestore.mock.calls[0]!;
      expect(restoreChatId).toBe('chat_orphan_placeholder');
      expect(restoreInput.messages).toEqual([priorAssistant]);
      expect(restoreInput.draft.id).toBe('draft');
      expect(restoreInput.draft.parts).toEqual(pendingUserMessage.parts);
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
