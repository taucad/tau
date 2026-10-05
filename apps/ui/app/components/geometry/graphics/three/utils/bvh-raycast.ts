import { getGltfOccurrenceLayers } from '#components/geometry/graphics/three/utils/gltf-surface-batches.js';
import * as THREE from 'three';
import { isSectionRemoved } from '#components/geometry/graphics/section-cuts.js';
import type { SectionPiece } from '#components/geometry/graphics/section-cuts.js';
import { getOrBuildBvh, intersectsBvhGeometryBounds } from '#components/geometry/graphics/three/utils/bvh-cache.js';

import {
  getModelComponentInstanceSlots,
  getModelComponentWorldMatrix,
  getModelComponentSourceGeometry,
} from '#components/geometry/graphics/three/utils/model-component-owner.js';

const inverseMatrix = new THREE.Matrix4();
const localRay = new THREE.Ray();
const worldPoint = new THREE.Vector3();

/** The section a raycast respects: the union of `pieces`, in the render frame, is removed. */
export type RaycastClipState = Readonly<{
  enabled: boolean;
  pieces: readonly SectionPiece[];
}>;

/**
 * Whether the section leaves a point, built once per raycast for its hits and snaps; `undefined` when nothing is
 * clipped.
 *
 * A point up to a few ulps of its coordinates past a cut face is left, so a hit on the face is kept, as the clip draws
 * it. Each piece is tested by its cut faces alone: the two halves of a cutaway wider than 180° share a plane that is no
 * face, and without it each half becomes its face's half-space. The halves then overlap, the removed union is the
 * same, and the tolerance leaves no kept band inside the cutaway.
 */
export const createRaycastClipTest = (
  clipping: RaycastClipState | undefined,
): ((point: THREE.Vector3) => boolean) | undefined => {
  if (!clipping?.enabled || clipping.pieces.length === 0) {
    return undefined;
  }
  const pieces = clipping.pieces.map((piece) => ({ ...piece, halfSpaces: piece.faces.map(({ plane }) => plane) }));
  return (point) =>
    !isSectionRemoved(
      [point.x, point.y, point.z],
      pieces,
      Math.max(1, Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)) * Number.EPSILON * 64,
    );
};

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

const toWorldHit = ({
  hit,
  mesh,
  raycaster,
  worldMatrix,
  instanceId,
}: {
  readonly hit: THREE.Intersection;
  readonly mesh: THREE.Mesh;
  readonly raycaster: THREE.Raycaster;
  readonly worldMatrix: THREE.Matrix4;
  readonly instanceId?: number;
}): THREE.Intersection<THREE.Mesh> | undefined => {
  worldPoint.copy(hit.point).applyMatrix4(worldMatrix);
  const distance = worldPoint.distanceTo(raycaster.ray.origin);
  if (distance < raycaster.near || distance > raycaster.far) {
    return undefined;
  }

  return {
    ...hit,
    distance,
    point: worldPoint.clone(),
    object: mesh,
    instanceId,
  };
};

export function raycastFirstVisibleMeshHit({
  raycaster,
  meshes,
  clipping,
}: {
  readonly raycaster: THREE.Raycaster;
  readonly meshes: readonly THREE.Mesh[];
  readonly clipping?: RaycastClipState;
}): THREE.Intersection<THREE.Mesh> | undefined {
  let nearest: THREE.Intersection<THREE.Mesh> | undefined;
  const isKept = createRaycastClipTest(clipping);

  for (const mesh of meshes) {
    const { material } = mesh;
    const positionAttribute = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (
      !isWorldVisible(mesh) ||
      !raycaster.layers.test(getGltfOccurrenceLayers(mesh)) ||
      positionAttribute === undefined
    ) {
      continue;
    }

    mesh.updateWorldMatrix(true, false);
    const slots = getModelComponentInstanceSlots(mesh);
    if (mesh instanceof THREE.InstancedMesh && !slots) {
      continue;
    }
    const placement = new THREE.Matrix4();
    for (let slot = 0; slot < (slots?.length ?? 1); slot++) {
      const instanceId = slots ? slot : undefined;
      const worldMatrix = getModelComponentWorldMatrix(mesh, instanceId, placement);
      const geometry = getModelComponentSourceGeometry(mesh, instanceId);
      if (!worldMatrix || !geometry) {
        continue;
      }
      inverseMatrix.copy(worldMatrix).invert();
      localRay.copy(raycaster.ray).applyMatrix4(inverseMatrix);

      if (!intersectsBvhGeometryBounds(geometry, localRay)) {
        continue;
      }

      const bvh = getOrBuildBvh(geometry);
      const firstHit = isKept ? undefined : bvh.raycastFirst(localRay, material, 0, Number.POSITIVE_INFINITY);
      const hits = isKept ? bvh.raycast(localRay, material, 0, Number.POSITIVE_INFINITY) : firstHit ? [firstHit] : [];

      for (const hit of hits) {
        const nextNearest = toWorldHit({ hit, mesh, raycaster, worldMatrix, instanceId });
        if (!nextNearest) {
          continue;
        }

        if (isKept && !isKept(nextNearest.point)) {
          continue;
        }

        if (nearest && nextNearest.distance >= nearest.distance) {
          continue;
        }

        nearest = nextNearest;
        if (!isKept) {
          break;
        }
      }
    }
  }

  return nearest;
}
