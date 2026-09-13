/* eslint-disable @typescript-eslint/naming-convention -- the AI SDK `Chat` stand-in mirrors the SDK's own `~`-prefixed subscriber method names verbatim. */
/**
 * Seeded first turn — execution provenance (integration)
 *
 * The one dispatch in the app that carries no body of its own is the seeded
 * first turn: `loadChatActor` consumes `Chat.startupRequest` and sends
 * `startRequest` *before* the `chatRetrieved` event that hydrates the chat
 * row's `activeExecution` into the persistence machine. Every other scope
 * hands the execution in already-resolved, so nothing crossed
 * `useSessionExecution` in its **un-hydrated** state — where it fabricates
 * `{ kind: 'tau', model: <cookie> }` and the published body factory closes
 * over it. The operator's Codex chat therefore ran its first turn as a Tau
 * turn at the last-used Tau model.
 *
 * So this scope deliberately mounts the **real** `<ActiveChatProvider>` (no
 * `vi.mock` of the provider), the real `useCadChatClient` and the real
 * `ChatSessionStore` over a chat row that carries both an `activeExecution`
 * and a pending startup request, and asserts on the body the store hands
 * `Chat.regenerate` — the wire body of the turn that actually runs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { render, waitFor } from '@testing-library/react';
import type { CadAgentExecution, Chat as ChatEntity, MyUIMessage } from '@taucad/chat';
import type * as CadAgentConfigModuleShape from '#hooks/use-cad-agent-config.js';
import { ChatSessionStore } from '#services/chat-session-store.js';
import { ActiveChatProvider, ChatComposerProvider, useChatComposer } from '#hooks/active-chat-provider.js';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';

/** The Tau model the cookie holds — what the un-hydrated fallback rebuilds from. */
const cookieModelId = 'openai-gpt-5.6-luna';

const harness = vi.hoisted(() => {
  type FakeChat = {
    id: string;
    status: string;
    error: Error | undefined;
    messages: unknown[];
    regenerate: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    resumeStream: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    makeRequest: ReturnType<typeof vi.fn>;
  };
  const noop = (): void => undefined;
  const resolveModel = (
    id: string,
  ): {
    id: string;
    isResolved: boolean;
    provider: { id: string; name: string };
    model: { id: string; provider: { id: string }; details: { contextWindow: number } };
  } => ({
    id,
    isResolved: true,
    provider: { id: 'openai', name: 'OpenAI' },
    model: { id, provider: { id: 'openai' }, details: { contextWindow: 128_000 } },
  });
  return {
    chats: new Map<string, FakeChat>(),
    store: undefined as unknown as ChatSessionStore,
    models: {
      selectedModelId: 'openai-gpt-5.6-luna',
      selectedModel: resolveModel('openai-gpt-5.6-luna'),
      resolveModel,
      setSelectedModelId: noop,
    },
    actions: { sendMessage: vi.fn(), regenerate: vi.fn(), retryMessage: vi.fn(), stop: vi.fn() },
    /** Browser workspace claim — present so the client publishes its factory. */
    workspaceExecution: {
      hostId: 'host_seeded',
      workspaceId: 'workspace_seeded',
      baseRevisionId: 'revision_seeded',
    },
  };
});

