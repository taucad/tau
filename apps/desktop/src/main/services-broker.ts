/**
 * The singleton services-utility broker (work item E2, second half).
 *
 * The kernel broker (`registerElectronRuntimeMain`) forks one utility *per
 * client*; the services utility is the opposite shape — exactly one process
 * for the whole app, handing out one `MessagePortMain` per concern. That is
 * substrate invariant 4 read literally: one port per concern, never a
 * multiplexer, so a wedged filesystem stream cannot stall an agent run.
 */

import { resolve, sep } from 'node:path';

import type { MessageChannelMain, MessagePortMain, UtilityProcess } from 'electron';

/** Concerns the services utility serves, one dedicated port each. */
export const servicesConcerns = ['nodeFs', 'agentHost'] as const;

/**
 * A concern the renderer may ask for a port to.
 *
 * `agentHost` is launcher 2 (ruling C3): the portable agent host's Node
 * launcher, bound to the utility's leg of the channel by `serveAgentChannel`.
 * It is also the only concern that carries a context — the workspace root the
 * launcher is scoped to — which main validates against the granted-root
 * registry before minting anything.
 */
export type ServicesConcern = (typeof servicesConcerns)[number];

/** Options for {@link createServicesBroker}. */
export type ServicesBrokerOptions = {
  /** Built utility entry (a `?modulePath` chunk). */
  readonly utilityEntry: string;
  /** Allowlisted environment for the fork. */
  readonly env: NodeJS.ProcessEnv;
  /** `utilityProcess.fork`. */
  readonly fork: (
    entry: string,
    args: string[],
    options: { env: NodeJS.ProcessEnv; serviceName: string },
  ) => UtilityProcess;
  /** `MessageChannelMain` constructor. */
  readonly createChannel: () => MessageChannelMain;
  /** Mint one main-admitted, OS-isolated runtime connection. */
  readonly connectRuntime: (context: Readonly<Record<string, string>>) => {
    readonly port: MessagePortMain;
    readonly closed: Promise<unknown>;
    dispose(): void;
  };
  /** Called once for each freshly forked utility, for diagnostics attachment. */
  readonly onSpawn?: (utility: UtilityProcess) => void;
  /** Diagnostics sink. */
  readonly log?: (level: 'info' | 'warn' | 'error', event: string, detail?: unknown) => void;
};

/** The singleton services utility, seen from main. */
export type ServicesBroker = {
  /**
   * Open one dedicated port for a concern and return the renderer's leg.
   *
   * `context` rides the same frame as the port because it scopes *that*
   * connection — a second `agentHost` port for another workspace root is a
   * second connection, never a re-configuration of the first.
   */
  connect(concern: ServicesConcern, context?: Readonly<Record<string, string>>): MessagePortMain;
  /** Send a control frame (root admission, credential updates) to the utility. */
  post(message: unknown): void;
  /** Original project identity retained for an admitted execution root. */
  computeProjectRoot(executionRoot: string): string | undefined;
  /** Terminate the utility. */
  dispose(): Promise<void>;
};

/**
 * Open the lazily started services broker.
 *
 * @param options - Utility entry, environment, and Electron seams.
 * @returns The broker.
 */
