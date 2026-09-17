/**
 * The singleton services-utility broker (work item E2, second half).
 *
 * The kernel broker (`registerElectronRuntimeMain`) forks one utility *per
 * client*; the services utility is the opposite shape — exactly one process
 * for the whole app, handing out one `MessagePortMain` per concern. That is
 * substrate invariant 4 read literally: one port per concern, never a
 * multiplexer, so a wedged filesystem stream cannot stall an agent run.
 */

import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { MessageChannelMain, MessagePortMain, UtilityProcess } from 'electron';

/** Concerns the services utility serves, one dedicated port each. */
export const servicesConcerns = ['nodeFs', 'agentHost', 'runtimeFileSystem'] as const;

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

/** Concerns a renderer may request directly. */
export const rendererServicesConcerns: readonly ServicesConcern[] = ['nodeFs', 'agentHost'];

/** Observable result of the bounded services-host drain. */
export type ServicesQuiesceOutcome =
  | Readonly<{ status: 'quiesced' }>
  | Readonly<{ status: 'timeout' }>
  | Readonly<{ status: 'no-utility' }>
  | Readonly<{ status: 'host-exited' }>
  | Readonly<{ status: 'failed'; message: string }>;

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
  /** Retain launcher 2 for one renderer project session. */
  retainAgentHost(input: Readonly<{ workspaceRoot: string; projectId: string; attachmentId: string }>): void;
  /** Release one hold and await shutdown when it was the last. */
  releaseAgentHost(
    input: Readonly<{ workspaceRoot: string; projectId: string; attachmentId: string }>,
    boundMilliseconds: number,
  ): Promise<void>;
  /** Send a control frame (root admission, credential updates) to the utility. */
  post(message: unknown): void;
  /** Original project identity retained for an admitted execution root. */
  computeProjectRoot(executionRoot: string): string | undefined;
  /**
   * Ask the utility to settle every project it serves, and wait (W19, D31).
   *
   * Quit used to reach `dispose()` directly, which kills the utility: the
   * launcher closes that record the close revision and await W13's
   * `awaitSyncSettled` never finished. This is the one round trip that lets
   * them. Main owns the bound and preserves timeout, failure, and host-exit as
   * non-success outcomes before forced disposal.
   *
   * @param boundMilliseconds - How long to wait before cutting.
   * @returns What ended the wait.
   */
  quiesce(boundMilliseconds: number): Promise<ServicesQuiesceOutcome>;
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
  const projectIds = new Map<string, string>();
  /* Turn checkouts the utility registered, kept apart from the project contexts
   * `connect()` owns: a candidate turn's kernel and GeoSpec tools must reach the
   * tree its file tools write (V19). The registration lives for as long as some
   * turn holds the checkout — the tree itself outlives them, until an explicit
   * discard. The separate set is what makes a release frame unable to evict a
   * project. */
  const checkoutContexts = new Set<string>();
  const runtimeLeases = new Map<string, ReturnType<ServicesBrokerOptions['connectRuntime']>>();
  const runtimeLeaseClosures = new Map<string, Promise<void>>();
  const projectAttachments = new Map<string, Set<string>>();
  const attachmentGenerations = new Map<string, number>();
  const releaseWaiters = new Map<string, ReturnType<typeof Promise.withResolvers<void>>>();
  /* Roots with a release in flight, by how many. `releaseAgentHost` awaits the
   * utility, and a window that remounts inside that wait re-adopts the project
   * under the attachment id that is releasing. */
  const releasingRoots = new Map<string, number>();
  let releaseRequest = 0;
  let utility: UtilityProcess | undefined;
  let acceptingConnections = true;
  let quiescence: Promise<ServicesQuiesceOutcome> | undefined;
  let settleQuiescence: ((outcome: ServicesQuiesceOutcome) => void) | undefined;
  let disposal: Promise<void> | undefined;

  const isStrictDescendant = (parent: string, candidate: string): boolean => {
    const child = relative(parent, candidate);
    return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
  };
  const canonicalRoot = (root: string): string => {
    const absolute = resolve(root);
    try {
      return realpathSync.native(absolute);
    } catch {
      return absolute;
    }
  };

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
   * tools write (V19). A settlement releases the registration, not the tree:
   * only an explicit discard removes a checkout. The grant is
   * still main's: a checkout is admissible only inside Tau's configured
   * per-project checkout directory, and only a checkout registered here is
   * releasable — a release naming the project would silently disarm every later
   * runtime request for it.
   *
   * @param type - The frame's type, register or release.
   * @param frame - The frame the utility sent.
   */
  const applyRuntimeContextFrame = (type: string, frame: Record<string, unknown>): void => {
    const { projectRoot, workspaceRoot } = frame;
    if (typeof workspaceRoot !== 'string' || typeof projectRoot !== 'string') {
      return;
    }
    const canonicalWorkspaceRoot = canonicalRoot(workspaceRoot);
    const canonicalProjectRoot = canonicalRoot(projectRoot);
    if (type === 'runtime-context-release') {
      if (checkoutContexts.delete(canonicalWorkspaceRoot)) {
        runtimeContexts.delete(canonicalWorkspaceRoot);
      }
      return;
    }
    const projectContext = runtimeContexts.get(canonicalProjectRoot);
    const projectId = projectIds.get(canonicalProjectRoot);
    const projectCheckouts =
      projectId === undefined
        ? canonicalProjectRoot
        : resolve(join(dirname(canonicalProjectRoot), '.tau', 'checkouts', projectId));
    if (
      projectContext === undefined ||
      projectId === undefined ||
      !isStrictDescendant(projectCheckouts, canonicalWorkspaceRoot)
    ) {
      log('warn', 'services.runtime-context-refused', { workspaceRoot });
      return;
    }
    runtimeContexts.set(canonicalWorkspaceRoot, { ...projectContext, projectRoot: canonicalWorkspaceRoot });
    checkoutContexts.add(canonicalWorkspaceRoot);
  };

  const handleUtilityMessage = (spawned: UtilityProcess, frame: unknown): void => {
    if (!frame || typeof frame !== 'object') {
      return;
    }
    const { requestId, type, workspaceRoot } = frame as Record<string, unknown>;
    if ((type === 'agent-host-released' || type === 'agent-host-release-failed') && typeof requestId === 'string') {
      const pending = releaseWaiters.get(requestId);
      if (pending !== undefined) {
        releaseWaiters.delete(requestId);
        if (type === 'agent-host-released') {
          pending.resolve();
        } else {
          pending.reject(new Error('The desktop agent host could not release this project.'));
        }
      }
      return;
    }
    if (type === 'quiesced' || type === 'quiesce-failed') {
      if (utility !== spawned) {
        return;
      }
      settleQuiescence?.(
        type === 'quiesced'
          ? { status: 'quiesced' }
          : {
              status: 'failed',
              message:
                typeof (frame as Record<string, unknown>)['message'] === 'string'
                  ? ((frame as Record<string, unknown>)['message'] as string)
                  : 'The services host failed to quiesce.',
            },
      );
      return;
    }
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
    const context = runtimeContexts.get(canonicalRoot(workspaceRoot));
    if (!acceptingConnections || !context || utility !== spawned) {
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
        settleQuiescence?.({ status: 'host-exited' });
        releaseRuntimeLeases();
        forgetCheckoutContexts();
        for (const pending of releaseWaiters.values()) {
          pending.reject(new Error('The desktop services host exited while releasing a project.'));
        }
        releaseWaiters.clear();
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
      if (!acceptingConnections) {
        throw new Error('The services broker is quiescing and accepts no new concerns.');
      }
      let concernContext = context;
      if (concern === 'agentHost' && context?.['workspaceRoot']) {
        const projectRoot = canonicalRoot(context['workspaceRoot']);
        if (context['projectId'] !== undefined) {
          projectIds.set(projectRoot, context['projectId']);
        }
        const generation = attachmentGenerations.get(projectRoot);
        if (generation !== undefined) {
          concernContext = { ...context, attachmentGeneration: String(generation) };
        }
      }
      /* Registered only once the utility has accepted the port: a refused
       * concern must not leave a runtime context claiming this root. */
      const projectContext =
        concern === 'agentHost' && context?.['workspaceRoot']
          ? (() => {
              const projectRoot = canonicalRoot(context['workspaceRoot']);
              return {
                key: projectRoot,
                value: {
                  projectRoot,
                  computeProjectRoot: projectRoot,
                  computeMode: context['computeMode'] ?? 'off',
                  definition: 'default',
                },
              } as const;
            })()
          : undefined;
      const channel = options.createChannel();
      try {
        ensure().postMessage(
          { type: 'concern', concern, ...(concernContext === undefined ? {} : { context: concernContext }) },
          [channel.port2],
        );
      } catch (error) {
        channel.port1.close();
        channel.port2.close();
        throw error;
      }
      if (projectContext) {
        runtimeContexts.set(projectContext.key, projectContext.value);
      }
      log('info', 'services.concern-connected', { concern });
      return channel.port1;
    },
    retainAgentHost(input) {
      const root = canonicalRoot(input.workspaceRoot);
      const attachments = projectAttachments.get(root) ?? new Set<string>();
      /* A retain during a release is a new adoption even under the same id: the
       * generation is what lets the utility refuse the release it outran. */
      if (!attachments.has(input.attachmentId) || releasingRoots.has(root)) {
        attachmentGenerations.set(root, (attachmentGenerations.get(root) ?? 0) + 1);
      }
      attachments.add(input.attachmentId);
      projectAttachments.set(root, attachments);
      projectIds.set(root, input.projectId);
    },
    async releaseAgentHost(input, boundMilliseconds) {
      const root = canonicalRoot(input.workspaceRoot);
      const attachments = projectAttachments.get(root);
      if (attachments === undefined || !attachments.has(input.attachmentId)) {
        return;
      }
      if (attachments.size > 1) {
        attachments.delete(input.attachmentId);
        return;
      }
      const generation = attachmentGenerations.get(root);
      const spawned = utility;
      if (spawned === undefined) {
        attachments.delete(input.attachmentId);
        projectAttachments.delete(root);
        attachmentGenerations.delete(root);
        runtimeContexts.delete(root);
        projectIds.delete(root);
        return;
      }
      releaseRequest += 1;
      const requestId = `agent-host-release-${String(releaseRequest)}`;
      const pending = Promise.withResolvers<void>();
      releaseWaiters.set(requestId, pending);
      spawned.postMessage({
        type: 'agent-host-release',
        requestId,
        workspaceRoot: root,
        projectId: input.projectId,
        ...(generation === undefined ? {} : { attachmentGeneration: generation }),
      });
      let releaseTimeout: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        releaseTimeout = setTimeout(() => {
          reject(new Error('The desktop agent host release timed out.'));
        }, boundMilliseconds);
        releaseTimeout.unref();
      });
      releasingRoots.set(root, (releasingRoots.get(root) ?? 0) + 1);
      try {
        await Promise.race([pending.promise, deadline]);
        /* The utility refused this release because the project was retained
         * again while it was in flight; dropping main's grant now would strand
         * the launcher that re-adoption is already using. */
        if (attachmentGenerations.get(root) !== generation) {
          return;
        }
        attachments.delete(input.attachmentId);
        if (attachments.size === 0) {
          projectAttachments.delete(root);
          attachmentGenerations.delete(root);
          runtimeContexts.delete(root);
          projectIds.delete(root);
        }
      } finally {
        const releasing = (releasingRoots.get(root) ?? 1) - 1;
        if (releasing === 0) {
          releasingRoots.delete(root);
        } else {
          releasingRoots.set(root, releasing);
        }
        if (releaseTimeout !== undefined) {
          clearTimeout(releaseTimeout);
        }
        releaseWaiters.delete(requestId);
      }
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
      return runtimeContexts.get(canonicalRoot(executionRoot))?.['computeProjectRoot'];
    },
    // oxlint-disable-next-line typescript/promise-function-async -- Promise identity is the repeated-close contract.
    quiesce(boundMilliseconds) {
      acceptingConnections = false;
      if (quiescence !== undefined) {
        return quiescence;
      }
      const spawned = utility;
      if (!spawned) {
        quiescence = Promise.resolve({ status: 'no-utility' });
        return quiescence;
      }
      const settled = Promise.withResolvers<ServicesQuiesceOutcome>();
      let finished = false;
      settleQuiescence = (outcome): void => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(bound);
        settleQuiescence = undefined;
        settled.resolve(outcome);
      };
      const bound = setTimeout(() => settleQuiescence?.({ status: 'timeout' }), boundMilliseconds);
      bound.unref();
      /* A dead utility cannot prove that its projects settled. */
      spawned.on('exit', () => {
        settleQuiescence?.({ status: 'host-exited' });
      });
      try {
        spawned.postMessage({ type: 'quiesce' });
      } catch {
        settleQuiescence({ status: 'host-exited' });
      }
      quiescence = settled.promise;
      return quiescence;
    },
    // oxlint-disable-next-line typescript/promise-function-async -- Promise identity is the repeated-close contract.
    dispose() {
      acceptingConnections = false;
      disposal ??= (async (): Promise<void> => {
        const closures = [...runtimeLeaseClosures.values()];
        releaseRuntimeLeases();
        forgetCheckoutContexts();
        projectAttachments.clear();
        attachmentGenerations.clear();
        for (const pending of releaseWaiters.values()) {
          pending.reject(new Error('The desktop services broker was disposed.'));
        }
        releaseWaiters.clear();
        settleQuiescence?.({ status: 'host-exited' });
        utility?.kill();
        utility = undefined;
        await Promise.allSettled(closures);
        runtimeLeaseClosures.clear();
      })();
      return disposal;
    },
  };
};
