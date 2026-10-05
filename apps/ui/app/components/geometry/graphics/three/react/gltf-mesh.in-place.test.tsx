import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { useLayoutEffect } from 'react';
import type { RenderFrame } from '@taucad/spatial';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as geometryCore from '@taucad/geometry-core';
import { writeGlb } from '@taucad/geometry-core';
import { contentDigest } from '@taucad/cache-core';
import type { AdmittedAssembly, PublishedPartAsset, PublishedPartVariant } from '@taucad/runtime/types';
import { mock } from 'vitest-mock-extended';
import type { CadAssemblyDisplay } from '#machines/cad.machine.js';
import { deriveModelInteractionUnitId } from '#machines/model-interaction.machine.js';
import type { EventFrom } from 'xstate';
import type {
  graphicsMachine,
  AssemblyDetailCalibration,
  GltfPresentationTelemetry,
} from '#machines/graphics.machine.js';
import type { GlbMaterial } from '@taucad/geometry-core';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import {
  Material,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  BufferGeometry,
  BufferAttribute,
  Float16BufferAttribute,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  PlaneGeometry,
  OrthographicCamera,
  PerspectiveCamera,
  Box3,
  Raycaster,
  Texture,
  Vector3,
  InstancedMesh,
  Matrix4,
  Matrix3,
} from 'three';
import * as hashing from '@taucad/utils/hash';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { float } from 'three/tsl';
import type {
  BufferGeometryEventMap,
  Intersection,
  MaterialEventMap,
  Mesh,
  NormalBufferAttributes,
  Object3D,
} from 'three';
import { getCachedBvh, getOrBuildBvh } from '#components/geometry/graphics/three/utils/bvh-cache.js';
import { computeBoundsTree, estimateMemoryInBytes } from 'three-mesh-bvh';
import {
  getModelComponentInstanceSlots,
  getModelComponentSourceGeometry,
  getModelComponentHitOwner,
  getModelComponentWorldMatrix,
  getModelComponentId,
  getModelComponentOwner,
} from '#components/geometry/graphics/three/utils/model-component-owner.js';
import {
  getGltfFatLinePositions,
  getGltfOccurrenceEdgeBatch,
} from '#components/geometry/graphics/three/materials/gltf-edges.js';
import * as threeBackend from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import * as assemblyDemand from '#components/geometry/graphics/three/utils/assembly-demand-index.js';
import * as bvhRaycast from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import * as surfaceBatchOwners from '#components/geometry/graphics/three/utils/gltf-surface-batches.js';
import * as sectionTopology from '#components/geometry/graphics/three/utils/section-surface-topology.js';
import { parseGltfBytes } from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import { getModelEmphasisSet } from '#components/geometry/graphics/three/materials/model-emphasis-registry.js';

