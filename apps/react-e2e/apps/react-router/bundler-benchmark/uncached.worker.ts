import { gltfEdgeDetection, parameterFileResolver } from '@taucad/middleware';
import { replicadKernel } from '@taucad/replicad';
import { defineRuntime } from '@taucad/runtime/worker';
import { serveWebWorkerRuntime } from '@taucad/runtime/worker/web';

import { createBundler } from '#benchmark-bundler';

const runtime = defineRuntime({
  plugins: [createBundler()],
  kernels: [replicadKernel({ wasm: 'multi' })],
  middleware: [parameterFileResolver(), gltfEdgeDetection()],
});

await serveWebWorkerRuntime({ runtime });
