import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { SerializedBVH } from 'three-mesh-bvh';
import { describe, expect, it, vi } from 'vitest';
import {
  createBvhCache,
  getBvh,
  getBvhGeometryBounds,
  intersectsBvhGeometryBounds,
  maxSynchronousBvhTriangles,
} from '#graphics/three/utils/bvh-cache.js';
import { bvhBuildOptions } from '#graphics/three/utils/bvh-worker-client.js';
import type { BvhWorkerClient, BvhWorkerOutcome } from '#graphics/three/utils/bvh-worker-client.js';

type FakeBuild = {
  readonly geometry: THREE.BufferGeometry;
  readonly isCurrent: () => boolean;
  readonly resolve: (outcome: BvhWorkerOutcome) => void;
};

/** A worker client double: each build waits until the test settles it. */
const createFakeClient = () => {
  const builds: FakeBuild[] = [];
  const release = vi.fn<(geometry: THREE.BufferGeometry) => void>();
  const dispose = vi.fn<() => void>();
  const client: BvhWorkerClient = {
    build: async (geometry, isCurrent) =>
      new Promise<BvhWorkerOutcome>((resolve) => {
        builds.push({ geometry, isCurrent, resolve });
      }),
    release,
    dispose,
  };
  return { client, builds, release, dispose };
};

/** The tree the worker would post for `geometry`, serialised as the worker serialises it. */
const builtOutcome = (geometry: THREE.BufferGeometry): BvhWorkerOutcome => {
  const serialized = MeshBVH.serialize(new MeshBVH(geometry.clone(), bvhBuildOptions), {
    cloneBuffers: true,
  }) as SerializedBVH & { version: number };
  return {
    status: 'built',
    tree: {
      version: serialized.version,
      roots: serialized.roots,
      indirectBuffer: serialized.indirectBuffer ?? undefined,
      copyMilliseconds: 0,
      buildMilliseconds: 0,
    },
  };
};

const flush = async (): Promise<void> => {
  for (let step = 0; step < 5; step++) {
    // oxlint-disable-next-line no-await-in-loop -- Each turn lets one chained promise settle.
    await Promise.resolve();
  }
};

const firstHit = (bvh: MeshBVH | undefined): number | undefined =>
  bvh?.raycastFirst(new THREE.Ray(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1)), THREE.FrontSide)?.distance;

describe('getBvh', () => {
  it('returns the same MeshBVH instance when position version is unchanged', () => {
    const geometry = new THREE.BoxGeometry();
    const first = getBvh(geometry);
    const second = getBvh(geometry);
    expect(first).toBeDefined();
    expect(second).toBe(first);
  });

  it('rebuilds when position attribute is updated (version bump)', () => {
    const geometry = new THREE.BoxGeometry();
    const first = getBvh(geometry);

    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    position.setXYZ(0, 999, 0, 0);
    position.needsUpdate = true;

    const second = getBvh(geometry);
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
  });

  it('preserves source triangle indices used by topology mappings', () => {
    const geometry = new THREE.SphereGeometry(1, 16, 8);
    const before = [...(geometry.index!.array as Uint16Array)];

    getBvh(geometry);

    expect([...(geometry.index!.array as Uint16Array)]).toEqual(before);
  });

  it('builds on the main thread only at or below the synchronous threshold', () => {
    expect(maxSynchronousBvhTriangles).toBe(32_000);
    const { client, builds } = createFakeClient();
    const cache = createBvhCache({ createClient: () => client, synchronousTriangleLimit: 12 });
    expect(cache.getBvh(new THREE.BoxGeometry())).toBeDefined();
    const large = new THREE.BoxGeometry(1, 1, 1, 2, 1, 1);
    expect(cache.getBvh(large)).toBeUndefined();
    expect(cache.getBvhStatus(large)).toEqual({ status: 'absent' });
    expect(builds).toHaveLength(0);
  });
});

describe('getBvhGeometryBounds', () => {
  it('trusts a present bounding box without a pass over the vertices', () => {
    const geometry = new THREE.BoxGeometry();
    const accessorBounds = new THREE.Box3(new THREE.Vector3(9, 9, 9), new THREE.Vector3(10, 10, 10));
    geometry.boundingBox = accessorBounds;
    const computeBounds = vi.spyOn(geometry, 'computeBoundingBox');
    const ray = new THREE.Ray(new THREE.Vector3(0, 0, 2), new THREE.Vector3(0, 0, -1));

    expect(getBvhGeometryBounds(geometry)).toBe(accessorBounds);
    expect(intersectsBvhGeometryBounds(geometry, ray)).toBe(false);
    geometry.getAttribute('position').needsUpdate = true;
    expect(intersectsBvhGeometryBounds(geometry, ray)).toBe(false);
    expect(computeBounds).not.toHaveBeenCalled();
  });

  it('computes bounds once for a geometry without them', () => {
    const geometry = new THREE.BoxGeometry();
    geometry.boundingBox = null;
    const computeBounds = vi.spyOn(geometry, 'computeBoundingBox');
    const ray = new THREE.Ray(new THREE.Vector3(10, 0, 2), new THREE.Vector3(0, 0, -1));
    expect(intersectsBvhGeometryBounds(geometry, ray)).toBe(false);
    expect(intersectsBvhGeometryBounds(geometry, ray)).toBe(false);
    expect(computeBounds).toHaveBeenCalledTimes(1);
  });

  it('computes interleaved bounds again once the owner clears them after an edit', () => {
    const geometry = new THREE.BufferGeometry();
    const data = new THREE.InterleavedBuffer(new Float32Array([9, -1, 0, 1, 11, -1, 0, 1, 10, 1, 0, 1]), 4);
    const position = new THREE.InterleavedBufferAttribute(data, 3, 0);
    geometry.setAttribute('position', position);
    const ray = new THREE.Ray(new THREE.Vector3(0, 0, 2), new THREE.Vector3(0, 0, -1));
    expect(intersectsBvhGeometryBounds(geometry, ray)).toBe(false);
    for (let index = 0; index < position.count; index++) {
      position.setX(index, position.getX(index) - 10);
    }
    data.needsUpdate = true;
    // The in-place update replaces or clears the bounds with the positions; a cleared box is computed again.
    geometry.boundingBox = null;
    expect(intersectsBvhGeometryBounds(geometry, ray)).toBe(true);
  });
});

