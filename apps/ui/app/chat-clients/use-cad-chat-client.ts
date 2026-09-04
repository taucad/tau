import { useCallback, useEffect, useRef } from 'react';
import type { ChatStatus } from 'ai';
import { isAnyToolPart, modelSupportsInput } from '@taucad/chat';
import type { CadAgentConfigInput, ModelProvider, MyUIMessage, TauAgentHostId } from '@taucad/chat';
import { getCadSystemPrompt } from '@taucad/chat/prompts';
import { getProviderFacingToolInputSchemas } from '@taucad/chat/schemas';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import { messageRole, messageStatus } from '@taucad/chat/constants';
import { awaitAgentHostAvailability, useAgentHostPlacements, useCadAgentConfig } from '#hooks/use-cad-agent-config.js';
import { useActiveChatInstance } from '#chat-clients/_internal/use-active-chat-instance.js';
import { useChatActions, useChatSelector } from '#hooks/use-chat.js';
import { useActiveChatSession } from '#hooks/active-chat-provider.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { extractMimeTypeFromDataUrl } from '#utils/chat.utils.js';
import { parseErrorForPersistence } from '#utils/error.utils.js';
import { useProject } from '#hooks/use-project.js';
import {
  readRootedBridgeCapabilities,
  useOptionalChatWorkspaceAuthority,
} from '#providers/chat-workspace-authority-provider.js';
import {
  getBrowserAgentHostRun,
  registerAgentHost,
  resolveBrowserAgentHostInterrupt,
} from '#chat-clients/_internal/browser-agent-host-transport.js';
import {
  createAgentHostClient,
  createBrowserAgentHostClient,
  isBrowserAgentHostProviderKind,
} from '#services/agent-host-client.js';
import type { AgentHostClientOptions } from '#services/agent-host-client.js';
import type { AgentChannelClient } from '@taucad/agent-host';
import { createDaemonAgentHostTransport } from '#services/daemon-agent-host-client.js';
import { desktopWorkspaceRoot, openAgentHostChannel } from '#lib/agent-host-placement.js';
import { getProjectFileSystemConfig } from '#filesystem/handle-store.js';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';
import { useOptionalFileManager } from '#hooks/use-file-manager.js';
import { ENV } from '#environment.config.js';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';
import { withTauExecutionModel } from '#utils/chat-execution.js';
import { getChatRevisionMode, withoutChatRevisionMode } from '#utils/chat-revision-mode.js';
import { useModels } from '#hooks/use-models.js';
import type { ResolvedModel } from '#hooks/use-models.js';
import { createCachedSystemPromptBlocks } from '@taucad/agent-host';
import type { AgentHostAdmissionConfig, AgentHostExternalAgent } from '#workers/agent-host.contract.js';
import { buildBrowserAgentHostSnapshotContext } from '#chat-clients/_internal/browser-agent-host-snapshot-context.js';

/**
 * Input payload for {@link CadChatClient.submit}. Mirrors the surface the
 * `ChatTextarea`'s `onSubmit` hands the client — a string `text` plus an
 * optional list of image-url attachments. All other request configuration
 * (model, kernel, mode, toolChoice, testingEnabled, snapshot, contextPayload)
 * is composed *inside* the client from `useCadAgentConfig`.
 *
 * @public
 */
export type CadChatSubmitInput = {
  readonly text: string;
  readonly imageUrls?: readonly string[];
};

/**
 * Public surface of the CAD chat client. Every UI assembly site reaches the
 * `/v1/chat` wire through one of these verbs — never through the raw
 * `Chat.sendMessage` / `Chat.regenerate` API or a hand-built `body: { ... }`
 * literal. This is the indirection that stops the previously-broken
 * kernel / testingEnabled / model fields from sprawling across N call sites
 * (the original symptom behind the chat-metadata-first-class-architecture
 * refactor).
 *
 * The verbs route their requests through the **persistence machine** (via
 * `useChatActions().sendMessage`) so the entire request lifecycle —
 * milestone persists, tool-state cleanup on abort / disconnect, auto-retry
 * on transport disconnects, status emit on `streaming` — remains owned by
 * the existing `chatPersistenceMachine`. The chat client's only addition
 * is the per-request `body: { agent }` payload it threads onto each
 * dispatch (see `dispatchRequest` in `chat-session-store.ts`).
 *
 * @public
 */
export type CadChatClient = {
  /** Send a fresh user message. Builds `{ body: { agent } }` from the live agent config. */
  submit: (input: CadChatSubmitInput) => void;
  /**
   * Replace the targeted user message's text/image parts and regenerate the
   * assistant turn from there. The wire body's `agent` block is composed
   * from the live `useCadAgentConfig` snapshot — never from the historical
   * user-message metadata (which is preserved verbatim for display badges).
   */
  edit: (messageId: string, input: CadChatSubmitInput) => void;
  /** Re-run the assistant turn after a specific user message id (used by message-edit / regen-on-N flows). */
  retry: (messageId: string, modelId?: string) => void;
  /** Re-run the latest assistant turn (used by startup-request hydration + Fix-with-AI in-place). */
  regenerateTail: () => void;
  /** Abort the in-flight request, if any. */
  stop: () => void;
  /** Approve or deny a durable external-tool interrupt and resume it with the current agent config. */
  respondToToolApproval: (approvalId: string, approved: boolean, reason?: string) => Promise<void>;
  /** Live message list from the bound `Chat` instance. */
  messages: readonly MyUIMessage[];
  /** Live status from the bound `Chat` instance. */
  status: ChatStatus;
  /** Live error from the bound `Chat` instance. */
  error: Error | undefined;
  /**
   * Snapshot of the agent config the client will send on its next call.
   * Exposed for test/regression scope and the chat-session-store dispatch
   * adapter (R10/t17) — production UI sites should not read this directly.
   */
  agent: CadAgentConfigInput;
};

