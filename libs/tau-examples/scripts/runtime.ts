import { basename, dirname, extname, resolve } from 'node:path';
import { esbuild } from '@taucad/esbuild';
import { image } from '@taucad/image';
import { jscad } from '@taucad/jscad';
import { manifold } from '@taucad/manifold';
import { gltfEdgeDetection, parameterCache, parameterFileResolver, parameterUnits } from '@taucad/middleware';
import { opencascade } from '@taucad/opencascade';
import { openrscad } from '@taucad/openrscad';
import { loadPicogkKernelOptions, picogk } from '@taucad/picogk';
import { replicad } from '@taucad/replicad';
import type { RuntimeClient } from '@taucad/runtime/client';
import { createNodeClient } from '@taucad/runtime/node';
import { defineRuntime } from '@taucad/runtime/worker';
import { assertRootedPath } from '@taucad/runtime/kernel';
import type { GeoSpecRuntimeClient } from 'geospec/model';

const resourceRoot = process.env['TAU_PICOGK_RESOURCE_ROOT'];
const nativePlugins = resourceRoot
  ? [
      picogk({
        kernels: {
          default: loadPicogkKernelOptions({
            resourceRoot: resolve(resourceRoot),
          }),
        },
      }),
    ]
  : [];

/** Runtime composition used to generate and verify checked-in example thumbnails. @public */
export const exampleRuntime = defineRuntime({
  plugins: [replicad(), opencascade(), manifold(), jscad(), openrscad(), esbuild(), image(), ...nativePlugins],
  middleware: [parameterFileResolver(), parameterCache(), parameterUnits(), gltfEdgeDetection()],
});

/** Kernel ids supported by the example-thumbnail runtime. @public */
export const exampleKernelIds = new Set(exampleRuntime.kernels.map((kernel) => kernel.id));

/** Create an isolated Node client for one example-corpus operation. @public */
export const createExampleRuntimeClient = async (projectPath: string): Promise<RuntimeClient<typeof exampleRuntime>> =>
  createNodeClient({ runtime: exampleRuntime, projectPath });

/** Isolate C# compilations while preserving shared imports for bundled examples. @public */
export const createExampleGeoSpecRuntimeClient = async (projectPath: string): Promise<GeoSpecRuntimeClient> => {
  let client: RuntimeClient<typeof exampleRuntime> | undefined;
  let activeRoot: string | undefined;
  return {
    connect: async () => undefined,
    terminate: () => client?.terminate(),
    async export(format, options) {
      if (format !== 'glb') {
        throw new TypeError('The example GeoSpec runtime exports GLB mesh evidence only.');
      }
      const source = options?.source;
      if (!source || !('path' in source) || typeof source.path !== 'string') {
        throw new TypeError('The example GeoSpec runtime requires a model file path.');
      }
      const path = assertRootedPath(source.path);
      const isolated = extname(path) === '.cs';
      const root = resolve(projectPath, 'src', isolated ? dirname(path) : '.');
      if (root !== activeRoot) {
        client?.terminate();
        client = await createExampleRuntimeClient(root);
        await client.connect();
        activeRoot = root;
      }
      if (!client) {
        throw new Error('Example runtime client was not initialized.');
      }
      return client.export(format, {
        ...options,
        source: { path: isolated ? basename(path) : path },
      });
    },
  };
};
