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
 * - **the bodyless dispatch's body factory.** Each instance published its own
 *   closure over its own `messages`, and whichever rendered last won.
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
import { publishChatHostServices } from '#chat-clients/_internal/chat-host-binding.js';
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
  const messages = Array.isArray(chat.messages) ? chat.messages : [];
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
        return openFileSystemBridge(rootDirectory);
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

  // Publish how a bodyless dispatch composes its wire body, so startup
  // hydration and *Try again* admit their workspace exactly like an explicit
  // submit. Without this, the homepage-seeded first turn would dispatch with
  // `body: undefined` and the API would 400 with `agent: Required` — and with a
  // *snapshot* body it dispatched against a workspace no claim carried, so the
  // turn never settled. See `ChatSessionStore.setLatestAgentBody`.
  useEffect(() => {
    const daemonPlaced = daemonPlacementOf(agent.execution) !== undefined;
    if (!workspaceAuthority && !daemonPlaced) {
      store.setLatestAgentBody(activeChatId, undefined);
      return;
    }
    store.setLatestAgentBody(activeChatId, async (executionOverride) => {
      // One agent object for the admission, the placement and the body. The
      // seeded first turn dispatches before this effect's `agent` has hydrated
      // from the chat row, so the dispatcher hands in the execution it read
      // from that row; composing the three from separate sources is how the
      // body and the host admission came to disagree.
      const turnAgent = executionOverride ? { ...agent, execution: executionOverride } : agent;
      if (executionOverride && placementOf(executionOverride) !== placementOf(agent.execution)) {
        /* V-W1 §5: the effect above keys on the render's execution, which for a
         * seeded turn is still the pre-hydration fallback. Re-bind on the row's
         * own execution so the transport, the body and the admission are one
         * placement — the services first, so the actor's re-invocation finds
         * them, then the event that re-invokes it. */
        boundExecutionRef.current = executionOverride;
        publishChatHostServices(activeChatId, {
          placement: placementOf(executionOverride),
          compose: () => composeRef.current(boundExecutionRef.current),
        });
        store.setTurnPlacement(activeChatId, placementOf(executionOverride));
      }
      /* Every bodyless dispatch is a regenerate: *Try again* on an error card,
       * the persistence machine's auto-retry, and startup hydration all re-run
       * the chat's last turn. `turnIntentOf` is the one derivation of which
       * turn that is (V7). */
      const intent = turnIntentOf(messages, { kind: 'regenerate' });
      try {
        const [execution, runId] = await admitWorkspace(intent.leaseTurnId, turnAgent.execution);
        return createRunBody({
          agent: turnAgent,
          projectId,
          runId,
          execution,
          browserHost: hostAdmission({
            agent: turnAgent,
            chatId: activeChatId,
            resolveModel: resolveModelRef.current,
            trigger: turnTriggerOf(intent),
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
  }, [activeChatId, admitWorkspace, agent, messages, projectId, store, surfaceDispatchFailure, workspaceAuthority]);

  return null;
}