describe('createBvhCache', () => {
  const largeGeometry = (): THREE.BufferGeometry => new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);

  it('moves absent, building, ready and deserialises the worker tree without replacing the index', async () => {
    const { client, builds } = createFakeClient();
    const createClient = vi.fn(() => client);
    const cache = createBvhCache({ createClient, synchronousTriangleLimit: 0 });
    const geometry = largeGeometry();
    const { index } = geometry;
    expect(cache.getBvhStatus(geometry)).toEqual({ status: 'absent' });
    expect(createClient).not.toHaveBeenCalled();

    const waiting = cache.ensureBvh(geometry);
    const joined = cache.ensureBvh(geometry);
    expect(cache.getBvhStatus(geometry)).toEqual({ status: 'building' });
    expect(cache.getBvh(geometry)).toBeUndefined();
    expect(builds).toHaveLength(1);
    expect(createClient).toHaveBeenCalledTimes(1);

    builds[0]!.resolve(builtOutcome(geometry));
    const bvh = await waiting;
    expect(bvh).toBeDefined();
    // A second caller during the build joined it: one worker build, one tree.
    await expect(joined).resolves.toBe(bvh);
    expect(builds).toHaveLength(1);
    expect(cache.getBvhStatus(geometry)).toEqual({ status: 'ready' });
    expect(cache.getBvh(geometry)).toBe(bvh);
    expect(geometry.index).toBe(index);
    expect(firstHit(bvh)).toBeCloseTo(4.5);
  });

  it('marks a failed build failed with its reason and never builds it on the main thread', async () => {
    const { client, builds } = createFakeClient();
    const cache = createBvhCache({ createClient: () => client, synchronousTriangleLimit: 0 });
    const geometry = largeGeometry();
    const waiting = cache.ensureBvh(geometry);
    builds[0]!.resolve({ status: 'failed', reason: 'worker crashed twice' });
    await expect(waiting).resolves.toBeUndefined();
    expect(cache.getBvhStatus(geometry)).toEqual({ status: 'failed', reason: 'worker crashed twice' });
    expect(cache.getBvh(geometry)).toBeUndefined();
    await expect(cache.ensureBvh(geometry)).resolves.toBeUndefined();
    expect(builds).toHaveLength(1);
  });

  it('discards a tree for an older revision and hands its waiters the latest one', async () => {
    const { client, builds } = createFakeClient();
    const cache = createBvhCache({ createClient: () => client, synchronousTriangleLimit: 0 });
    const geometry = largeGeometry();
    const waiting = cache.ensureBvh(geometry);
    const stale = builtOutcome(geometry);
    expect(builds[0]!.isCurrent()).toBe(true);

    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let vertex = 0; vertex < position.count; vertex++) {
      position.setZ(vertex, position.getZ(vertex) - 1);
    }
    position.needsUpdate = true;
    expect(builds[0]!.isCurrent()).toBe(false);
    expect(cache.getBvhStatus(geometry)).toEqual({ status: 'absent' });

    builds[0]!.resolve(stale);
    await flush();
    expect(builds).toHaveLength(2);
    expect(builds[1]!.isCurrent()).toBe(true);
    builds[1]!.resolve(builtOutcome(geometry));
    const bvh = await waiting;
    expect(bvh).toBe(cache.getBvh(geometry));
    expect(firstHit(bvh)).toBeCloseTo(5.5);
  });

  it('releases the geometry from the client when it is disposed', async () => {
    const { client, builds, release } = createFakeClient();
    const cache = createBvhCache({ createClient: () => client, synchronousTriangleLimit: 0 });
    const geometry = largeGeometry();
    const waiting = cache.ensureBvh(geometry);
    geometry.dispose();
    expect(release).toHaveBeenCalledWith(geometry);
    expect(builds[0]!.isCurrent()).toBe(false);
    builds[0]!.resolve({ status: 'superseded' });
    await expect(waiting).resolves.toBeUndefined();
    expect(builds).toHaveLength(1);
  });

  it('resolves waiters undefined on dispose without marking the geometry failed', async () => {
    const { client, builds, dispose } = createFakeClient();
    const cache = createBvhCache({ createClient: () => client, synchronousTriangleLimit: 0 });
    const geometry = largeGeometry();
    const waiting = cache.ensureBvh(geometry);
    cache.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    builds[0]!.resolve({ status: 'disposed' });
    await expect(waiting).resolves.toBeUndefined();
    expect(cache.getBvhStatus(geometry)).toEqual({ status: 'absent' });
    await expect(cache.ensureBvh(geometry)).resolves.toBeUndefined();
  });

  it('builds a small geometry now, on ensure as on get, without a worker', async () => {
    const createClient = vi.fn(() => createFakeClient().client);
    const cache = createBvhCache({ createClient });
    const geometry = new THREE.BoxGeometry();
    const bvh = await cache.ensureBvh(geometry);
    expect(bvh).toBe(cache.getBvh(geometry));
    expect(createClient).not.toHaveBeenCalled();
  });
});
