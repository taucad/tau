import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GeometryComponentManifest } from '@taucad/types';
import { setModelComponentOwner } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import {
  buildSectionSurfaceTopologyForGeometry,
  collectSectionSurfaceSources,
  registerGltfSectionSurfaceSources,
  sliceSectionSurfaceSource,
  sliceSectionSurfaceTopologyForGeometry,
} from '#components/geometry/graphics/three/utils/section-surface-topology.js';
import type { SectionTopologyGltfParser } from '#components/geometry/graphics/three/utils/section-surface-topology.js';

const positionAttribute = 'POSITION';
const manifoldExtension = 'EXT_mesh_manifold';

const cubeGeometry = (): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array([-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1]),
      3,
    ),
  );
  geometry.setIndex([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
  ]);
  return geometry;
};

const manifest: GeometryComponentManifest = {
  schemaVersion: 1,
  rootId: 'root',
  nodeOrder: [],
  nodesById: {},
  capabilities: {
    canHide: true,
    canIsolate: true,
    canFocus: true,
    canAdjustOpacity: true,
    hasDrawings: false,
    hasPreciseTopology: true,
    exports: [],
  },
};

const createBodyManifest = (bodyId: string, faceIds: readonly string[]): GeometryComponentManifest => ({
  ...manifest,
  rootId: bodyId,
  nodeOrder: [bodyId, ...faceIds],
  nodesById: {
    [bodyId]: {
      id: bodyId,
      name: 'Body',
      kind: 'body',
      selector: bodyId,
      childIds: [...faceIds],
      depth: 0,
      path: ['Body'],
      meshNodeIndices: [],
      primitiveIndices: [],
      materialIndices: [],
      capabilities: manifest.capabilities,
    },
    ...Object.fromEntries(
      faceIds.map((id, index) => [
        id,
        {
          id,
          name: `Face ${index + 1}`,
          kind: 'face',
          selector: id,
          parentId: bodyId,
          childIds: [],
          depth: 1,
          path: ['Body', `Face ${index + 1}`],
          meshNodeIndices: [],
          primitiveIndices: [],
          materialIndices: [],
          capabilities: manifest.capabilities,
        },
      ]),
    ),
  },
});

