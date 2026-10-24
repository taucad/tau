import { _resolveComputeStore } from '#cache/kernel-compute-runtime.js';
import { _resolveComputeStorePort, exposeComputeStoreChannel } from '#transport/_internal/compute-store-channel.js';
import type { ComputeBinding } from '#types/runtime-compute.types.js';
import type { RuntimeInitializeMemoryHandle } from '#transport/runtime-transport.types.js';

/** Parent-owned transferable compute authority prepared for one runtime client. @internal */
export type ComputeStoreBridge = {
  readonly memoryHandle: Pick<
    RuntimeInitializeMemoryHandle,
    'computeBindingMode' | 'computeStorePort' | 'computeMemoryConstrained'
  >;
  readonly transfer: readonly Transferable[];
  readonly dispose: () => void;
};

/**
 * Bind an opaque durable store for one runtime client; raw authority never enters public options.
 * A port-backed store hands its authority's port to the runtime; a same-realm store is served here.
 * @internal
 * @param binding - The client's compute binding; anything but `durable` allocates no authority.
 * @returns The memory-handle fields, the ports to transfer, and the disposer that closes them.
 */
export const buildComputeStoreBridge = (binding: ComputeBinding | undefined): ComputeStoreBridge => {
  const sizing =
    binding?.mode !== 'off' && binding?.memoryConstrained === true ? { computeMemoryConstrained: true } : {};
  if (binding?.mode !== 'durable') {
    return {
      memoryHandle: { computeBindingMode: binding?.mode ?? 'memory', ...sizing },
      transfer: [],
      dispose() {
        /* No authority was allocated. */
      },
    };
  }
  const openPort = _resolveComputeStorePort(binding.store);
  if (openPort) {
    /* The authority already serves a port: hand it to the runtime instead of relaying every call here. */
    const port = openPort();
    return {
      memoryHandle: { computeBindingMode: 'durable', computeStorePort: port },
      transfer: [port as Transferable],
      /* `close` is idempotent, and a no-op once the port has been transferred. */
      dispose: () => {
        port.close();
      },
    };
  }
  const authority = _resolveComputeStore(binding.store);
  if (!authority) {
    throw new TypeError('compute binding contains an unregistered or foreign store capability');
  }
  const channel = new MessageChannel();
  const readGeneration = async () => {
    const report = await authority.control.inspect({});
    return report.generation;
  };
  const server = exposeComputeStoreChannel({
    port: channel.port1,
    engine: authority.engine,
    workspace: authority.workspace,
    generation: authority.generation ?? readGeneration,
  });
  let disposed = false;
  return {
    memoryHandle: { computeBindingMode: 'durable', computeStorePort: channel.port2, ...sizing },
    transfer: [channel.port2],
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      server.dispose();
      channel.port1.close();
      channel.port2.close();
    },
  };
};
