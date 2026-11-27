// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- mocks keep the environment's `ENV`/`TAU_API_URL` and the AI SDK's own export names verbatim. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { memo } from 'react';
import type { ReactNode } from 'react';
import type { MyUIMessage } from '@taucad/chat';
import type { ChatError } from '@taucad/types';
import { resolveKernel } from '@taucad/types/constants';
import { createActor } from 'xstate';
import { mock } from 'vitest-mock-extended';
import { KeyedMutex } from '@taucad/utils/keyed-mutex';
import type * as ChatMessageQueueModule from '@taucad/chat-ui/db/chat-message-queue-store';
import type { AgentHostClient } from '#services/agent-host-client.js';
import { projectSessionMachine } from '#machines/project-session.machine.js';
import {
  lifecycleRow,
  logRow,
  publishLogRows,
  runningRows,
  writerOwnedCatchUp,
} from '#machines/chat-projection.fixture.js';
import type { ChatTurn, ChatTurnGesture } from '#machines/chat-session.machine.js';
import { publishChatTurnAdmission, resetChatTurnServices } from '#chat-clients/_internal/chat-host-binding.js';
import { presentMessages } from '#services/chat-session-store.js';
import type { ChatSessionStore } from '#services/chat-session-store.js';
import type { CombinedChatState } from '#hooks/use-chat.js';
import { projectSessionsStandIn } from '#services/project-sessions.fixture.js';

/** The live project sessions every store in this file follows, as the runtime hands it the registry's (A7c). */
const liveSessions = projectSessionsStandIn();

const queueMutex = new KeyedMutex<string>();
vi.mock('@taucad/chat-ui/db/chat-message-queue-store', async (importOriginal) => {
  const original = await importOriginal<typeof ChatMessageQueueModule>();
  return {
    ...original,
    createChatMessageQueueStore: (...[client, path]: Parameters<typeof original.createChatMessageQueueStore>) =>
      original.createChatMessageQueueStore(client, path, queueMutex.run.bind(queueMutex)),
  };
});

