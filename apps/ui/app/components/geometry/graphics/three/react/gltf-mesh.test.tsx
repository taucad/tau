import type { MockInstance } from 'vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  Group,
  Mesh,
  BufferGeometry,
  BufferAttribute,
  MeshBasicMaterial,
  DoubleSide,
  LineBasicMaterial,
  LineSegments,
  Vector2,
  Vector3,
  Raycaster,
  Plane,
} from 'three';
import type { Material, Object3D } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import {
  annotateSceneComponents,
  applyGltfEdgeThemeColor,
  applyModelComponentVisualStateToScene,
  collectModelPickableSurfaceMeshes,
  hasModelHitBlockingSceneUiHit,
  probeGltfScene,
  resolveModelComponentHitFromRay,
  resolveModelContextMenuAction,
  resolveComponentVisualState,
  resolveModelPointerClickAction,
  resolveModelPointerClickDispatches,
  resolveModelPointerMissedAction,
  resolveViewerHoverUpdate,
  shouldConsumeGuardedModelPointerClick,
} from '#components/geometry/graphics/three/react/gltf-mesh.js';
import { sceneTag } from '#components/geometry/graphics/three/utils/scene-tags.js';
import {
  getModelComponentOwner,
  setModelComponentOwner,
} from '#components/geometry/graphics/three/utils/model-component-owner.js';
import { applyFatLineSegments } from '#components/geometry/graphics/three/materials/gltf-edges.js';
import {
  applyModelMaterialAppearance,
  getOrCaptureModelMaterialAppearance,
} from '#components/geometry/graphics/three/materials/model-component-appearance.js';
import {
  gltfEdgeColorDarkMode,
  gltfEdgeColorLightMode,
} from '#components/geometry/graphics/three/overlay-colors.constants.js';
import type { GeometryComponentManifest } from '@taucad/types';

const firstComponentId = 'component:first';
const secondComponentId = 'component:second';
const unitId = 'unit:main';

const buildMeshWithPositions = (positions: readonly number[]): Mesh => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return new Mesh(geometry, new MeshBasicMaterial());
};

const buildLineSegmentsWithPositions = (positions: readonly number[]): LineSegments => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return new LineSegments(geometry, new LineBasicMaterial());
};

const assignComponentOwner = (object: Group | Mesh | LineSegments, componentId: string): void => {
  setModelComponentOwner(object, { unitId, componentId });
};

const getOnlyFatLineMaterial = (scene: Group): Material => {
  let material: Material | undefined;
  scene.traverse((object) => {
    if (object.type !== 'LineSegments2') {
      return;
    }
    material = (object as unknown as { material: Material }).material;
  });

  if (!material) {
    throw new Error('Expected one LineSegments2 material in scene');
  }

  return material;
};

const getMeshBasicMaterial = (mesh: Mesh): MeshBasicMaterial => {
  if (Array.isArray(mesh.material) || !(mesh.material instanceof MeshBasicMaterial)) {
    throw new Error('Expected mesh material to be a MeshBasicMaterial');
  }

  return mesh.material;
};

const createModelVisualState = (
  overrides: Partial<Parameters<typeof applyModelComponentVisualStateToScene>[0]['modelVisualState']> = {},
): Parameters<typeof applyModelComponentVisualStateToScene>[0]['modelVisualState'] => ({
  hiddenComponentIds: [],
  isolatedComponentIds: [],
  focusedComponentId: undefined,
  opacityByComponentId: {},
  hoveredComponentId: undefined,
  selectedComponentIds: [],
  ...overrides,
});

const createManifest = (): GeometryComponentManifest => {
  const capabilities: GeometryComponentManifest['capabilities'] = {
    canHide: true,
    canIsolate: true,
    canFocus: true,
    canAdjustOpacity: true,
    hasDrawings: false,
    hasPreciseTopology: false,
    exports: [{ fidelity: 'mesh', formats: ['glb'], available: true }],
  };

  return {
    schemaVersion: 1,
    rootId: 'root',
    nodeOrder: ['root', firstComponentId, secondComponentId],
    nodesById: {
      root: {
        id: 'root',
        name: 'Model',
        kind: 'model',
        selector: 'root',
        childIds: [firstComponentId, secondComponentId],
        depth: 0,
        path: ['Model'],
        meshNodeIndices: [],
        primitiveIndices: [],
        materialIndices: [],
        capabilities,
      },
      [firstComponentId]: {
        id: firstComponentId,
        name: 'First',
        kind: 'part',
        selector: 'node/0',
        parentId: 'root',
        childIds: [],
        depth: 1,
        path: ['Model', 'First'],
        meshNodeIndices: [0],
        primitiveIndices: [0, 1],
        materialIndices: [0],
        capabilities,
      },
      [secondComponentId]: {
        id: secondComponentId,
        name: 'Second',
        kind: 'part',
        selector: 'node/1',
        parentId: 'root',
        childIds: [],
        depth: 1,
        path: ['Model', 'Second'],
        meshNodeIndices: [1],
        primitiveIndices: [0],
        materialIndices: [1],
        capabilities,
      },
    },
    capabilities,
  };
};

