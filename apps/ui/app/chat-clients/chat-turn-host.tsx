/**
 * The focused chat's turn host.
 *
 * One mount per chat, inside `<ActiveChatProvider>`, and the only producer of
 * two facts that used to have N producers each:
 *
 * - **the chat's agent-host binding.** `useCadChatClient` registered it from an
 *   effect, and that hook is mounted by five components — once *per transcript
 *   message*. Every instance wrote the same module-level registry, so the last
 *   one to unmount deleted the entry: a rewinding dispatch truncates the
 *   transcript, the newest message components unmount, and the registry stayed
 *   empty until a dispatch gave up after ten seconds with "Browser agent host
 *   is not configured". The binding is now owned by the chat's own session
 *   actor (`chat-session.machine`'s `host` region, policy §16); this component
 *   only publishes what the registration is composed from.
 * - **the chat's admission.** Each instance composed its own turn from its own
 *   closure over its own `messages`, and whichever rendered last won. The
 *   chat's session actor now invokes one published admission (C3), so an edit,
 *   a *Try again* and the seeded first turn all derive their rewind point from
 *   the live transcript through `turnIntentOf`.
 *
 * Renders nothing.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { CadAgentExecution } from '@taucad/chat';
import { useCadAgentConfig } from '#hooks/use-cad-agent-config.js';
import { useActiveChatInstance } from '#chat-clients/_internal/use-active-chat-instance.js';
import { useActiveChatSession } from '#hooks/active-chat-provider.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useProject } from '#hooks/use-project.js';
import { useOptionalFileManager } from '#hooks/use-file-manager.js';
import { useModels } from '#hooks/use-models.js';
import { useComputeReuseMode } from '#lib/compute-reuse-preference.js';
import {
  readRootedBridgeCapabilities,
  useOptionalChatWorkspaceAuthority,
} from '#providers/chat-workspace-authority-provider.js';
import type { BrowserAgentHostRegistration } from '#chat-clients/_internal/browser-agent-host-transport.js';
import { publishChatHostServices, publishChatTurnAdmission } from '#chat-clients/_internal/chat-host-binding.js';
import {
  getBrowserAgentHostRun,
  isBrowserAgentHostPlaced,
  isBrowserAgentHostRunResumable,
} from '#chat-clients/_internal/browser-agent-host-transport.js';
import type { ChatRequest, ChatTurn, ChatTurnGesture } from '#machines/chat-session.machine.js';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import { agentHostConfig, createRunBody, dialAgentHost, hostAdmission } from '#chat-clients/_internal/turn-body.js';
import { useTurnAdmission } from '#chat-clients/_internal/use-turn-admission.js';
import { turnIntentOf, turnTriggerOf } from '#chat-clients/turn-intent.js';
import { createAgentHostClient, createBrowserAgentHostClient } from '#services/agent-host-client.js';
import { createDaemonAgentHostTransport } from '#services/daemon-agent-host-client.js';
import { daemonPlacementOf } from '#lib/agent-host-placement.js';
import { getProjectFileSystemConfig } from '#filesystem/handle-store.js';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';
import { ENV } from '#environment.config.js';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';

/**
 * Where a turn with this execution runs.
 *
 * The chat's binding re-registers on this and on nothing else: a model change
 * is read at `createClient` time, so it must not churn the registration.
 */
const placementOf = (execution: CadAgentExecution): string => daemonPlacementOf(execution) ?? execution.kind;

