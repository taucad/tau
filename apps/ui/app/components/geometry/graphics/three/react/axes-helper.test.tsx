import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest';
import { act } from '@testing-library/react';
import type { WebGLRenderer } from 'three';
import * as ActualThree from 'three';
import { createRoot, extend, useThree } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import { Line2NodeMaterial } from '#components/geometry/graphics/three/materials/line2.material.js';
import { ThreeGraphicsBackendProvider } from '#components/geometry/graphics/three/three-graphics-backend-context.js';

const { dreiLineSpy } = vi.hoisted(() => ({
  dreiLineSpy: vi.fn((_properties: Record<string, unknown>) => null),
}));

vi.mock('@react-three/drei', () => ({
  Line: (properties: Record<string, unknown>) => {
    dreiLineSpy(properties);
    return null;
  },
}));

const line2WebGpuSpy = vi.fn();

vi.mock('three/addons/lines/webgpu/Line2.js', () => ({
  Line2: class Line2Stub extends ActualThree.Object3D {
    public geometry: unknown;

    public material: unknown;

    public constructor(geometry: unknown, material: unknown) {
      super();
      line2WebGpuSpy(geometry, material);
      this.geometry = geometry;
      this.material = material;
    }
  },
}));

/** Minimal renderer stub — avoids instantiating THREE.WebGLRenderer under jsdom. */
function createStubWebGlRenderer(): WebGLRenderer {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;

  return {
    dispose: vi.fn(),
    domElement: canvas,
    render: vi.fn(),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    outputColorSpace: '',
    toneMapping: 0,
    toneMappingExposure: 1,
  } as unknown as WebGLRenderer;
}

describe('AxesHelper', () => {
  beforeAll(() => {
    // `@react-three/fiber` `extend` catalogue typing lags `@types/three` object-module exports (REVISION drift).
    extend(ActualThree as unknown as Parameters<typeof extend>[0]);
  });

  beforeEach(() => {
    dreiLineSpy.mockClear();
    line2WebGpuSpy.mockClear();
  });

  async function mountAxes(backend: 'webgl' | 'webgpu'): Promise<{
    getInteractionCount: () => number;
    unmountScene: () => void;
  }> {
    const stubGl = createStubWebGlRenderer();
    const canvas = stubGl.domElement;

    canvas.style.width = '800px';
    canvas.style.height = '600px';
    document.body.append(canvas);

    const root = createRoot(canvas);
    let rootState: RootState | undefined;

    const CaptureRootState = () => {
      rootState = useThree();
      return null;
    };

    await act(async () => {
      await root.configure({
        camera: new ActualThree.PerspectiveCamera(75, 800 / 600, 0.1, 100_000),
        gl: stubGl,
        size: { height: 600, left: 0, top: 0, width: 800 },
      });

      const { AxesHelper } = await import('#components/geometry/graphics/three/react/axes-helper.js');

      root.render(
        <ThreeGraphicsBackendProvider value={backend}>
          <CaptureRootState />
          <AxesHelper />
        </ThreeGraphicsBackendProvider>,
      );
    });

    return {
      getInteractionCount: () => rootState?.internal.interaction.length ?? 0,
      unmountScene: (): void => {
        act(() => {
          root.unmount();
          canvas.remove();
        });
      },
    };
  }

  it('does not mount Drei `<Line>` when the graphics backend is WebGPU', async () => {
    const harness = await mountAxes('webgpu');

    expect(dreiLineSpy).not.toHaveBeenCalled();
    // Each axis owns one static `Line2WebGpu` mesh and material.
    expect(line2WebGpuSpy).toHaveBeenCalledTimes(3);
    expect(line2WebGpuSpy.mock.calls.every(([, material]) => material instanceof Line2NodeMaterial)).toBe(true);

    // No materials are shared between axes, preserving independent axis colors.
    const materialCounts = new Map<Line2NodeMaterial, number>();
    for (const [, material] of line2WebGpuSpy.mock.calls) {
      const typedMaterial = material as Line2NodeMaterial;
      materialCounts.set(typedMaterial, (materialCounts.get(typedMaterial) ?? 0) + 1);
    }
    expect(materialCounts.size).toBe(3);
    expect([...materialCounts.values()].every((count) => count === 1)).toBe(true);

    harness.unmountScene();
  });

  it('mounts Drei `<Line>` exactly once per axis on WebGL', async () => {
    const harness = await mountAxes('webgl');

    expect(dreiLineSpy).toHaveBeenCalledTimes(3);
    expect(line2WebGpuSpy).not.toHaveBeenCalled();

    harness.unmountScene();
  });

  it.each(['webgl', 'webgpu'] as const)(
    'does not register decorative axes for pointer interaction on %s',
    async (backend) => {
      const harness = await mountAxes(backend);

      expect(harness.getInteractionCount()).toBe(0);

      harness.unmountScene();
    },
  );

  /**
   * Drei `<Line>` defaults its underlying `LineMaterial.transparent` to `false` (it is
   * only flipped to `true` when 4-channel `vertexColors` are supplied, which axes do not
   * use). Without an explicit `transparent: true` prop, `THREE.WebGLRenderer` skips
   * `gl.BLEND` and writes the opaque source color, dropping `opacity` silently — the
   * dual-stack regression that surfaced as WebGL axes appearing brighter/more saturated
   * than the WebGPU `Line2NodeMaterial` path which always sets `transparent: true`.
   */
  it('passes `transparent: true` to every Drei `<Line>` on WebGL so opacity blends', async () => {
    const harness = await mountAxes('webgl');

    expect(dreiLineSpy).toHaveBeenCalledTimes(3);
    expect(dreiLineSpy.mock.calls.every(([properties]) => properties['transparent'] === true)).toBe(true);

    harness.unmountScene();
  });
});