const mocks = vi.hoisted(() => {
  const detailCalibration = { value: undefined as AssemblyDetailCalibration | undefined };
  const sceneBounds = { min: [-20, -10, -5], max: [20, 10, 5] };
  const selectedComponentIds: string[] = [];
  const opacityByComponentId: Record<string, number> = {};
  return {
    detailCalibration,
    noHoveredComponentIds: [] as readonly string[],
    kinematicsRef: { getSnapshot: () => ({ context: { unitsById: {}, revision: 0 } }) },
    camera: undefined as OrthographicCamera | undefined,
    cameraRig: {
      actorRef: {
        getSnapshot: () => ({ context: { view: { bounds: sceneBounds } } }),
        send: vi.fn(),
      },
      perspectiveCamera: { name: 'perspective', coordinateSystem: undefined, updateProjectionMatrix: vi.fn() },
      orthographicCamera: { name: 'orthographic', coordinateSystem: undefined, updateProjectionMatrix: vi.fn() },
    },
    graphicsActor: {
      send: vi.fn<(event: EventFrom<typeof graphicsMachine>) => void>(),
      getSnapshot: () => ({
        context: {
          assemblyDetailCalibration: detailCalibration.value,
          measurements: [],
          modelPointerClickSuppressionReasons: [],
          suppressNextModelPointerClick: false,
          viewerHoverSuppressionReasons: [] as string[],
        },
      }),
    },
    gl: Object.create(null) as { coordinateSystem?: number },
    observePreparation: undefined as ReturnType<typeof vi.fn<(scene: Object3D) => void>> | undefined,
    frameCallback: undefined as (() => void) | undefined,
    invalidate: vi.fn(),
    rootScene: { name: 'viewport-lighting-scene' },
    modelUnit: {
      focusedComponentId: undefined as string | undefined,
      hiddenComponentIds: [] as string[],
      hoveredComponentId: undefined,
      isolatedComponentIds: [] as string[],
      manifest: undefined,
      opacityByComponentId,
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
      size: { height: 768, width: 1024 },
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
  useKinematicsRef: () => mocks.kinematicsRef,
  useGraphics: () => mocks.graphicsActor,
  useGraphicsSelector: (selector: (snapshot: ReturnType<typeof mocks.graphicsActor.getSnapshot>) => unknown) =>
    selector(mocks.graphicsActor.getSnapshot()),
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

vi.mock(import('#machines/model-interaction.machine.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  getModelInteractionUnitState: () => mocks.modelUnit,
}));

vi.mock('#components/geometry/graphics/three/use-section-view.js', () => ({
  resolveSectionViewRaycastClip: () => undefined,
  useSectionViewFlags: () => mocks.sectionView,
}));

vi.mock('#components/geometry/graphics/three/react/kinematics-viewer.js', () => ({
  useKinematicsViewer: () => () => undefined,
}));

const {
  GltfMesh,
  captureCommittedGltfDrawInventory,
  captureLiveGltfAssemblyResourceInventory,
  armGltfAssemblyAdmissionResourceInventory,
  clearGltfAssemblyAdmissionResourceInventory,
  captureRequestedGltfAssemblyPreparation,
  isOpaqueAssemblyBatchMaterial,
  deriveAssemblyDetailGeometry,
  estimateAssemblyDetailPixelError,
  shouldUseAssemblyDetail,
} = await import('#components/geometry/graphics/three/react/gltf-mesh.js');

const surfaceMaterial: GlbMaterial = {
  doubleSided: false,
  alphaMode: 'OPAQUE',
  pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1], metallicFactor: 0.1, roughnessFactor: 0.8 },
};

const prepareSurfaceBatches = surfaceBatchOwners.createGltfSurfaceBatches;
beforeEach(() => {
  vi.spyOn(surfaceBatchOwners, 'createGltfSurfaceBatches').mockImplementation((...args) => {
    mocks.observePreparation?.(args[0]);
    return prepareSurfaceBatches(...args);
  });
});

function buildGlb({ lift = 0, indices = [0, 1, 2], occurrences = 1, translation = 0 } = {}): Uint8Array<ArrayBuffer> {
  const bytes = writeGlb({
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
  if (occurrences === 1 && translation === 0) {
    return bytes;
  }
  const { json } = parseGltfBytes(bytes);
  json.nodes = Array.from({ length: occurrences }, (_, nodeIndex) => ({
    ...json.nodes![0]!,
    name: `Occurrence ${nodeIndex}`,
    translation: [translation + nodeIndex * 5, 0, 0],
  }));
  json.scenes![0]!.nodes = json.nodes.map((_, nodeIndex) => nodeIndex);
  return packGltfJson(bytes, json);
}

function packGltfJson(
  bytes: Uint8Array<ArrayBuffer>,
  json: ReturnType<typeof parseGltfBytes>['json'],
): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(encoded.byteLength / 4) * 4;
  const originalLength = new DataView(bytes.buffer).getUint32(12, true);
  const remainder = bytes.subarray(20 + originalLength);
  const output = new Uint8Array(20 + padded + remainder.byteLength);
  output.set(bytes.subarray(0, 12));
  const view = new DataView(output.buffer);
  view.setUint32(8, output.byteLength, true);
  view.setUint32(12, padded, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  output.fill(0x20, 20, 20 + padded);
  output.set(encoded, 20);
  output.set(remainder, 20 + padded);
  return output;
}

async function residentAssembly({
  changed = false,
  appearance = false,
  translation = 0,
  occurrenceCount,
  textured = false,
  color = [1, 0, 0, 1],
  sourceTransparent = false,
  sourceTransmission = 0,
  sourceGrid,
  sharedAccessorCopies,
  sourcePlacement,
  occurrencePlacement,
  spacing = 2,
  withEdges = false,
  sharedSourceBacking = false,
}: {
  changed?: boolean;
  appearance?: boolean;
  translation?: number;
  occurrenceCount?: number;
  textured?: boolean;
  color?: [number, number, number, number];
  sourceTransparent?: boolean;
  sourceTransmission?: number;
  sourceGrid?: number;
  sharedAccessorCopies?: number;
  sourcePlacement?: number[];
  occurrencePlacement?: number[];
  spacing?: number;
  withEdges?: boolean;
  sharedSourceBacking?: boolean;
} = {}): Promise<CadAssemblyDisplay> {
  const definitionBytes = (other: boolean): Uint8Array<ArrayBuffer> => {
    const grid = sourceGrid ? new PlaneGeometry(10, 10, sourceGrid, sourceGrid) : undefined;
    const bytes = writeGlb({
      nodes: [
        {
          name: other ? 'Other' : 'Retained',
          primitives: [
            {
              mode: 4,
              positions: grid
                ? Float32Array.from(grid.getAttribute('position').array)
                : Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, other && changed ? 2 : 0]),
              normals: grid
                ? Float32Array.from(grid.getAttribute('normal').array)
                : Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
              indices: grid?.index ? Uint32Array.from(grid.index.array) : Uint32Array.from([0, 1, 2]),
              material:
                !other && appearance
                  ? {
                      ...surfaceMaterial,
                      pbrMetallicRoughness: { ...surfaceMaterial.pbrMetallicRoughness, baseColorFactor: color },
                    }
                  : surfaceMaterial,
            },
            ...(withEdges
              ? [
                  {
                    mode: 1,
                    positions: new Float32Array([0, 0, 0, 1, 0, 0]),
                    indices: new Uint32Array([0, 1]),
                    material: surfaceMaterial,
                  },
                ]
              : []),
          ],
        },
      ],
    });
    grid?.dispose();
    const { json } = parseGltfBytes(bytes);
    if (sourcePlacement) {
      json.nodes![0]!.matrix = sourcePlacement;
    }
    if (sourceTransparent) {
      for (const material of json.materials ?? []) {
        Object.assign(material, { alphaMode: 'BLEND' });
        if (material.pbrMetallicRoughness) {
          material.pbrMetallicRoughness.baseColorFactor = [0.5, 0.5, 0.5, 0.5];
        }
      }
    }
    if (sourceTransmission > 0) {
      Object.assign(json, { extensionsUsed: ['KHR_materials_transmission'] });
      for (const material of json.materials ?? []) {
        Object.assign(material, {
          /* eslint-disable @typescript-eslint/naming-convention -- The glTF specification requires this exact external extension key. */
          extensions: { KHR_materials_transmission: { transmissionFactor: sourceTransmission } },
          /* eslint-enable @typescript-eslint/naming-convention -- Restore naming checks after the exact external fields. */
        });
      }
    }
    json.nodes![0]!.extras = { tauComponentId: 'component:source', tauComponentKind: 'part' };
    if (sharedAccessorCopies) {
      json.accessors!.push(...Array.from({ length: sharedAccessorCopies }, () => ({ ...json.accessors![0]! })));
    }
    if (textured && !other) {
      json.images = [
        {
          uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
        },
      ];
      json.textures = [{ source: 0 }, { source: 0, sampler: 0 }];
      json.samplers = [{ magFilter: 9728, minFilter: 9728 }];
      const material = json.materials?.[0];
      if (!material) {
        throw new Error('Expected retained definition material');
      }
      material.pbrMetallicRoughness = { ...material.pbrMetallicRoughness, baseColorTexture: { index: 0 } };
      material.emissiveTexture = { index: 1 };
    }
    return packGltfJson(bytes, json);
  };
  const assets = new Map<PublishedPartAsset['digest'], Uint8Array<ArrayBuffer>>();
  const variants: PublishedPartVariant[] = [];
  const preparedAssets = await Promise.all(
    [false, true].map(async (other) => {
      const bytes = definitionBytes(other);
      return { bytes, digest: contentDigest({ value: `sha256:${await hashing.sha256Bytes(bytes)}` }) };
    }),
  );
  if (sharedSourceBacking) {
    const [first, second] = preparedAssets;
    const gap = 4096;
    const backing = new Uint8Array(first!.bytes.byteLength + gap + second!.bytes.byteLength);
    backing.set(first!.bytes);
    backing.set(second!.bytes, first!.bytes.byteLength + gap);
    first!.bytes = backing.subarray(0, first!.bytes.byteLength);
    second!.bytes = backing.subarray(first!.bytes.byteLength + gap);
  }
  for (const { bytes, digest } of preparedAssets) {
    assets.set(digest, bytes);
    variants.push({
      source: { entry: 'part.ts', files: {} },
      glb: { path: `${digest}.glb`, digest, byteLength: bytes.byteLength },
    });
  }
  const transform = (x: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1];
  const publication: AdmittedAssembly['publication'] = {
    schemaVersion: 1,
    parts: {
      retained: { schemaVersion: 1, variants: { default: variants[0]! } },
      other: { schemaVersion: 1, variants: { default: variants[1]! } },
    },
    occurrences: [
      {
        id: 'assembly',
        transform: transform(translation),
        children: [
          { id: 'left', part: 'retained', variant: 'default', transform: transform(0) },
          { id: 'right', part: 'retained', variant: 'default', transform: transform(5) },
          { id: 'other', part: 'other', variant: 'default', transform: transform(10) },
        ],
      },
    ],
  };
  if (occurrenceCount !== undefined) {
    const group = publication.occurrences[0]!;
    if (!group.children) {
      throw new Error('Expected an assembly group');
    }
    const repeated: AdmittedAssembly['publication'] = {
      ...publication,
      occurrences: [
        {
          ...group,
          children: Array.from({ length: occurrenceCount }, (_, index) => ({
            id: `copy-${index}`,
            part: 'retained',
            variant: 'default',
            transform: occurrencePlacement ?? transform(index * spacing),
          })),
        },
      ],
    };
    return residentAssemblyFromAssets(repeated, assets);
  }
  return residentAssemblyFromAssets(publication, assets);
}

async function residentAssemblyFromAssets(
  publication: AdmittedAssembly['publication'],
  assets: ReadonlyMap<PublishedPartAsset['digest'], Uint8Array<ArrayBuffer>>,
): Promise<CadAssemblyDisplay> {
  const admitted: AdmittedAssembly = {
    ...mock<AdmittedAssembly>(),
    publication,
    readAsset: vi.fn(async (digest: PublishedPartAsset['digest']) => {
      const bytes = assets.get(digest);
      if (!bytes) {
        throw new Error('Unpinned definition requested');
      }
      return bytes;
    }),
  };
  const rootBytes = new TextEncoder().encode(JSON.stringify(publication));
  const root = {
    path: '.tau/parts/current.json',
    digest: contentDigest({ value: `sha256:${await hashing.sha256Bytes(rootBytes)}` }),
    byteLength: rootBytes.byteLength,
  };
  return { root, admitted, document: mock<CadAssemblyDisplay['document']>() };
}

function surfacesOf(scene: Object3D): Mesh[] {
  const surfaces: Mesh[] = [];
  scene.traverse((object) => {
    if (object.type === 'Mesh') {
      surfaces.push(object as Mesh);
    }
  });
  return surfaces;
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

function occurrenceEdgeEndpoints(scene: Object3D): number[] {
  const endpoints: number[] = [];
  scene.traverse((object) => {
    if (!getGltfOccurrenceEdgeBatch(object)) {
      return;
    }
    const positions = getGltfFatLinePositions(object);
    if (!positions) {
      throw new Error('Expected mandatory occurrence edge positions');
    }
    for (let offset = 0; offset < positions.length; offset += 3) {
      endpoints.push(new Vector3().fromArray(positions, offset).applyMatrix4(object.matrixWorld).x);
    }
  });
  return endpoints.toSorted((left, right) => left - right);
}

function findOccurrenceEdgeBatch(scene: Object3D): NonNullable<ReturnType<typeof getGltfOccurrenceEdgeBatch>> {
  let found: ReturnType<typeof getGltfOccurrenceEdgeBatch>;
  scene.traverse((object) => {
    found ??= getGltfOccurrenceEdgeBatch(object);
  });
  if (!found) {
    throw new Error('Expected a mandatory occurrence edge batch');
  }
  return found;
}

const committedRevisions = (): number[] =>
  mocks.graphicsActor.send.mock.calls
    .map((call) => call[0] as { type: string; revision?: number })
    .filter((event) => event.type === 'gltfPresentationCommitted')
    .map((event) => event.revision ?? -1);

const measuredResources = (): GltfPresentationTelemetry['assemblyResources'] =>
  mocks.graphicsActor.send.mock.calls
    .map(([event]) => event as { type: string; telemetry?: GltfPresentationTelemetry })
    .findLast((event) => event.type === 'gltfPresentationMeasured')?.telemetry?.assemblyResources;

describe('GltfMesh in-place updates', () => {
  beforeEach(() => {
    mocks.camera = new OrthographicCamera(-3000, 3000, 3000, -3000, 0.1, 10_000);
    mocks.camera.position.set(0, 0, 100);
    mocks.camera.lookAt(0, 0, 0);
    mocks.camera.updateMatrixWorld();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mocks.graphicsActor.send.mockClear();
    mocks.cameraRig.actorRef.send.mockClear();
    mocks.invalidate.mockClear();
    mocks.frameCallback = undefined;
    mocks.modelUnit.hiddenComponentIds = [];
    mocks.modelUnit.isolatedComponentIds = [];
    mocks.modelUnit.opacityByComponentId = {};
    mocks.modelUnit.focusedComponentId = undefined;
    mocks.sectionView = { isActive: false };
    delete mocks.observePreparation;
    vi.unstubAllGlobals();
    mocks.modelUnit = { ...mocks.modelUnit, selectedComponentIds: [] };
  });

  it('should count live assembly buffers for the mounted owner and deny retired and unmounted scenes', async () => {
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const initial = await residentAssembly();
    const replacement = await residentAssembly({ changed: true });
    const view = render(
      <GltfMesh
        assemblyDisplay={initial}
        geometryHash={initial.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
    const first = scenes.at(-1)!;
    const live = captureLiveGltfAssemblyResourceInventory(first);
    expect(live).toMatchObject({
      key: initial.root.digest,
      presentationRevision: 1,
      candidateSceneId: first.uuid,
      retiredOwnerCount: 0,
    });
    expect(live?.candidate).toBeUndefined();
    expect(live?.current.bufferCount).toBeGreaterThan(0);
    expect(live?.current.backingBytes).toBeGreaterThanOrEqual(live?.current.payloadBytes ?? Infinity);
    expect(live?.union).toEqual(live?.current);

    view.rerender(
      <GltfMesh
        assemblyDisplay={replacement}
        geometryHash={replacement.root.digest}
        presentationRevision={2}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 2]);
    });
    expect(captureLiveGltfAssemblyResourceInventory(first)).toBeUndefined();
    const next = scenes.at(-1)!;
    expect(captureLiveGltfAssemblyResourceInventory(next)?.key).toBe(replacement.root.digest);
    view.unmount();
    expect(captureLiveGltfAssemblyResourceInventory(next)).toBeUndefined();
  });

  it('should replace a committed assembly with standalone source geometry', async () => {
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const parse = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const display = await residentAssembly();
    const view = render(
      <GltfMesh
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    try {
      await waitFor(() => {
        expect(committedRevisions()).toEqual([1]);
      });
      const assemblyScene = scenes.at(-1)!;
      const committedAssembly = captureCommittedGltfDrawInventory(assemblyScene);
      expect(committedAssembly?.isCurrent()).toBe(true);
      const priorReads = vi.mocked(display.admitted.readAsset).mock.calls.length;
      const priorParses = parse.mock.calls.length;
      view.rerender(
        <GltfMesh
          gltfFile={buildGlb({ lift: 5 })}
          geometryHash='standalone'
          presentationRevision={2}
          enableMatcap={false}
        />,
      );
      await waitFor(() => {
        expect(committedRevisions()).toEqual([1, 2]);
      });
      const standaloneScene = scenes.at(-1)!;
      expect(standaloneScene).not.toBe(assemblyScene);
      expect(findSurface(standaloneScene).geometry.getAttribute('position').getZ(2)).toBe(5);
      expect(parse).toHaveBeenCalledTimes(priorParses + 1);
      expect(display.admitted.readAsset).toHaveBeenCalledTimes(priorReads);
      expect(committedAssembly?.isCurrent()).toBe(false);
      expect(captureCommittedGltfDrawInventory(assemblyScene)).toBeUndefined();
    } finally {
      view.unmount();
    }
  });

  it('captures an ungated same-task admission after the live candidate has already disappeared', async () => {
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const display = await residentAssembly();
    const view = render(
      <GltfMesh
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
    const first = scenes.at(-1)!;
    let historical: ReturnType<typeof captureLiveGltfAssemblyResourceInventory>;
    expect(
      armGltfAssemblyAdmissionResourceInventory(first, first.uuid, (value) => {
        historical = value;
      }),
    ).toBe(true);
    view.rerender(
      <GltfMesh
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={2}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 2]);
    });
    const next = scenes.at(-1)!;
    expect(next).not.toBe(first);
    expect(captureLiveGltfAssemblyResourceInventory(first)).toBeUndefined();
    expect(captureLiveGltfAssemblyResourceInventory(next)?.candidate).toBeUndefined();
    expect(historical).toMatchObject({
      key: display.root.digest,
      candidateSceneId: first.uuid,
      candidate: { key: display.root.digest, revision: 2, sceneId: next.uuid },
    });
    expect(historical?.current.bufferCount).toBeGreaterThan(0);
    expect(historical?.candidate?.bufferCount).toBeGreaterThan(0);
    expect(historical?.union.backingBytes).toBeLessThanOrEqual(
      (historical?.current.backingBytes ?? 0) + (historical?.candidate?.backingBytes ?? 0),
    );
    view.unmount();
  });

  it('should deduplicate the real current/candidate CPU union and release the retired owner after admission', async () => {
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const register = vi.spyOn(sectionTopology, 'registerGltfSectionSurfaceSources').mockResolvedValue([]);
    const initial = await residentAssembly();
    const replacement = await residentAssembly({ changed: true, occurrenceCount: 20 });
    const view = render(
      <GltfMesh
        assemblyDisplay={initial}
        geometryHash={initial.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
    const first = scenes.at(-1)!;
    let admissionSnapshot: ReturnType<typeof captureLiveGltfAssemblyResourceInventory>;
    expect(
      armGltfAssemblyAdmissionResourceInventory(first, first.uuid, (value) => {
        admissionSnapshot = value;
      }),
    ).toBe(true);
    clearGltfAssemblyAdmissionResourceInventory(first, first.uuid);
    expect(
      armGltfAssemblyAdmissionResourceInventory(first, first.uuid, (value) => {
        admissionSnapshot = value;
      }),
    ).toBe(true);
    mocks.sectionView = { isActive: true };
    view.rerender(
      <GltfMesh
        assemblyDisplay={initial}
        geometryHash={initial.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(register).toHaveBeenCalled();
      expect(mocks.graphicsActor.send).toHaveBeenCalledWith({
        type: 'gltfAnalysisReady',
        revision: 1,
        key: initial.root.digest,
      });
    });
    const gate = Promise.withResolvers<void>();
    register.mockImplementation(async () => {
      await gate.promise;
      return [];
    });
    view.rerender(
      <GltfMesh
        assemblyDisplay={replacement}
        geometryHash={replacement.root.digest}
        presentationRevision={2}
        enableMatcap={false}
      />,
    );
    let overlap: ReturnType<typeof captureLiveGltfAssemblyResourceInventory>;
    await waitFor(() => {
      overlap = captureLiveGltfAssemblyResourceInventory(first);
      expect(overlap?.candidate).toBeDefined();
    });
    const candidate = overlap!.candidate!;
    expect(overlap!.current.bufferCount).toBeGreaterThan(0);
    expect(candidate.bufferCount).toBeGreaterThan(0);
    expect(overlap!.union.bufferCount).toBeLessThanOrEqual(overlap!.current.bufferCount + candidate.bufferCount);
    expect(overlap!.union.backingBytes).toBeLessThan(overlap!.current.backingBytes + candidate.backingBytes);
    expect(overlap!.union.payloadBytes).toBeLessThanOrEqual(overlap!.current.payloadBytes + candidate.payloadBytes);
    expect(admissionSnapshot).toBeUndefined();
    await act(async () => {
      gate.resolve();
    });
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 2]);
    });
    expect(captureLiveGltfAssemblyResourceInventory(first)).toBeUndefined();
    expect(admissionSnapshot).toMatchObject({
      key: initial.root.digest,
      candidateSceneId: first.uuid,
      candidate: { key: replacement.root.digest, sceneId: scenes.at(-1)?.uuid, revision: 2 },
    });
    expect(admissionSnapshot?.union.bufferCount).toBeLessThanOrEqual(
      (admissionSnapshot?.current.bufferCount ?? 0) + (admissionSnapshot?.candidate?.bufferCount ?? 0),
    );
    expect(armGltfAssemblyAdmissionResourceInventory(first, first.uuid, () => undefined)).toBe(false);
    const settled = captureLiveGltfAssemblyResourceInventory(scenes.at(-1)!);
    expect(settled?.candidate).toBeUndefined();
    expect(settled?.retiredOwnerCount).toBe(0);
    expect(settled?.union).toEqual(settled?.current);
    view.unmount();
  });

  it('should report only actual pending asset reads for the requested owner and clear the phase on teardown', async () => {
    const display = await residentAssembly();
    const gate = Promise.withResolvers<void>();
    const readActual = display.admitted.readAsset;
    const read = vi.spyOn(display.admitted, 'readAsset').mockImplementationOnce(async (digest) => {
      await gate.promise;
      return readActual(digest);
    });
    const view = render(
      <GltfMesh
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(read).toHaveBeenCalledOnce();
    });
    const root = mocks.rootScene as Object3D;
    expect(captureRequestedGltfAssemblyPreparation(root, { display, key: display.root.digest, revision: 1 })).toEqual({
      revision: 1,
      phase: 'source-validation',
      requestedAssetReads: 1,
      completedAssetReads: 0,
    });
    expect(
      captureRequestedGltfAssemblyPreparation(root, { display, key: display.root.digest, revision: 2 }),
    ).toBeUndefined();
    await act(async () => {
      gate.resolve();
    });
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
    expect(
      captureRequestedGltfAssemblyPreparation(root, { display, key: display.root.digest, revision: 1 }),
    ).toMatchObject({
      phase: 'committed',
      requestedAssetReads: 2,
      completedAssetReads: 2,
    });
    const sibling = render(
      <GltfMesh
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    expect(
      captureRequestedGltfAssemblyPreparation(root, { display, key: display.root.digest, revision: 1 }),
    ).toBeUndefined();
    sibling.unmount();
    expect(
      captureRequestedGltfAssemblyPreparation(root, { display, key: display.root.digest, revision: 1 })?.phase,
    ).toBe('committed');
    view.unmount();
    expect(
      captureRequestedGltfAssemblyPreparation(root, { display, key: display.root.digest, revision: 1 }),
    ).toBeUndefined();
  });

  it('should retain the first failed asset-read phase without a completed read or stale owner after unmount', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const display = await residentAssembly();
    vi.spyOn(display.admitted, 'readAsset').mockRejectedValueOnce(new Error('Fixture asset refusal'));
    const view = render(
      <GltfMesh
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(mocks.graphicsActor.send).toHaveBeenCalledWith({
        type: 'gltfPresentationFailed',
        revision: 1,
        key: display.root.digest,
      });
    });
    const root = mocks.rootScene as Object3D;
    expect(captureRequestedGltfAssemblyPreparation(root, { display, key: display.root.digest, revision: 1 })).toEqual({
      revision: 1,
      phase: 'failed',
      requestedAssetReads: 1,
      completedAssetReads: 0,
    });
    view.unmount();
    expect(
      captureRequestedGltfAssemblyPreparation(root, { display, key: display.root.digest, revision: 1 }),
    ).toBeUndefined();
  });

  it('parses only camera-demanded definitions, retains full facts, and evicts safely without revalidating camera changes', async () => {
    const camera = mocks.camera!;
    camera.left = -2;
    camera.right = 2;
    camera.top = 2;
    camera.bottom = -2;
    camera.updateProjectionMatrix();
    const display = await residentAssembly({ withEdges: true });
    const otherAsset = display.admitted.publication.parts['other']!.variants['default']!.glb;
    const originalOtherByteLength = otherAsset.byteLength;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const validate = vi.spyOn(geometryCore, 'validateAdmittedAssemblyGlb');
    const parse = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const view = render(
      <GltfMesh
        assemblyResourceBudget={{ cpuBytes: 12 * 1024 ** 2, gpuBytes: 1024 ** 2 }}
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    try {
      await waitFor(() => {
        expect(committedRevisions()).toHaveLength(1);
      });
      expect(parse).toHaveBeenCalledOnce();
      expect(validate).toHaveBeenCalledOnce();
      const original = findSurface(scenes.at(-1)!);
      const dispose = vi.spyOn(original.geometry, 'dispose');
      const firstCommit = mocks.graphicsActor.send.mock.calls.find(
        ([event]) => event.type === 'gltfPresentationCommitted',
      )?.[0];
      if (firstCommit?.type !== 'gltfPresentationCommitted') {
        throw new Error('Expected actual presentation commit');
      }
      expect(firstCommit.manifest.nodeOrder.length).toBeGreaterThan(3);
      const firstScene = scenes.at(-1)!;
      const firstEdges = occurrenceEdgeEndpoints(firstScene);
      expect(firstEdges).toEqual([0, 1]);
      const firstEdgeBatch = findOccurrenceEdgeBatch(firstScene);
      const edgeDispose = vi.spyOn(firstEdgeBatch.object.geometry, 'dispose');
      const stableReadCount = vi.mocked(display.admitted.readAsset).mock.calls.length;
      camera.position.x = 0.1;
      camera.updateMatrixWorld();
      act(() => mocks.frameCallback?.());
      expect(committedRevisions()).toHaveLength(1);
      expect(scenes.at(-1)).toBe(firstScene);
      expect(display.admitted.readAsset).toHaveBeenCalledTimes(stableReadCount);
      expect(occurrenceEdgeEndpoints(firstScene)).toEqual(firstEdges);
      expect(edgeDispose).not.toHaveBeenCalled();
      camera.position.x = 5;
      camera.updateMatrixWorld();
      act(() => mocks.frameCallback?.());
      await waitFor(() => {
        expect(committedRevisions()).toHaveLength(2);
      });
      expect(findSurface(scenes.at(-1)!).geometry).toBe(original.geometry);
      expect(occurrenceEdgeEndpoints(scenes.at(-1)!)).toEqual([5, 6]);
      expect(findOccurrenceEdgeBatch(scenes.at(-1)!).object.geometry).not.toBe(firstEdgeBatch.object.geometry);
      await waitFor(() => {
        expect(edgeDispose).toHaveBeenCalledOnce();
      });
      expect(dispose).not.toHaveBeenCalled();
      expect(parse).toHaveBeenCalledOnce();
      expect(validate).toHaveBeenCalledOnce();
      const readCount = vi.mocked(display.admitted.readAsset).mock.calls.length;
      const preparationCount = mocks.observePreparation.mock.calls.length;
      // Intentionally dishonest advertisement on the SAME facade: only camera demand changes.
      Object.assign(otherAsset, { byteLength: 12 * 1024 ** 2 + 1 });
      camera.position.x = 10;
      camera.updateMatrixWorld();
      act(() => mocks.frameCallback?.());
      await waitFor(() => {
        expect(
          committedRevisions().length > 2 ||
            mocks.graphicsActor.send.mock.calls.some(
              ([event]) =>
                event.type === 'gltfPresentationFailed' && event.revision === 1 && event.key === display.root.digest,
            ),
        ).toBe(true);
      });
      // Also fail against a predecessor which reads and commits instead of refusing before readAsset.
      expect(display.admitted.readAsset).toHaveBeenCalledTimes(readCount);
      expect(mocks.graphicsActor.send).toHaveBeenCalledWith({
        type: 'gltfPresentationFailed',
        revision: 1,
        key: display.root.digest,
      });
      expect(committedRevisions()).toHaveLength(2);
      expect(parse).toHaveBeenCalledOnce();
      expect(validate).toHaveBeenCalledOnce();
      expect(mocks.observePreparation).toHaveBeenCalledTimes(preparationCount);
      expect(findSurface(scenes.at(-1)!).geometry).toBe(original.geometry);
      expect(dispose).not.toHaveBeenCalled();
      Object.assign(otherAsset, { byteLength: originalOtherByteLength });
      // A budget-only retry keeps the same pin/key/revision and current camera demand.
      view.rerender(
        <GltfMesh
          assemblyResourceBudget={{ cpuBytes: 12 * 1024 ** 2 + 1, gpuBytes: 1024 ** 2 }}
          assemblyDisplay={display}
          geometryHash={display.root.digest}
          presentationRevision={1}
          enableMatcap={false}
        />,
      );
      await waitFor(() => {
        expect(committedRevisions()).toHaveLength(3);
      });
      expect(display.admitted.readAsset).toHaveBeenCalledTimes(readCount + 1);
      expect(display.admitted.readAsset).toHaveBeenLastCalledWith(otherAsset.digest);
      expect(parse).toHaveBeenCalledTimes(2);
      expect(validate).toHaveBeenCalledOnce();
      const demanded = findSurface(scenes.at(-1)!);
      // The two pinned fixture definitions have identical geometry and share its existing owner.
      expect(demanded.geometry).toBe(original.geometry);
      expect(dispose).not.toHaveBeenCalled();
      camera.position.x = 100;
      camera.updateMatrixWorld();
      act(() => mocks.frameCallback?.());
      await waitFor(() => {
        expect(committedRevisions()).toHaveLength(4);
      });
      expect(surfacesOf(scenes.at(-1)!)).toHaveLength(0);
      expect(dispose).toHaveBeenCalledOnce();
      camera.position.x = 0;
      camera.updateMatrixWorld();
      act(() => mocks.frameCallback?.());
      await waitFor(() => {
        expect(committedRevisions()).toHaveLength(5);
      });
      expect(surfacesOf(scenes.at(-1)!)).toHaveLength(1);
      expect(parse).toHaveBeenCalledTimes(3);
      expect(display.admitted.readAsset).toHaveBeenCalledTimes(readCount + 2);
      expect(validate).toHaveBeenCalledOnce();
      expect(dispose).toHaveBeenCalledOnce();
    } finally {
      Object.assign(otherAsset, { byteLength: originalOtherByteLength });
      view.unmount();
    }
  });

  it('releases displayed assembly authority and reconstructs definition resources after a canvas remount', async () => {
    const display = await residentAssembly({ occurrenceCount: 2 });
    const parse = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const element = (
      <GltfMesh
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />
    );
    let view: ReturnType<typeof render> | undefined = render(element);
    let restored: ReturnType<typeof render> | undefined;
    const backend = vi.spyOn(threeBackend, 'useThreeGraphicsBackend');
    try {
      await waitFor(() => {
        expect(committedRevisions()).toEqual([1]);
      });
      const oldSurface = findSurface(scenes.at(-1)!);
      const geometryDispose = vi.spyOn(oldSurface.geometry, 'dispose');
      const materialDispose = vi.spyOn(oldSurface.material as MeshStandardMaterial, 'dispose');
      const firstInput = parse.mock.calls[0]![0];
      if (!(firstInput instanceof ArrayBuffer)) {
        throw new Error('Expected actual pinned GLB parser bytes.');
      }
      const pinned = display.admitted.publication.parts['retained']!.variants['default']!.glb;
      expect(firstInput.byteLength).toBe(pinned.byteLength);
      expect(`sha256:${await hashing.sha256Bytes(new Uint8Array(firstInput))}`).toBe(pinned.digest);
      backend.mockReturnValue('webgpu');
      view.rerender(
        <GltfMesh
          assemblyDisplay={display}
          geometryHash={display.root.digest}
          presentationRevision={1}
          enableMatcap={false}
        />,
      );
      await waitFor(() => {
        expect(committedRevisions()).toEqual([1, 1]);
      });
      expect(parse).toHaveBeenCalledTimes(2);
      expect(parse.mock.calls[1]![0]).toBe(firstInput);
      expect(display.admitted.readAsset).toHaveBeenCalledOnce();
      expect(mocks.observePreparation).toHaveBeenCalledTimes(4);
      expect(new Set(scenes).size).toBe(2);
      expect(scenes.at(-1)).not.toBe(scenes[0]);
      expect(`sha256:${await hashing.sha256Bytes(new Uint8Array(firstInput))}`).toBe(pinned.digest);
      const changedSurface = findSurface(scenes.at(-1)!);
      expect(changedSurface.geometry).not.toBe(oldSurface.geometry);
      expect(changedSurface.material).not.toBe(oldSurface.material);
      const changedDispose = vi.spyOn(changedSurface.geometry, 'dispose');
      if (Array.isArray(changedSurface.material)) {
        throw new TypeError('Expected one fixture material.');
      }
      const changedMaterialDispose = vi.spyOn(changedSurface.material, 'dispose');
      act(() => mocks.frameCallback?.());
      expect(
        mocks.graphicsActor.send.mock.calls.some(
          ([event]) =>
            event.type === 'gltfPresentationMeasured' &&
            event.telemetry.backend === 'webgpu' &&
            event.telemetry.key === display.root.digest &&
            event.telemetry.revision === 1,
        ),
      ).toBe(true);
      await waitFor(() => {
        expect(geometryDispose).toHaveBeenCalledOnce();
      });
      expect(materialDispose).toHaveBeenCalledOnce();
      expect(changedDispose).not.toHaveBeenCalled();
      expect(changedMaterialDispose).not.toHaveBeenCalled();
      view.unmount();
      view = undefined;
      expect(changedDispose).toHaveBeenCalledOnce();
      expect(changedMaterialDispose).toHaveBeenCalledOnce();
      expect(geometryDispose).toHaveBeenCalledOnce();
      expect(materialDispose).toHaveBeenCalledOnce();
      expect(mocks.graphicsActor.send).toHaveBeenCalledWith({
        type: 'gltfPresentationReleased',
        key: display.root.digest,
        revision: 1,
      });
      restored = render(element);
      await waitFor(() => {
        expect(committedRevisions()).toEqual([1, 1, 1]);
      });
      expect(parse).toHaveBeenCalledTimes(3);
      expect(display.admitted.readAsset).toHaveBeenCalledTimes(2);
      expect(findSurface(scenes.at(-1)!).geometry).not.toBe(changedSurface.geometry);
      expect(findSurface(scenes.at(-1)!).material).not.toBe(changedSurface.material);
      expect(geometryDispose).toHaveBeenCalledOnce();
      const restoredDispose = vi.spyOn(findSurface(scenes.at(-1)!).geometry, 'dispose');
      restored.unmount();
      restored = undefined;
      expect(restoredDispose).toHaveBeenCalledOnce();
      expect(geometryDispose).toHaveBeenCalledOnce();
      expect(changedDispose).toHaveBeenCalledOnce();
      expect(changedMaterialDispose).toHaveBeenCalledOnce();
    } finally {
      restored?.unmount();
      view?.unmount();
      backend.mockRestore();
    }
  });

  it('reserves shared definition JSON once while retaining every selected occurrence and borrowed geometry', async () => {
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const parse = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    // Many valid shared accessors enlarge definition JSON without adding occurrence descriptors.
    const display = await residentAssembly({ occurrenceCount: 20, sharedAccessorCopies: 1100 });
    const view = render(
      <GltfMesh
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={1}
        enableMatcap={false}
        assemblyResourceBudget={{ cpuBytes: 12 * 1024 ** 2, gpuBytes: 1024 ** 2 }}
      />,
    );
    let dispose: ReturnType<typeof vi.spyOn> | undefined;
    try {
      await waitFor(() => {
        expect(committedRevisions()).toEqual([1]);
      });
      const surface = findSurface(scenes.at(-1)!);
      dispose = vi.spyOn(surface.geometry, 'dispose');
      const slots = surfacesOf(scenes.at(-1)!).flatMap((part) => getModelComponentInstanceSlots(part) ?? []);
      expect(slots).toHaveLength(20);
      expect(new Set(slots.map((slot) => slot.owner.componentId)).size).toBe(20);
      expect(parse).toHaveBeenCalledOnce();
      expect(display.admitted.readAsset).toHaveBeenCalledOnce();
      const preparations = mocks.observePreparation.mock.calls.length;
      view.rerender(
        <GltfMesh
          assemblyDisplay={display}
          geometryHash={display.root.digest}
          presentationRevision={1}
          enableMatcap={false}
          assemblyResourceBudget={{ cpuBytes: 12 * 1024 ** 2 + 1, gpuBytes: 1024 ** 2 }}
        />,
      );
      await waitFor(() => {
        expect(committedRevisions()).toEqual([1, 1]);
      });
      expect(mocks.observePreparation).toHaveBeenCalledTimes(preparations + 2);
      expect(parse).toHaveBeenCalledOnce();
      expect(display.admitted.readAsset).toHaveBeenCalledOnce();
      expect(findSurface(scenes.at(-1)!).geometry).toBe(surface.geometry);
      expect(dispose).not.toHaveBeenCalled();
    } finally {
      view.unmount();
    }
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('denies advertised and actual source reservations while retaining the last good scene and recovering', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const parse = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const initial = await residentAssembly();
    const view = render(
      <GltfMesh
        assemblyDisplay={initial}
        geometryHash={initial.root.digest}
        presentationRevision={1}
        enableMatcap={false}
        assemblyResourceBudget={{
          cpuBytes: 12 * 1024 ** 2,
          gpuBytes: 1024 ** 2,
        }}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
    const current = findSurface(scenes.at(-1)!);
    const currentDispose = vi.spyOn(current.geometry, 'dispose');
    const parses = parse.mock.calls.length;
    const preparations = mocks.observePreparation.mock.calls.length;

    view.rerender(
      <GltfMesh
        assemblyDisplay={initial}
        geometryHash={initial.root.digest}
        presentationRevision={1}
        enableMatcap={false}
        assemblyResourceBudget={{ cpuBytes: 1, gpuBytes: 1024 ** 2 }}
      />,
    );
    await waitFor(() => {
      expect(mocks.graphicsActor.send).toHaveBeenCalledWith({
        type: 'gltfPresentationFailed',
        revision: 1,
        key: initial.root.digest,
      });
    });
    expect(committedRevisions()).toEqual([1]);
    expect(parse).toHaveBeenCalledTimes(parses);
    expect(mocks.observePreparation).toHaveBeenCalledTimes(preparations);
    expect(currentDispose).not.toHaveBeenCalled();

    const advertised = await residentAssembly({ appearance: true });
    // Deliberately dishonest pin metadata: admission must fail before asking the reader.
    Object.assign(advertised.admitted.publication.parts['retained']!.variants['default']!.glb, {
      byteLength: 12 * 1024 ** 2 + 1,
    });
    view.rerender(
      <GltfMesh
        assemblyDisplay={advertised}
        geometryHash={advertised.root.digest}
        presentationRevision={2}
        enableMatcap={false}
        assemblyResourceBudget={{
          cpuBytes: 12 * 1024 ** 2,
          gpuBytes: 1024 ** 2,
        }}
      />,
    );
    await waitFor(() => {
      expect(mocks.graphicsActor.send).toHaveBeenCalledWith({
        type: 'gltfPresentationFailed',
        revision: 2,
        key: advertised.root.digest,
      });
    });
    expect(advertised.admitted.readAsset).not.toHaveBeenCalled();
    expect(parse).toHaveBeenCalledTimes(parses);
    expect(mocks.observePreparation).toHaveBeenCalledTimes(preparations);
    expect(committedRevisions()).toEqual([1]);
    expect(findSurface(scenes.at(-1)!)).toBe(current);
    expect(currentDispose).not.toHaveBeenCalled();

    const actual = await residentAssembly({ appearance: true });
    const read = actual.admitted.readAsset;
    const sourceBytes = await read(actual.admitted.publication.parts['retained']!.variants['default']!.glb.digest);
    const backing = new Uint8Array(1024 ** 2);
    backing.set(sourceBytes);
    vi.mocked(read).mockClear();
    vi.mocked(read).mockResolvedValue(backing.subarray(0, sourceBytes.byteLength));
    view.rerender(
      <GltfMesh
        assemblyDisplay={actual}
        geometryHash={actual.root.digest}
        presentationRevision={3}
        enableMatcap={false}
        assemblyResourceBudget={{ cpuBytes: 512 * 1024, gpuBytes: 1024 ** 2 }}
      />,
    );
    await waitFor(() => {
      expect(mocks.graphicsActor.send).toHaveBeenCalledWith({
        type: 'gltfPresentationFailed',
        revision: 3,
        key: actual.root.digest,
      });
    });
    expect(read).toHaveBeenCalledOnce();
    expect(parse).toHaveBeenCalledTimes(parses);
    expect(mocks.observePreparation).toHaveBeenCalledTimes(preparations);
    expect(committedRevisions()).toEqual([1]);
    expect(currentDispose).not.toHaveBeenCalled();

    view.rerender(
      <GltfMesh
        assemblyDisplay={initial}
        geometryHash={initial.root.digest}
        presentationRevision={4}
        enableMatcap={false}
        assemblyResourceBudget={{
          cpuBytes: 12 * 1024 ** 2,
          gpuBytes: 1024 ** 2,
        }}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 4]);
    });
    expect(parse).toHaveBeenCalledTimes(parses);
    expect(findSurface(scenes.at(-1)!).geometry).toBe(current.geometry);
    expect(currentDispose).not.toHaveBeenCalled();
    view.unmount();
    expect(currentDispose).toHaveBeenCalledOnce();
  });

  it('denies occurrence GPU reservations after parsing and releases candidate owners without releasing borrowed geometry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const initial = await residentAssembly();
    const view = render(
      <GltfMesh
        assemblyDisplay={initial}
        geometryHash={initial.root.digest}
        presentationRevision={1}
        enableMatcap={false}
        assemblyResourceBudget={{
          cpuBytes: 12 * 1024 ** 2,
          gpuBytes: 1024 ** 2,
        }}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
    act(() => mocks.frameCallback?.());
    const initialResources = measuredResources()!;
    const current = findSurface(scenes.at(-1)!);
    const currentDispose = vi.spyOn(current.geometry, 'dispose');
    const preparations = mocks.observePreparation.mock.calls.length;
    const parse = GLTFLoader.prototype.parseAsync;
    let candidateMaterialDispose: ReturnType<typeof vi.spyOn> | undefined;
    const parseSpy = vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(async function (
      this: GLTFLoader,
      ...args
    ) {
      const gltf = await parse.apply(this, args);
      const { material } = findSurface(gltf.scene);
      if (Array.isArray(material)) {
        throw new TypeError('Expected the fixture material');
      }
      candidateMaterialDispose = vi.spyOn(material, 'dispose');
      return gltf;
    });
    const changed = await residentAssembly({
      appearance: true,
      occurrenceCount: 20,
    });
    const gpuBytes =
      initialResources.geometryGpuBytesEstimate +
      initialResources.instanceAttributeGpuBytesEstimate +
      initialResources.textureGpuBytesEstimate +
      1024;
    view.rerender(
      <GltfMesh
        assemblyDisplay={changed}
        geometryHash={changed.root.digest}
        presentationRevision={2}
        enableMatcap={false}
        assemblyResourceBudget={{ cpuBytes: 12 * 1024 ** 2, gpuBytes }}
      />,
    );
    await waitFor(() => {
      expect(mocks.graphicsActor.send).toHaveBeenCalledWith({
        type: 'gltfPresentationFailed',
        revision: 2,
        key: changed.root.digest,
      });
    });
    expect(parseSpy).toHaveBeenCalledOnce();
    expect(candidateMaterialDispose).toHaveBeenCalledOnce();
    expect(currentDispose).not.toHaveBeenCalled();
    expect(mocks.observePreparation).toHaveBeenCalledTimes(preparations);
    expect(committedRevisions()).toEqual([1]);
    expect(findSurface(scenes.at(-1)!).geometry).toBe(current.geometry);
    view.rerender(
      <GltfMesh
        assemblyDisplay={initial}
        geometryHash={initial.root.digest}
        presentationRevision={3}
        enableMatcap={false}
        assemblyResourceBudget={{
          cpuBytes: 12 * 1024 ** 2,
          gpuBytes: 1024 ** 2,
        }}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 3]);
    });
    expect(parseSpy).toHaveBeenCalledOnce();
    expect(currentDispose).not.toHaveBeenCalled();
    view.unmount();
    expect(currentDispose).toHaveBeenCalledOnce();
  });

  it.each([
    { cpuBytes: 0, gpuBytes: 1024 ** 2 },
    { cpuBytes: 12 * 1024 ** 2, gpuBytes: Number.NaN },
    { cpuBytes: 12 * 1024 ** 2 + 0.5, gpuBytes: 1024 ** 2 },
    { cpuBytes: 12 * 1024 ** 2, gpuBytes: Number.MAX_SAFE_INTEGER + 1 },
  ])('validates private resource budget %j and cancels an awaited candidate when it changes', async (invalidBudget) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const release = Promise.withResolvers<void>();
    const display = await residentAssembly();
    const parse = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const readActual = display.admitted.readAsset;
    const read = vi.spyOn(display.admitted, 'readAsset').mockImplementationOnce(async (digest) => {
      await release.promise;
      return readActual(digest);
    });
    const view = render(
      <GltfMesh
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={1}
        enableMatcap={false}
        assemblyResourceBudget={{
          cpuBytes: 12 * 1024 ** 2,
          gpuBytes: 1024 ** 2,
        }}
      />,
    );
    try {
      await waitFor(() => {
        expect(read).toHaveBeenCalled();
      });
      view.rerender(
        <GltfMesh
          assemblyDisplay={display}
          geometryHash={display.root.digest}
          presentationRevision={1}
          enableMatcap={false}
          assemblyResourceBudget={invalidBudget}
        />,
      );
      release.resolve();
      await waitFor(() => {
        expect(mocks.graphicsActor.send).toHaveBeenCalledWith({
          type: 'gltfPresentationFailed',
          revision: 1,
          key: display.root.digest,
        });
      });
      expect(committedRevisions()).toEqual([]);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      release.resolve();
      await Promise.allSettled([release.promise]);
    }
  });

  it('counts shared source payload ranges once without replacing backing-capacity accounting', async () => {
    const display = await residentAssembly({ sharedSourceBacking: true });
    const retainedAsset = display.admitted.publication.parts['retained']!.variants['default']!.glb;
    const source = await display.admitted.readAsset(retainedAsset.digest);
    const expectedPayloadBytes = Object.values(display.admitted.publication.parts).reduce(
      (sum, part) => sum + part.variants['default']!.glb.byteLength,
      0,
    );
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      const position = findSurface(scene).geometry.getAttribute('position') as BufferAttribute;
      const alias = new Float32Array(source.buffer, source.byteLength, position.array.length);
      alias.set(position.array);
      position.array = alias;
    });
    const view = render(
      <GltfMesh
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
    act(() => mocks.frameCallback?.());
    const resources = measuredResources();
    expect(resources).toMatchObject({
      definitionCount: 2,
      preparedSourceBufferCount: 1,
      preparedSourcePayloadBytes: expectedPayloadBytes,
      residentCompressedBufferCount: 1,
      residentCompressedPayloadBytes: expectedPayloadBytes,
      residentCompressedBytes: expectedPayloadBytes + 4096,
    });
    expect(resources?.exactResidentBufferCount).toBeGreaterThan(0);
    expect(resources?.exactResidentPayloadCpuBytes).toBeGreaterThan(0);
    expect(resources?.currentAndCandidateExactBufferCount).toBeGreaterThanOrEqual(resources!.exactResidentBufferCount);
    expect(resources!.exactResidentPayloadCpuBytes).toBeLessThan(resources!.exactResidentBufferCpuBytes);
    expect(resources!.exactResidentPayloadCpuBytes).toBeGreaterThan(resources!.residentCompressedPayloadBytes);
    expect(resources!.currentAndCandidateExactPayloadCpuBytes).toBeGreaterThanOrEqual(
      resources!.exactResidentPayloadCpuBytes,
    );
    view.unmount();
  });

  it('indexes a thousand occurrence identities with bounded full metadata scans and one definition parser', async () => {
    const validate = geometryCore.validateAdmittedAssemblyGlb;
    let entriesVisited = 0;
    let fullFilters = 0;
    let componentCount = 0;
    vi.spyOn(geometryCore, 'validateAdmittedAssemblyGlb').mockImplementation(async (input) => {
      const metadata = await validate(input);
      componentCount = metadata.components.length;
      const components = new Proxy(metadata.components, {
        get(target, property, receiver): unknown {
          if (property === Symbol.iterator) {
            return function* () {
              for (const entry of target) {
                entriesVisited += 1;
                yield entry;
              }
            };
          }
          if (property === 'filter') {
            fullFilters += 1;
          }
          return Reflect.get(target, property, receiver);
        },
      });
      return { ...metadata, components };
    });
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const display = await residentAssembly({ occurrenceCount: 1000 });
    const view = render(
      <GltfMesh
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
    expect(parseAsync).toHaveBeenCalledOnce();
    expect(display.admitted.readAsset).toHaveBeenCalledOnce();
    expect(surfacesOf(scenes.at(-1)!).flatMap((surface) => getModelComponentInstanceSlots(surface) ?? [])).toHaveLength(
      1000,
    );
    expect(fullFilters).toBe(0);
    expect(entriesVisited).toBe(componentCount * 2);
    const thousandSurface = surfacesOf(scenes.at(-1)!)[0];
    if (!(thousandSurface instanceof InstancedMesh)) {
      throw new Error('Expected a thousand-instance surface.');
    }
    const geometryDispose = vi.spyOn(thousandSurface.geometry, 'dispose');
    act(() => mocks.frameCallback?.());
    const thousand = measuredResources();
    expect(thousand).toMatchObject({ definitionCount: 1, residentOccurrenceCount: 1000, queuedPreparationCount: 0 });
    expect(thousand?.geometryCpuBytes).toBeGreaterThan(0);
    expect(thousand?.texturesWithUnknownSize).toBe(0);
    const single = await residentAssembly({ occurrenceCount: 1 });
    view.rerender(
      <GltfMesh
        assemblyDisplay={single}
        geometryHash={single.root.digest}
        presentationRevision={2}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 2]);
    });
    act(() => mocks.frameCallback?.());
    const one = measuredResources();
    const singleSurface = surfacesOf(scenes.at(-1)!)[0];
    if (!(singleSurface instanceof InstancedMesh)) {
      throw new Error('Expected a single-instance surface.');
    }
    expect(singleSurface.geometry).toBe(thousandSurface.geometry);
    expect(singleSurface.instanceMatrix.array.buffer).not.toBe(thousandSurface.instanceMatrix.array.buffer);
    expect(one?.currentAndCandidateExactBufferCpuBytes).toBeGreaterThan(thousand!.exactResidentBufferCpuBytes);
    expect(one?.currentAndCandidateExactBufferCpuBytes).toBeGreaterThan(one!.exactResidentBufferCpuBytes);
    expect(one?.currentAndCandidateExactBufferCount).toBeGreaterThan(one!.exactResidentBufferCount);
    expect(one?.currentAndCandidateExactPayloadCpuBytes).toBeGreaterThan(one!.exactResidentPayloadCpuBytes);
    expect(one?.unmeasuredInventory).toEqual(thousand?.unmeasuredInventory);
    expect(one?.unmeasuredInventory).toHaveLength(6);
    expect(one).toMatchObject({
      definitionCount: 1,
      residentOccurrenceCount: 1,
      residentCompressedBytes: thousand?.residentCompressedBytes,
      geometryCpuBytes: thousand?.geometryCpuBytes,
      geometryGpuBytesEstimate: thousand?.geometryGpuBytesEstimate,
    });
    expect(one?.sceneObjectCount).toBeLessThan(thousand?.sceneObjectCount ?? 0);
    expect(one?.materialCount).toBeLessThan(thousand?.materialCount ?? 0);
    expect(one?.metadataSerializedBytes).toBeLessThan(thousand?.metadataSerializedBytes ?? 0);
    expect(one?.currentAndCandidateBytesEstimate).toBeGreaterThanOrEqual(
      thousand?.currentAndCandidateBytesEstimate ?? 0,
    );
    expect(parseAsync).toHaveBeenCalledOnce();
    expect(geometryDispose).not.toHaveBeenCalled();
    view.unmount();
    expect(geometryDispose).toHaveBeenCalledOnce();
  });

  it('should account for actual retained BVH trees without building them and retire them with the presentation', async () => {
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const initial = await residentAssembly();
    const view = render(
      <GltfMesh
        assemblyDisplay={initial}
        geometryHash={initial.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
    const { geometry } = findSurface(scenes.at(-1)!);
    act(() => mocks.frameCallback?.());
    expect(getCachedBvh(geometry)).toBeUndefined();
    expect(measuredResources()).toMatchObject({ bvhTreeCount: 0, bvhTreesWithUnknownSize: 0, bvhBytesEstimate: 0 });
    const cached = getOrBuildBvh(geometry);
    // Install the actual cache object at the JS extension boundary; ambient 0.8/0.9 declarations disagree.
    Object.defineProperty(geometry, 'boundsTree', { value: cached, writable: true, configurable: true });
    const moved = await residentAssembly({ translation: 12 });
    view.rerender(
      <GltfMesh
        assemblyDisplay={moved}
        geometryHash={moved.root.digest}
        presentationRevision={2}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 2]);
    });
    act(() => mocks.frameCallback?.());
    expect(findSurface(scenes.at(-1)!).geometry).toBe(geometry);
    expect(getCachedBvh(geometry)).toBe(cached);
    expect(measuredResources()).toMatchObject({
      bvhTreeCount: 1,
      bvhTreesWithUnknownSize: 0,
      bvhBytesEstimate: estimateMemoryInBytes(cached),
    });
    const attached = computeBoundsTree.call(geometry, { indirect: true });
    const again = await residentAssembly({ translation: 14 });
    view.rerender(
      <GltfMesh
        assemblyDisplay={again}
        geometryHash={again.root.digest}
        presentationRevision={3}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 2, 3]);
    });
    act(() => mocks.frameCallback?.());
    expect(measuredResources()).toMatchObject({
      bvhTreeCount: 2,
      bvhTreesWithUnknownSize: 0,
      bvhBytesEstimate: estimateMemoryInBytes(cached) + estimateMemoryInBytes(attached),
    });
    // An externally attached tree whose class is not the installed estimator's BVH stays explicitly unpriced.
    geometry.boundsTree = mock<NonNullable<typeof geometry.boundsTree>>();
    const foreignTree = await residentAssembly({ translation: 16 });
    view.rerender(
      <GltfMesh
        assemblyDisplay={foreignTree}
        geometryHash={foreignTree.root.digest}
        presentationRevision={4}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 2, 3, 4]);
    });
    act(() => mocks.frameCallback?.());
    expect(measuredResources()).toMatchObject({
      bvhTreeCount: 2,
      bvhTreesWithUnknownSize: 1,
      bvhBytesEstimate: estimateMemoryInBytes(cached),
    });
    view.unmount();
    expect(getCachedBvh(geometry)).toBeUndefined();
    delete geometry.boundsTree;
  });

  it.each([
    ['source', false],
    ['source', true],
    ['assembly', false],
    ['assembly', true],
  ] as const)('owns real parsed secondary-scene resources for %s (shared bitmap %s)', async (mode, sharedBitmap) => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() })),
    );
    const bytes = writeGlb({
      nodes: [0, 1].map((index) => ({
        name: `Scene part ${index}`,
        extras: { tauComponentId: `component:scene-${index}` },
        primitives: [
          {
            mode: 4,
            positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, index]),
            normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
            indices: Uint32Array.from([0, 1, 2]),
            material: surfaceMaterial,
          },
        ],
      })),
    });
    const { json } = parseGltfBytes(bytes);
    json.scene = 0;
    json.scenes = [{ nodes: [0] }, { nodes: [1] }];
    json.images = Array.from({ length: sharedBitmap ? 1 : 2 }, () => ({
      uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    }));
    json.samplers = [{ magFilter: 9728, minFilter: 9728 }];
    json.textures = [{ source: 0 }, { source: sharedBitmap ? 0 : 1, sampler: 0 }];
    const base = json.materials![0]!;
    json.materials = [0, 1].map((index) => ({
      ...base,
      pbrMetallicRoughness: {
        ...base.pbrMetallicRoughness,
        baseColorTexture: { index },
      },
    }));
    json.meshes![0]!.primitives![0]!.material = 0;
    json.meshes![1]!.primitives![0]!.material = 1;
    const content = packGltfJson(bytes, json);
    const realParse = GLTFLoader.prototype.parseAsync;
    let parsed: GLTF | undefined;
    let secondaryGeometryDispose: ReturnType<typeof vi.spyOn> | undefined;
    let secondaryTextureDispose: ReturnType<typeof vi.spyOn> | undefined;
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(async function (this: GLTFLoader, data, path) {
      const result = await realParse.call(this, data, path);
      parsed = result;
      const secondary = findSurface(result.scenes[1]!);
      secondaryGeometryDispose = vi.spyOn(secondary.geometry, 'dispose');
      if (!(secondary.material instanceof MeshStandardMaterial) || !secondary.material.map) {
        throw new Error('Expected secondary texture');
      }
      secondaryTextureDispose = vi.spyOn(secondary.material.map, 'dispose');
      return result;
    });
    const digest = contentDigest({ value: `sha256:${await hashing.sha256Bytes(content)}` });
    const display =
      mode === 'assembly'
        ? await residentAssemblyFromAssets(
            {
              schemaVersion: 1,
              parts: {
                part: {
                  schemaVersion: 1,
                  variants: {
                    default: {
                      source: { entry: 'part.ts', files: {} },
                      glb: { path: 'part.glb', digest, byteLength: content.byteLength },
                    },
                  },
                },
              },
              occurrences: [
                {
                  id: 'part',
                  part: 'part',
                  variant: 'default',
                  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
                },
              ],
            },
            new Map([[digest, content]]),
          )
        : undefined;
    const view = render(
      <GltfMesh
        assemblyDisplay={display}
        gltfFile={mode === 'source' ? content : undefined}
        geometryHash={display?.root.digest ?? 'secondary-scenes'}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
    if (!parsed) {
      throw new Error('Expected actual parsed scenes');
    }
    const active = findSurface(parsed.scene);
    const secondary = findSurface(parsed.scenes[1]!);
    if (!(active.material instanceof MeshStandardMaterial) || !(secondary.material instanceof MeshStandardMaterial)) {
      throw new Error('Expected real PBR materials');
    }
    const activeImage: unknown = active.material.map?.source.data;
    const secondaryImage: unknown = secondary.material.map?.source.data;
    if (
      typeof activeImage !== 'object' ||
      activeImage === null ||
      !('close' in activeImage) ||
      typeof secondaryImage !== 'object' ||
      secondaryImage === null ||
      !('close' in secondaryImage)
    ) {
      throw new Error('Expected decoded bitmaps');
    }
    expect(secondaryGeometryDispose).toHaveBeenCalledOnce();
    expect(secondaryTextureDispose).toHaveBeenCalledOnce();
    expect(activeImage.close).not.toHaveBeenCalled();
    if (sharedBitmap) {
      expect(secondaryImage).toBe(activeImage);
    } else {
      expect(secondaryImage.close).toHaveBeenCalledOnce();
    }
    if (mode === 'assembly') {
      act(() => mocks.frameCallback?.());
      const resources = measuredResources();
      expect(resources?.parsedDependencyCpuBytes).toBeGreaterThan(0);
      expect(resources?.parserJsonSerializedBytes).toBeGreaterThan(0);
      expect(resources?.parserObjectCount).toBeGreaterThan(1);
      expect(resources?.geometryCpuBytes).toBeGreaterThan(active.geometry.getAttribute('position').array.byteLength);
      expect(resources?.currentAndCandidateExactBufferCpuBytes).toBe(resources?.exactResidentBufferCpuBytes);
      expect(resources?.currentAndCandidateExactPayloadCpuBytes).toBe(resources?.exactResidentPayloadCpuBytes);
    }
    view.unmount();
    expect(activeImage.close).toHaveBeenCalledOnce();
    expect(secondaryImage.close).toHaveBeenCalledOnce();
    expect(secondaryGeometryDispose).toHaveBeenCalledOnce();
    expect(secondaryTextureDispose).toHaveBeenCalledOnce();
  });

  it('loads actual admitted definitions once and retains unchanged resources across topology, appearance and rigid occurrence changes', async () => {
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const sourceFile = 'assembly.json';
    const unitId = deriveModelInteractionUnitId({ sourceFile });
    const initial = await residentAssembly();
    expect(unitId).not.toBe(deriveModelInteractionUnitId({ geometryHash: initial.root.digest }));
    const view = render(
      <GltfMesh
        sourceFile={sourceFile}
        assemblyDisplay={initial}
        geometryHash={initial.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
    expect(parseAsync).toHaveBeenCalledTimes(2);
    expect(initial.admitted.readAsset).toHaveBeenCalledTimes(2);
    const [left, right, other] = surfacesOf(scenes.at(-1)!);
    if (!left || !right || !other || Array.isArray(left.material) || Array.isArray(right.material)) {
      throw new Error('Expected three isolated occurrence surfaces');
    }
    expect(left.geometry).toBe(right.geometry);
    // Different record bytes/names do not prevent reuse of identical decoded attributes.
    expect(initial.admitted.publication.parts['retained']!.variants['default']!.glb.digest).not.toBe(
      initial.admitted.publication.parts['other']!.variants['default']!.glb.digest,
    );
    expect(left.geometry.getAttribute('position').array).toEqual(other.geometry.getAttribute('position').array);
    expect(left.geometry).toBe(other.geometry);
    expect(left.material).not.toBe(right.material);
    left.material.opacity = 0.25;
    expect(right.material.opacity).toBe(1);
    if (!(left instanceof InstancedMesh)) {
      throw new TypeError('Expected actual retained batch');
    }
    expect(getModelComponentInstanceSlots(left)?.[0]?.owner.unitId).toBe(unitId);
    const retainedMatrix = left.instanceMatrix;
    const retainedVersion = retainedMatrix.version;
    const disposedAttributes: unknown[] = [];
    left.addEventListener('dispose', () => {
      disposedAttributes.push(left.instanceMatrix);
    });
    const geometry = getModelComponentSourceGeometry(left, 0);
    if (!geometry) {
      throw new Error('Expected canonical retained geometry');
    }
    const position = geometry.getAttribute('position');
    if (!(position instanceof BufferAttribute)) {
      throw new Error('Expected canonical buffer position attribute');
    }
    const { version } = position;
    const bvh = getOrBuildBvh(geometry);
    const dispose = vi.spyOn(geometry, 'dispose');
    const changed = await residentAssembly({ changed: true });
    view.rerender(
      <GltfMesh
        sourceFile={sourceFile}
        assemblyDisplay={changed}
        geometryHash={changed.root.digest}
        presentationRevision={2}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 2]);
    });
    expect(parseAsync).toHaveBeenCalledTimes(3);
    expect(changed.admitted.readAsset).toHaveBeenCalledTimes(1);
    const retainedSurface = surfacesOf(scenes.at(-1)!)[0]!;
    expect(retainedSurface.geometry).toBe(geometry);
    if (!(retainedSurface instanceof InstancedMesh)) {
      throw new TypeError('Expected retained instance owner');
    }
    expect(getModelComponentInstanceSlots(retainedSurface)?.[0]?.owner.unitId).toBe(unitId);
    expect(retainedSurface.instanceMatrix).toBe(retainedMatrix);
    expect(retainedSurface.instanceMatrix.version).toBe(retainedVersion);
    expect(disposedAttributes).toHaveLength(1);
    expect(disposedAttributes[0]).not.toBe(retainedMatrix);
    expect(getModelComponentInstanceSlots(left)).toBeUndefined();
    const changedOtherGeometry = surfacesOf(scenes.at(-1)!)[2]!.geometry;
    expect(changedOtherGeometry).not.toBe(other.geometry);
    expect(changedOtherGeometry.getAttribute('position').array).not.toEqual(position.array);
    expect(changedOtherGeometry.getAttribute('position').getZ(2)).toBe(2);
    const appearance = await residentAssembly({ changed: true, appearance: true });
    view.rerender(
      <GltfMesh
        sourceFile={sourceFile}
        assemblyDisplay={appearance}
        geometryHash={appearance.root.digest}
        presentationRevision={3}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 2, 3]);
    });
    expect(parseAsync).toHaveBeenCalledTimes(4);
    expect(appearance.admitted.readAsset).toHaveBeenCalledTimes(1);
    const red = surfacesOf(scenes.at(-1)!)[0]!;
    expect(red.geometry).toBe(geometry);
    if (!(red.material instanceof MeshStandardMaterial)) {
      throw new Error('Expected the actual occurrence PBR material');
    }
    expect(red.material.color.toArray()).toEqual([1, 0, 0]);
    const unchangedAppearance = surfacesOf(scenes.at(-1)!)[2]!;
    if (!(unchangedAppearance.material instanceof MeshStandardMaterial)) {
      throw new Error('Expected other definition PBR material');
    }
    // Both definitions use source-local material index zero; their parser inventories remain independent.
    expect(unchangedAppearance.material.color.toArray()).toEqual([0.5, 0.5, 0.5]);
    expect(unchangedAppearance.material).not.toBe(red.material);
    const moved = await residentAssembly({ changed: true, appearance: true, translation: 12 });
    view.rerender(
      <GltfMesh
        sourceFile={sourceFile}
        assemblyDisplay={moved}
        geometryHash={moved.root.digest}
        presentationRevision={4}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 2, 3, 4]);
    });
    expect(parseAsync).toHaveBeenCalledTimes(4);
    expect(moved.admitted.readAsset).not.toHaveBeenCalled();
    for (const [index, surface] of surfacesOf(scenes.at(-1)!)
      .filter((surface) => !surface.userData[surfaceBatchOwners.gltfSurfacePresentationTag])
      .entries()) {
      const world = getModelComponentWorldMatrix(
        surface,
        surface instanceof InstancedMesh ? 0 : undefined,
        new Matrix4(),
      );
      expect(world?.elements[12]).toBeCloseTo([12, 17, 22][index]!, 5);
    }
    expect(position.version).toBe(version);
    expect(getOrBuildBvh(geometry)).toBe(bvh);
    expect(dispose).not.toHaveBeenCalled();
    view.unmount();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('should retain real shared geometry, isolate mutable occurrence materials and release only the closing view', async () => {
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const bytes = buildGlb({ occurrences: 2 });
    const firstView = render(
      <GltfMesh gltfFile={bytes} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
    );
    const secondView = render(
      <GltfMesh gltfFile={bytes} geometryHash='other' presentationRevision={1} enableMatcap={false} />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 1]);
    });
    const first = (await parseAsync.mock.results[0]?.value) as GLTF;
    const second = (await parseAsync.mock.results[1]?.value) as GLTF;
    const surfaces: Mesh[] = [];
    first.scene.traverse((object) => {
      if (object.type === 'Mesh' && !object.userData[surfaceBatchOwners.gltfSurfacePresentationTag]) {
        surfaces.push(object as Mesh);
      }
    });
    expect(surfaces).toHaveLength(2);
    const [surface, sibling] = surfaces as [Mesh, Mesh];
    expect(sibling.geometry).toBe(surface.geometry);
    expect(sibling.material).not.toBe(surface.material);
    if (Array.isArray(surface.material) || Array.isArray(sibling.material)) {
      throw new TypeError('Expected one mutable material per occurrence.');
    }
    surface.material.opacity = 0.25;
    expect(sibling.material.opacity).toBe(1);
    const other = findSurface(second.scene);
    if (Array.isArray(other.material)) {
      throw new TypeError('Expected one mutable material in the other view.');
    }
    expect(other.material.opacity).toBe(1);
    const geometryDispose = vi.spyOn(surface.geometry, 'dispose');
    const materialDispose = vi.spyOn(surface.material, 'dispose');
    const otherGeometryDispose = vi.spyOn(other.geometry, 'dispose');
    const otherMaterialDispose = vi.spyOn(other.material, 'dispose');
    const position = surface.geometry.getAttribute('position') as BufferAttribute;
    const { version } = position;
    firstView.rerender(
      <GltfMesh
        gltfFile={buildGlb({ occurrences: 2, translation: 12 })}
        geometryHash='b'
        presentationRevision={2}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 1, 2]);
    });
    expect(parseAsync).toHaveBeenCalledTimes(2);
    expect(surface.geometry.getAttribute('position')).toBe(position);
    expect(position.version).toBe(version);
    expect(surfaces.map((mesh) => mesh.getWorldPosition(new Vector3()).x)).toEqual([12, 17]);
    expect(geometryDispose).not.toHaveBeenCalled();
    firstView.unmount();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(otherGeometryDispose).not.toHaveBeenCalled();
    expect(otherMaterialDispose).not.toHaveBeenCalled();
    secondView.unmount();
    expect(otherGeometryDispose).toHaveBeenCalledOnce();
    expect(otherMaterialDispose).toHaveBeenCalledOnce();
  });

  it('keeps borrowed definition resources with the coherent scene across candidate failure and cancellation', async () => {
    const initial = await residentAssembly();
    const changed = await residentAssembly({ changed: true });
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const view = render(
      <GltfMesh
        assemblyDisplay={initial}
        geometryHash={initial.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
    const { geometry } = findSurface(scenes.at(-1)!);
    const dispose = vi.spyOn(geometry, 'dispose');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
      throw new Error('Candidate pipeline failed');
    });
    view.rerender(
      <GltfMesh
        assemblyDisplay={changed}
        geometryHash={changed.root.digest}
        presentationRevision={2}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(log).toHaveBeenCalledWith(
        'Failed to load GLTF:',
        expect.objectContaining({ message: 'Candidate pipeline failed' }),
      );
    });
    expect(committedRevisions()).toEqual([1]);
    expect(dispose).not.toHaveBeenCalled();
    const gate = Promise.withResolvers<void>();
    const cancelled = await residentAssembly({ changed: true, appearance: true });
    const readActual = cancelled.admitted.readAsset;
    const read = vi.spyOn(cancelled.admitted, 'readAsset').mockImplementationOnce(async (digest) => {
      await gate.promise;
      return readActual(digest);
    });
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    view.rerender(
      <GltfMesh
        assemblyDisplay={cancelled}
        geometryHash={cancelled.root.digest}
        presentationRevision={3}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(read).toHaveBeenCalled();
    });
    view.rerender(
      <GltfMesh
        assemblyDisplay={initial}
        geometryHash={initial.root.digest}
        presentationRevision={4}
        enableMatcap={false}
      />,
    );
    expect(committedRevisions()).toEqual([1]);
    expect(dispose).not.toHaveBeenCalled();
    await act(async () => {
      gate.resolve();
    });
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 4]);
    });
    expect(dispose).not.toHaveBeenCalled();
    view.unmount();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it.each(['geometry', 'texture'] as const)(
    'coalesces a newer admitted request behind an older delayed %s key without disposing coherent resources',
    async (delayed) => {
      const bitmaps: Array<{ width: number; height: number; close: ReturnType<typeof vi.fn> }> = [];
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => {
          const bitmap = { width: 1, height: 1, close: vi.fn() };
          bitmaps.push(bitmap);
          return bitmap;
        }),
      );
      const initial = await residentAssembly({ textured: true });
      const older = await residentAssembly({ textured: true, appearance: true });
      const skipped = await residentAssembly({ textured: true, appearance: true, color: [0, 1, 0, 1] });
      const newer = await residentAssembly({ textured: true, appearance: true, color: [0, 0, 1, 1] });
      const parse = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
      const scenes: Object3D[] = [];
      mocks.observePreparation = vi.fn((scene: Object3D) => {
        scenes.push(scene);
      });
      const view = render(
        <GltfMesh
          assemblyDisplay={initial}
          geometryHash={initial.root.digest}
          presentationRevision={1}
          enableMatcap={false}
        />,
      );
      await waitFor(() => {
        expect(committedRevisions()).toEqual([1]);
      });
      const surface = findSurface(scenes.at(-1)!);
      if (!(surface.material instanceof MeshStandardMaterial) || !(surface.material.map instanceof Texture)) {
        throw new Error('Expected actual loader texture');
      }
      const { geometry } = surface;
      const texture = surface.material.map;
      const geometryDispose = vi.spyOn(geometry, 'dispose');
      const textureDispose = vi.spyOn(texture, 'dispose');
      const geometryVersion = (geometry.getAttribute('position') as BufferAttribute).version;
      const textureVersion = texture.version;
      const retainedBitmap = bitmaps[0]!;
      expect(surface.material.emissiveMap?.source.data).toBe(texture.source.data);
      const originalHash = hashing.sha256Bytes;
      const gate = Promise.withResolvers<void>();
      let paused = false;
      vi.spyOn(hashing, 'sha256Bytes').mockImplementation(async (bytes) => {
        const isTexture = new TextDecoder().decode(bytes.subarray(0, 14)).startsWith('data:image/png');
        if (!paused && (delayed === 'texture' ? isTexture : !isTexture)) {
          paused = true;
          await gate.promise;
        }
        return originalHash(bytes);
      });
      view.rerender(
        <GltfMesh
          assemblyDisplay={older}
          geometryHash={older.root.digest}
          presentationRevision={2}
          enableMatcap={false}
        />,
      );
      await waitFor(() => {
        expect(paused).toBe(true);
      });
      const pendingParses = parse.mock.calls.length;
      view.rerender(
        <GltfMesh
          assemblyDisplay={skipped}
          geometryHash={skipped.root.digest}
          presentationRevision={3}
          enableMatcap={false}
        />,
      );
      view.rerender(
        <GltfMesh
          assemblyDisplay={newer}
          geometryHash={newer.root.digest}
          presentationRevision={4}
          enableMatcap={false}
        />,
      );
      expect(committedRevisions()).toEqual([1]);
      expect(parse).toHaveBeenCalledTimes(pendingParses);
      expect(newer.admitted.readAsset).not.toHaveBeenCalled();
      expect(geometryDispose).not.toHaveBeenCalled();
      expect(textureDispose).not.toHaveBeenCalled();
      expect(retainedBitmap.close).not.toHaveBeenCalled();
      await act(async () => {
        gate.resolve();
      });
      await waitFor(() => {
        expect(committedRevisions()).toEqual([1, 4]);
      });
      expect(skipped.admitted.readAsset).not.toHaveBeenCalled();
      const live = findSurface(scenes.at(-1)!);
      expect(live.geometry).toBe(geometry);
      if (!(live.material instanceof MeshStandardMaterial)) {
        throw new Error('Expected isolated live PBR material');
      }
      expect(live.material.map).toBe(texture);
      expect(committedRevisions()).toEqual([1, 4]);
      expect(geometryDispose).not.toHaveBeenCalled();
      expect(textureDispose).not.toHaveBeenCalled();
      expect(retainedBitmap.close).not.toHaveBeenCalled();
      expect((geometry.getAttribute('position') as BufferAttribute).version).toBe(geometryVersion);
      expect(texture.version).toBe(textureVersion);
      for (const bitmap of bitmaps.slice(1)) {
        expect(bitmap.close).toHaveBeenCalledOnce();
      }
      view.unmount();
      expect(geometryDispose).toHaveBeenCalledOnce();
      expect(textureDispose).toHaveBeenCalledOnce();
      expect(retainedBitmap.close).toHaveBeenCalledOnce();
      for (const bitmap of bitmaps) {
        expect(bitmap.close).toHaveBeenCalledOnce();
      }
    },
  );

  it.each(['rerender', 'unmount'] as const)(
    'retires a cancelled actual parsed candidate after its awaited preparation settles (%s)',
    async (cancellation) => {
      const parseActual = GLTFLoader.prototype.parseAsync;
      const release = Promise.withResolvers<void>();
      let held: GLTF | undefined;
      const parse = vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(async function (
        this: GLTFLoader,
        ...args
      ) {
        const result = await parseActual.apply(this, args);
        if (parse.mock.calls.length === 2) {
          held = result;
          await release.promise;
        }
        return result;
      });
      const view = render(
        <GltfMesh gltfFile={buildGlb()} geometryHash='last-good' presentationRevision={1} enableMatcap={false} />,
      );
      try {
        await waitFor(() => {
          expect(committedRevisions()).toEqual([1]);
        });
        const lastGood = view.container.querySelector('primitive');
        view.rerender(
          <GltfMesh
            gltfFile={buildGlb({ indices: [0, 2, 1] })}
            geometryHash='stale'
            presentationRevision={2}
            enableMatcap={false}
          />,
        );
        await waitFor(() => {
          expect(held).toBeDefined();
        });
        const candidate = findSurface(held!.scene);
        if (Array.isArray(candidate.material)) {
          throw new TypeError('Expected one actual parsed fixture material');
        }
        const geometryDispose = vi.spyOn(candidate.geometry, 'dispose');
        const materialDispose = vi.spyOn(candidate.material, 'dispose');
        expect(view.container.querySelector('primitive')).toBe(lastGood);
        if (cancellation === 'unmount') {
          view.unmount();
        } else {
          view.rerender(
            <GltfMesh
              gltfFile={buildGlb({ lift: 1 })}
              geometryHash='latest'
              presentationRevision={3}
              enableMatcap={false}
            />,
          );
        }
        expect(geometryDispose).not.toHaveBeenCalled();
        expect(materialDispose).not.toHaveBeenCalled();
        await act(async () => {
          release.resolve();
          await release.promise;
        });
        await waitFor(() => {
          expect(geometryDispose).toHaveBeenCalledOnce();
          expect(materialDispose).toHaveBeenCalledOnce();
        });
        if (cancellation === 'rerender') {
          await waitFor(() => {
            expect(committedRevisions()).toEqual([1, 3]);
          });
        } else {
          expect(committedRevisions()).toEqual([1]);
        }
        expect(committedRevisions()).not.toContain(2);
      } finally {
        release.resolve();
        view.unmount();
      }
    },
  );

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
    await waitFor(() => {
      expect(committedRevisions()).toEqual([3]);
    });
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
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
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
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
    const initial = createBatches.mock.results[0]!.value as surfaceBatchOwners.GltfSurfaceBatches;
    const disposeInitial = vi.spyOn(initial, 'dispose');
    view.rerender(
      <GltfMesh gltfFile={second} geometryHash='b' presentationRevision={2} enableMatcap={false} enableLines={false} />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 2]);
    });
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
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
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
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
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
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 2]);
    });
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

