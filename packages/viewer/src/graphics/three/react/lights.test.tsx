import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { useDeferredValue, useLayoutEffect, useMemo } from 'react';
import type * as ReactModule from 'react';
import { CubeTexture, REVISION, PerspectiveCamera, Scene, Texture, WebGLRenderTarget } from 'three';
import type * as ThreeModule from 'three';
import type { RenderTarget, WebGLRenderer } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type * as ThreeGpuModule from 'three/webgpu';
import { useFrame } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import { mock } from 'vitest-mock-extended';
import { Lights } from '#graphics/three/react/lights.jsx';
import { applyLightingForCamera } from '#graphics/three/utils/lights.utils.js';
import type * as LightingUtils from '#graphics/three/utils/lights.utils.js';
import type * as ViewerEnvironmentModule from '#environment/viewer-environment.jsx';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  cubeDispose: vi.fn(),
  webglPrefilter: vi.fn(),
  webgpuPrefilter: vi.fn(),
  generatorDispose: vi.fn(),
  environmentResolution: vi.fn(),
  useTheme: vi.fn((): { theme: 'light' | 'dark' } => ({ theme: 'light' })),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactModule>();
  return { ...actual, useDeferredValue: vi.fn(actual.useDeferredValue) };
});

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof ThreeModule>();
  return {
    ...actual,
    CubeCamera: class {
      // oxlint-disable-next-line typescript/parameter-properties -- erasableSyntaxOnly forbids constructor parameter properties.
      private readonly target: RenderTarget;
      public constructor(_near: number, _far: number, target: RenderTarget) {
        this.target = target;
      }
      public update(): void {
        mocks.capture(this.target.texture);
      }
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Match Three's discriminator or constructor name.
    PMREMGenerator: class {
      public fromCubemap = mocks.webglPrefilter;
      public dispose = mocks.generatorDispose;
    },
  };
});

vi.mock('three/webgpu', async (importOriginal) => {
  const actual = await importOriginal<typeof ThreeGpuModule>();
  return {
    ...actual,
    CubeRenderTarget: class extends actual.CubeRenderTarget {
      public constructor(size: number, options: ThreeModule.RenderTargetOptions) {
        super(size, options);
        mocks.environmentResolution(size);
        this.addEventListener('dispose', mocks.cubeDispose);
      }
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Match Three's discriminator or constructor name.
    PMREMGenerator: class {
      public fromCubemap = mocks.webgpuPrefilter;
      public dispose = mocks.generatorDispose;
    },
  };
});

const scene = new Scene();
const camera = new PerspectiveCamera();
const invalidate = vi.fn();
let renderer: WebGLRenderer | WebGPURenderer;
let targets: RenderTarget[];

vi.mock('@react-three/fiber', () => ({
  createPortal: (children: React.ReactNode) => <div data-testid='environment'>{children}</div>,
  useThree: () => ({ camera, scene, gl: renderer, invalidate }),
  useFrame: vi.fn(),
}));

vi.mock('@react-three/drei', () => ({
  Environment({ children, resolution }: { readonly children: React.ReactNode; readonly resolution?: number }) {
    mocks.environmentResolution(resolution);
    const source = useMemo(() => new CubeTexture(), []);
    // Mirrors installed Drei 10.7.7's children-dependent capture and scene assignment.
    useLayoutEffect(() => {
      mocks.capture(source);
      const previous = scene.environment;
      scene.environment = source;
      return () => {
        scene.environment = previous;
      };
    }, [children, source]);
    return <div data-testid='environment'>{children}</div>;
  },
  Lightformer: ({ intensity }: { readonly intensity: number }) => (
    <div data-testid='lightformer' data-intensity={intensity} />
  ),
}));

vi.mock('#environment/viewer-environment.jsx', async (importOriginal) => {
  const actual = await importOriginal<typeof ViewerEnvironmentModule>();
  return {
    ...actual,
    useViewerEnvironment: () => ({ ...actual.defaultViewerEnvironment, colorScheme: mocks.useTheme().theme }),
  };
});

vi.mock('#graphics/three/utils/lights.utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof LightingUtils>();
  return { ...actual, applyLightingForCamera: vi.fn() };
});

