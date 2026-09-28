import { z } from 'zod';
import { defineRuntime } from '@taucad/runtime/worker';
import { assimp } from '@taucad/assimp';
import { build123d } from '@taucad/build123d';
import { brep } from '@taucad/brep';
import { esbuild } from '@taucad/esbuild';
import { gltf } from '@taucad/gltf';
import { image } from '@taucad/image';
import { jscad } from '@taucad/jscad';
import { manifold } from '@taucad/manifold';
import { geometryCache, gltfEdgeDetection, parameterFileResolver, parameterUnits } from '@taucad/middleware';
import { opencascade } from '@taucad/opencascade';
import { openrscadKernel } from '@taucad/openrscad';
import { picogk } from '@taucad/picogk';
import { picovoxel } from '@taucad/picovoxel';
import { replicad } from '@taucad/replicad';
import { rhino } from '@taucad/rhino';
import { slicer } from '@taucad/slicer';

import { build123dKernelOptions } from '#tau/build123d-resources.js';
import { picogkKernelOptions } from '#tau/picogk-resources.js';

export const desktopRuntimeConfigSchema = z.object({
  tauApiUrl: z.url(),
  tauWebSocketUrl: z.url(),
});

export type DesktopRuntimeOptions = {
  readonly withSourceMapping?: boolean;
};

export const desktopOpenrscadKernel = openrscadKernel();
export const desktopAssimpBackend = process.arch === 'arm64' ? 'native' : 'wasm';

/** Construct the complete desktop recipe; native kernels run inside the shared sandbox. */
const createDesktopRuntimeImplementation = (options: DesktopRuntimeOptions = {}) =>
  defineRuntime({
    configSchema: desktopRuntimeConfigSchema,
    createRuntime: () => ({
      plugins: [
        esbuild(),
        opencascade(),
        jscad(),
        manifold(),
        // Kernels run in Node utility processes, where shared WebAssembly memory is available, so 'auto'
        // serves the fast lane multi-threaded.
        picovoxel(),
        gltf(),
        brep(),
        rhino(),
        image(),
        slicer(),
        assimp({
          preset: 'all',
          transcoders: { export: { backend: desktopAssimpBackend } },
        }),
        build123d({ kernels: { default: build123dKernelOptions() } }),
        ...(process.platform === 'darwin' && process.arch === 'arm64'
          ? [picogk({ kernels: { default: picogkKernelOptions() } })]
          : []),
        replicad({
          kernels: {
            default: {
              wasm: 'auto',
              withSourceMapping: options.withSourceMapping === true,
            },
          },
        }),
      ],
      kernels: [desktopOpenrscadKernel],
      middleware: [parameterFileResolver(), parameterUnits(), geometryCache(), gltfEdgeDetection()],
    }),
  });

export const createDesktopRuntime: typeof createDesktopRuntimeImplementation = createDesktopRuntimeImplementation;
