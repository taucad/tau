import { readFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { build123d } from '@taucad/build123d';
import { esbuild } from '@taucad/esbuild';
import { image } from '@taucad/image';
import { jscad } from '@taucad/jscad';
import { manifold } from '@taucad/manifold';
import { gltfEdgeDetection, parameterFileResolver, parameterUnits } from '@taucad/middleware';
import { opencascade } from '@taucad/opencascade';
import { openrscad } from '@taucad/openrscad';
import { loadPicogkKernelOptions, picogk } from '@taucad/picogk';
import { picovoxel } from '@taucad/picovoxel';
import { replicad } from '@taucad/replicad';
import { tscircuit } from '@taucad/tscircuit';
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

const examplePlugins = () => [
  replicad(),
  opencascade(),
  manifold(),
  picovoxel(),
  jscad(),
  openrscad(),
  esbuild(),
  image(),
  ...nativePlugins,
  tscircuit(),
];
const exampleMiddleware = () => [parameterFileResolver(), parameterUnits(), gltfEdgeDetection()];

/** Runtime composition used to generate and verify checked-in example thumbnails. @public */
export const exampleRuntime = defineRuntime({ plugins: examplePlugins(), middleware: exampleMiddleware() });

/** Read the desktop's prepared Build123d payload for this host, as the desktop shell does. */
const loadBuild123dKernelOptions = (resourceRoot: string) => {
  const target = `${process.platform}-${process.arch}`;
  const targetRoot = resolve(resourceRoot, target);
  const manifest = JSON.parse(readFileSync(resolve(targetRoot, 'tau-runtime-manifest.json'), 'utf8')) as {
    readonly target: string;
    readonly pythonRelativePath: string;
    readonly pythonSha256: string;
    readonly workerPath: string;
    readonly workerSha256: string;
    readonly supportFiles: ReadonlyArray<{ readonly path: string; readonly sha256: string }>;
  };
  if (manifest.target !== target) {
    throw new Error(`Build123d resource target mismatch: ${manifest.target}`);
  }
  return {
    pythonExecutable: resolve(targetRoot, manifest.pythonRelativePath),
    workerPath: resolve(targetRoot, manifest.workerPath),
    pythonSha256: manifest.pythonSha256,
    workerSha256: manifest.workerSha256,
    supportFiles: manifest.supportFiles.map(({ path, sha256 }) => ({ path: resolve(targetRoot, path), sha256 })),
  };
};

const build123dResourceRoot = process.env['TAU_BUILD123D_RESOURCE_ROOT'];

/**
 * The example kernels plus Build123d when `TAU_BUILD123D_RESOURCE_ROOT` names the desktop's prepared
 * Python payload: regenerates thumbnails for user projects. @public
 */
export const workspaceRuntime = defineRuntime({
  plugins: [
    ...examplePlugins(),
    ...(build123dResourceRoot
      ? [build123d({ kernels: { default: loadBuild123dKernelOptions(resolve(build123dResourceRoot)) } })]
      : []),
  ],
  middleware: exampleMiddleware(),
});

/** Kernel ids the workspace runtime can evaluate. @public */
export const workspaceKernelIds = new Set(workspaceRuntime.kernels.map((kernel) => kernel.id));

/** Create an isolated Node client rooted at one user project. @public */
export const createWorkspaceRuntimeClient = async (
  projectPath: string,
): Promise<RuntimeClient<typeof workspaceRuntime>> => createNodeClient({ runtime: workspaceRuntime, projectPath });

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
    open(input) {
      const { source } = input;
      if (!('path' in source) || typeof source.path !== 'string') {
        throw new TypeError('The example GeoSpec runtime requires a model file path.');
      }
      const path = assertRootedPath(source.path);
      const isolated = extname(path) === '.cs';
      const root = resolve(projectPath, 'src', isolated ? dirname(path) : '.');
      let document: ReturnType<RuntimeClient<typeof exampleRuntime>['open']> | undefined;
      let closed = false;
      const requireOpen = (): void => {
        if (closed) {
          throw new Error('The example GeoSpec document is closed.');
        }
      };
      return {
        async export(format, request) {
          requireOpen();
          if (format !== 'glb') {
            throw new TypeError('The example GeoSpec runtime exports GLB mesh evidence only.');
          }
          if (root !== activeRoot) {
            client?.terminate();
            client = await createExampleRuntimeClient(root);
            await client.connect();
            activeRoot = root;
          }
          if (!client) {
            throw new Error('Example runtime client was not initialized.');
          }
          requireOpen();
          document ??= client.open({
            ...input,
            source: { path: isolated ? basename(path) : path },
            watch: false,
          });
          return document.export('glb', request);
        },
        close() {
          closed = true;
          document?.close();
        },
      };
    },
  };
};
