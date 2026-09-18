// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- mock for AI SDK's Chat class uses the SDK's own `~`-prefixed subscriber method names verbatim so the mock surface matches the real one. */
/* eslint-disable @typescript-eslint/explicit-member-accessibility -- mock class constructor omits the `public` keyword to mirror the AI SDK's published shape. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { MyUIMessage } from '@taucad/chat';
import type { ChatError } from '@taucad/types';
import { resolveKernel } from '@taucad/types/constants';
import { createActor } from 'xstate';
import { projectSessionMachine } from '#machines/project-session.machine.js';
import { chatSessionMachine } from '#machines/chat-session.machine.js';
import type { ChatTurn, ChatTurnGesture } from '#machines/chat-session.machine.js';
import {
  chatTurnAdmission,
  chatTurnSettlement,
  publishChatTurnAdmission,
  publishChatTurnSettlement,
  resetChatTurnServices,
} from '#chat-clients/_internal/chat-host-binding.js';
import type { ChatSessionStore } from '#services/chat-session-store.js';

// ---------------------------------------------------------------------------
// Hoisted test harness
//
// The store-based architecture wires the AI SDK `Chat` constructor's
// `onFinish` / `onError` callbacks into the persistence machine inside
// `ChatSessionStore.#createSession`. To exercise that wiring end-to-end
// without a real network, we mock `@ai-sdk/react`'s `Chat` class so the
// tests can:
//
// 1. Capture the per-chat `onFinish` / `onError` closures the store passes
//    to `new Chat({...})`.
// 2. Drive `~registerMessagesCallback` / `~registerStatusCallback`
//    listeners deterministically.
// 3. Spy on `sendMessage` / `regenerate` / `stop`.
// 4. Mutate the public `messages` field so the dispatch emits flowing out
//    of `chatPersistenceMachine` (which assign `chat.messages = next`)
//    visibly update the snapshot.
//
// Each `new Chat({ id, ... })` registers itself in `harness.created` so
// tests scoped to multiple chatIds can drive each one independently.
// ---------------------------------------------------------------------------

type FakeChat = {
  id: string;
  messages: MyUIMessage[];
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  error: Error | undefined;
  sendMessage: ReturnType<typeof vi.fn>;
  regenerate: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  // Private in AI SDK source; chat-session-store uses a typed shim. Exposed
  // as a public spy here so we can assert continuation flows.
  makeRequest: ReturnType<typeof vi.fn>;
  resumeStream: ReturnType<typeof vi.fn>;
  emitMessages: () => void;
  emitStatus: () => void;
  onFinish: (event: { messages: MyUIMessage[]; isAbort: boolean; isError: boolean; isDisconnect: boolean }) => void;
  onError: (error: Error) => void;
};

const harness = vi.hoisted(() => ({
  created: [] as FakeChat[],
  patchChat: vi.fn(),
  touchChatRecency: vi.fn(),
  getChat: vi.fn(),
  consumeChatStartupRequest: vi.fn(),
  commitCancelledDraftRestore: vi.fn(),
}));

function getFake(chatId: string): FakeChat {
  const fake = harness.created.find((chat) => chat.id === chatId);
  if (!fake) {
    throw new Error(`No fake Chat created for ${chatId}`);
  }
  return fake;
}

vi.mock('@ai-sdk/react', () => ({
  // oxlint-disable-next-line typescript-eslint/no-extraneous-class -- mock requires a `new`able value
  Chat: class {
    public id: string;
    public status: 'submitted' | 'streaming' | 'ready' | 'error' = 'ready';
    public error: Error | undefined = undefined;
    public messages: MyUIMessage[];
    public sendMessage = vi.fn().mockResolvedValue(undefined);
    public regenerate = vi.fn().mockResolvedValue(undefined);
    public stop = vi.fn().mockResolvedValue(undefined);
    public makeRequest = vi.fn().mockResolvedValue(undefined);
    public resumeStream = vi.fn().mockResolvedValue(undefined);
    readonly #messagesListeners = new Set<() => void>();
    readonly #statusListeners = new Set<() => void>();
    readonly #errorListeners = new Set<() => void>();

    constructor(init: {
      id: string;
      messages?: MyUIMessage[];
      onFinish?: (event: {
        messages: MyUIMessage[];
        isAbort: boolean;
        isError: boolean;
        isDisconnect: boolean;
      }) => void;
      onError?: (error: Error) => void;
    }) {
      this.id = init.id;
      this.messages = init.messages ?? [];
      const fake: FakeChat = Object.assign(this, {
        // oxlint-disable-next-line no-empty-function -- default no-op until store wires its callback
        onFinish: init.onFinish ?? (() => {}),
        // oxlint-disable-next-line no-empty-function -- default no-op until store wires its callback
        onError: init.onError ?? (() => {}),
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

    public emitMessages = (): void => {
      for (const listener of this.#messagesListeners) {
        listener();
      }
    };

    public emitStatus = (): void => {
      for (const listener of this.#statusListeners) {
        listener();
      }
    };
  },
}));

vi.mock('ai', () => ({
  // oxlint-disable-next-line typescript-eslint/no-extraneous-class -- mock requires a `new`able value
  DefaultChatTransport: class {},
  lastAssistantMessageIsCompleteWithApprovalResponses: vi.fn(() => false),
}));

vi.mock('#environment.config.js', () => ({
  ENV: { TAU_API_URL: 'http://test.local' },
}));

vi.mock('#machines/inspector.js', () => ({
  inspect: undefined,
}));

vi.mock('#utils/error.utils.js', () => ({
  parseErrorForPersistence: (error: Error): ChatError => ({
    category: 'generic',
    title: 'Stub error',
    message: error.message,
    code: 'INTERNAL_ERROR',
  }),
}));

// The session store and the composer provider reach composer records and
// attachments through the worker filesystem client; an in-memory one stands
// in for it, starting empty.
const fileManager = vi.hoisted(() => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const notFound = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
  const under = (path: string): string[] =>
    [...files.keys()].filter((entry) => entry.startsWith(`${path}/`)).map((entry) => entry.slice(path.length + 1));
  return {
    client: {
      async readFile(path: string) {
        const bytes = files.get(path);
        if (bytes === undefined) {
          throw notFound(path);
        }
        return bytes;
      },
      async writeFile(path: string, data: Uint8Array<ArrayBuffer>) {
        files.set(path, data);
      },
      exists: async (path: string) => files.has(path),
      async readdir(path: string) {
        const names = under(path);
        if (names.length === 0) {
          throw notFound(path);
        }
        return names;
      },
      async unlink(path: string) {
        files.delete(path);
      },
      async rmdir(path: string) {
        for (const name of under(path)) {
          files.delete(`${path}/${name}`);
        }
      },
    },
  };
});

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => fileManager,
  useOptionalFileManager: () => fileManager,
}));

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({
    patchChat: harness.patchChat,
    touchChatRecency: harness.touchChatRecency,
    getChat: harness.getChat,
    consumeChatStartupRequest: harness.consumeChatStartupRequest,
    commitCancelledDraftRestore: harness.commitCancelledDraftRestore,
  }),
}));

// `<ChatComposerProvider>` and `<ActiveChatProvider>` both populate the
// unified composer context, which means they now read the cookie-backed
// model/kernel hooks at mount time. The real `useModels`/`useKernel`
// reach `useRouteLoaderData('root')` for the cookie payload — that
// throws under `renderHook` because no react-router data router is
// mounted. Stub them with module-local defaults so the provider's
// strategy helpers can resolve without the router context.
vi.mock('#hooks/use-models.js', () => ({
  useModels: () => ({
    selectedModelId: 'cookie-model',
    setSelectedModelId: vi.fn(),
    selectedModel: { id: 'cookie-model', name: 'Cookie Model', isResolved: true },
    resolveModel: (id: string) => ({ id, name: id, isResolved: false }),
    data: [],
    isLoading: false,
  }),
}));

vi.mock('#hooks/use-kernel.js', () => ({
  useKernel: () => ({
    kernel: 'openscad',
    setKernel: vi.fn(),
    selectedKernel: resolveKernel('openscad'),
  }),
}));

const { ChatSessionStoreProvider, useChatSessionStore } = await import('#hooks/chat-session-store-provider.js');
const { ActiveChatProvider, ChatComposerProvider } = await import('#hooks/active-chat-provider.js');
const { useChatActions, useChatContext, useChatSelector, useChatById, useDraftActions, useDraftSelector } =
  await import('#hooks/use-chat.js');

function makeUserMessage(id: string, text: string): MyUIMessage {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', text }],
    metadata: { createdAt: 0, status: 'pending' },
  };
}

/**
 * `loadChatActor` heals plain trailing pending user messages back into the
 * composer, which would unintentionally clear `persistedError` mid-test.
 * Tests that pre-load a chat use this `success`-status variant instead.
 */
