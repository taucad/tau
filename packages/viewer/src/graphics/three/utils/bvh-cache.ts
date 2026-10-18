import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { SerializedBVH } from 'three-mesh-bvh';
import { bvhBuildOptions, createBvhWorkerClient } from '#graphics/three/utils/bvh-worker-client.js';
import type { BvhWorkerClient, BvhWorkerOutcome } from '#graphics/three/utils/bvh-worker-client.js';
import { recordRendererSpan } from '#lib/renderer-telemetry.js';

/**
 * The largest geometry, in triangles, whose tree is built synchronously on the main thread when first needed. A
 * larger geometry's tree is built in the BVH worker on demand and is absent until it lands.
 */
export const maxSynchronousBvhTriangles = 32_000;

/** Where a geometry's tree is for its current position and index revision. */
export type BvhStatus =
  | Readonly<{ status: 'absent' }>
  | Readonly<{ status: 'building' }>
  | Readonly<{ status: 'ready' }>
  | Readonly<{ status: 'failed'; reason: string }>;

type TreeState =
  | Readonly<{ status: 'absent' }>
  | Readonly<{ status: 'building'; promise: Promise<MeshBVH | undefined> }>
  | Readonly<{ status: 'ready'; bvh: MeshBVH }>
  | Readonly<{ status: 'failed'; reason: string }>;

/** One geometry revision: the identity and version of its position and index attributes, and its tree. */
type Entry = {
  readonly position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  readonly positionVersion: number;
  readonly index: THREE.BufferAttribute | undefined;
  readonly indexVersion: number;
  state: TreeState;
};

export type BvhCache = Readonly<{
  /**
   * The geometry's tree when it is ready. A geometry of at most {@link maxSynchronousBvhTriangles} triangles is built
   * now on the main thread; a larger one is `undefined` until its worker tree lands. Never starts a worker build.
   */
  getBvh(geometry: THREE.BufferGeometry): MeshBVH | undefined;
  /**
   * The geometry's tree, building it in the worker when it is larger than the synchronous threshold. Resolves
   * `undefined` when the build failed or the cache was disposed. A build superseded by a newer revision of the
   * geometry resolves with the newer revision's tree.
   */
  ensureBvh(geometry: THREE.BufferGeometry): Promise<MeshBVH | undefined>;
  /** Where the geometry's tree is for its current revision. */
  getBvhStatus(geometry: THREE.BufferGeometry): BvhStatus;
  /** Ends every build: waiters resolve `undefined` and no geometry is marked failed. */
  dispose(): void;
}>;

export type BvhCacheOptions = Readonly<{
  /** Creates the worker client on the first build above the threshold. */
  createClient?: () => BvhWorkerClient;
  synchronousTriangleLimit?: number;
}>;

const readPositionVersion = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined): number =>
  attribute === undefined ? 0 : attribute instanceof THREE.BufferAttribute ? attribute.version : attribute.data.version;

/** The geometry's positions; `getAttribute` is typed as always present, but a geometry may have none. */
const positionOf = (
  geometry: THREE.BufferGeometry,
): THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined =>
  geometry.getAttribute('position') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;

const triangleCount = (geometry: THREE.BufferGeometry): number =>
  Math.floor(((geometry.index ?? positionOf(geometry))?.count ?? 0) / 3);

const isEntryCurrent = (entry: Entry, geometry: THREE.BufferGeometry): boolean => {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  const index = geometry.index ?? undefined;
  return (
    entry.position === position &&
    entry.positionVersion === readPositionVersion(position) &&
    entry.index === index &&
    entry.indexVersion === (index?.version ?? 0)
  );
};

/**
 * The bounds that reject a local ray before any tree is needed. A present `geometry.boundingBox` is trusted: the
 * loader sets it from the accessor's `min` and `max` and the in-place update refreshes it, so no pass over the
 * vertices runs on the main thread. A geometry without one computes it once.
 */
export const getBvhGeometryBounds = (geometry: THREE.BufferGeometry): THREE.Box3 => {
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  return geometry.boundingBox!;
};

