import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GeometryComponentManifest } from '@taucad/types';
import { setModelComponentOwner } from '#graphics/three/utils/model-component-owner.js';
import * as bvhCache from '#graphics/three/utils/bvh-cache.js';
import { clearRendererSpans, rendererSpans } from '#lib/renderer-telemetry.js';
import { censusSectionSurfaceClosure } from '#graphics/three/utils/section-surface-closure.js';
import type { SectionClosureCensus } from '#graphics/three/utils/section-surface-closure.js';
import {
  buildSectionSurfaceClosureForGeometry,
  collectSectionSurfaceSources,
  getSectionSourceWorldMatrix,
  registerGltfSectionSurfaceSources,
  setGltfSectionSurfaceRegistrationState,
} from '#graphics/three/utils/section-surface-topology.js';
import type {
  SectionClosureWorkerInput,
  SectionTopologyGltfParser,
} from '#graphics/three/utils/section-surface-topology.js';

const workerMocks = vi.hoisted(() => ({
  build: undefined as ((input: SectionClosureWorkerInput) => Promise<SectionClosureCensus>) | undefined,
}));

vi.mock('#graphics/three/utils/section-surface-topology-worker-client.js', () => ({
  // oxlint-disable-next-line typescript/promise-function-async -- Without a worker the client returns undefined, not a promise.
  buildSectionClosureInWorker: (input: SectionClosureWorkerInput) => workerMocks.build?.(input),
  releaseSectionTopologyWorker: () => undefined,
}));

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

const emptyParser: SectionTopologyGltfParser = {
  json: {},
  associations: new Map(),
  getDependency: async () => undefined,
};

const register = async (scene: THREE.Group, options: { manifest?: GeometryComponentManifest; unitId?: string } = {}) =>
  registerGltfSectionSurfaceSources({
    scene,
    manifest: options.manifest ?? manifest,
    unitId: options.unitId ?? 'unit',
    parser: emptyParser,
  });

