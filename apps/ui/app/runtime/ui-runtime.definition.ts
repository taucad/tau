import { defineRuntime } from '@taucad/runtime/worker';
import { openrscad } from '@taucad/openrscad';
import { assimp } from '@taucad/assimp';
import { brep } from '@taucad/brep';
import { esbuild } from '@taucad/esbuild';
import { gltf } from '@taucad/gltf';
import { image } from '@taucad/image';
import { jscad } from '@taucad/jscad';
import { manifold } from '@taucad/manifold';
import {
  displaySimplification,
  geometryCache,
  gltfEdgeDetection,
  parameterFileResolver,
  parameterUnits,
} from '@taucad/middleware';
import { opencascade } from '@taucad/opencascade';
import { picovoxel } from '@taucad/picovoxel';
import { replicad } from '@taucad/replicad';
import { rhino } from '@taucad/rhino';
import { tscircuit } from '@taucad/tscircuit';
import { slicer } from '@taucad/slicer';
import { zoo } from '@taucad/zoo';
import { zooCloseErrors } from '#cloud/zoo-close-errors.js';
import { runtimeRecycleHeapBytes } from '#lib/device-memory-class.js';
import { observabilityMiddleware } from '#runtime/observability/observability.middleware.js';
import { uiRuntimeConfigSchema } from '#runtime/ui-runtime.schema.js';
import type { UiRuntimeConfig } from '#runtime/ui-runtime.schema.js';

type UiRuntimeOptions = {
  readonly withSourceMapping?: boolean;
};

/*
 * D-RT-04: on a phone the pthread builds reserve a 4 GiB shared memory up front and spawn one worker per core with
 * 8 MiB stacks; measured on the iPhone profile, replicad's costs +124 MB of WASM and +4 workers at load. A
 * memory-constrained device pins the single-threaded builds (OpenCascade already defaults to one); elsewhere 'auto' keeps the pthread build where the
 * worker is cross-origin isolated (a pinned 'multi' fails on plain-http LAN origins without SharedArrayBuffer).
 */
/*
 * D-RT-05 / D-GFX-10: the policy's 2,000,000-triangle preview costs a phone ~230 MiB steady in the viewer, ~420 MiB
 * while re-rendering and over 1 GiB with Section armed. A memory-constrained device previews within 400k triangles
 * (the audit's 300-500k band); exports keep their own budget.
 */
const constrainedPreviewTriangleBudget = 400_000;
/*
 * D-RT-03: WebAssembly memory never shrinks, and iOS kills a tab at roughly 1.5-2 GB across the page, its workers and
 * their heaps. PicoVoxel's own recycle threshold (1.5 GiB) is lowered to the audit's 512 MiB on a phone. The voxel
 * size stays the model's (graphics-backend policy rule 17); only its display mesh is simplified to the budget above.
 * The CAD machine recycles the editor runtime at the same threshold.
 */
const constrainedRecycleHeapBytes = runtimeRecycleHeapBytes(true);

const createUiRuntimeOptions = (config: UiRuntimeConfig, options: UiRuntimeOptions = {}) => ({
  plugins: [
    esbuild({ bundlers: { default: { acquisition: config.acquisition } } }),
    // Single-threaded 'full' build by default on every device.
    opencascade(
      config.memoryConstrained
        ? { kernels: { default: { previewTriangleBudget: constrainedPreviewTriangleBudget } } }
        : undefined,
    ),
    openrscad(),
    jscad(),
    manifold(),
    // Exact exports always run on the serial build; on a phone the fast lane does too, so one runtime stays warm.
    picovoxel(
      config.memoryConstrained
        ? { kernels: { default: { wasm: 'serial', recycleHeapBytes: constrainedRecycleHeapBytes } } }
        : undefined,
    ),
    gltf(),
    brep(),
    rhino(),
    image(),
    slicer(),
    assimp({ preset: 'all' }),
    replicad({
      kernels: {
        default: {
          wasm: config.memoryConstrained ? 'single' : 'auto',
          // D-RT-01: semantic reuse keeps serialized BRep per operation (measured ~10 MB per edit on the iPhone
          // profile) up to its 64 MiB resident bound; a phone renders without it until that bound is qualified there.
          ...(config.memoryConstrained
            ? { computeReuse: false, previewTriangleBudget: constrainedPreviewTriangleBudget }
            : {}),
          withSourceMapping: options.withSourceMapping === true,
        },
      },
    }),
    zoo({
      kernels: {
        default: {
          baseUrl: `${config.tauWebSocketUrl}/v1/kernels/zoo`,
          // Billing copy lives behind the cloud boundary so self-host builds never ship it.
          closeErrors: zooCloseErrors,
        },
      },
    }),
    tscircuit(),
  ],
  middleware: [
    observabilityMiddleware({
      reportUrl: `${config.tauApiUrl}/v1/telemetry/ingest`,
    }),
    parameterFileResolver(),
    parameterUnits(),
    geometryCache(),
    gltfEdgeDetection(),
    displaySimplification(config.memoryConstrained ? { maxTriangles: constrainedPreviewTriangleBudget } : undefined),
  ],
});

const createUiRuntime = (options: UiRuntimeOptions = {}) =>
  defineRuntime({
    configSchema: uiRuntimeConfigSchema,
    createRuntime: (config) => createUiRuntimeOptions(config, options),
  });

export const runtime = createUiRuntime();
export const debugRuntime = createUiRuntime({ withSourceMapping: true });