/** Reject a local-space ray using the geometry's bounds without a tree. */
export function intersectsBvhGeometryBounds(geometry: THREE.BufferGeometry, ray: THREE.Ray): boolean {
  return ray.intersectsBox(getBvhGeometryBounds(geometry));
}

const recordBvhSpan = (
  startTime: number,
  attributes: Readonly<{
    triangles: number;
    realm: 'main' | 'worker';
    outcome: 'ready' | 'superseded' | 'failed';
    /** Milliseconds copying the geometry's bytes for the worker. */
    copyMilliseconds?: number;
    /** Milliseconds building the tree, in whichever realm built it. */
    buildMilliseconds?: number;
    /** Milliseconds rebuilding the worker's tree on the main thread. */
    deserializeMilliseconds?: number;
    reason?: string;
  }>,
): void => {
  recordRendererSpan('renderer.bvh', {
    startTime,
    duration: performance.now() - startTime,
    attributes: { mode: 'build', leafSize: bvhBuildOptions.targetLeafSize, ...attributes },
  });
};

/**
 * A per-geometry tree cache: `absent → building → ready`, or `failed` with a reason, for the current position and
 * index revision. A changed revision starts again from `absent`; a build for an older revision is discarded when it
 * lands. The cache never builds synchronously above the threshold.
 */
