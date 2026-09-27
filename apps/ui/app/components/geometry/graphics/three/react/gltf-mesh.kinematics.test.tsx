import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { Actor, SnapshotFrom } from 'xstate';
import { Matrix4 } from 'three';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { writeGlb } from '@taucad/geometry-core';
import type { GlbMaterial } from '@taucad/geometry-core';
import { tauCadTopologyExtension } from '@taucad/types/constants';
import { getModelComponentId } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import { KeyboardProvider } from '#hooks/use-keyboard.js';
import { getKinematicsUnitState, kinematicsMachine } from '#machines/kinematics.machine.js';

// The in-place and camera suites replace `useKinematicsViewer`; this one keeps it real, so the GltfMesh
// wiring (unit id, presented scene and manifest) reaches the kinematics actor and the pose composer.
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
        context: { modelPointerClickSuppressionReasons: [], suppressNextModelPointerClick: false },
      }),
    },
    gl: Object.create(null) as { compileAsync?: ReturnType<typeof vi.fn>; coordinateSystem?: number },
    invalidate: vi.fn(),
    kinematics: undefined as Actor<typeof kinematicsMachine> | undefined,
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
    sectionView: { enableMesh: false, isActive: false, plane: undefined },
  };
});

vi.mock('@react-three/fiber', () => {
  const state = () => ({
    camera: mocks.camera,
    controls: undefined,
    gl: mocks.gl,
    invalidate: mocks.invalidate,
    size: { height: 768, width: 1024 },
    get: () => undefined,
  });
  return {
    useFrame: () => undefined,
    // GltfMesh reads the whole state; the kinematics hooks select from it.
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

vi.mock('#machines/model-interaction.machine.js', () => ({
  deriveModelInteractionUnitId: ({ geometryHash }: { geometryHash?: string }) => `unit:${geometryHash ?? ''}`,
  getModelInteractionUnitState: () => mocks.modelUnit,
}));

vi.mock('#components/geometry/graphics/three/use-section-view.js', () => ({
  resolveSectionViewRaycastClip: () => undefined,
  useSectionViewFlags: () => mocks.sectionView,
}));

const { GltfMesh } = await import('#components/geometry/graphics/three/react/gltf-mesh.js');

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
});
