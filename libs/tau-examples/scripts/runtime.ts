import { basename, dirname, extname, resolve } from 'node:path';
import { build123d } from '@taucad/build123d';
import { esbuild } from '@taucad/esbuild';
import { image } from '@taucad/image';
import { jscad } from '@taucad/jscad';
import { manifold } from '@taucad/manifold';
import { gltfEdgeDetection, parameterFileResolver, parameterUnits } from '@taucad/middleware';
import { defaultPayloadStore, inspectNativeKernels, nativeDeploymentsOf } from '@taucad/native-process-core/store';
import { opencascade } from '@taucad/opencascade';
import { openrscad } from '@taucad/openrscad';
import { picogk } from '@taucad/picogk';
import { picovoxel } from '@taucad/picovoxel';
import { replicad } from '@taucad/replicad';
import { smlib } from '@taucad/smlib';
import { smlibpy } from '@taucad/smlibpy';
import { tscircuit } from '@taucad/tscircuit';
import type { RuntimeClient } from '@taucad/runtime/client';
import { createNodeClient } from '@taucad/runtime/node';
import { readManagedPreparation } from '@taucad/runtime/preparation/node';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import { defineRuntime, resolveRuntimeDefinition } from '@taucad/runtime/worker';
import { assertRootedPath } from '@taucad/runtime/kernel';
import type { GeoSpecRuntimeClient } from 'geospec/model';

const exampleMiddleware = () => [parameterFileResolver(), parameterUnits(), gltfEdgeDetection()];

/*
 * The native kernels are listed like any other: each binds its own sealed closure from this machine's payload store
 * when it initialises (`tau prepare <kernel>`) and refuses with `KERNEL_NOT_PREPARED` until then. Per-host omission:
 * Build123d's and SMLibPy's examples ship no checked-in thumbnails yet, so only the workspace runtime lists them.
 */

/** Runtime composition used to generate and verify checked-in example thumbnails. @public */
export const exampleRuntime = defineRuntime({
  plugins: [
    replicad(),
    opencascade(),
    manifold(),
    picovoxel(),
    smlib(),
    jscad(),
    openrscad(),
    esbuild(),
    image(),
    picogk(),
    tscircuit(),
  ],
  middleware: exampleMiddleware(),
});

/** The example kernels plus SMLibPy and Build123d: regenerates thumbnails for user projects. @public */
export const workspaceRuntime = defineRuntime({
  plugins: [
    replicad(),
    opencascade(),
    manifold(),
    picovoxel(),
    smlib(),
    jscad(),
    openrscad(),
    esbuild(),
    image(),
    smlibpy(),
    build123d(),
    picogk(),
    tscircuit(),
  ],
  middleware: exampleMiddleware(),
});

/**
 * The kernels a runtime can evaluate on this machine: every kernel it lists, less each native kernel whose closure the
 * payload store does not hold sealed. Read from launch indexes only: nothing is downloaded.
 * @param runtime - The runtime.
 * @returns The runnable kernel ids, in list order.
 */
const runnableKernelIds = async (runtime: AnyRuntimeDefinition): Promise<ReadonlySet<string>> => {
  const resolved = await resolveRuntimeDefinition(runtime, undefined);
  const inspection = await inspectNativeKernels({
    deployments: nativeDeploymentsOf(resolved).map(({ deployment }) => deployment),
    store: defaultPayloadStore(),
    managed: readManagedPreparation(process.env),
  });
  const unprepared = new Set(inspection.filter(({ answer }) => answer.status !== 'ready').map(({ kernel }) => kernel));
  return new Set(resolved.kernels.map(({ id }) => id).filter((id) => !unprepared.has(id)));
};

/** Kernel ids the workspace runtime can evaluate on this machine. @public */
export const workspaceKernelIds = await runnableKernelIds(workspaceRuntime);

/** Create an isolated Node client rooted at one user project. @public */
export const createWorkspaceRuntimeClient = async (
  projectPath: string,
): Promise<RuntimeClient<typeof workspaceRuntime>> => createNodeClient({ runtime: workspaceRuntime, projectPath });

/** Kernel ids the example-thumbnail runtime can evaluate on this machine. @public */
export const exampleKernelIds = await runnableKernelIds(exampleRuntime);

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
          // GLB is mesh evidence; STEP is exact evidence, which a 2D drawing gives as its region faces.
          const target = format === 'glb' ? 'glb' : format === 'step' ? 'step' : undefined;
          if (target === undefined) {
            throw new TypeError('The example GeoSpec runtime exports GLB mesh evidence or STEP exact evidence only.');
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
          return document.export(target, request);
        },
        close() {
          closed = true;
          document?.close();
        },
      };
    },
  };
};
