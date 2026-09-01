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
 * Stub `Line2WebGpu` that extends real `Object3D` so callers can imperatively mutate
 * `.visible`, traverse children, and feed the instance to `WebGPURenderer.compileAsync`.
 * The geometry/material arguments are forwarded verbatim (not replaced with mocks) so
 * the test can assert material identity across hover toggles.
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

describe('AxesWebGpuFatLine persistence guard', () => {
  beforeAll(() => {
    // `@react-three/fiber` `extend` catalogue typing lags `@types/three` exports.
    extend(ActualThree as unknown as Parameters<typeof extend>[0]);
  });

  beforeEach(() => {
    line2InstanceSpy.mockClear();
  });

  /**
   * Mounts a single `AxesWebGpuFatLine` instance with controlled `isHovered` so the test
   * can drive hover transitions imperatively without simulating raycaster pointer events.
   * Returns the R3F root + the stub renderer so the test can:
   * - rerender with a new `isHovered` prop,
   * - resolve the pending `compileAsync` promise,
   * - unmount to verify dispose semantics.
   */
  async function mountFatLine(initialHover: boolean): Promise<{
    rerender: (hover: boolean) => Promise<void>;
    gl: ReturnType<typeof createStubWebGpuRenderer>;
    unmountScene: () => void;
  }> {
    const gl = createStubWebGpuRenderer();
    const canvas = gl.domElement;
    canvas.style.width = '800px';
    canvas.style.height = '600px';
    document.body.append(canvas);

    const root = createRoot(canvas);

    // Hoist the Vector3 endpoint instances outside `renderJsx` so each rerender passes
    // the SAME reference. The persistent-instance pattern under test relies on
    // `useMemo` reference equality of these props to skip Line2/material recreation —
    // the parent `AxesHelper` enforces this via its own `useMemo`, mirrored here.
    const negativeEnd = new ActualThree.Vector3(-50_000, 0, 0);
    const positiveEnd = new ActualThree.Vector3(50_000, 0, 0);

    const renderJsx = async (hover: boolean): Promise<void> => {
      // Late import keeps the mock registrations above effective.
      const { AxesWebGpuFatLine } = await import('#components/geometry/graphics/three/react/axes-helper.js');

      root.render(
        <AxesWebGpuFatLine
          color='red'
          hoverThickness={2}
          isHovered={hover}
          negativeEnd={negativeEnd}
          opacity={0.6}
          positiveEnd={positiveEnd}
          thickness={1.25}
        />,
      );
    };

    await act(async () => {
      await root.configure({
        camera: new ActualThree.PerspectiveCamera(75, 800 / 600, 0.1, 100_000),
        gl,
        size: { height: 600, left: 0, top: 0, width: 800 },
      });
      await renderJsx(initialHover);
    });

    return {
      gl,
      rerender: async (hover: boolean): Promise<void> => {
        await act(async () => {
          await renderJsx(hover);
        });
      },
      unmountScene: (): void => {
        act(() => {
          root.unmount();
          canvas.remove();
        });
      },
    };
  }

  /**
   * Smoking-gun regression: prior to this fix `AxesWebGpuFatLine` recreated its
   * `Line2NodeMaterial` and both `Line2WebGpu` meshes inside `useMemo` whenever
   * `isHovered` or `linewidth` changed, which dropped the compiled WebGPU render
   * pipeline and forced an async `createRenderPipelineAsync` recompile every hover
   * transition. The persistent-instance pattern eliminates the recompile by mutating
   * `material.linewidth` and `negativeLine.visible` imperatively through
   * `useLayoutEffect`. See `docs/research/webgpu-axes-hover-pipeline-stall.md`.
   */
  it('keeps the Line2NodeMaterial + Line2WebGpu instance identity stable across hover toggles', async () => {
    const harness = await mountFatLine(false);

    // Two persistent meshes per axis (positive + negative half), one shared material.
    expect(line2InstanceSpy).toHaveBeenCalledTimes(2);
    const [positiveCall, negativeCall] = line2InstanceSpy.mock.calls;
    const initialMaterial = positiveCall![1] as Line2NodeMaterial;
    const initialNegativeMaterial = negativeCall![1] as Line2NodeMaterial;
    expect(initialMaterial).toBeInstanceOf(Line2NodeMaterial);
    expect(initialMaterial).toBe(initialNegativeMaterial);

    // Initial linewidth + visibility match the non-hovered configuration.
    expect(initialMaterial.linewidth).toBe(1.25);
    const negativeMeshInitial = negativeCall![2] as ActualThree.Object3D;
    const positiveMeshInitial = positiveCall![2] as ActualThree.Object3D;
    expect(negativeMeshInitial.visible).toBe(false);
    expect(positiveMeshInitial.visible).toBe(true);

    await harness.rerender(true);

    // No additional Line2 construction occurred — the same material/mesh instances
    // are reused with mutated uniforms/visibility.
    expect(line2InstanceSpy).toHaveBeenCalledTimes(2);
    expect(initialMaterial.linewidth).toBe(2);
    expect(negativeMeshInitial.visible).toBe(true);
    expect(positiveMeshInitial.visible).toBe(true);

    await harness.rerender(false);

    expect(line2InstanceSpy).toHaveBeenCalledTimes(2);
    expect(initialMaterial.linewidth).toBe(1.25);
    expect(negativeMeshInitial.visible).toBe(false);

    harness.unmountScene();
  });

  /**
   * Disposal contract: geometries and the shared material dispose exactly once — and
   * only on unmount, never on a hover transition. If the persistence guard above
   * regresses, this test ALSO fires because the per-hover useEffect cleanup would
   * dispose the material mid-life.
   */
  it('disposes geometry + material exactly once on unmount, never on hover', async () => {
    const harness = await mountFatLine(false);

    const [positiveCall, negativeCall] = line2InstanceSpy.mock.calls;
    const positiveGeometry = positiveCall![0] as { dispose: () => void };
    const negativeGeometry = negativeCall![0] as { dispose: () => void };
    const material = positiveCall![1] as Line2NodeMaterial;

    const positiveDisposeSpy = vi.spyOn(positiveGeometry, 'dispose');
    const negativeDisposeSpy = vi.spyOn(negativeGeometry, 'dispose');
    const materialDisposeSpy = vi.spyOn(material, 'dispose');

    await harness.rerender(true);
    await harness.rerender(false);
    await harness.rerender(true);

    expect(positiveDisposeSpy).not.toHaveBeenCalled();
    expect(negativeDisposeSpy).not.toHaveBeenCalled();
    expect(materialDisposeSpy).not.toHaveBeenCalled();

    harness.unmountScene();

    expect(positiveDisposeSpy).toHaveBeenCalledTimes(1);
    expect(negativeDisposeSpy).toHaveBeenCalledTimes(1);
    expect(materialDisposeSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * Policy Rule 13 (pipeline pre-warm): the persistent-instance refactor still pays a
   * one-time `createRenderPipelineAsync` cost on first mount. `compileAsync` is invoked
   * from a `useLayoutEffect` before the first `useFrame` tick so that cost is paid off
   * the critical path. Regression here would re-introduce a cold-cache first-frame skip.
   */
  it('invokes renderer.compileAsync(group, camera) exactly once on mount', async () => {
    const harness = await mountFatLine(false);

    expect(harness.gl.compileAsync).toHaveBeenCalledTimes(1);
    const firstCall = harness.gl.compileAsync.mock.calls[0] as unknown as readonly [unknown, unknown];
    const warmedScene = firstCall[0];
    const warmedCamera = firstCall[1];
    // The argument is the persistent `THREE.Group` that holds both Line2 halves.
    expect(warmedScene).toBeInstanceOf(ActualThree.Group);
    const meshChildren = (warmedScene as ActualThree.Group).children.filter(
      (child): child is ActualThree.Object3D => child instanceof ActualThree.Object3D,
    );
    expect(meshChildren).toHaveLength(2);
    expect(warmedCamera).toBeInstanceOf(ActualThree.PerspectiveCamera);

    // Hover transitions do NOT re-trigger compileAsync — pipelines are already cached.
    await harness.rerender(true);
    await harness.rerender(false);
    expect(harness.gl.compileAsync).toHaveBeenCalledTimes(1);

    harness.gl.resolveNext();
    harness.unmountScene();
  });
});
