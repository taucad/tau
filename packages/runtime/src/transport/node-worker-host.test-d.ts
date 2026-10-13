/**
 * Type-conformance test for the standalone `nodeWorkerHost` factory
 * extracted in R2 (`docs/research/runtime-transport-authoring-simplification.md`).
 *
 * Mirrors `web-worker-host.test-d.ts` for the Node topology and locks the
 * consumer-owned URL contract for the paired client transport.
 *
 * @vitest-environment node
 */

import { Worker as NodeWorker } from 'node:worker_threads';
import type { WorkerOptions } from 'node:worker_threads';
import { assertType, describe, expectTypeOf, it } from 'vitest';
import type { RuntimeTransportHost } from '#transport/runtime-transport.types.js';
import type { RuntimeDocumentProtocol } from '#types/runtime-document-protocol.types.js';
import { nodeWorkerHost } from '#transport/node-worker-host.js';
import { nodeWorkerTransport } from '#transport/node-worker-transport.js';
import type { NodeWorkerLike } from '#transport/node-worker-transport.js';
import type { KernelWorker } from '#framework/kernel-worker.js';

describe('nodeWorkerHost — type conformance (R2)', () => {
  it('returns the same structural shape as sequential `nodeWorkerHost` constructions', () => {
    const stubWorker = {} as unknown as KernelWorker;
    const direct = nodeWorkerHost({ worker: stubWorker });
    const second = nodeWorkerHost({ worker: stubWorker });
    assertType<RuntimeTransportHost<RuntimeDocumentProtocol, Readonly<Record<never, never>>, 'node-worker'>>(direct);
    assertType<typeof direct>(second);
  });

  it('preserves `id` literal narrowing', () => {
    const stubWorker = {} as unknown as KernelWorker;
    const host = nodeWorkerHost({ worker: stubWorker });
    assertType<'node-worker'>(host.id);
  });

  it('requires the consumer to supply the worker URL', () => {
    nodeWorkerTransport({ url: new URL('runtime.worker.ts', import.meta.url) });
    // @ts-expect-error The consuming application owns Node worker entry resolution.
    nodeWorkerTransport({});
  });

  it('accepts structured-cloneable workerData and rejects a function', () => {
    const url = new URL('runtime.worker.ts', import.meta.url);
    nodeWorkerTransport({ url, workerData: { projectRoot: '/projects/a', plugin: ['@taucad/replicad'], depth: 2 } });
    nodeWorkerTransport({ url, workerData: 'project-a' });
    // @ts-expect-error A function cannot cross the structured-clone boundary into the worker.
    nodeWorkerTransport({ url, workerData: () => 1 });
    // @ts-expect-error A nested function cannot cross the structured-clone boundary either.
    nodeWorkerTransport({ url, workerData: { onReady: () => undefined } });
  });

  it('types the workerCtor seam as a Worker constructor that receives the worker options', () => {
    const url = new URL('runtime.worker.ts', import.meta.url);
    class TsxWorker extends NodeWorker {
      public constructor(workerUrl: string | URL, options?: WorkerOptions) {
        super(workerUrl, { ...options, execArgv: ['--import', 'tsx'] });
      }
    }
    nodeWorkerTransport({ url, workerCtor: TsxWorker, workerData: { projectRoot: '/projects/a' } });
    // @ts-expect-error The seam is a constructor, not a factory function.
    nodeWorkerTransport({ url, workerCtor: () => new NodeWorker(url) });
  });

  it('requires a custom worker to report its error and exit events', () => {
    expectTypeOf<NodeWorker>().toExtend<NodeWorkerLike>();
    type MessageOnlyWorker = {
      postMessage(value: unknown): void;
      on(event: 'message', listener: (data: unknown) => void): MessageOnlyWorker;
      off(event: 'message', listener: (data: unknown) => void): MessageOnlyWorker;
      terminate(): Promise<number>;
    };
    /* The transport settles a crashed or exited worker from these events; a worker without them hangs until the operation timeout. */
    expectTypeOf<MessageOnlyWorker>().not.toExtend<NodeWorkerLike>();
  });
});
