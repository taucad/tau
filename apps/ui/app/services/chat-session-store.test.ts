// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- mock for AI SDK's Chat / DefaultChatTransport classes uses the SDK's own PascalCase names and `~`-prefixed subscriber method names verbatim so the mock surface matches the real one. */
/* eslint-disable @typescript-eslint/explicit-member-accessibility -- mock class constructors omit the `public` keyword to mirror the AI SDK's published shape. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chat as ChatEntity, MyUIMessage } from '@taucad/chat';
import { chatTurnRequestSchema } from '@taucad/chat/schemas';
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
  stop: ReturnType<typeof vi.fn>;
  // Private in AI SDK source; the chat-session-store reaches it via a typed
  // shim. The mock exposes it as a public spy so tests can assert the
  // continuation path calls it with the expected arg shape.
  makeRequest: ReturnType<typeof vi.fn>;
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
    public stop = vi.fn().mockResolvedValue(undefined);
    public makeRequest = vi.fn().mockResolvedValue(undefined);
    readonly #messagesListeners = new Set<() => void>();
    readonly #statusListeners = new Set<() => void>();
    readonly #errorListeners = new Set<() => void>();

    constructor(init: { id: string; messages?: MyUIMessage[] }) {
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
}));

vi.mock('#environment.config.js', () => ({
  ENV: { TAU_API_URL: harness.envApi },
}));

vi.mock('#machines/inspector.js', () => ({
  inspect: undefined,
}));

const { ChatSessionStore } = await import('#services/chat-session-store.js');
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
    setMessageEdit: vi.fn<ChatSessionDeps['setMessageEdit']>().mockResolvedValue(undefined),
    clearMessageEdit: vi.fn<ChatSessionDeps['clearMessageEdit']>().mockResolvedValue(undefined),
  };
}

function createStore(): StoreType {
  const store = new ChatSessionStore();
  store.setDependencies(createStubDeps());
  return store;
}

describe('ChatSessionStore', () => {
  beforeEach(() => {
    harness.created = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // acquire / release refcounting
  // ===========================================================================

  describe('acquire / release', () => {
    it('creates a session lazily on first acquire', () => {
      const store = createStore();
      const session = store.acquire('chat_a');

      expect(session.chatId).toBe('chat_a');
      expect(session.chat.id).toBe('chat_a');
      expect(session.persistenceActorRef).toBeDefined();
      expect(session.draftActorRef).toBeDefined();
      expect(harness.created).toHaveLength(1);
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
    it('lifts the cancelled user message back into the draft, truncates chat.messages, and persists the trimmed transcript', async () => {
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

        // Flush the debounced persist of the truncated transcript.
        await vi.advanceTimersByTimeAsync(100);
        await vi.runOnlyPendingTimersAsync();

        const messagesPersistCalls = deps.patchChat.mock.calls.filter(([, key]) => key === 'messages');
        expect(messagesPersistCalls.length).toBeGreaterThanOrEqual(1);
        expect(messagesPersistCalls.at(-1)?.[2]).toEqual([priorUser, priorAssistant]);

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

    /**
     * Phase D / t20 regression coverage.
     *
     * A persisted chat with a pending-tail user message that carries legacy
     * `metadata.kernel`/`metadata.model`/`metadata.testingEnabled` still
     * exists for any chat row written before the blueprint cut. Hydration
     * MUST NOT read that metadata onto the wire body — the auto-regenerate
     * must use whatever `useCadChatClient` published into
     * `setLatestAgentBody`, and the resulting body must parse cleanly
     * through the shared `chatTurnRequestSchema`. Without this guard, a
     * homepage-seeded chat reloaded after the schema cut would 400 on the
     * first turn because the persisted metadata path is no longer
     * read-through.
     */
    it('hydration auto-regenerate on a legacy pending-tail uses latestAgentBody (NOT persisted message metadata) and produces a wire body that parses through chatTurnRequestSchema', async () => {
      const store = new ChatSessionStore();
      const deps = createStubDeps();
      store.setDependencies(deps);

      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal MyUIMessage shape for test
      const legacyPendingUserMessage: MyUIMessage = {
        id: 'msg_legacy_pending',
        role: 'user',
        parts: [{ type: 'text', text: 'pre-blueprint prompt' }],
        metadata: {
          // Legacy fields previously stamped onto the persisted user message
          // by `createMessage({ metadata: { kernel, model, mode, ... } })`.
          // None of these should reach the wire body in the new architecture.
          createdAt: 1_700_000_000_000,
          status: 'pending',
          model: 'legacy-stale-model',
          kernel: 'replicad',
          mode: 'agent',
          toolChoice: 'auto',
          testingEnabled: false,
        },
      } as MyUIMessage;

      const legacyChat: ChatEntity = {
        id: 'chat_legacy_hydration',
        resourceId: 'resource_legacy',
        name: 'Legacy chat',
        messages: [legacyPendingUserMessage],
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      };
      deps.getChat.mockResolvedValue(legacyChat);

      // Publish the *current* agent body before acquiring — mirrors what
      // `useCadChatClient`'s mount effect does for the active chat.
      const liveBody = {
        agent: {
          profile: 'cad',
          model: 'openai-gpt-5.5',
          kernel: 'replicad',
          mode: 'agent',
          toolChoice: 'auto',
          testingEnabled: true,
        },
      };
      store.acquire('chat_legacy_hydration');
      store.setLatestAgentBody('chat_legacy_hydration', liveBody);

      // Allow hydration → auto-regenerate dispatch → microtask deferral to drain.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const fake = harness.created.find((entry) => entry.id === 'chat_legacy_hydration')!;
      expect(fake.regenerate).toHaveBeenCalledTimes(1);
      const dispatchedOptions = fake.regenerate.mock.calls[0]![0] as { body?: Record<string, unknown> } | undefined;
      expect(dispatchedOptions?.body).toBe(liveBody);

      const wireBody = {
        id: 'chat_legacy_hydration',
        messages: legacyChat.messages,
        ...dispatchedOptions?.body,
      };
      const parsed = chatTurnRequestSchema.parse(wireBody);
      expect(parsed.agent).toMatchObject({
        profile: 'cad',
        // Live agent values survive — never the legacy persisted metadata.
        model: 'openai-gpt-5.5',
        testingEnabled: true,
      });

      store.release('chat_legacy_hydration');
    });
  });

  // ===========================================================================
  // R4 + R1: onFinish forwards isDisconnect, dispatchRequest({kind:'continue'})
  // calls makeRequest({trigger:'submit-message'}) without slicing chat.messages
  // ===========================================================================
  describe('resumable streams (R4 plumbing + R1 continue dispatch)', () => {
    it('dispatchRequest { kind: "continue" } calls chat.makeRequest({ trigger: "submit-message" }) and does NOT mutate chat.messages', async () => {
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
        } as MyUIMessage,
      ];
      fake.messages = before;
      const beforeRef = fake.messages;

      session.persistenceActorRef.send({ type: 'startRequest', request: { kind: 'continue' } });

      // The dispatchRequest listener defers AI SDK calls onto a microtask
      // so they never run nested inside an outer makeRequest's finally
      // (see docs/research/chat-followup-message-swallow.md).
      await Promise.resolve();

      expect(fake.makeRequest).toHaveBeenCalledTimes(1);
      expect(fake.makeRequest).toHaveBeenCalledWith({ trigger: 'submit-message' });
      // Identity check: chat.messages reference unchanged.
      expect(fake.messages).toBe(beforeRef);
      expect(fake.regenerate).not.toHaveBeenCalled();
      expect(fake.sendMessage).not.toHaveBeenCalled();
    });

    /**
     * Regression: when the user clicks the "Retry" button on the
     * `ChatErrorServiceUnavailable` banner (or the persistence machine's
     * transparent auto-retry fires), the resumed POST must still carry the
     * top-level `agent` block required by `chatTurnRequestSchema`. Before the
     * fix the `continue` dispatch called `makeRequest({ trigger: 'submit-message' })`
     * with no body, the AI SDK transport produced `{ id, messages, trigger }`,
     * and the API rejected it with `agent: expected object, received undefined`.
     */
    it('forwards latestAgentBody as `body` on `continue` so the resumed POST carries the agent block', async () => {
      const store = createStore();
      const session = store.acquire('chat_resume_agent');
      const fake = harness.created.find((entry) => entry.id === 'chat_resume_agent')!;

      const latestBody = { agent: { profile: 'cad', model: 'cad-default', kernel: 'replicad' } };
      store.setLatestAgentBody('chat_resume_agent', latestBody);

      session.persistenceActorRef.send({ type: 'startRequest', request: { kind: 'continue' } });

      await Promise.resolve();

      expect(fake.makeRequest).toHaveBeenCalledTimes(1);
      expect(fake.makeRequest).toHaveBeenCalledWith({ trigger: 'submit-message', body: latestBody });
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

      const overrideBody = { agent: { profile: 'cad', model: 'new-model', kernel: 'replicad' } };
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
      expect(fake.regenerate).toHaveBeenCalledWith({ body: overrideBody });
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
  // to `chat.regenerate`; model selection travels via `body.agent.model`
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

      const overrideBody = { agent: { profile: 'cad', model: 'new-model', kernel: 'replicad' } };
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
      expect(fake.regenerate).toHaveBeenCalledWith({ body: overrideBody });
      // The assistant turn was sliced off; the previous user message is
      // unchanged (no metadata patching — model selection lives in
      // `body.agent.model`).
      expect(fake.messages).toHaveLength(1);
      expect(fake.messages[0]!.id).toBe('msg_user_retry');
    });
  });

  // ===========================================================================
  // Hydration auto-regenerate (R10/t17)
  //
  // The legacy pending-tail hydration regenerate now flows through the same
  // `dispatchRequest` listener; without an explicit `request.body` it falls
  // back to `session.latestAgentBody` published by `useCadChatClient` so the
  // very first turn of a homepage-seeded chat still carries an `agent` block.
  // ===========================================================================
  describe('hydration auto-regenerate (R10/t17)', () => {
    it('falls back to latestAgentBody when no explicit body is supplied on regenerate', async () => {
      const store = createStore();
      const session = store.acquire('chat_hydration_regen');
      const fake = harness.created.find((entry) => entry.id === 'chat_hydration_regen')!;

      const latestBody = { agent: { profile: 'cad', model: 'cad-default', kernel: 'replicad' } };
      store.setLatestAgentBody('chat_hydration_regen', latestBody);

      session.persistenceActorRef.send({ type: 'startRequest', request: { kind: 'regenerate' } });

      await Promise.resolve();

      expect(fake.regenerate).toHaveBeenCalledTimes(1);
      expect(fake.regenerate).toHaveBeenCalledWith({ body: latestBody });
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

      session.persistenceActorRef.send({ type: 'startRequest', request: { kind: 'send', message } });

      // Synchronous assertion: the listener has NOT touched the AI SDK yet.
      // This is the core fix -- a synchronous call would re-enter
      // `Chat.makeRequest` inside an outer makeRequest's finally and trigger
      // the activeResponse clobber.
      expect(fake.sendMessage).not.toHaveBeenCalled();

      await Promise.resolve();

      expect(fake.sendMessage).toHaveBeenCalledTimes(1);
      expect(fake.sendMessage).toHaveBeenCalledWith(message);
    });

    it('does NOT call chat.regenerate synchronously inside startRequest dispatch', async () => {
      const store = createStore();
      const session = store.acquire('chat_clobber_regen');
      const fake = harness.created.find((entry) => entry.id === 'chat_clobber_regen')!;

      session.persistenceActorRef.send({ type: 'startRequest', request: { kind: 'regenerate' } });

      expect(fake.regenerate).not.toHaveBeenCalled();

      await Promise.resolve();

      expect(fake.regenerate).toHaveBeenCalledTimes(1);
    });

    it('does NOT call chat.makeRequest synchronously inside continue dispatch', async () => {
      const store = createStore();
      const session = store.acquire('chat_clobber_continue');
      const fake = harness.created.find((entry) => entry.id === 'chat_clobber_continue')!;

      session.persistenceActorRef.send({ type: 'startRequest', request: { kind: 'continue' } });

      expect(fake.makeRequest).not.toHaveBeenCalled();

      await Promise.resolve();

      expect(fake.makeRequest).toHaveBeenCalledTimes(1);
      expect(fake.makeRequest).toHaveBeenCalledWith({ trigger: 'submit-message' });
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
        } as MyUIMessage,
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
        request: { kind: 'send', message: initialMessages[0]! },
      });
      // Drain the microtask so the listener fires for A.
      await Promise.resolve();
      fake.sendMessage.mockClear();

      // Preempt with B (invoking -> stopping, pendingRequest = B-send).
      session.persistenceActorRef.send({
        type: 'startRequest',
        request: { kind: 'send', message: pendingMessage },
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
      expect(fake.sendMessage).toHaveBeenCalledWith(pendingMessage);
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