export const createServicesBroker = (options: ServicesBrokerOptions): ServicesBroker => {
  const log = options.log ?? ((): void => undefined);
  /* Control frames sent before the first `connect()` would be dropped, so the
   * latest of each kind is replayed onto every fork — the utility's root
   * allowlist and credential must survive a crash without the app re-deriving
   * them. Keyed by `type` so an hourly token refresh replaces rather than
   * accumulates. */
  const controlFrames = new Map<string, unknown>();
  const runtimeContexts = new Map<string, Readonly<Record<string, string>>>();
  /* Turn checkouts the utility registered, kept apart from the project contexts
   * `connect()` owns: a candidate turn's kernel and GeoSpec tools must reach the
   * tree its file tools write, and that tree lives only for the turn (V19). The
   * separate set is what makes a release frame unable to evict a project. */
  const checkoutContexts = new Set<string>();
  const runtimeLeases = new Map<string, ReturnType<ServicesBrokerOptions['connectRuntime']>>();
  const runtimeLeaseClosures = new Map<string, Promise<void>>();
  let utility: UtilityProcess | undefined;

  const releaseRuntimeLeases = (): void => {
    for (const lease of runtimeLeases.values()) {
      lease.dispose();
    }
    runtimeLeases.clear();
  };

  /**
   * Forget every checkout the utility registered.
   *
   * Only the utility that registered a checkout releases it, so one that dies
   * mid-turn leaves a root that is admissible forever and a tree that is
   * already gone with its turn. The project contexts `connect()` owns are kept:
   * the next fork re-registers them from its own concern frame (5-review S4).
   */
  const forgetCheckoutContexts = (): void => {
    for (const workspaceRoot of checkoutContexts) {
      runtimeContexts.delete(workspaceRoot);
    }
    checkoutContexts.clear();
  };

  /**
   * Register or release one turn checkout as a runtime root.
   *
   * A candidate turn's kernel and GeoSpec tools must reach the tree its file
   * tools write, and that tree lives only for the turn (V19). The grant is
   * still main's: a checkout is admissible only strictly inside a project the
   * user already granted, and only a checkout registered here is releasable —
   * a release naming the project would silently disarm every later runtime
   * request for it.
   *
   * @param type - The frame's type, register or release.
   * @param frame - The frame the utility sent.
   */
  const applyRuntimeContextFrame = (type: string, frame: Record<string, unknown>): void => {
    const { projectRoot, workspaceRoot } = frame;
    if (typeof workspaceRoot !== 'string' || typeof projectRoot !== 'string') {
      return;
    }
    const canonicalWorkspaceRoot = resolve(workspaceRoot);
    const canonicalProjectRoot = resolve(projectRoot);
    if (type === 'runtime-context-release') {
      if (checkoutContexts.delete(canonicalWorkspaceRoot)) {
        runtimeContexts.delete(canonicalWorkspaceRoot);
      }
      return;
    }
    if (
      !runtimeContexts.has(canonicalProjectRoot) ||
      !canonicalWorkspaceRoot.startsWith(canonicalProjectRoot.replace(/[\\/]+$/u, '') + sep)
    ) {
      log('warn', 'services.runtime-context-refused', { workspaceRoot });
      return;
    }
    const projectContext = runtimeContexts.get(canonicalProjectRoot)!;
    runtimeContexts.set(canonicalWorkspaceRoot, { ...projectContext, projectRoot: canonicalWorkspaceRoot });
    checkoutContexts.add(canonicalWorkspaceRoot);
  };

  const handleUtilityMessage = (spawned: UtilityProcess, frame: unknown): void => {
    if (!frame || typeof frame !== 'object') {
      return;
    }
    const { requestId, type, workspaceRoot } = frame as Record<string, unknown>;
    if (type === 'runtime-context-register' || type === 'runtime-context-release') {
      if (utility === spawned) {
        applyRuntimeContextFrame(type, frame as Record<string, unknown>);
      }
      return;
    }
    if (type === 'runtime-port-release' && typeof requestId === 'string') {
      if (utility !== spawned) {
        return;
      }
      runtimeLeases.get(requestId)?.dispose();
      runtimeLeases.delete(requestId);
      return;
    }
    if (
      type !== 'runtime-port-request' ||
      typeof requestId !== 'string' ||
      requestId.length === 0 ||
      requestId.length > 128 ||
      typeof workspaceRoot !== 'string'
    ) {
      return;
    }
    const context = runtimeContexts.get(resolve(workspaceRoot));
    if (!context || utility !== spawned) {
      spawned.postMessage({ type: 'runtime-port-refused', requestId });
      return;
    }
    if (runtimeLeases.has(requestId)) {
      spawned.postMessage({ type: 'runtime-port-refused', requestId });
      return;
    }
    const lease = options.connectRuntime(context);
    runtimeLeases.set(requestId, lease);
    const cleanup = (async (): Promise<void> => {
      await lease.closed;
      if (runtimeLeases.get(requestId) === lease) {
        runtimeLeases.delete(requestId);
      }
      runtimeLeaseClosures.delete(requestId);
    })();
    runtimeLeaseClosures.set(requestId, cleanup);
    try {
      spawned.postMessage({ type: 'runtime-port', requestId }, [lease.port]);
    } catch (error) {
      runtimeLeases.delete(requestId);
      lease.dispose();
      throw error;
    }
  };

  const ensure = (): UtilityProcess => {
    if (utility) {
      return utility;
    }
    const spawned = options.fork(options.utilityEntry, [], {
      env: options.env,
      serviceName: 'tau-services-host',
    });
    /* No restart policy by ruling: a dead utility is simply forgotten, and the
     * next `connect()` forks a fresh one. Nothing here retries on its own. */
    spawned.on('exit', () => {
      if (utility === spawned) {
        utility = undefined;
        releaseRuntimeLeases();
        forgetCheckoutContexts();
      }
    });
    spawned.on('message', (message: unknown) => {
      try {
        handleUtilityMessage(spawned, message);
      } catch (error) {
        log('error', 'services.runtime-port-failed', error);
        const requestId = (message as { readonly requestId?: unknown } | undefined)?.requestId;
        if (typeof requestId === 'string') {
          spawned.postMessage({ type: 'runtime-port-refused', requestId });
        }
      }
    });
    options.onSpawn?.(spawned);
    utility = spawned;
    for (const frame of controlFrames.values()) {
      spawned.postMessage(frame);
    }
    log('info', 'services.forked');
    return spawned;
  };

  return {
    connect(concern, context) {
      if (concern === 'agentHost' && context?.['workspaceRoot']) {
        const projectRoot = resolve(context['workspaceRoot']);
        runtimeContexts.set(projectRoot, {
          projectRoot,
          computeProjectRoot: projectRoot,
          computeMode: context['computeMode'] ?? 'off',
          definition: 'default',
        });
      }
      const channel = options.createChannel();
      ensure().postMessage({ type: 'concern', concern, ...(context === undefined ? {} : { context }) }, [
        channel.port2,
      ]);
      log('info', 'services.concern-connected', { concern });
      return channel.port1;
    },
    post(message) {
      const { type } = message as { type?: unknown };
      if (typeof type !== 'string') {
        throw new TypeError('A services control frame must carry a string `type`.');
      }
      controlFrames.set(type, message);
      utility?.postMessage(message);
    },
    computeProjectRoot(executionRoot) {
      return runtimeContexts.get(resolve(executionRoot))?.['computeProjectRoot'];
    },
    async dispose() {
      const closures = [...runtimeLeaseClosures.values()];
      releaseRuntimeLeases();
      forgetCheckoutContexts();
      utility?.kill();
      utility = undefined;
      await Promise.allSettled(closures);
      runtimeLeaseClosures.clear();
    },
  };
};
