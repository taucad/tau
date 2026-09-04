/**
 * The singleton services-utility broker (work item E2, second half).
 *
 * The kernel broker (`registerElectronRuntimeMain`) forks one utility *per
 * client*; the services utility is the opposite shape — exactly one process
 * for the whole app, handing out one `MessagePortMain` per concern. That is
 * substrate invariant 4 read literally: one port per concern, never a
 * multiplexer, so a wedged filesystem stream cannot stall an agent run.
 */

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
  /** Terminate the utility. */
  dispose(): void;
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
  let utility: UtilityProcess | undefined;

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
    dispose() {
      utility?.kill();
      utility = undefined;
    },
  };
};
