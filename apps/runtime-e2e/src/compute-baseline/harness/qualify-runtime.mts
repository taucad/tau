/**
 * The runtime definition every qualification arm uses: the Replicad kernel, esbuild and the production
 * middleware preset. Shared by the in-process arm and the worker entry (`qualify-worker.mts`).
 */
import { defineRuntime } from '../../../../../packages/runtime/src/worker/index.ts';

export type QualifyRuntimeOptions = {
  /** `off` switches the Replicad operation adapter off (the reuse-off reference). */
  readonly arm: string;
  readonly wasm: 'single' | 'multi' | 'auto';
};

export const qualifyRuntime = async (options: QualifyRuntimeOptions) => {
  const { replicadKernel } = await import('../../../../../packages/plugins/replicad/src/index.ts');
  const { esbuild } = await import('../../../../../packages/plugins/esbuild/src/index.ts');
  const middleware = await import('../../../../../packages/plugins/middleware/src/index.ts');
  return defineRuntime({
    plugins: [esbuild()],
    kernels: [replicadKernel({ wasm: options.wasm, ...(options.arm === 'off' ? { computeReuse: false } : {}) } as any)],
    middleware: [
      middleware.parameterFileResolver(),
      middleware.parameterUnits(),
      middleware.geometryCache(),
      middleware.gltfEdgeDetection(),
    ],
  } as any);
};
