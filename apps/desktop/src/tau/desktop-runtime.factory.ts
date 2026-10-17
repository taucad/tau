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
import {
  displaySimplification,
  geometryCache,
  gltfEdgeDetection,
  parameterFileResolver,
  parameterUnits,
} from '@taucad/middleware';
import { opencascade } from '@taucad/opencascade';
import { createOpenrscadKernel } from '@taucad/openrscad';
import { picogk } from '@taucad/picogk';
import { picovoxel } from '@taucad/picovoxel';
import { replicad } from '@taucad/replicad';
import { rhino } from '@taucad/rhino';
import { slicer } from '@taucad/slicer';
import { tscircuit } from '@taucad/tscircuit';
import { zoo } from '@taucad/zoo';

import { awaitNativeKernels, desktopNativeKernels } from '#tau/native-kernels.js';
import type { NativeKernelsFrame } from '#tau/native-kernels-frame.js';
import { desktopZooCloseErrors } from '#tau/zoo-close-errors.js';
import { createDiagnosticsLog } from '#main/diagnostics.js';
import { kernelEngineEvent, kernelEngineRecord } from '#tau/kernel-diagnostics.js';

export const desktopRuntimeConfigSchema = z.object({
  tauApiUrl: z.url(),
  tauWebSocketUrl: z.url(),
});

export type DesktopRuntimeOptions = {
  readonly withSourceMapping?: boolean;
  /**
   * The native composition main posts once the payload store is seeded (W6); default the frame this utility
   * receives. The runtime composes only once it arrives.
   */
  readonly nativeKernels?: () => Promise<NativeKernelsFrame>;
};

let engineIdentityRecorded = false;

/** Load the engine only when OpenRSCAD is selected, and record the bound payload once per utility. */
export const desktopOpenrscadKernel = createOpenrscadKernel({
  loadBackend: async () => {
    const backend = await import('@taulabs/openrscad-engine');
    const directory = process.env['TAU_DESKTOP_LOG_DIR'];
    if (directory && !engineIdentityRecorded) {
      engineIdentityRecorded = true;
      try {
        const definition = await resolveRuntimePluginDefinition('kernel', desktopOpenrscadKernel);
        const engineLog = createDiagnosticsLog({ directory, producer: 'kernel' });
        engineLog.log(
          'info',
          kernelEngineEvent,
          kernelEngineRecord({
            kernelId: desktopOpenrscadKernel.id,
            version: definition.version,
            backend: backend.backend,
            versions: process.versions,
          }),
        );
        /* The record is the e2e's only witness of the engine that loaded: on disk before the kernel is. */
        await engineLog.flush();
      } catch (error) {
        // oxlint-disable-next-line no-console -- diagnostics must not prevent kernel initialization
        console.error('[kernel] engine diagnostics failed', error);
      }
    }
    return backend;
  },
})();
/**
 * The bundler's acquisition profile from `TAU_ACQUISITION`: `locked` refuses every import it would download. Only
 * unset, empty or `open` is `open`, so a value the strict reader refuses never opens the network.
 */
const desktopBundlerAcquisition = (): 'open' | 'locked' => {
  const value = process.env['TAU_ACQUISITION']?.trim() ?? '';
  return value === '' || value === 'open' ? 'open' : 'locked';
};

export const desktopAssimpBackend = process.arch === 'arm64' ? 'native' : 'wasm';

/** Construct the complete desktop recipe; native kernels run inside the shared sandbox. */
const createDesktopRuntimeImplementation = (options: DesktopRuntimeOptions = {}) =>
  defineRuntime({
    configSchema: desktopRuntimeConfigSchema,
    createRuntime: async (config) => {
      const native = desktopNativeKernels(await (options.nativeKernels ?? awaitNativeKernels)());
      return {
        plugins: [
          esbuild(
            desktopBundlerAcquisition() === 'locked' ? { bundlers: { default: { acquisition: 'locked' } } } : undefined,
          ),
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
          ...(native.build123d === undefined ? [] : [build123d({ kernels: { default: native.build123d } })]),
          ...(native.picogk === undefined ? [] : [picogk({ kernels: { default: native.picogk } })]),
          ...(native.unavailable === undefined ? [] : [native.unavailable]),
          replicad({
            kernels: {
              default: {
                wasm: 'auto',
                withSourceMapping: options.withSourceMapping === true,
              },
            },
          }),
          /* Tau's proxy authenticates the upgrade; the kernel utility puts its
           * Zoo-scoped token there (`#tau/zoo-proxy-credential.ts`), never in these
           * options, which feed cache keys and every middleware's dependencies. */
          zoo({
            kernels: {
              default: {
                baseUrl: `${config.tauWebSocketUrl}/v1/kernels/zoo`,
                closeErrors: { ...desktopZooCloseErrors },
              },
            },
          }),
          tscircuit(),
        ],
        kernels: [desktopOpenrscadKernel],
        middleware: [
          parameterFileResolver(),
          parameterUnits(),
          geometryCache(),
          gltfEdgeDetection(),
          displaySimplification(),
        ],
      };
    },
  });

export const createDesktopRuntime: typeof createDesktopRuntimeImplementation = createDesktopRuntimeImplementation;