const resetAssemblyFixture = (): void => {
  mocks.camera = new OrthographicCamera(-3000, 3000, 3000, -3000, 0.1, 10_000);
  mocks.camera.position.z = 100;
  mocks.camera.updateMatrixWorld(true);
  mocks.modelUnit.hiddenComponentIds = [];
  mocks.modelUnit.isolatedComponentIds = [];
  mocks.modelUnit.opacityByComponentId = {};
  mocks.modelUnit.selectedComponentIds = [];
  mocks.modelUnit.focusedComponentId = undefined;
  mocks.sectionView = { isActive: false };
};

describe('actual candidate indexed demand', () => {
  beforeEach(resetAssemblyFixture);
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mocks.graphicsActor.send.mockClear();
    mocks.frameCallback = undefined;
    delete mocks.observePreparation;
  });
  it('should retain full thousand-occurrence facts while constructing only demanded ancestors and reusing the same index on camera changes', async () => {
    mocks.camera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
    mocks.camera.position.z = 10;
    mocks.camera.updateMatrixWorld(true);
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const build = vi.spyOn(assemblyDemand, 'buildAssemblyDemandIndex');
    const actualValidate = geometryCore.validateAdmittedAssemblyGlb;
    let occurrenceReads = 0;
    let fullOccurrenceCount = 0;
    const validate = vi.spyOn(geometryCore, 'validateAdmittedAssemblyGlb').mockImplementation(async (input) => {
      const metadata = await actualValidate(input);
      fullOccurrenceCount = metadata.occurrences.length;
      // Preserve the actual admitted rows and values; count numeric reads of their candidate-owned array.
      // After admission, a camera replacement must touch demanded leaves rather than all1000 placements.
      const occurrences = new Proxy(metadata.occurrences, {
        get(target, property, receiver): unknown {
          if (typeof property === 'string' && /^(?:0|[1-9][0-9]*)$/u.test(property)) {
            occurrenceReads += 1;
          }
          return Reflect.get(target, property, receiver);
        },
      });
      return { ...metadata, occurrences };
    });
    const parse = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const display = await residentAssembly({ occurrenceCount: 1000 });
    const view = render(
      <GltfMesh
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toHaveLength(1);
    });
    act(() => mocks.frameCallback?.());
    const first = measuredResources();
    expect(build).toHaveBeenCalledOnce();
    expect(validate).toHaveBeenCalledOnce();
    expect(first?.sceneObjectCount).toBeLessThan(30);
    expect(first?.residentOccurrenceCount).toBeLessThan(4);
    expect(first?.demandIndexCpuBytes).toBeGreaterThan(0);
    const committed = mocks.graphicsActor.send.mock.calls.find(
      ([event]) => event.type === 'gltfPresentationCommitted',
    )?.[0];
    const nodeCount = committed?.type === 'gltfPresentationCommitted' ? committed.manifest.nodeOrder.length : undefined;
    expect(nodeCount).toBeGreaterThan(1000);
    const firstCapture = captureCommittedGltfDrawInventory(scenes.at(-1)!);
    expect(firstCapture?.metadata.occurrences).toHaveLength(fullOccurrenceCount);
    occurrenceReads = 0;
    mocks.camera.position.x = 400;
    mocks.camera.updateMatrixWorld(true);
    act(() => mocks.frameCallback?.());
    await waitFor(() => {
      expect(committedRevisions()).toHaveLength(2);
    });
    act(() => mocks.frameCallback?.());
    expect(build).toHaveBeenCalledOnce();
    expect(validate).toHaveBeenCalledOnce();
    expect(measuredResources()?.demandIndexCpuBytes).toBe(first?.demandIndexCpuBytes);
    expect(measuredResources()?.sceneObjectCount).toBeLessThan(30);
    expect(parse).toHaveBeenCalledOnce();
    expect(display.admitted.readAsset).toHaveBeenCalledOnce();
    expect(occurrenceReads).toBeGreaterThan(0);
    expect(occurrenceReads).toBeLessThan(fullOccurrenceCount);
    const replacement = captureCommittedGltfDrawInventory(scenes.at(-1)!);
    expect(replacement?.metadata).toBe(firstCapture?.metadata);
    expect(replacement?.candidateSceneId).not.toBe(firstCapture?.candidateSceneId);
    expect(firstCapture?.isCurrent()).toBe(false);
    expect(replacement?.isCurrent()).toBe(true);
    view.unmount();
  });
  it('should attribute same-key camera residency replacement to the actual current scene UUID', async () => {
    mocks.camera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
    mocks.camera.position.z = 10;
    mocks.camera.updateMatrixWorld(true);
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const display = await residentAssembly({ occurrenceCount: 20, spacing: 20, withEdges: true });
    const stringify = vi.spyOn(JSON, 'stringify');
    const view = render(
      <GltfMesh
        assemblyDisplay={display}
        sourceFile='assembly.json'
        geometryHash={display.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    const presentedMeasurements = (): GltfPresentationTelemetry[] =>
      mocks.graphicsActor.send.mock.calls.flatMap(([event]) =>
        event.type === 'gltfPresentationMeasured' && event.telemetry.outcome === 'presented' ? [event.telemetry] : [],
      );
    try {
      await waitFor(() => {
        expect(committedRevisions()).toEqual([1]);
      });
      const firstScene = scenes.at(-1)!;
      const firstCapture = captureCommittedGltfDrawInventory(firstScene);
      expect(firstCapture?.candidateSceneId).toBe(firstScene.uuid);
      expect(firstCapture?.isCurrent()).toBe(true);
      act(() => mocks.frameCallback?.());
      await waitFor(() => {
        expect(presentedMeasurements()).toHaveLength(1);
      });
      expect(presentedMeasurements()[0]?.candidateSceneId).toBe(firstScene.uuid);

      mocks.camera.position.x = 80;
      mocks.camera.updateMatrixWorld(true);
      act(() => mocks.frameCallback?.());
      await waitFor(() => {
        expect(committedRevisions()).toEqual([1, 1]);
      });
      const currentScene = scenes.at(-1)!;
      const currentCapture = captureCommittedGltfDrawInventory(currentScene);
      expect(currentScene.uuid).not.toBe(firstScene.uuid);
      expect(currentCapture?.candidateSceneId).toBe(currentScene.uuid);
      expect(currentCapture?.isCurrent()).toBe(true);
      expect(firstCapture?.isCurrent()).toBe(false);
      expect(captureCommittedGltfDrawInventory(firstScene)).toBeUndefined();
      act(() => mocks.frameCallback?.());
      await waitFor(() => {
        expect(presentedMeasurements()).toHaveLength(2);
      });
      const measurements = presentedMeasurements();
      expect(measurements.map(({ key, revision, backend }) => ({ key, revision, backend }))).toEqual([
        { key: display.root.digest, revision: 1, backend: 'webgl' },
        { key: display.root.digest, revision: 1, backend: 'webgl' },
      ]);
      expect(measurements.map(({ candidateSceneId }) => candidateSceneId)).toEqual([
        firstScene.uuid,
        currentScene.uuid,
      ]);
      expect(
        measurements.filter(({ candidateSceneId }) => candidateSceneId === currentCapture?.candidateSceneId),
      ).toHaveLength(1);
      const manifests = mocks.graphicsActor.send.mock.calls.flatMap(([event]) =>
        event.type === 'gltfPresentationCommitted' ? [event.manifest] : [],
      );
      expect(manifests).toHaveLength(2);
      expect(
        stringify.mock.calls.filter(([value]) => {
          const payload: unknown = value;
          return Array.isArray(payload) && manifests.some((manifest) => payload[1] === manifest.nodeOrder);
        }),
      ).toHaveLength(0);
    } finally {
      view.unmount();
    }
  });
  it('should produce real thousand-occurrence surface and edge batches with genuine canonical picks and owned storage', async () => {
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const display = await residentAssembly({ occurrenceCount: 1000, withEdges: true });
    const view = render(
      <GltfMesh
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toHaveLength(1);
    });
    const scene = scenes.at(-1)!;
    const surfaces = surfacesOf(scene);
    const slots = surfaces.flatMap((mesh) => getModelComponentInstanceSlots(mesh) ?? []);
    const edgeBatches: Array<NonNullable<ReturnType<typeof getGltfOccurrenceEdgeBatch>>> = [];
    let objects = 0;
    scene.traverse((object) => {
      objects++;
      const edge = getGltfOccurrenceEdgeBatch(object);
      if (edge) {
        edgeBatches.push(edge);
      }
    });
    expect(slots).toHaveLength(1000);
    expect(new Set(slots.map((slot) => slot.owner.componentId)).size).toBe(1000);
    expect(surfaces.every((mesh) => mesh instanceof InstancedMesh)).toBe(true);
    expect(surfaces.length).toBeLessThan(100);
    expect(objects).toBeLessThan(300);
    let edgeOccurrences = 0;
    for (const batch of edgeBatches) {
      edgeOccurrences += batch.segments.length;
    }
    expect(edgeOccurrences).toBe(1000);
    expect(edgeBatches.length).toBeLessThan(100);
    const first = surfaces[0]!;
    if (!(first instanceof InstancedMesh)) {
      throw new TypeError('Expected actual batch producer');
    }
    const firstSlots = getModelComponentInstanceSlots(first)!;
    const matrix = getModelComponentWorldMatrix(first, 1, new Matrix4());
    if (!matrix || !firstSlots[1]) {
      throw new Error('Expected actual second draw slot');
    }
    const point = new Vector3(0.25, 0.25, 0).applyMatrix4(matrix);
    const raycaster = new Raycaster(new Vector3(point.x, point.y, point.z + 10), new Vector3(0, 0, -1));
    const hit = bvhRaycast.raycastFirstVisibleMeshHit({ raycaster, meshes: surfaces });
    expect(hit?.object).toBe(first);
    expect(hit?.instanceId).toBe(1);
    expect(hit && getModelComponentHitOwner(hit)?.componentId).toBe(firstSlots[1].owner.componentId);
    const geometryDispose = vi.spyOn(first.geometry, 'dispose');
    const meshDispose = vi.spyOn(first, 'dispose');
    act(() => mocks.frameCallback?.());
    const inventory = measuredResources();
    const instanceBuffers = new Set<ArrayBufferLike>();
    let instanceGpuBytes = 0;
    scenes.at(-1)!.traverse((object) => {
      if (!(object instanceof InstancedMesh)) {
        return;
      }
      for (const attribute of [object.instanceMatrix, ...(object.instanceColor ? [object.instanceColor] : [])]) {
        instanceBuffers.add(attribute.array.buffer);
        instanceGpuBytes += attribute.array.byteLength;
      }
    });
    const instanceCpuBytes = [...instanceBuffers].reduce((sum, buffer) => sum + buffer.byteLength, 0);
    expect(instanceCpuBytes).toBeGreaterThanOrEqual(1000 * 16 * 4);
    expect(inventory?.instanceAttributeCpuBytes).toBe(instanceCpuBytes);
    expect(inventory?.instanceAttributeGpuBytesEstimate).toBe(instanceGpuBytes);
    expect(inventory?.instanceSlotDescriptorsSerializedBytes).toBeGreaterThan(0);
    view.unmount();
    expect(meshDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(getModelComponentInstanceSlots(first)).toBeUndefined();
  });

  it('should atomically retain overlapping translucent occurrences on the ordinary material sorting path', async () => {
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const display = await residentAssembly({ occurrenceCount: 12, spacing: 0 });
    const view = render(
      <GltfMesh
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toHaveLength(1);
    });
    const initial = surfacesOf(scenes.at(-1)!);
    expect(initial).toHaveLength(1);
    const slots = getModelComponentInstanceSlots(initial[0]!)!;
    expect(slots).toHaveLength(12);
    const changedId = slots[1]!.owner.componentId;
    const hiddenId = slots[2]!.owner.componentId;
    const { geometry } = initial[0]!;
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    mocks.modelUnit = { ...mocks.modelUnit, opacityByComponentId: { [changedId]: 0.5 } };
    view.rerender(
      <GltfMesh
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={2}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toHaveLength(2);
    });
    const next = surfacesOf(scenes.at(-1)!);
    const translucent = next.find(
      (mesh) => !(mesh instanceof InstancedMesh) && getModelComponentId(mesh) === changedId,
    );
    const opaque = next.find((mesh) => mesh instanceof InstancedMesh);
    if (!translucent || !opaque || Array.isArray(translucent.material)) {
      throw new Error('Expected one ordinary translucent owner beside opaque batch');
    }
    expect(translucent.material.opacity).toBe(0.5);
    expect(translucent.material.transparent).toBe(true);
    expect(getModelComponentInstanceSlots(opaque)).toHaveLength(11);
    expect(translucent.geometry).toBe(geometry);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(getModelComponentInstanceSlots(initial[0]!)).toBeUndefined();
    mocks.modelUnit = { ...mocks.modelUnit, hiddenComponentIds: [hiddenId] };
    view.rerender(
      <GltfMesh
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={3}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toHaveLength(3);
    });
    const visibleSlots = surfacesOf(scenes.at(-1)!).flatMap((mesh) => getModelComponentInstanceSlots(mesh) ?? []);
    expect(visibleSlots).toHaveLength(10);
    expect(visibleSlots.some((slot) => slot.owner.componentId === hiddenId)).toBe(false);
    mocks.modelUnit = { ...mocks.modelUnit, hiddenComponentIds: [] };
    view.rerender(
      <GltfMesh
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={3}
        enableMatcap={false}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toHaveLength(4);
    });
    const restoredSlots = surfacesOf(scenes.at(-1)!).flatMap((mesh) => getModelComponentInstanceSlots(mesh) ?? []);
    expect(restoredSlots).toHaveLength(11);
    expect(restoredSlots.some((slot) => slot.owner.componentId === hiddenId)).toBe(true);
    view.unmount();
    expect(geometryDispose).toHaveBeenCalledOnce();
  });

  it.each([
    {
      label: 'source-transmissive',
      transparent: false,
      transmission: 0.5,
      intrinsic: new Matrix4(),
      occurrence: new Matrix4(),
    },
    { label: 'opaque', transparent: false, intrinsic: new Matrix4(), occurrence: new Matrix4() },
    { label: 'source-transparent', transparent: true, intrinsic: new Matrix4(), occurrence: new Matrix4() },
    { label: 'mirrored', transparent: false, intrinsic: new Matrix4(), occurrence: new Matrix4().makeScale(-1, 1, 1) },
    {
      label: 'positive orthogonal scale',
      transparent: false,
      intrinsic: new Matrix4(),
      occurrence: new Matrix4().makeScale(2, 3, 1),
    },
    {
      label: 'composed shear',
      transparent: false,
      intrinsic: new Matrix4().makeRotationZ(Math.PI / 4),
      occurrence: new Matrix4().makeScale(2, 1, 1),
    },
  ])(
    'should preserve admitted $label source draw placements with qualified batch eligibility',
    async ({ label, transparent, intrinsic, occurrence, transmission }) => {
      const scenes: Object3D[] = [];
      mocks.observePreparation = vi.fn((scene: Object3D) => {
        scenes.push(scene);
      });
      const display = await residentAssembly({
        occurrenceCount: 12,
        spacing: 0,
        sourceTransparent: transparent,
        sourceTransmission: transmission,
        sourcePlacement: intrinsic.toArray(),
        occurrencePlacement: occurrence.toArray(),
      });
      const view = render(
        <GltfMesh
          assemblyDisplay={display}
          geometryHash={display.root.digest}
          presentationRevision={1}
          enableMatcap={false}
        />,
      );
      await waitFor(() => {
        expect(committedRevisions()).toHaveLength(1);
      });
      const surfaces = surfacesOf(scenes.at(-1)!);
      const batched = label === 'positive orthogonal scale' || label === 'opaque';
      expect(surfaces).toHaveLength(batched ? 1 : 12);
      expect(surfaces.every((mesh) => mesh instanceof InstancedMesh === batched)).toBe(true);
      const matrix = getModelComponentWorldMatrix(surfaces[0]!, batched ? 0 : undefined, new Matrix4());
      const expected = occurrence.clone().multiply(intrinsic);
      for (const [index, value] of expected.elements.entries()) {
        expect(matrix?.elements[index]).toBeCloseTo(value, 6);
      }
      expect(surfaces[0]!.geometry.getAttribute('position').getX(1)).toBe(1);
      if (label === 'source-transmissive') {
        const { material } = surfaces[0]!;
        if (Array.isArray(material) || !('transmission' in material)) {
          throw new Error('Expected actual physical transmissive material');
        }
        expect(material.transparent).toBe(false);
        expect(material.transmission).toBe(0.5);
      }
      if (label === 'positive orthogonal scale') {
        // The installed instanced normal shader divides by each basis length squared before multiplication.
        const normal = new Vector3(1, 2, 3).normalize();
        const { elements } = expected;
        const lengthsSquared = [
          new Vector3(elements[0], elements[1], elements[2]).lengthSq(),
          new Vector3(elements[4], elements[5], elements[6]).lengthSq(),
          new Vector3(elements[8], elements[9], elements[10]).lengthSq(),
        ];
        const installedCorrection = normal
          .clone()
          .divide(new Vector3(...lengthsSquared))
          .applyMatrix3(new Matrix3().setFromMatrix4(expected))
          .normalize();
        const inverseTranspose = normal.clone().applyMatrix3(new Matrix3().getNormalMatrix(matrix!)).normalize();
        expect(installedCorrection.distanceTo(inverseTranspose)).toBeLessThan(1e-12);
      }
      if (label === 'composed shear') {
        const inverseTranspose = new Vector3(1, 0, 0).applyMatrix3(new Matrix3().getNormalMatrix(matrix!)).normalize();
        const unsupportedBasisCorrection = new Vector3(1, 0, 0)
          .applyMatrix3(new Matrix3().setFromMatrix4(expected))
          .normalize();
        expect(inverseTranspose.dot(unsupportedBasisCorrection)).toBeLessThan(0.9);
        expect(surfaces[0]!.matrixWorld.determinant()).toBeGreaterThan(0);
      }
      view.unmount();
    },
  );
});