describe('section surface topology', () => {
  it.each([1e-12, 1e-6, 1, 1e6, 1e12])(
    'keeps canonical box topology and cuts scale-covariant at local extent %s',
    (scale) => {
      const geometry = cubeGeometry().scale(scale, scale, scale);
      const topology = buildSectionSurfaceTopologyForGeometry(geometry);
      expect(topology).toMatchObject({ status: 'ready' });
      if (topology.status === 'ready') {
        expect(topology.topology.distanceTolerance / scale).toBeCloseTo(2 * Math.sqrt(3) * 1e-6, 8);
      }

      expect(
        sliceSectionSurfaceTopologyForGeometry({
          geometry,
          worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
          meshWorldMatrix: new THREE.Matrix4(),
        }),
      ).toMatchObject({ status: 'complete', closedContours: [expect.any(Array)], trueCutComponentCount: 1 });
    },
  );

  it.each([1e-12, 1, 1e12])('clusters equivalent non-indexed seams at local extent %s', (scale) => {
    const geometry = new THREE.BoxGeometry(2, 2, 2).toNonIndexed().scale(scale, scale, scale);

    expect(buildSectionSurfaceTopologyForGeometry(geometry)).toMatchObject({
      status: 'ready',
      topology: { path: 'fallback' },
    });
  });

  it('closes exact fallback cuts deterministically and rejects open surfaces', () => {
    const closed = cubeGeometry();
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 1).normalize(), 0);
    const first = sliceSectionSurfaceTopologyForGeometry({
      geometry: closed,
      worldPlane: plane,
      meshWorldMatrix: new THREE.Matrix4(),
    });
    const second = sliceSectionSurfaceTopologyForGeometry({
      geometry: closed,
      worldPlane: plane,
      meshWorldMatrix: new THREE.Matrix4(),
    });

    expect(first.status).toBe('complete');
    expect(second).toMatchObject({
      status: first.status,
      closedContours: first.status === 'complete' ? first.closedContours : undefined,
      trueCutComponentCount: first.status === 'complete' ? first.trueCutComponentCount : undefined,
      cappedTrueCutComponentCount: first.status === 'complete' ? first.cappedTrueCutComponentCount : undefined,
      unresolvedTrueCutEdgeCount: first.status === 'complete' ? first.unresolvedTrueCutEdgeCount : undefined,
    });
    if (first.status === 'complete') {
      expect(first.trueCutComponentCount).toBe(1);
      expect(first.cappedTrueCutComponentCount).toBe(1);
      expect(first.unresolvedTrueCutEdgeCount).toBe(0);
      expect(first.closedContours).toHaveLength(1);
    }

    const open = new THREE.BufferGeometry();
    open.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    expect(buildSectionSurfaceTopologyForGeometry(open)).toMatchObject({
      status: 'unsupported',
      failure: { code: 'open-surface' },
    });
  });

  it('certifies non-indexed glTF seams without rebuilding topology per plane', () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
    const topology = buildSectionSurfaceTopologyForGeometry(geometry);
    expect(topology).toMatchObject({ status: 'ready', topology: { path: 'fallback' } });
    expect(buildSectionSurfaceTopologyForGeometry(geometry)).toBe(topology);
    const buildMilliseconds = topology.status === 'ready' ? topology.topology.buildMilliseconds : undefined;

    for (const constant of [-0.5, 0, 0.5]) {
      expect(
        sliceSectionSurfaceTopologyForGeometry({
          geometry,
          worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), constant),
          meshWorldMatrix: new THREE.Matrix4(),
        }),
      ).toMatchObject({
        status: 'complete',
        trueCutComponentCount: 1,
        cappedTrueCutComponentCount: 1,
        unresolvedTrueCutEdgeCount: 0,
      });
      const cached = buildSectionSurfaceTopologyForGeometry(geometry);
      expect(cached.status === 'ready' ? cached.topology.buildMilliseconds : undefined).toBe(buildMilliseconds);
    }
  });

  it('closes a metre-native box cut after a millimetre render-frame transform', () => {
    const geometry = new THREE.BoxGeometry(0.026, 0.02, 0.02).toNonIndexed();
    geometry.translate(0.025, 0, 0);
    const meshWorldMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(-88.5, 0, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(1000, 1000, 1000),
    );

    expect(
      sliceSectionSurfaceTopologyForGeometry({
        geometry,
        worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
        meshWorldMatrix,
      }),
    ).toMatchObject({ status: 'complete', trueCutComponentCount: 1 });
  });

  it('keeps coplanar boundary evidence separate from true-cut certification', () => {
    const result = sliceSectionSurfaceTopologyForGeometry({
      geometry: cubeGeometry(),
      worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), -1),
      meshWorldMatrix: new THREE.Matrix4(),
    });

    expect(result).toMatchObject({
      status: 'complete',
      trueCutComponentCount: 0,
      cappedTrueCutComponentCount: 0,
      unresolvedTrueCutEdgeCount: 0,
    });
    expect(result.status === 'complete' ? result.openPolylines : []).toHaveLength(4);
  });

  it('closes every admitted cut in the reduced Racing Drone conformance fixture', async () => {
    const bytes = await readFile(
      resolve(
        import.meta.dirname,
        '../../../../../../../../repos/nanoraster/tests/fixtures/racing-drone-section-repro.glb',
      ),
    );
    const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
    await registerGltfSectionSurfaceSources({
      scene: gltf.scene,
      manifest,
      unitId: 'racing-drone-repro',
      parser: gltf.parser as unknown as SectionTopologyGltfParser,
    });
    const results = collectSectionSurfaceSources(gltf.scene).map((visibleSource) =>
      sliceSectionSurfaceSource({
        visibleSource,
        worldPlane: new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
      }),
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.status === 'complete')).toBe(true);
    expect(
      results.reduce((sum, result) => sum + (result.status === 'complete' ? result.trueCutComponentCount : 0), 0),
    ).toBeGreaterThan(0);
    expect(
      results.reduce((sum, result) => sum + (result.status === 'complete' ? result.unresolvedTrueCutEdgeCount : 0), 0),
    ).toBe(0);
  });

  it('does not treat fat-line edge overlays as section surfaces', () => {
    const root = new THREE.Group();
    const edgeOverlay = new LineSegments2();
    root.add(edgeOverlay);

    expect(collectSectionSurfaceSources(root)).toEqual([]);
  });

  it('certifies face-split bodies as one logical source and rejects partial visibility', async () => {
    const unitId = 'unit';
    const bodyId = 'body';
    const faceIds = ['face-a', 'face-b'] as const;
    const source = cubeGeometry();
    const sourceIndex = source.getIndex()!;
    const createFace = (start: number, count: number, componentId: string): THREE.Mesh => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', source.getAttribute('position').clone());
      geometry.setIndex(Array.from({ length: count }, (_, offset) => sourceIndex.getX(start + offset)));
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      setModelComponentOwner(mesh, { unitId, componentId });
      return mesh;
    };
    const firstFace = createFace(0, 18, faceIds[0]);
    const secondFace = createFace(18, 18, faceIds[1]);
    const scene = new THREE.Group();
    scene.add(firstFace, secondFace);
    const bodyManifest = createBodyManifest(bodyId, faceIds);
    await registerGltfSectionSurfaceSources({
      scene,
      manifest: bodyManifest,
      unitId,
      parser: { json: {}, associations: new Map(), getDependency: async () => undefined },
    });

    const visible = collectSectionSurfaceSources(scene);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.source).toMatchObject({ key: 'unit:body', topology: { status: 'ready' } });
    expect(
      sliceSectionSurfaceSource({
        visibleSource: visible[0]!,
        worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      }),
    ).toMatchObject({ status: 'complete', trueCutComponentCount: 1, unresolvedTrueCutEdgeCount: 0 });

    firstFace.visible = false;
    const partial = collectSectionSurfaceSources(scene)[0]!;
    expect(partial.visibility).toBe('partial');
    expect(
      sliceSectionSurfaceSource({
        visibleSource: partial,
        worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      }),
    ).toMatchObject({ status: 'unsupported', failure: { code: 'partial-visibility' } });
  });

  it('uses a valid manifold extension and fails closed when a present claim is malformed', async () => {
    const createRegistered = async (
      extension: unknown,
      accessorOverrides: Readonly<Record<number, THREE.BufferAttribute>> = {},
    ) => {
      const scene = new THREE.Group();
      const geometry = cubeGeometry();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      scene.add(mesh);
      const position = geometry.getAttribute('position');
      const index = geometry.getIndex()!;
      const parser = {
        json: {
          meshes: [
            {
              primitives: [{ attributes: { [positionAttribute]: 0 }, indices: 1 }],
              extensions: { [manifoldExtension]: extension },
            },
          ],
          accessors: [
            { componentType: 5126, count: position.count, type: 'VEC3' },
            { bufferView: 0, componentType: 5123, count: index.count, type: 'SCALAR' },
            { bufferView: 1, componentType: 5123, count: accessorOverrides[2]?.count ?? index.count, type: 'SCALAR' },
            { bufferView: 2, componentType: 5123, count: accessorOverrides[3]?.count ?? 0, type: 'SCALAR' },
            { bufferView: 3, componentType: 5123, count: accessorOverrides[4]?.count ?? 0, type: 'SCALAR' },
          ],
        },
        associations: new Map([[mesh, { nodes: 0, meshes: 0, primitives: 0 }]]),
        getDependency: async (_type: 'accessor', accessorIndex: number) =>
          accessorIndex === 0 ? position : (accessorOverrides[accessorIndex] ?? index),
      } as const;
      await registerGltfSectionSurfaceSources({ scene, manifest, unitId: 'unit', parser });
      return collectSectionSurfaceSources(scene)[0]!;
    };

    const valid = await createRegistered({
      manifoldPrimitive: { attributes: { [positionAttribute]: 0 }, indices: 2 },
    });
    expect(valid.source.topology).toMatchObject({ status: 'ready', topology: { path: 'extension' } });
    expect(
      sliceSectionSurfaceSource({
        visibleSource: valid,
        worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      }),
    ).toMatchObject({ status: 'complete', unresolvedTrueCutEdgeCount: 0 });

    const malformed = await createRegistered({});
    expect(malformed.source.topology).toMatchObject({
      status: 'unsupported',
      failure: { code: 'invalid-extension' },
    });

    const invalidSourceIndex = cubeGeometry().getIndex()!;
    const outOfRange = invalidSourceIndex.clone();
    outOfRange.setX(0, 8);
    const outOfRangeRegistered = await createRegistered(
      {
        manifoldPrimitive: { attributes: { [positionAttribute]: 0 }, indices: 2 },
        mergeIndices: 3,
        mergeValues: 4,
      },
      {
        2: outOfRange,
        3: new THREE.Uint16BufferAttribute([0], 1),
        4: new THREE.Uint16BufferAttribute([8], 1),
      },
    );
    expect(outOfRangeRegistered.source.topology).toMatchObject({
      status: 'unsupported',
      failure: { code: 'invalid-extension' },
    });

    const collapsed = invalidSourceIndex.clone();
    collapsed.setX(1, collapsed.getX(0));
    const collapsedRegistered = await createRegistered(
      {
        manifoldPrimitive: { attributes: { [positionAttribute]: 0 }, indices: 2 },
        mergeIndices: 3,
        mergeValues: 4,
      },
      {
        2: collapsed,
        3: new THREE.Uint16BufferAttribute([1], 1),
        4: new THREE.Uint16BufferAttribute([collapsed.getX(0)], 1),
      },
    );
    expect(collapsedRegistered.source.topology).toMatchObject({
      status: 'unsupported',
      failure: { code: 'invalid-extension' },
    });
  });

  it('decodes sparse manifold merges across material primitives and matches fallback cuts', async () => {
    const base = cubeGeometry();
    const basePosition = base.getAttribute('position');
    const positions = new Float32Array(basePosition.count * 2 * 3);
    positions.set(basePosition.array as Float32Array);
    positions.set(basePosition.array as Float32Array, basePosition.count * 3);
    const sharedPosition = new THREE.BufferAttribute(positions, 3);
    const sourceIndices = [...base.getIndex()!.array];
    const firstIndices = sourceIndices.filter((_, offset) => Math.floor(offset / 3) % 2 === 0);
    const secondIndices = sourceIndices
      .filter((_, offset) => Math.floor(offset / 3) % 2 === 1)
      .map((index) => index + basePosition.count);
    const renderIndices = [...firstIndices, ...secondIndices];
    const manifoldIndices = [...firstIndices, ...secondIndices.map((index) => index - basePosition.count)];
    const changes = renderIndices.flatMap((before, offset) =>
      before === manifoldIndices[offset] ? [] : [[offset, manifoldIndices[offset]!] as const],
    );
    const accessors = [
      sharedPosition,
      new THREE.Uint16BufferAttribute(firstIndices, 1),
      new THREE.Uint16BufferAttribute(secondIndices, 1),
      new THREE.Uint16BufferAttribute(manifoldIndices, 1),
      new THREE.Uint8BufferAttribute(
        changes.map(([offset]) => offset),
        1,
      ),
      new THREE.Uint16BufferAttribute(
        changes.map(([, value]) => value),
        1,
      ),
    ] as const;
    const firstGeometry = new THREE.BufferGeometry();
    firstGeometry.setAttribute('position', sharedPosition);
    firstGeometry.setIndex(firstIndices);
    const secondGeometry = new THREE.BufferGeometry();
    secondGeometry.setAttribute('position', sharedPosition);
    secondGeometry.setIndex(secondIndices);
    const firstMaterial = new THREE.MeshBasicMaterial({ color: 0xff_00_00 });
    const secondMaterial = new THREE.MeshBasicMaterial({ color: 0x00_ff_00 });
    const firstMesh = new THREE.Mesh(firstGeometry, firstMaterial);
    const secondMesh = new THREE.Mesh(secondGeometry, secondMaterial);
    const scene = new THREE.Group();
    scene.add(firstMesh, secondMesh);
    const parser = {
      json: {
        meshes: [
          {
            primitives: [
              { attributes: { [positionAttribute]: 0 }, indices: 1, material: 0 },
              { attributes: { [positionAttribute]: 0 }, indices: 2, material: 1 },
            ],
            extensions: {
              [manifoldExtension]: {
                manifoldPrimitive: { attributes: { [positionAttribute]: 0 }, indices: 3 },
                mergeIndices: 4,
                mergeValues: 5,
              },
            },
          },
        ],
        accessors: [
          { componentType: 5126, count: sharedPosition.count, type: 'VEC3' },
          { bufferView: 0, componentType: 5123, count: firstIndices.length, type: 'SCALAR' },
          { bufferView: 0, componentType: 5123, count: secondIndices.length, type: 'SCALAR' },
          {
            bufferView: 0,
            componentType: 5123,
            count: manifoldIndices.length,
            type: 'SCALAR',
            sparse: { count: changes.length },
          },
          { bufferView: 1, componentType: 5121, count: changes.length, type: 'SCALAR' },
          { bufferView: 2, componentType: 5123, count: changes.length, type: 'SCALAR' },
        ],
      },
      associations: new Map([
        [firstMesh, { nodes: 0, meshes: 0, primitives: 0 }],
        [secondMesh, { nodes: 0, meshes: 0, primitives: 1 }],
      ]),
      getDependency: async (_type: 'accessor', accessorIndex: number) => accessors[accessorIndex],
    } as const;

    await registerGltfSectionSurfaceSources({ scene, manifest, unitId: 'unit', parser });
    const exactSource = collectSectionSurfaceSources(scene)[0]!;
    expect(exactSource.source.topology).toMatchObject({ status: 'ready', topology: { path: 'extension' } });
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    const exact = sliceSectionSurfaceSource({ visibleSource: exactSource, worldPlane: plane });
    const fallback = sliceSectionSurfaceTopologyForGeometry({
      geometry: base,
      worldPlane: plane,
      meshWorldMatrix: new THREE.Matrix4(),
    });
    expect(exact).toMatchObject({
      status: 'complete',
      trueCutComponentCount: 1,
      cappedTrueCutComponentCount: 1,
      unresolvedTrueCutEdgeCount: 0,
    });
    expect(exact.status === 'complete' ? exact.closedContours : undefined).toEqual(
      fallback.status === 'complete' ? fallback.closedContours : undefined,
    );
  });

  it('keeps manifold topology authoritative when a logical body contains multiple mesh identities', async () => {
    const faceIds = ['face-a', 'face-b'] as const;
    const geometries = [cubeGeometry(), cubeGeometry()];
    geometries[1]!.translate(4, 0, 0);
    const meshes = geometries.map((geometry, index) => {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      setModelComponentOwner(mesh, { unitId: 'unit', componentId: faceIds[index]! });
      return mesh;
    });
    const scene = new THREE.Group();
    scene.add(...meshes);
    const decodedAccessors = geometries.flatMap((geometry) => [
      geometry.getAttribute('position'),
      geometry.getIndex()!,
    ]);
    const parser = {
      json: {
        meshes: geometries.map((_, index) => ({
          primitives: [{ attributes: { [positionAttribute]: index * 2 }, indices: index * 2 + 1 }],
          extensions: {
            [manifoldExtension]: {
              manifoldPrimitive: { attributes: { [positionAttribute]: index * 2 }, indices: index * 2 + 1 },
            },
          },
        })),
        accessors: geometries.flatMap((geometry, index) => [
          {
            componentType: 5126,
            count: geometry.getAttribute('position').count,
            type: 'VEC3',
          },
          {
            bufferView: index,
            componentType: 5123,
            count: geometry.getIndex()!.count,
            type: 'SCALAR',
          },
        ]),
      },
      associations: new Map(
        meshes.map((mesh, index) => [mesh, { nodes: index, meshes: index, primitives: 0 }] as const),
      ),
      getDependency: async (_type: 'accessor', accessorIndex: number) => decodedAccessors[accessorIndex],
    } as const;

    await registerGltfSectionSurfaceSources({
      scene,
      manifest: createBodyManifest('body', faceIds),
      unitId: 'unit',
      parser,
    });
    const source = collectSectionSurfaceSources(scene)[0]!;
    expect(source.source.topology).toMatchObject({
      status: 'ready',
      topology: { path: 'extension', components: [{}, {}] },
    });
    expect(
      sliceSectionSurfaceSource({
        visibleSource: source,
        worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      }),
    ).toMatchObject({
      status: 'complete',
      trueCutComponentCount: 2,
      cappedTrueCutComponentCount: 2,
      unresolvedTrueCutEdgeCount: 0,
    });
  });
});
