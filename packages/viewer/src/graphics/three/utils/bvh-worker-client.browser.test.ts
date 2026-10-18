import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshBVH } from 'three-mesh-bvh';
import { createBvhCache } from '#graphics/three/utils/bvh-cache.js';
import { bvhBuildOptions, createBvhWorkerClient } from '#graphics/three/utils/bvh-worker-client.js';
import type { BvhWorkerPort } from '#graphics/three/utils/bvh-worker-client.js';
import { clearRendererSpans, rendererSpans } from '#lib/renderer-telemetry.js';

/**
 * The BVH worker on a real module worker, loaded through the bundler's `new Worker(new URL(…))` resolution: its tree
 * answers every ray as a main-thread tree of the same options does, a changed geometry discards the older tree, and a
 * worker that keeps failing fails the build without a main-thread build in its place.
 */

const fixture = new URL('fixtures/flanged-housing.glb', import.meta.url);
const rayCount = 4000;

const loadHousing = async (): Promise<THREE.Mesh> => {
  const response = await fetch(fixture);
  expect(response.ok).toBe(true);
  const { scene } = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
  let mesh: THREE.Mesh | undefined;
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      mesh ??= object;
    }
  });
  expect(mesh).toBeDefined();
  return mesh!;
};

/** A seeded generator, so a failure names the same rays on every run. */
const createRandom = (seed: number): (() => number) => {
  // Park and Miller's minimal standard generator.
  let state = seed;
  return () => {
    state = (state * 16_807) % 2_147_483_647;
    return (state - 1) / 2_147_483_646;
  };
};

/** Rays from a sphere around the bounds aimed at random points inside them: most hit, some graze, some miss. */
const createRays = (geometry: THREE.BufferGeometry, count: number): THREE.Ray[] => {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = bounds.getSize(new THREE.Vector3()).length();
  const random = createRandom(7);
  return Array.from({ length: count }, () => {
    const origin = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1)
      .normalize()
      .multiplyScalar(radius)
      .add(center);
    const target = new THREE.Vector3(
      THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, random()),
      THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, random()),
      THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, random()),
    );
    return new THREE.Ray(origin, target.sub(origin).normalize());
  });
};

const firstHits = (bvh: MeshBVH, rays: readonly THREE.Ray[]) =>
  rays.map((ray) => {
    const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
    return hit ? { faceIndex: hit.faceIndex, distance: hit.distance } : undefined;
  });

describe('BVH worker', () => {
  afterEach(() => {
    clearRendererSpans();
  });

  it('builds a tree that answers raycastFirst like the main-thread tree on the flanged housing', async () => {
    const mesh = await loadHousing();
    const cache = createBvhCache({ synchronousTriangleLimit: 0 });
    const { geometry } = mesh;
    const { index } = geometry;
    const indexBytes = index ? [...index.array] : undefined;
    expect(cache.getBvh(geometry)).toBeUndefined();

    const workerTree = await cache.ensureBvh(geometry);
    expect(workerTree).toBeDefined();
    expect(cache.getBvhStatus(geometry)).toEqual({ status: 'ready' });
    // The worker never touched the geometry's own buffers, and the indirect tree left the index alone.
    expect(geometry.index).toBe(index);
    expect(index ? [...index.array] : undefined).toEqual(indexBytes);

    const mainTree = new MeshBVH(geometry.clone(), bvhBuildOptions);
    const rays = createRays(geometry, rayCount);
    const fromWorker = firstHits(workerTree!, rays);
    const fromMain = firstHits(mainTree, rays);
    expect(fromWorker.filter(Boolean).length).toBeGreaterThan(rayCount / 2);
    expect(fromWorker).toEqual(fromMain);

    const span = rendererSpans().find(({ name }) => name === 'renderer.bvh');
    expect(span?.detail).toMatchObject({
      realm: 'worker',
      mode: 'build',
      outcome: 'ready',
      leafSize: 32,
      triangles: Math.floor((index?.count ?? 0) / 3),
    });
    cache.dispose();
  });

  it('discards the tree of an older revision and answers waiters with the latest one', async () => {
    const mesh = await loadHousing();
    const cache = createBvhCache({ synchronousTriangleLimit: 0 });
    const { geometry } = mesh;
    const waiting = cache.ensureBvh(geometry);
    // Edit the positions while the first build is in the worker: its tree no longer describes the geometry.
    geometry.translate(0, 0, 1);
    expect(cache.getBvhStatus(geometry)).toEqual({ status: 'absent' });

    const tree = await waiting;
    expect(tree).toBeDefined();
    expect(cache.getBvh(geometry)).toBe(tree);
    const rays = createRays(geometry, 500);
    expect(firstHits(tree!, rays)).toEqual(firstHits(new MeshBVH(geometry.clone(), bvhBuildOptions), rays));
    const outcomes = rendererSpans()
      .filter(({ name }) => name === 'renderer.bvh')
      .map(({ detail }) => detail?.['outcome']);
    expect(outcomes).toEqual(['superseded', 'ready']);
    cache.dispose();
  });

  it('retries a failing worker once, then fails the build with no main-thread build', async () => {
    const mesh = await loadHousing();
    const script = URL.createObjectURL(
      new Blob(['self.onmessage = () => { throw new Error("BVH worker fault"); };'], { type: 'text/javascript' }),
    );
    const created: Worker[] = [];
    const cache = createBvhCache({
      synchronousTriangleLimit: 0,
      createClient: () =>
        createBvhWorkerClient(() => {
          const worker = new Worker(script);
          created.push(worker);
          return worker as unknown as BvhWorkerPort;
        }),
    });
    const { geometry } = mesh;

    await expect(cache.ensureBvh(geometry)).resolves.toBeUndefined();
    URL.revokeObjectURL(script);
    expect(created).toHaveLength(2);
    const status = cache.getBvhStatus(geometry);
    expect(status.status).toBe('failed');
    expect(status.status === 'failed' && status.reason).toContain('BVH worker fault');
    expect(cache.getBvh(geometry)).toBeUndefined();
    await expect(cache.ensureBvh(geometry)).resolves.toBeUndefined();
    expect(created).toHaveLength(2);

    const spans = rendererSpans()
      .filter(({ name }) => name === 'renderer.bvh')
      .map(({ detail }) => detail);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ realm: 'worker', outcome: 'failed' });
    expect(spans.some((detail) => detail?.['realm'] === 'main')).toBe(false);
    cache.dispose();
  });
});
