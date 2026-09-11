import { MessageChannel } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import { createComputeStoreChannelClient } from '#transport/_internal/compute-store-channel.js';

const sqliteComputeWorkerConnectType = 'tau.compute-store.connect/v1';

/** Minimal parent-side interface implemented by `node:worker_threads.Worker`. @public */
export type SqliteComputeWorker = {
  readonly postMessage: (value: unknown, transferList?: readonly MessagePort[]) => void;
};

/**
 * Mint one workspace-scoped store capability from an app-owned dedicated worker.
 * @param input - App-owned worker and host-admitted workspace identity.
 * @returns A remote store/control capability and disposer.
 * @public
 */
export const connectSqliteComputeStoreWorker = (input: {
  readonly worker: SqliteComputeWorker;
  readonly workspace: string;
}): ReturnType<typeof createComputeStoreChannelClient> => {
  const channel = new MessageChannel();
  input.worker.postMessage({ type: sqliteComputeWorkerConnectType, workspace: input.workspace, port: channel.port1 }, [
    channel.port1,
  ]);
  return createComputeStoreChannelClient(channel.port2);
};
