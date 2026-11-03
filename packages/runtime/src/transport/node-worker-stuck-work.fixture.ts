/**
 * Worker entry for `node-worker-stuck-work.integration.test.ts`, written as an application-owned entry is: build a kernel
 * worker, host it with `nodeWorkerHost`. Its one kernel gets stuck in the way its entry file names.
 *
 * The worker keeps its own record apart from the runtime wire: every span its telemetry collector is handed, and
 * every cancel its kernel sees, is posted on the port handed over in `workerData`, so a test can read what the
 * worker did without trusting the client's account of it.
 *
 * @internal
 */

import { workerData } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import { WorkerTelemetryCollector } from '#framework/worker-telemetry.js';
import { createKernelSuccess } from '#kernels/kernel-helpers.js';
import { nodeWorkerHost } from '#transport/node-worker-host.js';
import { defineKernelV2, nonemptyExportFiles } from '#types/runtime-kernel-v2.types.js';
import type { TelemetryEntry } from '#types/runtime-wire.types.js';
import { createRuntimeWorker } from '#worker/create-runtime-worker.js';
import { defineRuntime } from '#worker/runtime-definition.js';

/** One line of the worker's own record. */
export type WorkerRecord =
  | Readonly<{ kind: 'span'; entry: TelemetryEntry }>
  | Readonly<{ kind: 'entered'; operation: string }>
  | Readonly<{ kind: 'abort-seen'; operation: string; reason: unknown }>;

const { record } = workerData as { record: MessagePort };
record.unref();
const post = (line: WorkerRecord): void => {
  record.postMessage(line);
};

const { collect } = WorkerTelemetryCollector.prototype;
WorkerTelemetryCollector.prototype.collect = function collectAndRecord(
  this: WorkerTelemetryCollector,
  entry: TelemetryEntry,
): void {
  post({ kind: 'span', entry });
  collect.call(this, entry);
};

const parameters = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:stuck-work',
    $uses: ['JSONSchemaUnits'],
    name: 'StuckWorkParameters',
    type: 'object',
  },
  defaults: {},
} as const;

/** Never settles, whatever the signal does. */
const forever = async (): Promise<never> =>
  new Promise<never>(() => {
    /* Never settles. */
  });

/**
 * Record a cancel the kernel sees.
 *
 * @param operation - The kernel operation.
 * @param signal - Its operation signal.
 */
const recordAbort = (operation: string, signal: AbortSignal): void => {
  signal.addEventListener('abort', () => {
    post({ kind: 'abort-seen', operation, reason: signal.reason as unknown });
  });
};

const stuckKernel = defineKernelV2({
  id: 'stuck-kernel',
  extensions: ['circuit'] as const,
  name: 'Stuck kernel',
  version: '1.0.0',
  views: { primary: { title: 'Primary', mimeType: 'image/svg+xml' } },
  exports: { bom: { title: 'BOM', mimeType: 'text/csv', extension: 'csv' } },
  async initialize() {
    return {};
  },
  async resolve({ entryPath }) {
    return { resolved: [entryPath], unresolved: [] };
  },
  async describe({ entryPath }) {
    if (entryPath.endsWith('spin.circuit')) {
      post({ kind: 'entered', operation: 'describe' });
      // A nonresponsive worker: the thread never yields again, so it can neither reply nor read a cancel.
      for (;;) {
        /* Spin. */
      }
    }
    return createKernelSuccess({ parameters });
  },
  async evaluate({ entryPath }, { signal }) {
    if (entryPath.endsWith('slow.circuit')) {
      recordAbort('evaluate', signal);
      post({ kind: 'entered', operation: 'evaluate' });
      // Honours its signal: the evaluation ends when the client gives up on it.
      await new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new Error('evaluation aborted'));
        });
      });
    }
    return { handle: {}, views: ['primary'] as const, exports: ['bom'] as const };
  },
  async render() {
    return { content: '<svg xmlns="http://www.w3.org/2000/svg"/>' };
  },
  async export(_input, { signal }) {
    recordAbort('export', signal);
    post({ kind: 'entered', operation: 'export' });
    // Never acknowledges the cancel: the export neither returns nor throws.
    return forever().then(() => ({
      files: nonemptyExportFiles([{ name: 'bom.csv', mimeType: 'text/csv', bytes: new Uint8Array([1]) }]),
    }));
  },
});

await nodeWorkerHost({
  worker: createRuntimeWorker({ runtime: defineRuntime({ kernels: [stuckKernel()] }) }),
}).open();
