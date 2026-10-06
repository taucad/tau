import { act, cleanup, render, waitFor } from '@testing-library/react';
import * as surfaceBatchOwners from '#components/geometry/graphics/three/utils/gltf-surface-batches.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { Actor, EventFrom, SnapshotFrom } from 'xstate';
import type { cameraMachine } from '@taucad/camera/machine';
import { Box3, BufferAttribute, InstancedMesh, Matrix4, Mesh, OrthographicCamera, Raycaster, Vector3 } from 'three';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { writeGlb, validateAdmittedAssemblyGlb } from '@taucad/geometry-core';
import type { GlbMaterial } from '@taucad/geometry-core';
import {
  buildGltfComponentManifest,
  buildResidentAssemblyComponentManifest,
  parseGltfBytes,
} from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import { tauCadTopologyExtension } from '@taucad/types/constants';
import {
  getModelComponentId,
  getModelComponentInstanceSlots,
  getModelComponentHitOwner,
  getModelComponentWorldMatrix,
} from '#components/geometry/graphics/three/utils/model-component-owner.js';
import { getGltfOccurrenceEdgeBatch } from '#components/geometry/graphics/three/materials/gltf-edges.js';
import { KeyboardProvider } from '#hooks/use-keyboard.js';
import { getKinematicsUnitState, kinematicsMachine } from '#machines/kinematics.machine.js';
import { mock } from 'vitest-mock-extended';
import type { AdmittedAssembly } from '@taucad/runtime/types';
import type { CadAssemblyDisplay } from '#machines/cad.machine.js';
import { contentDigest } from '@taucad/cache-core';
import { sha256Bytes } from '@taucad/utils/hash';
import { getOrBuildBvh } from '#components/geometry/graphics/three/utils/bvh-cache.js';
import { raycastFirstVisibleMeshHit } from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import { getGltfAssemblySource } from '#components/geometry/graphics/three/use-geometry-bounds.js';
import { captureGltfAssemblyPlacements } from '#components/geometry/graphics/three/react/kinematics-pose-composer.js';
import { createCanonicalGltfToTauMatrix } from '#components/geometry/graphics/three/gltf-world.js';

// The in-place and camera suites replace `useKinematicsViewer`; this one keeps it real, so the GltfMesh
// wiring (unit id, presented scene and manifest) reaches the kinematics actor and the pose composer.
const mocks = vi.hoisted(() => {
  const sceneBounds = { min: [-20, -10, -5], max: [20, 10, 5] };
  return {
    camera: undefined as OrthographicCamera | undefined,
    cameraRig: {
      actorRef: {
        getSnapshot: () => ({ context: { view: { bounds: sceneBounds } } }),
        send: vi.fn<(event: EventFrom<typeof cameraMachine>) => void>(),
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
          viewerHoverSuppressionReasons: [],
        },
      }),
    },
    gl: Object.create(null) as { coordinateSystem?: number },
    observePreparation: undefined as ReturnType<typeof vi.fn<(scene: Object3D) => void>> | undefined,
    invalidate: vi.fn(),
    frame: undefined as (() => void) | undefined,
    kinematics: undefined as Actor<typeof kinematicsMachine> | undefined,
    rootScene: { name: 'viewport-lighting-scene' },
    modelUnit: {
      focusedComponentId: undefined as string | undefined,
      hiddenComponentIds: [],
      hoveredComponentId: undefined,
      isolatedComponentIds: [],
      manifest: undefined,
      opacityByComponentId: {},
      selectedComponentIds: [],
    },
    renderFrame: { anchorFrameId: 'tau:root', originMeters: [0, 0, 0], metersPerRenderUnit: 1 },
    sectionView: { isActive: false },
  };
});

vi.mock('@react-three/fiber', () => {
  const state = () => ({
    camera: mocks.camera,
    controls: undefined,
    gl: mocks.gl,
    invalidate: mocks.invalidate,
    scene: mocks.rootScene,
    size: { height: 768, width: 1024 },
    get: () => undefined,
  });
  return {
    useFrame: (callback: () => void) => {
      mocks.frame = callback;
    },
    // GltfMesh reads the whole state; the kinematics hooks and the section clip select from it.
    useThree: (selector?: (current: ReturnType<typeof state>) => unknown) => (selector ? selector(state()) : state()),
  };
});

vi.mock('#hooks/use-theme.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Mirrors the production Theme values.
  Theme: { DARK: 'dark', LIGHT: 'light' },
  useTheme: () => ({ theme: 'light' }),
}));

vi.mock('#components/geometry/graphics/three/three-graphics-backend-context.js', () => ({
  useThreeGraphicsBackend: () => 'webgl',
}));

vi.mock('#hooks/use-graphics.js', async () => {
  const { useSelector } = await import('@xstate/react');
  return {
    useCameraRig: () => mocks.cameraRig,
    useGraphics: () => mocks.graphicsActor,
    useGraphicsSelector: () => false,
    useRenderFrame: () => mocks.renderFrame,
    // Material retargeting is not under test here.
    useRenderFrameRetarget: () => undefined,
    useModelInteractionRef: () => mocks.graphicsActor,
    useModelInteractionSelector: (selector: (state: { context: Record<string, unknown> }) => unknown) =>
      selector({ context: {} }),
    useKinematicsRef: () => mocks.kinematics,
    useKinematicsSelector: <T,>(selector: (snapshot: SnapshotFrom<typeof kinematicsMachine>) => T) =>
      useSelector(mocks.kinematics!, selector),
  };
});