describe('section surface closure', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should update the whole root once when registering many surfaces', async () => {
    const scene = new THREE.Group();
    for (const offset of [0, 2, 4]) {
      const mesh = new THREE.Mesh(cubeGeometry(), new THREE.MeshBasicMaterial());
      mesh.position.x = offset;
      scene.add(mesh);
    }
    const update = vi.spyOn(scene, 'updateWorldMatrix');
    await register(scene);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(true, true);
  });

  it.each([1e-12, 1, 1e12])('closes an indexed box and a box of duplicated seam vertices at extent %s', (scale) => {
    expect(buildSectionSurfaceClosureForGeometry(cubeGeometry().scale(scale, scale, scale))).toMatchObject({
      status: 'closed',
      census: { indexUnbalancedEdgeCount: 0 },
    });
    // Every face of a non-indexed box has its own vertices: balanced only once the seams are welded.
    expect(
      buildSectionSurfaceClosureForGeometry(new THREE.BoxGeometry(2, 2, 2).toNonIndexed().scale(scale, scale, scale)),
    ).toMatchObject({ status: 'closed', census: { unbalancedEdgeCount: 0 } });
  });

  it('opens a surface with a hole, a flipped face or a lone triangle', () => {
    const holed = cubeGeometry();
    holed.setIndex([...holed.getIndex()!.array].slice(6));
    const flipped = cubeGeometry();
    const index = [...flipped.getIndex()!.array];
    [index[0], index[1]] = [index[1]!, index[0]!];
    flipped.setIndex(index);
    const lone = new THREE.BufferGeometry();
    lone.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));

    for (const geometry of [holed, flipped, lone]) {
      expect(buildSectionSurfaceClosureForGeometry(geometry)).toMatchObject({
        status: 'open',
        failure: { code: 'open-surface' },
      });
    }
  });

  it('closes a cube that carries a zero-area sliver with three distinct indices', () => {
    const geometry = cubeGeometry();
    const positions = [...geometry.getAttribute('position').array];
    // Vertex 8 halves the top edge from 4 to 5; the top triangle over that edge becomes two, and the sliver (4, 5, 8)
    // closes the edge against the side face, as voxel meshers emit where a surface grazes a grid vertex.
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([...positions, 0, -1, 1], 3));
    const index = [...geometry.getIndex()!.array];
    const top = index.findIndex(
      (_value, offset) => offset % 3 === 0 && index[offset] === 4 && index[offset + 1] === 5 && index[offset + 2] === 6,
    );
    index.splice(top, 3, 4, 8, 6, 8, 5, 6, 4, 5, 8);
    geometry.setIndex(index);

    expect(buildSectionSurfaceClosureForGeometry(geometry).status).toBe('closed');
  });

  it('closes two solids that touch at one vertex, where a stencil count still winds correctly', () => {
    const pinched = mergeVertices(
      mergeGeometries([cubeGeometry().deleteAttribute('normal'), cubeGeometry().translate(2, 2, 2)]),
    );

    expect(buildSectionSurfaceClosureForGeometry(pinched).status).toBe('closed');
  });

  it('should follow the visibility of only the materials its triangles use', () => {
    const geometry = cubeGeometry();
    geometry.addGroup(0, 18, 0);
    geometry.addGroup(18, 18, 1);
    const [first, second, unused] = [
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
    ];
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(geometry, [first, second, unused]));
    const visibility = () =>
      collectSectionSurfaceSources(scene).map(({ source, visibility: state }) => [source.closure.status, state]);

    expect(visibility()).toEqual([['closed', 'complete']]);
    unused.visible = false;
    expect(visibility()).toEqual([['closed', 'complete']]);
    first.visible = false;
    expect(visibility()).toEqual([['closed', 'partial']]);
    second.opacity = 0;
    expect(visibility()).toEqual([]);
  });

  it('closes every source of the reduced Racing Drone conformance fixture', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, './fixtures/racing-drone-section-repro.glb'));
    const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
    await registerGltfSectionSurfaceSources({
      scene: gltf.scene,
      manifest,
      unitId: 'racing-drone-repro',
      parser: gltf.parser as unknown as SectionTopologyGltfParser,
    });
    const sources = collectSectionSurfaceSources(gltf.scene);

    expect(sources.length).toBeGreaterThan(0);
    expect(sources.map(({ source }) => source.closure.status)).toEqual(sources.map(() => 'closed'));
  });

  it('does not treat fat-line edge overlays as section surfaces', () => {
    const root = new THREE.Group();
    root.add(new LineSegments2());

    expect(collectSectionSurfaceSources(root)).toEqual([]);
  });

  it.each(['pending', 'cancelled'] as const)(
    'stands in a pending source for each mesh of a %s glTF root, without grading it',
    (status) => {
      const scene = new THREE.Group();
      scene.add(new THREE.Mesh(cubeGeometry(), new THREE.MeshBasicMaterial()));
      setGltfSectionSurfaceRegistrationState(scene, status);
      const blocked = vi.fn();

      expect(collectSectionSurfaceSources(scene, blocked).map(({ source }) => source.closure)).toEqual([
        { status: 'pending' },
      ]);
      expect(blocked).toHaveBeenCalled();
    },
  );

  describe('off the main thread', () => {
    afterEach(() => {
      clearRendererSpans();
      workerMocks.build = undefined;
    });

    /** A closed sphere above the synchronous limit, so its census may only run in the worker. */
    const largeSphere = (): THREE.BufferGeometry => {
      const geometry = mergeVertices(
        new THREE.SphereGeometry(1, 256, 80).deleteAttribute('normal').deleteAttribute('uv'),
      );
      expect(geometry.getIndex()!.count / 3).toBeGreaterThan(bvhCache.maxSynchronousBvhTriangles);
      return geometry;
    };

    const unsupportedSpans = () =>
      rendererSpans()
        .filter(({ name }) => name === 'renderer.section-source-unsupported')
        .map(({ detail }) => detail);

    const collectLarge = async () => {
      const scene = new THREE.Group();
      scene.add(new THREE.Mesh(largeSphere(), new THREE.MeshBasicMaterial()));
      const blocked = vi.fn();
      const provisional = collectSectionSurfaceSources(scene, blocked);
      const [[ready]] = blocked.mock.calls as [[Promise<unknown>]];
      await ready;
      return { provisional, landed: collectSectionSurfaceSources(scene) };
    };

    it('caps the meshes of a model whose registration failed per loop, reported once', () => {
      const scene = new THREE.Group();
      scene.add(new THREE.Mesh(cubeGeometry(), new THREE.MeshBasicMaterial()));
      setGltfSectionSurfaceRegistrationState(scene, 'unsupported');
      for (let frame = 0; frame < 2; frame++) {
        const [visible] = collectSectionSurfaceSources(scene);
        expect(visible?.source.closure).toMatchObject({
          status: 'open',
          failure: { code: 'topology-unavailable' },
        });
      }
      expect(unsupportedSpans()).toEqual([expect.objectContaining({ code: 'topology-unavailable' })]);
    });

    it('censuses a large standalone surface in the worker, standing in as pending until it lands', async () => {
      workerMocks.build = async (input) => censusSectionSurfaceClosure(input);
      const { provisional, landed } = await collectLarge();

      expect(provisional.map(({ source }) => source.closure.status)).toEqual(['pending']);
      expect(landed.map(({ source }) => source.closure.status)).toEqual(['closed']);
    });

    it('caps a large surface per loop when its worker fails twice, without censusing it here', async () => {
      const build = vi.fn(async () => {
        throw new Error('worker crashed');
      });
      workerMocks.build = build;
      const { landed } = await collectLarge();

      // Asked once, then once more in a fresh worker.
      expect(build).toHaveBeenCalledTimes(2);
      expect(landed[0]?.source.closure).toMatchObject({
        status: 'open',
        failure: { code: 'topology-unavailable' },
      });
      expect(unsupportedSpans()).toEqual([
        expect.objectContaining({ code: 'topology-unavailable', reason: 'worker crashed' }),
      ]);
    });

    it('caps a large surface per loop without a worker rather than censusing it here', async () => {
      const { landed } = await collectLarge();

      expect(landed[0]?.source.closure).toMatchObject({ status: 'open' });
      expect(unsupportedSpans()).toEqual([expect.objectContaining({ reason: 'no topology worker' })]);
    });
  });

  it('places a registered part where a kinematic pose moved it after registration', async () => {
    const node = new THREE.Group();
    node.add(new THREE.Mesh(cubeGeometry(), new THREE.MeshBasicMaterial()));
    const scene = new THREE.Group();
    scene.add(node);
    await register(scene);

    // The pose composer moves the part's node; the scene root the source registered under stays put.
    node.matrixAutoUpdate = false;
    node.matrix.makeTranslation(3, 0, 0);
    scene.updateMatrixWorld(true);
    const [visible] = collectSectionSurfaceSources(scene);

    expect(getSectionSourceWorldMatrix(visible!.source).elements[12]).toBe(3);
  });

  it('closes face-split bodies as one logical source and reports partial visibility', async () => {
    const unitId = 'unit';
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
    const scene = new THREE.Group();
    scene.add(firstFace, createFace(18, 18, faceIds[1]));
    await register(scene, { manifest: createBodyManifest('body', faceIds), unitId });

    const visible = collectSectionSurfaceSources(scene);
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({
      visibility: 'complete',
      source: { key: 'unit:body', closure: { status: 'closed' } },
    });

    firstFace.visible = false;
    expect(collectSectionSurfaceSources(scene)[0]!.visibility).toBe('partial');
  });
});