describe('Lights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useTheme.mockReturnValue({ theme: 'light' });
    renderer = mock<WebGLRenderer>({ toneMappingExposure: 1 });
    scene.environment = null;
    targets = [];
    const prefilter = (_source: CubeTexture, supplied?: RenderTarget): RenderTarget => {
      const target = supplied ?? new WebGLRenderTarget();
      vi.spyOn(target, 'dispose');
      targets.push(target);
      return target;
    };
    mocks.webglPrefilter.mockImplementation(prefilter);
    mocks.webgpuPrefilter.mockImplementation(prefilter);
  });

  afterEach(cleanup);

  it('uses the calibrated room and display energy by default', () => {
    render(<Lights />);
    expect(screen.getAllByTestId('environment')).toHaveLength(1);
    expect(screen.queryByTestId('lightformer')).toBeNull();
    expect(renderer.toneMappingExposure).toBe(1);
    vi.mocked(useFrame).mock.calls.at(-1)?.[0](mock<RootState>(), 0);
    expect(vi.mocked(applyLightingForCamera).mock.calls.at(-1)?.[0].config).toMatchObject({
      ambientIntensity: 0.1,
      headlampIntensity: 1.5,
      environmentIntensity: 1,
    });
  });

  it('should reuse one lighting configuration across frames while its inputs are unchanged', () => {
    render(<Lights sceneRadius={3} />);
    const frame = vi.mocked(useFrame).mock.calls.at(-1)?.[0];
    frame?.(mock<RootState>(), 0);
    frame?.(mock<RootState>(), 0);

    const [first, second] = vi.mocked(applyLightingForCamera).mock.calls.map(([options]) => options.config);
    expect(second).toBe(first);
    expect(first).toMatchObject({ sceneRadius: 3 });
  });

  it('should defer the five-panel studio environment and omit it in MatCap mode', () => {
    const view = render(<Lights settings={{ environment: 'studio' }} />);
    expect(useDeferredValue).toHaveBeenCalled();
    expect(screen.getAllByTestId('environment')).toHaveLength(1);
    expect(screen.getAllByTestId('lightformer')).toHaveLength(5);
    view.rerender(<Lights settings={{ environment: 'studio' }} enableMatcap />);
    expect(screen.queryByTestId('environment')).toBeNull();
  });

  it.each(['light', 'dark'] as const)('should preserve camera-relative lighting and theme factors for %s', (theme) => {
    mocks.useTheme.mockReturnValue({ theme });
    render(<Lights upDirection='x' sceneRadius={3} />);
    const callback = vi.mocked(useFrame).mock.calls.at(-1)?.[0];
    callback?.(mock<RootState>(), 0);
    const lighting = vi.mocked(applyLightingForCamera).mock.calls.at(-1)?.[0];
    expect(lighting?.scene).toBe(scene);
    expect(lighting?.camera).toBe(camera);
    expect(lighting?.config).toMatchObject({
      upDirection: 'x',
      sceneRadius: 3,
      themeIntensityScale: 1,
      themeAmbientBoost: theme === 'dark' ? 1.15 : 1,
    });
  });

  it.each(['studio', 'room', 'white'] as const)(
    'should retain the %s environment when only display and direct-light factors change',
    (environment) => {
      const view = render(<Lights settings={{ environment }} />);
      expect(mocks.capture).toHaveBeenCalledTimes(1);
      view.rerender(
        <Lights
          settings={{
            environment,
            exposure: 0.8,
            ambientIntensity: 0.7,
            headlampIntensity: 3,
            environmentIntensity: 1,
          }}
        />,
      );
      expect(renderer.toneMappingExposure).toBe(0.8);
      expect(mocks.capture).toHaveBeenCalledTimes(1);
      expect(mocks.webglPrefilter).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['webgl', 'webgpu'] as const)(
    'should own the filtered %s environment and dispose replaced outputs without disposing borrowed textures',
    (backend) => {
      if (backend === 'webgpu') {
        renderer = mock<WebGPURenderer>({
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Match Three's discriminator or constructor name.
          isWebGPURenderer: true,
          toneMappingExposure: 1,
          xr: mock<WebGPURenderer['xr']>({ enabled: false }),
        });
      }
      const previous = new Texture();
      const previousDispose = vi.spyOn(previous, 'dispose');
      scene.environment = previous;
      const view = render(<Lights settings={{ environment: 'studio' }} />);
      const prefilter = backend === 'webgl' ? mocks.webglPrefilter : mocks.webgpuPrefilter;
      expect(prefilter).toHaveBeenCalledTimes(1);
      expect(scene.environment).toBe(targets[0]?.texture);
      const source = prefilter.mock.calls[0]?.[0] as CubeTexture;
      const sourceDispose = vi.spyOn(source, 'dispose');
      view.rerender(<Lights settings={{ environment: 'studio', keyIntensity: 32 }} />);
      expect(prefilter).toHaveBeenCalledTimes(2);
      expect(scene.environment).toBe(targets[1]?.texture);
      expect(targets[0]?.dispose).toHaveBeenCalledTimes(1);
      view.unmount();
      expect(scene.environment).toBe(previous);
      expect(targets[1]?.dispose).toHaveBeenCalledTimes(1);
      expect(mocks.generatorDispose).toHaveBeenCalledTimes(2);
      if (backend === 'webgpu') {
        expect(mocks.cubeDispose).toHaveBeenCalledTimes(2);
        expect(sourceDispose).not.toHaveBeenCalled();
      } else {
        expect(sourceDispose).not.toHaveBeenCalled();
      }
      expect(previousDispose).not.toHaveBeenCalled();
    },
  );

  it('should prefilter node lighting into a depth-free target at the requested resolution', () => {
    renderer = mock<WebGPURenderer>({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Match Three's discriminator or constructor name.
      isWebGPURenderer: true,
      toneMappingExposure: 1,
      xr: mock<WebGPURenderer['xr']>({ enabled: false }),
    });
    render(<Lights settings={{ environment: 'room' }} />);
    expect(mocks.webgpuPrefilter).toHaveBeenCalledWith(
      expect.any(CubeTexture),
      expect.objectContaining({
        width: 1536,
        height: 2048,
        depthBuffer: false,
        stencilBuffer: false,
      }),
    );
  });

  it('should release the PMREM working target as soon as each environment is filtered', () => {
    // The generator's ping-pong target is as large as the filtered output (24 MiB at 512 px) and
    // is only needed while filtering.
    const view = render(<Lights settings={{ environment: 'studio' }} />);
    expect(mocks.webglPrefilter).toHaveBeenCalledTimes(1);
    expect(mocks.generatorDispose).toHaveBeenCalledTimes(1);
    expect(scene.environment).toBe(targets[0]?.texture);
    expect(targets[0]?.dispose).not.toHaveBeenCalled();

    view.rerender(<Lights settings={{ environment: 'studio', keyIntensity: 32 }} />);
    expect(mocks.webglPrefilter).toHaveBeenCalledTimes(2);
    expect(mocks.generatorDispose).toHaveBeenCalledTimes(2);
    expect(scene.environment).toBe(targets[1]?.texture);
  });

  it('should release the supplied node target when filtering fails', () => {
    renderer = mock<WebGPURenderer>({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Match Three's discriminator or constructor name.
      isWebGPURenderer: true,
      toneMappingExposure: 1,
      xr: mock<WebGPURenderer['xr']>({ enabled: false }),
    });
    const disposed = vi.fn();
    mocks.webgpuPrefilter.mockImplementation((_source: CubeTexture, target: RenderTarget) => {
      target.addEventListener('dispose', disposed);
      throw new Error('node filter failed');
    });
    expect(() => render(<Lights settings={{ environment: 'studio' }} />)).toThrow('node filter failed');
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(mocks.generatorDispose).toHaveBeenCalledTimes(1);
  });

  it('should restore node renderer state when environment capture fails', () => {
    const target = new WebGLRenderTarget();
    const mrt = mock<ReturnType<WebGPURenderer['getMRT']>>();
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Match Three's discriminator or constructor name.
    const node = mock<WebGPURenderer>({ isWebGPURenderer: true, xr: mock<WebGPURenderer['xr']>({ enabled: true }) });
    node.getMRT.mockReturnValue(mrt);
    node.getRenderTarget.mockReturnValue(target);
    node.getActiveCubeFace.mockReturnValue(2);
    node.getActiveMipmapLevel.mockReturnValue(1);
    renderer = node;
    const previous = new Texture();
    scene.environment = previous;
    mocks.capture.mockImplementationOnce(() => {
      node.xr.enabled = false;
      throw new Error('cube capture failed');
    });
    expect(() => render(<Lights settings={{ environment: 'room' }} />)).toThrow('cube capture failed');
    expect(node.setMRT).toHaveBeenLastCalledWith(mrt);
    expect(node.setRenderTarget).toHaveBeenLastCalledWith(target, 2, 1);
    expect(node.xr.enabled).toBe(true);
    expect(scene.environment).toBe(previous);
    expect(mocks.cubeDispose).toHaveBeenCalledOnce();
    expect(mocks.webgpuPrefilter).not.toHaveBeenCalled();
  });

  it('should release the PMREM working target when filtering throws', () => {
    mocks.webglPrefilter.mockImplementation(() => {
      throw new Error('filter failed');
    });
    expect(() => render(<Lights settings={{ environment: 'studio' }} />)).toThrow('filter failed');
    expect(mocks.generatorDispose).toHaveBeenCalledTimes(1);
  });

  it.each([
    { pointer: 'coarse', resolution: 256 },
    { pointer: 'fine', resolution: 512 },
  ] as const)('should capture a $resolution px environment on a $pointer-pointer device', ({ pointer, resolution }) => {
    vi.spyOn(globalThis, 'matchMedia').mockImplementation((query: string) =>
      mock<MediaQueryList>({
        matches: pointer === 'coarse' && query === '(pointer: coarse)',
        media: query,
      }),
    );
    try {
      renderer = mock<WebGPURenderer>({
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Match Three's discriminator or constructor name.
        isWebGPURenderer: true,
        toneMappingExposure: 1,
        xr: mock<WebGPURenderer['xr']>({ enabled: false }),
      });
      render(<Lights settings={{ environment: 'studio' }} />);
      expect(targets[0]).toMatchObject({ width: 3 * resolution, height: 4 * resolution, depthBuffer: false });
      expect(mocks.environmentResolution).toHaveBeenLastCalledWith(resolution);
    } finally {
      vi.mocked(globalThis.matchMedia).mockRestore();
    }
  });

  it('should restore the previous environment when switching to none', () => {
    const previous = new Texture();
    scene.environment = previous;
    const view = render(<Lights settings={{ environment: 'studio' }} />);
    view.rerender(<Lights settings={{ environment: 'none' }} />);
    expect(screen.queryByTestId('environment')).toBeNull();
    expect(scene.environment).toBe(previous);
    expect(targets[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it('should apply configured exposure on the initial mount', () => {
    render(<Lights settings={{ exposure: 0.85 }} />);
    expect(renderer.toneMappingExposure).toBe(0.85);
  });

  it('should capture HDR studio floor radiance through an enclosure beyond the panels', () => {
    const view = render(<Lights sceneRadius={3} settings={{ environment: 'studio', backgroundIntensity: 4 }} />);
    expect(screen.getByTestId('environment').querySelector('color')).toHaveAttribute('args', '0,0,0');
    expect(screen.getByTestId('environment').querySelector('meshBasicMaterial')).toHaveAttribute('color', '4,4,4');
    expect(screen.getByTestId('environment').querySelector('boxGeometry')).toHaveAttribute('args', '60,60,60');
    view.rerender(<Lights sceneRadius={3} settings={{ environment: 'studio', backgroundIntensity: 8 }} />);
    expect(screen.getByTestId('environment').querySelector('meshBasicMaterial')).toHaveAttribute('color', '8,8,8');
    expect(mocks.capture).toHaveBeenCalledTimes(2);
    expect(mocks.webglPrefilter).toHaveBeenCalledTimes(2);
    expect(targets[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it('should omit the studio enclosure when the radiance floor is zero', () => {
    render(<Lights settings={{ environment: 'studio', backgroundIntensity: 0 }} />);
    expect(screen.getByTestId('environment').querySelector('boxGeometry')).toBeNull();
    expect(screen.getByTestId('environment').querySelector('meshBasicMaterial')).toBeNull();
  });

  it.each([
    { floor: 0, intensities: [64, 1.2, 0.25, 1.5, 8] },
    { floor: 4, intensities: [68, 5.2, 4.25, 5.5, 12] },
    { floor: 8, intensities: [72, 9.2, 8.25, 9.5, 16] },
  ])('should include the $floor radiance floor in every studio card', ({ floor, intensities }) => {
    render(<Lights settings={{ environment: 'studio', backgroundIntensity: floor }} />);
    const cards = screen.getAllByTestId('lightformer');
    expect(cards.map((card) => Number(card.dataset['intensity']))).toEqual(intensities);
  });

  it('should preserve configurable panel contrast above the studio radiance floor', () => {
    render(<Lights settings={{ environment: 'studio', backgroundIntensity: 4, keyIntensity: 12, fillIntensity: 2 }} />);
    const cards = screen.getAllByTestId('lightformer');
    expect(cards.map((card) => Number(card.dataset['intensity']))).toEqual([16, 6.4, 4.5, 7, 20]);
  });

  it.each(['room', 'white'] as const)(
    'should leave the %s environment unchanged by studio background radiance',
    (environment) => {
      const view = render(<Lights settings={{ environment, backgroundIntensity: 0.25 }} />);
      view.rerender(<Lights settings={{ environment, backgroundIntensity: 0.5 }} />);
      expect(screen.getByTestId('environment').querySelector('color')).toBeNull();
      expect(mocks.capture).toHaveBeenCalledTimes(1);
      expect(mocks.webglPrefilter).toHaveBeenCalledTimes(1);
    },
  );
});

// The supplied public target retains r184's CubeUV layout and texture semantics.
it('should guard the upstream PMREM output layout', () => {
  const require = createRequire(import.meta.url);
  const root = resolve(dirname(require.resolve('three')), '..');
  expect(REVISION).toBe('184');
  expect(
    createHash('sha256')
      .update(readFileSync(resolve(root, 'src/renderers/common/extras/PMREMGenerator.js')))
      .digest('hex'),
  ).toBe('60fb90e3fde030868357d0e85889020b6f0e7aa28ebf98b40b77893a73d736c6');
});
