/**
 * Web-worker transport — host factory.
 *
 * Bundled into the worker entry chunk via
 * `@taucad/runtime/worker/web`. Owns the worker-side channel server,
 * the crash trap, and the `adoptInitialize` bindings the dispatcher
 * relies on. **Must not** import from `web-worker-client.ts` or
 * `web-worker-transport.ts` — the client owns the
 * `new URL('../worker/web.js', import.meta.url)` chunk-emit literal,
 * and a static path back from the worker chunk to the chunk-emitter
 * deadlocks Rolldown's chunk planner during `pnpm nx build ui`.
 *
 * Per `docs/research/runtime-transport-authoring-simplification.md` (R1).
 *
 * @public
 */

import type {
  HostInitializeBindings,
  RuntimeInitializeMemoryHandle,
  RuntimeTransportHost,
  TransportHostReady,
} from '#transport/runtime-transport.types.js';
import { createWorkerDispatcher } from '#transport/_internal/runtime-worker-dispatcher.js';
import type { KernelWorker } from '#framework/kernel-worker.js';
import { buildHelloPayload } from '#transport/_internal/transport-hello.js';
import { createWorkerHostBindings } from '#transport/_internal/worker-host-bindings.js';
import { encodeGeometryAsOwnedTransfer } from '#transport/_internal/owned-transfer-bytes.js';
import { acquireWebWorkerSelfPort } from '#transport/_internal/web-worker-self-port.js';
import { installWorkerCrashTrap } from '#transport/_internal/worker-crash-trap.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import { webWorkerId } from '#transport/_internal/web-worker-id.js';
import type { WebWorkerId } from '#transport/_internal/web-worker-id.js';

/**
 * Options accepted by {@link webWorkerHost}.
 *
 * @public
 */
export type WebWorkerHostOptions = {
  /** Worker-side {@link KernelWorker} instance to bridge into the channel. */
  readonly worker: KernelWorker;
};

/**
 * Standalone host factory for the web-worker transport. Identical
 * shape to `webWorkerTransport.host`, but lives in its own module so
 * the worker entry can static-import the host without dragging the
 * client's `new URL(...)` chunk-emit literal back into the worker
 * chunk's transitive graph.
 *
 * @param options - Host options; see {@link WebWorkerHostOptions}.
 * @returns The {@link RuntimeTransportHost} fat handle for the web-worker wire.
 * @public
 */
export const webWorkerHost = (
  options: WebWorkerHostOptions,
): RuntimeTransportHost<RuntimeProtocol, Readonly<Record<never, never>>, WebWorkerId> => {
  let serverHandle: ReturnType<typeof createWorkerDispatcher> | undefined;
  let crashTrapDispose: (() => void) | undefined;
  let port: ReturnType<typeof acquireWebWorkerSelfPort> | undefined;
  let isClosed = false;

  let resolveClosed: (() => void) | undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  return {
    id: webWorkerId,
    async open(): Promise<TransportHostReady> {
      if (serverHandle) {
        return { channel: serverHandle, peerHello: buildHelloPayload(webWorkerId) };
      }
      port = acquireWebWorkerSelfPort();
      serverHandle = createWorkerDispatcher(options.worker, port, {
        bindingsFactory: (handle) => createWorkerHostBindings(handle),
      });
      crashTrapDispose = installWorkerCrashTrap(serverHandle);
      return {
        channel: serverHandle,
        peerHello: buildHelloPayload(webWorkerId),
      };
    },
    adoptInitialize(handle: RuntimeInitializeMemoryHandle): HostInitializeBindings {
      return createWorkerHostBindings(handle);
    },
    encodeGeometry(geometry) {
      return encodeGeometryAsOwnedTransfer(geometry);
    },
    async close(reason?: string): Promise<void> {
      if (isClosed) {
        return;
      }
      isClosed = true;
      try {
        crashTrapDispose?.();
      } catch {
        /* Best-effort */
      }
      try {
        serverHandle?.dispose(reason);
      } catch {
        /* Best-effort */
      }
      try {
        port?.close();
      } catch {
        /* Best-effort */
      }
      resolveClosed?.();
    },
    closed,
  };
};
