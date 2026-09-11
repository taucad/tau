import { _resolveComputeStore } from '#cache/kernel-compute-runtime.js';
import { exposeComputeStoreChannel } from '#transport/_internal/compute-store-channel.js';
import type { ComputeBinding } from '#types/runtime-compute.types.js';
import type { RuntimeInitializeMemoryHandle } from '#transport/runtime-transport.types.js';

/** Parent-owned transferable compute authority prepared for one runtime client. @internal */
export type ComputeStoreBridge = {
  readonly memoryHandle: Pick<RuntimeInitializeMemoryHandle, 'computeBindingMode' | 'computeStorePort'>;
  readonly transfer: readonly Transferable[];
  readonly dispose: () => void;
};

/** Build a private channel from an opaque same-realm binding; raw authority never enters public options. @internal */
export const buildComputeStoreBridge = (binding: ComputeBinding | undefined): ComputeStoreBridge => {
  if (binding?.mode !== 'durable') {
    return {
      memoryHandle: { computeBindingMode: binding?.mode ?? 'memory' },
      transfer: [],
      dispose() {
        /* No authority was allocated. */
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
    memoryHandle: { computeBindingMode: 'durable', computeStorePort: channel.port2 },
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