/** Publishes this chat's host binding ingredients and its bodyless body factory. */
export function ChatTurnHost(): ReactNode {
  const agent = useCadAgentConfig();
  const { activeChatId } = useActiveChatSession();
  const chat = useActiveChatInstance();
  const store = useChatSessionStore();
  const { projectId } = useProject();
  // Optional: the API path renders without a FileManagerProvider; the
  // registration composer below guards on its presence.
  const fileManager = useOptionalFileManager();
  const fileManagerRef = fileManager?.fileManagerRef;
  const syncProjectRoots = fileManager?.workspace.syncProjectRoots;
  const workspaceAuthority = useOptionalChatWorkspaceAuthority();
  const computeMode = useComputeReuseMode();
  const { resolveModel } = useModels();
  const { admitWorkspace, surfaceDispatchFailure } = useTurnAdmission(agent.execution);
  const resolveModelRef = useRef(resolveModel);
  useEffect(() => {
    resolveModelRef.current = resolveModel;
  }, [resolveModel]);
  /* The binding actor calls `compose` when it registers, which can be long
   * after this render: it must read the live agent config and the live
   * composer, never the render that happened to publish. */
  const agentRef = useRef(agent);
  const boundExecutionRef = useRef(agent.execution);
  useEffect(() => {
    agentRef.current = agent;
    boundExecutionRef.current = agent.execution;
  }, [agent]);

  /**
   * Compose the transport one execution's turn runs over.
   *
   * Taken as an argument rather than read from `agent`, because the seeded
   * first turn composes from the row the store just consumed — one render
   * ahead of anything a React effect can see (V-W1 §5). The body, the host
   * admission and this registration must all key on that same execution, or a
   * seeded `acp` row lands on the browser worker while its admission names an
   * agent only a daemon can start.
   */
  const composeRegistration = useCallback(
    (execution: CadAgentExecution): BrowserAgentHostRegistration | undefined => {
      const daemonHostId = daemonPlacementOf(execution);
      if (daemonHostId !== undefined) {
        /* A daemon owns its own workspace, its own filesystem and its own tools:
         * nothing here claims workspace authority, opens a bridge, or resolves
         * project storage — the whole point of placing the turn there.
         *
         * And because it claims nothing, reload discovery — which substantiates
         * a run from this browser's claims — never retains it: the reattach
         * rides the registration instead, which is also the first moment the
         * transport can answer a reconnect for this chat with the daemon rather
         * than the API. Ordering matters; the store defers the resume by a
         * microtask. */
        store.reattachHostChat({ chatId: activeChatId, hostId: daemonHostId });
        return {
          projectStorage: async () => {
            throw new Error('A Tau Host turn reads its workspace from the daemon, not from this browser.');
          },
          markRunId: async () => undefined,
          createClient: async () =>
            /* A dial *function*, not an already-open channel: a relayed channel
             * dies for reasons that have nothing to do with the run, and the
             * transport can only heal itself if it can dial again. */
            createAgentHostClient(createDaemonAgentHostTransport(async () => dialAgentHost(daemonHostId, projectId))),
        };
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
        /* Trusted composition: the turn's capture and apply planes read the
         * checkout, not the overlays above it (G6, architecture V6). */
        return openFileSystemBridge(rootDirectory, 'working-copy');
      };
      return {
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
            agent: { ...agentRef.current, execution },
            chatId: activeChatId,
            runId: activeChatId,
            resolvedModel: resolveModelRef.current(execution.model),
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
      };
    },
    [activeChatId, computeMode, fileManagerRef, projectId, store, syncProjectRoots, workspaceAuthority],
  );

  const composeRef = useRef(composeRegistration);
  useEffect(() => {
    composeRef.current = composeRegistration;
  }, [composeRegistration]);

  const placement = placementOf(agent.execution);
  useEffect(
    () =>
      publishChatHostServices(activeChatId, {
        placement,
        compose: () => composeRef.current(boundExecutionRef.current),
      }),
    [activeChatId, placement],
  );
  /* The chat session actor holds the binding; it re-invokes it when — and only
   * when — the placement it was given moves. */
  useEffect(() => {
    store.setTurnPlacement(activeChatId, placement);
  }, [activeChatId, placement, store]);

  /**
   * Take this chat's next turn (C3).
   *
   * The chat's session actor invokes this from `run.queued`; it is the only
   * place a lease is taken and the only place a turn's request is composed.
   * Every route — an explicit send, an edit, *Try again*, the auto-retry and
   * the homepage-seeded first turn — arrives here as one gesture, and
   * `turnIntentOf` is the one derivation of the rewind point (V7).
   */
  const admit = useCallback(
    async (gesture: ChatTurnGesture): Promise<ChatTurn> => {
      const liveAgent = agentRef.current;
      const execution = gesture.kind === 'regenerate' && gesture.execution ? gesture.execution : liveAgent.execution;
      const turnAgent = execution === liveAgent.execution ? liveAgent : { ...liveAgent, execution };
      if (placementOf(execution) !== placementOf(liveAgent.execution)) {
        /* V-W1 §5: a seeded turn runs the execution the store read from the
         * chat row, one render ahead of anything this component has seen. The
         * services first, so the binding actor's re-invocation finds them, then
         * the event that re-invokes it. */
        boundExecutionRef.current = execution;
        publishChatHostServices(activeChatId, {
          placement: placementOf(execution),
          compose: () => composeRef.current(boundExecutionRef.current),
        });
        store.setTurnPlacement(activeChatId, placementOf(execution));
      }
      /* A stream the host can still continue is the *same* turn: resuming it
       * takes no lease and mints no run id, and rewinding it instead would
       * charge a second time for tool work the customer already paid for. A
       * turn the gateway refused at admission leaves a terminal run and no
       * live stream, so *Try again* on one is a new turn, not a resume. */
      if (
        gesture.kind === 'continue' &&
        (!isBrowserAgentHostPlaced(activeChatId) || isBrowserAgentHostRunResumable(activeChatId))
      ) {
        return {
          runId: getBrowserAgentHostRun(activeChatId)?.runId,
          leaseTurnId: undefined,
          request: { kind: 'continue' },
        };
      }
      const messages = Array.isArray(chat.messages) ? chat.messages : [];
      const intent = turnIntentOf(
        messages,
        gesture.kind === 'send'
          ? { kind: 'send', messageId: gesture.message.id }
          : gesture.kind === 'edit'
            ? { kind: 'edit', messageId: gesture.messageId }
            : { kind: 'regenerate' },
      );
      try {
        const [target, preparedRunId] = await admitWorkspace(intent.leaseTurnId, execution);
        /* One id for the lease, the host request and the settlement. A daemon
         * placement leases nothing here, so the key is minted for it. */
        const runId = preparedRunId ?? generatePrefixedId(idPrefix.request);
        const body = createRunBody({
          agent: turnAgent,
          projectId,
          execution: target,
          runId,
          browserHost: hostAdmission({
            agent: turnAgent,
            chatId: activeChatId,
            resolveModel: resolveModelRef.current,
            trigger: turnTriggerOf(intent),
          }),
        });
        const request: ChatRequest =
          gesture.kind === 'send'
            ? { kind: 'send', message: gesture.message, body }
            : gesture.kind === 'edit'
              ? {
                  kind: 'edit',
                  messageId: gesture.messageId,
                  content: gesture.text,
                  ...(gesture.attachments === undefined ? {} : { attachments: gesture.attachments }),
                  body,
                }
              : { kind: 'regenerate', body };
        return { runId, leaseTurnId: intent.leaseTurnId, request };
      } catch (error) {
        /* The machine records the reason on the chat's row; the banner is how
         * the person sees it, and it is the same one a transport error uses. */
        surfaceDispatchFailure(error);
        throw error;
      }
    },
    [activeChatId, admitWorkspace, chat, projectId, store, surfaceDispatchFailure],
  );

  /* Deliberately not unpublished on unmount: the turn is the chat session's,
   * and a run can outlive the view that started it. The store forgets it when
   * the chat's session is disposed. */
  useEffect(() => {
    publishChatTurnAdmission(activeChatId, admit);
  }, [activeChatId, admit]);

  return null;
}
