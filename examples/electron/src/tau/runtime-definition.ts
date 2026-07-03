import { defineRuntime } from '@taucad/runtime/worker';
import { openscad } from '@taucad/openscad/kernel';
import { geometryCache } from '@taucad/runtime/middleware/geometry-cache';
import { parameterCache } from '@taucad/runtime/middleware/parameter-cache';

export const runtime = defineRuntime({
  kernels: [openscad()],
  middleware: [parameterCache(), geometryCache()],
});
