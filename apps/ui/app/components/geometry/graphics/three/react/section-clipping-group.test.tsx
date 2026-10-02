import * as React from 'react';
import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import * as ActualThree from 'three';
import { ClippingGroup } from 'three/webgpu';
import type { WebGLRenderer } from 'three';
import { createRoot, extend } from '@react-three/fiber';
import { SectionClippingGroup } from '#components/geometry/graphics/three/react/section-clipping-group.js';
import { ThreeGraphicsBackendProvider } from '#components/geometry/graphics/three/three-graphics-backend-context.js';

const testPlane = new ActualThree.Plane(new ActualThree.Vector3(0, 0, 1), 0);

/** Minimal renderer stub — avoids instantiating THREE.WebGLRenderer under jsdom. */
function createStubWebGlRenderer(): WebGLRenderer {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;

  return {
    dispose: vi.fn(),
    domElement: canvas,
    localClippingEnabled: false,
    render: vi.fn(),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    outputColorSpace: '',
    toneMapping: 0,
    toneMappingExposure: 1,
  } as unknown as WebGLRenderer;
}

describe('SectionClippingGroup', () => {
  beforeAll(() => {
    extend(ActualThree as unknown as Parameters<typeof extend>[0]);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function mountSectionClippingGroup(
    backend: 'webgl' | 'webgpu',
    options: {
      readonly enabled?: boolean;
      readonly enableMesh?: boolean;
      readonly enableLines?: boolean;
    } = {},
  ): Promise<{
    cleanup: () => void;
    gl: WebGLRenderer;
    // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
    innerRef: React.RefObject<ActualThree.Group | null>;
    meshMaterials: ActualThree.MeshStandardMaterial[];
    lineMaterial: ActualThree.LineBasicMaterial;
  }> {
    const enabled = options.enabled ?? true;
    const enableMesh = options.enableMesh ?? true;
    const enableLines = options.enableLines ?? true;

    const stubGl = createStubWebGlRenderer();
    const canvas = stubGl.domElement;
    const innerRef = React.createRef<ActualThree.Group>();

    const boxMat = new ActualThree.MeshStandardMaterial();
    const meshOne = new ActualThree.Mesh(new ActualThree.BoxGeometry(1, 1, 1), boxMat);
    const meshTwo = new ActualThree.Mesh(new ActualThree.BoxGeometry(1, 1, 1), new ActualThree.MeshStandardMaterial());

    const lineGeometry = new ActualThree.BufferGeometry().setFromPoints([
      new ActualThree.Vector3(0, 0, 0),
      new ActualThree.Vector3(1, 1, 1),
    ]);
    const lineMaterial = new ActualThree.LineBasicMaterial();
    const lineSegments = new ActualThree.LineSegments(lineGeometry, lineMaterial);

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

      root.render(
        <ThreeGraphicsBackendProvider value={backend}>
          <SectionClippingGroup
            enableLines={enableLines}
            enableMesh={enableMesh}
            enabled={enabled}
            innerRef={innerRef}
            plane={testPlane}
          >
            <group ref={innerRef}>
              <primitive object={meshOne} />
              <primitive object={meshTwo} />
              <primitive object={lineSegments} />
            </group>
          </SectionClippingGroup>
        </ThreeGraphicsBackendProvider>,
      );
    });

    return {
      cleanup: (): void => {
        act(() => {
          root.unmount();
          canvas.remove();
        });
      },
      gl: stubGl,
      innerRef,
      meshMaterials: [boxMat, meshTwo.material],
      lineMaterial,
    };
  }

  it('wraps content in ClippingGroup on WebGPU and does not mutate mesh clippingPlanes', async () => {
    const { cleanup, innerRef, meshMaterials } = await mountSectionClippingGroup('webgpu');

    expect(innerRef.current?.parent).toBeInstanceOf(ClippingGroup);
    const parent = innerRef.current?.parent as ClippingGroup;
    expect(parent.clippingPlanes[0]).toBe(testPlane);
    expect(parent.enabled).toBe(true);
    expect(parent.clipIntersection).toBe(false);
    expect(parent.clipShadows).toBe(false);

    for (const mat of meshMaterials) {
      expect(mat.clippingPlanes).toBeNull();
    }

    cleanup();
  });

  it('applies clippingPlanes to meshes on WebGL and toggles localClippingEnabled', async () => {
    const { cleanup, gl, meshMaterials, lineMaterial } = await mountSectionClippingGroup('webgl');

    expect(gl.localClippingEnabled).toBe(true);
    for (const mat of meshMaterials) {
      expect(mat.clippingPlanes).toHaveLength(1);
      expect(mat.clippingPlanes![0]).toBe(testPlane);
    }
    expect(lineMaterial.clippingPlanes).toHaveLength(1);

    cleanup();
    expect(gl.localClippingEnabled).toBe(false);
  });

  it('clears clipping when disabled on WebGL', async () => {
    const stubGl = createStubWebGlRenderer();
    const canvas = stubGl.domElement;
    const innerRef = React.createRef<ActualThree.Group>();

    const meshMat = new ActualThree.MeshStandardMaterial();
    const mesh = new ActualThree.Mesh(new ActualThree.BoxGeometry(1, 1, 1), meshMat);

    document.body.append(canvas);

    const root = createRoot(canvas);

    await act(async () => {
      await root.configure({
        camera: new ActualThree.PerspectiveCamera(75, 800 / 600, 0.1, 100_000),
        gl: stubGl,
        size: { height: 600, left: 0, top: 0, width: 800 },
      });

      root.render(
        <ThreeGraphicsBackendProvider value='webgl'>
          <SectionClippingGroup enableLines enableMesh enabled={false} innerRef={innerRef} plane={testPlane}>
            <group ref={innerRef}>
              <primitive object={mesh} />
            </group>
          </SectionClippingGroup>
        </ThreeGraphicsBackendProvider>,
      );
    });

    expect(meshMat.clippingPlanes).toHaveLength(0);
    expect(stubGl.localClippingEnabled).toBe(false);

    act(() => {
      root.unmount();
      canvas.remove();
    });
  });

  it('keeps meshes unclipped but clips lines when enableMesh is false and enableLines is true (WebGL)', async () => {
    const stubGl = createStubWebGlRenderer();
    const canvas = stubGl.domElement;
    const innerRef = React.createRef<ActualThree.Group>();

    const meshMat = new ActualThree.MeshStandardMaterial();
    const mesh = new ActualThree.Mesh(new ActualThree.BoxGeometry(1, 1, 1), meshMat);

    const lineGeometry = new ActualThree.BufferGeometry().setFromPoints([
      new ActualThree.Vector3(0, 0, 0),
      new ActualThree.Vector3(1, 0, 0),
    ]);
    const lineMat = new ActualThree.LineBasicMaterial();
    const lines = new ActualThree.LineSegments(lineGeometry, lineMat);

    document.body.append(canvas);

    const root = createRoot(canvas);

    await act(async () => {
      await root.configure({
        camera: new ActualThree.PerspectiveCamera(75, 800 / 600, 0.1, 100_000),
        gl: stubGl,
        size: { height: 600, left: 0, top: 0, width: 800 },
      });

      root.render(
        <ThreeGraphicsBackendProvider value='webgl'>
          <SectionClippingGroup enableLines enableMesh={false} enabled innerRef={innerRef} plane={testPlane}>
            <group ref={innerRef}>
              <primitive object={mesh} />
              <primitive object={lines} />
            </group>
          </SectionClippingGroup>
        </ThreeGraphicsBackendProvider>,
      );
    });

    expect(meshMat.clippingPlanes).toHaveLength(0);
    expect(lineMat.clippingPlanes).toHaveLength(1);

    act(() => {
      root.unmount();
      canvas.remove();
    });
  });

  it('does not enable localClippingEnabled on a second canvas when the first canvas enables section view (WebGL)', async () => {
    const stubGlA = createStubWebGlRenderer();
    const stubGlB = createStubWebGlRenderer();
    const canvasA = stubGlA.domElement;
    const canvasB = stubGlB.domElement;
    document.body.append(canvasA);
    document.body.append(canvasB);

    const innerRefA = React.createRef<ActualThree.Group>();
    const innerRefB = React.createRef<ActualThree.Group>();

    const meshA = new ActualThree.Mesh(new ActualThree.BoxGeometry(1, 1, 1), new ActualThree.MeshStandardMaterial());
    const meshB = new ActualThree.Mesh(new ActualThree.BoxGeometry(1, 1, 1), new ActualThree.MeshStandardMaterial());

    const rootA = createRoot(canvasA);
    const rootB = createRoot(canvasB);

    await act(async () => {
      await rootA.configure({
        camera: new ActualThree.PerspectiveCamera(75, 800 / 600, 0.1, 100_000),
        gl: stubGlA,
        size: { height: 600, left: 0, top: 0, width: 800 },
      });
      await rootB.configure({
        camera: new ActualThree.PerspectiveCamera(75, 800 / 600, 0.1, 100_000),
        gl: stubGlB,
        size: { height: 600, left: 0, top: 0, width: 800 },
      });

      rootA.render(
        <ThreeGraphicsBackendProvider value='webgl'>
          <SectionClippingGroup enableLines enableMesh enabled innerRef={innerRefA} plane={testPlane}>
            <group ref={innerRefA}>
              <primitive object={meshA} />
            </group>
          </SectionClippingGroup>
        </ThreeGraphicsBackendProvider>,
      );

      rootB.render(
        <ThreeGraphicsBackendProvider value='webgl'>
          <SectionClippingGroup enableLines enableMesh enabled={false} innerRef={innerRefB} plane={testPlane}>
            <group ref={innerRefB}>
              <primitive object={meshB} />
            </group>
          </SectionClippingGroup>
        </ThreeGraphicsBackendProvider>,
      );
    });

    expect(stubGlA.localClippingEnabled).toBe(true);
    expect(stubGlB.localClippingEnabled).toBe(false);
    expect(meshB.material.clippingPlanes).toHaveLength(0);

    act(() => {
      rootA.unmount();
      rootB.unmount();
      canvasA.remove();
      canvasB.remove();
    });
  });
});
