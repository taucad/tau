// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- stub class + module-export property names mirror three.js's `LineGeometry`/`LineMaterial`/`Line2` spellings */

import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest';
import { Line2NodeMaterial } from '#components/geometry/graphics/three/materials/line2.material.js';

const { lineMaterialSpy, line2WebGlSpy, line2WebGpuSpy } = vi.hoisted(() => ({
  lineMaterialSpy: vi.fn(),
  line2WebGlSpy: vi.fn(),
  line2WebGpuSpy: vi.fn(),
}));

// Stub the three classes the gizmo cube axes factory pulls in from `three/addons`.
// `LineGeometry` is a minimal data carrier (`setPositions` is the only call site), so
// the stub only needs that single instance method. The other two are spied so the test
// can read back what parameters reached the constructors.
vi.mock('three/addons', () => ({
  LineGeometry: class LineGeometryStub {
    public positions: readonly number[];

    public constructor() {
      this.positions = [];
    }

    public setPositions(positions: readonly number[]): void {
      this.positions = positions;
    }
  },
  LineMaterial: class LineMaterialStub {
    public parameters: Record<string, unknown>;

    public constructor(parameters: Record<string, unknown>) {
      lineMaterialSpy(parameters);
      this.parameters = parameters;
    }

    public dispose(): void {
      // No-op stub: mirrors three.js Material#dispose so the gizmo teardown path does not throw.
    }
  },
  Line2: class Line2Stub {
    public geometry: unknown;

    public material: unknown;

    public constructor(geometry: unknown, material: unknown) {
      line2WebGlSpy(geometry, material);
      this.geometry = geometry;
      this.material = material;
    }
  },
}));

vi.mock('three/addons/lines/webgpu/Line2.js', () => ({
  Line2: class Line2WebGpuStub {
    public geometry: unknown;

    public material: unknown;

    public constructor(geometry: unknown, material: unknown) {
      line2WebGpuSpy(geometry, material);
      this.geometry = geometry;
      this.material = material;
    }
  },
}));

describe('createViewportGizmoCubeAxes', () => {
  beforeAll(() => {
    // Jsdom does not implement Canvas 2D — stub the bits the gizmo axis label uses so
    // the factory can complete without throwing while still letting the tests inspect
    // which material constructors fired for each backend branch.
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      clearRect: vi.fn(),
      fillText: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
    })) as unknown as HTMLCanvasElement['getContext'];
  });

  beforeEach(() => {
    lineMaterialSpy.mockClear();
    line2WebGlSpy.mockClear();
    line2WebGpuSpy.mockClear();
  });

  /**
   * Smoking-gun regression: importing `Line2NodeMaterial` from `three/webgpu` (the stock
   * upstream class) routes the gizmo axes through the linear-space GPU blender on the
   * WebGPU `frameBufferTarget`, producing visibly over-saturated lines compared with the
   * WebGL gizmo. The Tau subclass at
   * `#components/geometry/graphics/three/materials/line2.material.js` performs the alpha
   * mix in sRGB space (Divergence 4) and is the correct base class for every line drawn
   * into the viewport canvas. See `docs/policy/graphics-backend-policy.md` CB-3 / S7.
   */
  it('instantiates the Tau Line2NodeMaterial subclass on WebGPU (not the stock three/webgpu class)', async () => {
    const { createViewportGizmoCubeAxes } =
      await import('#components/geometry/graphics/three/controls/viewport-gizmo-cube-axes.js');

    createViewportGizmoCubeAxes({ renderingBackend: 'webgpu' });

    expect(line2WebGpuSpy).toHaveBeenCalledTimes(3);
    expect(line2WebGlSpy).not.toHaveBeenCalled();
    expect(line2WebGpuSpy.mock.calls.every(([, material]) => material instanceof Line2NodeMaterial)).toBe(true);
  });

  /**
   * CB-1 guard: `LineMaterial` defaults `transparent` to `false` (inherits from
   * `ShaderMaterial`), and three.js's `WebGLRenderer` then skips `gl.BLEND` and silently
   * drops the `opacity` uniform. Forgetting `transparent: true` here is the canonical
   * cause of WebGL/WebGPU brightness divergence on alpha-using overlays — fixed for the
   * scene `<AxesHelper>` in `axes-helper.tsx`, and now mirrored for the gizmo cube axes.
   */
  it('passes transparent: true to every WebGL LineMaterial so opacity blends (CB-1)', async () => {
    const { createViewportGizmoCubeAxes } =
      await import('#components/geometry/graphics/three/controls/viewport-gizmo-cube-axes.js');

    createViewportGizmoCubeAxes({ renderingBackend: 'webgl' });

    expect(lineMaterialSpy).toHaveBeenCalledTimes(3);
    expect(line2WebGlSpy).toHaveBeenCalledTimes(3);
    expect(line2WebGpuSpy).not.toHaveBeenCalled();
    expect(lineMaterialSpy.mock.calls.every(([parameters]) => parameters['transparent'] === true)).toBe(true);
  });
});
