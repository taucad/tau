import { defineRuntime } from '@taucad/runtime/worker';
import { openrscad } from '@taucad/openrscad/kernel';
import { geometryCache } from '@taucad/runtime/middleware/geometry-cache';
import { parameterCache } from '@taucad/runtime/middleware/parameter-cache';

export const runtime = defineRuntime({
  kernels: [openrscad()],
  middleware: [parameterCache(), geometryCache()],
});