describe('actual assembly detail upload owner oracle', () => {
  it.runIf(process.env['TAU_E2E_CURVED_GLBS'] !== undefined)(
    'should acquire exact delivered curved GLB detail guards and installed simplifier outcomes without mutating canonical evidence',
    async () => {
      const configuredInput = process.env['TAU_E2E_CURVED_GLBS'];
      if (!configuredInput || !isAbsolute(configuredInput)) {
        throw new Error('Curved acquisition requires its actual absolute artifact path.');
      }
      const input = resolve(configuredInput);
      const outputRoot = resolve(import.meta.dirname, '../../../../../../../..', 'out');
      if (!input.startsWith(`${outputRoot}${sep}`)) {
        throw new Error('Curved acquisition must use the existing workspace artifact tree.');
      }
      const acquisition: unknown = JSON.parse(await readFile(input, 'utf8'));
      if (
        !acquisition ||
        typeof acquisition !== 'object' ||
        !('files' in acquisition) ||
        !Array.isArray(acquisition.files)
      ) {
        throw new Error('Actual curved original GLB acquisition is unavailable.');
      }
      const files: readonly unknown[] = acquisition.files;
      const expected = new Map([
        [
          'sha256:9d786f824f87f7b9903a9b6ceb7fc58c672e972ac6cc673f58b5db52c0241042',
          { byteLength: 1_355_928, detailIndexCount: 24_192 },
        ],
        [
          'sha256:0e2f6ddeaa5ad8993169afc60e7be299618b4a61fec48872511062f1ffa7f421',
          { byteLength: 1_377_432, detailIndexCount: 24_576 },
        ],
      ]);
      const outcomes: Array<Record<string, unknown>> = [];
      const geometryClass: new () => BufferGeometry<NormalBufferAttributes, BufferGeometryEventMap> = BufferGeometry;
      const materialClass: new () => Material<MaterialEventMap> = Material;
      const resources = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      const simplify = MeshoptSimplifier.simplifyWithAttributes;
      const calls: Array<Record<string, unknown>> = [];
      const spy = vi.spyOn(MeshoptSimplifier, 'simplifyWithAttributes').mockImplementation((...arguments_) => {
        const [
          indices,
          positions,
          positionStride,
          attributes,
          attributeStride,
          weights,
          locks,
          targetCount,
          targetError,
          flags,
        ] = arguments_;
        const call: Record<string, unknown> = {
          inputIndexCount: indices.length,
          positionCount: positions.length / positionStride,
          attributeLength: attributes.length,
          attributeStride,
          weights,
          explicitLockedVertices: locks?.filter((value) => value !== 0).length ?? 0,
          targetCount,
          targetError,
          flags,
        };
        calls.push(call);
        const originalIndices = Uint32Array.from(indices);
        const originalPositions = Float32Array.from(positions);
        const originalAttributes = Float32Array.from(attributes);
        try {
          const [output, error] = simplify(...arguments_);
          Object.assign(call, { outputIndexCount: output.length, error });
          expect(flags).toEqual(['LockBorder', 'Permissive']);
          expect(output.length).toBeGreaterThanOrEqual(3);
          expect(output.length).toBeLessThanOrEqual(indices.length);
          expect(output.length % 3).toBe(0);
          expect(output.every((index) => index < positions.length / positionStride)).toBe(true);
          expect(Number.isFinite(error)).toBe(true);
          expect(error).toBeGreaterThanOrEqual(0);
          expect(error).toBeLessThanOrEqual(Math.fround(targetError));
          expect(indices).toEqual(originalIndices);
          expect(positions).toEqual(originalPositions);
          expect(attributes).toEqual(originalAttributes);
          return [output, error];
        } catch (error) {
          Object.assign(call, {
            thrown: error instanceof Error ? { name: error.name, message: error.message } : String(error),
          });
          throw error;
        }
      });
      const [body] = await Promise.allSettled([
        Promise.resolve().then(async () => {
          expect(files).toHaveLength(2);
          for (const file of files) {
            if (
              !file ||
              typeof file !== 'object' ||
              !('digest' in file) ||
              typeof file.digest !== 'string' ||
              !('byteLength' in file) ||
              typeof file.byteLength !== 'number' ||
              !('base64' in file) ||
              typeof file.base64 !== 'string'
            ) {
              throw new Error('Actual curved GLB bytes lack their digest/length binding.');
            }
            const bytes = Uint8Array.from(Buffer.from(file.base64, 'base64'));
            const expectedFile = expected.get(file.digest);
            expect(bytes.byteLength).toBe(expectedFile?.byteLength);
            expect(bytes.byteLength).toBe(file.byteLength);
            // oxlint-disable-next-line no-await-in-loop -- Each exact delivered GLB is verified before its loader read.
            expect(contentDigest({ value: `sha256:${await hashing.sha256Bytes(bytes)}` })).toBe(file.digest);
            expect(expected.delete(file.digest)).toBe(true);
            const { json } = parseGltfBytes(bytes);
            const glbPrimitives: unknown = json.meshes?.flatMap(({ primitives }) => primitives);
            // oxlint-disable-next-line no-await-in-loop -- Acquire one exact delivered definition at a time through the existing loader.
            const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '');
            const primitives: BufferGeometry[] = [];
            gltf.scene.traverse((object) => {
              const geometry: unknown = 'geometry' in object ? object.geometry : undefined;
              if (geometry instanceof geometryClass) {
                primitives.push(geometry);
                resources.add(geometry);
              }
              if ('material' in object) {
                const loadedMaterial: unknown = object.material;
                const loadedMaterials: readonly unknown[] = Array.isArray(loadedMaterial)
                  ? loadedMaterial
                  : [loadedMaterial];
                for (const material of loadedMaterials) {
                  if (material instanceof materialClass) {
                    materials.add(material);
                  }
                }
              }
            });
            expect(primitives).toHaveLength(1);
            for (const canonical of primitives) {
              const originalMaterials = [...materials].map((material) => ({ material, json: material.toJSON() }));
              const originalIndex = canonical.index?.array.map((value) => value);
              const originals = Object.entries(canonical.attributes).map(([name, attribute]) => ({
                name,
                array: attribute.array.map((value) => value),
              }));
              const positions = canonical.getAttribute('position');
              const appearance = Object.keys(canonical.attributes).filter((name) => name !== 'position');
              const normalSeams = new Map<string, Set<string>>();
              const uvSeams = new Map<string, Set<string>>();
              for (let vertex = 0; vertex < positions.count; vertex++) {
                const key = JSON.stringify([positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex)]);
                for (const [name, seams] of [
                  ['normal', normalSeams],
                  ['uv', uvSeams],
                ] as const) {
                  const attribute = canonical.hasAttribute(name) ? canonical.getAttribute(name) : undefined;
                  const values = seams.get(key) ?? new Set<string>();
                  if (attribute) {
                    values.add(
                      JSON.stringify([
                        attribute.getX(vertex),
                        attribute.getY(vertex),
                        ...(attribute.itemSize > 2 ? [attribute.getZ(vertex)] : []),
                      ]),
                    );
                  }
                  seams.set(key, values);
                }
              }
              const firstCall = calls.length;
              const row = {
                digest: file.digest,
                byteLength: bytes.byteLength,
                glbPrimitives,
                canonicalGeometryId: canonical.uuid,
                morphAttributeNames: Object.keys(canonical.morphAttributes),
                groups: canonical.groups,
                drawRange: { start: canonical.drawRange.start, count: String(canonical.drawRange.count) },
                attributes: Object.entries(canonical.attributes).map(([name, attribute]) => ({
                  name,
                  constructor: attribute.constructor.name,
                  itemSize: attribute.itemSize,
                  count: attribute.count,
                  normalized: attribute.normalized,
                  arrayConstructor: attribute.array.constructor.name,
                  finite: attribute.array.every((value) => Number.isFinite(value)),
                })),
                appearance,
                attributeStride: appearance.reduce((sum, name) => sum + canonical.getAttribute(name).itemSize, 0),
                indexCount: canonical.index?.count,
                uniqueIndexCount: canonical.index ? new Set(canonical.index.array).size : canonical.index,
                indexConstructor: canonical.index?.array.constructor.name,
                identityIndices: canonical.index?.array.every((value, index) => value === index),
                uniquePositionCount: normalSeams.size,
                positionsWithNormalSeams: [...normalSeams.values()].filter((values) => values.size > 1).length,
                positionsWithUvSeams: [...uvSeams.values()].filter((values) => values.size > 1).length,
                simplifierSupported: MeshoptSimplifier.supported,
              };
              outcomes.push(row);
              // oxlint-disable-next-line no-await-in-loop -- Observe the unchanged actual owner once per original canonical primitive.
              const detail = await deriveAssemblyDetailGeometry({
                canonical,
                policy: { triangleRatio: 0.5, approximateRelativeError: 0.05 },
              });
              if (detail) {
                resources.add(detail.geometry);
              }
              outcomes[outcomes.length - 1] = {
                ...row,
                returnedDetail: Boolean(detail),
                detailIndexCount: detail?.geometry.index?.count,
                approximateSourceError: detail?.approximateSourceError,
                actualSimplifierCalls: calls.slice(firstCall),
              };
              expect(canonical.index?.array).toEqual(originalIndex);
              for (const { name, array } of originals) {
                expect(canonical.getAttribute(name).array).toEqual(array);
              }
              for (const { material, json: original } of originalMaterials) {
                expect(material.toJSON()).toEqual(original);
              }
              if (!detail?.geometry.index || !canonical.index) {
                throw new Error('Expected actual reduced detail for each exact delivered normal-only GLB');
              }
              expect(calls.slice(firstCall)).toHaveLength(1);
              expect(detail.geometry.index.count).toBe(expectedFile?.detailIndexCount);
              expect(detail.geometry.index.count).toBeGreaterThanOrEqual(3);
              expect(detail.geometry.index.count).toBeLessThan(canonical.index.count);
              expect(detail.geometry.index.count % 3).toBe(0);
              expect(detail.geometry.index.array.every((index) => index < positions.count)).toBe(true);
              expect(Number.isFinite(detail.approximateSourceError)).toBe(true);
              expect(detail.approximateSourceError).toBeGreaterThanOrEqual(0);
              for (const { name } of originals) {
                expect(detail.geometry.getAttribute(name)).not.toBe(canonical.getAttribute(name));
                expect(detail.geometry.getAttribute(name).array).toBe(canonical.getAttribute(name).array);
              }
            }
          }
          expect(expected.size).toBe(0);
        }),
      ]);
      const [cleanup] = await Promise.allSettled([
        Promise.resolve().then(async () => {
          spy.mockRestore();
          for (const resource of resources) {
            resource.dispose();
          }
          for (const material of materials) {
            material.dispose();
          }
          await writeFile(
            `${input}.normal-only-detail.json`,
            JSON.stringify(
              {
                status: 'RAW_CPU_NORMAL_ONLY_DETAIL_REGRESSION',
                input,
                nodeVersion: process.version,
                policy: {
                  triangleRatio: 0.5,
                  approximateRelativeError: 0.05,
                  flags: ['LockBorder', 'Permissive'],
                  appearanceWeights: 'unchanged all components weight 1',
                },
                outcomes,
                calls,
                bodyStatus: body.status,
                bodyFailure:
                  body.status === 'rejected'
                    ? body.reason instanceof Error
                      ? { name: body.reason.name, message: body.reason.message }
                      : String(body.reason)
                    : undefined,
                semantics:
                  'Exact original normal-only GLB detail regression; unchanged canonical arrays/materials, no GPU/appearance/warehouse qualification.',
              },
              undefined,
              2,
            ),
          );
        }),
      ]);
      if (body.status === 'rejected') {
        const error: unknown = body.reason;
        throw error;
      }
      if (cleanup.status === 'rejected') {
        const error: unknown = cleanup.reason;
        throw error;
      }
    },
  );

  it.each(['uv', 'color', 'tangent'] as const)(
    'should keep canonical CPU arrays immutable with distinct detail upload owners and real simplifier indices with %s appearance',
    async (appearance) => {
      const canonical = new PlaneGeometry(10, 10, 16, 16);
      if (appearance !== 'uv') {
        canonical.deleteAttribute('uv');
        const components = appearance === 'tangent' ? 4 : 3;
        canonical.setAttribute(
          appearance,
          new BufferAttribute(
            new Float32Array(canonical.getAttribute('position').count * components).fill(1),
            components,
          ),
        );
      }
      const originalIndex = canonical.index!.array.map((value) => value);
      const position = canonical.getAttribute('position');
      const originalPosition = position.array.map((value) => value);
      const spy = vi.spyOn(MeshoptSimplifier, 'simplifyWithAttributes');
      let detail: Awaited<ReturnType<typeof deriveAssemblyDetailGeometry>>;
      const disposeCanonical = vi.fn();
      canonical.addEventListener('dispose', disposeCanonical);
      try {
        detail = await deriveAssemblyDetailGeometry({
          canonical,
          policy: { triangleRatio: 0.5, approximateRelativeError: 0.05 },
        });
        if (!detail) {
          throw new Error('Expected actual simplifier to reduce a welded planar grid');
        }
        expect(spy).toHaveBeenCalledOnce();
        expect(spy.mock.calls[0]?.[9]).toEqual(['LockBorder']);
        expect(spy.mock.calls[0]?.[5].every((weight) => weight === 1)).toBe(true);
        expect(detail.geometry.index!.count).toBeLessThan(canonical.index!.count);
        expect(detail.geometry.getAttribute('position')).not.toBe(position);
        expect(detail.geometry.getAttribute('position').array).toBe(position.array);
        expect(detail.geometry.getAttribute('normal')).not.toBe(canonical.getAttribute('normal'));
        expect(detail.geometry.getAttribute('normal').array).toBe(canonical.getAttribute('normal').array);
        expect(detail.geometry.getAttribute(appearance)).not.toBe(canonical.getAttribute(appearance));
        expect(detail.geometry.getAttribute(appearance).array).toBe(canonical.getAttribute(appearance).array);
        expect(Number.isFinite(detail.approximateSourceError)).toBe(true);
        expect(detail.approximateSourceError).toBeGreaterThanOrEqual(0);
        detail.geometry.dispose();
        expect(disposeCanonical).not.toHaveBeenCalled();
        expect(canonical.index!.array).toEqual(originalIndex);
        expect(position.array).toEqual(originalPosition);
      } finally {
        spy.mockRestore();
        detail?.geometry.dispose();
        canonical.dispose();
      }
    },
  );
  it('should create one independent interleaved upload data owner while aliasing its canonical CPU backing', async () => {
    const canonical = new PlaneGeometry(10, 10, 16, 16);
    const values = new Float32Array(canonical.getAttribute('position').count * 6);
    for (let index = 0; index < canonical.getAttribute('position').count; index++) {
      values.set(
        [canonical.getAttribute('position').getX(index), canonical.getAttribute('position').getY(index), 0, 0, 0, 1],
        index * 6,
      );
    }
    const data = new InterleavedBuffer(values, 6);
    canonical.setAttribute('position', new InterleavedBufferAttribute(data, 3, 0));
    canonical.setAttribute('normal', new InterleavedBufferAttribute(data, 3, 3));
    const detail = await deriveAssemblyDetailGeometry({
      canonical,
      policy: { triangleRatio: 0.5, approximateRelativeError: 0.05 },
    });
    if (!detail) {
      throw new Error('Expected interleaved grid detail');
    }
    try {
      const position = detail.geometry.getAttribute('position');
      const normal = detail.geometry.getAttribute('normal');
      if (!(position instanceof InterleavedBufferAttribute) || !(normal instanceof InterleavedBufferAttribute)) {
        throw new Error('Expected retained interleaved upload semantics');
      }
      expect(position.data).not.toBe(data);
      expect(position.data).toBe(normal.data);
      expect(position.data.array).toBe(values);
      expect(position.offset).toBe(0);
      expect(normal.offset).toBe(3);
    } finally {
      detail.geometry.dispose();
      canonical.dispose();
    }
  });
  it('should reject sorted actual physical and node material owners before batch admission while keeping opaque eligibility', () => {
    const physical = new MeshPhysicalMaterial({ transparent: false, transmission: 0.5 });
    const opaque = new MeshPhysicalMaterial();
    const node = new MeshPhysicalNodeMaterial();
    try {
      expect(isOpaqueAssemblyBatchMaterial(opaque)).toBe(true);
      expect(physical.transparent).toBe(false);
      expect(isOpaqueAssemblyBatchMaterial(physical)).toBe(false);
      node.transmissionNode = float(0.5);
      expect(isOpaqueAssemblyBatchMaterial(node)).toBe(false);
      node.transmissionNode = null;
      node.backdropNode = float(0.5);
      expect(isOpaqueAssemblyBatchMaterial(node)).toBe(false);
    } finally {
      physical.dispose();
      opaque.dispose();
      node.dispose();
    }
  });
  it('should retain full geometry for special attributes and meshes too small to simplify', async () => {
    const canonical = new PlaneGeometry(10, 10, 8, 8);
    const small = new PlaneGeometry(1, 1, 1, 1);
    const normal = canonical.getAttribute('normal');
    canonical.setAttribute('normal', new Float16BufferAttribute(new Uint16Array(normal.count * 3), 3));
    try {
      expect(
        await deriveAssemblyDetailGeometry({
          canonical,
          policy: { triangleRatio: 0.5, approximateRelativeError: 0.05 },
        }),
      ).toBeUndefined();
      expect(
        await deriveAssemblyDetailGeometry({
          canonical: small,
          policy: { triangleRatio: 0.1, approximateRelativeError: 0.05 },
        }),
      ).toBeUndefined();
      expect(small.index!.count).toBe(6);
    } finally {
      canonical.dispose();
      small.dispose();
    }
  });

  it('should discard cancelled simplification and leave canonical buffers untouched', async () => {
    const canonical = new PlaneGeometry(10, 10, 16, 16);
    const index = canonical.index!.array.map((value) => value);
    try {
      expect(
        await deriveAssemblyDetailGeometry({
          canonical,
          policy: { triangleRatio: 0.5, approximateRelativeError: 0.05 },
          isCancelled: () => true,
        }),
      ).toBeUndefined();
      expect(canonical.index!.array).toEqual(index);
    } finally {
      canonical.dispose();
    }
  });
});

