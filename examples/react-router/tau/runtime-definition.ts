import { esbuild } from '@taucad/runtime/bundler/esbuild';
import { replicad } from '@taucad/runtime/kernels/replicad';
import { geometryCache } from '@taucad/runtime/middleware/geometry-cache';
import { parameterCache } from '@taucad/runtime/middleware/parameter-cache';
import { defineRuntime } from '@taucad/runtime/worker';

export const runtime = defineRuntime({
  kernels: [replicad({ wasm: 'single' })],
  bundlers: [esbuild()],
  middleware: [parameterCache(), geometryCache()],
});
