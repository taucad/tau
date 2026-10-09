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
import { lifecycleRow, publishLogRows, runningRows } from '#machines/chat-projection.fixture.js';
import type { ChatTurn, ChatTurnGesture } from '#machines/chat-session.machine.js';
import { publishChatTurnAdmission, resetChatTurnServices } from '#chat-clients/_internal/chat-host-binding.js';
import type { ChatSessionStore } from '#services/chat-session-store.js';

// ---------------------------------------------------------------------------
// Hoisted test harness
//
// A minimal SDK Chat stand-in lets the provider tests read status, messages,
// and selection without invoking a real host transport. Host commands and
// projection-driven transcript behavior are covered by their owning suites.
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

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal()),
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
    defaultExecution: { kind: 'tau', model: 'cookie-model' },
    rememberExecution: vi.fn(),
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

function makeAssistantMessage(id: string, text: string): MyUIMessage {
  return {
    id,
    role: 'assistant',
    parts: [{ type: 'text', text, state: 'done' }],
    metadata: { createdAt: 0 },
  };
}

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
        <ActiveChatProvider chatId={chatId} projectId={testProjectId}>
          {children}
        </ActiveChatProvider>
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

const testProjectId = 'proj_test';

/** The admission the route publishes for the provider's gesture tests. */
const testAdmission = async (gesture: ChatTurnGesture): Promise<ChatTurn> => ({
  runId: `run_${gesture.kind}`,
  leaseTurnId: undefined,
  request:
    gesture.kind === 'send'
      ? { kind: 'send', message: gesture.message }
      : gesture.kind === 'edit'
        ? { kind: 'edit', messageId: gesture.messageId, content: gesture.text }
        : gesture.kind === 'continue'
          ? { kind: 'continue' }
          : { kind: 'regenerate' },
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
  const session = createActor(projectSessionMachine, { input: { projectId: testProjectId } });
  session.start();
  const unpublish = publishChatTurnAdmission(chatId, admit);
  store.setFocusedProject(testProjectId);
  store.setProjectSession(testProjectId, session);
  return () => {
    unpublish();
    store.setProjectSession(testProjectId, undefined);
    session.stop();
  };
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

  // Host-command routing is exercised by chat-session-store and turn-host tests.

  it('records an accepted send once and ignores invalid targets and stop', async () => {
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

    await act(async () => {
      await result.current.actions.sendMessage(user);
    });
    act(() => {
      result.current.actions.stop('stop-button');
      result.current.actions.editMessage('missing-edit', 'ignored');
    });

    /* Once, when the turn is taken (PV-S6), at the message's own time. */
    expect(harness.touchChatRecency).toHaveBeenCalledOnce();
    expect(harness.touchChatRecency).toHaveBeenCalledWith(defaultTestChatId, user.metadata?.createdAt);
  });

  /* L3 D16, LT08: recency counts a taken gesture. A send the admission refuses never became a turn. */
  it('leaves recency alone when the admission refuses a send (PV-S6)', async () => {
    const { result } = renderHook(() => ({ actions: useChatActions(), store: useChatSessionStore() }), {
      wrapper: createWrapper(defaultTestChatId),
    });
    act(() => {
      stopTurnOwner = startTurnOwner(result.current.store, defaultTestChatId, async () => {
        throw new Error('No credit left for this turn.');
      });
    });

    await act(async () => {
      await result.current.actions.sendMessage(makeUserMessage('msg_refused', 'refused'));
    });

    expect(getFake(defaultTestChatId).sendMessage).not.toHaveBeenCalled();
    expect(harness.touchChatRecency).not.toHaveBeenCalled();
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
          <ActiveChatProvider chatId='chat_background' projectId={testProjectId}>
            {/* Inner foreground binding: ActiveChatProvider acquires chat_foreground. */}
            <ActiveChatProvider chatId='chat_foreground' projectId={testProjectId}>
              {children}
            </ActiveChatProvider>
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

  it('shows Stop status for a reattached host run when the SDK is ready', () => {
    const { result } = renderHook(
      () => ({ status: useChatSelector((state) => state.status), store: useChatSessionStore() }),
      { wrapper: createWrapper('chat_reattached_stop') },
    );
    expect(result.current.status).toBe('ready');
    act(() => {
      publishLogRows(result.current.store, 'chat_reattached_stop', runningRows());
    });
    expect(result.current.status).toBe('streaming');
    act(() => {
      publishLogRows(result.current.store, 'chat_reattached_stop', [lifecycleRow(2, 'completed')], 2);
    });
    expect(result.current.status).toBe('ready');
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

  it('refreshes the middle-message index when actions replace a transcript without changing its ends', () => {
    const { result } = renderHook(
      () => ({
        actions: useChatActions(),
        order: useChatSelector((state) => state.messageOrder),
        messagesById: useChatSelector((state) => state.messagesById),
      }),
      { wrapper: createWrapper('chat_middle_replace') },
    );
    const first = makeUserMessage('first', 'first');
    const last = makeAssistantMessage('last', 'last');
    act(() => {
      result.current.actions.setMessages([first, makeAssistantMessage('middle-old', 'old'), last]);
      getFake('chat_middle_replace').emitMessages();
    });
    expect(result.current.order).toEqual(['first', 'middle-old', 'last']);

    act(() => {
      result.current.actions.setMessages([first, makeAssistantMessage('middle-new', 'new'), last]);
      getFake('chat_middle_replace').emitMessages();
    });
    expect(result.current.order).toEqual(['first', 'middle-new', 'last']);
    expect(result.current.messagesById.has('middle-old')).toBe(false);
    expect(result.current.messagesById.get('middle-new')?.parts[0]).toMatchObject({ text: 'new' });
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