vi.mock(import('#machines/model-interaction.machine.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  deriveModelInteractionUnitId: ({ geometryHash }: { geometryHash?: string }) => `unit:${geometryHash ?? ''}`,
  getModelInteractionUnitState: () => mocks.modelUnit,
}));

vi.mock('#components/geometry/graphics/three/use-section-view.js', () => ({
  resolveSectionViewRaycastClip: () => undefined,
  useSectionViewFlags: () => mocks.sectionView,
}));

const { GltfMesh, captureCommittedGltfDrawInventory } =
  await import('#components/geometry/graphics/three/react/gltf-mesh.js');

const unitId = 'unit:a';

const surfaceMaterial: GlbMaterial = {
  pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1], metallicFactor: 0.1, roughnessFactor: 0.8 },
  doubleSided: false,
  alphaMode: 'OPAQUE',
};

// Plain JSON: the GLB extension payload the manifest admits.
const mechanism = {
  schemaVersion: 1,
  units: { length: 'm', angle: 'rad' },
  root: 'base',
  links: { base: { components: ['component:base'] }, lid: { components: ['component:lid'] } },
  joints: { hinge: { type: 'revolute', parent: 'base', child: 'lid', origin: [0, 0, 0], axis: [0, 0, 1] } },
};

function buildHingedGlb(
  admittedTopology = false,
  withOwnedEdges = false,
  nonIndexedEdges = false,
): Uint8Array<ArrayBuffer> {
  const movingMaterial: GlbMaterial = withOwnedEdges ? { ...surfaceMaterial, alphaMode: 'BLEND' } : surfaceMaterial;
  const part = (name: string, x: number) => ({
    name,
    ...(admittedTopology ? { extras: { tauComponentId: name === 'Base' ? 'component:base' : 'component:lid' } } : {}),
    primitives: [
      {
        mode: 4,
        positions: Float32Array.from([x, 0, 0, x + 1, 0, 0, x, 1, 0]),
        normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        indices: Uint32Array.from([0, 1, 2]),
        material: movingMaterial,
      },
      ...(withOwnedEdges
        ? [
            {
              mode: 1,
              positions: Float32Array.from([x, 0, 0, x + 1, 0, 0]),
              ...(nonIndexedEdges ? {} : { indices: Uint32Array.from([0, 1]) }),
              material: surfaceMaterial,
            },
          ]
        : []),
    ],
  });
  return writeGlb({
    nodes: [part('Base', 0), part('Lid', 2)],
    extensions: {
      [tauCadTopologyExtension]: {
        ...(admittedTopology ? { schemaVersion: 1 } : {}),
        components: [
          { id: 'component:base', name: 'Base', kind: 'part', selector: 'node/0', nodeIndex: 0 },
          { id: 'component:lid', name: 'Lid', kind: 'part', selector: 'node/1', nodeIndex: 1 },
        ],
        mechanism,
      },
    },
    extensionsUsed: [tauCadTopologyExtension],
  });
}

