import {
  isGraphicsContextUnavailableError,
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
 * The failure of the showcase start that found no WebGL 2 context. A browser that gives none (hardware acceleration
 * off, a blocklisted GPU) gives none for the rest of the page, so later starts reject with it at once instead of
 * opening another canvas.
 */
let contextUnavailable: Error | undefined;

/**
 * Start a showcase renderer, and when its WebGPU canvas could not present ({@link isWebGpuCanvasLossFailure}), start
 * it once more with the backend resolved again. Once a start found no WebGL 2 context
 * (`GraphicsContextUnavailableError`), every later start on the page rejects with that failure without starting.
 *
 * @param start - Builds a renderer on a canvas of its own making, awaits it, and releases it when it fails.
 * @returns What `start` returned for the start that succeeded.
 */
export const startShowcaseRenderer = async <Started>(
  start: (backend: ResolvedGraphicsBackend) => Promise<Started>,
): Promise<Started> => {
  if (contextUnavailable !== undefined) {
    throw contextUnavailable;
  }
  const remembered = async (backend: ResolvedGraphicsBackend): Promise<Started> => {
    try {
      return await start(backend);
    } catch (error) {
      if (isGraphicsContextUnavailableError(error)) {
        contextUnavailable = error;
      }
      throw error;
    }
  };
  const backend = await resolveShowcaseBackend();
  try {
    return await remembered(backend);
  } catch (error) {
    if (!isWebGpuCanvasLossFailure(backend)) {
      throw error;
    }
  }
  return remembered(await resolveShowcaseBackend());
};

/** Forget a remembered missing WebGL 2 context, so a test starts from a fresh page. */
export const resetShowcaseContextAvailability = (): void => {
  contextUnavailable = undefined;
};