/** Upper bound on waiting for a conflicting admitted claim to clear. Milliseconds. */
const admissionWaitTimeout = 15_000;
/** Upper bound on waiting for `GET /v1/models` to answer before a turn composes. Milliseconds. */
const modelCatalogWaitTimeout = 20_000;

const buildUserMessage = (input: CadChatSubmitInput): MyUIMessage => {
  const trimmed = input.text.trim();
  const imageUrls = input.imageUrls ?? [];
  const fileParts: MyUIMessage['parts'] = imageUrls.map((url) => ({
    type: 'file',
    url,
    mediaType: extractMimeTypeFromDataUrl(url),
  }));
  const textParts: MyUIMessage['parts'] = trimmed.length > 0 ? [{ type: 'text', text: trimmed }] : [];
  const parts: MyUIMessage['parts'] = [...fileParts, ...textParts];
  return {
    id: generatePrefixedId(idPrefix.message),
    role: messageRole.user,
    parts,
    metadata: {
      status: messageStatus.pending,
      createdAt: Date.now(),
    },
  };
};

type BrowserHostTrigger =
  | { readonly trigger: 'submit' }
  | {
      readonly trigger: 'retry' | 'edit' | 'regenerate';
      readonly retainedMessageIds: readonly string[];
    };

type BrowserHostAdmissionConfig = Omit<AgentHostAdmissionConfig, 'model'> & {
  readonly model: AgentHostClientOptions['model'];
};

/**
 * The admission a host-placed turn carries, in its two shapes.
 *
 * A Tau turn carries the browser-host config; an external-agent turn names the
 * agent and nothing else, because the agent brings its own model, its own tools
 * and the user's own CLI login (W4-ACP / X6).
 */
type BrowserHostAdmission = BrowserHostTrigger &
  ({ readonly config: BrowserHostAdmissionConfig } | { readonly agent: AgentHostExternalAgent });

const createRunBody = (input: {
  readonly agent: CadAgentConfigInput;
  readonly projectId: string;
  /**
   * The durable workspace claim this turn writes under. Absent for a Tau Host
   * turn: the daemon owns its own workspace, and no browser claim describes it.
   */
  readonly execution?:
    | { readonly workspaceId: string; readonly baseRevisionId: string; readonly hostId: string }
    | undefined;
  readonly browserHost?: ((runId: string) => BrowserHostAdmission) | undefined;
  /** Minted by the caller when it had to do async work for this same run. */
  readonly runId?: string | undefined;
}): Readonly<Record<string, unknown>> => {
  const runId = input.runId ?? generatePrefixedId(idPrefix.request);
  return Object.freeze({
    // The revision mode is a client-only selection; `tauAgentExecutionSchema`
    // is strict and would reject it at the turn boundary.
    agent: { ...input.agent, execution: withoutChatRevisionMode(input.agent.execution) },
    projectId: input.projectId,
    ...(input.execution === undefined ? {} : { execution: input.execution }),
    admission: Object.freeze({
      version: 1,
      idempotencyKey: runId,
    }),
    ...(input.browserHost === undefined ? {} : { browserHost: Object.freeze(input.browserHost(runId)) }),
  });
};

/**
 * Client-authored payloads (snapshot, context) are TS objects whose optional
 * fields surface as `undefined` properties; the admission wire and the durable
 * log speak strict JSON, which rejects them. One JSON round-trip normalizes.
 */
