import { esbuild } from '@taucad/esbuild';
import { middleware } from '@taucad/middleware';
import { replicad } from '@taucad/replicad';
import { defineRuntime } from '@taucad/runtime/worker';

export const runtime = defineRuntime({
  // Pin the browser quickstart to the pthread-free WASM runtime variant.
  plugins: [replicad({ kernels: { default: { wasm: 'single' } } }), esbuild(), middleware({ preset: 'cache' })],
});
