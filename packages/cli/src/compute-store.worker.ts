import { parentPort, workerData } from 'node:worker_threads';
import { serveSqliteComputeStoreWorker } from '@taucad/runtime/node';
import { z } from 'zod';

const computeStoreWorkerDataSchema = z.object({ directory: z.string().min(1) });

/** What `tau serve` hands this entry as `workerData`. */
export type ComputeStoreWorkerData = z.input<typeof computeStoreWorkerDataSchema>;

if (!parentPort) {
  throw new Error('The compute store must run in a worker thread.');
}

serveSqliteComputeStoreWorker({
  parentPort,
  directory: computeStoreWorkerDataSchema.parse(workerData).directory,
});