function makeLoadedUserMessage(id: string, text: string): MyUIMessage {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', text }],
    metadata: { createdAt: 0, status: 'success' },
  };
}

function makeAssistantMessage(id: string, text: string): MyUIMessage {
  return {
    id,
    role: 'assistant',
    parts: [{ type: 'text', text, state: 'done' }],
    metadata: { createdAt: 0 },
  };
}

const sampleChatError: ChatError = {
  category: 'generic',
  title: 'Boom',
  message: 'Something failed',
  code: 'INTERNAL_ERROR',
};

const defaultTestChatId = 'chat_test_default';

/**
 * Mounts the full new-architecture stack: `<ChatSessionStoreProvider>`
 * (singleton vanilla store) → `<ActiveChatProvider>` (per-subtree active
 * chat + draft binding which acquires the session from the store).
 *
 * Post-Layer-0 split: `<ActiveChatProvider>` always requires a real
 * `chatId: string`. For draft-only / marketing tests, use
 * {@link createComposerWrapper} instead.
 */
function createWrapper(chatId: string = defaultTestChatId) {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <ChatSessionStoreProvider>
        <ActiveChatProvider chatId={chatId}>{children}</ActiveChatProvider>
      </ChatSessionStoreProvider>
    );
  };
}

/**
 * Composer-only wrapper for draft-mode tests. Mirrors what marketing
 * routes (CTA section, library empty state) mount — no session is
 * acquired, only the draft actor is provided.
 */
function createComposerWrapper() {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <ChatSessionStoreProvider>
        <ChatComposerProvider surface='marketing'>{children}</ChatComposerProvider>
      </ChatSessionStoreProvider>
    );
  };
}