// oxlint-disable-next-line unicorn/prefer-structured-clone -- JSON serialization intentionally drops undefined fields.
const toStrictJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const agentHostConfig = (input: {
  readonly agent: CadAgentConfigInput;
  readonly chatId: string;
  readonly runId: string;
  readonly resolvedModel: ResolvedModel;
}): BrowserHostAdmissionConfig => {
  const { agent, resolvedModel } = input;
  if (agent.execution.kind !== 'tau') {
    throw new TypeError('Browser agent host requires Tau execution.');
  }
  const { model } = resolvedModel;
  const prompt = getCadSystemPrompt(agent.kernel, agent.mode, agent.testingEnabled, {
    chatId: input.chatId,
    modelId: agent.execution.model,
    contextWindow: model?.details.contextWindow,
    knowledgeCutoff: model?.details.knowledgeCutoff,
    supportsImageInput: modelSupportsInput(model?.support, 'image'),
  });
  // One cache breakpoint per block that carries content. The workspace slot is
  // empty on this path, and emitting it anyway spent a breakpoint on nothing.
  const systemPromptBlocks = createCachedSystemPromptBlocks({
    staticPrompt: prompt.static,
    dynamicPrompt: prompt.dynamic,
  }) as AgentHostAdmissionConfig['systemPromptBlocks'];
  const snapshotContext = agent.snapshot ? buildBrowserAgentHostSnapshotContext(agent.snapshot) : undefined;
  return {
    systemPrompt: [prompt.static, prompt.dynamic].join('\n\n'),
    systemPromptBlocks,
    model: {
      id: agent.execution.model,
      providerKind: requireProviderKind(model?.provider.id),
      contextWindow: model?.details.contextWindow ?? 128_000,
      ...(model?.details.maxTokens === undefined ? {} : { maxTokens: model.details.maxTokens }),
      ...(model?.details.cost === undefined
        ? {}
        : {
            cost: {
              input: model.details.cost.inputTokens,
              output: model.details.cost.outputTokens,
              cacheRead: model.details.cost.cacheReadTokens,
              cacheWrite: model.details.cost.cacheWriteTokens,
            },
          }),
    },
    toolChoice: agent.toolChoice,
    allowedTools: getProviderFacingToolInputSchemas({
      toolChoice: agent.toolChoice,
      testingEnabled: agent.testingEnabled,
      modelSupport: model?.support,
    }).map(({ toolName }) => toolName),
    testingEnabled: agent.testingEnabled,
    snapshot: agent.snapshot === undefined ? undefined : toStrictJson(agent.snapshot),
    contextPayload: agent.contextPayload === undefined ? undefined : toStrictJson(agent.contextPayload),
    contextMessages: snapshotContext
      ? [
          {
            id: `tau:snapshot-context:${input.runId}`,
            role: 'user',
            content: snapshotContext,
            metadata: {
              tauInternal: {
                kind: 'snapshot-context',
                anchorId: input.chatId,
                pruning: 'replace-by-id',
              },
            },
          },
        ]
      : undefined,
  };
};

/**
 * Every Tau turn is a browser-host turn: the API-coordinated placement was
 * removed, not demoted. A non-Tau execution (Paseo) returns no admission and
 * the transport keeps coordinating it through the API until W4 re-homes it.
 */
const hostAdmission = (input: {
  readonly agent: CadAgentConfigInput;
  readonly chatId: string;
  readonly resolveModel: (modelId: string) => ResolvedModel;
  readonly trigger: BrowserHostTrigger;
  /** A daemon-minted Tau MCP endpoint for a Paseo run, when one is paired. */
  readonly mcp?: { readonly mcpUrl: string; readonly mcpHeaders: Readonly<Record<string, string>> } | undefined;
}): ((runId: string) => BrowserHostAdmission) | undefined => {
  if (input.agent.execution.kind === 'acp') {
    const { agentId } = input.agent.execution;
    return () => ({ ...input.trigger, agent: { kind: 'acp', id: agentId } });
  }
  if (input.agent.execution.kind === 'paseo') {
    /* SP-10: Paseo runs on the *browser* host, not a daemon — the page holds
     * the E2EE session, so this is a browser-host admission like a Tau turn's,
     * carrying the runner discriminant instead of a Tau model. */
    const { agentId, connectionId } = input.agent.execution;
    return () => ({
      ...input.trigger,
      agent: { kind: 'paseo', id: agentId, connectionId, ...input.mcp },
    });
  }
  /* Every remaining kind is Tau: the union is exhausted above. */
  const resolvedModel = input.resolveModel(input.agent.execution.model);
  return (runId) => ({
    ...input.trigger,
    config: agentHostConfig({ agent: input.agent, chatId: input.chatId, runId, resolvedModel }),
  });
};

/**
 * Dial one daemon placement.
 *
 * Launcher 2 alone needs an argument beyond the host id: it is brokered per
 * *folder* — main grants a root and refuses everything else — so the desktop
 * placement resolves this project's absolute node path first. Every other
 * placement names its own workspace on the wire, and is dialled by id alone.
 *
 * @param hostId - The placement to dial.
 * @param projectId - Project whose node root launcher 2 is granted.
 * @returns An open channel client.
 */
/**
 * Ask a paired daemon to mint this run's Tau MCP capability.
 *
 * A Paseo agent runs on the user’s own machine, so the only Tau tools it can
 * reach are a paired `tau serve`'s `/mcp` endpoint — and the page cannot sign
 * the capability, because the signing secret never leaves that daemon. A
 * daemon with no MCP endpoint refuses, and the run proceeds without Tau
 * tools, which is what the selector row already tells the user.
 *
 * @param input - The daemon to ask and the run to bind the capability to.
 * @returns The endpoint and headers, or `undefined` when none is available.
 */
const mintPaseoMcpCapability = async (input: {
  readonly hostId: TauAgentHostId;
  readonly projectId: string;
  readonly chatId: string;
  readonly runId: string;
}): Promise<{ readonly mcpUrl: string; readonly mcpHeaders: Readonly<Record<string, string>> } | undefined> => {
  let channel: AgentChannelClient | undefined;
  try {
    channel = await dialAgentHost(input.hostId, input.projectId);
    const answer = await channel.execute({
      type: 'mint-mcp-capability',
      chatId: input.chatId,
      runId: input.runId,
    });
    return answer.type === 'mcp-capability' ? { mcpUrl: answer.url, mcpHeaders: answer.headers } : undefined;
  } catch {
    /* No paired host, no MCP endpoint, or an unreachable one. The turn still
     * runs — without Tau tools — rather than failing on a capability the
     * user was already told they might not have. */
    return undefined;
  } finally {
    channel?.close();
  }
};

