import { useEffect, useState } from 'react';
import type { CadAgentConfigInput, TauAgentHostId, ToolSelection } from '@taucad/chat';
import type { ChatMode } from '@taucad/chat/constants';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useChatSelector } from '#hooks/use-chat.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useChatSnapshot } from '#hooks/use-chat-snapshot.js';
import { useContextPayload } from '#hooks/use-context-payload.js';
import { cookieName } from '#constants/cookie.constants.js';
import { isBrowserAgentHostProviderKind, probeBrowserAgentHostCapability } from '#services/agent-host-client.js';
import { getProjectFileSystemConfig } from '#filesystem/handle-store.js';
import { useOptionalFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import {
  readRootedBridgeCapabilities,
  waitForRootedBridgeOpener,
} from '#providers/chat-workspace-authority-provider.js';
import type { StorageDurabilityClass } from '@taucad/agent-host';
import { listAgentHostPlacements } from '#lib/agent-host-placement.js';
import type { AgentHostPlacementTarget } from '#lib/agent-host-placement.js';
import { unknownIconId } from '#components/icons/svg-icon.js';

/**
 * Whether this project can host the agent log, as three distinct states.
 *
 * `pending` is not `unsupported`. Collapsing the two is what broke the
 * operator's primary flow: the seeded first turn dispatches at chat load,
 * before the asynchronous capability probe resolves, and a hook that reported
 * "unavailable" while still probing silently downgraded that turn to the API
 * coordinator. With the API placement retired there is nothing to downgrade
 * to, so the distinction is load-bearing: a dispatch **waits** for `pending`
 * to settle and refuses with the recorded reason on `unavailable`.
 *
 * @public
 */
export type BrowserAgentHostProjectAvailability =
  | Readonly<{ status: 'pending' }>
  | Readonly<{ status: 'available'; durability: StorageDurabilityClass; caveat?: string }>
  | Readonly<{ status: 'unavailable'; reason: string }>;

const pendingAvailability: BrowserAgentHostProjectAvailability = { status: 'pending' };

/** `ResolvedModel.provider` falls back to this sentinel until the catalog loads. */
const isModelResolved = (providerKind: string): boolean => providerKind !== unknownIconId;

/** Capability-probe codes rendered as the reason the user reads. */
const capabilityReasons = {
  WORKER_UNAVAILABLE: 'This browser cannot start the worker Tau runs the agent in.',
  WEB_LOCKS_UNAVAILABLE: 'This browser does not provide the Web Locks the agent log needs.',
  BROADCAST_CHANNEL_UNAVAILABLE: 'This browser cannot coordinate tabs for the agent log.',
  STORAGE_NOT_WRITABLE: 'This project’s storage cannot hold a durable agent log.',
  SYNC_ACCESS_HANDLE_UNAVAILABLE: 'This browser cannot append to the agent log in this project’s storage.',
} as const;

/** Upper bound on waiting for a capability probe before a dispatch refuses. Milliseconds. */
const availabilityWaitTimeout = 20_000;

const resolvedAvailability = new Map<string, BrowserAgentHostProjectAvailability>();
type AvailabilityWaiter = (availability: BrowserAgentHostProjectAvailability) => void;
const availabilityWaiters = new Map<string, Set<AvailabilityWaiter>>();

/**
 * One availability book, keyed by *placement*: a project's browser host and a
 * daemon it could also run on answer different questions and settle at
 * different times, so they cannot share a slot.
 */
const availabilityKey = (projectId: string | undefined, hostId?: TauAgentHostId): string =>
  `${projectId ?? ''}:${hostId ?? 'browser'}`;

const publishAvailability = (key: string, availability: BrowserAgentHostProjectAvailability): void => {
  resolvedAvailability.set(key, availability);
  const waiters = availabilityWaiters.get(key);
  availabilityWaiters.delete(key);
  for (const waiter of waiters ?? []) {
    waiter(availability);
  }
};

/**
 * The settled availability for one project, waiting out an in-flight probe.
 * Every dispatch resolves through here so no turn is ever placed — or refused —
 * on a probe that has not answered yet.
 *
 * Keyed by project alone, because that is what the probe measures: the
 * filesystem backend's durability class. Whether a *model* has a gateway wire
 * is a synchronous property of the resolved catalog row, and mixing it into
 * this key made the key change under the dispatch — the row reads `unknown`
 * until the catalog loads, so a turn waited on an answer for a key nothing
 * would ever publish.
 *
 * @public
 */
export const awaitAgentHostAvailability = async (
  input: { readonly projectId: string | undefined; readonly hostId?: TauAgentHostId | undefined },
  timeout = availabilityWaitTimeout,
): Promise<BrowserAgentHostProjectAvailability> => {
  const key = availabilityKey(input.projectId, input.hostId);
  const settled = resolvedAvailability.get(key);
  if (settled) {
    return settled;
  }
  return new Promise<BrowserAgentHostProjectAvailability>((resolve) => {
    const waiters = availabilityWaiters.get(key) ?? new Set<AvailabilityWaiter>();
    availabilityWaiters.set(key, waiters);
    const settle = (availability: BrowserAgentHostProjectAvailability): void => {
      globalThis.clearTimeout(probeWaitExpiry);
      waiters.delete(settle);
      resolve(availability);
    };
    const probeWaitExpiry = globalThis.setTimeout(() => {
      waiters.delete(settle);
      resolve({
        status: 'unavailable',
        reason:
          input.hostId === undefined
            ? 'Timed out while checking whether this project can run the agent in your browser.'
            : 'Timed out while looking for that agent host.',
      });
    }, timeout);
    waiters.add(settle);
  });
};

/**
 * The settled browser-host availability for one project.
 *
 * @param projectId - The active project, or `undefined` outside a project route.
 * @param timeout - Upper bound before the wait resolves as unavailable.
 * @returns The settled availability.
 * @public
 */
export const awaitBrowserAgentHostAvailability = async (
  projectId: string | undefined,
  timeout = availabilityWaitTimeout,
): Promise<BrowserAgentHostProjectAvailability> => awaitAgentHostAvailability({ projectId }, timeout);

/** Test-only reset of the module-level probe publication. @internal */
export const resetBrowserAgentHostAvailability = (): void => {
  resolvedAvailability.clear();
  availabilityWaiters.clear();
};

/**
 * Resolve agent-host availability for the active project and model.
 *
 * Mount this wherever a turn can dispatch, not only where the agent selector
 * renders: it owns the probe whose answer `awaitBrowserAgentHostAvailability`
 * hands to every dispatch.
 */
export const useBrowserAgentHostProjectAvailability = (providerKind: string): BrowserAgentHostProjectAvailability => {
  const { projectId } = useProject({ enableNoContext: true }) ?? {};
  // Optional: chat surfaces outside a project route render without a
  // FileManagerProvider; there is no filesystem to probe there yet.
  const fileManager = useOptionalFileManager();
  const fileManagerRef = fileManager?.fileManagerRef;
  const syncProjectRoots = fileManager?.workspace.syncProjectRoots;
  const key = availabilityKey(projectId);
  const [resolved, setResolved] = useState<{
    readonly key: string;
    readonly availability: BrowserAgentHostProjectAvailability;
  }>();

  useEffect(() => {
    if (projectId === undefined || fileManagerRef === undefined || syncProjectRoots === undefined) {
      // Prerequisites are still mounting — genuinely pending, never a refusal.
      return;
    }
    let active = true;
    const settle = (availability: BrowserAgentHostProjectAvailability): void => {
      publishAvailability(key, availability);
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- effect cleanup can run while the capability probe awaits
      if (active) {
        setResolved({ key, availability });
      }
    };
    const resolve = async (): Promise<void> => {
      try {
        const storage = await getProjectFileSystemConfig(projectId);
        await syncProjectRoots();
        const { openFileSystemBridge, rootDirectory } = await waitForRootedBridgeOpener(fileManagerRef);
        if (!storage) {
          throw new Error('The active project filesystem is unavailable.');
        }
        const capabilities = await readRootedBridgeCapabilities(() => openFileSystemBridge(rootDirectory));
        if (!capabilities.writable || !capabilities.durability) {
          throw new Error('The active project filesystem is not writable or did not declare durability.');
        }
        const report = await probeBrowserAgentHostCapability({ durability: capabilities.durability });
        settle(
          report.supported
            ? {
                status: 'available',
                durability: capabilities.durability,
                ...(capabilities.durability === 'ephemeral'
                  ? { caveat: 'Non-recoverable after this browser session ends' }
                  : {}),
              }
            : { status: 'unavailable', reason: capabilityReasons[report.reason] },
        );
      } catch (error) {
        settle({
          status: 'unavailable',
          reason: error instanceof Error ? error.message : 'This project’s filesystem cannot host the agent log.',
        });
      }
    };
    void resolve();
    return () => {
      active = false;
    };
  }, [fileManagerRef, key, projectId, syncProjectRoots]);

  const project = resolved?.key === key ? resolved.availability : pendingAvailability;
  // A model whose catalog row has not loaded yet reads as an unknown provider.
  // That is pending too — refusing it would refuse every turn dispatched
  // before `GET /v1/models` answers, the seeded first turn among them.
  if (project.status !== 'available') {
    return project;
  }
  if (!isModelResolved(providerKind)) {
    return pendingAvailability;
  }
  return isBrowserAgentHostProviderKind(providerKind)
    ? project
    : {
        status: 'unavailable',
        reason: `Tau cannot run the ${providerKind} provider wire in your browser. Pick a different model.`,
      };
};

/**
 * Discover every daemon this page could place a turn on, and publish each one's
 * availability into the same book a dispatch waits on.
 *
 * Ladder discovery, not a dial: rung 1 answers a same-origin descriptor and
 * rung 2 answers the pairing list, both cheap. The socket itself is opened at
 * dispatch, where a refusal is a typed `AgentHostPlacementError` on the chat
 * banner rather than a row that quietly greys out.
 *
 * @returns The discovered targets, and whether discovery is still running.
 * @public
 */
export const useAgentHostPlacements = (): {
  readonly targets: readonly AgentHostPlacementTarget[];
  readonly loading: boolean;
} => {
  const { projectId } = useProject({ enableNoContext: true }) ?? {};
  const [state, setState] = useState<{
    readonly targets: readonly AgentHostPlacementTarget[];
    readonly loading: boolean;
  }>({ targets: [], loading: true });

  useEffect(() => {
    let active = true;
    const discover = async (): Promise<void> => {
      const targets = await listAgentHostPlacements().catch(() => []);
      for (const target of targets) {
        publishAvailability(
          availabilityKey(projectId, target.hostId),
          target.online
            ? { status: 'available', durability: 'exclusive-append' }
            : { status: 'unavailable', reason: `${target.label} is offline.` },
        );
      }
      if (active) {
        setState({ targets, loading: false });
      }
    };
    void discover();
    return () => {
      active = false;
    };
  }, [projectId]);

  return state;
};

/**
 * Assemble the per-request CAD agent config from the producer hooks that own
 * each individual field.
 *
 * This is the **single source of truth** for "what does the CAD agent need to
 * run this turn" on the UI side. Every UI submit site (chat textarea, quick
 * starts, Fix-with-AI, homepage, regenerate-on-edit) composes through a
 * chat-client that wraps this hook — not by re-reading the producer hooks
 * directly. Adding a new field on the CAD agent is a single edit here, plus
 * the matching addition on `cadAgentConfigSchema`.
 *
 * Returns the **input** shape (`z.input<typeof cadAgentConfigSchema>`):
 * `snapshot` and `contextPayload` are truly optional both on the wire and in
 * the parsed type — assembling them as `undefined` propagates straight through
 * the API without a sentinel collapse.
 *
 * @public
 */
export const useCadAgentConfig = (): CadAgentConfigInput => {
  const {
    execution: { execution },
    kernel: { kernelId },
    model: { model },
  } = useChatComposer();
  // Mounted for its effect, never to rewrite the execution. Capability gates a
  // dispatch (`awaitBrowserAgentHostAvailability`); it must therefore be probed
  // wherever a turn can dispatch, not only where the agent selector happens to
  // render — the seeded first turn fires with no selector on screen.
  useBrowserAgentHostProjectAvailability(model.provider.id);
  const mode = useChatSelector((state) => state.draftMode as ChatMode);
  const toolChoice = useChatSelector((state) => state.draftToolChoice as ToolSelection);
  const [testingEnabled] = useCookie(cookieName.chatTestingEnabled, true);
  const snapshot = useChatSnapshot();
  const contextPayload = useContextPayload();

  return {
    profile: 'cad',
    execution,
    kernel: kernelId,
    mode,
    toolChoice,
    testingEnabled,
    snapshot,
    contextPayload,
  };
};