const harness = vi.hoisted(() => ({
  patchChat: vi.fn(),
  touchChatRecency: vi.fn(),
  getChat: vi.fn(),
  consumeChatStartupRequest: vi.fn(),
  commitCancelledDraftRestore: vi.fn(),
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

vi.mock('@taucad/chat-ui/utils/error.utils', () => ({
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
    clear: () => {
      files.clear();
    },
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

beforeEach(() => {
  fileManager.clear();
});

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ ...fileManager, recordFiles: fileManager.client }),
  useOptionalFileManager: () => ({ ...fileManager, recordFiles: fileManager.client }),
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

const { useChatSessionStore } = await import('#hooks/chat-session-store-provider.js');
/* The pre-A2 mirror over the mocked project and file managers; production's store is the runtime's. */
const { MirroredChatSessionStoreProvider: ChatSessionStoreProvider } =
  await import('#hooks/chat-session-store.fixture.js');
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
 * Mounts the full new-architecture stack: `<ChatSessionStoreProvider projectSessions={liveSessions}>`
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
      <ChatSessionStoreProvider projectSessions={liveSessions}>
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
      <ChatSessionStoreProvider projectSessions={liveSessions}>
        <ChatComposerProvider surface='library'>{children}</ChatComposerProvider>
      </ChatSessionStoreProvider>
    );
  };
}

const testProjectId = 'proj_test';

/** The admission the route publishes for the provider's gesture tests. */
const testAdmission = async (gesture: ChatTurnGesture): Promise<ChatTurn> => ({
  runId: gesture.kind === 'send' ? gesture.requestId : `run_${gesture.kind}`,
  leaseTurnId: undefined,
  request:
    gesture.kind === 'send'
      ? {
          kind: 'send',
          message: gesture.message,
          queueId: gesture.queueId,
          command: {
            type: 'start',
            commandId: gesture.requestId!,
            payload: {
              chatId: defaultTestChatId,
              runId: gesture.requestId!,
              trigger: 'submit',
              message: { id: gesture.message.id, role: 'user', content: 'activity' },
            },
          },
        }
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
  const disconnect = store.publishProjectHostConnector(testProjectId, async () =>
    mock<AgentHostClient>({
      catchUp: writerOwnedCatchUp,
      hostCommand: async (command) => ({
        commandId: command.commandId,
        generation: 1,
        status: 'applied',
        effect: 'durable',
        cursor: 1,
      }),
      close: async () => undefined,
    }),
  );
  publishLogRows(store, chatId, []);
  liveSessions.set(testProjectId, session);
  return () => {
    unpublish();
    disconnect();
    liveSessions.set(testProjectId, undefined);
    session.stop();
  };
}

/** Torn down in `afterEach` so one test's project session never binds the next one's chat. */
let stopTurnOwner: (() => void) | undefined;

describe('chat session lifecycle wiring (via ChatSessionStore)', () => {
  beforeEach(() => {
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

  it.each([{}, { afterTerminalRunId: 'run-stopped' }])(
    'preserves captured queue intent %j through send actions',
    async (queueIntent) => {
      const { result } = renderHook(() => ({ actions: useChatActions(), store: useChatSessionStore() }), {
        wrapper: createWrapper(defaultTestChatId),
      });
      const request = vi.spyOn(result.current.store, 'requestTurn').mockResolvedValue(undefined);
      const message = makeUserMessage('queued-with-intent', 'Preserve my original intent');
      await act(async () => {
        await result.current.actions.sendMessage(message, { queueIntent });
      });
      expect(request).toHaveBeenCalledExactlyOnceWith(defaultTestChatId, { kind: 'send', message, queueIntent });
    },
  );

  it('records an accepted send once and ignores invalid targets and stop', async () => {
    const { result } = renderHook(() => ({ actions: useChatActions(), store: useChatSessionStore() }), {
      wrapper: createWrapper(defaultTestChatId),
    });
    const user = makeUserMessage('msg_user_activity', 'activity');
    const assistant = makeAssistantMessage('msg_assistant_activity', 'answer');
    expect(assistant.id).toBeDefined();
    act(() => {
      stopTurnOwner = startTurnOwner(result.current.store, defaultTestChatId);
    });

    await act(async () => {
      await result.current.actions.sendMessage(user);
    });
    await waitFor(() => {
      expect(harness.touchChatRecency).toHaveBeenCalledOnce();
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
    const refuse = vi.fn(async () => {
      throw new Error('No credit left for this turn.');
    });
    act(() => {
      stopTurnOwner = startTurnOwner(result.current.store, defaultTestChatId, refuse);
    });

    await act(async () => {
      await result.current.actions.sendMessage(makeUserMessage('msg_refused', 'refused'));
    });
    await waitFor(() => {
      expect(refuse).toHaveBeenCalledOnce();
    });

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

  it('useDraftSelector re-renders a reader only when the value it selects changes', () => {
    let renders = 0;
    const { result } = renderHook(
      () => {
        renders += 1;
        return {
          actions: useDraftActions(),
          attachments: useDraftSelector((s) => s.draftAttachments),
          pending: useDraftSelector((s) => s.pendingMain),
        };
      },
      { wrapper: createComposerWrapper() },
    );
    const before = renders;
    const { attachments, pending } = result.current;

    act(() => {
      result.current.actions.setDraftText('h');
    });
    act(() => {
      result.current.actions.setDraftText('he');
    });

    expect(renders).toBe(before);
    expect(result.current.attachments).toBe(attachments);
    expect(result.current.pending).toBe(pending);
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
        <ChatSessionStoreProvider projectSessions={liveSessions}>
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

  it('should not re-render a status selector for message-only streaming updates', () => {
    let renderCount = 0;
    const { result } = renderHook(
      () => {
        renderCount++;
        return { status: useChatSelector((state) => state.status), store: useChatSessionStore() };
      },
      { wrapper: createWrapper('chat_selector_stability') },
    );
    act(() => {
      publishLogRows(result.current.store, 'chat_selector_stability', runningRows());
    });
    expect(result.current.status).toBe('streaming');
    const beforeMessageUpdate = renderCount;

    act(() => {
      publishLogRows(
        result.current.store,
        'chat_selector_stability',
        [
          logRow(2, {
            type: 'message.appended',
            message: { id: 'assistant_1', role: 'assistant', content: [{ type: 'text', text: 'Streaming' }] },
          }),
        ],
        2,
      );
    });
    expect(renderCount).toBe(beforeMessageUpdate);

    act(() => {
      publishLogRows(result.current.store, 'chat_selector_stability', [lifecycleRow(3, 'completed')], 3);
    });
    expect(result.current.status).toBe('ready');
    expect(renderCount).toBe(beforeMessageUpdate + 1);
  });

  it('should wake a selector only for the sources it read (WP-06a, D3)', () => {
    const transcriptSelector = vi.fn((state: CombinedChatState) => state.messages);
    const draftSelector = vi.fn((state: CombinedChatState) => state.draftText);
    let draftText: string | undefined;
    /* Each selector in its own component, as a message row and the composer are: a render of one is not a wake of the other. */
    const Transcript = memo(function Transcript() {
      useChatSelector(transcriptSelector);
      return null;
    });
    const Draft = memo(function Draft() {
      draftText = useChatSelector(draftSelector);
      return null;
    });
    const Base = createWrapper('chat_selector_reads');
    const { result } = renderHook(() => ({ actions: useDraftActions(), store: useChatSessionStore() }), {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <Base>
          <Transcript />
          <Draft />
          {children}
        </Base>
      ),
    });
    const transcriptRuns = transcriptSelector.mock.calls.length;
    act(() => {
      result.current.actions.setDraftText('typing');
    });
    expect(draftText).toBe('typing');
    /* A keystroke moves nothing the transcript selector reads, so it did not run. */
    expect(transcriptSelector.mock.calls.length).toBe(transcriptRuns);

    const draftRuns = draftSelector.mock.calls.length;
    act(() => {
      publishLogRows(result.current.store, 'chat_selector_reads', runningRows());
    });
    /* The log moved what the transcript selector reads and nothing the draft selector reads. */
    expect(transcriptSelector.mock.calls.length).toBeGreaterThan(transcriptRuns);
    expect(draftSelector.mock.calls.length).toBe(draftRuns);
  });

  it('shows Stop status for a reattached host run', () => {
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

  /* T2: the displayed transcript is the fold of the log, so its index is re-homed from the SDK chat's
   * replaced messages to the store's pure index and to the log rows that replace a message. */
  it('does not hide same-sized message order and map replacements', () => {
    const first = presentMessages([
      makeAssistantMessage('assistant_1', 'ready'),
      makeAssistantMessage('assistant_2', 'ready'),
      makeAssistantMessage('assistant_3', 'ready'),
    ]);
    expect(first.order).toEqual(['assistant_1', 'assistant_2', 'assistant_3']);

    const next = presentMessages(
      [
        makeAssistantMessage('assistant_1', 'ready'),
        makeAssistantMessage('assistant_changed', 'ready'),
        makeAssistantMessage('assistant_3', 'ready'),
      ],
      first,
    );
    expect(next.order).toEqual(['assistant_1', 'assistant_changed', 'assistant_3']);
    expect(next.messagesById.has('assistant_changed')).toBe(true);
    expect(next.messagesById.has('assistant_2')).toBe(false);
  });

  it('refreshes the middle-message index when the log replaces a message without changing its ends', async () => {
    const { result } = renderHook(
      () => ({
        store: useChatSessionStore(),
        order: useChatSelector((state) => state.messageOrder),
        messagesById: useChatSelector((state) => state.messagesById),
      }),
      { wrapper: createWrapper('chat_middle_replace') },
    );
    await waitFor(() => {
      expect(result.current.store.get('chat_middle_replace')).toBeDefined();
    });
    const assistant = (text: string) => ({ id: 'step-1', role: 'assistant', content: [{ type: 'text', text }] });
    act(() => {
      publishLogRows(result.current.store, 'chat_middle_replace', [
        ...runningRows(),
        logRow(2, { type: 'message.appended', message: { id: 'first', role: 'user', content: 'first' } }),
        logRow(3, { type: 'message.appended', message: assistant('old') }),
        lifecycleRow(4, 'completed'),
        lifecycleRow(5, 'admitted', 'run_2'),
        lifecycleRow(6, 'running', 'run_2'),
        logRow(7, { runId: 'run_2', type: 'message.appended', message: { id: 'last', role: 'user', content: 'last' } }),
      ]);
    });
    await waitFor(() => {
      expect(result.current.order).toEqual(['first', 'run_1', 'last', 'run_2']);
    });
    expect(result.current.messagesById.get('run_1')?.parts.at(-1)).toMatchObject({ text: 'old' });

    act(() => {
      publishLogRows(
        result.current.store,
        'chat_middle_replace',
        [logRow(8, { type: 'message.envelope-replaced', messageId: 'step-1', replacement: assistant('new') })],
        8,
      );
    });
    /* The replacement shows with the next transcript announcement (D-UI-10). */
    await waitFor(() => {
      expect(result.current.messagesById.get('run_1')?.parts.at(-1)).toMatchObject({ text: 'new' });
    });
    expect(result.current.order).toEqual(['first', 'run_1', 'last', 'run_2']);
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
