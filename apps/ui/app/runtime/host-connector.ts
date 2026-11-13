/**
 * The session's host connector as actor logic (app state orchestration charter D4, D8, I5; plan § 4 A7a; inventory
 * rows S2, S32).
 *
 * Every live project publishes one read connector to the chat store, even without a focused chat. Today the session
 * binding (`routes/w.$workspace.$project/project-live-sessions.tsx`) publishes it from an effect whose inputs come
 * from four React hooks mirrored into a ref. This module is the same connector with no React, for the session child
 * `hostConnector` that A7b invokes:
 *
 * - it is published while the file manager has a worker and is `ready`, withdrawn when either stops holding, and
 *   published again when the worker changes (the effect's `client` and `viewsReady` dependencies);
 * - each chat's placement on this device (its stored execution, else the default) decides which owner log it reads;
 *   connecting never issues Start or acquires an SDK session;
 * - the filesystem bridge, the revision session port and the compute store port are read from the file-manager
 *   actor when a chat attaches (row S2);
 * - the default execution, model resolution, the default kernel, the testing cookie and compute reuse are read from
 *   `choices` when a chat attaches, as the ref is read today (row S32);
 * - the browser agent host's project lease is taken by the first browser attach and released when the actor stops.
 *
 * The chat store, the `choices` read and the root synchronisation are ports. The chat store becomes a runtime child
 * in A2; `choices` is the runtime child A6a built; root synchronisation is the file-manager facade's, which has no
 * source outside React before A6c, so A7b feeds it from the session's file manager. Ports live in this closure, never
 * in a machine's context (D4). Nothing in the app imports this module yet: A7b loads it lazily from the session (D5).
 *
 * @module
 */
import { createCallbackLogic } from 'xstate';
import type { ActorRefFrom, CallbackActorLogic } from 'xstate';
import { createDaemonAgentHostTransport } from '@taucad/chat-ui/services/daemon-agent-host-client';
import { isKernelId, isKernelPreference } from '@taucad/types/constants';
import type { KernelId } from '@taucad/types/constants';
import { isKernelAvailable } from '#constants/available-kernel-configurations.js';
import { ENV } from '#environment.config.js';
import { daemonPlacementOf } from '#lib/agent-host-placement.js';
import { desktopBridge } from '#filesystem/desktop-bridge.js';
import { dialExecutionHost, agentHostClientConfig } from '#chat-clients/_internal/turn-body.js';
import { getProjectFileSystemConfig } from '#filesystem/handle-store.js';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';
import { readRootedBridgeCapabilities } from '#providers/chat-workspace-authority-provider.js';
import {
  createAgentHostClient,
  createBrowserAgentHostClient,
  noteBrowserRunPresented,
  noteBrowserRunRated,
  readBrowserRunStoppability,
  retainBrowserAgentHostProject,
} from '#services/agent-host-client.js';
import type { ChatSessionStore } from '#services/chat-session-store.js';
import { resolveCatalogModel } from '#hooks/use-models.js';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';
import type { ProjectChoices } from '#runtime/choices.js';

/** The chat-store calls the connector makes. A2 makes the store a runtime child; tests pass a fake. */
export type HostConnectorChatStore = Pick<ChatSessionStore, 'publishProjectHostConnector' | 'getChatHostSettings'>;

/** The ports the connector reads. A7b supplies the real ones. */
export type HostConnectorPorts = Readonly<{
  chatSessions: HostConnectorChatStore;
  /** The current choices, read when a chat attaches: today the binding's ref over four hooks. */
  choices: () => ProjectChoices;
}>;

/** One session's connector. */
export type HostConnectorInput = Readonly<{
  projectId: string;
  fileManagerRef: ActorRefFrom<typeof fileManagerMachine>;
  /** Synchronise this tab's project roots with the worker before a browser host attaches (the facade's own call). */
  syncProjectRoots: () => Promise<void>;
}>;

/** `hostConnector` takes no events. */
export type HostConnectorEvent = Readonly<{ type: 'never' }>;

export type HostConnectorLogic = CallbackActorLogic<HostConnectorEvent, HostConnectorInput>;

