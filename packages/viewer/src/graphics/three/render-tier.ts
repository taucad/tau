/**
 * The render tier: what one canvas incarnation's renderer is, and which costly features the viewer runs on it.
 *
 * A tier is resolved once per renderer (one canvas incarnation) and read by everything that adapts to the rasterizer:
 * the post-processing composition, the lighting environment, the canvas actor (which holds it from `ready` and exposes
 * it once the canvas has `presented`) and the application's test bridge. Nothing else asks the renderer whether it
 * rasterizes on the CPU.
 *
 * Not to be confused with `viewerRenderProfile` (`@taucad/types/constants/viewer-render-profile`), which holds the
 * appearance constants the tier selects between.
 *
 * @module
 */

import { viewerRenderProfile } from '@taucad/types/constants/viewer-render-profile';
import { WebGPUCoordinateSystem } from 'three';
import { webGpuFallbackReason } from '#graphics/graphics-backend.js';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';
import { isCoarsePointerDevice } from '#graphics/three/utils/device-tier.js';
import { rendererUsesSoftwareRasterizer } from '#graphics/three/utils/software-rasterizer.js';

/**
 * The costly features a canvas runs, chosen for its rasterizer.
 *
 * @public
 */
export type RenderTierFeatures = Readonly<{
  /** Ground-truth ambient occlusion in the WebGPU composition (WebGL's composer keeps its own AO). */
  ambientOcclusion: boolean;
  /** The FXAA filter in the WebGPU composition. */
  antialias: boolean;
  /** Rendering the alternate projection's camera ahead of a projection switch. */
  speculativePreparation: boolean;
  /**
   * The lighting environment cubemap's face size, in pixels. Higher is sharper specular reflection. The filtered output
   * is `3·r × 4·r` RGBA16F (24 MiB at 512, 6 MiB at 256) and the source cube adds 12 MiB at 512, so a coarse-pointer
   * device captures at 256. A software rasterizer filters on the CPU, where 512 holds every core for about thirty
   * seconds before the first frame shows: it captures at the profile's software size, with soft reflections.
   */
  environmentResolution: number;
}>;

/**
 * One canvas incarnation's renderer, as the viewer adapts to it.
 *
 * @public
 */
export type RenderTier = Readonly<{
  /** The graphics API the renderer draws with. */
  backend: ResolvedGraphicsBackend;
  /** Whether the GPU rasterizes in hardware or on the CPU (SwiftShader, llvmpipe, a browser fallback adapter). */
  rasterizer: 'hardware' | 'software';
  /** The features this canvas runs. A {@link RenderTierOverride} can set them apart from `rasterizer`. */
  features: RenderTierFeatures;
  /** Why the page draws on WebGL where WebGPU was asked for, or `undefined` when it has not fallen back. */
  fallbackReason: 'canvas-loss' | undefined;
  /** Whether a {@link RenderTierOverride} chose the features. */
  overridden: boolean;
}>;

/**
 * Test-only: choose a canvas's features apart from its adapter. A rasterizer name runs that rasterizer's whole feature
 * set whatever the adapter is (`{ features: 'hardware' }` runs the hardware pipeline on a software GPU in CI). A
 * partial feature set runs those features over the adapter's own, so a row can exercise the hardware composition (AO,
 * FXAA, speculative preparation) on SwiftShader while the environment keeps the size the adapter can filter.
 * `rasterizer` still reports the adapter. An embedder passes it through `ViewerEnvironment.renderTierOverride` only in
 * an undeployed debug build; a production build never sets it.
 *
 * @public
 */
export type RenderTierOverride = Readonly<{ features: RenderTier['rasterizer'] | Partial<RenderTierFeatures> }>;

const {
  default: defaultEnvironmentResolution,
  coarsePointer: coarsePointerEnvironmentResolution,
  softwareRasterizer: softwareRasterizerEnvironmentResolution,
} = viewerRenderProfile.lighting.environmentResolution;

