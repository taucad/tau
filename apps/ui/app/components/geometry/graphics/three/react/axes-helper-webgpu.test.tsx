// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest';
import { act } from '@testing-library/react';
import type { WebGLRenderer } from 'three';
import * as ActualThree from 'three';
import { createRoot, extend } from '@react-three/fiber';
import { Line2NodeMaterial } from '#components/geometry/graphics/three/materials/line2.material.js';

const { line2InstanceSpy } = vi.hoisted(() => ({
  line2InstanceSpy: vi.fn(),
}));

/**
 * Stub `Line2WebGpu` that extends real `Object3D` so callers can traverse children and
 * feed the instance to `WebGPURenderer.compileAsync`.
 */
vi.mock('three/addons/lines/webgpu/Line2.js', () => {
  class Line2Stub extends ActualThree.Object3D {
    public geometry: { dispose: () => void };

    public material: { dispose: () => void };

    public constructor(geometry: { dispose: () => void }, material: { dispose: () => void }) {
      super();
      this.geometry = geometry;
      this.material = material;
      line2InstanceSpy(geometry, material, this);
    }
  }
  return { Line2: Line2Stub };
});

type CompileAsyncStub = {
  compileAsync: ReturnType<typeof vi.fn>;
  resolveNext: () => void;
};

/**
 * Stub renderer that mirrors `WebGPURenderer.compileAsync`'s shape so the warm-up
 * useLayoutEffect inside `AxesWebGpuFatLine` can invoke it. The promise stays pending
 * until `resolveNext()` is called, which lets tests assert the warm-up was scheduled
 * and confirm the cancellation flag short-circuits a teardown before resolution.
 */
function createStubWebGpuRenderer(): WebGLRenderer & CompileAsyncStub {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;

  let resolveCurrent: (() => void) | undefined;
  const compileAsync = vi.fn(
    async (_scene: unknown, _camera: unknown): Promise<void> =>
      new Promise<void>((resolve) => {
        resolveCurrent = resolve;
      }),
  );

  return {
    compileAsync,
    dispose: vi.fn(),
    domElement: canvas,
    outputColorSpace: '',
    render: vi.fn(),
    resolveNext: () => {
      resolveCurrent?.();
      resolveCurrent = undefined;
    },
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    toneMapping: 0,
    toneMappingExposure: 1,
  } as unknown as WebGLRenderer & CompileAsyncStub;
}

describe('AxesWebGpuFatLine resource guard', () => {
  beforeAll(() => {
    // `@react-three/fiber` `extend` catalogue typing lags `@types/three` exports.
    extend(ActualThree as unknown as Parameters<typeof extend>[0]);
  });

  beforeEach(() => {
    line2InstanceSpy.mockClear();
  });

  async function mountFatLine(): Promise<{
    gl: ReturnType<typeof createStubWebGpuRenderer>;
    unmountScene: () => void;
  }> {
    const gl = createStubWebGpuRenderer();
    const canvas = gl.domElement;
    canvas.style.width = '800px';
    canvas.style.height = '600px';
    document.body.append(canvas);

    const root = createRoot(canvas);

    const positiveEnd = new ActualThree.Vector3(50_000, 0, 0);

    await act(async () => {
      await root.configure({
        camera: new ActualThree.PerspectiveCamera(75, 800 / 600, 0.1, 100_000),
        gl,
        size: { height: 600, left: 0, top: 0, width: 800 },
      });
      // Late import keeps the mock registration above effective.
      const { AxesWebGpuFatLine } = await import('#components/geometry/graphics/three/react/axes-helper.js');
      root.render(<AxesWebGpuFatLine color='red' opacity={0.6} positiveEnd={positiveEnd} thickness={1.25} />);
    });

    return {
      gl,
      unmountScene: (): void => {
        act(() => {
          root.unmount();
          canvas.remove();
        });
      },
    };
  }

  it('creates one static Line2NodeMaterial + Line2WebGpu instance', async () => {
    const harness = await mountFatLine();

    expect(line2InstanceSpy).toHaveBeenCalledTimes(1);
    const [lineCall] = line2InstanceSpy.mock.calls;
    const material = lineCall![1] as Line2NodeMaterial;
    expect(material).toBeInstanceOf(Line2NodeMaterial);
    expect(material.linewidth).toBe(1.25);

    harness.unmountScene();
  });

  /**
   * Disposal contract: the geometry and material dispose exactly once on unmount.
   */
  it('disposes geometry + material exactly once on unmount', async () => {
    const harness = await mountFatLine();

    const [lineCall] = line2InstanceSpy.mock.calls;
    const geometry = lineCall![0] as { dispose: () => void };
    const material = lineCall![1] as Line2NodeMaterial;

    const geometryDisposeSpy = vi.spyOn(geometry, 'dispose');
    const materialDisposeSpy = vi.spyOn(material, 'dispose');

    expect(geometryDisposeSpy).not.toHaveBeenCalled();
    expect(materialDisposeSpy).not.toHaveBeenCalled();

    harness.unmountScene();

    expect(geometryDisposeSpy).toHaveBeenCalledTimes(1);
    expect(materialDisposeSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * Policy Rule 13 (pipeline pre-warm): the static line pays a one-time
   * `createRenderPipelineAsync` cost on first mount. `compileAsync` is invoked
   * from a `useLayoutEffect` before the first `useFrame` tick so that cost is paid off
   * the critical path. Regression here would re-introduce a cold-cache first-frame skip.
   */
  it('invokes renderer.compileAsync(group, camera) exactly once on mount', async () => {
    const harness = await mountFatLine();

    expect(harness.gl.compileAsync).toHaveBeenCalledTimes(1);
    const firstCall = harness.gl.compileAsync.mock.calls[0] as unknown as readonly [unknown, unknown];
    const warmedScene = firstCall[0];
    const warmedCamera = firstCall[1];
    // The argument is the persistent `THREE.Group` that holds the axis line.
    expect(warmedScene).toBeInstanceOf(ActualThree.Group);
    const meshChildren = (warmedScene as ActualThree.Group).children.filter(
      (child): child is ActualThree.Object3D => child instanceof ActualThree.Object3D,
    );
    expect(meshChildren).toHaveLength(1);
    expect(warmedCamera).toBeInstanceOf(ActualThree.PerspectiveCamera);

    harness.gl.resolveNext();
    harness.unmountScene();
  });
});
