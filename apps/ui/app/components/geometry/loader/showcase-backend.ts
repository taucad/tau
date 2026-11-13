import {
  probeWebGpuSupport,
  resolveGraphicsBackendPreference,
  webGpuFallbackReason,
} from '@taucad/viewer/graphics/graphics-backend';
import { readGraphicsBackendQueryOverride } from '@taucad/ui-core/utils/graphics-backend-override';
import type { ResolvedGraphicsBackend } from '@taucad/viewer/graphics/graphics-settings';

/**
 * The backend a showcase surface starts on. A showcase runs on the node renderer: WebGPU whenever an adapter exists,
 * otherwise Three's WebGL 2 backend; `?graphicsBackend=` overrides the preference. The public viewport keeps its own
 * WebGL baseline; see the graphics policy.
 *
 * @returns The backend, resolved against the page's adapter answer, which answers no adapter after a canvas loss.
 */
export const resolveShowcaseBackend = async (): Promise<ResolvedGraphicsBackend> => {
  const override = readGraphicsBackendQueryOverride();
  const gpuAvailable = await probeWebGpuSupport();
  return resolveGraphicsBackendPreference(override ?? 'webgpu', gpuAvailable);
};

/**
 * Whether a showcase start on `backend` failed because a WebGPU canvas on the page could not present. The showcase
 * renderer runs the viewport's first-frame check and reports such a canvas as a canvas loss, as the viewport does; the
 * surface then starts once more on a fresh canvas (a canvas cannot change its GPU context type), with the backend
 * resolved again, which lands on WebGL.
 *
 * @param backend - The backend the failed start used.
 * @returns Whether to start again on a fresh canvas.
 */
export const isWebGpuCanvasLossFailure = (backend: ResolvedGraphicsBackend): boolean =>
  backend === 'webgpu' && webGpuFallbackReason() === 'canvas-loss';

/**
 * Start a showcase renderer, and when its WebGPU canvas could not present ({@link isWebGpuCanvasLossFailure}), start
 * it once more with the backend resolved again.
 *
 * @param start - Builds a renderer on a canvas of its own making, awaits it, and releases it when it fails.
 * @returns What `start` returned for the start that succeeded.
 */
export const startShowcaseRenderer = async <Started>(
  start: (backend: ResolvedGraphicsBackend) => Promise<Started>,
): Promise<Started> => {
  const backend = await resolveShowcaseBackend();
  try {
    return await start(backend);
  } catch (error) {
    if (!isWebGpuCanvasLossFailure(backend)) {
      throw error;
    }
  }
  return start(await resolveShowcaseBackend());
};