function placedHingedGlb(x: number): Uint8Array<ArrayBuffer> {
  const bytes = buildHingedGlb();
  const { json } = parseGltfBytes(bytes);
  json.nodes![1]!.translation = [x, 0, 0];
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(encoded.byteLength / 4) * 4;
  const sourceJsonLength = new DataView(bytes.buffer).getUint32(12, true);
  const remainder = bytes.subarray(20 + sourceJsonLength);
  const result = new Uint8Array(20 + padded + remainder.byteLength);
  result.set(bytes.subarray(0, 12));
  const view = new DataView(result.buffer);
  view.setUint32(8, result.byteLength, true);
  view.setUint32(12, padded, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  result.fill(0x20, 20, 20 + padded);
  result.set(encoded, 20);
  result.set(remainder, 20 + padded);
  return result;
}

function nestedFocusGlb({ mixedParent = false }: { mixedParent?: boolean } = {}): Uint8Array<ArrayBuffer> {
  const material: GlbMaterial = mixedParent ? { ...surfaceMaterial, alphaMode: 'BLEND' } : surfaceMaterial;
  const triangle = {
    mode: 4,
    positions: Float32Array.from([2, 0, 0, 3, 0, 0, 2, 1, 0]),
    normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: Uint32Array.from([0, 1, 2]),
    material,
  };
  const bytes = writeGlb({
    nodes: [
      { name: 'Base', primitives: [triangle], extras: { tauComponentId: 'component:base' } },
      { name: 'Lid', primitives: [triangle], extras: { tauComponentId: 'component:lid' } },
      { name: 'Inherited', primitives: [triangle], extras: { tauComponentId: 'component:inherited' } },
      {
        name: 'Shadow',
        primitives: [
          { ...triangle, positions: mixedParent ? Float32Array.from([6, 0, 0, 7, 0, 0, 6, 1, 0]) : triangle.positions },
        ],
        extras: { tauComponentId: 'component:shadow' },
      },
    ],
    extensions: {
      [tauCadTopologyExtension]: {
        ...(mixedParent ? { schemaVersion: 1 } : {}),
        components: [
          { id: 'component:base', name: 'Base', kind: 'part', selector: 'node/0', nodeIndex: 0 },
          {
            id: 'component:lid',
            name: 'Lid',
            kind: 'part',
            selector: 'node/1',
            nodeIndex: 1,
            childIds: ['component:inherited', 'component:shadow'],
          },
          {
            id: 'component:inherited',
            name: 'Inherited',
            kind: 'part',
            selector: 'node/2',
            nodeIndex: 2,
            parentId: 'component:lid',
          },
          {
            id: 'component:shadow',
            name: 'Shadow',
            kind: 'part',
            selector: 'node/3',
            nodeIndex: 3,
            parentId: 'component:lid',
          },
        ],
        mechanism: {
          ...mechanism,
          links: { ...mechanism.links, shadow: { components: ['component:shadow'] } },
          joints: {
            ...mechanism.joints,
            shadow: { type: 'revolute', parent: 'base', child: 'shadow', origin: [0, 0, 0], axis: [0, 0, 1] },
          },
        },
      },
    },
    extensionsUsed: [tauCadTopologyExtension],
  });
  const { json } = parseGltfBytes(bytes);
  const parent = json.nodes?.[1];
  const scene = json.scenes?.[0];
  if (!parent || !scene) {
    throw new Error('Missing written nested focus graph.');
  }
  // Keep real node indices; the mixed fixture retains the parent's own geometry.
  if (!mixedParent) {
    delete parent.mesh;
  }
  parent.children = [2, 3];
  scene.nodes = [0, 1];
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(encoded.byteLength / 4) * 4;
  const sourceJsonLength = new DataView(bytes.buffer).getUint32(12, true);
  const remainder = bytes.subarray(20 + sourceJsonLength);
  const result = new Uint8Array(20 + padded + remainder.byteLength);
  result.set(bytes.subarray(0, 12));
  const view = new DataView(result.buffer);
  view.setUint32(8, result.byteLength, true);
  view.setUint32(12, padded, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  result.fill(0x20, 20, 20 + padded);
  result.set(encoded, 20);
  result.set(remainder, 20 + padded);
  return result;
}

const rounded = (matrix: Matrix4): number[] => matrix.elements.map((value) => Math.round(value * 1e9) / 1e9 + 0);

function findComponentObject(scene: Object3D, componentId: string): Object3D {
  let found: Object3D | undefined;
  scene.traverse((object) => {
    found ??= getModelComponentId(object) === componentId ? object : undefined;
  });
  if (!found) {
    throw new Error(`Expected an object owned by ${componentId}.`);
  }
  return found;
}

const prepareSurfaceBatches = surfaceBatchOwners.createGltfSurfaceBatches;
beforeEach(() => {
  vi.spyOn(surfaceBatchOwners, 'createGltfSurfaceBatches').mockImplementation((...args) => {
    mocks.observePreparation?.(args[0]);
    return prepareSurfaceBatches(...args);
  });
});

describe('GltfMesh kinematics wiring', () => {
  const unit = () => getKinematicsUnitState(mocks.kinematics!.getSnapshot().context, unitId);

  beforeEach(() => {
    mocks.frame = undefined;
    mocks.camera = new OrthographicCamera(-1000, 1000, 1000, -1000, 0.1, 10_000);
    mocks.camera.position.z = 100;
    mocks.camera.updateMatrixWorld();
    mocks.kinematics = createActor(kinematicsMachine, { input: {} }).start();
    mocks.cameraRig.actorRef.send.mockClear();
    mocks.modelUnit = { ...mocks.modelUnit, focusedComponentId: undefined };
    mocks.renderFrame = { anchorFrameId: 'tau:root', originMeters: [0, 0, 0], metersPerRenderUnit: 1 };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mocks.kinematics?.stop();
    mocks.graphicsActor.send.mockClear();
    mocks.invalidate.mockClear();
    delete mocks.observePreparation;
    mocks.modelUnit = { ...mocks.modelUnit, focusedComponentId: undefined };
  });

  it.each([
    { published: false, angle: 0 },
    { published: false, angle: Math.PI / 2 },
    { published: true, angle: 0 },
    { published: true, angle: Math.PI / 2 },
  ])(
    'should focus current geometry in physical coordinates with published=$published and angle=$angle',
    async ({ published, angle }) => {
      const bytes = buildHingedGlb(published);
      const digest = contentDigest({ value: `sha256:${await sha256Bytes(bytes)}` });
      const publication: AdmittedAssembly['publication'] = {
        schemaVersion: 1,
        parts: {
          hinge: {
            schemaVersion: 1,
            variants: {
              default: {
                source: { entry: 'hinge.ts', files: {} },
                glb: { path: 'hinge.glb', digest, byteLength: bytes.byteLength },
              },
            },
          },
        },
        occurrences: [
          {
            id: 'placed',
            part: 'hinge',
            variant: 'default',
            transform: new Matrix4().makeTranslation(5, 0, 2).toArray(),
          },
        ],
      };
      const rootBytes = new TextEncoder().encode(JSON.stringify(publication));
      const root = {
        path: 'assembly.json',
        digest: contentDigest({ value: `sha256:${await sha256Bytes(rootBytes)}` }),
        byteLength: rootBytes.byteLength,
      };
      const admitted: AdmittedAssembly = {
        ...mock<AdmittedAssembly>(),
        publication,
        readAsset: vi.fn(async () => bytes),
      };
      const metadata = published
        ? await validateAdmittedAssemblyGlb({ ...publication, readAsset: async () => bytes })
        : undefined;
      const componentId = published
        ? metadata?.components.find((entry) => entry.sourceComponentId === 'component:lid')?.component.id
        : 'component:lid';
      if (!componentId) {
        throw new Error('Missing actual admitted lid identity.');
      }
      const focusedUnitId = published ? `unit:${root.digest}` : unitId;
      let scene: Object3D | undefined;
      mocks.observePreparation = vi.fn((candidate: Object3D) => {
        scene = candidate;
      });
      // Camera framing takes metres, independently of the current render origin and scale.
      mocks.renderFrame = { anchorFrameId: 'tau:root', originMeters: [10, 20, 30], metersPerRenderUnit: 0.001 };
      mocks.camera = new OrthographicCamera(-1e6, 1e6, 1e6, -1e6, 0.1, 1e6);
      mocks.camera.position.z = 100_000;
      mocks.camera.updateMatrixWorld();
      const props = published
        ? {
            assemblyDisplay: { root, admitted, document: mock<CadAssemblyDisplay['document']>() },
            geometryHash: root.digest,
          }
        : { gltfFile: bytes, geometryHash: 'a' };
      const view = render(<GltfMesh {...props} presentationRevision={1} enableMatcap={false} />, {
        wrapper: KeyboardProvider,
      });
      try {
        await waitFor(() => {
          expect(
            getKinematicsUnitState(mocks.kinematics!.getSnapshot().context, focusedUnitId).mechanism,
          ).toBeDefined();
        });
        if (!scene) {
          throw new Error('Missing current parsed focus scene.');
        }
        const currentUnit = getKinematicsUnitState(mocks.kinematics!.getSnapshot().context, focusedUnitId);
        const hingeId = Object.entries(currentUnit.mechanism!.joints).find(([, joint]) =>
          currentUnit.mechanism!.links[joint.child]?.components.includes(componentId),
        )?.[0];
        if (!hingeId) {
          throw new Error('Missing actual remapped focus hinge.');
        }
        act(() => {
          mocks.kinematics!.send({ type: 'setCoordinate', unitId: focusedUnitId, id: hingeId, value: angle });
        });
        const object = findComponentObject(scene, componentId);
        scene.updateMatrixWorld(true);
        const actualBounds = new Box3().setFromObject(object).applyMatrix4(createCanonicalGltfToTauMatrix());
        expect(actualBounds.isEmpty()).toBe(false);
        mocks.cameraRig.actorRef.send.mockClear();
        mocks.modelUnit = { ...mocks.modelUnit, focusedComponentId: componentId };
        view.rerender(<GltfMesh {...props} presentationRevision={1} enableMatcap={false} />);
        await waitFor(() => {
          const [frame] = mocks.cameraRig.actorRef.send.mock.calls[0] ?? [];
          if (frame?.type !== 'frame' || !frame.bounds) {
            throw new Error('Missing actual Focus frame bounds.');
          }
          expect(frame).toEqual({ type: 'frame', bounds: frame.bounds, margin: 0.1 });
          expect(frame.bounds.min).toHaveLength(3);
          expect(frame.bounds.max).toHaveLength(3);
          // Independent rendered matrices and canonical corner unions can differ by one rounding ULP.
          for (let axis = 0; axis < 3; axis++) {
            expect(frame.bounds.min[axis]).toBeCloseTo(actualBounds.min.getComponent(axis), 12);
            expect(frame.bounds.max[axis]).toBeCloseTo(actualBounds.max.getComponent(axis), 12);
          }
          expect(mocks.cameraRig.actorRef.send).toHaveBeenNthCalledWith(2, {
            type: 'setBounds',
            bounds: mocks.cameraRig.actorRef.getSnapshot().context.view.bounds,
          });
          expect(mocks.cameraRig.actorRef.send).toHaveBeenCalledTimes(2);
        });
      } finally {
        view.unmount();
      }
    },
  );

  it.each(['component:inherited', 'component:shadow'])(
    'should focus the nearest actual link with an identity child shadow for %s',
    async (componentId) => {
      const bytes = nestedFocusGlb();
      let scene: Object3D | undefined;
      mocks.observePreparation = vi.fn((candidate: Object3D) => {
        scene = candidate;
      });
      const view = render(
        <GltfMesh gltfFile={bytes} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
        { wrapper: KeyboardProvider },
      );
      try {
        await waitFor(() => {
          expect(unit().mechanism?.links['shadow']).toBeDefined();
        });
        if (!scene) {
          throw new Error('Missing genuine nested focus scene.');
        }
        act(() => {
          mocks.kinematics!.send({ type: 'setCoordinate', unitId, id: 'hinge', value: Math.PI / 2 });
        });
        const object = findComponentObject(scene, componentId);
        scene.updateMatrixWorld(true);
        const actualBounds = new Box3().setFromObject(object).applyMatrix4(createCanonicalGltfToTauMatrix());
        expect(actualBounds.isEmpty()).toBe(false);
        if (componentId === 'component:inherited') {
          expect(actualBounds.min.x).toBeLessThan(0);
          expect(actualBounds.min.z).toBe(2);
        } else {
          expect(actualBounds.min.x).toBe(2);
          expect(actualBounds.min.z).toBe(0);
        }
        mocks.cameraRig.actorRef.send.mockClear();
        mocks.modelUnit = { ...mocks.modelUnit, focusedComponentId: componentId };
        view.rerender(<GltfMesh gltfFile={bytes} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
        await waitFor(() => {
          expect(mocks.cameraRig.actorRef.send).toHaveBeenNthCalledWith(1, {
            type: 'frame',
            bounds: { min: actualBounds.min.toArray(), max: actualBounds.max.toArray() },
            margin: 0.1,
          });
          expect(mocks.cameraRig.actorRef.send).toHaveBeenNthCalledWith(2, {
            type: 'setBounds',
            bounds: mocks.cameraRig.actorRef.getSnapshot().context.view.bounds,
          });
        });
      } finally {
        view.unmount();
      }
    },
  );

  it('should focus published mixed parent geometry without applying its pose to an identity-linked child aggregate', async () => {
    const bytes = nestedFocusGlb({ mixedParent: true });
    const sourceManifest = buildGltfComponentManifest(bytes);
    expect(sourceManifest.nodesById['component:lid']?.meshNodeIndices).toEqual([1]);
    expect(sourceManifest.nodesById['component:lid']?.primitiveRefs).toHaveLength(1);
    expect(sourceManifest.nodesById['component:lid']?.bounds?.max[0]).toBe(3);
    const digest = contentDigest({ value: `sha256:${await sha256Bytes(bytes)}` });
    const publication: AdmittedAssembly['publication'] = {
      schemaVersion: 1,
      parts: {
        nested: {
          schemaVersion: 1,
          variants: {
            default: {
              source: { entry: 'nested.ts', files: {} },
              glb: { path: 'nested.glb', digest, byteLength: bytes.byteLength },
            },
          },
        },
      },
      occurrences: [{ id: 'placed', part: 'nested', variant: 'default', transform: new Matrix4().toArray() }],
    };
    const rootBytes = new TextEncoder().encode(JSON.stringify(publication));
    const root = {
      path: 'assembly.json',
      digest: contentDigest({ value: `sha256:${await sha256Bytes(rootBytes)}` }),
      byteLength: rootBytes.byteLength,
    };
    const metadata = await validateAdmittedAssemblyGlb({ ...publication, readAsset: async () => bytes });
    const componentId = metadata.components.find((entry) => entry.sourceComponentId === 'component:lid')?.component.id;
    const shadowId = metadata.components.find((entry) => entry.sourceComponentId === 'component:shadow')?.component.id;
    if (!componentId || !shadowId) {
      throw new Error('Missing real published mixed component identities.');
    }
    const { manifest } = buildResidentAssemblyComponentManifest({
      publication,
      metadata,
      geometryHash: root.digest,
      definitions: new Map([[digest, bytes]]),
    });
    expect(manifest.nodesById[componentId]?.meshNodeIndices).toEqual([1]);
    expect(manifest.nodesById[componentId]?.primitiveRefs).toHaveLength(1);
    expect(manifest.nodesById[componentId]?.bounds?.max[0]).toBe(7);
    expect(manifest.nodesById[shadowId]?.bounds?.min[0]).toBe(6);
    const focusedUnitId = `unit:${root.digest}`;
    const admitted: AdmittedAssembly = {
      ...mock<AdmittedAssembly>(),
      publication,
      readAsset: vi.fn(async () => bytes),
    };
    const props = {
      assemblyDisplay: { root, admitted, document: mock<CadAssemblyDisplay['document']>() },
      geometryHash: root.digest,
    };
    let scene: Object3D | undefined;
    mocks.observePreparation = vi.fn((candidate: Object3D) => {
      scene = candidate;
    });
    const view = render(<GltfMesh {...props} presentationRevision={1} enableMatcap={false} />, {
      wrapper: KeyboardProvider,
    });
    try {
      await waitFor(() => {
        expect(getKinematicsUnitState(mocks.kinematics!.getSnapshot().context, focusedUnitId).mechanism).toBeDefined();
      });
      if (!scene) {
        throw new Error('Missing genuine published mixed parent focus scene.');
      }
      const currentUnit = getKinematicsUnitState(mocks.kinematics!.getSnapshot().context, focusedUnitId);
      const hingeId = Object.entries(currentUnit.mechanism!.joints).find(([, joint]) =>
        currentUnit.mechanism!.links[joint.child]?.components.includes(componentId),
      )?.[0];
      if (!hingeId) {
        throw new Error('Missing actual remapped parent hinge.');
      }
      act(() => {
        mocks.kinematics!.send({ type: 'setCoordinate', unitId: focusedUnitId, id: hingeId, value: Math.PI / 2 });
      });
      const parent = findComponentObject(scene, componentId);
      const shadow = findComponentObject(scene, shadowId);
      expect(parent).toBeInstanceOf(Mesh);
      expect(shadow).toBeInstanceOf(Mesh);
      scene.updateMatrixWorld(true);
      const actualBounds = new Box3().setFromObject(parent).applyMatrix4(createCanonicalGltfToTauMatrix());
      const shadowBounds = new Box3().setFromObject(shadow).applyMatrix4(createCanonicalGltfToTauMatrix());
      expect(shadowBounds.min.x).toBe(6);
      expect(shadowBounds.min.z).toBe(0);
      expect(actualBounds.max.x).toBe(7);
      expect(actualBounds.max.z).toBe(3);
      mocks.cameraRig.actorRef.send.mockClear();
      mocks.modelUnit = { ...mocks.modelUnit, focusedComponentId: componentId };
      view.rerender(<GltfMesh {...props} presentationRevision={1} enableMatcap={false} />);
      await waitFor(() => {
        expect(mocks.cameraRig.actorRef.send).toHaveBeenNthCalledWith(1, {
          type: 'frame',
          bounds: { min: actualBounds.min.toArray(), max: actualBounds.max.toArray() },
          margin: 0.1,
        });
        expect(mocks.cameraRig.actorRef.send).toHaveBeenNthCalledWith(2, {
          type: 'setBounds',
          bounds: mocks.cameraRig.actorRef.getSnapshot().context.view.bounds,
        });
        expect(mocks.cameraRig.actorRef.send).toHaveBeenCalledTimes(2);
      });
    } finally {
      view.unmount();
    }
  });

  it('poses 100 independently remapped occurrence links without rereads, reparsing, uploads or pose serialization and keeps picking/explicit exact placement coherent', async () => {
    const bytes = buildHingedGlb(true);
    const digest = contentDigest({ value: `sha256:${await sha256Bytes(bytes)}` });
    const publication: AdmittedAssembly['publication'] = {
      schemaVersion: 1,
      parts: {
        hinge: {
          schemaVersion: 1,
          variants: {
            default: {
              source: { entry: 'hinge.ts', files: {} },
              glb: { path: 'hinge.glb', digest, byteLength: bytes.byteLength },
            },
          },
        },
      },
      occurrences: Array.from({ length: 100 }, (_, index) => ({
        id: `hinge-${index}`,
        part: 'hinge',
        variant: 'default',
        transform: new Matrix4().makeTranslation(index * 5, 0, 0).toArray(),
      })),
    };
    const rootBytes = new TextEncoder().encode(JSON.stringify(publication));
    const root = {
      path: 'assembly.json',
      digest: contentDigest({ value: `sha256:${await sha256Bytes(rootBytes)}` }),
      byteLength: rootBytes.byteLength,
    };
    const admitted: AdmittedAssembly = {
      ...mock<AdmittedAssembly>(),
      publication,
      readAsset: vi.fn(async () => bytes),
    };
    const metadata = await validateAdmittedAssemblyGlb({ ...publication, readAsset: async () => bytes });
    const parse = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    let scene: Object3D | undefined;
    mocks.observePreparation = vi.fn((candidate: Object3D) => {
      scene = candidate;
    });
    const view = render(
      <GltfMesh
        assemblyDisplay={{ root, admitted, document: mock() }}
        geometryHash={root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
      { wrapper: KeyboardProvider },
    );
    const assemblyUnitId = `unit:${root.digest}`;
    await waitFor(() => {
      expect(getKinematicsUnitState(mocks.kinematics!.getSnapshot().context, assemblyUnitId).mechanism).toBeDefined();
    });
    if (!scene) {
      throw new Error('Missing actual definition candidate');
    }
    const lidIds = metadata.components
      .filter((entry) => entry.sourceComponentId === 'component:lid')
      .map((entry) => entry.component.id);
    expect(lidIds).toHaveLength(100);
    const surfaces = lidIds.map((id) => {
      const object = findComponentObject(scene!, id);
      let surface: Mesh | undefined;
      object.traverse((child) => {
        if (!surface && child instanceof Mesh) {
          surface = child;
        }
      });
      if (!surface) {
        throw new Error('Missing occurrence surface');
      }
      return surface;
    });
    expect(new Set(surfaces.map((surface) => surface.geometry)).size).toBe(1);
    expect(new Set(surfaces.map((surface) => surface.material)).size).toBe(100);
    const { geometry } = surfaces[0]!;
    const position = geometry.getAttribute('position');
    if (!(position instanceof BufferAttribute)) {
      throw new Error('Expected noninterleaved source position');
    }
    const { version } = position;
    const bvh = getOrBuildBvh(geometry);
    const nativeInstances = surfaces.map((surface, index) => {
      if (!(surface instanceof InstancedMesh) || !(surface.instanceMatrix.array instanceof Float32Array)) {
        throw new Error('Missing actual native occurrence instance storage.');
      }
      const { parent } = surface;
      if (!parent || getModelComponentId(parent) !== lidIds[index]) {
        throw new Error('Missing actual independently linked occurrence parent.');
      }
      return {
        surface,
        parent,
        parentElements: [...parent.matrix.elements],
        attribute: surface.instanceMatrix,
        array: surface.instanceMatrix.array,
        values: [...surface.instanceMatrix.array],
        version: surface.instanceMatrix.version,
      };
    });
    expect(new Set(nativeInstances.map(({ parent }) => parent)).size).toBe(100);
    const serialize = vi.spyOn(Matrix4.prototype, 'toArray');
    const unit = getKinematicsUnitState(mocks.kinematics!.getSnapshot().context, assemblyUnitId);
    const hinges = Object.entries(unit.mechanism!.joints).filter(([, joint]) => joint.type === 'revolute');
    expect(hinges).toHaveLength(100);
    act(() => {
      for (const [id] of hinges) {
        mocks.kinematics!.send({ type: 'setCoordinate', unitId: assemblyUnitId, id, value: Math.PI / 2 });
      }
    });
    // Native slots stay immutable; each actual link-owned parent carries its current pose.
    for (const [index, instance] of nativeInstances.entries()) {
      expect(instance.parent.matrix.elements).not.toEqual(instance.parentElements);
      expect(instance.surface.instanceMatrix).toBe(instance.attribute);
      expect(instance.surface.instanceMatrix.array).toBe(instance.array);
      expect([...instance.array]).toEqual(instance.values);
      expect(instance.surface.instanceMatrix.version).toBe(instance.version);
      const slot = getModelComponentInstanceSlots(instance.surface)?.findIndex(
        ({ owner }) => owner.componentId === lidIds[index],
      );
      expect(slot).toBe(0);
      const matrix = getModelComponentWorldMatrix(instance.surface, slot, new Matrix4());
      if (!matrix) {
        throw new Error('Missing actual current occurrence world placement.');
      }
      const authoredMatrix = new Matrix4()
        .makeTranslation(index * 5, 0, 0)
        .multiply(new Matrix4().makeRotationZ(Math.PI / 2));
      for (const [element, value] of authoredMatrix.elements.entries()) {
        expect(matrix.elements[element]).toBeCloseTo(value, 6);
      }
      const actualPoint = new Vector3(2.2, 0.2, 0).applyMatrix4(matrix);
      // Independent authored T(index*5,0,0) and +pi/2 Z hinge for ALL 100 actual slots.
      expect(actualPoint.x).toBeCloseTo(index * 5 - 0.2, 6);
      expect(actualPoint.y).toBeCloseTo(2.2, 6);
      expect(actualPoint.z).toBeCloseTo(0, 6);
    }
    expect(serialize).not.toHaveBeenCalled();
    const posedParents = nativeInstances.map(({ parent }) => [...parent.matrix.elements]);
    if (!mocks.frame) {
      throw new Error('Missing the actual mounted frame callback.');
    }
    act(() => {
      for (let frame = 0; frame < 120; frame++) {
        mocks.frame?.();
      }
    });
    expect(serialize).not.toHaveBeenCalled();
    for (const [index, instance] of nativeInstances.entries()) {
      expect(instance.parent.matrix.elements).toEqual(posedParents[index]);
      expect(instance.surface.instanceMatrix).toBe(instance.attribute);
      expect(instance.surface.instanceMatrix.array).toBe(instance.array);
      expect([...instance.array]).toEqual(instance.values);
      expect(instance.surface.instanceMatrix.version).toBe(instance.version);
    }
    expect(parse).toHaveBeenCalledOnce();
    expect(admitted.readAsset).toHaveBeenCalledOnce();
    expect(position.version).toBe(version);
    expect(getOrBuildBvh(geometry)).toBe(bvh);
    const last = surfaces.at(-1)!;
    const instanceId = getModelComponentInstanceSlots(last)?.findIndex(
      ({ owner }) => owner.componentId === lidIds.at(-1),
    );
    expect(instanceId).toBe(0);
    const worldMatrix = getModelComponentWorldMatrix(last, instanceId, new Matrix4());
    if (!worldMatrix) {
      throw new Error('Missing current canonical occurrence slot matrix');
    }
    const point = new Vector3(2.2, 0.2, 0).applyMatrix4(worldMatrix);
    // The actual preparation observer captures GLTF space before the wrapper's GLTF -> Tau adapter.
    // Independently authored T(99*5,0,0) and a +pi/2 Z hinge place this source point here.
    expect(point.x).toBeCloseTo(99 * 5 - 0.2, 6);
    expect(point.y).toBeCloseTo(2.2, 6);
    expect(point.z).toBeCloseTo(0, 6);
    const hits = new Raycaster(point.clone().add(new Vector3(0, 0, 1)), new Vector3(0, 0, -1)).intersectObject(
      scene,
      true,
    );
    expect(hits[0]?.object).toBe(last);
    expect(hits[0]?.instanceId).toBe(instanceId);
    expect(hits[0] && getModelComponentHitOwner(hits[0])).toEqual({
      unitId: assemblyUnitId,
      componentId: lidIds.at(-1),
    });
    const accelerated = raycastFirstVisibleMeshHit({
      raycaster: new Raycaster(point.clone().add(new Vector3(0, 0, 1)), new Vector3(0, 0, -1)),
      meshes: surfaces,
    });
    expect(accelerated?.object).toBe(last);
    expect(accelerated?.instanceId).toBe(instanceId);
    expect(accelerated && getModelComponentHitOwner(accelerated)).toEqual({
      unitId: assemblyUnitId,
      componentId: lidIds.at(-1),
    });
    const source = getGltfAssemblySource(last);
    if (!source) {
      throw new Error('Missing committed source descriptor');
    }
    const captured = captureGltfAssemblyPlacements(
      source,
      [lidIds[0]!, lidIds.at(-1)!],
      getKinematicsUnitState(mocks.kinematics!.getSnapshot().context, assemblyUnitId),
    );
    expect(captured).toHaveLength(2);
    expect(serialize).toHaveBeenCalledTimes(2);
    expect(captured?.[1]?.componentId).toBe(lidIds.at(-1));
    view.unmount();
  });

  it.each([false, true])(
    'should include actual ordinary occurrence fat edges with unindexed=%s in committed moving draw inventory',
    async (nonIndexedEdges) => {
      const bytes = buildHingedGlb(true, true, nonIndexedEdges);
      const digest = contentDigest({ value: `sha256:${await sha256Bytes(bytes)}` });
      const publication: AdmittedAssembly['publication'] = {
        schemaVersion: 1,
        parts: {
          hinge: {
            schemaVersion: 1,
            variants: {
              default: {
                source: { entry: 'hinge.ts', files: {} },
                glb: { path: 'hinge.glb', digest, byteLength: bytes.byteLength },
              },
            },
          },
        },
        occurrences: [
          { id: 'left', part: 'hinge', variant: 'default', transform: new Matrix4().toArray() },
          {
            id: 'right',
            part: 'hinge',
            variant: 'default',
            transform: new Matrix4().makeTranslation(5, 0, 0).toArray(),
          },
        ],
      };
      const rootBytes = new TextEncoder().encode(JSON.stringify(publication));
      const root = {
        path: 'assembly.json',
        digest: contentDigest({ value: `sha256:${await sha256Bytes(rootBytes)}` }),
        byteLength: rootBytes.byteLength,
      };
      const admitted: AdmittedAssembly = {
        ...mock<AdmittedAssembly>(),
        publication,
        readAsset: vi.fn(async () => bytes),
      };
      let scene: Object3D | undefined;
      mocks.observePreparation = vi.fn((candidate: Object3D) => {
        scene = candidate;
      });
      const view = render(
        <GltfMesh
          assemblyDisplay={{ root, admitted, document: mock() }}
          geometryHash={root.digest}
          presentationRevision={1}
          enableMatcap={false}
        />,
        { wrapper: KeyboardProvider },
      );
      try {
        await waitFor(() => {
          expect(scene && captureCommittedGltfDrawInventory(scene)).toBeDefined();
        });
        const capture = captureCommittedGltfDrawInventory(scene!);
        if (!capture) {
          throw new Error('Missing committed ordinary fat-edge inventory');
        }
        expect(capture.edges).toHaveLength(4);
        for (const row of capture.edges) {
          let edgeObject: Object3D | undefined;
          scene!.traverse((object) => {
            if (object.id === row.objectId) {
              edgeObject = object;
            }
          });
          if (!edgeObject) {
            throw new Error('Captured ordinary edge is absent from the actual scene');
          }
          expect(getGltfOccurrenceEdgeBatch(edgeObject)).toBeUndefined();
        }
        expect(capture.edges.reduce((sum, row) => sum + row.mandatoryTriangles, 0)).toBe(24);
        expect(
          capture.edges.every(
            (row) => row.segments.length === 1 && row.segments[0]?.count === 1 && row.positionBytes === 24,
          ),
        ).toBe(true);
        const poses = getKinematicsUnitState(mocks.kinematics!.getSnapshot().context, capture.unitId);
        const hinges = Object.entries(poses.mechanism!.joints).filter(([, joint]) => joint.type === 'revolute');
        expect(hinges).toHaveLength(2);
        act(() => {
          for (const [id] of hinges) {
            mocks.kinematics!.send({ type: 'setCoordinate', unitId: capture.unitId, id, value: Math.PI / 2 });
          }
        });
        expect(capture.isCurrent()).toBe(false);
        const moved = captureCommittedGltfDrawInventory(scene!);
        if (!moved) {
          throw new Error('Missing posed ordinary fat-edge inventory');
        }
        expect(moved.edges.map(({ geometryId, positionVersions }) => ({ geometryId, positionVersions }))).toEqual(
          capture.edges.map(({ geometryId, positionVersions }) => ({ geometryId, positionVersions })),
        );
        expect(moved.edges.reduce((sum, row) => sum + row.mandatoryTriangles, 0)).toBe(24);
        expect(
          moved.edges.filter((row, index) =>
            row.matrixWorld.some((value, lane) => value !== capture.edges[index]!.matrixWorld[lane]),
          ).length,
        ).toBe(2);
        expect(admitted.readAsset).toHaveBeenCalledOnce();
      } finally {
        view.unmount();
      }
    },
  );

  it('should load the presented mechanism, pose the presented scene, and restore and clear it on unmount', async () => {
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const view = render(
      <GltfMesh gltfFile={buildHingedGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      { wrapper: KeyboardProvider },
    );
    await waitFor(() => {
      expect(unit().mechanism).toBeDefined();
    });
    const gltf = (await parseAsync.mock.results[0]?.value) as GLTF;
    const lid = findComponentObject(gltf.scene, 'component:lid');
    const base = findComponentObject(gltf.scene, 'component:base');

    act(() => {
      mocks.kinematics!.send({ type: 'setCoordinate', unitId, id: 'hinge', value: Math.PI / 2 });
    });

    expect(rounded(lid.matrix)).toEqual(rounded(new Matrix4().makeRotationZ(Math.PI / 2)));
    expect(rounded(base.matrix)).toEqual(rounded(new Matrix4()));

    view.unmount();

    expect(unit().mechanism).toBeUndefined();
    expect(rounded(lid.matrix)).toEqual(rounded(new Matrix4()));
  });
  it('should retain occurrence source placement through active posing and old-unit cleanup without reparsing', async () => {
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const view = render(
      <GltfMesh gltfFile={buildHingedGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      { wrapper: KeyboardProvider },
    );
    await waitFor(() => {
      expect(unit().mechanism).toBeDefined();
    });
    const gltf = (await parseAsync.mock.results[0]?.value) as GLTF;
    const lid = findComponentObject(gltf.scene, 'component:lid');
    act(() => {
      mocks.kinematics!.send({ type: 'setCoordinate', unitId, id: 'hinge', value: Math.PI / 2 });
    });
    view.rerender(
      <GltfMesh gltfFile={placedHingedGlb(4)} geometryHash='a' presentationRevision={2} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(rounded(lid.matrix)).toEqual(
        rounded(new Matrix4().makeRotationZ(Math.PI / 2).multiply(new Matrix4().makeTranslation(4, 0, 0))),
      );
    });
    expect(parseAsync).toHaveBeenCalledOnce();
    view.rerender(
      <GltfMesh gltfFile={placedHingedGlb(8)} geometryHash='b' presentationRevision={3} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(getKinematicsUnitState(mocks.kinematics!.getSnapshot().context, 'unit:b').mechanism).toBeDefined();
    });
    expect(rounded(lid.matrix)).toEqual(rounded(new Matrix4().makeTranslation(8, 0, 0)));
    expect(parseAsync).toHaveBeenCalledOnce();
    act(() => {
      mocks.kinematics!.send({ type: 'setCoordinate', unitId: 'unit:b', id: 'hinge', value: Math.PI / 2 });
    });
    expect(rounded(lid.matrix)).toEqual(
      rounded(new Matrix4().makeRotationZ(Math.PI / 2).multiply(new Matrix4().makeTranslation(8, 0, 0))),
    );
    view.unmount();
    expect(rounded(lid.matrix)).toEqual(rounded(new Matrix4().makeTranslation(8, 0, 0)));
  });
});
