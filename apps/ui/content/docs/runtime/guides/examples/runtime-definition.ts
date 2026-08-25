import { defineRuntime } from '@taucad/runtime/worker';
import { esbuild } from '@taucad/esbuild';
import { replicad } from '@taucad/replicad';

export const runtime = defineRuntime({
  plugins: [replicad(), esbuild()],
});
