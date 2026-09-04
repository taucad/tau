/**
 * The desktop runtime definition (work item E5, residual of batch R).
 *
 * This is `apps/ui/app/runtime/ui-runtime.definition.ts`'s recipe with exactly
 * one substitution: `openrscad()` becomes `openrscadNative()`. Same kernel id,
 * same artifacts, byte-parity gated by the plugin's own suite — only the engine
 * changes, and the version string gains its `+native` suffix so a cache can
 * never cross-serve between the two. Every other kernel keeps its WebAssembly
 * build; they run unmodified under Node.
 *
 * The recipe is duplicated rather than imported: ruling D3 forbids the shell
 * from source-importing `apps/ui`, and the shell consumes only that project's
 * *build output*. The one deliberate omission is `observabilityMiddleware`,
 * which lives in `apps/ui` and is browser-shaped egress — telemetry stays
 * renderer-side for the POC (risk E-R6).
 */

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
import { geometryCache, gltfEdgeDetection, parameterCache, parameterFileResolver } from '@taucad/middleware';
import { opencascade } from '@taucad/opencascade';
import { openrscadKernel } from '@taucad/openrscad';
import { openrscadNativeKernel } from '@taucad/openrscad-native';
import { picogk } from '@taucad/picogk';
import { replicad } from '@taucad/replicad';
import { rhino } from '@taucad/rhino';
import { build123dKernelOptions } from '#tau/build123d-resources.js';
import { picogkKernelOptions } from '#tau/picogk-resources.js';

/**
 * The single OpenRSCAD kernel-plugin instance this recipe serves.
 *
 * Exported because it is also the shell's `+native` witness: the kernel utility
 * resolves *this* binding to log which engine it actually serves. One object,
 * one truth — swap it to `openrscadKernel()` and the served kernel and the
 * logged version change together, which is the property that makes the smoke
 * test's assertion mean something.
 */
export const desktopOpenrscadKernel = process.arch === 'arm64' ? openrscadNativeKernel() : openrscadKernel();

/** Native in the Apple Silicon release; Wasm remains the development fallback on other hosts. */
export const desktopAssimpBackend = process.arch === 'arm64' ? 'native' : 'wasm';

/** Configuration the renderer supplies when it opens a kernel client. */
export const desktopRuntimeConfigSchema = z.object({
  tauApiUrl: z.url(),
  tauWebSocketUrl: z.url(),
});

type DesktopRuntimeOptions = {
  readonly withSourceMapping?: boolean;
};

/* The config schema stays even though no plugin reads it any more: the
 * renderer's kernel preset supplies `{ tauApiUrl, tauWebSocketUrl }`, and
 * dropping the schema would make that a type error in `apps/ui`. The values
 * were only ever consumed by the Zoo kernel and the observability middleware,
 * both of which are deferred on desktop. */
const createDesktopRuntimeOptions = (options: DesktopRuntimeOptions = {}) => ({
  plugins: [
    esbuild(),
    opencascade(),
    jscad(),
    manifold(),
    gltf(),
    brep(),
    rhino(),
    image(),
    assimp({ preset: 'all', transcoders: { export: { backend: desktopAssimpBackend } } }),
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
  middleware: [parameterFileResolver(), parameterCache(), geometryCache(), gltfEdgeDetection()],
});

const createDesktopRuntime = (options: DesktopRuntimeOptions = {}) =>
  defineRuntime({
    configSchema: desktopRuntimeConfigSchema,
    createRuntime: () => createDesktopRuntimeOptions(options),
  });

export const runtime = createDesktopRuntime();
export const debugRuntime = createDesktopRuntime({ withSourceMapping: true });
