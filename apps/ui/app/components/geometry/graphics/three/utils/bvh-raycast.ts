import * as THREE from 'three';
import { getOrBuildBvh } from '#components/geometry/graphics/three/utils/bvh-cache.js';

const inverseMatrix = new THREE.Matrix4();
const localRay = new THREE.Ray();
const worldPoint = new THREE.Vector3();

export const defaultMaxRaycastCandidateHitsPerMesh = 1024;

export type RaycastClipState = Readonly<{
  enabled: boolean;
  planes: readonly THREE.Plane[];
  clipIntersection?: boolean;
  epsilon?: number;
}>;

function isWorldVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | undefined = object;
  while (current) {
    if (!current.visible) {
      return false;
    }
    current = current.parent ?? undefined;
  }

  return true;
}

const hasActiveClipping = (clipping: RaycastClipState | undefined): clipping is RaycastClipState =>
  Boolean(clipping?.enabled && clipping.planes.length > 0);

const passesClipping = (point: THREE.Vector3, clipping: RaycastClipState): boolean => {
  const epsilon =
    clipping.epsilon ?? Math.max(1, Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)) * Number.EPSILON * 64;
  const isVisibleForPlane = (plane: THREE.Plane): boolean => plane.distanceToPoint(point) >= -epsilon;

  if (clipping.clipIntersection) {
    return clipping.planes.some(isVisibleForPlane);
  }

  return clipping.planes.every(isVisibleForPlane);
};

const toWorldHit = ({
  hit,
  mesh,
  raycaster,
}: {
  readonly hit: THREE.Intersection;
  readonly mesh: THREE.Mesh;
  readonly raycaster: THREE.Raycaster;
}): THREE.Intersection<THREE.Mesh> | undefined => {
  worldPoint.copy(hit.point).applyMatrix4(mesh.matrixWorld);
  const distance = worldPoint.distanceTo(raycaster.ray.origin);
  if (distance < raycaster.near || distance > raycaster.far) {
    return undefined;
  }

  return {
    ...hit,
    distance,
    point: worldPoint.clone(),
    object: mesh,
  };
};

export function raycastFirstVisibleMeshHit({
  raycaster,
  meshes,
  clipping,
  maxCandidateHitsPerMesh = defaultMaxRaycastCandidateHitsPerMesh,
}: {
  readonly raycaster: THREE.Raycaster;
  readonly meshes: readonly THREE.Mesh[];
  readonly clipping?: RaycastClipState;
  readonly maxCandidateHitsPerMesh?: number;
}): THREE.Intersection<THREE.Mesh> | undefined {
  let nearest: THREE.Intersection<THREE.Mesh> | undefined;
  const shouldFilterClipping = hasActiveClipping(clipping);

  for (const mesh of meshes) {
    const positionAttribute = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!isWorldVisible(mesh) || positionAttribute === undefined) {
      continue;
    }

    mesh.updateWorldMatrix(true, false);
    inverseMatrix.copy(mesh.matrixWorld).invert();
    localRay.copy(raycaster.ray).applyMatrix4(inverseMatrix);

    const bvh = getOrBuildBvh(mesh.geometry);
    const firstHit = shouldFilterClipping
      ? undefined
      : bvh.raycastFirst(localRay, mesh.material, 0, Number.POSITIVE_INFINITY);
    const hits = shouldFilterClipping
      ? bvh.raycast(localRay, mesh.material, 0, Number.POSITIVE_INFINITY).slice(0, maxCandidateHitsPerMesh)
      : firstHit
        ? [firstHit]
        : [];

    for (const hit of hits) {
      const nextNearest = toWorldHit({ hit, mesh, raycaster });
      if (!nextNearest) {
        continue;
      }

      if (shouldFilterClipping && !passesClipping(nextNearest.point, clipping)) {
        continue;
      }

      if (nearest && nextNearest.distance >= nearest.distance) {
        continue;
      }

      nearest = nextNearest;
      if (!shouldFilterClipping) {
        break;
      }
    }
  }

  return nearest;
}