const dialAgentHost = async (hostId: TauAgentHostId, projectId: string): Promise<AgentChannelClient> =>
  hostId === 'desktop'
    ? openAgentHostChannel(hostId, { workspaceRoot: await desktopWorkspaceRoot(projectId) })
    : openAgentHostChannel(hostId);

/**
 * The daemon this turn is placed on, if any.
 *
 * A Tau turn names one *optionally* — absent means this browser's own worker.
 * An external agent names one **always**: `acpAgentExecutionSchema` requires a
 * `hostId` because the adapter is a local process no browser can host. Reading
 * it in one place is what keeps the two kinds on the same daemon path.
 *
 * @param execution - The turn's execution selection.
 * @returns The host id, or `undefined` for a browser-placed or Paseo turn.
 */
const daemonPlacementOf = (execution: CadAgentConfigInput['execution']): TauAgentHostId | undefined =>
  execution.kind === 'tau' || execution.kind === 'acp' ? execution.hostId : undefined;

const retainedMessageIdsBeforeTurn = (
  messages: readonly MyUIMessage[],
  messageId: string | undefined,
): readonly string[] => {
  const messageIndex = messageId === undefined ? -1 : messages.findIndex((message) => message.id === messageId);
  const turnIndex = messages.findLastIndex((message, index) => index <= messageIndex && message.role === 'user');
  return messages.slice(0, Math.max(turnIndex, 0)).map((message) => message.id);
};

/**
 * The trigger a *bodyless* dispatch admits with. Two request kinds arrive here
 * (see `dispatchRequest` in `chat-session-store.ts`): startup-request hydration
 * — the seeded "New project → first prompt" turn — and `continue`.
 *
 * A seeded first turn has no assistant history to rewind and no durable log to
 * retain a prefix from. Admitted as a `regenerate` it was refused by
 * `packages/agent-host` with `HISTORY_PREFIX_INVALID` ("retry/edit/regenerate
 * must retain an unchanged strict history prefix" — an empty log has no prefix
 * a non-empty retain can match, and an empty retain fails the same guard), so
 * the operator's primary flow never ran on the browser host. It is a first
 * turn: it admits as one, exactly like the composer's own submit.
 */
const hydrationTrigger = (messages: readonly MyUIMessage[], lastAssistantId: string | undefined): BrowserHostTrigger =>
  lastAssistantId === undefined
    ? { trigger: 'submit' }
    : { trigger: 'regenerate', retainedMessageIds: retainedMessageIdsBeforeTurn(messages, lastAssistantId) };

const userTurnIdAtOrBefore = (messages: readonly MyUIMessage[], messageId?: string): string | undefined => {
  const messageIndex =
    messageId === undefined ? messages.length - 1 : messages.findIndex((message) => message.id === messageId);
  return messages.findLast((message, index) => index <= messageIndex && message.role === 'user')?.id;
};

const requireProviderKind = (provider: ModelProvider | undefined): ModelProvider => {
  if (!provider) {
    throw new Error('Browser agent host requires resolved model provider metadata.');
  }
  return provider;
};

/**
 * Profile-scoped chat client for the CAD agent.
 *
 * Composes:
 * - {@link useCadAgentConfig} — the assembler hook that builds the per-turn
 *   `agent` payload from the current UI producer hooks.
 * - {@link useActiveChatInstance} — the module-private accessor for the live
 *   AI SDK `Chat` instance owned by the chat-session store. Exposed via the
 *   client's `messages`/`status`/`error` reads.
 * - {@link useChatActions} — the persistence-machine entry point. Verbs go
 *   through here so the machine still owns lifecycle / cleanup / retry.
 *
 * Exposes profile-aware verbs (`submit`, `retry`, `regenerateTail`, `stop`)
 * that thread `body: { agent }` onto every wire call. Verb identities are
 * stable across renders as long as the underlying actions and agent identity
 * don't change.
 *
 * @public
 */
