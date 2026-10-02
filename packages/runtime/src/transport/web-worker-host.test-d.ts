/**
 * Type-conformance test for the standalone `webWorkerHost` factory
 * extracted in R1 (`docs/research/runtime-transport-authoring-simplification.md`).
 *
 * The host file is bundled into the worker entry chunk; the client
 * file (and its `DEFAULT_WEB_WORKER_URL` `new URL(...)` literal) lives
 * in a sibling. This test pins:
 *
 * - `webWorkerHost(opts)` produces a {@link RuntimeTransportHost}
 *   typed against `RuntimeDocumentProtocol` and the same literal id as the
 *   composed `webWorkerTransport` plugin (host side exported separately).
 * - The options shape exposes the canonical `worker: KernelWorker`
 *   field (the host's only required option).
 *
 * @vitest-environment node
 */

import { assertType, describe, it } from 'vitest';
import type { RuntimeTransportHost } from '#transport/runtime-transport.types.js';
import type { RuntimeDocumentProtocol } from '#types/runtime-document-protocol.types.js';
import { webWorkerHost } from '#transport/web-worker-host.js';
import type { KernelWorker } from '#framework/kernel-worker.js';

describe('webWorkerHost — type conformance (R1)', () => {
  it('returns the same structural shape as sequential `webWorkerHost` constructions', () => {
    const stubWorker = {} as unknown as KernelWorker;
    const direct = webWorkerHost({ worker: stubWorker });
    const second = webWorkerHost({ worker: stubWorker });
    assertType<RuntimeTransportHost<RuntimeDocumentProtocol, Readonly<Record<never, never>>, 'web-worker'>>(direct);
    assertType<typeof direct>(second);
  });

  it('preserves `id` literal narrowing', () => {
    const stubWorker = {} as unknown as KernelWorker;
    const host = webWorkerHost({ worker: stubWorker });
    assertType<'web-worker'>(host.id);
  });
});
