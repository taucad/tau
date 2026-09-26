import { useLayoutEffect } from 'react';
import type { RenderFrame } from '@taucad/spatial';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeGlb } from '@taucad/geometry-core';
import type { GlbMaterial } from '@taucad/geometry-core';
import { GLTFLoader } from 'three/addons';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { Raycaster, Vector3 } from 'three';
import type { BufferAttribute, Intersection, Mesh, Object3D } from 'three';
import * as bvhRaycast from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import * as sectionTopology from '#components/geometry/graphics/three/utils/section-surface-topology.js';

const mocks = vi.hoisted(() => {
  const sceneBounds = { min: [-20, -10, -5], max: [20, 10, 5] };
  return {
    camera: { name: 'perspective' },
    cameraRig: {
      actorRef: {
        getSnapshot: () => ({ context: { view: { bounds: sceneBounds } } }),
        send: vi.fn(),
      },
      perspectiveCamera: { name: 'perspective', coordinateSystem: undefined, updateProjectionMatrix: vi.fn() },
      orthographicCamera: { name: 'orthographic', coordinateSystem: undefined, updateProjectionMatrix: vi.fn() },
    },
    graphicsActor: {
      send: vi.fn(),
      getSnapshot: () => ({
        context: {
          modelPointerClickSuppressionReasons: [],
          suppressNextModelPointerClick: false,
          viewerHoverSuppressionReasons: [] as string[],
        },
      }),
    },
    gl: Object.create(null) as { compileAsync?: ReturnType<typeof vi.fn>; coordinateSystem?: number },
    frameCallback: undefined as (() => void) | undefined,
    invalidate: vi.fn(),
    modelUnit: {
      focusedComponentId: undefined as string | undefined,
      hiddenComponentIds: [],
      hoveredComponentId: undefined,
      isolatedComponentIds: [],
      manifest: undefined,
      opacityByComponentId: {},
      selectedComponentIds: [],
    },
    renderFrame: {
      anchorFrameId: 'tau:root',
      originMeters: [0, 0, 0] as [number, number, number],
      metersPerRenderUnit: 1,
    },
    sectionView: { enableMesh: false, isActive: false, plane: undefined },
  };
});

vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: () => void) => {
    mocks.frameCallback = callback;
  },
  useThree: () => ({
    camera: mocks.camera,
    controls: undefined,
    gl: mocks.gl,
    invalidate: mocks.invalidate,
    size: { height: 768, width: 1024 },
  }),
}));

vi.mock('#hooks/use-theme.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Mirrors the production Theme values.
  Theme: { DARK: 'dark', LIGHT: 'light' },
  useTheme: () => ({ theme: 'light' }),
}));

vi.mock('#components/geometry/graphics/three/three-graphics-backend-context.js', () => ({
  useThreeGraphicsBackend: () => 'webgl',
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useCameraRig: () => mocks.cameraRig,
  useGraphics: () => mocks.graphicsActor,
  useGraphicsSelector: () => false,
  useRenderFrame: () => mocks.renderFrame,
  useRenderFrameRetarget: (handler: (frame: RenderFrame) => void) => {
    useLayoutEffect(() => {
      handler(mocks.renderFrame);
    }, [handler, mocks.renderFrame]);
  },
  useModelInteractionRef: () => mocks.graphicsActor,
  useModelInteractionSelector: (selector: (state: { context: Record<string, unknown> }) => unknown) =>
    selector({ context: {} }),
}));

vi.mock('#machines/model-interaction.machine.js', () => ({
  deriveModelInteractionUnitId: ({ geometryHash }: { geometryHash?: string }) => `unit:${geometryHash ?? ''}`,
  getModelInteractionUnitState: () => mocks.modelUnit,
}));

vi.mock('#components/geometry/graphics/three/use-section-view.js', () => ({
  resolveSectionViewRaycastClip: () => undefined,
  useSectionViewFlags: () => mocks.sectionView,
}));

vi.mock('#components/geometry/graphics/three/react/kinematics-viewer.js', () => ({
  useKinematicsViewer: () => () => undefined,
}));

const { GltfMesh } = await import('#components/geometry/graphics/three/react/gltf-mesh.js');

