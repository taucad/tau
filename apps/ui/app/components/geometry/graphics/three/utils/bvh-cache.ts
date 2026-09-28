import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

type CachedGeometry = {
  readonly positionAttribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  readonly positionVersion: number;
  readonly bounds: THREE.Box3;
  indexAttribute: THREE.BufferAttribute | undefined;
  indexVersion: number;
  bvh: MeshBVH | undefined;
};

const geometryWeakCache = new WeakMap<THREE.BufferGeometry, CachedGeometry>();

function readPositionAttributeVersion(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
): number {
  if (!attribute) {
    return 0;
  }

  if (attribute instanceof THREE.BufferAttribute) {
    return attribute.version;
  }

  return attribute.data.version;
}

function getGeometryCache(geometry: THREE.BufferGeometry): CachedGeometry {
  const positionAttribute = geometry.getAttribute('position');
  const positionVersion = readPositionAttributeVersion(positionAttribute);
  const indexAttribute = geometry.index ?? undefined;
  const indexVersion = indexAttribute?.version ?? 0;
  let cached = geometryWeakCache.get(geometry);

  if (!cached || cached.positionAttribute !== positionAttribute || cached.positionVersion !== positionVersion) {
    // A supplied box may predate the current vertices. Refresh once per attribute revision,
    // including first use, before it can reject a ray without constructing the BVH.
    geometry.computeBoundingBox();
    cached = {
      positionAttribute,
      positionVersion,
      bounds: geometry.boundingBox!,
      indexAttribute,
      indexVersion,
      bvh: undefined,
    };
    geometryWeakCache.set(geometry, cached);
  } else if (cached.indexAttribute !== indexAttribute || cached.indexVersion !== indexVersion) {
    cached.indexAttribute = indexAttribute;
    cached.indexVersion = indexVersion;
    cached.bvh = undefined;
  }

  return cached;
}

/** Reject a local-space ray using revision-aware bounds without constructing a BVH. */
export function intersectsBvhGeometryBounds(geometry: THREE.BufferGeometry, ray: THREE.Ray): boolean {
  return ray.intersectsBox(getGeometryCache(geometry).bounds);
}

/**
 * Returns a {@link MeshBVH}, rebuilding when position/index attribute identity or version changes.
 *
 * Cached in a `WeakMap` so unreferenced geometries can be collected without a global registry.
 * {@link disposeBvhCache} exists for API symmetry with the research plan — it is a no-op because
 * `WeakMap` entries cannot be enumerated or cleared.
 */
export function getOrBuildBvh(geometry: THREE.BufferGeometry): MeshBVH {
  const cached = getGeometryCache(geometry);
  cached.bvh ??= new MeshBVH(geometry, { indirect: true });
  return cached.bvh;
}

/** No-op: `WeakMap` cache cannot be cleared. See {@link getOrBuildBvh}. */
export function disposeBvhCache(): void {
  // WeakMap entries are not enumerable — API kept for symmetry with other caches.
}