describe('actual assembly detail producer oracle', () => {
  beforeEach(resetAssemblyFixture);
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mocks.graphicsActor.send.mockClear();
    mocks.frameCallback = undefined;
    delete mocks.observePreparation;
  });
  it('should capture actual committed slot draw frames and deny retired inventory without building a BVH', async () => {
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const display = await residentAssembly({ occurrenceCount: 20, spacing: 20, withEdges: true });
    const view = render(
      <GltfMesh
        assemblyDisplay={display}
        sourceFile='assembly.json'
        geometryHash={display.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    try {
      await waitFor(() => {
        expect(committedRevisions()).toEqual([1]);
      });
      const scene = scenes.at(-1)!;
      const capture = captureCommittedGltfDrawInventory(scene);
      if (!capture) {
        throw new Error('Expected actual committed producer capture');
      }
      expect(capture.display).toBe(display);
      expect(capture.key).toBe(display.root.digest);
      expect(capture.presentationRevision).toBe(1);
      expect(capture.isCurrent()).toBe(true);
      expect(capture.surfaces).toHaveLength(20);
      expect(new Set(capture.surfaces.map((surface) => surface.componentId)).size).toBe(20);
      const rows = [...capture.surfaces].sort(
        (left, right) => left.canonicalRenderBounds.min[0]! - right.canonicalRenderBounds.min[0]!,
      );
      expect(rows.at(-1)!.canonicalRenderBounds.min[0]! - rows[0]!.canonicalRenderBounds.min[0]!).toBeCloseTo(380, 8);
      expect(
        capture.edges.reduce((sum, edge) => sum + edge.segments.reduce((count, span) => count + span.count, 0), 0),
      ).toBe(20);
      expect(capture.edges.reduce((sum, edge) => sum + edge.mandatoryTriangles, 0)).toBe(120);
      for (const row of capture.surfaces) {
        const surface = surfacesOf(scene).find((object) => object.id === row.objectId);
        if (!surface) {
          throw new Error('Captured draw is absent from actual scene');
        }
        expect(row.objectUuid).toBe(surface.uuid);
        const matrix = getModelComponentWorldMatrix(surface, row.instanceId, new Matrix4());
        expect(row.drawMatrixWorld).toEqual(matrix?.toArray());
        expect(row.canonicalBvhIdentity).toBe(getCachedBvh(surface.geometry));
        expect(row.materialIds.length).toBeGreaterThan(0);
        expect(row.materialOpacities).toEqual(
          (Array.isArray(surface.material) ? surface.material : [surface.material]).map((material) => material.opacity),
        );
      }
      const canonical = surfacesOf(scene)[0]!.geometry;
      expect(getCachedBvh(canonical)).toBeUndefined();
      const explicitlyBuiltTree = getOrBuildBvh(canonical);
      const cachedCapture = captureCommittedGltfDrawInventory(scene);
      expect(cachedCapture?.surfaces.every((row) => row.canonicalBvhIdentity === explicitlyBuiltTree)).toBe(true);
      expect(getCachedBvh(canonical)).toBe(explicitlyBuiltTree);
      const replacement = await residentAssembly({ occurrenceCount: 20, spacing: 20, withEdges: true });
      view.rerender(
        <GltfMesh
          assemblyDisplay={replacement}
          sourceFile='assembly.json'
          geometryHash={replacement.root.digest}
          presentationRevision={2}
          enableMatcap={false}
        />,
      );
      await waitFor(() => {
        expect(committedRevisions()).toEqual([1, 2]);
      });
      expect(capture.isCurrent()).toBe(false);
      expect(captureCommittedGltfDrawInventory(scene)).toBeUndefined();
      const current = captureCommittedGltfDrawInventory(scenes.at(-1)!);
      expect(current?.display).toBe(replacement);
      view.unmount();
      expect(current?.isCurrent()).toBe(false);
      expect(captureCommittedGltfDrawInventory(scenes.at(-1)!)).toBeUndefined();
    } finally {
      view.unmount();
    }
  });
  it('should count actual nonindexed occurrence fat-edge quad triangles in telemetry', async () => {
    const converted = new Set<BufferGeometry>();
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scene.traverse((object) => {
        const batch = getGltfOccurrenceEdgeBatch(object);
        if (!batch) {
          return;
        }
        const { geometry } = batch.object;
        if (converted.has(geometry)) {
          return;
        }
        const { index } = geometry;
        const { position, uv } = geometry.attributes;
        if (!index || !position || !uv) {
          throw new Error('Expected actual indexed fat-edge quad attributes');
        }
        const positions = new Float32Array(index.count * 3),
          uvs = new Float32Array(index.count * 2);
        for (let lane = 0; lane < index.count; lane++) {
          const vertex = index.getX(lane);
          positions.set([position.getX(vertex), position.getY(vertex), position.getZ(vertex)], lane * 3);
          uvs.set([uv.getX(vertex), uv.getY(vertex)], lane * 2);
        }
        geometry.setAttribute('position', new BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
        geometry.setIndex(null);
        converted.add(geometry);
      });
    });
    const display = await residentAssembly({ occurrenceCount: 20, spacing: 20, withEdges: true });
    const view = render(
      <GltfMesh
        assemblyDisplay={display}
        sourceFile='assembly.json'
        geometryHash={display.root.digest}
        presentationRevision={1}
        enableMatcap={false}
      />,
    );
    try {
      await waitFor(() => {
        expect(committedRevisions()).toEqual([1]);
      });
      expect(converted.size).toBeGreaterThan(0);
      act(() => mocks.frameCallback?.());
      expect(measuredResources()?.mandatoryEdgeTriangleCount).toBe(20 * 6);
    } finally {
      view.unmount();
    }
  });

  it('should consume Graphics calibration and restore canonical surfaces when the option clears', async () => {
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const display = await residentAssembly({ occurrenceCount: 20, sourceGrid: 16, spacing: 20, withEdges: true });
    const properties = {
      assemblyDisplay: display,
      sourceFile: 'assembly.json',
      geometryHash: display.root.digest,
      enableMatcap: false,
    };
    const view = render(<GltfMesh {...properties} presentationRevision={1} />);
    try {
      await waitFor(() => {
        expect(committedRevisions()).toEqual([1]);
      });
      const canonical = surfacesOf(scenes.at(-1)!)[0]!.geometry;
      mocks.detailCalibration.value = {
        triangleRatio: 0.5,
        approximateRelativeError: 0.05,
        screenSpace: { maxApproximatePixelError: 2, enterDetailRatio: 0.6 },
      };
      view.rerender(<GltfMesh {...properties} presentationRevision={2} />);
      await waitFor(() => {
        expect(committedRevisions()).toEqual([1, 2]);
      });
      const detail = surfacesOf(scenes.at(-1)!)[0]!.geometry;
      expect(detail).not.toBe(canonical);
      expect(detail.index!.count).toBeLessThan(canonical.index!.count);
      expect(detail.getAttribute('position')).not.toBe(canonical.getAttribute('position'));
      const detailDispose = vi.spyOn(detail, 'dispose');
      const canonicalDispose = vi.spyOn(canonical, 'dispose');
      mocks.detailCalibration.value = undefined;
      view.rerender(<GltfMesh {...properties} presentationRevision={3} />);
      await waitFor(() => {
        expect(committedRevisions()).toEqual([1, 2, 3]);
      });
      expect(surfacesOf(scenes.at(-1)!).every((surface) => surface.geometry === canonical)).toBe(true);
      expect(detailDispose).toHaveBeenCalledOnce();
      expect(canonicalDispose).not.toHaveBeenCalled();
      view.unmount();
      expect(detailDispose).toHaveBeenCalledOnce();
      expect(canonicalDispose).toHaveBeenCalledOnce();
    } finally {
      mocks.detailCalibration.value = undefined;
      view.unmount();
    }
  });
  it('should promote near and selected canonical surfaces while keeping every authored edge segment and live inventory', async () => {
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const display = await residentAssembly({ occurrenceCount: 20, sourceGrid: 16, spacing: 20, withEdges: true });
    const policy = {
      triangleRatio: 0.5,
      approximateRelativeError: 0.05,
      screenSpace: { maxApproximatePixelError: 2, enterDetailRatio: 0.6 },
    };
    const properties = {
      assemblyDisplay: display,
      sourceFile: 'assembly.json',
      geometryHash: display.root.digest,
      enableMatcap: false,
      assemblyDetailPolicy: policy,
    };
    const view = render(<GltfMesh {...properties} presentationRevision={1} />);
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
    const first = surfacesOf(scenes.at(-1)!)[0]!;
    const slot = getModelComponentInstanceSlots(first)?.[0];
    if (!slot || !('geometry' in slot.sourceObject) || !(slot.sourceObject.geometry instanceof BufferGeometry)) {
      throw new Error('Expected canonical detail evidence');
    }
    const canonical = slot.sourceObject.geometry;
    const detail = first.geometry;
    expect(detail).not.toBe(canonical);
    const countEdges = (scene: Object3D): number => {
      let segments = 0;
      scene.traverse((object) => {
        for (const span of getGltfOccurrenceEdgeBatch(object)?.segments ?? []) {
          segments += span.count;
        }
      });
      return segments;
    };
    expect(countEdges(scenes.at(-1)!)).toBe(20);
    const selectedId = slot.owner.componentId;
    mocks.modelUnit = { ...mocks.modelUnit, selectedComponentIds: [selectedId] };
    view.rerender(<GltfMesh {...properties} presentationRevision={2} />);
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 2]);
    });
    expect(
      surfacesOf(scenes.at(-1)!).find((surface) =>
        getModelComponentInstanceSlots(surface)?.some((item) => item.owner.componentId === selectedId),
      )?.geometry,
    ).toBe(canonical);
    expect(countEdges(scenes.at(-1)!)).toBe(20);
    mocks.modelUnit = { ...mocks.modelUnit, selectedComponentIds: [] };
    mocks.camera!.near = 99;
    mocks.camera!.updateProjectionMatrix();
    view.rerender(<GltfMesh {...properties} presentationRevision={3} />);
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 2, 3]);
    });
    expect(surfacesOf(scenes.at(-1)!).every((surface) => surface.geometry === canonical)).toBe(true);
    expect(countEdges(scenes.at(-1)!)).toBe(20);
    act(() => mocks.frameCallback?.());
    const inventory = measuredResources();
    expect(inventory?.detailGeometryCount).toBe(1);
    expect(inventory?.detailSurfaceTriangleCount).toBe(0);
    expect(inventory?.detailCalibration?.projectionUnavailableCount).toBe(20);
    expect(inventory?.canonicalSurfaceTriangleCount).toBe((20 * canonical.index!.count) / 3);
    expect(inventory?.mandatoryEdgeTriangleCount).toBe(20 * 6);
    expect(inventory?.edgeCpuBytes).toBeGreaterThan(0);
    expect(inventory?.edgeBufferCount).toBeGreaterThan(0);
    expect(inventory?.edgePayloadBytes).toBeGreaterThan(0);
    expect(inventory!.edgePayloadBytes).toBeLessThanOrEqual(inventory!.edgeCpuBytes);
    expect(inventory?.currentAndCandidateExactBufferCpuBytes).toBeGreaterThanOrEqual(
      inventory!.exactResidentBufferCpuBytes,
    );
    expect(inventory?.unmeasuredInventory.length).toBeGreaterThan(0);
    const detailDispose = vi.spyOn(detail, 'dispose');
    const canonicalDispose = vi.spyOn(canonical, 'dispose');
    view.unmount();
    expect(detailDispose).toHaveBeenCalledOnce();
    expect(canonicalDispose).toHaveBeenCalledOnce();
  });
  it('should retain derived upload owners while canonical engineering geometry and selected full evidence stay intact', async () => {
    const scenes: Object3D[] = [];
    mocks.observePreparation = vi.fn((scene: Object3D) => {
      scenes.push(scene);
    });
    const display = await residentAssembly({ occurrenceCount: 20, sourceGrid: 16, spacing: 20 });
    const policy = { triangleRatio: 0.5, approximateRelativeError: 0.05 };
    const view = render(
      <GltfMesh
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={1}
        enableMatcap={false}
        assemblyDetailPolicy={policy}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1]);
    });
    const batches = surfacesOf(scenes.at(-1)!).filter(
      (surface): surface is InstancedMesh => surface instanceof InstancedMesh,
    );
    const first = batches[0]!;
    const slots = getModelComponentInstanceSlots(first);
    const source = slots?.[0]?.sourceObject;
    if (!source || !('geometry' in source) || !(source.geometry instanceof BufferGeometry)) {
      throw new Error('Expected actual canonical definition geometry');
    }
    const canonical = source.geometry;
    const detail = first.geometry;
    expect(detail).not.toBe(canonical);
    expect(detail.index!.count).toBeLessThan(canonical.index!.count);
    expect(detail.getAttribute('position')).not.toBe(canonical.getAttribute('position'));
    expect(detail.getAttribute('position').array).toBe(canonical.getAttribute('position').array);
    expect(batches.every((batch) => batch.geometry === detail)).toBe(true);
    const dispose = vi.spyOn(detail, 'dispose');
    const canonicalDispose = vi.spyOn(canonical, 'dispose');
    const selectedId = slots[0]!.owner.componentId;
    mocks.modelUnit = { ...mocks.modelUnit, selectedComponentIds: [selectedId] };
    view.rerender(
      <GltfMesh
        assemblyDisplay={display}
        geometryHash={display.root.digest}
        presentationRevision={2}
        enableMatcap={false}
        assemblyDetailPolicy={policy}
      />,
    );
    await waitFor(() => {
      expect(committedRevisions()).toEqual([1, 2]);
    });
    const selected = surfacesOf(scenes.at(-1)!).find((surface) =>
      getModelComponentInstanceSlots(surface)?.some((slot) => slot.owner.componentId === selectedId),
    );
    expect(selected?.geometry).toBe(canonical);
    expect(surfacesOf(scenes.at(-1)!).some((surface) => surface.geometry === detail)).toBe(true);
    expect(dispose).not.toHaveBeenCalled();
    expect(canonicalDispose).not.toHaveBeenCalled();
    view.unmount();
    expect(dispose).toHaveBeenCalledOnce();
    expect(canonicalDispose).toHaveBeenCalledOnce();
  });
});

