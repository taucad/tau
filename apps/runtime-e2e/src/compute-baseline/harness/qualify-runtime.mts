/**
 * The runtime definition every qualification arm uses: the Replicad kernel, esbuild and the production
 * middleware preset. Shared by the in-process arm and the worker entry (`qualify-worker.mts`).
 */
import { esbuild } from '@taucad/esbuild';
import { geometryCache, gltfEdgeDetection, parameterFileResolver, parameterUnits } from '@taucad/middleware';
import { replicadKernel } from '@taucad/replicad';
import { defineRuntime } from '@taucad/runtime/worker';

export type QualifyRuntimeOptions = {
  /** `off` switches the Replicad operation adapter off (the reuse-off reference). */
  readonly arm: string;
  readonly wasm: 'single' | 'multi' | 'auto';
};

export const qualifyRuntime = async (options: QualifyRuntimeOptions) => {
  return defineRuntime({
    plugins: [esbuild()],
    kernels: [replicadKernel({ wasm: options.wasm, ...(options.arm === 'off' ? { computeReuse: false } : {}) } as any)],
    middleware: [parameterFileResolver(), parameterUnits(), geometryCache(), gltfEdgeDetection()],
  } as any);
};
