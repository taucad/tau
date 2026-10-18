import { getGltfOccurrenceLayers } from '#graphics/three/utils/gltf-surface-batches.js';
import * as THREE from 'three';
import { isSectionRemoved } from '#graphics/section-cuts.js';
import type { SectionPiece } from '#graphics/section-cuts.js';
import { ensureBvh, getBvh, getBvhGeometryBounds, getBvhStatus } from '#graphics/three/utils/bvh-cache.js';

const inverseMatrix = new THREE.Matrix4();
const localRay = new THREE.Ray();
const worldPoint = new THREE.Vector3();
const entryPoint = new THREE.Vector3();

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

/** Settles once every wait has, however each ends. */
const settleAll = async (waits: ReadonlyArray<Promise<unknown>>): Promise<void> => {
  await Promise.allSettled(waits);
};

/**
 * A model pick: the nearest visible, unclipped hit, or none. `pending` means a mesh whose tree is still building in the
 * worker lies nearer along the ray than any answered hit, so the answer is not known yet: a consumer treats it as "not
 * yet", never as a miss. `whenReady` settles when those trees land or fail, for the consumer to ask again.
 */
export type MeshPick = Readonly<{
  hit: THREE.Intersection<THREE.Mesh> | undefined;
  pending: boolean;
  whenReady: Promise<void> | undefined;
}>;

/**
 * Raycasts the meshes for the nearest visible hit that clipping keeps, through each geometry's tree. A geometry
 * under the synchronous threshold is built on first use; a larger one is requested from the BVH worker and makes the
 * pick pending only when the ray enters its bounds before the nearest answered hit, so a farther mesh never wins in its
 * place. A geometry whose build failed is skipped.
 */
export function raycastFirstVisibleMeshHit({
  raycaster,
  meshes,
  clipping,
}: {
  readonly raycaster: THREE.Raycaster;
  readonly meshes: readonly THREE.Mesh[];
  readonly clipping?: RaycastClipState;
}): MeshPick {
  let nearest: THREE.Intersection<THREE.Mesh> | undefined;
  let pendingDistance = Number.POSITIVE_INFINITY;
  const waits: Array<Promise<unknown>> = [];
  const isKept = createRaycastClipTest(clipping);

  for (const mesh of meshes) {
    const positionAttribute = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (
      !isWorldVisible(mesh) ||
      !raycaster.layers.test(getGltfOccurrenceLayers(mesh)) ||
      positionAttribute === undefined
    ) {
      continue;
    }

    mesh.updateWorldMatrix(true, false);
    inverseMatrix.copy(mesh.matrixWorld).invert();
    localRay.copy(raycaster.ray).applyMatrix4(inverseMatrix);

    if (!localRay.intersectBox(getBvhGeometryBounds(mesh.geometry), entryPoint)) {
      continue;
    }

    const bvh = getBvh(mesh.geometry);
    if (!bvh) {
      if (getBvhStatus(mesh.geometry).status !== 'failed') {
        waits.push(ensureBvh(mesh.geometry));
        const entryDistance = entryPoint.applyMatrix4(mesh.matrixWorld).distanceTo(raycaster.ray.origin);
        if (entryDistance <= raycaster.far) {
          pendingDistance = Math.min(pendingDistance, entryDistance);
        }
      }
      continue;
    }

    const firstHit = isKept ? undefined : bvh.raycastFirst(localRay, mesh.material, 0, Number.POSITIVE_INFINITY);
    const hits = isKept
      ? bvh.raycast(localRay, mesh.material, 0, Number.POSITIVE_INFINITY)
      : firstHit
        ? [firstHit]
        : [];

    for (const hit of hits) {
      const nextNearest = toWorldHit({ hit, mesh, raycaster });
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

  const pending = pendingDistance < (nearest?.distance ?? Number.POSITIVE_INFINITY);
  return {
    hit: pending ? undefined : nearest,
    pending,
    whenReady: pending ? settleAll(waits) : undefined,
  };
}
