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
}>;

/**
 * Hold the project's open lock across `connect` and the pull it starts,
 * announcing this tab's readiness to its peers as it goes.
 *
 * @param input - The project, whether the open is still owed once the lock is held, the connection, and the opener's projection.
 * @returns Whether this tab connected (`false` when a peer had already opened it).
 */
export const holdCloudOpen = async (
  input: Readonly<{
    projectId: string;
    owed: () => boolean;
    connect: () => Promise<void>;
    source: OpenSource;
    signal?: AbortSignal;
  }>,
): Promise<boolean> => {
  const { projectId, owed, connect, source, signal } = input;
  const run = async (): Promise<boolean> => {
    if (!owed()) {
      return false;
    }
    const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(channelName(projectId));
    const settled = Promise.withResolvers<void>();
    let announced: ProjectReadiness | undefined;
    const look = (): void => {
      const status = source.status();
      const readiness = status?.readiness;
      if (readiness !== undefined && readiness !== announced) {
        announced = readiness;
        channel?.postMessage({ readiness } satisfies ReadinessNotice);
      }
      if (openSettled(status) || !owed()) {
        settled.resolve();
      }
    };
    const unsubscribe = source.subscribe(look);
    const stop = (): void => {
      settled.resolve();
    };
    signal?.addEventListener('abort', stop, { once: true });
    try {
      await connect();
      look();
      await settled.promise;
      return true;
    } finally {
      unsubscribe();
      signal?.removeEventListener('abort', stop);
      channel?.close();
    }
  };
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  return locks === undefined
    ? run()
    : locks.request(cloudOpenLockName(projectId), signal === undefined ? {} : { signal }, run);
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
