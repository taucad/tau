/**
 * Worker entry for the interrupted-drag handle ledger (`replicad-handle-ledger.test.ts`): the Replicad kernel runs in
 * a real worker thread, so the test can supersede a build while the worker is inside it, and the handle ledger runs
 * here, on the OpenCascade instance the kernel uses.
 *
 * `workerData` names a channel for this worker alone and whether the live tier is on. On that channel:
 * - the tracer's span mirror (`devtoolsTelemetry`) posts each span's name as it ends, and the worker holds at the end
 *   of the span a gate names until the test releases it, as `compute-baseline/harness/qualify-worker.mts` does:
 *   `[0]` names the span (2 is `replicad.render-output`, which ends as the GLB pack starts), `[1]` is set to release;
 * - the test asks the ledger to install, to snapshot, and to count the handles alive since the snapshot after a
 *   collection.
 */
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { workerData } from 'node:worker_threads';
import { esbuildBundler } from '@taucad/esbuild';
import { replicadKernel } from '@taucad/replicad';
import { installHandleLedger, summarizeLeaks } from '@taucad/runtime-testing';
import type { HandleLedger } from '@taucad/runtime-testing';
import { nodeWorkerHost } from '@taucad/runtime/transport/node';
import { createRuntimeWorker, defineRuntime } from '@taucad/runtime/worker';
import * as replicad from 'replicad';

/** What the test sends on the worker's channel. */
export type LedgerWorkerRequest =
  | { readonly gate: SharedArrayBuffer }
  | { readonly id: number; readonly ledger: 'install' | 'snapshot' | 'count' };

/** What the worker posts on its channel. */
export type LedgerWorkerMessage =
  | { readonly ready: true }
  | { readonly span: string }
  | { readonly released: { readonly span: string; readonly woke: string } }
  | {
      readonly id: number;
      readonly counted?: {
        readonly live: number;
        readonly doubleDeletes: number;
        readonly leaks: ReadonlyArray<{ key: string; count: number }>;
      };
    };

const { channel: channelName, computeReuse } = workerData as { channel: string; computeReuse: boolean };
const channel = new BroadcastChannel(channelName);
(channel as unknown as { unref?: () => void }).unref?.();
const post = (message: LedgerWorkerMessage): void => {
  channel.postMessage(message);
};

setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;
const collect = async (): Promise<void> => {
  for (let round = 0; round < 4; round += 1) {
    gc();
    // oxlint-disable-next-line eslint/no-await-in-loop -- each round lets the finalization registry run.
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  }
};

const gatedSpans = ['', 'kernel.execute', 'replicad.render-output'];
let gate: Int32Array | undefined;
let ledger: HandleLedger | undefined;
let before: ReadonlySet<WeakKey> = new Set();

const answer = async (request: Extract<LedgerWorkerRequest, { id: number }>): Promise<void> => {
  if (request.ledger === 'install') {
    ledger = installHandleLedger(replicad.getOC());
    post({ id: request.id });
    return;
  }
  if (!ledger) {
    throw new Error('The ledger is not installed');
  }
  await collect();
  if (request.ledger === 'snapshot') {
    before = ledger.snapshot();
    post({ id: request.id });
    return;
  }
  const live = ledger.since(before);
  post({
    id: request.id,
    counted: {
      live: live.length,
      doubleDeletes: ledger.stats().doubleDeletes,
      leaks: summarizeLeaks(live).slice(0, 10),
    },
  });
};

channel.addEventListener('message', ({ data }: MessageEvent<LedgerWorkerRequest>) => {
  if ('gate' in data) {
    gate = new Int32Array(data.gate);
    post({ ready: true });
    return;
  }
  void answer(data);
});

const measure = performance.measure.bind(performance);
performance.measure = ((name: string, ...rest: unknown[]) => {
  if (name.startsWith('tau:')) {
    const span = name.split(':')[1]!;
    post({ span });
    if (gate && Atomics.load(gate, 0) !== 0 && gatedSpans[Atomics.load(gate, 0)] === span) {
      Atomics.store(gate, 0, 0);
      // Bounded, so a lost test cannot hold the worker for good.
      const woke = Atomics.wait(gate, 1, 0, 10_000);
      post({ released: { span, woke } });
    }
  }
  return (measure as (...args: unknown[]) => PerformanceMeasure)(name, ...rest);
}) as typeof performance.measure;

const runtime = defineRuntime({
  kernels: [replicadKernel({ wasm: 'single', ...(computeReuse ? {} : { computeReuse: false }) })],
  bundlers: [esbuildBundler()],
});
await nodeWorkerHost({ worker: createRuntimeWorker({ runtime }) }).open();
