import { esbuild } from '@taucad/esbuild';
import { middleware } from '@taucad/middleware';
import { replicad } from '@taucad/replicad';
import { defineRuntime } from '@taucad/runtime/worker';
import { blockingBrowserCancellation, delayedBrowserCancellation } from '../../../support/browser-cancellation-kernels';

export const runtime = defineRuntime({
  plugins: [replicad({ kernels: { default: { wasm: 'single' } } }), esbuild(), middleware({ preset: 'cache' })],
  kernels: [delayedBrowserCancellation(), blockingBrowserCancellation()],
});
