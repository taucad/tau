import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { connectSqliteComputeStoreWorker } from '@taucad/runtime/node';

import type { ComputeStoreWorkerData } from '#compute-store.worker.js';

/** One project's capability on the durable compute store: its `store`, `control` and disposer. @internal */
export type ComputeStoreConnection = ReturnType<typeof connectSqliteComputeStoreWorker>;

/** The SQLite compute store worker of one CLI process and its project connections. @internal */
export type ComputeStoreHost = Readonly<{
  /**
   * The connection for one project, opened on first use; the worker starts with the first connection.
   * @param workspace - The project root, which names that project's store file.
   * @returns The project's connection, the same one until the worker exits.
   */
  connect(workspace: string): ComputeStoreConnection;
  /**
   * Dispose every connection and stop the worker.
   * @returns Once the worker has stopped.
   */
  close(): Promise<void>;
}>;

const computeStoreWorkerModulePath = (): string =>
  fileURLToPath(
    new URL(
      import.meta.url.endsWith('.ts') ? './compute-store.worker.ts' : './compute-store-worker.mjs',
      import.meta.url,
    ),
  );

/**
 * Run the durable compute store in a worker thread, as `tau serve` and Tau Desktop do: one SQLite file per project
 * under `directory`, shared by every Tau process that opens that project. A worker that exits or fails is replaced by
 * the next connection, and the connections it served are disposed.
 *
 * @internal
 * @param options - The store directory and the reporter of a worker failure.
 * @returns The store host.
 */
export const createComputeStoreHost = (
  options: Readonly<{ directory: string; onError: (error: Error) => void }>,
): ComputeStoreHost => {
  let worker: Worker | undefined;
  const connections = new Map<string, ComputeStoreConnection>();
  const invalidate = (stale: Worker): void => {
    if (worker !== stale) {
      return;
    }
    for (const connection of connections.values()) {
      connection.dispose();
    }
    connections.clear();
    worker = undefined;
  };
  return {
    connect(workspace) {
      const existing = connections.get(workspace);
      if (existing) {
        return existing;
      }
      if (!worker) {
        const started = new Worker(computeStoreWorkerModulePath(), {
          workerData: { directory: options.directory } satisfies ComputeStoreWorkerData,
        });
        started.once('exit', () => {
          invalidate(started);
        });
        started.on('error', (error) => {
          invalidate(started);
          options.onError(error);
        });
        worker = started;
      }
      const connection = connectSqliteComputeStoreWorker({ worker, workspace });
      connections.set(workspace, connection);
      return connection;
    },
    async close() {
      const stopping = worker;
      if (stopping) {
        invalidate(stopping);
        await stopping.terminate();
      }
    },
  };
};
