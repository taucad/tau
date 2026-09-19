import { parentPort, workerData } from 'node:worker_threads';
import { serveSqliteComputeStoreWorker } from '@taucad/runtime/node';

if (!parentPort) {
  throw new Error('The compute store must run in a worker thread.');
}

serveSqliteComputeStoreWorker({
  parentPort,
  directory: (workerData as { readonly directory: string }).directory,
});
