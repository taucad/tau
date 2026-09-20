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
  isBrowserAgentHostPlaced,
  resumableBrowserAgentHostRunId,
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
 * The chat's binding re-registers on this and on nothing else: `createClient`
 * reads the live model itself, so a model change must not churn the
 * registration.
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
      /* `ready` is part of the guard, not an extra check: a registration whose
       * `createClient` cannot prepare is not a registration. Composing one
       * before the file manager's worker existed is what broke open-time
       * discovery — `prepare` threw inside the resume below, the AI SDK
       * swallowed it into `onError`, and the chat's log was never attached. */
      if (
        !workspaceAuthority ||
        !workspaceAuthority.ready ||
        fileManagerRef === undefined ||
        syncProjectRoots === undefined
      ) {
        return undefined;
      }
      /* I7: what the host knows about this chat's run, the page learns at chat
       * open from the host's own snapshot. Reload discovery substantiates a run
       * from this browser's *workspace claim*, which the dead document took
       * with it — so after a reload nothing reattached a browser-placed run,
       * the chat looked idle with no reply, and the next gesture's attach
       * picked the orphan up by accident and re-asked the provider for a turn
       * the person had already paid for (T2-D1). The placement is the trigger
       * here exactly as it is for a daemon; the run identity comes from the
       * log. */
      store.reattachHostChat({ chatId: activeChatId, hostId: execution.kind });
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
          /* Never `prepare`: every turn reaches here with `admitWorkspace`'s
           * claim already taken, so minting one would only ever happen for the
           * open-time attach — which drives nothing and must lease nothing.
           * When it did, the chat's abandoned run settled under the id that
           * attach minted and the durable log refused it (I7). */
          const [prepared, storage, capabilities] = await Promise.all([
            workspaceAuthority.attachment(activeChatId),
            resolveProjectStorage(),
            readRootedBridgeCapabilities(openProjectRootBridge),
          ]);
          if (prepared === undefined) {
            throw new Error('This chat has no checkout to run or replay a turn on.');
          }
          if (!capabilities.writable || !capabilities.durability) {
            throw new Error('The active project filesystem is not writable or did not declare durability.');
          }
          /* The model the person has selected *now*, not the one this
           * registration was composed on. A bodyless Resume carries no
           * admission, so the host runs it on whatever its worker was
           * initialised with — and the card that offers Resume says "change the
           * model, then resume". Composed once per placement, `execution` is as
           * old as the chat's focus; the placement invariant is about `kind` and
           * `hostId`, so a same-kind execution is free to bring its own model. */
          const liveExecution =
            agentRef.current.execution.kind === execution.kind ? agentRef.current.execution : execution;
          const config = agentHostConfig({
            agent: { ...agentRef.current, execution: liveExecution },
            chatId: activeChatId,
            runId: activeChatId,
            resolvedModel: resolveModelRef.current(liveExecution.model),
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
  /* The binding actor calls `compose` when it binds and never again on its own.
   * The revision root connects after this component's first render, so the
   * first composition would be the one that cannot prepare — re-publishing on
   * the flip is what makes the actor compose a working registration. */
  const authorityReady = workspaceAuthority?.ready ?? false;
  useEffect(
    () =>
      publishChatHostServices(activeChatId, {
        placement,
        compose: () => composeRef.current(boundExecutionRef.current),
      }),
    [activeChatId, authorityReady, placement],
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
   *
   * Every one of them is an *attempt*: one lease, one execution, one
   * settlement (I1). A continuation is the only one that does not mint its own
   * run id, because the run it continues is one the host already holds.
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
      /* A placement with no browser host answers its own resume over the wire:
       * the daemon owns the run, its files and its lease, so there is nothing
       * to fence here and nothing to derive. */
      if (gesture.kind === 'continue' && !isBrowserAgentHostPlaced(activeChatId)) {
        return { runId: undefined, leaseTurnId: undefined, request: { kind: 'continue' } };
      }
      /* A run the host can still continue is the *same* turn, and rewinding it
       * would charge a second time for tool work the customer already paid for
       * — but continuing it is still an *attempt*, and an attempt holds a
       * lease. The lease-less `continue` this replaces wrote the resumed
       * execution's files unfenced, minted no revision on completion and left
       * nothing that could settle it (I1, T2-D3/D4). A turn nothing can
       * continue is a new turn, so it falls through to the rewind below. */
      const resumableRunId = gesture.kind === 'continue' ? resumableBrowserAgentHostRunId(activeChatId) : undefined;
      const messages = Array.isArray(chat.messages) ? chat.messages : [];
      try {
        const intent = turnIntentOf(
          messages,
          gesture.kind === 'send'
            ? { kind: 'send', messageId: gesture.message.id }
            : gesture.kind === 'edit'
              ? { kind: 'edit', messageId: gesture.messageId }
              : gesture.kind === 'continue' && resumableRunId !== undefined
                ? { kind: 'continue' }
                : { kind: 'regenerate' },
        );
        /* The claim's run id must be the host's, so the settlement that ends
         * this attempt names the run `drop` is holding. */
        const [target, preparedRunId] = await admitWorkspace(intent.leaseTurnId, execution, resumableRunId);
        if (intent.trigger === 'resume') {
          return {
            runId: preparedRunId ?? resumableRunId,
            leaseTurnId: intent.leaseTurnId,
            request: { kind: 'continue' },
          };
        }
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
