import { statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { defineRuntime } from '@taucad/runtime/worker';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
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
import { createOpenrscadKernel } from '@taucad/openrscad';
import { picogk } from '@taucad/picogk';
import { picovoxel } from '@taucad/picovoxel';
import { replicad } from '@taucad/replicad';
import { rhino } from '@taucad/rhino';
import { slicer } from '@taucad/slicer';
import { tscircuit } from '@taucad/tscircuit';

import { build123dKernelOptions } from '#tau/build123d-resources.js';
import { picogkKernelOptions } from '#tau/picogk-resources.js';
import { createDiagnosticsLog } from '#main/diagnostics.js';
import { kernelEngineEvent, kernelEngineRecord } from '#tau/kernel-diagnostics.js';

export const desktopRuntimeConfigSchema = z.object({
  tauApiUrl: z.url(),
  tauWebSocketUrl: z.url(),
});

export type DesktopRuntimeOptions = {
  readonly withSourceMapping?: boolean;
};

let engineIdentityRecorded = false;

/** Resolve the immutable app-selected engine pair supplied by trusted main composition. */
const desktopReplicadWasm = (): { wasmUrl: string; wasmBindingsUrl: string } => {
  const resourceRoot = process.env['TAU_REPLICAD_RESOURCE_ROOT'];
  if (!resourceRoot || !isAbsolute(resourceRoot)) {
    throw new Error('The desktop shell did not supply an absolute Replicad resource root.');
  }
  const wasm = join(resourceRoot, 'replicad_single.wasm');
  const bindings = join(resourceRoot, 'replicad_single.mjs');
  for (const path of [wasm, bindings]) {
    try {
      if (!statSync(path).isFile()) {
        throw new Error('Resource is not a file.');
      }
    } catch (cause) {
      throw new Error('The desktop Replicad engine pair is missing from the built UI payload.', { cause });
    }
  }
  return { wasmUrl: pathToFileURL(wasm).href, wasmBindingsUrl: pathToFileURL(bindings).href };
};

/** Load the engine only when OpenRSCAD is selected, and record the bound payload once per utility. */
export const desktopOpenrscadKernel = createOpenrscadKernel({
  loadBackend: async () => {
    const backend = await import('@taulabs/openrscad-engine');
    const directory = process.env['TAU_DESKTOP_LOG_DIR'];
    if (directory && !engineIdentityRecorded) {
      engineIdentityRecorded = true;
      try {
        const definition = await resolveRuntimePluginDefinition('kernel', desktopOpenrscadKernel);
        createDiagnosticsLog({ directory, producer: 'kernel' }).log(
          'info',
          kernelEngineEvent,
          kernelEngineRecord({
            kernelId: desktopOpenrscadKernel.id,
            version: definition.version,
            backend: backend.backend,
            versions: process.versions,
          }),
        );
      } catch (error) {
        // oxlint-disable-next-line no-console -- diagnostics must not prevent kernel initialization
        console.error('[kernel] engine diagnostics failed', error);
      }
    }
    return backend;
  },
})();
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
              wasm: desktopReplicadWasm(),
              withSourceMapping: options.withSourceMapping === true,
            },
          },
        }),
        tscircuit(),
      ],
      kernels: [desktopOpenrscadKernel],
      middleware: [parameterFileResolver(), parameterUnits(), geometryCache(), gltfEdgeDetection()],
    }),
  });

export const createDesktopRuntime: typeof createDesktopRuntimeImplementation = createDesktopRuntimeImplementation;
