import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest';
import { act } from '@testing-library/react';
import type { WebGLRenderer } from 'three';
import * as ActualThree from 'three';
import { createRoot, extend } from '@react-three/fiber';
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
  Line2: class Line2Stub {
    public geometry: { dispose(): void };

    public material: { dispose(): void };

    public constructor(geometry: unknown, material: unknown) {
      line2WebGpuSpy(geometry, material);
      this.geometry = {
        dispose: vi.fn(),
      };
      this.material = {
        dispose: vi.fn(),
      };
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

  async function mountAxes(backend: 'webgl' | 'webgpu'): Promise<{ unmountScene: () => void }> {
    const stubGl = createStubWebGlRenderer();
    const canvas = stubGl.domElement;

    canvas.style.width = '800px';
    canvas.style.height = '600px';
    document.body.append(canvas);

    const root = createRoot(canvas);

    await act(async () => {
      await root.configure({
        camera: new ActualThree.PerspectiveCamera(75, 800 / 600, 0.1, 100_000),
        gl: stubGl,
        size: { height: 600, left: 0, top: 0, width: 800 },
      });

      const { AxesHelper } = await import('#components/geometry/graphics/three/react/axes-helper.js');

      root.render(
        <ThreeGraphicsBackendProvider value={backend}>
          <AxesHelper />
        </ThreeGraphicsBackendProvider>,
      );
    });

    return {
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
    // Each axis owns two persistent `Line2WebGpu` meshes (positive + negative half) that
    // share a single material. Three axes × two halves = six Line2 constructor calls,
    // each receiving the same per-axis Tau `Line2NodeMaterial` instance — the architectural
    // shape that lets hover transitions toggle visibility without rebuilding pipelines.
    expect(line2WebGpuSpy).toHaveBeenCalledTimes(6);
    expect(line2WebGpuSpy.mock.calls.every(([, material]) => material instanceof Line2NodeMaterial)).toBe(true);

    // The two meshes per axis MUST share one material so a single uniform write
    // (`material.linewidth`) covers both halves. We collect the material reference
    // out of the spy and confirm it appears in exactly two consecutive calls.
    const materialCounts = new Map<Line2NodeMaterial, number>();
    for (const [, material] of line2WebGpuSpy.mock.calls) {
      const typedMaterial = material as Line2NodeMaterial;
      materialCounts.set(typedMaterial, (materialCounts.get(typedMaterial) ?? 0) + 1);
    }
    expect(materialCounts.size).toBe(3);
    expect([...materialCounts.values()].every((count) => count === 2)).toBe(true);

    harness.unmountScene();
  });

  it('mounts Drei `<Line>` exactly once per axis on WebGL', async () => {
    const harness = await mountAxes('webgl');

    expect(dreiLineSpy).toHaveBeenCalledTimes(3);
    expect(line2WebGpuSpy).not.toHaveBeenCalled();

    harness.unmountScene();
  });

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