export const useCadChatClient = (): CadChatClient => {
  const chat = useActiveChatInstance();
  const actions = useChatActions();
  const agent = useCadAgentConfig();
  const status = useChatSelector((state) => state.status);
  const requestInFlight = status === 'submitted' || status === 'streaming';
  // The CAD chat client is session-required by construction (it composes
  // `useActiveChatInstance` / `useChatActions`), so `activeChatId` is a
  // guaranteed `string` from the strict session context — no optional
  // branching needed.
  const { activeChatId } = useActiveChatSession();
  const store = useChatSessionStore();
  const { projectId, geometryUnits, mainEntryPath } = useProject();
  // Optional: the API path renders without a FileManagerProvider; the
  // browser-host registration effect below guards on its presence.
  const fileManager = useOptionalFileManager();
  const fileManagerRef = fileManager?.fileManagerRef;
  const syncProjectRoots = fileManager?.workspace.syncProjectRoots;
  const { resolveModel } = useModels();
  const workspaceAuthority = useOptionalChatWorkspaceAuthority();
  // Always the current resolver: a dispatch composed before `GET /v1/models`
  // answers must read the catalog row that arrives *while* it waits, not the
  // unresolved one its render closed over.
  const resolveModelRef = useRef(resolveModel);
  useEffect(() => {
    resolveModelRef.current = resolveModel;
  }, [resolveModel]);
  /*
   * The paired Tau Host a Paseo run borrows Tau tools from.
   *
   * ponytail: the first online host, not the one on the Paseo daemon's own
   * machine — nothing maps a Paseo connection to a host device yet, and the
   * topology that matters (one laptop running both) has exactly one. The
   * selector row reports the same thing, so the two never disagree.
   */
  const { targets: hostPlacements } = useAgentHostPlacements();
  const paseoMcpHostRef = useRef<TauAgentHostId | undefined>(undefined);
  useEffect(() => {
    paseoMcpHostRef.current = hostPlacements.find((placement) => placement.online)?.hostId;
  }, [hostPlacements]);
  const preparing = useRef(false);
  const messages = Array.isArray(chat.messages) ? chat.messages : [];

  useEffect(() => {
    if (agent.execution.kind === 'paseo') {
      return;
    }
    const { execution } = agent;
    const daemonHostId = execution.hostId;
    if (daemonHostId !== undefined) {
      /* A daemon owns its own workspace, its own filesystem and its own tools:
       * nothing here claims workspace authority, opens a bridge, or resolves
       * project storage — the whole point of placing the turn there. */
      const unregister = registerAgentHost(activeChatId, {
        projectStorage: async () => {
          throw new Error('A Tau Host turn reads its workspace from the daemon, not from this browser.');
        },
        markRunId: async () => undefined,
        createClient: async () =>
          /* A dial *function*, not an already-open channel: a relayed channel
           * dies for reasons that have nothing to do with the run, and the
           * transport can only heal itself if it can dial again. */
          createAgentHostClient(createDaemonAgentHostTransport(async () => dialAgentHost(daemonHostId, projectId))),
      });
      /* And because it claims nothing, reload discovery — which substantiates a
       * run from this browser's claims — never retains it: the reattach rides
       * the registration instead, which is also the first moment the transport
       * can answer a reconnect for this chat with the daemon rather than the
       * API. Ordering matters; the store defers the resume by a microtask. */
      store.reattachHostChat({ chatId: activeChatId, hostId: daemonHostId });
      return unregister;
    }
    /* An external agent is *always* daemon-placed — the adapter is a local
     * process, and `acpAgentExecutionSchema` requires a `hostId` for exactly
     * that reason — so there is no browser assembly below for it to fall into. */
    if (execution.kind !== 'tau') {
      return;
    }
    if (!workspaceAuthority || fileManagerRef === undefined || syncProjectRoots === undefined) {
      return;
    }
    let projectStorage: Promise<ProjectFileSystemConfig> | undefined;
    const resolveProjectStorage = async (): Promise<ProjectFileSystemConfig> => {
      const resolved =
        projectStorage ??
        (projectStorage = (async () => {
          const config = await getProjectFileSystemConfig(projectId);
          if (!config) {
            throw new Error(`Project ${projectId} has no filesystem configuration.`);
          }
          // The stored row carries the full project record (manifest, files,
          // editorState, ...); the admission wire takes only the per-backend
          // storage discriminant — project it explicitly.
          switch (config.backend) {
            case 'memory': {
              return {
                projectId: config.projectId,
                backend: config.backend,
                storageRootKey: config.storageRootKey,
                providerBasePath: config.providerBasePath,
              };
            }
            case 'webaccess': {
              return {
                projectId: config.projectId,
                backend: config.backend,
                workspaceId: config.workspaceId,
                providerBasePath: config.providerBasePath,
              };
            }
            default: {
              return {
                projectId: config.projectId,
                backend: config.backend,
                providerBasePath: config.providerBasePath,
              };
            }
          }
        })());
      return resolved;
    };
    const openProjectRootBridge = () => {
      const { openFileSystemBridge, rootDirectory } = fileManagerRef.getSnapshot().context;
      if (!openFileSystemBridge) {
        throw new Error('The active project filesystem bridge is unavailable.');
      }
      return openFileSystemBridge(rootDirectory);
    };
    return registerAgentHost(activeChatId, {
      projectStorage: resolveProjectStorage,
      markRunId: async (runId) => workspaceAuthority.markRunId(activeChatId, runId),
      createClient: async () => {
        await syncProjectRoots();
        const [prepared, storage, capabilities] = await Promise.all([
          workspaceAuthority.prepare(activeChatId, { mode: getChatRevisionMode(execution) }),
          resolveProjectStorage(),
          readRootedBridgeCapabilities(openProjectRootBridge),
        ]);
        if (!capabilities.writable || !capabilities.durability) {
          throw new Error('The active project filesystem is not writable or did not declare durability.');
        }
        const config = agentHostConfig({
          agent,
          chatId: activeChatId,
          runId: activeChatId,
          resolvedModel: resolveModel(execution.model),
        });
        return createBrowserAgentHostClient({
          openFileSystemBridge: prepared.openFileSystemBridge,
          openProjectRootBridge,
          projectStorage: storage,
          durability: capabilities.durability,
          authority: { projectId, workspaceId: prepared.execution.workspaceId },
          gatewayBaseUrl: ENV.TAU_API_URL,
          systemPrompt: config.systemPrompt,
          systemPromptBlocks: config.systemPromptBlocks,
          model: config.model,
          runtimeConfig: createUiRuntimeConfig(ENV),
          lengthSymbol: geometryUnits.get(mainEntryPath)?.getSnapshot().context.units.length ?? 'mm',
          testingEnabled: config.testingEnabled,
        });
      },
    });
  }, [
    activeChatId,
    agent,
    fileManagerRef,
    geometryUnits,
    mainEntryPath,
    projectId,
    resolveModel,
    store,
    syncProjectRoots,
    workspaceAuthority,
  ]);

  const revisionMode = getChatRevisionMode(agent.execution);

  /** The catalog row for this turn's model, waiting out a cold `GET /v1/models`. */
  const awaitResolvedModel = useCallback(async (modelId: string): Promise<ResolvedModel> => {
    const deadline = Date.now() + modelCatalogWaitTimeout;
    let resolved = resolveModelRef.current(modelId);
    while (!resolved.isResolved && Date.now() < deadline) {
      // oxlint-disable-next-line no-await-in-loop -- polling the catalog is inherently serial
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 100);
      });
      resolved = resolveModelRef.current(modelId);
    }
    return resolved;
  }, []);

  /**
   * The single admission path: wait out a conflicting admitted claim, prepare
   * (or reuse) this chat's workspace, and mark it admitted before the turn is
   * composed. Every dispatch resolves its execution target here — a body
   * composed ahead of time can name a workspace a later `prepare` discarded.
   */
  const admitWorkspace = useCallback(
    async (
      turnId: string | undefined,
    ): Promise<
      { readonly workspaceId: string; readonly baseRevisionId: string; readonly hostId: string } | undefined
    > => {
      const daemonHostId = daemonPlacementOf(agent.execution);
      // Every host placement waits out its own probe: a turn dispatched before
      // one answers must WAIT for it (the seeded first turn fires at chat load,
      // ahead of the probe), and an answered "unavailable" must refuse with its
      // reason — never a silent downgrade, in either direction.
      if (agent.execution.kind !== 'paseo') {
        const availability = await awaitAgentHostAvailability({
          projectId,
          ...(daemonHostId === undefined ? {} : { hostId: daemonHostId }),
        });
        if (availability.status !== 'available') {
          throw Object.assign(
            new Error(
              availability.status === 'pending'
                ? daemonHostId === undefined
                  ? 'Tau is still checking whether this project can run the agent in your browser.'
                  : 'Tau is still looking for that agent host.'
                : availability.reason,
            ),
            { code: 'CHAT_PLACEMENT_UNAVAILABLE' },
          );
        }
      }
      /* The model catalog is a *Tau* concern: an external agent runs on its own
       * subscription, so there is no row to resolve and no gateway wire to
       * refuse. */
      if (agent.execution.kind === 'tau') {
        // The host config is built from the model's catalog row (provider wire,
        // context window, rates). The seeded first turn composes before
        // `GET /v1/models` answers, and reading an unresolved row threw the
        // turn away instead of waiting the moment out.
        const resolved = await awaitResolvedModel(agent.execution.model);
        // The availability above is per project; the model's wire is per
        // turn. A resolved catalog row the browser host cannot speak (the
        // `tau` replay row, for one) must refuse here, before a body is
        // composed: its admission fails the host schema, and the transport
        // must never hand a Tau turn to the API, which executes
        // external-agent turns only.
        if (resolved.isResolved && !isBrowserAgentHostProviderKind(resolved.provider.id)) {
          throw Object.assign(
            new Error(
              `Tau cannot run the ${resolved.provider.id} provider wire in your browser. Pick a different model.`,
            ),
            { code: 'CHAT_PLACEMENT_UNAVAILABLE' },
          );
        }
      }
      if (daemonHostId !== undefined) {
        /* DT1: a daemon writes to the workspace it was started on, and Tau has
         * no porcelain for branching a directory it does not own. A `branch`
         * selection is refused rather than silently downgraded to `local`. */
        if (revisionMode === 'branch') {
          throw Object.assign(
            new Error('A Tau Host turn writes directly to that computer’s workspace. Switch back to working locally.'),
            { code: 'CHAT_PLACEMENT_UNAVAILABLE' },
          );
        }
        /* No browser workspace claim: the daemon owns the files, so preparing
         * or admitting one here would fence a workspace nothing writes to. */
        return undefined;
      }
      if (!workspaceAuthority) {
        throw new Error('The durable workspace authority is unavailable for this chat.');
      }
      const current = workspaceAuthority.get(activeChatId);
      if (current?.admitted) {
        await new Promise<void>((resolve, reject) => {
          let unsubscribe = (): void => undefined;
          // A claim whose run died leaves `admitted` set forever; an
          // unbounded wait here silently swallowed the submit. Bound it and
          // let the rejection reach the chat error banner — the stale claim
          // itself is retired by `ProjectChatRpcBindings` on the next mount.
          const admissionExpiry = globalThis.setTimeout(() => {
            unsubscribe();
            reject(
              new Error('This chat is still holding a workspace from an earlier run. Reload the page to release it.'),
            );
          }, admissionWaitTimeout);
          const settle = (): void => {
            if (workspaceAuthority.get(activeChatId)?.admitted) {
              return;
            }
            globalThis.clearTimeout(admissionExpiry);
            unsubscribe();
            resolve();
          };
          unsubscribe = workspaceAuthority.subscribe(settle);
          settle();
        });
      }
      const prepared =
        workspaceAuthority.get(activeChatId) ??
        (await workspaceAuthority.prepare(activeChatId, { mode: revisionMode }));
      await workspaceAuthority.markAdmitted(activeChatId, turnId);
      return prepared.execution;
    },
    [activeChatId, agent.execution, awaitResolvedModel, projectId, revisionMode, workspaceAuthority],
  );

  /** Surface a dropped dispatch on the same banner the transport errors use. */
  const surfaceDispatchFailure = useCallback(
    (error: unknown): void => {
      console.error('[useCadChatClient] durable workspace admission failed', error);
      store.get(activeChatId)?.persistenceActorRef.send({
        type: 'setPersistedError',
        error: parseErrorForPersistence(
          error instanceof Error ? error : new Error('Durable workspace admission failed', { cause: error }),
        ),
      });
    },
    [activeChatId, store],
  );

  /**
   * A verb that cannot dispatch must say so. Returning silently made a typed
   * submit vanish with no message row, no request and no banner — the user's
   * only signal was that nothing happened.
   */
  const refuseWhileBusy = useCallback((): boolean => {
    if (!requestInFlight) {
      return false;
    }
    surfaceDispatchFailure(new Error('This chat is still running a turn. Stop it before sending another message.'));
    return true;
  }, [requestInFlight, surfaceDispatchFailure]);

  const withWorkspace = useCallback(
    (
      turnId: string | undefined,
      operation: (
        execution:
          | { readonly workspaceId: string; readonly baseRevisionId: string; readonly hostId: string }
          | undefined,
      ) => void,
    ) => {
      // A Tau Host turn needs no browser workspace authority; every other Tau
      // turn does, and dispatching without one would compose a body naming a
      // workspace no claim carries.
      if (!workspaceAuthority && agent.execution.kind === 'tau' && agent.execution.hostId === undefined) {
        return;
      }
      if (preparing.current) {
        // A submit that silently returns looks to the user like a lost message.
        surfaceDispatchFailure(new Error('This chat is still starting an earlier turn. Try again in a moment.'));
        return;
      }
      preparing.current = true;
      const runPreparedOperation = async (): Promise<void> => {
        try {
          operation(await admitWorkspace(turnId));
        } catch (error) {
          surfaceDispatchFailure(error);
        } finally {
          preparing.current = false;
        }
      };
      // async-iife: bootstrap
      void runPreparedOperation();
    },
    [admitWorkspace, agent.execution, surfaceDispatchFailure, workspaceAuthority],
  );

  // Publish how a bodyless dispatch composes its wire body, so startup
  // hydration (the one route-driven path that fires a request through the
  // persistence machine without an explicit body) admits its workspace exactly
  // like an explicit submit. Without this, the homepage-seeded first turn would
  // dispatch with `body: undefined` and the API would 400 with `agent:
  // Required` — and with a *snapshot* body it dispatched against a workspace no
  // claim carried, so the turn never settled. See
  // `ChatSessionStore.setLatestAgentBody`.
  useEffect(() => {
    const daemonPlaced = daemonPlacementOf(agent.execution) !== undefined;
    if (!workspaceAuthority && !daemonPlaced) {
      store.setLatestAgentBody(activeChatId, undefined);
      return;
    }
    store.setLatestAgentBody(activeChatId, async () => {
      const lastAssistantId = messages.findLast((message) => message.role === 'assistant')?.id;
      try {
        /* Minted before the body so the run id the capability is bound to is
         * the one the admission carries — a capability for a different run is
         * refused by the daemon's own claim fence. */
        const runId = generatePrefixedId(idPrefix.request);
        const mcpHost = agent.execution.kind === 'paseo' ? paseoMcpHostRef.current : undefined;
        const mcp = mcpHost
          ? await mintPaseoMcpCapability({ hostId: mcpHost, projectId, chatId: activeChatId, runId })
          : undefined;
        return createRunBody({
          agent,
          projectId,
          runId,
          execution: await admitWorkspace(userTurnIdAtOrBefore(messages, lastAssistantId)),
          browserHost: hostAdmission({
            agent,
            chatId: activeChatId,
            resolveModel: resolveModelRef.current,
            trigger: hydrationTrigger(messages, lastAssistantId),
            ...(mcp ? { mcp } : {}),
          }),
        });
      } catch (error) {
        surfaceDispatchFailure(error);
        throw error;
      }
    });
    // Deliberately not cleared on unmount: the store owns the published
    // factory for as long as the session lives, so a run that outlives this
    // view can still compose its body.
  }, [
    activeChatId,
    admitWorkspace,
    agent,
    messages,
    projectId,
    resolveModel,
    store,
    surfaceDispatchFailure,
    workspaceAuthority,
  ]);

  const submit = useCallback(
    (input: CadChatSubmitInput) => {
      if (refuseWhileBusy()) {
        return;
      }

      const userMessage = buildUserMessage(input);
      withWorkspace(userMessage.id, (execution) => {
        actions.sendMessage(userMessage, {
          body: createRunBody({
            agent,
            projectId,
            execution,
            browserHost: hostAdmission({
              agent,
              chatId: activeChatId,
              resolveModel: resolveModelRef.current,
              trigger: { trigger: 'submit' },
            }),
          }),
        });
      });
    },
    [actions, activeChatId, agent, projectId, refuseWhileBusy, resolveModel, withWorkspace],
  );

  const edit = useCallback(
    (messageId: string, input: CadChatSubmitInput) => {
      if (refuseWhileBusy()) {
        return;
      }

      withWorkspace(messageId, (execution) => {
        actions.editMessage(messageId, input.text, {
          imageUrls: input.imageUrls ? [...input.imageUrls] : undefined,
          body: createRunBody({
            agent,
            projectId,
            execution,
            browserHost: hostAdmission({
              agent,
              chatId: activeChatId,
              resolveModel: resolveModelRef.current,
              trigger: {
                trigger: 'edit',
                retainedMessageIds: retainedMessageIdsBeforeTurn(messages, messageId),
              },
            }),
          }),
        });
      });
    },
    [actions, activeChatId, agent, messages, projectId, refuseWhileBusy, resolveModel, withWorkspace],
  );

  const retry = useCallback(
    (messageId: string, modelId?: string) => {
      if (refuseWhileBusy()) {
        return;
      }

      // "Retry with a different model" overrides `agent.execution` for this
      // single dispatch; the active model is **not** mutated. The override
      // is composed inline so the wire body still carries the rest of the
      // current `agent` config (kernel, mode, toolChoice, testingEnabled,
      // snapshot, contextPayload) verbatim. Without this branch, retries
      // would silently fall through to the active model and the
      // model-selector dropdown would be a no-op (R10/t17).
      withWorkspace(userTurnIdAtOrBefore(messages, messageId), (execution) => {
        const requestAgent = modelId ? { ...agent, execution: withTauExecutionModel(agent.execution, modelId) } : agent;
        const overrideBody = createRunBody({
          agent: requestAgent,
          projectId,
          execution,
          browserHost: hostAdmission({
            agent: requestAgent,
            chatId: activeChatId,
            resolveModel: resolveModelRef.current,
            trigger: {
              trigger: 'retry',
              retainedMessageIds: retainedMessageIdsBeforeTurn(messages, messageId),
            },
          }),
        });
        actions.retryMessage(messageId, { body: overrideBody });
      });
    },
    [actions, activeChatId, agent, messages, projectId, refuseWhileBusy, resolveModel, withWorkspace],
  );

  const regenerateTail = useCallback(() => {
    if (refuseWhileBusy()) {
      return;
    }

    const lastAssistantId = messages.findLast((message) => message.role === 'assistant')?.id;
    withWorkspace(userTurnIdAtOrBefore(messages, lastAssistantId), (execution) => {
      actions.regenerate({
        body: createRunBody({
          agent,
          projectId,
          execution,
          browserHost: hostAdmission({
            agent,
            chatId: activeChatId,
            resolveModel: resolveModelRef.current,
            trigger: {
              trigger: 'regenerate',
              retainedMessageIds: retainedMessageIdsBeforeTurn(messages, lastAssistantId),
            },
          }),
        }),
      });
    });
  }, [actions, activeChatId, agent, messages, projectId, refuseWhileBusy, resolveModel, withWorkspace]);

  const stop = useCallback(() => {
    if (workspaceAuthority) {
      const markCancelled = async (): Promise<void> => {
        try {
          await workspaceAuthority.markCancelled(activeChatId);
        } catch (error) {
          console.error('[useCadChatClient] durable workspace cancellation mark failed', error);
        }
      };
      // async-iife: bootstrap
      void markCancelled();
    }
    actions.stop();
  }, [actions, activeChatId, workspaceAuthority]);

  const respondToToolApproval = useCallback(
    async (approvalId: string, approved: boolean, reason?: string): Promise<void> => {
      const browserRun = getBrowserAgentHostRun(activeChatId);
      if (browserRun) {
        await resolveBrowserAgentHostInterrupt({
          chatId: activeChatId,
          runId: browserRun.runId,
          interruptId: approvalId,
          approved,
          reason,
        });
        actions.setMessages(
          messages.map((message) => ({
            ...message,
            parts: message.parts.map((part) =>
              isAnyToolPart(part) && part.state === 'approval-requested' && part.approval.id === approvalId
                ? {
                    ...part,
                    state: 'approval-responded',
                    approval: { ...part.approval, approved, ...(reason ? { reason } : {}) },
                  }
                : part,
            ),
          })),
        );
        return;
      }
      if (requestInFlight || !workspaceAuthority) {
        return;
      }
      // Re-admits this chat's own in-flight run rather than starting a new
      // turn, so it never waits on the admission its own claim already holds.
      const prepared = await workspaceAuthority.prepare(activeChatId, { mode: revisionMode });
      await workspaceAuthority.markAdmitted(activeChatId, userTurnIdAtOrBefore(messages));
      const runBody = store.startRun(activeChatId, createRunBody({ agent, projectId, execution: prepared.execution }));
      try {
        await chat.addToolApprovalResponse({
          id: approvalId,
          approved,
          ...(reason ? { reason } : {}),
          options: { body: runBody },
        });
      } catch {
        store.endRun(activeChatId);
      }
    },
    [actions, activeChatId, agent, chat, messages, projectId, requestInFlight, revisionMode, store, workspaceAuthority],
  );

  return {
    submit,
    edit,
    retry,
    regenerateTail,
    stop,
    respondToToolApproval,
    messages,
    status,
    error: chat.error,
    agent,
  };
};
