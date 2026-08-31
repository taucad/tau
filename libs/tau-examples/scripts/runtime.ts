import { esbuild } from '@taucad/esbuild';
import { image } from '@taucad/image';
import { jscad } from '@taucad/jscad';
import { manifold } from '@taucad/manifold';
import { gltfEdgeDetection, parameterCache, parameterFileResolver } from '@taucad/middleware';
import { opencascade } from '@taucad/opencascade';
import { openrscad } from '@taucad/openrscad';
import { replicad } from '@taucad/replicad';
import { defineRuntime } from '@taucad/runtime/worker';

/** Runtime composition used to generate and verify checked-in example thumbnails. */
export const exampleRuntime = defineRuntime({
  plugins: [replicad(), opencascade(), manifold(), jscad(), openrscad(), esbuild(), image()],
  middleware: [parameterFileResolver(), parameterCache(), gltfEdgeDetection()],
});

/** Kernel ids supported by the example-thumbnail runtime. */
export const exampleKernelIds = new Set(exampleRuntime.kernels.map((kernel) => kernel.id));
