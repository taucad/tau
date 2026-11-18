import { WebGPUCoordinateSystem, WebGLCoordinateSystem } from 'three';
import { viewerRenderProfile } from '@taucad/types/constants/viewer-render-profile';
import { describe, expect, it } from 'vitest';
import { hardwareRenderTier, renderTierFeatures, resolveRenderTier } from '#graphics/three/render-tier.js';

const { environmentResolution } = viewerRenderProfile.lighting;

const webGpuRenderer = (adapterInfo: Record<string, unknown> | undefined): WeakKey => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Three's node renderer flag.
  isWebGPURenderer: true,
  coordinateSystem: WebGPUCoordinateSystem,
  backend: { device: { adapterInfo } },
});

describe('resolveRenderTier', () => {
  it('should run every feature on a hardware WebGPU adapter', () => {
    expect(resolveRenderTier(webGpuRenderer({ vendor: 'nvidia', architecture: 'ampere' }))).toEqual(
      hardwareRenderTier('webgpu'),
    );
  });

  it('should keep a WebGPU canvas on a software adapter beauty-only, with a small environment', () => {
    const tier = resolveRenderTier(webGpuRenderer({ vendor: 'google', architecture: 'swiftshader' }));
    expect(tier).toMatchObject({
      backend: 'webgpu',
      rasterizer: 'software',
      features: {
        ambientOcclusion: false,
        antialias: false,
        speculativePreparation: false,
        environmentResolution: environmentResolution.softwareRasterizer,
      },
      overridden: false,
    });
  });

  it('should keep the node renderer on its WebGL 2 backend beauty-only on a software rasterizer', () => {
    const renderer = {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Three's node renderer flag.
      isWebGPURenderer: true,
      coordinateSystem: WebGLCoordinateSystem,
      backend: {
        gl: {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- WebGL API property.
          getExtension: () => ({ UNMASKED_VENDOR_WEBGL: 1, UNMASKED_RENDERER_WEBGL: 2 }),
          getParameter: (parameter: number) => (parameter === 1 ? 'Mesa' : 'llvmpipe (LLVM 17.0.6, 256 bits)'),
        },
      },
    };
    expect(resolveRenderTier(renderer)).toMatchObject({
      backend: 'webgl',
      rasterizer: 'software',
      features: {
        ambientOcclusion: false,
        antialias: false,
        speculativePreparation: false,
        environmentResolution: environmentResolution.softwareRasterizer,
      },
    });
  });

  it('should keep the classic WebGL composer whole', () => {
    expect(resolveRenderTier({ coordinateSystem: WebGLCoordinateSystem })).toEqual(hardwareRenderTier('webgl'));
  });

  it('should keep every composition feature for a software rasterizer outside the node composition', () => {
    expect(renderTierFeatures('webgl', 'software')).toMatchObject({
      ambientOcclusion: true,
      antialias: true,
      speculativePreparation: true,
      environmentResolution: environmentResolution.softwareRasterizer,
    });
  });

  it('should run the hardware features on a software adapter under the test-only override, and say so', () => {
    const tier = resolveRenderTier(webGpuRenderer({ vendor: 'google', architecture: 'swiftshader' }), {
      features: 'hardware',
    });
    expect(tier).toMatchObject({ rasterizer: 'software', overridden: true });
    expect(tier.features).toEqual(renderTierFeatures('webgpu', 'hardware'));
  });

  it("should lay chosen features over the adapter's own under a partial override", () => {
    const tier = resolveRenderTier(webGpuRenderer({ vendor: 'google', architecture: 'swiftshader' }), {
      features: { ambientOcclusion: true, antialias: true, speculativePreparation: true },
    });
    expect(tier).toMatchObject({ rasterizer: 'software', overridden: true });
    expect(tier.features).toEqual({
      ambientOcclusion: true,
      antialias: true,
      speculativePreparation: true,
      environmentResolution: environmentResolution.softwareRasterizer,
    });
  });

  it('should resolve a renderer once, so every reader of one canvas incarnation sees the same tier', () => {
    const renderer = webGpuRenderer({ vendor: 'google', architecture: 'swiftshader' });
    const first = resolveRenderTier(renderer);
    expect(resolveRenderTier(renderer, { features: 'hardware' })).toBe(first);
    expect(resolveRenderTier(webGpuRenderer({ vendor: 'google', architecture: 'swiftshader' }))).not.toBe(first);
  });
});
