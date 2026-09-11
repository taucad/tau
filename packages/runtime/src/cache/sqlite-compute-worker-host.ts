import type { MessagePort, MessagePort as NodeMessagePort } from 'node:worker_threads';
import { createSqliteComputeEngine } from '#cache/sqlite-compute-engine.js';
import { exposeComputeStoreChannel } from '#transport/_internal/compute-store-channel.js';

/** Dedicated worker bootstrap message discriminator. @public */
export const sqliteComputeWorkerConnectType = 'tau.compute-store.connect/v1';

/** Bootstrap message accepted only by the dedicated native store worker. @public */
export type SqliteComputeWorkerConnect = {
  readonly type: typeof sqliteComputeWorkerConnectType;
  readonly workspace: string;
  readonly port: NodeMessagePort;
};

/**
 * Run SQLite and its synchronous calls inside the current dedicated worker thread.
 * @param input - Worker parent port and host-resolved private state directory.
 * @returns An async disposer for the worker-owned engine and authorities.
 * @public
 */
export const serveSqliteComputeStoreWorker = (input: {
  readonly parentPort: MessagePort;
  readonly directory: string;
}): (() => Promise<void>) => {
  const store = createSqliteComputeEngine({ directory: input.directory });
  const authorities = new Set<ReturnType<typeof exposeComputeStoreChannel>>();
  const openAuthority = async (message: unknown): Promise<void> => {
    if (!message || typeof message !== 'object') {
      return;
    }
    const request = message as Partial<SqliteComputeWorkerConnect>;
    const { port, workspace } = request;
    if (request.type !== sqliteComputeWorkerConnectType || typeof workspace !== 'string' || !port) {
      return;
    }
    const control = await store.control({ workspace });
    const authority = exposeComputeStoreChannel({ port, engine: store.engine, workspace, control });
    authorities.add(authority);
    authority.onClose(() => authorities.delete(authority));
  };
  const onMessage = (message: unknown): void => {
    // async-iife: bootstrap — each channel owns errors through its hello/close lifecycle.
    // oxlint-disable-next-line promise/prefer-await-to-then -- EventEmitter listeners cannot return this bootstrap promise.
    void openAuthority(message).catch(() => {
      const request = message as Partial<SqliteComputeWorkerConnect>;
      request.port?.close();
    });
  };
  input.parentPort.on('message', onMessage);
  return async () => {
    input.parentPort.off('message', onMessage);
    for (const authority of authorities) {
      authority.dispose('store-worker-dispose');
    }
    authorities.clear();
    await store.dispose();
  };
};