describe('actual screen-space assembly detail policy', () => {
  it('should project approximate source deviation in perspective and orthographic camera frames without claiming a Hausdorff bound', () => {
    const bounds = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const viewport = { width: 800, height: 600 };
    const camera = new PerspectiveCamera(60, viewport.width / viewport.height, 0.1, 1000);
    camera.position.z = 10;
    const draw = new Matrix4();
    const error = estimateAssemblyDetailPixelError({
      sourceBounds: bounds,
      sourceError: 0.01,
      drawToRender: draw,
      camera,
      viewport,
    });
    expect(error).toBeGreaterThan(0);
    camera.position.z = 20;
    const far = estimateAssemblyDetailPixelError({
      sourceBounds: bounds,
      sourceError: 0.01,
      drawToRender: draw,
      camera,
      viewport,
    });
    expect(far).toBeLessThan(error);
    const ortho = new OrthographicCamera(-4, 4, 3, -3, 0.1, 1000);
    ortho.position.z = 10;
    const first = estimateAssemblyDetailPixelError({
      sourceBounds: bounds,
      sourceError: 0.01,
      drawToRender: draw,
      camera: ortho,
      viewport,
    });
    ortho.position.z = 100;
    expect(
      estimateAssemblyDetailPixelError({
        sourceBounds: bounds,
        sourceError: 0.01,
        drawToRender: draw,
        camera: ortho,
        viewport,
      }),
    ).toBe(first);
    ortho.zoom = 2;
    ortho.updateProjectionMatrix();
    expect(
      estimateAssemblyDetailPixelError({
        sourceBounds: bounds,
        sourceError: 0.01,
        drawToRender: draw,
        camera: ortho,
        viewport,
      }),
    ).toBeCloseTo(first * 2);
  });
  it('should conservatively include final affine stretch and preserve rebased large-world camera equivalence', () => {
    const sourceBounds = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const camera = new PerspectiveCamera(60, 4 / 3, 0.1, 1000);
    camera.position.z = 20;
    const viewport = { width: 800, height: 600 };
    const placement = new Matrix4().makeScale(2, 3, 1).multiply(new Matrix4().makeRotationZ(Math.PI / 4));
    const estimate = estimateAssemblyDetailPixelError({
      sourceBounds,
      sourceError: 0.01,
      drawToRender: placement,
      camera,
      viewport,
    });
    camera.updateMatrixWorld(true);
    for (const point of [new Vector3(1, 1, 1), new Vector3(-1, -1, -1)]) {
      const projected = point.clone().applyMatrix4(placement).project(camera);
      const displaced = point
        .clone()
        .add(new Vector3(0.01, 0, 0))
        .applyMatrix4(placement)
        .project(camera);
      expect(Math.hypot((displaced.x - projected.x) * 400, (displaced.y - projected.y) * 300)).toBeLessThanOrEqual(
        estimate,
      );
    }
    camera.position.x = 1_000_000_000;
    const rebased = new Matrix4().makeTranslation(1_000_000_000, 0, 0).multiply(placement);
    expect(
      estimateAssemblyDetailPixelError({ sourceBounds, sourceError: 0.01, drawToRender: rebased, camera, viewport }),
    ).toBeCloseTo(estimate, 8);
    expect(
      estimateAssemblyDetailPixelError({
        sourceBounds,
        sourceError: 0.01,
        drawToRender: rebased,
        camera,
        viewport: { width: 1600, height: 1200 },
      }),
    ).toBeCloseTo(estimate * 2);
  });
  it('should force full geometry for near-plane intersections, invalid calibration and selected evidence', () => {
    const sourceBounds = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 1;
    const error = estimateAssemblyDetailPixelError({
      sourceBounds,
      sourceError: 0,
      drawToRender: new Matrix4(),
      camera,
      viewport: { width: 800, height: 800 },
    });
    expect(error).toBe(Infinity);
    const screenSpace = { maxApproximatePixelError: 2, enterDetailRatio: 0.6 };
    expect(
      shouldUseAssemblyDetail({ approximatePixelError: error, previousDetail: true, fullEvidence: false, screenSpace }),
    ).toBe(false);
    expect(
      shouldUseAssemblyDetail({ approximatePixelError: 0, previousDetail: true, fullEvidence: true, screenSpace }),
    ).toBe(false);
    expect(() =>
      shouldUseAssemblyDetail({
        approximatePixelError: 0,
        previousDetail: false,
        fullEvidence: false,
        screenSpace: { maxApproximatePixelError: 2, enterDetailRatio: 1 },
      }),
    ).toThrow('calibration');
  });
  it.each([
    { maxApproximatePixelError: 2, errors: [1.1, 1.5, 1.99, 2.1, 1.5, 1.1] },
    { maxApproximatePixelError: 1, errors: [0.6, 0.8, 1, 1.01, 0.8, 0.6] },
  ])(
    'should retain committed detail through the hysteresis band and enter only below the calibrated entry threshold at $maxApproximatePixelError CSS px',
    ({ maxApproximatePixelError, errors }) => {
      const screenSpace = { maxApproximatePixelError, enterDetailRatio: 0.6 };
      let detail = false;
      const states = errors.map((approximatePixelError) => {
        detail = shouldUseAssemblyDetail({
          approximatePixelError,
          previousDetail: detail,
          fullEvidence: false,
          screenSpace,
        });
        return detail;
      });
      expect(states).toEqual([true, true, true, false, false, true]);
    },
  );
});
