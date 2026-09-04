// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- mock for AI SDK's Chat class uses the SDK's own `~`-prefixed subscriber method names verbatim so the mock surface matches the real one. */
/* eslint-disable @typescript-eslint/explicit-member-accessibility -- mock class constructor omits the `public` keyword to mirror the AI SDK's published shape. */
/* eslint-disable @typescript-eslint/member-ordering -- mock class field ordering mirrors the AI SDK's source layout for readability. */
/**
 * Regression test for the "create + type + submit on a freshly-created chat
 * swallows the message and persists to the wrong chatId" bug.
 *
 * Original symptom:
 *   1. User submits in chat A → message streams + persists to chat A.
 *   2. User clicks "new chat" → editor's `focusedChatId` flips to chat B
 *      (a fresh row in IndexedDB).
 *   3. User types and submits in chat B → message is silently swallowed
 *      and / or `patchChat` is fired against chat A's id, blowing away
 *      chat A's history.
 *
 * Root cause: `<ChatInstance>` was keyed on the React subtree (no `key`
 * prop), so React reused the same component instance across the chatId
 * swap. The bound `useChat` instance still held chat A's id, the
 * persistence actor kept chat A's id in its context, and the swap raced
 * with `setActiveChatId` so a `queuePersist` could fire mid-swap.
 *
 * The fix is structural: `ChatSessionStore` owns one isolated `Chat` +
 * persistence actor + draft actor per chatId, and they live outside the
 * React tree. Submitting on a freshly-acquired session can only ever
 * target that session's chatId — there is no shared state to leak across.
 *
 * This test pins the contract end-to-end against the store: acquire two
 * sessions, dispatch a `send` against the second, and assert the
 * `patchChat` calls observed by the project manager only ever reference
 * the second chatId. (The first chat must remain untouched even though
 * it was acquired earlier.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyUIMessage } from '@taucad/chat';

type FakeChatInstance = {
  id: string;
  messages: unknown[];
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  error: Error | undefined;
  sendMessage: (message: unknown) => Promise<void>;
  regenerate: () => Promise<void>;
  stop: () => Promise<void>;
  finishStream: () => void;
};

const harness = vi.hoisted(() => ({
  created: [] as FakeChatInstance[],
  patchChat: vi.fn().mockResolvedValue(undefined),
  setMessageEdit: vi.fn().mockResolvedValue(undefined),
  clearMessageEdit: vi.fn().mockResolvedValue(undefined),
  getChat: vi.fn().mockResolvedValue(undefined),
  consumeChatStartupRequest: vi.fn().mockResolvedValue(undefined),
  commitCancelledDraftRestore: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@ai-sdk/react', () => ({
  // oxlint-disable-next-line typescript-eslint/no-extraneous-class -- mock requires a `new`able value
  Chat: class {
    public id: string;
    public messages: unknown[] = [];
    public status: 'submitted' | 'streaming' | 'ready' | 'error' = 'ready';
    public error: Error | undefined;
    readonly #onFinish: ((argument: { messages: unknown[]; isAbort: boolean; isError: boolean }) => void) | undefined;
    readonly #messagesListeners = new Set<() => void>();
    readonly #statusListeners = new Set<() => void>();
    readonly #errorListeners = new Set<() => void>();

    public sendMessage: (message: unknown) => Promise<void>;
    public regenerate: () => Promise<void>;
    public stop: () => Promise<void>;

    constructor(init: {
      id: string;
      onFinish?: (argument: { messages: unknown[]; isAbort: boolean; isError: boolean }) => void;
    }) {
      this.id = init.id;
      this.#onFinish = init.onFinish;

      this.sendMessage = vi.fn(async (message: unknown) => {
        this.messages = [...this.messages, message];
        for (const l of this.#messagesListeners) {
          l();
        }
        this.status = 'streaming';
        for (const l of this.#statusListeners) {
          l();
        }
      });

      this.regenerate = vi.fn(async () => undefined);
      this.stop = vi.fn(async () => undefined);

      const finishStream = () => {
        this.status = 'ready';
        for (const l of this.#statusListeners) {
          l();
        }
        this.#onFinish?.({ messages: this.messages, isAbort: false, isError: false });
      };

      const fake: FakeChatInstance = Object.assign(this, { finishStream });
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
  // `shared-chat-transport` hands this predicate to `Chat` as
  // `sendAutomaticallyWhen`; the fake `Chat` above never calls it.
  lastAssistantMessageIsCompleteWithApprovalResponses: vi.fn(() => false),
}));

vi.mock('#environment.config.js', () => ({
  ENV: { TAU_API_URL: 'http://test.local' },
}));

vi.mock('#machines/inspector.js', () => ({
  inspect: undefined,
}));

const { ChatSessionStore } = await import('#services/chat-session-store.js');

// Every dispatched verb carries the per-turn wire body the chat-client
// composes (`chatTurnRequestSchema` shape). A bodyless `send` now parks in
// `#waitForLatestAgentBody` until a client publishes one, so the regression
// below must attach the body the way `useCadChatClient` does.
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
  admission: Object.freeze({ version: 1, idempotencyKey: 'req_test_new_chat_submit' }),
});

describe('new chat submit regression', () => {
  beforeEach(() => {
    harness.created = [];
    harness.patchChat.mockReset().mockResolvedValue(undefined);
    harness.setMessageEdit.mockReset().mockResolvedValue(undefined);
    harness.clearMessageEdit.mockReset().mockResolvedValue(undefined);
    harness.getChat.mockReset().mockResolvedValue(undefined);
    harness.consumeChatStartupRequest.mockReset().mockResolvedValue(undefined);
    harness.commitCancelledDraftRestore.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists a submit on the freshly-acquired chat to its own chatId only', async () => {
    const store = new ChatSessionStore();
    store.setDependencies({
      getChat: harness.getChat,
      patchChat: harness.patchChat,
      touchChatRecency: vi.fn().mockResolvedValue(undefined),
      setChatUnreadState: vi.fn().mockResolvedValue(undefined),
      setMessageEdit: harness.setMessageEdit,
      clearMessageEdit: harness.clearMessageEdit,
      consumeChatStartupRequest: harness.consumeChatStartupRequest,
      commitCancelledDraftRestore: harness.commitCancelledDraftRestore,
    });

    // Pre-acquire the "previous focused chat" — this mirrors the route having
    // chat_old loaded before the user creates chat_new.
    store.acquire('chat_old');

    // User clicks "new chat" → focusedChatId flips → store acquires chat_new.
    const newSession = store.acquire('chat_new');

    expect(newSession.chatId).toBe('chat_new');
    expect(newSession.chat.id).toBe('chat_new');

    // User types and submits on chat_new.
    newSession.persistenceActorRef.send({
      type: 'startRequest',
      request: {
        kind: 'send',
        message: { id: 'msg_1', role: 'user', parts: [{ type: 'text', text: 'hello chat_new' }] },
        body: testRunBody,
      },
    });

    // Allow the dispatchRequest fan-out + sendMessage promise to flush.
    await Promise.resolve();
    await Promise.resolve();

    // The send was routed to the chat_new Chat instance.
    const newChat = harness.created.find((c) => c.id === 'chat_new');
    expect(newChat).toBeDefined();
    expect(newChat?.sendMessage).toHaveBeenCalledTimes(1);

    // The chat_old Chat instance was never asked to send anything.
    const oldChat = harness.created.find((c) => c.id === 'chat_old');
    expect(oldChat?.sendMessage).not.toHaveBeenCalled();

    // Stream finishes → onFinish → persistence machine queues a persist for
    // chat_new. We wait for the queued patchChat to flush.
    newChat?.finishStream();

    // The persistence machine debounces queuePersist by 100ms; we wait
    // enough for: hydration to settle, the debounce to elapse, and the
    // resulting patchChat to flush.
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });

    // CRITICAL CONTRACT: every patchChat call observed by the project
    // manager must reference chat_new — never chat_old. This is the
    // structural fix for the original regression.
    const observedChatIds = harness.patchChat.mock.calls.map((call) => call[0] as string);
    expect(observedChatIds.length).toBeGreaterThan(0);
    for (const targetChatId of observedChatIds) {
      expect(targetChatId).toBe('chat_new');
    }
  });

  it('does not swallow the submit (sendMessage receives the typed text)', async () => {
    const store = new ChatSessionStore();
    store.setDependencies({
      getChat: harness.getChat,
      patchChat: harness.patchChat,
      touchChatRecency: vi.fn().mockResolvedValue(undefined),
      setChatUnreadState: vi.fn().mockResolvedValue(undefined),
      setMessageEdit: harness.setMessageEdit,
      clearMessageEdit: harness.clearMessageEdit,
      consumeChatStartupRequest: harness.consumeChatStartupRequest,
      commitCancelledDraftRestore: harness.commitCancelledDraftRestore,
    });

    store.acquire('chat_old');
    const newSession = store.acquire('chat_new');

    const userMessage: MyUIMessage = {
      id: 'msg_user_1',
      role: 'user',
      parts: [{ type: 'text', text: 'My typed text from the composer' }],
    };

    newSession.persistenceActorRef.send({
      type: 'startRequest',
      request: { kind: 'send', message: userMessage, body: testRunBody },
    });

    await Promise.resolve();
    await Promise.resolve();

    const newChat = harness.created.find((c) => c.id === 'chat_new');
    expect(newChat?.sendMessage).toHaveBeenCalledWith(userMessage, { body: testRunBody });
  });
});
