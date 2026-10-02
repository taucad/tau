import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

type CachedBvh = Readonly<{
  bvh: MeshBVH;
  positionVersion: number;
}>;

const bvhWeakCache = new WeakMap<THREE.BufferGeometry, CachedBvh>();

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

/**
 * Returns a {@link MeshBVH} for `geometry`, rebuilding when `position` attribute version changes.
 *
 * Cached in a `WeakMap` so disposed geometries drop out without a global registry.
 * {@link disposeBvhCache} exists for API symmetry with the research plan — it is a no-op because
 * `WeakMap` entries cannot be enumerated or cleared.
 */
export function getOrBuildBvh(geometry: THREE.BufferGeometry): MeshBVH {
  const positionAttribute = geometry.getAttribute('position') as
    | THREE.BufferAttribute
    | THREE.InterleavedBufferAttribute
    | undefined;
  const positionVersion = readPositionAttributeVersion(positionAttribute);

  const cached = bvhWeakCache.get(geometry);
  if (cached && cached.positionVersion === positionVersion) {
    return cached.bvh;
  }

  const bvh = new MeshBVH(geometry);
  bvhWeakCache.set(geometry, { bvh, positionVersion });
  return bvh;
}

/** No-op: `WeakMap` cache cannot be cleared. See {@link getOrBuildBvh}. */
export function disposeBvhCache(): void {
  // WeakMap entries are not enumerable — API kept for symmetry with other caches.
}