const createGltfWithChildren = (childCount: number): GLTF => {
  const scene = new Group();
  for (let i = 0; i < childCount; i++) {
    // Unit-cube-ish positions so bbox becomes finite for ≥1-child happy-path tests.
    scene.add(buildMeshWithPositions([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  }
  // GLTF has many other fields the loader populates, but probeGltfScene only
  // inspects `scene` so a partial cast is the minimum surface.
  const gltf: Pick<GLTF, 'scene'> = { scene };
  return gltf as GLTF;
};

const createGltfWithNonFiniteMesh = (): GLTF => {
  const scene = new Group();
  scene.add(buildMeshWithPositions([Number.NaN, 0, 0, 1, Number.NaN, 0, 0, 0, Number.POSITIVE_INFINITY]));
  const gltf: Pick<GLTF, 'scene'> = { scene };
  return gltf as GLTF;
};

const noop = (): void => {
  /* No-op console.warn replacement */
};

describe('probeGltfScene (OCJS rendering smoke trail)', () => {
  let warnSpy: MockInstance<typeof console.warn> | undefined;

  afterEach(() => {
    warnSpy?.mockRestore();
    warnSpy = undefined;
  });

  describe('Gate 2: GLTFLoader silently dropped nodes (childrenCount === 0)', () => {
    it('should warn with byteLength + childrenCount + bbox when GLTFLoader produces a scene with zero children', () => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const gltf = createGltfWithChildren(0);

      probeGltfScene(gltf, 1234);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const call = warnSpy.mock.calls[0]!;
      expect(call[0]).toBe('GLTFLoader produced a scene with zero children');
      const payload = call[1] as Record<string, unknown>;
      expect(payload).toMatchObject({
        byteLength: 1234,
        childrenCount: 0,
        bbox: expect.objectContaining({
          min: expect.any(Object) as unknown,
          max: expect.any(Object) as unknown,
          finite: false,
        }) as unknown,
      });
    });
  });

  describe('Gate 3: coordinate transform regression (childrenCount > 0 but bbox is non-finite)', () => {
    it('should warn with byteLength + childrenCount + bbox when the world bbox contains NaN or Infinity', () => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const gltf = createGltfWithNonFiniteMesh();

      probeGltfScene(gltf, 9999);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const call = warnSpy.mock.calls[0]!;
      expect(call[0]).toBe('GLTFLoader produced a scene with a non-finite bounding box');
      const payload = call[1] as Record<string, unknown>;
      expect(payload).toMatchObject({
        byteLength: 9999,
        childrenCount: 1,
        bbox: expect.objectContaining({ finite: false }) as unknown,
      });
    });
  });

  describe('Happy path (childrenCount > 0 AND finite bbox)', () => {
    it('should remain silent when the scene has at least one child with finite positions', () => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const gltf = createGltfWithChildren(1);

      probeGltfScene(gltf, 8888);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should remain silent on multi-child scenes with finite positions regardless of byteLength', () => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const gltf = createGltfWithChildren(5);

      probeGltfScene(gltf, 0);

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});

describe('annotateSceneComponents', () => {
  it('should use GLTFLoader associations for parent-owned surfaces, edges, and child meshes', () => {
    const parentId = 'component:node-0';
    const childId = 'component:node-1';
    const { capabilities } = createManifest();
    const manifest: GeometryComponentManifest = {
      schemaVersion: 1,
      rootId: 'root',
      nodeOrder: ['root', parentId, childId],
      capabilities,
      nodesById: {
        root: {
          id: 'root',
          name: 'Model',
          kind: 'model',
          selector: 'root',
          childIds: [parentId],
          depth: 0,
          path: ['Model'],
          meshNodeIndices: [],
          primitiveIndices: [],
          materialIndices: [],
          capabilities,
        },
        [parentId]: {
          id: parentId,
          name: 'Parent',
          kind: 'part',
          selector: 'node/0',
          parentId: 'root',
          childIds: [childId],
          depth: 1,
          path: ['Model', 'Parent'],
          meshNodeIndices: [0],
          primitiveIndices: [0, 1],
          primitiveRefs: [
            { nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 },
            { nodeIndex: 0, meshIndex: 0, primitiveIndex: 1 },
          ],
          materialIndices: [0],
          capabilities,
        },
        [childId]: {
          id: childId,
          name: 'Child',
          kind: 'part',
          selector: 'node/1',
          parentId,
          childIds: [],
          depth: 2,
          path: ['Model', 'Parent', 'Child'],
          meshNodeIndices: [1],
          primitiveIndices: [0],
          primitiveRefs: [{ nodeIndex: 1, meshIndex: 1, primitiveIndex: 0 }],
          materialIndices: [1],
          capabilities,
        },
      },
    };
    const scene = new Group();
    const parentNode = new Group();
    const parentSurface = buildMeshWithPositions([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const parentEdges = buildLineSegmentsWithPositions([0, 0, 0, 1, 0, 0]);
    const childSurface = buildMeshWithPositions([2, 0, 0, 3, 0, 0, 2, 1, 0]);
    parentNode.add(parentSurface, parentEdges, childSurface);
    scene.add(parentNode);
    const associations = new Map<Object3D, { meshes?: number; nodes?: number; primitives?: number }>([
      [parentNode, { nodes: 0, meshes: 0 }],
      [parentSurface, { meshes: 0, primitives: 0 }],
      [parentEdges, { meshes: 0, primitives: 1 }],
      [childSurface, { nodes: 1, meshes: 1, primitives: 0 }],
    ]);

    annotateSceneComponents(scene, manifest, { unitId, associations });

    expect(getModelComponentOwner(parentSurface)).toEqual({ unitId, componentId: parentId });
    expect(getModelComponentOwner(parentEdges)).toEqual({ unitId, componentId: parentId });
    expect(getModelComponentOwner(childSurface)).toEqual({ unitId, componentId: childId });
  });

  it('should assign sibling edge lines to the owning surface fallback component', () => {
    const scene = new Group();
    const meshGroup = new Group();
    const firstSurface = buildMeshWithPositions([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const firstEdges = buildLineSegmentsWithPositions([0, 0, 0, 1, 0, 0]);
    const secondSurface = buildMeshWithPositions([2, 0, 0, 3, 0, 0, 2, 1, 0]);

    meshGroup.add(firstSurface);
    meshGroup.add(firstEdges);
    meshGroup.add(secondSurface);
    scene.add(meshGroup);

    annotateSceneComponents(scene, createManifest(), { unitId });

    expect(getModelComponentOwner(firstSurface)).toEqual({ unitId, componentId: firstComponentId });
    expect(getModelComponentOwner(firstEdges)).toEqual({ unitId, componentId: firstComponentId });
    expect(getModelComponentOwner(secondSurface)).toEqual({ unitId, componentId: secondComponentId });
  });

  it('should assign primitive-ref leaf components to Zoo face meshes', () => {
    const bodyId = 'component:zoo-solid-0';
    const firstFaceId = 'component:zoo-solid-0:face-0';
    const secondFaceId = 'component:zoo-solid-0:face-1';
    const capabilities: GeometryComponentManifest['capabilities'] = {
      canHide: true,
      canIsolate: true,
      canFocus: true,
      canAdjustOpacity: true,
      hasDrawings: false,
      hasPreciseTopology: true,
      exports: [{ fidelity: 'mesh', formats: ['glb'], available: true }],
    };
    const manifest: GeometryComponentManifest = {
      schemaVersion: 1,
      rootId: 'root',
      nodeOrder: ['root', bodyId, firstFaceId, secondFaceId],
      capabilities,
      nodesById: {
        root: {
          id: 'root',
          name: 'Model',
          kind: 'model',
          selector: 'root',
          childIds: [bodyId],
          depth: 0,
          path: ['Model'],
          meshNodeIndices: [],
          primitiveIndices: [],
          materialIndices: [],
          capabilities,
        },
        [bodyId]: {
          id: bodyId,
          name: 'Solid 1',
          kind: 'body',
          selector: 'kittycad/solid/0',
          parentId: 'root',
          childIds: [firstFaceId, secondFaceId],
          depth: 1,
          path: ['Model', 'Solid 1'],
          meshNodeIndices: [0],
          primitiveIndices: [0, 1],
          primitiveRefs: [
            { nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 },
            { nodeIndex: 0, meshIndex: 0, primitiveIndex: 1 },
          ],
          materialIndices: [0, 1],
          capabilities,
        },
        [firstFaceId]: {
          id: firstFaceId,
          name: 'Face 1',
          kind: 'face',
          selector: 'kittycad/solid/0/face/0',
          parentId: bodyId,
          childIds: [],
          depth: 2,
          path: ['Model', 'Solid 1', 'Face 1'],
          meshNodeIndices: [0],
          primitiveIndices: [0],
          primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }],
          materialIndices: [0],
          capabilities,
        },
        [secondFaceId]: {
          id: secondFaceId,
          name: 'Face 2',
          kind: 'face',
          selector: 'kittycad/solid/0/face/1',
          parentId: bodyId,
          childIds: [],
          depth: 2,
          path: ['Model', 'Solid 1', 'Face 2'],
          meshNodeIndices: [0],
          primitiveIndices: [1],
          primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 1 }],
          materialIndices: [1],
          capabilities,
        },
      },
    };
    const scene = new Group();
    const meshGroup = new Group();
    const firstSurface = buildMeshWithPositions([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const firstEdges = buildLineSegmentsWithPositions([0, 0, 0, 1, 0, 0]);
    const secondSurface = buildMeshWithPositions([2, 0, 0, 3, 0, 0, 2, 1, 0]);

    meshGroup.add(firstSurface);
    meshGroup.add(firstEdges);
    meshGroup.add(secondSurface);
    scene.add(meshGroup);

    annotateSceneComponents(scene, manifest, { unitId });

    expect(getModelComponentOwner(firstSurface)).toEqual({ unitId, componentId: firstFaceId });
    expect(getModelComponentOwner(firstEdges)).toEqual({ unitId, componentId: firstFaceId });
    expect(getModelComponentOwner(secondSurface)).toEqual({ unitId, componentId: secondFaceId });
  });
});

describe('applyGltfEdgeThemeColor', () => {
  it('updates the edge material snapshot so visual-state restore does not revert to the old theme color', () => {
    const scene = new Group();
    scene.add(buildLineSegmentsWithPositions([0, 0, 0, 1, 0, 0]));
    const gltf: Pick<GLTF, 'scene'> = { scene };
    applyFatLineSegments(gltf as GLTF, {
      backend: 'webgl',
      resolution: new Vector2(1024, 768),
      edgeColor: gltfEdgeColorLightMode,
    });
    const material = getOnlyFatLineMaterial(scene);
    const edgeMaterial = material as Material & { color: { getHex(): number } };
    const initialSnapshot = getOrCaptureModelMaterialAppearance(material);

    applyGltfEdgeThemeColor(scene, gltfEdgeColorDarkMode);
    const updatedSnapshot = getOrCaptureModelMaterialAppearance(material);
    applyModelMaterialAppearance(material, updatedSnapshot, { opacity: 1, emphasis: 'none' });

    expect(initialSnapshot.color?.getHex()).toBe(gltfEdgeColorLightMode);
    expect(updatedSnapshot).not.toBe(initialSnapshot);
    expect(updatedSnapshot.color?.getHex()).toBe(gltfEdgeColorDarkMode);
    expect(edgeMaterial.color.getHex()).toBe(gltfEdgeColorDarkMode);
  });
});

const buildRaycastMesh = ({ z, componentId }: { readonly z: number; readonly componentId: string }): Mesh => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, z, 1, -1, z, 0, 1, z]), 3));
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
  assignComponentOwner(mesh, componentId);
  return mesh;
};

const buildForwardRaycaster = (): Raycaster => {
  const raycaster = new Raycaster();
  raycaster.ray.set(new Vector3(0, 0, 0), new Vector3(0, 0, -1));
  return raycaster;
};

describe('model component BVH picking', () => {
  it('should prefer the nearest component-owned surface mesh', () => {
    const rearMesh = buildRaycastMesh({ z: -2, componentId: firstComponentId });
    const frontMesh = buildRaycastMesh({ z: -1, componentId: secondComponentId });

    expect(
      resolveModelComponentHitFromRay({
        raycaster: buildForwardRaycaster(),
        meshes: [rearMesh, frontMesh],
      }),
    ).toBe(secondComponentId);
  });

  it('should ignore hidden meshes instead of selecting occluded components through them', () => {
    const hiddenFrontMesh = buildRaycastMesh({ z: -1, componentId: secondComponentId });
    const rearMesh = buildRaycastMesh({ z: -2, componentId: firstComponentId });
    hiddenFrontMesh.visible = false;

    expect(
      resolveModelComponentHitFromRay({
        raycaster: buildForwardRaycaster(),
        meshes: [hiddenFrontMesh, rearMesh],
      }),
    ).toBe(firstComponentId);
  });

  it('should collect component ids inherited from parent GLTF nodes', () => {
    const parent = new Group();
    const child = buildMeshWithPositions([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    assignComponentOwner(parent, firstComponentId);
    parent.add(child);

    expect(collectModelPickableSurfaceMeshes(parent)).toEqual([child]);
  });

  it('should collect only component-owned model surface meshes', () => {
    const scene = new Group();
    const ownedMesh = buildRaycastMesh({ z: -1, componentId: firstComponentId });
    const ownerlessMesh = buildMeshWithPositions([0, 0, -1, 1, 0, -1, 0, 1, -1]);
    const sectionHelperGroup = new Group();
    const sectionHelperMesh = buildRaycastMesh({ z: -2, componentId: secondComponentId });
    const edgeLine = buildLineSegmentsWithPositions([0, 0, 0, 1, 0, 0]);
    sectionHelperGroup.userData[sceneTag.sectionViewHelper] = true;
    sectionHelperGroup.add(sectionHelperMesh);
    scene.add(ownedMesh, ownerlessMesh, sectionHelperGroup, edgeLine);

    expect(collectModelPickableSurfaceMeshes(scene)).toEqual([ownedMesh]);
  });

  it('should skip clipped front model hits and resolve the nearest remaining visible component', () => {
    const frontMesh = buildRaycastMesh({ z: -1, componentId: secondComponentId });
    const rearMesh = buildRaycastMesh({ z: -2, componentId: firstComponentId });

    expect(
      resolveModelComponentHitFromRay({
        raycaster: buildForwardRaycaster(),
        meshes: [frontMesh, rearMesh],
        clipping: {
          enabled: true,
          planes: [new Plane(new Vector3(0, 0, -1), -1.5)],
        },
      }),
    ).toBe(firstComponentId);
  });

  it('should return no component when section clipping removes every candidate hit', () => {
    const frontMesh = buildRaycastMesh({ z: -1, componentId: secondComponentId });
    const rearMesh = buildRaycastMesh({ z: -2, componentId: firstComponentId });

    expect(
      resolveModelComponentHitFromRay({
        raycaster: buildForwardRaycaster(),
        meshes: [frontMesh, rearMesh],
        clipping: {
          enabled: true,
          planes: [new Plane(new Vector3(0, 0, 1), 0.5)],
        },
      }),
    ).toBeUndefined();
  });
});

describe('hasModelHitBlockingSceneUiHit', () => {
  it('should identify a front section-view selector as a model-picking blocker', () => {
    const sectionSelectorGroup = new Group();
    const sectionSelectorMesh = buildMeshWithPositions([0, 0, 1, 1, 0, 1, 0, 1, 1]);
    const modelMesh = buildMeshWithPositions([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    sectionSelectorGroup.userData[sceneTag.sectionViewHelper] = true;
    sectionSelectorGroup.add(sectionSelectorMesh);
    assignComponentOwner(modelMesh, firstComponentId);

    expect(
      hasModelHitBlockingSceneUiHit([
        { distance: 5, object: sectionSelectorMesh },
        { distance: 10, object: modelMesh },
      ]),
    ).toBe(true);
  });

  it('should identify a coplanar section-view selector as a model-picking blocker', () => {
    const sectionSelectorMesh = buildMeshWithPositions([0, 0, 1, 1, 0, 1, 0, 1, 1]);
    const modelMesh = buildMeshWithPositions([0, 0, 1, 1, 0, 1, 0, 1, 1]);
    sectionSelectorMesh.userData[sceneTag.sectionViewHelper] = true;
    assignComponentOwner(modelMesh, firstComponentId);

    expect(
      hasModelHitBlockingSceneUiHit([
        { distance: 5, object: modelMesh },
        { distance: 5, object: sectionSelectorMesh },
      ]),
    ).toBe(true);
  });

  it('should identify a section-view selector as a blocker even when the model is closer', () => {
    const sectionSelectorMesh = buildMeshWithPositions([0, 0, 1, 1, 0, 1, 0, 1, 1]);
    const modelMesh = buildMeshWithPositions([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    sectionSelectorMesh.userData[sceneTag.sectionViewHelper] = true;
    assignComponentOwner(modelMesh, firstComponentId);

    expect(
      hasModelHitBlockingSceneUiHit([
        { distance: 5, object: modelMesh },
        { distance: 10, object: sectionSelectorMesh },
      ]),
    ).toBe(true);
  });
});

describe('resolveComponentVisualState', () => {
  it('should dim non-isolated components without hiding them', () => {
    expect(
      resolveComponentVisualState({
        componentId: secondComponentId,
        hiddenComponentIds: new Set(),
        isolatedComponentIds: new Set([firstComponentId]),
      }),
    ).toEqual({ visible: true, opacity: 0.5 });
  });

  it('should keep the isolated component fully opaque', () => {
    expect(
      resolveComponentVisualState({
        componentId: firstComponentId,
        hiddenComponentIds: new Set(),
        isolatedComponentIds: new Set([firstComponentId]),
      }),
    ).toEqual({ visible: true, opacity: 1 });
  });

  it('should preserve explicit hidden state during isolation', () => {
    expect(
      resolveComponentVisualState({
        componentId: secondComponentId,
        hiddenComponentIds: new Set([secondComponentId]),
        isolatedComponentIds: new Set([firstComponentId]),
      }),
    ).toEqual({ visible: false, opacity: 0.5 });
  });

  it('should keep a hidden isolated component hidden', () => {
    expect(
      resolveComponentVisualState({
        componentId: firstComponentId,
        hiddenComponentIds: new Set([firstComponentId]),
        isolatedComponentIds: new Set([firstComponentId]),
      }),
    ).toEqual({ visible: false, opacity: 1 });
  });
});

describe('applyModelComponentVisualStateToScene', () => {
  it('should dim non-focused component materials without writing depth', () => {
    const scene = new Group();
    const focusedMesh = buildMeshWithPositions([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const dimmedMesh = buildMeshWithPositions([2, 0, 0, 3, 0, 0, 2, 1, 0]);
    assignComponentOwner(focusedMesh, firstComponentId);
    assignComponentOwner(dimmedMesh, secondComponentId);
    scene.add(focusedMesh, dimmedMesh);

    applyModelComponentVisualStateToScene({
      scene,
      componentManifest: createManifest(),
      modelVisualState: createModelVisualState({ focusedComponentId: firstComponentId }),
      enableSurfaces: true,
      enableLines: true,
    });

    const focusedMaterial = getMeshBasicMaterial(focusedMesh);
    const dimmedMaterial = getMeshBasicMaterial(dimmedMesh);
    expect(focusedMesh.visible).toBe(true);
    expect(focusedMaterial.opacity).toBe(1);
    expect(focusedMaterial.transparent).toBe(false);
    expect(focusedMaterial.depthWrite).toBe(true);
    expect(dimmedMesh.visible).toBe(true);
    expect(dimmedMaterial.opacity).toBe(0.5);
    expect(dimmedMaterial.transparent).toBe(true);
    expect(dimmedMaterial.depthWrite).toBe(false);
  });

  it('should restore depth writes after explicit opacity is cleared', () => {
    const scene = new Group();
    const mesh = buildMeshWithPositions([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    assignComponentOwner(mesh, firstComponentId);
    scene.add(mesh);

    applyModelComponentVisualStateToScene({
      scene,
      componentManifest: createManifest(),
      modelVisualState: createModelVisualState({ opacityByComponentId: { [firstComponentId]: 0.25 } }),
      enableSurfaces: true,
      enableLines: true,
    });
    const material = getMeshBasicMaterial(mesh);
    expect(material.opacity).toBe(0.25);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);

    applyModelComponentVisualStateToScene({
      scene,
      componentManifest: createManifest(),
      modelVisualState: createModelVisualState(),
      enableSurfaces: true,
      enableLines: true,
    });

    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
  });
});

describe('resolveViewerHoverUpdate', () => {
  it('should clear the local cache and skip viewer hover sends while suppressed', () => {
    expect(
      resolveViewerHoverUpdate({
        isViewerHoverSuppressed: true,
        previousComponentId: firstComponentId,
        nextComponentId: secondComponentId,
      }),
    ).toEqual({
      nextCachedComponentId: undefined,
      shouldSend: false,
      componentId: undefined,
    });
  });

  it('should skip duplicate viewer hover sends when the hovered component has not changed', () => {
    expect(
      resolveViewerHoverUpdate({
        isViewerHoverSuppressed: false,
        previousComponentId: firstComponentId,
        nextComponentId: firstComponentId,
      }),
    ).toEqual({
      nextCachedComponentId: firstComponentId,
      shouldSend: false,
      componentId: undefined,
    });
  });

  it('should send the first valid post-suppression hover after the cache was cleared', () => {
    expect(
      resolveViewerHoverUpdate({
        isViewerHoverSuppressed: false,
        previousComponentId: undefined,
        nextComponentId: firstComponentId,
      }),
    ).toEqual({
      nextCachedComponentId: firstComponentId,
      shouldSend: true,
      componentId: firstComponentId,
    });
  });

  it('should send a hover clear when the pointer leaves the previous component after suppression ends', () => {
    expect(
      resolveViewerHoverUpdate({
        isViewerHoverSuppressed: false,
        previousComponentId: firstComponentId,
        nextComponentId: undefined,
      }),
    ).toEqual({
      nextCachedComponentId: undefined,
      shouldSend: true,
      componentId: undefined,
    });
  });
});

describe('shouldConsumeGuardedModelPointerClick', () => {
  it('should consume clicks only while a model pointer guard or click suppression is active', () => {
    expect(
      shouldConsumeGuardedModelPointerClick({
        suppressNextModelPointerClick: false,
        isModelPointerClickSuppressed: true,
      }),
    ).toBe(true);
    expect(
      shouldConsumeGuardedModelPointerClick({
        suppressNextModelPointerClick: true,
        isModelPointerClickSuppressed: false,
      }),
    ).toBe(true);
    expect(
      shouldConsumeGuardedModelPointerClick({
        suppressNextModelPointerClick: false,
        isModelPointerClickSuppressed: false,
      }),
    ).toBe(false);
  });
});

describe('resolveModelPointerClickAction', () => {
  it('should toggle/highlight a frontmost component on a plain component click without invoking focus', () => {
    const mesh = buildMeshWithPositions([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    assignComponentOwner(mesh, firstComponentId);

    expect(
      resolveModelPointerClickAction({
        intersections: [{ distance: 1, object: mesh }],
        modelComponentId: firstComponentId,
        suppressNextModelPointerClick: false,
        isModelPointerClickSuppressed: false,
      }),
    ).toEqual({
      type: 'toggleComponentSelection',
      componentId: firstComponentId,
    });
  });

  it('should clear focus and selection on a plain empty click', () => {
    expect(
      resolveModelPointerClickAction({
        intersections: [],
        modelComponentId: undefined,
        suppressNextModelPointerClick: false,
        isModelPointerClickSuppressed: false,
      }),
    ).toEqual({
      type: 'clearFocusAndSelection',
    });
  });

  it('should consume a post-drag component click without toggling it', () => {
    const mesh = buildMeshWithPositions([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    assignComponentOwner(mesh, firstComponentId);

    expect(
      resolveModelPointerClickAction({
        intersections: [{ distance: 1, object: mesh }],
        modelComponentId: firstComponentId,
        suppressNextModelPointerClick: true,
        isModelPointerClickSuppressed: false,
      }),
    ).toEqual({
      type: 'consumeModelPointerGuard',
    });
  });

  it('should toggle a component click while viewer hover is suppressed without a click guard', () => {
    const mesh = buildMeshWithPositions([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    assignComponentOwner(mesh, firstComponentId);

    expect(
      resolveModelPointerClickAction({
        intersections: [{ distance: 1, object: mesh }],
        modelComponentId: firstComponentId,
        suppressNextModelPointerClick: false,
        isModelPointerClickSuppressed: false,
      }),
    ).toEqual({
      type: 'toggleComponentSelection',
      componentId: firstComponentId,
    });
  });

  it('should consume a component click while model pointer clicks are suppressed by a tool', () => {
    const mesh = buildMeshWithPositions([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    assignComponentOwner(mesh, firstComponentId);

    expect(
      resolveModelPointerClickAction({
        intersections: [{ distance: 1, object: mesh }],
        modelComponentId: firstComponentId,
        suppressNextModelPointerClick: false,
        isModelPointerClickSuppressed: true,
      }),
    ).toEqual({
      type: 'consumeModelPointerGuard',
    });
  });

  it('should let section-view scene UI handle clicks before consuming the model click guard', () => {
    const sectionSelector = buildMeshWithPositions([0, 0, 1, 1, 0, 1, 0, 1, 1]);
    sectionSelector.userData[sceneTag.sectionViewHelper] = true;

    expect(
      resolveModelPointerClickAction({
        intersections: [{ distance: 1, object: sectionSelector }],
        modelComponentId: firstComponentId,
        suppressNextModelPointerClick: true,
        isModelPointerClickSuppressed: true,
      }),
    ).toEqual({
      type: 'allowSceneUi',
    });
  });
});

describe('resolveModelContextMenuAction', () => {
  it('should open the component menu for an unguarded component hit', () => {
    const mesh = buildMeshWithPositions([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    assignComponentOwner(mesh, firstComponentId);

    expect(
      resolveModelContextMenuAction({
        intersections: [{ distance: 1, object: mesh }],
        modelComponentId: firstComponentId,
        suppressNextModelPointerClick: false,
        isModelPointerClickSuppressed: false,
      }),
    ).toEqual({ type: 'openComponentMenu', componentId: firstComponentId });
  });

  it('should ignore empty model hits and active tool suppressed component hits', () => {
    const mesh = buildMeshWithPositions([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    assignComponentOwner(mesh, firstComponentId);

    expect(
      resolveModelContextMenuAction({
        intersections: [],
        modelComponentId: undefined,
        suppressNextModelPointerClick: false,
        isModelPointerClickSuppressed: false,
      }),
    ).toEqual({ type: 'ignore' });
    expect(
      resolveModelContextMenuAction({
        intersections: [{ distance: 1, object: mesh }],
        modelComponentId: firstComponentId,
        suppressNextModelPointerClick: false,
        isModelPointerClickSuppressed: true,
      }),
    ).toEqual({ type: 'ignore' });
  });

  it('should consume the post-drag guard instead of opening a component menu', () => {
    const mesh = buildMeshWithPositions([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    assignComponentOwner(mesh, firstComponentId);

    expect(
      resolveModelContextMenuAction({
        intersections: [{ distance: 1, object: mesh }],
        modelComponentId: firstComponentId,
        suppressNextModelPointerClick: true,
        isModelPointerClickSuppressed: false,
      }),
    ).toEqual({ type: 'consumeModelPointerGuard' });
  });

  it('should let section-view scene UI handle context menus before model guards', () => {
    const sectionSelector = buildMeshWithPositions([0, 0, 1, 1, 0, 1, 0, 1, 1]);
    sectionSelector.userData[sceneTag.sectionViewHelper] = true;

    expect(
      resolveModelContextMenuAction({
        intersections: [{ distance: 1, object: sectionSelector }],
        modelComponentId: firstComponentId,
        suppressNextModelPointerClick: true,
        isModelPointerClickSuppressed: true,
      }),
    ).toEqual({ type: 'allowSceneUi' });
  });
});

describe('resolveModelPointerClickDispatches', () => {
  it('should translate a plain component click to selection toggle, not focus', () => {
    expect(
      resolveModelPointerClickDispatches({
        clickAction: { type: 'toggleComponentSelection', componentId: firstComponentId },
        unitId: 'unit:main',
      }),
    ).toEqual([
      {
        type: 'toggleModelComponentSelection',
        unitId: 'unit:main',
        componentId: firstComponentId,
        source: 'viewer',
      },
    ]);
  });

  it('should clear the model click guard when a guarded click is consumed', () => {
    expect(
      resolveModelPointerClickDispatches({
        clickAction: { type: 'consumeModelPointerGuard' },
        unitId: 'unit:main',
      }),
    ).toEqual([{ type: 'clearModelPointerClickGuard' }]);
  });

  it('should clear focus and selection on an unguarded empty click', () => {
    expect(
      resolveModelPointerClickDispatches({
        clickAction: { type: 'clearFocusAndSelection' },
        unitId: 'unit:main',
      }),
    ).toEqual([
      { type: 'clearModelComponentFocus', unitId: 'unit:main', source: 'viewer' },
      { type: 'clearModelComponentSelection', unitId: 'unit:main', source: 'viewer' },
    ]);
  });
});

describe('resolveModelPointerMissedAction', () => {
  it('should preserve focus and selection when an empty miss follows a guarded model gesture', () => {
    expect(
      resolveModelPointerMissedAction({
        suppressNextModelPointerClick: true,
        isModelPointerClickSuppressed: false,
      }),
    ).toEqual({ type: 'consumeModelPointerGuard' });
  });

  it('should preserve focus and selection while model pointer clicks are suppressed by a tool', () => {
    expect(
      resolveModelPointerMissedAction({
        suppressNextModelPointerClick: false,
        isModelPointerClickSuppressed: true,
      }),
    ).toEqual({ type: 'consumeModelPointerGuard' });
  });

  it('should clear focus and selection on a plain empty miss', () => {
    expect(
      resolveModelPointerMissedAction({
        suppressNextModelPointerClick: false,
        isModelPointerClickSuppressed: false,
      }),
    ).toEqual({ type: 'clearFocusAndSelection' });
  });
});
