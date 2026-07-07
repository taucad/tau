import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import type { AnyRuntimeDefinition } from '#worker/runtime-definition.js';

/**
 * Options for constructing a runtime worker inside an app-owned worker entry.
 *
 * @public
 */
export type CreateRuntimeWorkerOptions = {
  readonly runtime: AnyRuntimeDefinition;
};

/**
 * Create a multi-kernel runtime worker from a worker-owned runtime definition.
 *
 * @param options - Worker construction options.
 * @returns A runtime worker instance.
 * @public
 */
export function createRuntimeWorker(options: CreateRuntimeWorkerOptions): KernelRuntimeWorker {
  return new KernelRuntimeWorker({
    runtime: options.runtime,
  });
}
