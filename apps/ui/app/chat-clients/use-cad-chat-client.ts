import { useCallback, useEffect, useRef } from 'react';
import type { ChatStatus } from 'ai';
import { isAnyToolPart, modelSupportsInput } from '@taucad/chat';
import type { CadAgentConfigInput, CadAgentExecution, ModelProvider, MyUIMessage, TauAgentHostId } from '@taucad/chat';
import { getCadSystemPrompt } from '@taucad/chat/prompts';
import { getProviderFacingToolInputSchemas } from '@taucad/chat/schemas';
import type { ChatExecutionTarget } from '@taucad/chat/schemas';
import { toast } from 'sonner';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import { awaitAgentHostAvailability, useCadAgentConfig } from '#hooks/use-cad-agent-config.js';
import { useActiveChatInstance } from '#chat-clients/_internal/use-active-chat-instance.js';
import { useChatActions, useChatSelector } from '#hooks/use-chat.js';
import { useCreditPreflight } from '#hooks/use-credit-preflight.js';
import { useActiveChatSession } from '#hooks/active-chat-provider.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { attachmentSendBlockReason, buildUserMessage } from '#utils/chat.utils.js';
import type { AttachmentReference } from '#utils/attachment.utils.js';
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
import { daemonPlacementOf, desktopWorkspaceRoot, openAgentHostChannel } from '#lib/agent-host-placement.js';
import { getProjectFileSystemConfig } from '#filesystem/handle-store.js';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';
import { useOptionalFileManager } from '#hooks/use-file-manager.js';
import { ENV } from '#environment.config.js';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';
import { useComputeReuseMode } from '#lib/compute-reuse-preference.js';
import { withExecutionModel } from '#utils/chat-execution.js';
import { useModels } from '#hooks/use-models.js';
import type { ResolvedModel } from '#hooks/use-models.js';
import { createCachedSystemPromptBlocks } from '@taucad/agent-host';
import type {
  AgentHostAdmissionConfig,
  AgentHostExternalAgent,
  AgentHostExternalContext,
} from '#workers/agent-host.contract.js';
import { buildBrowserAgentHostSnapshotContext } from '#chat-clients/_internal/browser-agent-host-snapshot-context.js';

/**
 * Input payload for {@link CadChatClient.submit}. Mirrors the surface the
 * `ChatTextarea`'s `onSubmit` hands the client — a string `text` plus the
 * draft's stored attachments. All other request configuration
 * (model, kernel, mode, toolChoice, testingEnabled, snapshot, contextPayload)
 * is composed *inside* the client from `useCadAgentConfig`.
 *
 * @public
 */