// The store's own `Chat` instance, minus the AI SDK and its transport: this
// scope asserts on the body handed to `regenerate`, never on a stream.
vi.mock('#chat-clients/_internal/shared-chat-transport.js', () => ({
  createChatInstance: ({ chatId }: { chatId: string }) => {
    const chat = {
      id: chatId,
      status: 'ready',
      error: undefined,
      messages: [] as unknown[],
      regenerate: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      resumeStream: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      makeRequest: vi.fn().mockResolvedValue(undefined),
      '~registerMessagesCallback': () => () => undefined,
      '~registerStatusCallback': () => () => undefined,
      '~registerErrorCallback': () => () => undefined,
    };
    harness.chats.set(chatId, chat);
    return chat;
  },
  bindDurableChatRun: () => undefined,
  getBoundDurableChatRunId: () => undefined,
  sharedChatTransport: {},
}));
vi.mock('#chat-clients/_internal/browser-agent-host-transport.js', () => ({
  registerAgentHost: () => () => undefined,
  registerAgentHostRunReset: () => () => undefined,
  getBrowserAgentHostRun: () => undefined,
  resolveBrowserAgentHostInterrupt: async () => undefined,
}));
vi.mock('#machines/inspector.js', () => ({ inspect: undefined }));
vi.mock('#hooks/chat-session-store-provider.js', () => ({ useChatSessionStore: () => harness.store }));
vi.mock('#hooks/use-chat.js', () => ({
  useChatSelector: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ draftMode: 'agent', draftToolChoice: 'auto', status: 'ready' }),
  useChatActions: () => harness.actions,
}));
vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: (_name: string, fallback: unknown) => [fallback, () => undefined, () => undefined],
}));
vi.mock('#hooks/use-models.js', () => ({ useModels: () => harness.models }));
vi.mock('#hooks/use-chat-snapshot.js', () => ({ useChatSnapshot: () => undefined }));
vi.mock('#hooks/use-context-payload.js', () => ({ useContextPayload: () => undefined }));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectId: 'proj_seeded', mainEntryPath: 'main.ts' }),
}));
// Absent file manager: the browser-host registration effect returns early, so
// this scope never builds a worker-backed host client.
vi.mock('#hooks/use-file-manager.js', () => ({ useOptionalFileManager: () => undefined }));
/* The turn-start pre-flight (R9) is proved in `use-credit-preflight.test.tsx` and
 * `use-cad-chat-client.test.tsx`; this scope funds every turn. */
vi.mock('#hooks/use-credit-preflight.js', () => ({ useCreditPreflight: () => () => undefined }));
vi.mock('#hooks/use-draft-image-error-toast.js', () => ({ useDraftImageErrorToast: () => undefined }));
vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
  useOptionalChatWorkspaceAuthority: () => ({
    get: () => undefined,
    prepare: async () => ({ execution: harness.workspaceExecution }),
    setRevisionMode: () => undefined,
    subscribe: () => () => undefined,
    markAdmitted: async () => undefined,
    markRunId: async () => undefined,
    finalize: async () => undefined,
    discard: async () => undefined,
    markCancelled: async () => undefined,
  }),
  readRootedBridgeCapabilities: async () => ({ writable: true, durability: 'exclusive-append' }),
  waitForRootedBridgeOpener: async () => undefined,
}));
// A browser build: no implicit local daemon, and no host directory to probe.
vi.mock('#lib/agent-host-placement.js', () => ({
  localAgentHostId: () => undefined,
  daemonPlacementOf: (execution: { kind: string; hostId?: string }) => execution.hostId,
  listAgentHostPlacements: async () => [],
  hostDirectoryOutage: () => undefined,
  desktopWorkspaceRoot: async () => '/workspace',
  openAgentHostChannel: async () => ({}),
}));
// The assembler stays real; only its asynchronous capability probe, which
// needs a mounted project filesystem, is answered directly.
vi.mock('#hooks/use-cad-agent-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof CadAgentConfigModuleShape>()),
  awaitAgentHostAvailability: async () => ({ status: 'available', durability: 'exclusive-append' }),
}));

const chatId = 'chat_seeded';

const pendingUserMessage: MyUIMessage = {
  id: 'msg_seeded_pending',
  role: 'user',
  parts: [{ type: 'text', text: 'design a bracket' }],
  metadata: { status: 'pending', createdAt: 1_700_000_000_000 },
};

const buildSeededRow = (activeExecution: CadAgentExecution): ChatEntity => ({
  id: chatId,
  resourceId: 'proj_seeded',
  name: 'Seeded chat',
  messages: [pendingUserMessage],
  activeExecution,
  startupRequest: {
    id: 'req_seeded',
    kind: 'regenerate-tail',
    messageId: pendingUserMessage.id,
    source: 'homepage-initial-message',
    createdAt: 1_700_000_000_000,
  },
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
});