/**
 * The per-turn `agent` block one chat's admission composes.
 *
 * Not optional decoration: `ChatSessionStore` dispatches nothing without a
 * body, and the body now comes from the chat's own admission — the fix for a
 * run executing against a workspace id no claim carried. A test that omits the
 * turn owner is asserting the absence of the invariant.
 */
const defaultAgentBody = {
  agent: { profile: 'cad', execution: { kind: 'tau', model: 'cad-default' }, kernel: 'replicad' },
};

/** `defaultAgentBody` as it reaches the wire, with the store's admission fence. */
const dispatchedBody: Readonly<Record<string, unknown>> = {
  ...defaultAgentBody,
  admission: { version: 1, idempotencyKey: expect.any(String) as unknown as string },
};

const testProjectId = 'proj_test';

/** The admission the route publishes, with the transport and the lease stubbed out. */
const testAdmission = async (gesture: ChatTurnGesture): Promise<ChatTurn> => ({
  runId: `run_${gesture.kind}`,
  leaseTurnId: undefined,
  request:
    gesture.kind === 'send'
      ? { kind: 'send', message: gesture.message, body: defaultAgentBody }
      : gesture.kind === 'edit'
        ? { kind: 'edit', messageId: gesture.messageId, content: gesture.text, body: defaultAgentBody }
        : gesture.kind === 'continue'
          ? { kind: 'continue', body: defaultAgentBody }
          : { kind: 'regenerate', body: defaultAgentBody },
});

/**
 * Give the chat a turn owner.
 *
 * Every verb now goes through `chat-session.machine`'s `run` region (C3), so a
 * test that drives a verb has to give the chat the actor that owns its turn —
 * a real project session with a real chat session under it, and the route's
 * admission published through the same seam production uses.
 */
function startTurnOwner(store: ChatSessionStore, chatId: string, admit = testAdmission): () => void {
  const session = createActor(
    projectSessionMachine.provide({
      actors: {
        chatSession: chatSessionMachine.provide({
          actors: { admitTurn: chatTurnAdmission, settleTurn: chatTurnSettlement },
        }),
      },
    }),
    { input: { projectId: testProjectId } },
  );
  session.start();
  const unpublish = publishChatTurnAdmission(chatId, admit);
  /* The route publishes both; a turn that cannot be settled never releases the
   * chat, so a harness that omits this is asserting the absence of the owner. */
  const unpublishSettlement = publishChatTurnSettlement(chatId, async () => undefined);
  store.setFocusedProject(testProjectId);
  store.setProjectSession(testProjectId, session);
  return () => {
    unpublish();
    unpublishSettlement();
    store.setProjectSession(testProjectId, undefined);
    session.stop();
  };
}

function renderProvider(chatId: string = defaultTestChatId) {
  const rendered = renderHook(
    () => ({
      actions: useChatActions(),
      context: useChatContext(),
      store: useChatSessionStore(),
    }),
    { wrapper: createWrapper(chatId) },
  );
  act(() => {
    stopTurnOwner = startTurnOwner(rendered.result.current.store, chatId);
  });
  return rendered;
}

/** Torn down in `afterEach` so one test's project session never binds the next one's chat. */
let stopTurnOwner: (() => void) | undefined;