/**
 * The concrete kernel a live session runs: a stored manual preference wins; a row without one keeps its concrete
 * kernel, which behaves as Auto with that owner would, since this connector carries no snapshot facts to route on
 * (blueprint D2). A copy of the binding's `liveSessionKernel`, which A7b deletes with the binding's effect.
 */
const liveSessionKernel = ({
  stored,
  fallback,
}: Readonly<{
  stored: Readonly<{ activeKernel?: string; kernelPreference?: string }> | undefined;
  fallback: KernelId;
}>): KernelId => {
  const preference = stored?.kernelPreference;
  if (isKernelPreference(preference) && preference !== 'auto' && isKernelAvailable(preference)) {
    return preference;
  }
  const legacy = stored?.activeKernel;
  return legacy !== undefined && isKernelId(legacy) && isKernelAvailable(legacy) ? legacy : fallback;
};

/**
 * Build the `hostConnector` logic over its ports.
 *
 * @param ports - The chat store and the `choices` read.
 * @returns Callback logic that keeps one project's read connector published while its file manager is ready.
 */
export const createHostConnectorLogic = (ports: HostConnectorPorts): HostConnectorLogic =>
  createCallbackLogic<HostConnectorEvent, HostConnectorInput>(({ input }) => {
    const { projectId, fileManagerRef, syncProjectRoots } = input;
    const { chatSessions } = ports;
    let browserHostRelease: (() => void) | undefined;

    const publish = (): (() => void) => {
      let connectorActive = true;
      const connect = async (chatId: string) => {
        const stored = await chatSessions.getChatHostSettings(chatId);
        const choices = ports.choices();
        const execution = stored?.activeExecution ?? choices.defaultExecution;
        const daemonHostId = daemonPlacementOf(execution);
        if (daemonHostId !== undefined) {
          return {
            ...createAgentHostClient(
              createDaemonAgentHostTransport(async () => dialExecutionHost(execution, projectId)),
            ),
            placement: { hostId: daemonHostId },
          };
        }
        if (execution.kind !== 'tau') {
          throw new Error(`Chat ${chatId} has no readable host placement.`);
        }
        const kernel = liveSessionKernel({ stored, fallback: choices.defaultKernel });
        const config = await getProjectFileSystemConfig(projectId);
        if (config === undefined) {
          throw new Error(`Project ${projectId} has no filesystem configuration.`);
        }
        const projectStorage =
          config.backend === 'memory'
            ? {
                projectId: config.projectId,
                backend: config.backend,
                storageRootKey: config.storageRootKey,
                providerBasePath: config.providerBasePath,
              }
            : config.backend === 'webaccess'
              ? {
                  projectId: config.projectId,
                  backend: config.backend,
                  workspaceId: config.workspaceId,
                  providerBasePath: config.providerBasePath,
                }
              : { projectId: config.projectId, backend: config.backend, providerBasePath: config.providerBasePath };
        await syncProjectRoots();
        const openProjectRootBridge = () => {
          const { openFileSystemBridge, rootDirectory } = fileManagerRef.getSnapshot().context;
          if (openFileSystemBridge === undefined) {
            throw new Error('The project filesystem bridge is unavailable.');
          }
          return openFileSystemBridge(rootDirectory, 'working-copy');
        };
        const capabilities = await readRootedBridgeCapabilities(openProjectRootBridge);
        if (!capabilities.writable || !capabilities.durability) {
          throw new Error('The project filesystem cannot hold a readable host log.');
        }
        const openRevisionSession = (kind: 'placement' | 'reader') => () =>
          fileManagerRef.getSnapshot().context.openRevisionSessionPort?.(kind, projectId);
        if (!connectorActive) {
          throw new Error(`Project ${projectId}'s host connector closed before chat ${chatId} attached.`);
        }
        /* Resolved against the catalog as it is now, as `resolveModel` reads the query cache at call time. */
        const { modelCatalog } = ports.choices();
        const resolvedModel = resolveCatalogModel(
          execution.model,
          modelCatalog.status === 'loaded' ? modelCatalog.models : undefined,
        );
        const options = {
          openFileSystemBridge: openProjectRootBridge,
          openProjectRootBridge,
          openRevisionsPort: openRevisionSession('reader'),
          openPlacementPort: openRevisionSession('placement'),
          computeMode: choices.computeReuseMode,
          openComputeStorePort: () => {
            const opener = fileManagerRef.getSnapshot().context.openComputeStorePort;
            if (opener === undefined) {
              throw new Error('The project compute authority is unavailable.');
            }
            return opener(projectId);
          },
          projectStorage,
          durability: capabilities.durability,
          authority: { projectId, workspaceId: 'live' },
          gatewayBaseUrl: ENV.TAU_API_URL,
          ...agentHostClientConfig({
            agent: {
              profile: 'cad',
              execution,
              kernel,
              mode: 'agent',
              toolChoice: 'auto',
              testingEnabled: choices.testingEnabled,
            },
            chatId,
            resolvedModel,
          }),
          runtimeConfig: createUiRuntimeConfig(ENV),
        } as const;
        const hostClient = createBrowserAgentHostClient(options);
        browserHostRelease ??= retainBrowserAgentHostProject(options);
        return { ...hostClient, placement: { hostId: daemonHostId } };
      };
      const unpublish = chatSessions.publishProjectHostConnector(projectId, connect, {
        stoppability: async (chatId) => {
          const stored = await chatSessions.getChatHostSettings(chatId);
          const execution = stored?.activeExecution ?? ports.choices().defaultExecution;
          const daemonHostId = daemonPlacementOf(execution);
          if (daemonHostId !== undefined) {
            try {
              const channel = await dialExecutionHost(execution, projectId);
              channel.close();
              return 'stoppable';
            } catch {
              return 'background-window';
            }
          }
          return readBrowserRunStoppability(projectId, chatId);
        },
        /* Only a browser host hears what this page showed (T10); a run on a daemon is not timed. */
        presented: async (chatId, runId, at) => {
          try {
            const stored = await chatSessions.getChatHostSettings(chatId);
            if (daemonPlacementOf(stored?.activeExecution ?? ports.choices().defaultExecution) === undefined) {
              await noteBrowserRunPresented({ projectId, chatId, runId, at });
            }
          } catch {
            /* A lost time is only a missing presentation fact. */
          }
        },
        /*
         * Every rating goes to the browser host and, in the desktop app, to the desktop host (LW8). Each reports one
         * only for a run it observed in its own rows: the chat's current execution may have changed since the rated
         * run ended, and a paired daemon's run is never reported.
         */
        rated: async (rating) => {
          const note = async (deliver: () => Promise<void> | undefined): Promise<void> => {
            try {
              await deliver();
            } catch {
              /* A lost rating is only a missing feedback fact. */
            }
          };
          await Promise.all([
            note(async () => noteBrowserRunRated({ projectId, ...rating })),
            note(async () => desktopBridge()?.agentHost.rated({ projectId, ...rating })),
          ]);
        },
      });
      return () => {
        connectorActive = false;
        unpublish();
      };
    };

    /* Published for one worker while the file manager is ready; the binding's effect keys on the client and readiness. */
    let publishedFor: Worker | undefined;
    let withdraw: (() => void) | undefined;
    const follow = (): void => {
      const snapshot = fileManagerRef.getSnapshot();
      const { worker } = snapshot.context;
      const wanted = worker !== undefined && snapshot.matches('ready') ? worker : undefined;
      if (wanted === publishedFor) {
        return;
      }
      const previous = withdraw;
      withdraw = undefined;
      publishedFor = wanted;
      previous?.();
      if (wanted !== undefined) {
        withdraw = publish();
      }
    };

    follow();
    const subscription = fileManagerRef.subscribe({ next: follow, error: () => undefined });

    return () => {
      const failures: unknown[] = [];
      for (const step of [
        () => {
          subscription.unsubscribe();
        },
        withdraw,
        browserHostRelease,
      ]) {
        try {
          step?.();
        } catch (error) {
          failures.push(error);
        }
      }
      withdraw = undefined;
      browserHostRelease = undefined;
      if (failures.length > 0) {
        throw failures[0];
      }
    };
  });
