import { middleware } from '@taucad/middleware';
import { replicadKernel } from '@taucad/replicad';
import { defineRuntime } from '@taucad/runtime/worker';
import { serveWebWorkerRuntime } from '@taucad/runtime/worker/web';

import { createBundler } from '#benchmark-bundler';

const runtime = defineRuntime({
  plugins: [middleware(), createBundler()],
  kernels: [replicadKernel({ wasm: 'multi' })],
});

await serveWebWorkerRuntime({ runtime });