const surfaceMaterial: GlbMaterial = {
  doubleSided: false,
  alphaMode: 'OPAQUE',
  pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1], metallicFactor: 0.1, roughnessFactor: 0.8 },
};

function buildGlb({ lift = 0, indices = [0, 1, 2] } = {}): Uint8Array<ArrayBuffer> {
  return writeGlb({
    nodes: [
      {
        name: 'Part',
        primitives: [
          {
            mode: 4,
            positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, lift]),
            normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
            indices: Uint32Array.from(indices),
            material: surfaceMaterial,
          },
          {
            mode: 1,
            positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, lift]),
            indices: Uint32Array.from([0, 1, 1, 2]),
            material: surfaceMaterial,
          },
        ],
      },
    ],
  });
}

function findSurface(scene: Object3D): Mesh {
  let found: Mesh | undefined;
  scene.traverse((object) => {
    if (!found && object.type === 'Mesh') {
      found = object as Mesh;
    }
  });
  if (!found) {
    throw new Error('Expected a surface mesh.');
  }
  return found;
}

const committedRevisions = (): number[] =>
  mocks.graphicsActor.send.mock.calls
    .map((call) => call[0] as { type: string; revision?: number })
    .filter((event) => event.type === 'gltfPresentationCommitted')
    .map((event) => event.revision ?? -1);

describe('GltfMesh in-place updates', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mocks.graphicsActor.send.mockClear();
    mocks.cameraRig.actorRef.send.mockClear();
    mocks.invalidate.mockClear();
    mocks.frameCallback = undefined;
    mocks.sectionView = { enableMesh: false, isActive: false, plane: undefined };
  });

  it('should present a same-topology result without reparsing it', async () => {
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const view = render(
      <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
    const gltf = (await parseAsync.mock.results[0]?.value) as GLTF;
    const position = findSurface(gltf.scene).geometry.getAttribute('position') as BufferAttribute;
    const primitive = view.container.querySelector('primitive');

    view.rerender(
      <GltfMesh gltfFile={buildGlb({ lift: 5 })} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
    );

    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 2]);
    });
    expect(parseAsync).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector('primitive')).toBe(primitive);
    expect([...(position.array as Float32Array)]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 5]);
  });

  it('should fall back to a full presentation when the topology changes', async () => {
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const view = render(
      <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });

    view.rerender(
      <GltfMesh
        gltfFile={buildGlb({ lift: 5, indices: [0, 2, 1] })}
        geometryHash='b'
        presentationRevision={2}
        enableMatcap={false}
      />,
    );

    await waitFor(() => {
      expect(parseAsync).toHaveBeenCalledTimes(2);
    });
    expect(committedRevisions()).toEqual([1, 2]);
  });

  it('should fall back to a full presentation while a section view is armed (I11)', async () => {
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    vi.spyOn(sectionTopology, 'registerGltfSectionSurfaceSources').mockResolvedValue([]);
    const view = render(
      <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });

    mocks.sectionView = { enableMesh: true, isActive: true, plane: undefined };
    view.rerender(
      <GltfMesh gltfFile={buildGlb({ lift: 5 })} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
    );

    await waitFor(() => {
      expect(parseAsync).toHaveBeenCalledTimes(2);
    });
  });
});

describe('GltfMesh model raycast', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mocks.graphicsActor.send.mockClear();
  });

  it('should skip the model query while a section-view gizmo drag suppresses hover', async () => {
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    render(<GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
    const gltf = (await parseAsync.mock.results[0]?.value) as GLTF;
    const query = vi.spyOn(bvhRaycast, 'raycastFirstVisibleMeshHit');
    const raycaster = new Raycaster(new Vector3(0.25, 0.25, 10), new Vector3(0, 0, -1));
    const intersections: Intersection[] = [];

    gltf.scene.raycast(raycaster, intersections);
    expect(query).toHaveBeenCalledOnce();

    query.mockClear();
    intersections.length = 0;
    const { context } = mocks.graphicsActor.getSnapshot();
    vi.spyOn(mocks.graphicsActor, 'getSnapshot').mockReturnValue({
      context: { ...context, viewerHoverSuppressionReasons: ['sectionViewTransform'] },
    });
    gltf.scene.raycast(raycaster, intersections);

    expect(query).not.toHaveBeenCalled();
    expect(intersections).toEqual([]);
  });
});