/**
 * The features a rasterizer runs. A software rasterizer draws every pass on the CPU, where the WebGPU AO graph (normal
 * attachment, GTAO, denoise), the speculative alternate-camera render and the FXAA shader (whose compile alone holds
 * SwiftShader's GPU process for over thirty seconds) starve the page's compositor, and a large environment cubemap
 * costs seconds per capture. The classic WebGL composer is unaffected by the first three, which only the node
 * composition reads, on either of the node renderer's backends (WebGPU, or WebGL 2 where WebGPU is unavailable).
 *
 * @param family - The renderer family: `webgpu` for the node renderer on either backend, `webgl` for the classic one
 *   (the material family `useThreeGraphicsBackend` reports).
 * @param rasterizer - The rasterizer whose features run.
 * @returns The features.
 * @public
 */
export const renderTierFeatures = (
  family: ResolvedGraphicsBackend,
  rasterizer: RenderTier['rasterizer'],
): RenderTierFeatures => {
  const reduced = rasterizer === 'software';
  const reducedComposition = reduced && family === 'webgpu';
  return {
    ambientOcclusion: !reducedComposition,
    antialias: !reducedComposition,
    speculativePreparation: !reducedComposition,
    environmentResolution: reduced
      ? softwareRasterizerEnvironmentResolution
      : isCoarsePointerDevice()
        ? coarsePointerEnvironmentResolution
        : defaultEnvironmentResolution,
  };
};

/**
 * The tier of a hardware renderer that has not fallen back, as a test double or an embedder's fixture builds one.
 *
 * @param backend - The renderer's graphics API.
 * @returns The tier.
 * @public
 */
export const hardwareRenderTier = (backend: ResolvedGraphicsBackend): RenderTier => ({
  backend,
  rasterizer: 'hardware',
  features: renderTierFeatures(backend, 'hardware'),
  fallbackReason: undefined,
  overridden: false,
});

/** The features a canvas runs: its adapter's, or the override's rasterizer, with any chosen features laid over. */
const overriddenFeatures = (
  backend: ResolvedGraphicsBackend,
  rasterizer: RenderTier['rasterizer'],
  override: RenderTierOverride | undefined,
): RenderTierFeatures => {
  const chosen = override?.features;
  return typeof chosen === 'object'
    ? { ...renderTierFeatures(backend, rasterizer), ...chosen }
    : renderTierFeatures(backend, chosen ?? rasterizer);
};

/** One tier per renderer: a canvas incarnation resolves its tier once, and every reader sees that one. */
const tiers = new WeakMap<WeakKey, RenderTier>();

/**
 * The render tier of a renderer, resolved on first ask and kept for the renderer's life.
 *
 * @param renderer - The initialized renderer (R3F's `gl`; any value is accepted, since R3F types a WebGPU renderer as
 *   WebGL).
 * @param override - The embedder's test-only override, read on first resolution only.
 * @returns The tier.
 * @public
 */
export const resolveRenderTier = (renderer: unknown, override?: RenderTierOverride): RenderTier => {
  const key = typeof renderer === 'object' && renderer !== null ? renderer : undefined;
  const known = key ? tiers.get(key) : undefined;
  if (known) {
    return known;
  }
  // The node renderer reports its backend's coordinate system: WebGPU's, or WebGL's on its WebGL 2 fallback.
  const backend: ResolvedGraphicsBackend =
    key && 'coordinateSystem' in key && key.coordinateSystem === WebGPUCoordinateSystem ? 'webgpu' : 'webgl';
  const nodeRenderer = key !== undefined && 'isWebGPURenderer' in key && key.isWebGPURenderer === true;
  const rasterizer = rendererUsesSoftwareRasterizer(renderer) ? 'software' : 'hardware';
  const tier: RenderTier = {
    backend,
    rasterizer,
    features: overriddenFeatures(nodeRenderer ? 'webgpu' : backend, rasterizer, override),
    fallbackReason: webGpuFallbackReason(),
    overridden: override !== undefined,
  };
  if (key) {
    tiers.set(key, tier);
  }
  return tier;
};
