import { useLayoutEffect } from 'react';
import type { RenderFrame } from '@taucad/spatial';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeGlb } from '@taucad/geometry-core';
import type { GlbMaterial } from '@taucad/geometry-core';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { Raycaster, Vector3 } from 'three';
import type { BufferAttribute, Intersection, Mesh, Object3D } from 'three';
import * as gltfEdges from '#components/geometry/graphics/three/materials/gltf-edges.js';
import * as bvhRaycast from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import * as surfaceBatchOwners from '#components/geometry/graphics/three/utils/gltf-surface-batches.js';
import * as sectionTopology from '#components/geometry/graphics/three/utils/section-surface-topology.js';
import { getModelEmphasisSet } from '#components/geometry/graphics/three/materials/model-emphasis-registry.js';
import { getModelComponentOwner } from '#components/geometry/graphics/three/utils/model-component-owner.js';

const mocks = vi.hoisted(() => {
  const sceneBounds = { min: [-20, -10, -5], max: [20, 10, 5] };
  const selectedComponentIds: string[] = [];
  return {
    noHoveredComponentIds: [] as readonly string[],
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
    size: { height: 768, width: 1024 },
    rootScene: { name: 'viewport-lighting-scene' },
    modelUnit: {
      focusedComponentId: undefined as string | undefined,
      hiddenComponentIds: [],
      hoveredComponentId: undefined,
      isolatedComponentIds: [],
      manifest: undefined,
      opacityByComponentId: {},
      selectedComponentIds,
    },
    renderFrame: {
      anchorFrameId: 'tau:root',
      originMeters: [0, 0, 0] as [number, number, number],
      metersPerRenderUnit: 1,
    },
    sectionView: { isActive: false },
  };
});

vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: () => void) => {
    mocks.frameCallback = callback;
  },
  useThree: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = {
      camera: mocks.camera,
      controls: undefined,
      gl: mocks.gl,
      invalidate: mocks.invalidate,
      scene: mocks.rootScene,
      size: mocks.size,
    };
    return selector ? selector(state) : state;
  },
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
  // No kinematics unit hovers a component; one stable list keeps the model's visual state unchanged.
  useKinematicsSelector: () => mocks.noHoveredComponentIds,
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