export const createBvhCache = ({
  createClient = () => createBvhWorkerClient(),
  synchronousTriangleLimit = maxSynchronousBvhTriangles,
}: BvhCacheOptions = {}): BvhCache => {
  const entries = new WeakMap<THREE.BufferGeometry, Entry>();
  const watched = new WeakSet<THREE.BufferGeometry>();
  const released = new WeakSet<THREE.BufferGeometry>();
  let client: BvhWorkerClient | undefined;
  let disposed = false;

  const currentEntry = (geometry: THREE.BufferGeometry): Entry => {
    const existing = entries.get(geometry);
    if (existing && isEntryCurrent(existing, geometry)) {
      return existing;
    }
    const position = geometry.getAttribute('position') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    const index = geometry.index ?? undefined;
    const entry: Entry = {
      position,
      positionVersion: readPositionVersion(position),
      index,
      indexVersion: index?.version ?? 0,
      state: { status: 'absent' },
    };
    entries.set(geometry, entry);
    return entry;
  };

  const buildNow = (geometry: THREE.BufferGeometry, entry: Entry): MeshBVH => {
    const startedAt = performance.now();
    const bvh = new MeshBVH(geometry, bvhBuildOptions);
    entry.state = { status: 'ready', bvh };
    recordBvhSpan(startedAt, {
      triangles: triangleCount(geometry),
      realm: 'main',
      outcome: 'ready',
      buildMilliseconds: performance.now() - startedAt,
    });
    return bvh;
  };

  const watch = (geometry: THREE.BufferGeometry): void => {
    released.delete(geometry);
    if (watched.has(geometry)) {
      return;
    }
    watched.add(geometry);
    geometry.addEventListener('dispose', () => {
      released.add(geometry);
      entries.delete(geometry);
      client?.release(geometry);
    });
  };

  const land = ({
    geometry,
    entry,
    startedAt,
    outcome,
  }: Readonly<{
    geometry: THREE.BufferGeometry;
    entry: Entry;
    /** Milliseconds, this realm's clock. */
    startedAt: number;
    outcome: BvhWorkerOutcome;
  }>): MeshBVH | undefined | 'superseded' => {
    const triangles = triangleCount(geometry);
    const isCurrent = entries.get(geometry) === entry && isEntryCurrent(entry, geometry);
    if (outcome.status === 'built' && isCurrent) {
      const deserializeStartedAt = performance.now();
      try {
        const serialized: SerializedBVH & { version: number } = {
          version: outcome.tree.version,
          roots: outcome.tree.roots,
          index: null,
          indirectBuffer: outcome.tree.indirectBuffer ?? null,
        };
        // Without `version`, deserialize applies its pre-0.9 root fix-up and every ray misses.
        const bvh = MeshBVH.deserialize(serialized, geometry, { setIndex: false });
        entry.state = { status: 'ready', bvh };
        recordBvhSpan(startedAt, {
          triangles,
          realm: 'worker',
          outcome: 'ready',
          copyMilliseconds: outcome.tree.copyMilliseconds,
          buildMilliseconds: outcome.tree.buildMilliseconds,
          deserializeMilliseconds: performance.now() - deserializeStartedAt,
        });
        return bvh;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        entry.state = { status: 'failed', reason };
        recordBvhSpan(startedAt, { triangles, realm: 'worker', outcome: 'failed', reason });
        return undefined;
      }
    }
    if (outcome.status === 'failed' && isCurrent) {
      entry.state = { status: 'failed', reason: outcome.reason };
      recordBvhSpan(startedAt, { triangles, realm: 'worker', outcome: 'failed', reason: outcome.reason });
      return undefined;
    }
    if (entry.state.status === 'building') {
      entry.state = { status: 'absent' };
    }
    if (outcome.status === 'disposed') {
      return undefined;
    }
    recordBvhSpan(startedAt, { triangles, realm: 'worker', outcome: 'superseded' });
    return 'superseded';
  };

  const buildInWorker = async (
    geometry: THREE.BufferGeometry,
    entry: Entry,
    workerClient: BvhWorkerClient,
  ): Promise<MeshBVH | undefined> => {
    const startedAt = performance.now();
    const outcome = await workerClient.build(
      geometry,
      () => !disposed && entries.get(geometry) === entry && isEntryCurrent(entry, geometry),
    );
    const landed = land({ geometry, entry, startedAt, outcome });
    if (landed !== 'superseded') {
      return landed;
    }
    // Latest wins: a waiter of a superseded revision receives the current revision's tree.
    return released.has(geometry) || disposed ? undefined : ensureBvh(geometry);
  };

  async function ensureBvh(geometry: THREE.BufferGeometry): Promise<MeshBVH | undefined> {
    if (disposed || !positionOf(geometry)) {
      return undefined;
    }
    const entry = currentEntry(geometry);
    switch (entry.state.status) {
      case 'ready': {
        return entry.state.bvh;
      }
      case 'failed': {
        return undefined;
      }
      case 'building': {
        return entry.state.promise;
      }
      case 'absent': {
        break;
      }
    }
    if (triangleCount(geometry) <= synchronousTriangleLimit) {
      return buildNow(geometry, entry);
    }
    watch(geometry);
    client ??= createClient();
    // The state is set before this function first awaits, so a second caller in the same turn joins this build.
    const promise = buildInWorker(geometry, entry, client);
    entry.state = { status: 'building', promise };
    return promise;
  }

  return {
    getBvh(geometry) {
      if (!positionOf(geometry)) {
        return undefined;
      }
      const entry = currentEntry(geometry);
      if (entry.state.status === 'ready') {
        return entry.state.bvh;
      }
      if (entry.state.status === 'absent' && triangleCount(geometry) <= synchronousTriangleLimit) {
        return buildNow(geometry, entry);
      }
      return undefined;
    },
    ensureBvh,
    getBvhStatus(geometry) {
      if (!positionOf(geometry)) {
        return { status: 'failed', reason: 'The geometry has no position attribute.' };
      }
      const { state } = currentEntry(geometry);
      return state.status === 'failed' ? { status: 'failed', reason: state.reason } : { status: state.status };
    },
    dispose() {
      disposed = true;
      client?.dispose();
      client = undefined;
    },
  };
};

const realmCache = createBvhCache();

/** This realm's tree for `geometry`; see {@link BvhCache.getBvh}. */
export const getBvh = (geometry: THREE.BufferGeometry): MeshBVH | undefined => realmCache.getBvh(geometry);

/** This realm's tree for `geometry`, built in the worker when needed; see {@link BvhCache.ensureBvh}. */
export const ensureBvh = async (geometry: THREE.BufferGeometry): Promise<MeshBVH | undefined> =>
  realmCache.ensureBvh(geometry);

/** Where this realm's tree for `geometry` is; see {@link BvhCache.getBvhStatus}. */
export const getBvhStatus = (geometry: THREE.BufferGeometry): BvhStatus => realmCache.getBvhStatus(geometry);
