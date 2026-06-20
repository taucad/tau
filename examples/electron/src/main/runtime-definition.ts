import { defineRuntime } from '@taucad/runtime/worker';
import { openscad } from '@taucad/openscad/kernel';

export const runtime = defineRuntime({
  kernels: [openscad()],
});
