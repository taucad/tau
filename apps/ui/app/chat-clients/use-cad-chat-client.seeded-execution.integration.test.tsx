/* eslint-disable @typescript-eslint/naming-convention -- the AI SDK `Chat` stand-in mirrors the SDK's own `~`-prefixed subscriber method names verbatim. */
/**
 * Seeded first turn — execution provenance (integration)
 *
 * A seeded first turn starts before the focused view necessarily knows its
 * model. Its durable startup intent and persisted execution must be the
 * command source; the cookie fallback must not turn an ACP seed into Tau.
 *
 * So this scope deliberately mounts the **real** `<ActiveChatProvider>` (no
 * `vi.mock` of the provider), the real `useCadChatClient` and the real
 * `ChatSessionStore` over a chat row that carries both an `activeExecution`
 * and a pending startup request, and asserts on the one durable host command.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { CadAgentExecution, Chat as ChatEntity, MyUIMessage } from '@taucad/chat';
import type * as CadAgentConfigModuleShape from '#hooks/use-cad-agent-config.js';
import { ChatSessionStore } from '#services/chat-session-store.js';
import { ActiveChatProvider, ChatComposerProvider, useChatComposer } from '#hooks/active-chat-provider.js';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import { ChatTurnHost } from '#chat-clients/chat-turn-host.js';
import { createActor } from 'xstate';
import { projectSessionMachine } from '#machines/project-session.machine.js';
import { resetChatTurnServices } from '#chat-clients/_internal/chat-host-binding.js';
import type { AgentHostClient } from '#services/agent-host-client.js';
import type { HostCommand } from '@taucad/agent-host/wire';

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
    commands: [] as HostCommand[],
    store: undefined as unknown as ChatSessionStore,
    projectSession: undefined as { stop: () => void } | undefined,
    models: {
      selectedModelId: 'openai-gpt-5.6-luna',
      selectedModel: resolveModel('openai-gpt-5.6-luna'),
      resolveModel,
      setSelectedModelId: noop,
      defaultExecution: { kind: 'tau', model: 'openai-gpt-5.6-luna' },
      lastTauExecution: { kind: 'tau', model: 'openai-gpt-5.6-luna' },
      rememberExecution: vi.fn(),
      catalog: { status: 'loaded', models: [] },
      ensureModelCatalog: async () => ({ status: 'loaded', models: [] }),
    },
    patchChat: vi.fn(async () => undefined),
    actions: { sendMessage: vi.fn(), regenerate: vi.fn(), stop: vi.fn() },
    /** An empty worker filesystem: every composer record reads as absent. */
    client: {
      readFile: async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      },
      writeFile: async () => undefined,
      exists: async () => false,
      readdir: async (): Promise<string[]> => [],
      unlink: async () => undefined,
      rmdir: async () => undefined,
    },
    /** Browser workspace claim — present so the client publishes its factory. */
    workspaceExecution: {
      hostId: 'host_seeded',
      workspaceId: 'workspace_seeded',
      baseRevisionId: 'revision_seeded',
    },
  };
});

// The store's own `Chat` instance, minus the AI SDK and its transport: this
// scope asserts on the host command, never on a stream.
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
// Absent file manager: this scope publishes an explicit host-command stub.
vi.mock('#hooks/use-file-manager.js', () => ({
  useOptionalFileManager: () => undefined,
  useFileManager: () => ({ client: harness.client }),
}));
/* The turn-start pre-flight (R9) is proved in `use-credit-preflight.test.tsx` and
 * `use-cad-chat-client.test.tsx`; this scope funds every turn. */
vi.mock('#hooks/use-credit-preflight.js', () => ({ useCreditPreflight: () => () => undefined }));
vi.mock('#hooks/use-draft-image-error-toast.js', () => ({ useDraftImageErrorToast: () => undefined }));
/* ChatTurnHost reads the usage-metrics preference through react-query; this scope has no query client. */
vi.mock('#hooks/use-privacy-preferences.js', () => ({ usePrivacyPreferences: () => ({ preferences: undefined }) }));
vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
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

const buildSeededRow = (activeExecution: CadAgentExecution | undefined): ChatEntity => ({
  id: chatId,
  resourceId: 'proj_seeded',
  name: 'Seeded chat',
  messages: [pendingUserMessage],
  ...(activeExecution === undefined ? {} : { activeExecution }),
  startupRequest: {
    id: 'req_seeded',
    kind: 'regenerate-tail',
    messageId: pendingUserMessage.id,
    source: 'homepage-initial-message',
    createdAt: 1_700_000_000_000,
    message: pendingUserMessage,
  },
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
});

