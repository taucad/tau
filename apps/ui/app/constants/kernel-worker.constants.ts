import type { ComputeBinding } from '@taucad/runtime';
import { webWorkerTransport } from '@taucad/runtime/transport/web';
import type { RuntimeKernels } from '@taucad/runtime/worker';
import type { KernelOptionsFactory } from '#types/runtime-client.alias.js';
import type { runtime } from '#runtime/ui-runtime.definition.js';
import { reportWorkerFailures } from '#lib/worker-error-reporting.js';

export type DefaultKernelId = RuntimeKernels<typeof runtime>[number]['id'];

// SB4: each kernel worker's own failures are reported once, tagged `worker: kernel`.
const createDefaultRuntimeWorker = (): Worker =>
  reportWorkerFailures(
    new Worker(new URL('../runtime/runtime.worker.ts', import.meta.url), {
      name: 'tau-ui-runtime-worker',
      type: 'module',
    }),
    'kernel',
  );

const createDebugRuntimeWorker = (): Worker =>
  reportWorkerFailures(
    new Worker(new URL('../runtime/runtime-debug.worker.ts', import.meta.url), {
      name: 'tau-ui-runtime-debug-worker',
      type: 'module',
    }),
    'kernel',
  );

/**
 * Size the worker's compute caches by the device memory class (geometry cache result-path T5).
 *
 * A phone's Memory engine retains 32 MiB and its Durable read cache 16 MiB, so the editor, agent
 * and GeoSpec runtimes it can carry at once stay within the budget iOS allows a tab (D-RT-02).
 * An omitted binding is the library's Memory default.
 *
 * @param compute - The binding the host selected.
 * @param memoryConstrained - The page's device memory class.
 * @returns The binding the worker sizes its caches from.
 */
export const sizeComputeBinding = (
  compute: ComputeBinding | undefined,
  memoryConstrained: boolean | undefined,
): ComputeBinding | undefined =>
  memoryConstrained === true && compute?.mode !== 'off'
    ? { ...(compute ?? { mode: 'memory' }), memoryConstrained: true }
    : compute;

/**
 * Build the editor's default {@link RuntimeClientOptions} with a
 * web-worker transport configured for the supplied filesystem and
 * project-rooted filesystem.
 *
 * Wire topology — `webWorkerTransport`: the kernel runs in a dedicated
 * `Worker` spawned from the UI app's worker-owned runtime entry.
 * Cooperative abort
 * is SAB-backed (`Atomics.notify`); geometry is **transferred**, not pooled;
 * the filesystem bridges through a `MessagePort` to the FM worker.
 *
 * No `sharedMemory.geometry` (W33): the pool tier copies a result twice — into the arena in the
 * worker and out of it on the main thread — where a transfer copies once in the worker and hands
 * the buffer over for nothing. Measured on this host: at 2.5 MB (100k triangles) the pool costs
 * 0.28 ms in the worker plus 0.27 ms of main thread; at 27 MB (1M triangles) 1.73 plus 2.73. The
 * transfer tier pays 0.11 / 1.26 ms in the worker and nothing on the main thread, so it is cheaper
 * on both sides and keeps the GLB to one main-thread copy (`GLTFLoader`'s own). The pool also keys
 * entries by the render's dependency hash and never re-stores an existing key, so two results that
 * share a hash would deliver the first one's bytes.
 *
 * The filesystem handle is owned by the file-manager machine and only available after it
 * reaches `ready`. They are passed in here so the transport client
 * is constructed with everything it needs up-front, preserving the
 * runtime invariant that `client.connect()` takes no arguments.
 */
export const createDefaultKernelOptions: KernelOptionsFactory = ({ fileSystem, runtimeConfig, compute }) => ({
  config: runtimeConfig,
  transport: webWorkerTransport({
    createWorker: createDefaultRuntimeWorker,
    fileSystem,
    compute: sizeComputeBinding(compute, runtimeConfig.memoryConstrained),
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
    compute: sizeComputeBinding(deps.compute, deps.runtimeConfig.memoryConstrained),
  }),
});
