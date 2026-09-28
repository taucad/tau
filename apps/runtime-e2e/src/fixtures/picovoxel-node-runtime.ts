import { esbuild } from '@taucad/esbuild';
import { picovoxel } from '@taucad/picovoxel';
import { nodeWorkerHost } from '@taucad/runtime/transport/node';
import { createRuntimeWorker, defineRuntime } from '@taucad/runtime/worker';

// Serial: the cancellation case is about the build loop, not the artifact.
export const picovoxelNodeRuntime = defineRuntime({
  plugins: [picovoxel({ kernels: { default: { wasm: 'serial' } } }), esbuild()],
});

await nodeWorkerHost({ worker: createRuntimeWorker({ runtime: picovoxelNodeRuntime }) }).open();
