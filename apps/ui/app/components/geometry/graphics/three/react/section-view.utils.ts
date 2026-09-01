import * as THREE from 'three';
import { LineSegments2 } from 'three/addons';
import { hasSceneTag, sceneTag } from '#components/geometry/graphics/three/utils/scene-tags.js';

function isMeshWithBufferGeometry(object: THREE.Object3D): object is THREE.Mesh {
  return object instanceof THREE.Mesh && Boolean(object.material) && Boolean(object.geometry);
}

type ClipMeshOptions = {
  readonly enable: boolean;
  readonly plane: THREE.Plane;
};

/**
 * Applies or removes clipping planes on a mesh's materials (WebGL local clipping via `renderer.localClippingEnabled`).
 *
 * Materials keep their original `side` property (typically DoubleSide from GLTF).
 */
export function applyMeshClipping(mesh: THREE.Mesh, options: ClipMeshOptions): void {
  const { enable, plane } = options;
  const materials: THREE.Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

  for (const mat of materials) {
    mat.clippingPlanes = enable ? [plane] : [];
  }
}

type CollectClippableOptions = {
  readonly enableSection: boolean;
  readonly enableLines: boolean;
  readonly enableMesh: boolean;
  readonly plane: THREE.Plane;
};

export type ClippableTargets = {
  readonly meshes: THREE.Mesh[];
  readonly lines: ReadonlyArray<THREE.LineSegments | LineSegments2>;
};

/**
 * Traverses a root group, applies WebGL-local clipping planes, and returns
 * solid meshes plus line objects for downstream `enforceMaterialClipping` (meshes only).
 *
 * Skips objects tagged {@link sceneTag.sectionViewHelper} (contour-fill helpers etc.).
 *
 * - `LineSegments` / `LineSegments2`: clipped via `enableLines`; listed in `lines`.
 * - `THREE.Mesh`: clipped via `enableMesh`; listed in `meshes`.
 * - When `enableSection` is false, clears clipping planes on all traversed materials.
 */
export function collectClippableTargets(rootGroup: THREE.Group, options: CollectClippableOptions): ClippableTargets {
  const { enableSection, enableLines, enableMesh, plane } = options;

  if (!enableSection) {
    rootGroup.traverse((child: THREE.Object3D) => {
      if (hasSceneTag(child, sceneTag.sectionViewHelper)) {
        return;
      }

      const isMeshOrLine =
        child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof LineSegments2;

      if (isMeshOrLine && child.material) {
        if (Array.isArray(child.material)) {
          for (const mat of child.material) {
            mat.clippingPlanes = [];
          }
        } else {
          child.material.clippingPlanes = [];
        }
      }
    });

    return { meshes: [], lines: [] };
  }

  const meshChildren: THREE.Mesh[] = [];
  const lineChildren: Array<THREE.LineSegments | LineSegments2> = [];

  rootGroup.traverse((child: THREE.Object3D) => {
    if (hasSceneTag(child, sceneTag.sectionViewHelper)) {
      return;
    }

    if (child instanceof THREE.LineSegments) {
      if (child.material) {
        if (Array.isArray(child.material)) {
          for (const mat of child.material) {
            mat.clippingPlanes = enableLines ? [plane] : [];
          }
        } else {
          child.material.clippingPlanes = enableLines ? [plane] : [];
        }
      }

      lineChildren.push(child);

      return;
    }

    if (child instanceof LineSegments2) {
      if (Array.isArray(child.material)) {
        for (const mat of child.material) {
          mat.clippingPlanes = enableLines ? [plane] : [];
        }
      } else {
        child.material.clippingPlanes = enableLines ? [plane] : [];
      }

      lineChildren.push(child);

      return;
    }

    if (!isMeshWithBufferGeometry(child)) {
      return;
    }

    child.matrixAutoUpdate = false;

    applyMeshClipping(child, {
      enable: enableMesh,
      plane,
    });

    meshChildren.push(child);
  });

  return { meshes: meshChildren, lines: lineChildren };
}

/**
 * Per-frame guard that ensures mesh materials retain the expected clipping planes.
 *
 * Material replacement operations (matcap toggle, GLTF reload) create new materials
 * that lack `clippingPlanes`. This function detects the mismatch and re-applies them.
 * When clipping is already correct, the reference identity check makes this a no-op.
 */
export function enforceMaterialClipping(meshes: THREE.Mesh[], plane: THREE.Plane, enableMesh: boolean): void {
  for (const mesh of meshes) {
    const materials: THREE.Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    for (const mat of materials) {
      if (enableMesh) {
        if (!mat.clippingPlanes?.length || mat.clippingPlanes[0] !== plane) {
          mat.clippingPlanes = [plane];
        }
      } else if (mat.clippingPlanes?.length) {
        mat.clippingPlanes = [];
      }
    }
  }
}
