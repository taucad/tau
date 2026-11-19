/**
 * The runtime definition every qualification arm uses: the Replicad kernel, esbuild and the production
 * middleware preset. Shared by the in-process arm and the worker entry (`qualify-worker.mts`).
 */
import { esbuild } from '@taucad/esbuild';
import { geometryCache, gltfEdgeDetection, parameterFileResolver, parameterUnits } from '@taucad/middleware';
import { replicadKernel } from '@taucad/replicad';
import { defineRuntime } from '@taucad/runtime/worker';

/**
 * The channel the worker posts each span's end on (`qualify-worker.mts`), so the abort scenario can supersede an edit
 * exactly when a phase starts instead of after a timed delay.
 */
export const qualifyPhaseChannel = 'tau-qualify-phase';

export type QualifyRuntimeOptions = {
  /** `off` switches the Replicad live tier off (`computeReuse: false`, the reuse-off reference). */
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