export type CadChatSubmitInput = {
  readonly text: string;
  /** The draft's attachments, stored beside its record; the client promotes them before sending (D18). */
  readonly attachments?: readonly AttachmentReference[];
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
  /**
   * Approve or deny a durable external-tool interrupt and resume it with the current agent config.
   *
   * `optionId` is the exact choice a request that offered a list was answered
   * with; without it the host re-derives one from `approved`, which substitutes
   * its guess for the human's decision (V6).
   */
  respondToToolApproval: (
    approvalId: string,
    approved: boolean,
    decision?: { readonly reason?: string | undefined; readonly optionId?: string | undefined },
  ) => Promise<void>;
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

/** Stable, so a retried send replaces its toast instead of stacking another. */
const promotionToastId = 'chat-attachment-promotion';

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
  (
    | { readonly config: BrowserHostAdmissionConfig }
    | { readonly agent: AgentHostExternalAgent; readonly context: AgentHostExternalContext }
  );

const createRunBody = (input: {
  readonly agent: CadAgentConfigInput;
  readonly projectId: string;
  /** Which host writes this turn, and how it records what it wrote. */
  readonly execution?: ChatExecutionTarget | undefined;
  readonly browserHost?: ((runId: string) => BrowserHostAdmission) | undefined;
  /** Minted by the caller when it had to do async work for this same run. */
  readonly runId?: string | undefined;
}): Readonly<Record<string, unknown>> => {
  const runId = input.runId ?? generatePrefixedId(idPrefix.request);
  return Object.freeze({
    agent: input.agent,
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
  const providerKind = requireProviderKind(model?.provider.id);
  const reasoning: AgentHostAdmissionConfig['model']['reasoning'] = (() => {
    const configuration = model?.configuration;
    if (providerKind === 'anthropic') {
      if (configuration?.thinking?.type === 'enabled') {
        return { budgetTokens: configuration.thinking.budget_tokens };
      }
      if (configuration?.thinking?.type === 'adaptive') {
        return {
          ...(configuration.outputConfig?.effort === undefined ? {} : { effort: configuration.outputConfig.effort }),
          ...(configuration.thinking.display === undefined ? {} : { display: configuration.thinking.display }),
        };
      }
      return undefined;
    }
    if (providerKind === 'vertexai') {
      const effort = configuration?.thinkingLevel?.toLowerCase();
      return effort === 'low' || effort === 'medium' || effort === 'high' ? { effort } : undefined;
    }
    return configuration?.reasoning;
  })();
  return {
    systemPrompt: [prompt.static, prompt.dynamic].join('\n\n'),
    systemPromptBlocks,
    model: {
      id: agent.execution.model,
      providerKind,
      contextWindow: model?.details.contextWindow ?? 128_000,
      ...(model?.details.maxTokens === undefined ? {} : { maxTokens: model.details.maxTokens }),
      ...(reasoning === undefined ? {} : { reasoning }),
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
 * The CAD context one external-agent turn carries (V12).
 *
 * @param input - The composer's agent configuration and the chat it runs in.
 * @returns The system prompt, skills and snapshot the daemon embeds.
 */
const externalAgentContext = (input: {
  readonly agent: CadAgentConfigInput;
  readonly chatId: string;
}): AgentHostExternalContext => {
  const { agent } = input;
  const prompt = getCadSystemPrompt(agent.kernel, agent.mode, agent.testingEnabled, { chatId: input.chatId });
  return {
    systemPrompt: [prompt.static, prompt.dynamic].join('\n\n'),
    ...(agent.snapshot === undefined ? {} : { snapshot: toStrictJson(agent.snapshot) }),
    ...(agent.contextPayload === undefined ? {} : { contextPayload: toStrictJson(agent.contextPayload) }),
  };
};

/**
 * Every Tau turn is a browser-host turn: the API-coordinated placement was
 * removed, not demoted.
 */
const hostAdmission = (input: {
  readonly agent: CadAgentConfigInput;
  readonly chatId: string;
  readonly resolveModel: (modelId: string) => ResolvedModel;
  readonly trigger: BrowserHostTrigger;
}): ((runId: string) => BrowserHostAdmission) | undefined => {
  if (input.agent.execution.kind === 'acp') {
    const { agentId, model, config } = input.agent.execution;
    return () => ({
      ...input.trigger,
      agent: {
        kind: 'acp',
        id: agentId,
        ...(model === undefined ? {} : { model }),
        ...(config === undefined ? {} : { config }),
      },
      /* The agent brings its own model, tools and login (X6), so none of the
       * Tau admission travels — but the CAD knowledge does. Composed by the
       * same helper a Tau turn uses, minus the model facts an external run has
       * no row for; the daemon sends it as embedded resources on the session's
       * first prompt (V12). */
      context: externalAgentContext({ agent: input.agent, chatId: input.chatId }),
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
const dialAgentHost = async (hostId: TauAgentHostId, projectId: string): Promise<AgentChannelClient> =>
  hostId === 'desktop'
    ? openAgentHostChannel(hostId, { projectId, workspaceRoot: await desktopWorkspaceRoot(projectId) })
    : openAgentHostChannel(hostId);

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
  const { projectId } = useProject();
  // Optional: the API path renders without a FileManagerProvider; the
  // browser-host registration effect below guards on its presence.
  const fileManager = useOptionalFileManager();
  const fileManagerRef = fileManager?.fileManagerRef;
  const syncProjectRoots = fileManager?.workspace.syncProjectRoots;
  const { resolveModel } = useModels();
  const creditPreflight = useCreditPreflight();
  const workspaceAuthority = useOptionalChatWorkspaceAuthority();
  const computeMode = useComputeReuseMode();
  // Always the current resolver: a dispatch composed before `GET /v1/models`
  // answers must read the catalog row that arrives *while* it waits, not the
  // unresolved one its render closed over.
  const resolveModelRef = useRef(resolveModel);
  useEffect(() => {
    resolveModelRef.current = resolveModel;
  }, [resolveModel]);
  const preparing = useRef(false);
  const messages = Array.isArray(chat.messages) ? chat.messages : [];

  /**
   * Register the transport one execution's turn runs over.
   *
   * Taken as an argument rather than read from `agent`, because the seeded
   * first turn composes from the row the store just consumed — one render
   * ahead of anything a React effect can see (V-W1 §5). The body, the host
   * admission and this registration must all key on that same execution, or a
   * seeded `acp` row lands on the browser worker while its admission names an
   * agent only a daemon can start.
   */
  const registerTurnHost = useCallback(
    (execution: CadAgentExecution): (() => void) | undefined => {
      const daemonHostId = daemonPlacementOf(execution);
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
        return undefined;
      }
      if (!workspaceAuthority || fileManagerRef === undefined || syncProjectRoots === undefined) {
        return undefined;
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
            // `admitWorkspace` already prepared this chat's claim in the picked
            // mode; this reuses it rather than choosing again.
            workspaceAuthority.prepare(activeChatId),
            resolveProjectStorage(),
            readRootedBridgeCapabilities(openProjectRootBridge),
          ]);
          if (!capabilities.writable || !capabilities.durability) {
            throw new Error('The active project filesystem is not writable or did not declare durability.');
          }
          const config = agentHostConfig({
            agent: { ...agent, execution },
            chatId: activeChatId,
            runId: activeChatId,
            resolvedModel: resolveModel(execution.model),
          });
          return createBrowserAgentHostClient({
            openFileSystemBridge: prepared.openFileSystemBridge,
            openProjectRootBridge,
            computeMode,
            openComputeStorePort: () => {
              const opener = fileManagerRef.getSnapshot().context.openComputeStorePort;
              if (!opener) {
                throw new Error('The active project compute authority is unavailable.');
              }
              return opener(projectId);
            },
            projectStorage: storage,
            durability: capabilities.durability,
            authority: { projectId, workspaceId: prepared.execution.workspaceId },
            gatewayBaseUrl: ENV.TAU_API_URL,
            systemPrompt: config.systemPrompt,
            systemPromptBlocks: config.systemPromptBlocks,
            model: config.model,
            runtimeConfig: createUiRuntimeConfig(ENV),
            testingEnabled: config.testingEnabled,
          });
        },
      });
    },
    [
      activeChatId,
      agent,
      computeMode,
      fileManagerRef,
      projectId,
      resolveModel,
      store,
      syncProjectRoots,
      workspaceAuthority,
    ],
  );

  useEffect(() => registerTurnHost(agent.execution), [agent.execution, registerTurnHost]);

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
   *
   * `turnExecution` defaults to the live selection; the seeded first turn hands
   * in the execution of the row it consumed, so its placement, its host probe
   * and its (absent) browser claim are resolved from the same object the body
   * and the admission are composed from.
   */
  const admitWorkspace = useCallback(
    async (
      turnId: string | undefined,
      turnExecution: CadAgentExecution = agent.execution,
    ): Promise<readonly [ChatExecutionTarget, string | undefined]> => {
      const daemonHostId = daemonPlacementOf(turnExecution);
      // Every host placement waits out its own probe: a turn dispatched before
      // one answers must WAIT for it (the seeded first turn fires at chat load,
      // ahead of the probe), and an answered "unavailable" must refuse with its
      // reason — never a silent downgrade, in either direction.
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
      /* The model catalog is a *Tau* concern: an external agent runs on its own
       * subscription, so there is no row to resolve and no gateway wire to
       * refuse. */
      if (turnExecution.kind === 'tau') {
        // The host config is built from the model's catalog row (provider wire,
        // context window, rates). The seeded first turn composes before
        // `GET /v1/models` answers, and reading an unresolved row threw the
        // turn away instead of waiting the moment out.
        const resolved = await awaitResolvedModel(turnExecution.model);
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
        /* R9: a turn the account cannot fund is refused here, before any
         * workspace is prepared or admitted, with the same credits payload the
         * gateway's own 402 would have carried. An unavailable balance or a
         * route with no published estimate returns silently — the server's
         * admission stays the authority, and a failed read never blocks a turn. */
        creditPreflight(turnExecution.model, resolved.name);
      }
      if (daemonHostId !== undefined) {
        /* No browser turn: the daemon owns the files, mints its own base and
         * records its own revision, so placing one here would lease a checkout
         * nothing writes to. */
        return [{ hostId: daemonHostId }, undefined];
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
        (await workspaceAuthority.prepare(activeChatId, turnId === undefined ? undefined : { turnId }));
      await workspaceAuthority.markAdmitted(activeChatId, turnId);
      return [prepared.execution, prepared.runId];
    },
    [activeChatId, agent.execution, awaitResolvedModel, creditPreflight, projectId, workspaceAuthority],
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
      operation: (execution: ChatExecutionTarget, runId: string | undefined) => void,
      /* The execution this dispatch will actually run, when it is not the live
       * selection — "retry with a different model" is the one verb that
       * overrides it. Admission has to see the same row the body names, or the
       * turn is pre-flighted and wire-checked against a model it never runs. */
      turnExecution?: CadAgentExecution,
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
          operation(...(await admitWorkspace(turnId, turnExecution ?? agent.execution)));
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
    store.setLatestAgentBody(activeChatId, async (executionOverride) => {
      const lastAssistantId = messages.findLast((message) => message.role === 'assistant')?.id;
      // One agent object for the admission, the placement and the body. The
      // seeded first turn dispatches before this effect's `agent` has hydrated
      // from the chat row, so the dispatcher hands in the execution it read
      // from that row; composing the three from separate sources is how the
      // body and the host admission came to disagree.
      const turnAgent = executionOverride ? { ...agent, execution: executionOverride } : agent;
      if (executionOverride && daemonPlacementOf(executionOverride) !== daemonPlacementOf(agent.execution)) {
        // V-W1 §5: the effect above keys on the render's execution, which for a
        // seeded turn is still the pre-hydration fallback. Re-register on the
        // row's own execution so the transport, the body and the admission are
        // one placement. `registerAgentHost`'s unregister is identity-guarded,
        // so the effect's stale cleanup cannot drop this one.
        registerTurnHost(executionOverride);
      }
      try {
        const [execution, runId] = await admitWorkspace(
          userTurnIdAtOrBefore(messages, lastAssistantId),
          turnAgent.execution,
        );
        return createRunBody({
          agent: turnAgent,
          projectId,
          runId,
          execution,
          browserHost: hostAdmission({
            agent: turnAgent,
            chatId: activeChatId,
            resolveModel: resolveModelRef.current,
            trigger: hydrationTrigger(messages, lastAssistantId),
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
    registerTurnHost,
    store,
    surfaceDispatchFailure,
    workspaceAuthority,
  ]);

  /**
   * Refuse a draft the turn's model cannot read (D20), and copy the rest into
   * the chat's directory before anything is admitted (D18). Admission first
   * would leave a claim admitted for a turn that never sends. A failed copy
   * leaves the draft as it is and sends nothing.
   */
  const withAttachments = useCallback(
    (attachments: readonly AttachmentReference[], send: () => void): void => {
      if (agent.execution.kind === 'tau' && attachments.length > 0) {
        const resolved = resolveModelRef.current(agent.execution.model);
        const blocked = attachmentSendBlockReason(attachments, {
          name: resolved.name,
          support: resolved.model?.support,
        });
        if (blocked !== undefined) {
          surfaceDispatchFailure(new Error(blocked));
          return;
        }
      }
      if (attachments.length === 0) {
        send();
        return;
      }
      const promoteThenSend = async (): Promise<void> => {
        try {
          await store.promoteDraftAttachments(activeChatId, attachments);
        } catch (error) {
          console.error('[useCadChatClient] attachment promotion failed', error);
          toast.error("Your attachments couldn't be saved to this chat, so the message wasn't sent.", {
            id: promotionToastId,
          });
          return;
        }
        send();
      };
      // async-iife: bootstrap — a submit verb is synchronous; the failure is reported by the toast above
      void promoteThenSend();
    },
    [activeChatId, agent.execution, store, surfaceDispatchFailure],
  );

  const submit = useCallback(
    (input: CadChatSubmitInput) => {
      if (refuseWhileBusy()) {
        return;
      }

      const userMessage = buildUserMessage(input);
      withAttachments(input.attachments ?? [], () => {
        withWorkspace(userMessage.id, (execution, runId) => {
          actions.sendMessage(userMessage, {
            body: createRunBody({
              agent,
              projectId,
              execution,
              runId,
              browserHost: hostAdmission({
                agent,
                chatId: activeChatId,
                resolveModel: resolveModelRef.current,
                trigger: { trigger: 'submit' },
              }),
            }),
          });
        });
      });
    },
    [actions, activeChatId, agent, projectId, refuseWhileBusy, withAttachments, withWorkspace],
  );

  const edit = useCallback(
    (messageId: string, input: CadChatSubmitInput) => {
      if (refuseWhileBusy()) {
        return;
      }

      withAttachments(input.attachments ?? [], () => {
        withWorkspace(messageId, (execution, runId) => {
          actions.editMessage(messageId, input.text, {
            ...(input.attachments === undefined ? {} : { attachments: input.attachments }),
            body: createRunBody({
              agent,
              projectId,
              execution,
              runId,
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
      });
    },
    [actions, activeChatId, agent, messages, projectId, refuseWhileBusy, withAttachments, withWorkspace],
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
      const requestAgent = modelId ? { ...agent, execution: withExecutionModel(agent.execution, modelId) } : agent;
      withWorkspace(
        userTurnIdAtOrBefore(messages, messageId),
        (execution, runId) => {
          const overrideBody = createRunBody({
            agent: requestAgent,
            projectId,
            execution,
            runId,
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
        },
        requestAgent.execution,
      );
    },
    [actions, activeChatId, agent, messages, projectId, refuseWhileBusy, withWorkspace],
  );

  const regenerateTail = useCallback(() => {
    if (refuseWhileBusy()) {
      return;
    }

    const lastAssistantId = messages.findLast((message) => message.role === 'assistant')?.id;
    withWorkspace(userTurnIdAtOrBefore(messages, lastAssistantId), (execution, runId) => {
      actions.regenerate({
        body: createRunBody({
          agent,
          projectId,
          execution,
          runId,
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
  }, [actions, activeChatId, agent, messages, projectId, refuseWhileBusy, withWorkspace]);

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
    async (
      approvalId: string,
      approved: boolean,
      decision?: { readonly reason?: string | undefined; readonly optionId?: string | undefined },
    ): Promise<void> => {
      const { reason, optionId } = decision ?? {};
      const browserRun = getBrowserAgentHostRun(activeChatId);
      if (browserRun) {
        await resolveBrowserAgentHostInterrupt({
          chatId: activeChatId,
          runId: browserRun.runId,
          interruptId: approvalId,
          approved,
          reason,
          optionId,
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
      /* The branch below is the browser placement's: it claims this chat's
         workspace and re-admits the run over the API transport. A daemon-placed
         chat has neither — the daemon owns the files and records the turn — so
         reaching it for one would admit a claim nothing writes to, and a claim
         admitted here is exactly what lets this tab finalize a revision for a
         turn the host already finalized (5-review N5). With no live host run to
         answer, the stale affordance is dropped instead. */
      if (requestInFlight || !workspaceAuthority || daemonPlacementOf(agent.execution) !== undefined) {
        return;
      }
      // Re-admits this chat's own in-flight run rather than starting a new
      // turn, so it never waits on the admission its own claim already holds.
      const approvalTurnId = userTurnIdAtOrBefore(messages);
      const prepared = await workspaceAuthority.prepare(
        activeChatId,
        approvalTurnId === undefined ? undefined : { turnId: approvalTurnId },
      );
      await workspaceAuthority.markAdmitted(activeChatId, approvalTurnId);
      const runBody = store.startRun(
        activeChatId,
        createRunBody({ agent, projectId, execution: prepared.execution, runId: prepared.runId }),
      );
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
    [actions, activeChatId, agent, chat, messages, projectId, requestInFlight, store, workspaceAuthority],
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
