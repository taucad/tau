/**
 * The resident worker's project hosts (RH-R4): one per project, named by the page-minted `hostId`. Every control call
 * for a project runs after the one before it settled, so a `provide` reads and replaces the registered host in one
 * step, and a host that fails to open leaves the previous one registered (W6.r1 finding 8). A released host drains
 * its live runs before it closes (T3), outside that order, so a provide meanwhile opens a fresh host at once.
 */
import type { AgentHostProjectProvide, AgentHostProjectRebridge } from '#workers/agent-host.contract.js';

/** What the registry needs of one project host incarnation. */
export type ProjectHostIncarnation = Readonly<{
  hostId: string;
  /** Swap fresh bridges in; the host keeps its launcher and runs (RV1-F1). */
  rebridge: (ports: AgentHostProjectRebridge) => Promise<void>;
  /** Serve nothing new, and settle once every run this host admitted has ended, or `signal` ends (T3). */
  drain: (signal: AbortSignal) => Promise<void>;
  close: () => Promise<void>;
}>;

/** The worker's project hosts, keyed by project. */
export type ProjectHosts<Host extends ProjectHostIncarnation> = Readonly<{
  /** The host serving the project now, if any. */
  hostOf: (projectId: string) => Host | undefined;
  /** Open the named host; a different registered one drains then closes once it opens, answered as `replaced`. */
  provide: (args: AgentHostProjectProvide) => Promise<{ readonly replaced?: string | undefined }>;
  /** Swap bridges into the named host, registered or still draining; `needs`, and the ports closed, otherwise. */
  rebridge: (args: AgentHostProjectRebridge) => Promise<{ readonly status: 'rebridged' | 'needs' }>;
  /**
   * Drain, then close, the named host, answering once it closed; for a replaced host still draining, answer once it
   * closed. A release naming any other incarnation closes nothing (I31, T3).
   */
  release: (args: Readonly<{ projectId: string; hostId: string }>) => Promise<void>;
}>;

/**
 * How long a released host drains before its close begins anyway, as the desktop's `projectHostDrainBound`: the close
 * still records what is left, so the bound cuts a run short rather than losing it. Milliseconds.
 */
const drainBound = 15 * 60_000;

/** Close every port a provide transferred: a provide that fails closes them all, used or not (W6.r1 round 3). */
export const closeProvidedPorts = (provide: Partial<AgentHostProjectProvide>): void => {
  for (const port of [
    provide.fileSystemPort,
    provide.projectRootPort,
    provide.computeStorePort,
    provide.revisionsPort,
    provide.placementPort,
  ]) {
    port?.close();
  }
};

/** What a composition opened so far, to close newest first if it fails part-way (W6.r1 round 3). */
export type Disposers = Readonly<{
  push: (dispose: () => unknown) => void;
  /** Run every disposer, newest first; one that fails is reported and the rest still run. */
  disposeAll: () => Promise<void>;
}>;

/**
 * A stack of disposers.
 *
 * @param report - Told of each disposer that fails.
 * @returns The stack.
 */
export const createDisposers = (report: (error: unknown) => void): Disposers => {
  const stack: Array<() => unknown> = [];
  return {
    push: (dispose) => {
      stack.push(dispose);
    },
    disposeAll: async () => {
      for (const dispose of stack.splice(0).reverse()) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- resources close newest first, one after another.
          await dispose();
        } catch (error) {
          report(error);
        }
      }
    },
  };
};

/** Run `run` once `previous` settled. */
const after = async <Value>(previous: Promise<void> | undefined, run: () => Promise<Value>): Promise<Value> => {
  await previous;
  return run();
};

/** Settle with `promise`, whatever its outcome; its caller sees the failure. */
const settled = async (promise: Promise<unknown>): Promise<void> => {
  try {
    await promise;
  } catch {
    /* Reported to the call that made it. */
  }
};

const logCloseFailure = (error: unknown): void => {
  console.error('[agent-host worker] a project host did not close cleanly', error);
};

const logDrainFailure = (error: unknown): void => {
  console.error('[agent-host worker] a released project host could not follow its runs; it closes now', error);
};