/** Mount the real provider + client over a row seeded with `activeExecution`. */
const dispatchSeededTurn = async (activeExecution: CadAgentExecution): Promise<Record<string, unknown>> => {
  const row = buildSeededRow(activeExecution);
  const store = new ChatSessionStore();
  harness.store = store;
  store.setDependencies({
    getChat: async () => row,
    patchChat: async () => undefined,
    touchChatRecency: async () => undefined,
    setChatUnreadState: async () => undefined,
    consumeChatStartupRequest: async () => ({ ...row, startupRequest: undefined }),
    commitCancelledDraftRestore: async () => undefined,
    setMessageEdit: async () => undefined,
    clearMessageEdit: async () => undefined,
  });

  function Client(): React.JSX.Element {
    useCadChatClient();
    return <span />;
  }

  render(
    <ActiveChatProvider chatId={chatId}>
      <Client />
    </ActiveChatProvider>,
  );

  await waitFor(() => {
    expect(harness.chats.get(chatId)?.regenerate).toHaveBeenCalledTimes(1);
  });
  const [options] = harness.chats.get(chatId)!.regenerate.mock.calls[0]! as [
    { body?: Record<string, unknown> } | undefined,
  ];
  return options?.body ?? {};
};

beforeEach(() => {
  harness.chats.clear();
  vi.clearAllMocks();
});

/**
 * The CAD context an external admission carried.
 *
 * @param body - The turn body the client sent.
 * @returns Its `browserHost.context` object.
 */
const externalContext = (body: Record<string, unknown>): Record<string, unknown> => {
  const parsed = z.object({ browserHost: z.object({ context: z.record(z.string(), z.unknown()) }) }).safeParse(body);
  return parsed.data?.browserHost.context ?? {};
};

describe('seeded first turn execution', () => {
  it('runs the external agent the consumed row selected, not the cookie Tau fallback', async () => {
    const body = await dispatchSeededTurn({ kind: 'acp', hostId: 'desktop', agentId: 'codex' });

    expect(body['agent']).toMatchObject({
      profile: 'cad',
      execution: { kind: 'acp', hostId: 'desktop', agentId: 'codex' },
    });
    /* V12: the agent selection *and* the CAD context the client composed —
     * without it the daemon prompts an agent that knows no kernel at all. No
     * Tau model row, prompt blocks or tool grant travel with it (X6). */
    expect(body['browserHost']).toMatchObject({ trigger: 'submit', agent: { kind: 'acp', id: 'codex' } });
    const context = externalContext(body);
    expect(String(context['systemPrompt'])).toContain('<workflow>');
    expect(Object.keys(context)).not.toContain('model');
    // An external agent is daemon-placed: the daemon owns the files, so no
    // browser workspace claim is prepared or fenced for this turn — but the
    // target still names the host and the mode it must record in (V18).
    expect(body['execution']).toEqual({ hostId: 'desktop' });
  });

  it('keeps the consumed row’s Tau host and model instead of rebuilding them from the cookie', async () => {
    const body = await dispatchSeededTurn({ kind: 'tau', hostId: 'origin', model: 'openai-gpt-5.5' });

    expect(body['agent']).toMatchObject({ execution: { kind: 'tau', hostId: 'origin', model: 'openai-gpt-5.5' } });
    const browserHost = body['browserHost'] as { trigger: string; config: { model: { id: string } } };
    expect(browserHost.trigger).toBe('submit');
    expect(browserHost.config.model.id).toBe('openai-gpt-5.5');
    expect(JSON.stringify(body)).not.toContain(cookieModelId);
  });

  /**
   * `useCookieExecution` fabricates the identical `{ kind: 'tau', model:
   * <cookie> }` value, and is held back only by both textareas gating the
   * agent chip on a session. It is the same residue the dispatch-side
   * override displaces: pinning its shape here is what makes the pair of
   * assertions above meaningful for *both* providers.
   */
  it('fabricates the same Tau-from-cookie value under the cookie-only provider', () => {
    let observed: CadAgentExecution | undefined;
    function Composer(): React.JSX.Element {
      observed = useChatComposer().execution.execution;
      return <span />;
    }
    render(
      <ChatComposerProvider>
        <Composer />
      </ChatComposerProvider>,
    );

    expect(observed).toEqual({ kind: 'tau', model: cookieModelId });
  });
});
