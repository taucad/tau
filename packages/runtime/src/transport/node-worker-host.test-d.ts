/**
 * Type-conformance test for the standalone `nodeWorkerHost` factory
 * extracted in R2 (`docs/research/runtime-transport-authoring-simplification.md`).
 *
 * Mirrors `web-worker-host.test-d.ts` for the Node topology and locks the
 * consumer-owned URL contract for the paired client transport.
 *
 * @vitest-environment node
 */

import { assertType, describe, it } from 'vitest';
import type { RuntimeTransportHost } from '#transport/runtime-transport.types.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import { nodeWorkerHost } from '#transport/node-worker-host.js';
import { nodeWorkerTransport } from '#transport/node-worker-transport.js';
import type { KernelWorker } from '#framework/kernel-worker.js';

describe('nodeWorkerHost — type conformance (R2)', () => {
  it('returns the same structural shape as sequential `nodeWorkerHost` constructions', () => {
    const stubWorker = {} as unknown as KernelWorker;
    const direct = nodeWorkerHost({ worker: stubWorker });
    const second = nodeWorkerHost({ worker: stubWorker });
    assertType<RuntimeTransportHost<RuntimeProtocol, Readonly<Record<never, never>>, 'node-worker'>>(direct);
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
});