/** Mount the real provider + client over a row seeded with `activeExecution`. */
const dispatchSeededTurn = async (activeExecution: CadAgentExecution | undefined): Promise<HostCommand> => {
  const row = buildSeededRow(activeExecution);
  const store = new ChatSessionStore();
  harness.store = store;
  store.setDependencies({
    getChat: async () => row,
    patchChat: harness.patchChat,
    touchChatRecency: async () => undefined,
    consumeChatStartupRequest: async () => ({ ...row, startupRequest: undefined }),
    commitCancelledDraftRestore: async () => undefined,
    client: harness.client,
  });
  store.publishProjectHostConnector(
    row.resourceId,
    async () =>
      ({
        hostCommand: async (command: HostCommand) => {
          harness.commands.push(command);
          return { commandId: command.commandId, generation: 1, status: 'applied', effect: 'durable', cursor: 1 };
        },
        // A seed waits for a fresh, caught-up read of its own empty host log.
        subscribe: (...args: Parameters<AgentHostClient['subscribe']>) => {
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
          return () => undefined;
        },
        close: async () => undefined,
      }) as unknown as AgentHostClient,
  );
  /* The seeded turn is a turn like any other: its owner is the chat's session
   * actor under its project's, and the admission it invokes is the one
   * `ChatTurnHost` publishes below (C3). */
  const projectSession = createActor(projectSessionMachine, { input: { projectId: row.resourceId } });
  projectSession.start();
  harness.projectSession = projectSession;
  store.setFocusedProject(row.resourceId);
  store.setProjectSession(row.resourceId, projectSession);

  function Client(): React.JSX.Element {
    useCadChatClient();
    return <span />;
  }

  render(
    <ActiveChatProvider chatId={chatId} projectId={row.resourceId}>
      {/* The chat's one turn host composes the durable command; the view beside it only reads. */}
      <ChatTurnHost />
      <Client />
    </ActiveChatProvider>,
  );

  await waitFor(() => {
    expect(harness.commands).toHaveLength(1);
  });
  return harness.commands[0]!;
};

beforeEach(() => {
  harness.chats.clear();
  harness.commands.length = 0;
  harness.projectSession?.stop();
  harness.projectSession = undefined;
  resetChatTurnServices();
  vi.clearAllMocks();
});

describe('seeded first turn execution', () => {
  it('runs the external agent the consumed row selected, not the cookie Tau fallback', async () => {
    const command = await dispatchSeededTurn({ kind: 'acp', hostId: 'desktop', agentId: 'codex' });

    expect(command).toMatchObject({
      type: 'start',
      commandId: 'req_seeded',
      payload: { runId: 'req_seeded', trigger: 'submit', config: { agent: { kind: 'acp', id: 'codex' } } },
    });
    /* V12: the agent selection *and* the CAD context the client composed —
     * without it the daemon prompts an agent that knows no kernel at all. No
     * Tau model row, prompt blocks or tool grant travel with it (X6). */
    if (command.type !== 'start') {
      throw new Error('Expected seeded Start');
    }
    expect(command.payload.config?.systemPrompt).toContain('<workflow>');
    expect(command.payload.config).not.toHaveProperty('model');
  });

  it('keeps the consumed row’s Tau host and model instead of rebuilding them from the cookie', async () => {
    const command = await dispatchSeededTurn({ kind: 'tau', hostId: 'origin', model: 'openai-gpt-5.5' });

    expect(command).toMatchObject({
      type: 'start',
      commandId: 'req_seeded',
      payload: { runId: 'req_seeded', trigger: 'submit', config: { model: { id: 'openai-gpt-5.5' } } },
    });
    expect(JSON.stringify(command)).not.toContain(cookieModelId);
  });

  it('remembers the external agent a turn ran on as the next new chat’s default', async () => {
    const codex: CadAgentExecution = { kind: 'acp', hostId: 'desktop', agentId: 'codex', model: 'gpt-6-astra' };
    await dispatchSeededTurn(codex);

    await waitFor(() => {
      expect(harness.models.rememberExecution).toHaveBeenCalledWith(codex);
    });
  });

  it('commits the default a chat with no execution of its own ran on, so later defaults cannot move it', async () => {
    await dispatchSeededTurn(undefined);

    await waitFor(() => {
      expect(harness.patchChat).toHaveBeenCalledWith(chatId, 'activeExecution', { kind: 'tau', model: cookieModelId });
    });
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
      <ChatComposerProvider surface='marketing'>
        <Composer />
      </ChatComposerProvider>,
    );

    expect(observed).toEqual({ kind: 'tau', model: cookieModelId });
  });
});
