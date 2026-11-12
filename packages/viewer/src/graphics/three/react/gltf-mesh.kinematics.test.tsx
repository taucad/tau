import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGltfMeshPresentationHarness } from '#graphics/three/react/gltf-mesh.test-utils.jsx';
import { createActor } from 'xstate';
import type { Actor, SnapshotFrom } from 'xstate';
import { Matrix4 } from 'three';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { writeGlb } from '@taucad/geometry-core';
import type { GlbMaterial } from '@taucad/geometry-core';
import { tauCadTopologyExtension } from '@taucad/types/constants';
import { getModelComponentId } from '#graphics/three/utils/model-component-owner.js';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { getKinematicsUnitState, kinematicsMachine } from '#machines/kinematics.machine.js';
import type { KinematicsSceneAdapterLogic } from '#machines/graphics.machine.js';
import type { Mechanism } from '@taucad/kinematics';

// The in-place and camera suites replace `useKinematicsViewer`; this one keeps it real, so the GltfMesh
// wiring (unit id, presented scene and manifest) reaches the kinematics actor and the pose composer. The mocked graphics
// does what graphics does with them: a commit loads the unit's mechanism, and the scene's adapter runs with the
// kinematics child as its input.
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
      send: vi.fn((event: { type: string } & Record<string, unknown>) => {
        const kinematics = mocks.kinematics!;
        switch (event.type) {
          case 'gltfPresentationCommitted': {
            const { mechanism } = event['manifest'] as { mechanism?: unknown };
            const unitId = event['unitId'] as string;
            kinematics.send(
              mechanism === undefined
                ? { type: 'clearMechanism', unitId }
                : { type: 'loadMechanism', unitId, mechanism: mechanism as Mechanism },
            );
            break;
          }
          case 'kinematicsSceneAttached': {
            mocks.sceneAdapter?.stop();
            mocks.sceneAdapter = createActor(event['adapter'] as KinematicsSceneAdapterLogic, {
              input: { kinematics },
            });
            mocks.sceneAdapter.start();
            break;
          }
          case 'kinematicsSceneDetached': {
            mocks.sceneAdapter?.stop();
            mocks.sceneAdapter = undefined;
            break;
          }
          default:
        }
      }),
      getSnapshot: () => ({
        context: {
          modelPointerClickSuppressionReasons: [],
          suppressNextModelPointerClick: false,
          // The host reads the section barrier from graphics as it prepares.
          isSectionViewActive: mocks.sectionView.isActive,
        },
      }),
    },
    gl: Object.create(null) as { compileAsync?: ReturnType<typeof vi.fn>; coordinateSystem?: number },
    invalidate: vi.fn(),
    kinematics: undefined as Actor<typeof kinematicsMachine> | undefined,
    sceneAdapter: undefined as { start: () => void; stop: () => void } | undefined,
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
    useFrame: () => undefined,
    // GltfMesh reads the whole state; the kinematics hooks and the section clip select from it.
    useThree: (selector?: (current: ReturnType<typeof state>) => unknown) => (selector ? selector(state()) : state()),
  };
});

vi.mock('#graphics/three/three-graphics-backend-context.jsx', () => ({
  useThreeGraphicsBackend: () => 'webgl',
}));

vi.mock('#hooks/use-graphics.jsx', async () => {
  const { useSelector } = await import('@xstate/react');
  return {
    useCameraRig: () => mocks.cameraRig,
    useGraphics: () => harness.graphics,
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

vi.mock('#machines/model-interaction.machine.js', () => ({
  deriveModelInteractionUnitId: ({ geometryHash }: { geometryHash?: string }) => `unit:${geometryHash ?? ''}`,
  getModelInteractionUnitState: () => mocks.modelUnit,
}));

vi.mock('#graphics/three/use-section-view.js', () => ({
  resolveSectionViewRaycastClip: () => undefined,
}));

const { GltfMesh: RealGltfMesh } = await import('#graphics/three/react/gltf-mesh.jsx');
const { deriveModelInteractionUnitId } = await import('#machines/model-interaction.machine.js');
const harness = createGltfMeshPresentationHarness({
  graphicsActor: mocks.graphicsActor,
  GltfMesh: RealGltfMesh,
  deriveUnitId: deriveModelInteractionUnitId,
});
const { GltfMesh } = harness;
afterEach(() => {
  harness.reset();
});

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

function buildHingedGlb(): Uint8Array<ArrayBuffer> {
  const part = (name: string, x: number) => ({
    name,
    primitives: [
      {
        mode: 4,
        positions: Float32Array.from([x, 0, 0, x + 1, 0, 0, x, 1, 0]),
        normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        indices: Uint32Array.from([0, 1, 2]),
        material: surfaceMaterial,
      },
    ],
  });
  return writeGlb({
    nodes: [part('Base', 0), part('Lid', 2)],
    extensions: {
      [tauCadTopologyExtension]: {
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

describe('GltfMesh kinematics wiring', () => {
  const unit = () => getKinematicsUnitState(mocks.kinematics!.getSnapshot().context, unitId);

  beforeEach(() => {
    mocks.kinematics = createActor(kinematicsMachine, { input: {} }).start();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mocks.kinematics?.stop();
    mocks.graphicsActor.send.mockClear();
    mocks.invalidate.mockClear();
  });

  it('should load the presented mechanism, pose the presented scene, and restore the scene on unmount', async () => {
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

    // The adapter left with the scene and put it back as built; graphics keeps the mechanism and its pose (G12, D14).
    expect(mocks.sceneAdapter).toBeUndefined();
    expect(rounded(lid.matrix)).toEqual(rounded(new Matrix4()));
    expect(unit().coordinates).toEqual({ hinge: Math.PI / 2 });
  });
});
