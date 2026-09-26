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
 * solid meshes plus line objects for downstream `enforceMaterialClipping`.
 *
 * Skips objects tagged {@link sceneTag.sectionViewHelper} (contour-fill helpers etc.).
 *
 * - `LineSegments` / `LineSegments2`: clipped via `enableLines`; listed in `lines`.
 * - `THREE.Mesh`: clipped via `enableMesh`; listed in `meshes`.
 * - When `enableSection` is false, clears clipping planes but still returns the targets.
 */
export function collectClippableTargets(rootGroup: THREE.Group, options: CollectClippableOptions): ClippableTargets {
  const { enableSection, enableLines, enableMesh, plane } = options;

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
            mat.clippingPlanes = enableSection && enableLines ? [plane] : [];
          }
        } else {
          child.material.clippingPlanes = enableSection && enableLines ? [plane] : [];
        }
      }

      lineChildren.push(child);

      return;
    }

    if (child instanceof LineSegments2) {
      if (Array.isArray(child.material)) {
        for (const mat of child.material) {
          mat.clippingPlanes = enableSection && enableLines ? [plane] : [];
        }
      } else {
        child.material.clippingPlanes = enableSection && enableLines ? [plane] : [];
      }

      lineChildren.push(child);

      return;
    }

    if (!isMeshWithBufferGeometry(child)) {
      return;
    }

    child.matrixAutoUpdate = false;

    applyMeshClipping(child, {
      enable: enableSection && enableMesh,
      plane,
    });

    meshChildren.push(child);
  });

  return { meshes: meshChildren, lines: lineChildren };
}

/** One `[plane]` list per plane, shared by every material it clips; three only reads the list. */
const clippingPlaneLists = new WeakMap<THREE.Plane, THREE.Plane[]>();

const getClippingPlaneList = (plane: THREE.Plane): THREE.Plane[] => {
  let planes = clippingPlaneLists.get(plane);
  if (!planes) {
    planes = [plane];
    clippingPlaneLists.set(plane, planes);
  }

  return planes;
};

const enforceClipping = (material: THREE.Material, plane: THREE.Plane, enabled: boolean): void => {
  if (enabled) {
    if (material.clippingPlanes?.[0] !== plane) {
      material.clippingPlanes = getClippingPlaneList(plane);
    }
  } else if (material.clippingPlanes?.length) {
    material.clippingPlanes = [];
  }
};

/**
 * Per-frame guard that ensures mesh materials retain the expected clipping planes.
 *
 * Material replacement operations (matcap toggle, GLTF reload) create new materials
 * that lack `clippingPlanes`. This function detects the mismatch and re-applies them.
 * When clipping is already correct, the reference identity check makes this a no-op,
 * and a new plane allocates one list for all materials rather than one per material.
 */
export function enforceMaterialClipping(
  objects: ReadonlyArray<THREE.Mesh | THREE.LineSegments | LineSegments2>,
  plane: THREE.Plane,
  enabled: boolean,
): void {
  for (const object of objects) {
    if (Array.isArray(object.material)) {
      for (const material of object.material) {
        enforceClipping(material, plane, enabled);
      }
    } else {
      enforceClipping(object.material, plane, enabled);
    }
  }
}
