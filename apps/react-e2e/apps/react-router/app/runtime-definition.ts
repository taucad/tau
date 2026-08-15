import { esbuild } from '@taucad/runtime/bundler/esbuild';
import { replicad } from '@taucad/runtime/kernels/replicad';
import { geometryCache } from '@taucad/runtime/middleware/geometry-cache';
import { parameterCache } from '@taucad/runtime/middleware/parameter-cache';
import { defineRuntime } from '@taucad/runtime/worker';
import { blockingBrowserCancellation, delayedBrowserCancellation } from '../../../support/browser-cancellation-kernels';

export const runtime = defineRuntime({
  kernels: [replicad({ wasm: 'single' }), delayedBrowserCancellation(), blockingBrowserCancellation()],
  bundlers: [esbuild()],
  middleware: [parameterCache(), geometryCache()],
});