function buildGlb({ lift = 0, indices = [0, 1, 2], occurrences = 1 } = {}): Uint8Array<ArrayBuffer> {
  const primitives = [
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
  ];
  return writeGlb({
    nodes: Array.from({ length: occurrences }, (_, index) => ({
      name: occurrences === 1 ? 'Part' : `Part${index}`,
      primitives,
    })),
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

/**
 * Wait for these committed revisions, then flush that commit's passive effects (edge tint `invalidate`,
 * retirement). The commit comes from an async parse outside `act`, so without the flush those effects
 * run inside the test's next `rerender`, after its spies were reset: the old intermittent "called once".
 */
async function waitForCommits(revisions: readonly number[]): Promise<void> {
  await waitFor(() => {
    expect(committedRevisions()).toEqual(revisions);
  });
  await act(async () => undefined);
}

describe('GltfMesh in-place updates', () => {
  afterEach(() => {
    mocks.size = { height: 768, width: 1024 };
    cleanup();
    vi.restoreAllMocks();
    mocks.graphicsActor.send.mockClear();
    mocks.cameraRig.actorRef.send.mockClear();
    mocks.invalidate.mockClear();
    mocks.frameCallback = undefined;
    mocks.sectionView = { isActive: false };
    mocks.modelUnit = { ...mocks.modelUnit, selectedComponentIds: [] };
  });

  it('should update edge resolution before the resized frame without parsing or scheduling a later frame', async () => {
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const updateResolution = vi.spyOn(gltfEdges, 'updateLineMaterialResolution');
    const source = buildGlb();
    const view = render(
      <GltfMesh gltfFile={source} geometryHash='resize' presentationRevision={1} enableMatcap={false} />,
    );
    await waitForCommits([1]);
    const requestFrame = vi.spyOn(globalThis, 'requestAnimationFrame');
    updateResolution.mockClear();
    mocks.invalidate.mockClear();
    mocks.size = { width: 640, height: 480 };
    view.rerender(<GltfMesh gltfFile={source} geometryHash='resize' presentationRevision={1} enableMatcap={false} />);
    expect(updateResolution).toHaveBeenCalledOnce();
    expect(updateResolution.mock.calls[0]?.[1].toArray()).toEqual([640, 480]);
    expect(requestFrame).not.toHaveBeenCalled();
    expect(parseAsync).toHaveBeenCalledOnce();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it('should present a same-topology result without reparsing it', async () => {
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const view = render(
      <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitForCommits([1]);
    const gltf = (await parseAsync.mock.results[0]?.value) as GLTF;
    const position = findSurface(gltf.scene).geometry.getAttribute('position') as BufferAttribute;
    const primitive = view.container.querySelector('primitive');

    view.rerender(
      <GltfMesh gltfFile={buildGlb({ lift: 5 })} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
    );

    await waitForCommits([1, 2]);
    expect(parseAsync).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector('primitive')).toBe(primitive);
    expect([...(position.array as Float32Array)]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 5]);
  });

  it('should serialize a slow parse and prepare only the newest waiting revision', async () => {
    const original = GLTFLoader.prototype.parseAsync;
    const gate = Promise.withResolvers<void>();
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementationOnce(async (data, path) => {
      await gate.promise;
      return original.call(new GLTFLoader(), data, path);
    });
    const view = render(
      <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(parseAsync).toHaveBeenCalledTimes(1);
    });
    view.rerender(
      <GltfMesh gltfFile={buildGlb({ lift: 1 })} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
    );
    view.rerender(
      <GltfMesh gltfFile={buildGlb({ lift: 2 })} geometryHash='c' presentationRevision={3} enableMatcap={false} />,
    );
    expect(parseAsync).toHaveBeenCalledTimes(1);
    gate.resolve();
    await waitForCommits([3]);
    expect(parseAsync).toHaveBeenCalledTimes(2);
    mocks.frameCallback?.();
    const measured = mocks.graphicsActor.send.mock.calls
      .map((call) => call[0] as { type: string; telemetry?: unknown })
      .find((event) => event.type === 'gltfPresentationMeasured');
    expect(measured?.telemetry).toMatchObject({
      activeParses: 0,
      activeParseHighWaterMark: 1,
      parsesStarted: 2,
      parsesDiscarded: 1,
    });
  });

  it('should retain one parsed scene across many edits and dispose its live resources once on teardown', async () => {
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const view = render(
      <GltfMesh gltfFile={buildGlb()} geometryHash='0' presentationRevision={1} enableMatcap={false} />,
    );
    await waitForCommits([1]);
    const gltf = (await parseAsync.mock.results[0]?.value) as GLTF;
    const surface = findSurface(gltf.scene);
    const disposeGeometry = vi.spyOn(surface.geometry, 'dispose');
    const material = Array.isArray(surface.material) ? surface.material[0]! : surface.material;
    const disposeMaterial = vi.spyOn(material, 'dispose');
    for (let revision = 2; revision <= 40; revision++) {
      view.rerender(
        <GltfMesh
          gltfFile={buildGlb({ lift: revision })}
          geometryHash={String(revision)}
          presentationRevision={revision}
          enableMatcap={false}
        />,
      );
      // oxlint-disable-next-line no-await-in-loop -- Each revision must be committed before its successor exercises reuse.
      await waitFor(() => {
        expect(committedRevisions().at(-1)).toBe(revision);
      });
    }
    expect(parseAsync).toHaveBeenCalledTimes(1);
    expect(surface.geometry.getAttribute('position').getZ(2)).toBe(40);
    expect(disposeGeometry).not.toHaveBeenCalled();
    expect(disposeMaterial).not.toHaveBeenCalled();
    view.unmount();
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
  });

  it('should dispose the current batches after an in-place edit and late edge expansion', async () => {
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const createBatches = vi.spyOn(surfaceBatchOwners, 'createGltfSurfaceBatches');
    const first = buildGlb({ occurrences: 2 });
    const second = buildGlb({ occurrences: 2, lift: 2 });
    const view = render(
      <GltfMesh gltfFile={first} geometryHash='a' presentationRevision={1} enableMatcap={false} enableLines={false} />,
    );
    await waitForCommits([1]);
    const initial = createBatches.mock.results[0]!.value as surfaceBatchOwners.GltfSurfaceBatches;
    const disposeInitial = vi.spyOn(initial, 'dispose');
    view.rerender(
      <GltfMesh gltfFile={second} geometryHash='b' presentationRevision={2} enableMatcap={false} enableLines={false} />,
    );
    await waitForCommits([1, 2]);
    expect(parseAsync).toHaveBeenCalledTimes(1);
    view.rerender(
      <GltfMesh gltfFile={second} geometryHash='b' presentationRevision={2} enableMatcap={false} enableLines />,
    );
    await waitFor(() => {
      expect(createBatches).toHaveBeenCalledTimes(2);
    });
    const current = createBatches.mock.results[1]!.value as surfaceBatchOwners.GltfSurfaceBatches;
    const disposeCurrent = vi.spyOn(current, 'dispose');
    expect(disposeInitial).toHaveBeenCalledTimes(1);
    expect(initial.group.parent).toBeNull();
    expect(current.group.parent).not.toBeNull();
    view.rerender(
      <GltfMesh gltfFile={second} geometryHash='b' presentationRevision={2} enableMatcap={false} enableLines={false} />,
    );
    view.rerender(
      <GltfMesh gltfFile={second} geometryHash='b' presentationRevision={2} enableMatcap={false} enableLines />,
    );
    expect(createBatches).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(disposeCurrent).toHaveBeenCalledTimes(1);
    expect(disposeInitial).toHaveBeenCalledTimes(1);
    expect(current.group.parent).toBeNull();
  });

  it('should retain every live buffer when replacement metadata is malformed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const view = render(
      <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitForCommits([1]);
    const gltf = (await parseAsync.mock.results[0]!.value) as GLTF;
    const position = findSurface(gltf.scene).geometry.getAttribute('position');
    const before = [...position.array];
    const { version } = position as BufferAttribute;
    view.rerender(
      <GltfMesh
        gltfFile={new Uint8Array([0, 1, 2])}
        geometryHash='invalid'
        presentationRevision={2}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(mocks.graphicsActor.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'gltfPresentationFailed', revision: 2 }),
      );
    });
    expect([...position.array]).toEqual(before);
    expect((position as BufferAttribute).version).toBe(version);
    expect(committedRevisions()).toEqual([1]);
  });

  it('should keep selected emphasis after a material change and a full scene replacement', async () => {
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const firstGlb = buildGlb();
    const view = render(
      <GltfMesh gltfFile={firstGlb} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitForCommits([1]);
    const first = (await parseAsync.mock.results[0]?.value) as GLTF;
    const firstSurface = findSurface(first.scene);
    const componentId = getModelComponentOwner(firstSurface)?.componentId;
    if (!componentId) {
      throw new Error('Expected the presented surface to belong to a component.');
    }
    mocks.modelUnit = { ...mocks.modelUnit, selectedComponentIds: [componentId] };
    view.rerender(<GltfMesh gltfFile={firstGlb} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
    await waitFor(() => {
      expect(getModelEmphasisSet(mocks.rootScene as unknown as Object3D).selected).toEqual([firstSurface]);
    });

    const originalMaterial = firstSurface.material;
    view.rerender(<GltfMesh gltfFile={firstGlb} geometryHash='a' presentationRevision={1} enableMatcap />);
    await waitFor(() => {
      expect(firstSurface.material).not.toBe(originalMaterial);
    });
    expect(parseAsync).toHaveBeenCalledTimes(1);
    expect(getModelEmphasisSet(mocks.rootScene as unknown as Object3D).selected).toEqual([firstSurface]);

    view.rerender(
      <GltfMesh gltfFile={buildGlb({ indices: [0, 2, 1] })} geometryHash='b' presentationRevision={2} enableMatcap />,
    );
    await waitForCommits([1, 2]);
    expect(parseAsync).toHaveBeenCalledTimes(2);
    const second = (await parseAsync.mock.results[1]?.value) as GLTF;
    const secondSurface = findSurface(second.scene);
    expect(secondSurface).not.toBe(firstSurface);
    expect(getModelComponentOwner(secondSurface)?.componentId).toBe(componentId);
    expect(getModelEmphasisSet(mocks.rootScene as unknown as Object3D).selected).toEqual([secondSurface]);
  });

  it('should fall back to a full presentation when the topology changes', async () => {
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const view = render(
      <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitForCommits([1]);

    view.rerender(
      <GltfMesh
        gltfFile={buildGlb({ lift: 5, indices: [0, 2, 1] })}
        geometryHash='b'
        presentationRevision={2}
        enableMatcap={false}
      />,
    );

    await waitForCommits([1, 2]);
    expect(parseAsync).toHaveBeenCalledTimes(2);
  });

  it('should fall back to a full presentation while a section view is armed (I11)', async () => {
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    vi.spyOn(sectionTopology, 'registerGltfSectionSurfaceSources').mockResolvedValue([]);
    const view = render(
      <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    await waitForCommits([1]);

    mocks.sectionView = { isActive: true };
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
    mocks.size = { height: 768, width: 1024 };
    cleanup();
    vi.restoreAllMocks();
    mocks.graphicsActor.send.mockClear();
  });

  it('should skip the model query while a section-view gizmo drag suppresses hover', async () => {
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    render(<GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
    await waitForCommits([1]);
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