/**
 * The project-host registry of one resident worker.
 *
 * @param open - Opens one host incarnation from the page's provide.
 * @param options - The drain bound; tests shorten it.
 * @returns The registry the control channel drives.
 */
export const createProjectHosts = <Host extends ProjectHostIncarnation>(
  open: (args: AgentHostProjectProvide) => Promise<Host>,
  options?: Readonly<{ drainBound?: number }>,
): ProjectHosts<Host> => {
  const hosts = new Map<string, Host>();
  const queues = new Map<string, Promise<void>>();
  /**
   * Released or replaced hosts draining their runs, by `hostId`, until they close (T3): rebridgeable until the close
   * begins, which waits for a rebridge already under way so it disposes the bridges that one swaps in.
   */
  const retiring = new Map<
    string,
    { readonly host: Host; readonly closed: Promise<void>; closing: boolean; readonly rebridges: Set<Promise<void>> }
  >();

  /** Drain the host's runs, then close it, outside every project's order. */
  const retire = async (host: Host): Promise<void> => {
    const entry = { host, closing: false, rebridges: new Set<Promise<void>>(), closed: Promise.resolve() };
    entry.closed = (async (): Promise<void> => {
      /* T3: a release or replacement never stops a live run; the bound cuts it short, and the close still records
       * it. */
      await host.drain(AbortSignal.timeout(options?.drainBound ?? drainBound)).catch(logDrainFailure);
      entry.closing = true;
      await Promise.allSettled(entry.rebridges);
      await host.close().catch(logCloseFailure);
      retiring.delete(host.hostId);
    })();
    retiring.set(host.hostId, entry);
    return entry.closed;
  };

  /**
   * Run one control call for the project once the previous one settled.
   * ponytail: one settled promise stays per project this document ever opened.
   */
  const serial = async <Value>(projectId: string, run: () => Promise<Value>): Promise<Value> => {
    const result = after(queues.get(projectId), run);
    queues.set(projectId, settled(result));
    return result;
  };

  return {
    hostOf: (projectId) => hosts.get(projectId),
    provide: async (args) =>
      serial(args.projectId, async () => {
        const previous = hosts.get(args.projectId);
        if (previous?.hostId === args.hostId) {
          /* The host already has its bridges; a repeated provide's own ports are never used. */
          closeProvidedPorts(args);
          return {};
        }
        /* Until the new host opens the previous one stays registered, so a failed open leaves it serving. */
        let host: Host;
        try {
          host = await open(args);
        } catch (error) {
          closeProvidedPorts(args);
          throw error;
        }
        hosts.set(args.projectId, host);
        if (previous === undefined) {
          return {};
        }
        /* The replaced incarnation drains, then closes; the page releases it by `hostId` and disposes only its
         * bridges once that release answers (I31). */
        void retire(previous);
        return { replaced: previous.hostId };
      }),
    rebridge: async (args) =>
      serial(args.projectId, async () => {
        const registered = hosts.get(args.projectId);
        if (registered?.hostId === args.hostId) {
          await registered.rebridge(args);
          return { status: 'rebridged' };
        }
        const draining = retiring.get(args.hostId);
        if (draining === undefined || draining.closing) {
          /* Gone, or closing: its bridges go with it, so these are never used. */
          closeProvidedPorts(args);
          return { status: 'needs' };
        }
        const rebridging = draining.host.rebridge(args);
        draining.rebridges.add(rebridging);
        try {
          await rebridging;
        } finally {
          draining.rebridges.delete(rebridging);
        }
        return { status: 'rebridged' };
      }),
    release: async ({ projectId, hostId }) => {
      /* Wrapped: a bare promise returned here would hold the project's order until the host closed. */
      const { closed } = await serial(projectId, async () => {
        const registered = hosts.get(projectId);
        if (registered?.hostId !== hostId) {
          return { closed: retiring.get(hostId)?.closed };
        }
        /* A host leaves the registry as its drain begins, so a later provide opens a fresh one (RH-R4). */
        hosts.delete(projectId);
        return { closed: retire(registered) };
      });
      /* Outside the project's order, so a provide meanwhile opens a fresh host at once. The page disposes this host's
       * bridges only once the release answers, so its runs keep their filesystem until the close. */
      await closed;
    },
  };
};
