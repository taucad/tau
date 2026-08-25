import { webWorkerTransport } from '@taucad/runtime/transport/web';
import type { RuntimeKernels } from '@taucad/runtime/worker';
import type { KernelOptionsFactory } from '#types/runtime-client.alias.js';
import type { runtime } from '#runtime/ui-runtime.definition.js';

export type DefaultKernelId = RuntimeKernels<typeof runtime>[number]['id'];

const createDefaultRuntimeWorker = (): Worker =>
  new Worker(new URL('../runtime/runtime.worker.ts', import.meta.url), {
    name: 'tau-ui-runtime-worker',
    type: 'module',
  });

const createDebugRuntimeWorker = (): Worker =>
  new Worker(new URL('../runtime/runtime-debug.worker.ts', import.meta.url), {
    name: 'tau-ui-runtime-debug-worker',
    type: 'module',
  });

/**
 * Build the editor's default {@link RuntimeClientOptions} with a
 * web-worker transport configured for the supplied filesystem and
 * project-rooted filesystem.
 *
 * Wire topology — `webWorkerTransport`: the kernel runs in a dedicated
 * `Worker` spawned from the UI app's worker-owned runtime entry.
 * Cooperative abort
 * is SAB-backed (`Atomics.notify`); geometry transports as pooled SAB
 * delivery (declared via `sharedMemory.geometry`); the filesystem
 * bridges through a `MessagePort` to the FM worker.
 *
 * The filesystem handle is owned by the file-manager machine and only available after it
 * reaches `ready`. They are passed in here so the transport client
 * is constructed with everything it needs up-front, preserving the
 * runtime invariant that `client.connect()` takes no arguments.
 */
export const createDefaultKernelOptions: KernelOptionsFactory = ({ fileSystem, runtimeConfig }) => ({
  config: runtimeConfig,
  transport: webWorkerTransport({
    createWorker: createDefaultRuntimeWorker,
    fileSystem,
    sharedMemory: {
      geometry: { bytes: 100 * 1024 * 1024 },
    },
  }),
});

/**
 * Debug kernel options for the editor.
 *
 * Identical to default but enables `withSourceMapping: true` on
 * replicad for enriched error stack traces with library source map
 * resolution. Adds ~50ms to init — only use where rich error feedback
 * matters.
 */
export const createDebugKernelOptions: KernelOptionsFactory = (deps) => ({
  ...createDefaultKernelOptions(deps),
  config: deps.runtimeConfig,
  transport: webWorkerTransport({
    createWorker: createDebugRuntimeWorker,
    devtoolsTelemetry: true,
    fileSystem: deps.fileSystem,
    sharedMemory: {
      geometry: { bytes: 100 * 1024 * 1024 },
    },
  }),
});
