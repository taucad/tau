/**
 * Node-worker transport — host factory.
 *
 * Bundled into the worker entry chunk via
 * `@taucad/runtime/worker/node`. Owns the `parentPort` acquisition,
 * the worker-side channel server, the crash trap, and the
 * `adoptInitialize` bindings the dispatcher relies on. **Must not**
 * import from `node-worker-client.ts` or `node-worker-transport.ts` —
 * the client owns the
 * `new URL('../worker/node.js', import.meta.url)` chunk-emit literal,
 * and a static path back from the worker chunk to the chunk-emitter
 * deadlocks Rolldown's chunk planner.
 *
 * Per `docs/research/runtime-transport-authoring-simplification.md` (R2).
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
import { encodeFileAsOwnedTransfer, encodeGeometryAsOwnedTransfer } from '#transport/_internal/owned-transfer-bytes.js';
import { acquireNodeParentPort } from '#transport/_internal/node-parent-port.js';
import { installWorkerCrashTrap } from '#transport/_internal/worker-crash-trap.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import { nodeWorkerId } from '#transport/_internal/node-worker-id.js';
import type { NodeWorkerId } from '#transport/_internal/node-worker-id.js';

/**
 * Options accepted by {@link nodeWorkerHost}.
 *
 * @public
 */
export type NodeWorkerHostOptions = {
  /** Worker-side {@link KernelWorker} instance to bridge into the channel. */
  readonly worker: KernelWorker;
};

/**
 * Standalone host factory for the node-worker transport. Identical
 * shape to `nodeWorkerTransport.host`, but lives in its own module so
 * the worker entry can static-import the host without dragging the
 * client's `new URL(...)` chunk-emit literal back into the worker
 * chunk's transitive graph.
 *
 * @param options - Host options; see {@link NodeWorkerHostOptions}.
 * @returns The {@link RuntimeTransportHost} fat handle for the node-worker wire.
 * @public
 */
export const nodeWorkerHost = (
  options: NodeWorkerHostOptions,
): RuntimeTransportHost<RuntimeProtocol, Readonly<Record<never, never>>, NodeWorkerId> => {
  let serverHandle: ReturnType<typeof createWorkerDispatcher> | undefined;
  let crashTrapDispose: (() => void) | undefined;
  let port: ReturnType<typeof acquireNodeParentPort> | undefined;
  let isClosed = false;

  let resolveClosed: (() => void) | undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  return {
    id: nodeWorkerId,
    async open(): Promise<TransportHostReady> {
      if (serverHandle) {
        return { channel: serverHandle, peerHello: buildHelloPayload(nodeWorkerId) };
      }
      port = acquireNodeParentPort();
      serverHandle = createWorkerDispatcher(options.worker, port, {
        bindingsFactory: (handle) => createWorkerHostBindings(handle),
      });
      crashTrapDispose = installWorkerCrashTrap(serverHandle);
      return {
        channel: serverHandle,
        peerHello: buildHelloPayload(nodeWorkerId),
      };
    },
    adoptInitialize(handle: RuntimeInitializeMemoryHandle): HostInitializeBindings {
      return createWorkerHostBindings(handle);
    },
    encodeGeometry(geometry) {
      return encodeGeometryAsOwnedTransfer(geometry);
    },
    encodeFile(file) {
      return encodeFileAsOwnedTransfer(file);
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
