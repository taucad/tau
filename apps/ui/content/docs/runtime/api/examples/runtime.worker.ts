import { defineRuntime } from '@taucad/runtime/worker';
import { esbuild } from '@taucad/esbuild';
import { replicad } from '@taucad/replicad';
import { serveWebWorkerRuntime } from '@taucad/runtime/worker/web';

export const runtime = defineRuntime({
  plugins: [replicad(), esbuild()],
});

await serveWebWorkerRuntime({ runtime });
