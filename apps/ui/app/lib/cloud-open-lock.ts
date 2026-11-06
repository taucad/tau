/**
 * One cold open per project per device (S20, D10).
 *
 * The first tab to open a Tau Cloud project holds `tau:open-cloud-project:<id>`
 * from its connection until its open lands: the pull has fetched and applied
 * the authored checkout, or it failed. A second tab waits on the same lock and
 * does not connect or fetch. It follows the opener's readiness by notice
 * instead, and once the lock is free it finds the open already done (the
 * intent is gone), so the project is downloaded and written once per device.
 */
import type { ProjectReadiness, RevisionStatusProjection } from '@taucad/revisions';

/** The Web Lock one project's cold open is held under. */
export const cloudOpenLockName = (projectId: string): string => `tau:open-cloud-project:${projectId}`;

const channelName = (projectId: string): string => `tau:open-cloud-project:${projectId}`;

/** One readiness notice from the tab that holds the open. */
type ReadinessNotice = Readonly<{ readiness: ProjectReadiness }>;

const isNotice = (value: unknown): value is ReadinessNotice => {
  const readiness = (value as { readiness?: unknown } | undefined)?.readiness;
  return (
    readiness === 'connected' ||
    readiness === 'treeReady' ||
    readiness === 'entryReady' ||
    readiness === 'materialized' ||
    readiness === 'filled'
  );
};

/**
 * Whether the open of a project has landed or stopped on its own, as its
 * projection shows it: the authored checkout is applied, or the pull or the
 * connection failed.
 *
 * @param status - The opener's projection.
 * @returns `true` once holding the lock any longer would only keep a peer waiting.
 */
export const openSettled = (status: RevisionStatusProjection | undefined): boolean =>
  status !== undefined &&
  (status.sync.hasAppliedRemote === true ||
    status.sync.state === 'failed' ||
    status.sync.state === 'queued' ||
    status.sync.state === 'conflicted' ||
    status.remote.phase === 'failed' ||
    status.remote.phase === 'reconnectRequired');

/** What the opener needs to announce its readiness and know when its open landed. */
type OpenSource = Readonly<{
  status: () => RevisionStatusProjection | undefined;
  subscribe: (listener: () => void) => () => void;
  /** Whether the client this open runs on is still this tab's; absent, it always is. */
  alive?: () => boolean;
}>;

/** Liveness bounds of one held open (S20). Milliseconds. */
export type CloudOpenBounds = Readonly<{
  /** How often the holder says it is alive to the tabs waiting on it. */
  heartbeat: number;
  /** How long the holder keeps the lock while its projection does not move. */
  holderStall: number;
  /** How long a waiting tab hears nothing from the holder before it takes the lock over. */
  waiterStall: number;
}>;

const defaultBounds: CloudOpenBounds = { heartbeat: 5000, holderStall: 120_000, waiterStall: 20_000 };

/**
 * Hold the project's open lock across `connect` and the pull it starts,
 * announcing this tab's readiness to its peers as it goes.
 *
 * Bounded both ways: the holder lets go when its client goes away, closes
 * (its projection, once there, is gone) or stops moving for `holderStall`, and says it is alive every
 * `heartbeat` meanwhile; a waiting tab that hears nothing for `waiterStall`
 * (a frozen or hung holder) takes the lock over and opens the project itself.
 *
 * @param input - The project, whether the open is still owed once the lock is held, the connection, the opener's projection, and its bounds.
 * @returns Whether this tab connected (`false` when a peer had already opened it).
 */
export const holdCloudOpen = async (
  input: Readonly<{
    projectId: string;
    owed: () => boolean;
    connect: () => Promise<void>;
    source: OpenSource;
    signal?: AbortSignal;
    bounds?: Partial<CloudOpenBounds>;
  }>,
): Promise<boolean> => {
  const { projectId, owed, connect, source, signal } = input;
  const bounds = { ...defaultBounds, ...input.bounds };
  const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(channelName(projectId));
  const run = async (): Promise<boolean> => {
    if (!owed()) {
      return false;
    }
    const settled = Promise.withResolvers<void>();
    let announced: ProjectReadiness | undefined;
    let seen = source.status();
    let movedAt = Date.now();
    /* Whether the opener's projection has existed: one that then goes away is a client closed or a connection lost. */
    let projected = seen !== undefined;
    const look = (): void => {
      const status = source.status();
      if (status !== seen) {
        seen = status;
        movedAt = Date.now();
      }
      const closed = projected && status === undefined;
      projected ||= status !== undefined;
      const readiness = status?.readiness;
      if (readiness !== undefined && readiness !== announced) {
        announced = readiness;
        channel?.postMessage({ readiness } satisfies ReadinessNotice);
      }
      if (
        closed ||
        openSettled(status) ||
        !owed() ||
        source.alive?.() === false ||
        Date.now() - movedAt >= bounds.holderStall
      ) {
        settled.resolve();
      }
    };
    const unsubscribe = source.subscribe(look);
    const beat = setInterval(() => {
      look();
      channel?.postMessage({ alive: true });
    }, bounds.heartbeat);
    const stop = (): void => {
      settled.resolve();
    };
    signal?.addEventListener('abort', stop, { once: true });
    try {
      channel?.postMessage({ alive: true });
      await connect();
      look();
      await settled.promise;
      return true;
    } finally {
      clearInterval(beat);
      unsubscribe();
      signal?.removeEventListener('abort', stop);
    }
  };
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (locks === undefined) {
    try {
      return await run();
    } finally {
      channel?.close();
    }
  }
  /* A waiter that hears nothing from the holder for `waiterStall` stops waiting and takes the lock over. */
  const silence = new AbortController();
  let quiet: ReturnType<typeof setTimeout> | undefined;
  const listen = (): void => {
    clearTimeout(quiet);
    quiet = setTimeout(() => {
      silence.abort();
    }, bounds.waiterStall);
  };
  channel?.addEventListener('message', listen);
  listen();
  const waiting = signal === undefined ? silence.signal : AbortSignal.any([signal, silence.signal]);
  try {
    return await locks.request(cloudOpenLockName(projectId), { signal: waiting }, async () => {
      clearTimeout(quiet);
      channel?.removeEventListener('message', listen);
      return run();
    });
  } catch (error) {
    if (!silence.signal.aborted || signal?.aborted === true) {
      throw error;
    }
    return await locks.request(cloudOpenLockName(projectId), { steal: true }, run);
  } finally {
    clearTimeout(quiet);
    channel?.close();
  }
};

/**
 * Follow the readiness the tab holding a project's open announces.
 *
 * @param projectId - The project.
 * @param listener - Told each state the opener reaches.
 * @returns Stops following.
 */
export const followCloudOpen = (projectId: string, listener: (readiness: ProjectReadiness) => void): (() => void) => {
  if (typeof BroadcastChannel === 'undefined') {
    return () => undefined;
  }
  const channel = new BroadcastChannel(channelName(projectId));
  channel.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (isNotice(event.data)) {
      listener(event.data.readiness);
    }
  });
  return () => {
    channel.close();
  };
};
