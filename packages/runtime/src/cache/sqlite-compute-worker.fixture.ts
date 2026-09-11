import { parentPort, workerData } from 'node:worker_threads';
import { serveSqliteComputeStoreWorker } from '#cache/sqlite-compute-worker-host.js';

if (!parentPort) {
  throw new Error('SQLite compute fixture requires a worker parent port.');
}
serveSqliteComputeStoreWorker({ parentPort, directory: (workerData as { directory: string }).directory });