describe('chat session lifecycle wiring (via ChatSessionStore)', () => {
  beforeEach(() => {
    harness.created = [];
    harness.getChat.mockReset().mockResolvedValue(undefined);
    harness.patchChat.mockReset().mockResolvedValue(undefined);
    harness.touchChatRecency.mockReset().mockResolvedValue(undefined);
    harness.consumeChatStartupRequest.mockReset().mockResolvedValue(undefined);
    harness.commitCancelledDraftRestore.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    stopTurnOwner?.();
    stopTurnOwner = undefined;
    resetChatTurnServices();
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Direct emit listener wiring: each request kind lands on the correct AI
  // SDK call. These tests anchor the contract that `requestLifecycle` emits
  // are translated faithfully by the store-side dispatch listeners.
  // ===========================================================================

  it('records accepted user actions once and ignores invalid targets and stop', () => {
    const { result } = renderHook(() => ({ actions: useChatActions(), store: useChatSessionStore() }), {
      wrapper: createWrapper(defaultTestChatId),
    });
    const user = makeUserMessage('msg_user_activity', 'activity');
    const assistant = makeAssistantMessage('msg_assistant_activity', 'answer');
    getFake(defaultTestChatId).messages = [user, assistant];
    expect(assistant.id).toBeDefined();
    act(() => {
      stopTurnOwner = startTurnOwner(result.current.store, defaultTestChatId);
    });

    act(() => {
      void result.current.actions.sendMessage(user);
      result.current.actions.regenerate();
      result.current.actions.continueChat();
      result.current.actions.editMessage(user.id, 'edited');
      result.current.actions.stop();
      result.current.actions.editMessage('missing-edit', 'ignored');
    });

    expect(harness.touchChatRecency).toHaveBeenCalledTimes(4);
    expect(harness.touchChatRecency).toHaveBeenNthCalledWith(1, defaultTestChatId, user.metadata?.createdAt);
    expect(harness.touchChatRecency.mock.calls.slice(1)).toEqual([
      [defaultTestChatId, expect.any(Number)],
      [defaultTestChatId, expect.any(Number)],
      [defaultTestChatId, expect.any(Number)],
    ]);
  });

  it('routes a `send` request through to chat.sendMessage', async () => {
    const { result } = renderProvider();
    const message = makeUserMessage('msg_1', 'hello');

    act(() => {
      void result.current.actions.sendMessage(message);
    });
    // `dispatchRequest` defers the AI SDK call onto a microtask to dodge
    // the preempt-clobber bug (see chat-session-store.ts docstring).
    const fake = getFake(defaultTestChatId);
    await waitFor(() => {
      expect(fake.sendMessage).toHaveBeenCalledTimes(1);
    });
    expect(fake.sendMessage).toHaveBeenCalledWith(message, { body: dispatchedBody });
    expect(harness.touchChatRecency).toHaveBeenCalledOnce();
    expect(harness.touchChatRecency).toHaveBeenCalledWith(defaultTestChatId, message.metadata?.createdAt);
    expect(fake.regenerate).not.toHaveBeenCalled();
    expect(fake.stop).not.toHaveBeenCalled();
  });

  it('routes a `regenerate` request through to chat.regenerate', async () => {
    const { result } = renderProvider();

    act(() => {
      result.current.actions.regenerate();
    });
    const fake = getFake(defaultTestChatId);
    await waitFor(() => {
      expect(fake.regenerate).toHaveBeenCalledTimes(1);
    });
    expect(fake.regenerate).toHaveBeenCalledWith({ body: dispatchedBody });
    expect(harness.touchChatRecency).toHaveBeenCalledWith(defaultTestChatId, expect.any(Number));
    expect(fake.sendMessage).not.toHaveBeenCalled();
  });

  it('routes a `continueChat` request through to chat.resumeStream', async () => {
    const { result } = renderProvider();

    act(() => {
      result.current.actions.continueChat();
    });
    const fake = getFake(defaultTestChatId);
    await waitFor(() => {
      expect(fake.resumeStream).toHaveBeenCalledTimes(1);
    });
    expect(fake.resumeStream).toHaveBeenCalledWith({ body: dispatchedBody });
    expect(fake.regenerate).not.toHaveBeenCalled();
    expect(fake.sendMessage).not.toHaveBeenCalled();
    expect(harness.touchChatRecency).toHaveBeenCalledWith(defaultTestChatId, expect.any(Number));
  });

  /**
   * Regression for the "Unable to reach Tau" Retry banner: when the resumed
   * stream re-issues the POST it MUST carry the per-turn `agent` block the
   * chat's admission composed. Otherwise the API rejects the retry with
   * `agent: expected object, received undefined`.
   */
  it('threads the admitted body onto the resumed stream for continueChat', async () => {
    const { result } = renderHook(
      () => ({
        actions: useChatActions(),
        store: useChatSessionStore(),
      }),
      { wrapper: createWrapper(defaultTestChatId) },
    );

    const latestBody = {
      agent: { profile: 'cad', execution: { kind: 'tau', model: 'cad-default' }, kernel: 'replicad' },
    };
    act(() => {
      stopTurnOwner = startTurnOwner(result.current.store, defaultTestChatId, async () => ({
        runId: 'run_continue',
        leaseTurnId: undefined,
        request: { kind: 'continue', body: latestBody },
      }));
    });

    act(() => {
      result.current.actions.continueChat();
    });
    const fake = getFake(defaultTestChatId);
    await waitFor(() => {
      expect(fake.resumeStream).toHaveBeenCalledTimes(1);
    });
    expect(fake.resumeStream).toHaveBeenCalledWith({
      body: { ...latestBody, admission: { version: 1, idempotencyKey: expect.any(String) as unknown as string } },
    });
  });

  it('routes a `stop` request through to chat.stop', async () => {
    const { result } = renderProvider();

    // Need an in-flight request so stopRequest is accepted by the lifecycle.
    const fake = getFake(defaultTestChatId);
    act(() => {
      result.current.actions.regenerate();
    });
    await waitFor(() => {
      expect(fake.regenerate).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.actions.stop();
    });

    expect(fake.stop).toHaveBeenCalledTimes(1);
    expect(harness.touchChatRecency).toHaveBeenCalledTimes(1);
  });

  it('replaces the message tail and regenerates on edit', async () => {
    const original = makeUserMessage('msg_1', 'first try');
    const { result } = renderProvider();
    const fake = getFake(defaultTestChatId);
    fake.messages = [original];

    act(() => {
      result.current.actions.editMessage('msg_1', 'second try');
    });
    await waitFor(() => {
      expect(fake.regenerate).toHaveBeenCalledTimes(1);
    });

    expect(fake.messages).toHaveLength(1);
    expect(fake.messages[0]!.id).toBe('msg_1');
    expect(fake.messages[0]!.parts[0]).toMatchObject({ type: 'text', text: 'second try' });
    expect(fake.regenerate).toHaveBeenCalledTimes(1);
    expect(harness.touchChatRecency).toHaveBeenCalledWith(defaultTestChatId, expect.any(Number));
  });

  it('skips edit dispatch when the target message is no longer present', async () => {
    const { result } = renderProvider();

    act(() => {
      result.current.actions.editMessage('msg_missing', 'edit');
    });
    await Promise.resolve();

    const fake = getFake(defaultTestChatId);
    expect(fake.regenerate).not.toHaveBeenCalled();
    expect(harness.touchChatRecency).not.toHaveBeenCalled();
    expect(result.current.context.persistenceActorRef!.getSnapshot().matches({ requestLifecycle: 'idle' })).toBe(true);
  });

  // ===========================================================================
  // No-flicker contract — when a user kicks off a new request from the error
  // state, both the AI SDK error AND the persisted error must reset in a
  // single React frame. We measure this by snapshotting `persistedError`
  // immediately after the synchronous action() call.
  // ===========================================================================

  describe('no-flicker contract', () => {
    it('clears persistedError synchronously when sendMessage starts', async () => {
      harness.getChat.mockResolvedValue({
        id: 'chat_abc',
        resourceId: testProjectId,
        name: '',
        messages: [],
        createdAt: 0,
        updatedAt: 0,
        error: sampleChatError,
      });

      const { result } = renderProvider('chat_abc');
      const persistenceActorRef = result.current.context.persistenceActorRef!;

      // Wait for loadChatActor to populate persistedError from the loaded chat.
      await waitFor(() => {
        expect(persistenceActorRef.getSnapshot().context.persistedError).toEqual(sampleChatError);
      });

      act(() => {
        void result.current.actions.sendMessage(makeUserMessage('msg_1', 'next attempt'));
      });

      expect(persistenceActorRef.getSnapshot().context.persistedError).toBeUndefined();
      await waitFor(() => {
        expect(getFake('chat_abc').sendMessage).toHaveBeenCalledTimes(1);
      });
    });

    it('clears persistedError synchronously when editMessage starts', async () => {
      const original = makeLoadedUserMessage('msg_1', 'first');
      harness.getChat.mockResolvedValue({
        id: 'chat_abc',
        resourceId: testProjectId,
        name: '',
        messages: [original],
        createdAt: 0,
        updatedAt: 0,
        error: sampleChatError,
      });

      const { result } = renderProvider('chat_abc');
      const persistenceActorRef = result.current.context.persistenceActorRef!;

      await waitFor(() => {
        expect(persistenceActorRef.getSnapshot().context.persistedError).toEqual(sampleChatError);
      });

      act(() => {
        result.current.actions.editMessage('msg_1', 'edited');
      });

      expect(persistenceActorRef.getSnapshot().context.persistedError).toBeUndefined();
      await waitFor(() => {
        expect(getFake('chat_abc').regenerate).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ===========================================================================
  // Queue-while-streaming flow: starting a second request while one is in
  // flight should stop the current request, then once onFinish fires with
  // isAbort, transparently dispatch the queued request.
  // ===========================================================================

  it('queues a second request, stops the first, then dispatches on abort', async () => {
    const { result } = renderProvider();
    const first = makeUserMessage('msg_first', 'one');
    const second = makeUserMessage('msg_second', 'two');

    const fake = getFake(defaultTestChatId);
    act(() => {
      void result.current.actions.sendMessage(first);
    });
    await waitFor(() => {
      expect(fake.sendMessage).toHaveBeenCalledTimes(1);
    });
    act(() => {
      fake.status = 'submitted';
      fake.emitStatus();
    });

    act(() => {
      void result.current.actions.sendMessage(second);
    });

    expect(fake.sendMessage).toHaveBeenCalledTimes(1);
    expect(fake.sendMessage).toHaveBeenLastCalledWith(first, { body: dispatchedBody });
    expect(fake.stop).toHaveBeenCalledTimes(1);

    // Simulate the AI SDK aborting and calling onFinish — the store wired
    // this callback into `persistenceActorRef.send({ type: 'requestFinished', ... })`.
    // The status flip that follows is what tells the chat's session actor its
    // turn is over, and the queued gesture is admitted from there (C3).
    act(() => {
      fake.onFinish({ messages: [first], isAbort: true, isError: false, isDisconnect: false });
      fake.status = 'ready';
      fake.emitStatus();
    });
    await waitFor(() => {
      expect(fake.sendMessage).toHaveBeenCalledTimes(2);
    });
    expect(fake.sendMessage).toHaveBeenLastCalledWith(second, { body: dispatchedBody });
    expect(result.current.context.persistenceActorRef!.getSnapshot().matches({ requestLifecycle: 'invoking' })).toBe(
      true,
    );
  });

  // ===========================================================================
  // Pure-stop cancellation: stopping with no queued request and no assistant
  // content restores the trailing user prompt to the composer draft.
  // ===========================================================================

  it('restores the trailing pending user message to draft on a pure stop', async () => {
    const pending = makeUserMessage('msg_pending', 'in flight');
    const { result } = renderProvider();

    act(() => {
      void result.current.actions.sendMessage(pending);
    });

    const fake = getFake(defaultTestChatId);
    // The turn is admitted before it dispatches (C3), so the stop below has
    // something to stop only once the admission has answered.
    await waitFor(() => {
      expect(fake.sendMessage).toHaveBeenCalledTimes(1);
    });
    // The store seeds chat.messages from the AI SDK's view; in our mock
    // sendMessage doesn't update messages, so we mirror that the trailing
    // pending user is what onFinish will report.
    fake.messages = [pending];

    act(() => {
      result.current.actions.stop();
    });

    expect(fake.stop).toHaveBeenCalledTimes(1);

    act(() => {
      fake.onFinish({ messages: [pending], isAbort: true, isError: false, isDisconnect: false });
    });
    await Promise.resolve();

    // Store's `restoreCancelledDraft` listener removes the aborted turn
    // from chat.messages and hands the user prompt back to the composer.
    await waitFor(() => {
      expect(fake.messages).toEqual([]);
      expect(result.current.context.draftActorRef.getSnapshot().context.draftText).toBe('in flight');
      expect(result.current.context.persistenceActorRef!.getSnapshot().matches({ requestLifecycle: 'idle' })).toBe(
        true,
      );
    });
  });

  // ===========================================================================
  // Mid-stream error path: onError must surface the persisted error and that
  // error must survive `requestFinished` so the banner stays visible until the
  // user takes a new action.
  // ===========================================================================

  it('preserves persistedError when onFinish reports isError after onError', async () => {
    const { result } = renderProvider('chat_abc');
    const persistenceActorRef = result.current.context.persistenceActorRef!;

    await waitFor(() => {
      expect(persistenceActorRef.getSnapshot().matches({ chatLoading: 'idle' })).toBe(true);
    });

    act(() => {
      void result.current.actions.sendMessage(makeUserMessage('msg_1', 'go'));
    });

    const fake = getFake('chat_abc');

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    act(() => {
      fake.onError(new Error('network died'));
    });
    consoleErrorSpy.mockRestore();

    expect(persistenceActorRef.getSnapshot().context.persistedError).toMatchObject({
      message: 'network died',
    });

    act(() => {
      fake.onFinish({ messages: [], isAbort: false, isError: true, isDisconnect: false });
    });

    expect(persistenceActorRef.getSnapshot().context.persistedError).toMatchObject({
      message: 'network died',
    });
  });

  // ---------------------------------------------------------------------------
  // R4: onFinish forwards `isDisconnect` to the persistence machine.
  // The machine then opens its `retrying` substate to drive transparent
  // auto-retry. The store is the only seam between the AI SDK callback and
  // the actor event so this test pins the wiring at the public boundary.
  // ---------------------------------------------------------------------------

  it('forwards isDisconnect=true into the requestFinished event so requestLifecycle enters `retrying`', async () => {
    const { result } = renderProvider('chat_disco');
    const persistenceActorRef = result.current.context.persistenceActorRef!;

    await waitFor(() => {
      expect(persistenceActorRef.getSnapshot().matches({ chatLoading: 'idle' })).toBe(true);
    });

    act(() => {
      void result.current.actions.sendMessage(makeUserMessage('msg_send', 'go'));
    });

    const fake = getFake('chat_disco');
    await waitFor(() => {
      expect(fake.sendMessage).toHaveBeenCalledTimes(1);
    });

    act(() => {
      fake.onFinish({ messages: [], isAbort: false, isError: true, isDisconnect: true });
    });

    expect(persistenceActorRef.getSnapshot().matches({ requestLifecycle: 'retrying' })).toBe(true);
    expect(persistenceActorRef.getSnapshot().context.retryAttempt).toBe(1);
  });

  it('forwards isDisconnect=false (e.g. structured 4xx) so requestLifecycle settles in `idle`', async () => {
    const { result } = renderProvider('chat_no_disco');
    const persistenceActorRef = result.current.context.persistenceActorRef!;

    await waitFor(() => {
      expect(persistenceActorRef.getSnapshot().matches({ chatLoading: 'idle' })).toBe(true);
    });

    act(() => {
      void result.current.actions.sendMessage(makeUserMessage('msg_send', 'go'));
    });

    const fake = getFake('chat_no_disco');

    act(() => {
      fake.onFinish({ messages: [], isAbort: false, isError: true, isDisconnect: false });
    });

    expect(persistenceActorRef.getSnapshot().matches({ requestLifecycle: 'idle' })).toBe(true);
    expect(persistenceActorRef.getSnapshot().context.retryAttempt).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // T15 / T16: full integration cycles for transparent auto-retry.
  //
  // These exercise the end-to-end wiring across:
  //   onFinish (R4) -> requestFinished -> retrying -> backoff -> dispatchRequest
  //                 -> chat.makeRequest -> onFinish (success) -> idle
  //
  // Both paths assert that chat.messages is preserved across the cycle so
  // the user never sees the partial-assistant flicker that prompted this work.
  // ---------------------------------------------------------------------------

  it('full cycle: success after one retry preserves chat.messages and never trips the banner', async () => {
    const { result } = renderProvider('chat_t15');
    const persistenceActorRef = result.current.context.persistenceActorRef!;

    await waitFor(() => {
      expect(persistenceActorRef.getSnapshot().matches({ chatLoading: 'idle' })).toBe(true);
    });

    // Switch to fake timers AFTER loading so loadChatActor microtasks settle
    // first; otherwise the actor never reaches `chatLoading.idle` and every
    // following waitFor times out.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      const userMessage = makeUserMessage('msg_user', 'render a cube');
      act(() => {
        void result.current.actions.sendMessage(userMessage);
      });
      // The turn is admitted before it dispatches (C3); let that promise land.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const fake = getFake('chat_t15');
      fake.messages = [
        userMessage,
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal test message
        {
          id: 'msg_assistant',
          role: 'assistant',
          parts: [{ type: 'text', text: 'thinking', state: 'streaming' }],
          metadata: { createdAt: 0 },
        } as MyUIMessage,
      ];
      const partialMessagesRef = fake.messages;

      act(() => {
        fake.onFinish({ messages: fake.messages, isAbort: false, isError: true, isDisconnect: true });
      });

      expect(persistenceActorRef.getSnapshot().matches({ requestLifecycle: 'retrying' })).toBe(true);
      expect(persistenceActorRef.getSnapshot().context.retryAttempt).toBe(1);
      expect(fake.messages).toBe(partialMessagesRef);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });

      expect(fake.resumeStream).toHaveBeenCalledTimes(1);
      expect(persistenceActorRef.getSnapshot().matches({ requestLifecycle: 'invoking' })).toBe(true);

      act(() => {
        fake.onFinish({ messages: fake.messages, isAbort: false, isError: false, isDisconnect: false });
      });

      expect(persistenceActorRef.getSnapshot().matches({ requestLifecycle: 'idle' })).toBe(true);
      expect(persistenceActorRef.getSnapshot().context.retryAttempt).toBe(0);
      expect(persistenceActorRef.getSnapshot().context.persistedError).toBeUndefined();
      expect(fake.messages).toBe(partialMessagesRef);
      expect(harness.touchChatRecency).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('full cycle: budget exhaustion preserves chat.messages and surfaces persistedError', async () => {
    const { result } = renderProvider('chat_t16');
    const persistenceActorRef = result.current.context.persistenceActorRef!;

    await waitFor(() => {
      expect(persistenceActorRef.getSnapshot().matches({ chatLoading: 'idle' })).toBe(true);
    });

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      const userMessage = makeUserMessage('msg_user', 'render a cube');
      act(() => {
        void result.current.actions.sendMessage(userMessage);
      });
      // The turn is admitted before it dispatches (C3); let that promise land.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const fake = getFake('chat_t16');
      fake.messages = [
        userMessage,
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal test message
        {
          id: 'msg_assistant',
          role: 'assistant',
          parts: [{ type: 'text', text: 'partial...', state: 'streaming' }],
          metadata: { createdAt: 0 },
        } as MyUIMessage,
      ];
      const partialMessagesRef = fake.messages;
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      act(() => {
        fake.onError(new Error('Failed to fetch'));
      });

      for (let attempt = 1; attempt <= 5; attempt++) {
        act(() => {
          fake.onFinish({ messages: fake.messages, isAbort: false, isError: true, isDisconnect: true });
        });
        expect(persistenceActorRef.getSnapshot().matches({ requestLifecycle: 'retrying' })).toBe(true);
        expect(persistenceActorRef.getSnapshot().context.retryAttempt).toBe(attempt);

        // oxlint-disable-next-line no-await-in-loop -- sequential timer advancement is the entire point of this loop; parallelising would race the actor transitions
        await act(async () => {
          await vi.advanceTimersByTimeAsync(60_000);
        });
        expect(persistenceActorRef.getSnapshot().matches({ requestLifecycle: 'invoking' })).toBe(true);
      }

      // 6th disconnect: budget exhausted -> idle, persistedError preserved.
      act(() => {
        fake.onFinish({ messages: fake.messages, isAbort: false, isError: true, isDisconnect: true });
      });

      consoleErrorSpy.mockRestore();
      expect(persistenceActorRef.getSnapshot().matches({ requestLifecycle: 'idle' })).toBe(true);
      expect(persistenceActorRef.getSnapshot().context.persistedError).toMatchObject({
        message: 'Failed to fetch',
      });
      // Critical: across the entire 5-retry chain plus exhaustion, the
      // partial assistant tail in chat.messages is untouched.
      expect(fake.messages).toBe(partialMessagesRef);
      expect(fake.regenerate).not.toHaveBeenCalled();
      expect(fake.sendMessage).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Hooks resolution rules — store-resolved `useChatContext` /
// `useChatSelector` / `useChatActions` plus `useChatById`. The previously
// optional `useActiveChatId` reader has been folded into the strict
// `useActiveChatSession` (session-required) and `useChatComposer().session`
// (composer-wide) entry points; tests for those live in
// `active-chat-provider.test.tsx`.
// ---------------------------------------------------------------------------

describe('hooks resolution rules', () => {
  beforeEach(() => {
    harness.created = [];
    harness.getChat.mockReset().mockResolvedValue(undefined);
    harness.patchChat.mockReset().mockResolvedValue(undefined);
    harness.consumeChatStartupRequest.mockReset().mockResolvedValue(undefined);
    harness.commitCancelledDraftRestore.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('useChatContext throws when used outside an ActiveChatProvider', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useChatContext())).toThrow(/activechatprovider/i);
    consoleErrorSpy.mockRestore();
  });

  it('useDraftActions().setDraftText works under ChatComposerProvider (draft-only mode)', () => {
    const { result } = renderHook(() => ({ actions: useDraftActions(), text: useDraftSelector((s) => s.draftText) }), {
      wrapper: createComposerWrapper(),
    });

    expect(result.current.text).toBe('');

    act(() => {
      result.current.actions.setDraftText('hello world');
    });

    expect(result.current.text).toBe('hello world');
  });

  it('useChatActions throws when used outside an ActiveChatProvider (composer-only subtree)', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useChatActions(), { wrapper: createComposerWrapper() })).toThrow(
      /activechatprovider/i,
    );
    consoleErrorSpy.mockRestore();
  });

  it('useChatById reads a non-active chat by explicit id', () => {
    function MultiChatWrapper({ children }: { readonly children: ReactNode }) {
      return (
        <ChatSessionStoreProvider>
          {/* Background session: ActiveChatProvider acquires chat_background from the store. */}
          <ActiveChatProvider chatId='chat_background'>
            {/* Inner foreground binding: ActiveChatProvider acquires chat_foreground. */}
            <ActiveChatProvider chatId='chat_foreground'>{children}</ActiveChatProvider>
          </ActiveChatProvider>
        </ChatSessionStoreProvider>
      );
    }

    const { result } = renderHook(
      () => ({
        active: useChatSelector((s) => s.status),
        background: useChatById('chat_background', (s) => s.status),
      }),
      { wrapper: MultiChatWrapper },
    );

    expect(result.current.active).toBe('ready');
    expect(result.current.background).toBe('ready');
  });

  it('useChatSelector throws when used outside an ActiveChatProvider (composer-only subtree)', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useChatSelector((s) => s.messages), { wrapper: createComposerWrapper() })).toThrow(
      /activechatprovider/i,
    );
    consoleErrorSpy.mockRestore();
  });

  it('does not re-render a status selector for message-only streaming updates', async () => {
    let renderCount = 0;
    const { result } = renderHook(
      () => {
        renderCount++;
        return useChatSelector((state) => state.status);
      },
      { wrapper: createWrapper('chat_selector_stability') },
    );
    await waitFor(() => {
      expect(result.current).toBe('ready');
    });
    const fake = getFake('chat_selector_stability');
    const beforeMessageUpdate = renderCount;

    act(() => {
      fake.messages = [makeAssistantMessage('assistant_1', 'streaming')];
      fake.emitMessages();
    });
    expect(renderCount).toBe(beforeMessageUpdate);

    act(() => {
      fake.status = 'streaming';
      fake.emitStatus();
    });
    expect(result.current).toBe('streaming');
    expect(renderCount).toBe(beforeMessageUpdate + 1);
  });

  it('does not hide same-sized message order and map replacements', async () => {
    const { result } = renderHook(
      () =>
        useChatSelector((state) => ({
          order: state.messageOrder,
          messagesById: state.messagesById,
        })),
      { wrapper: createWrapper('chat_selector_structure') },
    );
    await waitFor(() => {
      expect(getFake('chat_selector_structure')).toBeDefined();
    });
    const fake = getFake('chat_selector_structure');

    act(() => {
      fake.messages = [
        makeAssistantMessage('assistant_1', 'ready'),
        makeAssistantMessage('assistant_2', 'ready'),
        makeAssistantMessage('assistant_3', 'ready'),
      ];
      fake.emitMessages();
    });
    expect(result.current.order).toEqual(['assistant_1', 'assistant_2', 'assistant_3']);

    act(() => {
      fake.messages = [
        makeAssistantMessage('assistant_1', 'ready'),
        makeAssistantMessage('assistant_changed', 'ready'),
        makeAssistantMessage('assistant_3', 'ready'),
      ];
      fake.emitMessages();
    });
    expect(result.current.order).toEqual(['assistant_1', 'assistant_changed', 'assistant_3']);
    expect(result.current.messagesById.has('assistant_changed')).toBe(true);
    expect(result.current.messagesById.has('assistant_2')).toBe(false);
  });

  // =========================================================================
  // activeExecution / activeKernel surfaced through CombinedChatState so
  // chat-scoped consumers can read them without poking the persistence
  // machine directly.
  // =========================================================================

  it('surfaces activeExecution and activeKernel on the chat snapshot once persistence reports them', async () => {
    harness.getChat.mockResolvedValue({
      id: 'chat_active_selection',
      resourceId: testProjectId,
      name: '',
      messages: [],
      activeExecution: { kind: 'tau', model: 'gpt-5.4-medium' },
      activeKernel: 'manifold',
      createdAt: 0,
      updatedAt: 0,
    });

    const { result } = renderHook(
      () => ({
        activeExecution: useChatSelector((s) => s.activeExecution),
        activeKernel: useChatSelector((s) => s.activeKernel),
      }),
      { wrapper: createWrapper('chat_active_selection') },
    );

    await waitFor(() => {
      expect(result.current.activeExecution).toEqual({ kind: 'tau', model: 'gpt-5.4-medium' });
      expect(result.current.activeKernel).toBe('manifold');
    });
  });

  it('returns undefined activeExecution/activeKernel for chats with no chat-scoped selection', async () => {
    harness.getChat.mockResolvedValue({
      id: 'chat_no_selection',
      resourceId: testProjectId,
      name: '',
      messages: [],
      createdAt: 0,
      updatedAt: 0,
    });

    const { result } = renderHook(
      () => ({
        activeExecution: useChatSelector((s) => s.activeExecution),
        activeKernel: useChatSelector((s) => s.activeKernel),
      }),
      { wrapper: createWrapper('chat_no_selection') },
    );

    await waitFor(() => {
      // Wait for the load to settle so the snapshot reflects the persisted
      // (undefined) values rather than the pre-load default.
      expect(result.current.activeExecution).toBeUndefined();
    });
    expect(result.current.activeKernel).toBeUndefined();
  });
});
