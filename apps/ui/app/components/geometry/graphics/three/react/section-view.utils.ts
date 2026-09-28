import * as THREE from 'three';
import type { LineSegments2 } from 'three/addons';
import { installSectionClip } from '#components/geometry/graphics/three/materials/section-clip.js';
import type { SectionClip } from '#components/geometry/graphics/three/materials/section-clip.js';
import { hasSceneTag, sceneTag } from '#components/geometry/graphics/three/utils/scene-tags.js';

export type ClippableTargets = {
  readonly meshes: THREE.Mesh[];
  readonly lines: ReadonlyArray<THREE.Line | LineSegments2>;
  readonly points: readonly THREE.Points[];
};

// Both backends' fat lines extend `Mesh`; the type names them.
const isLineTarget = (object: THREE.Object3D): object is THREE.Line | LineSegments2 =>
  object instanceof THREE.Line || object.type === 'LineSegments2';

const isMesh = (object: THREE.Object3D): object is THREE.Mesh => object instanceof THREE.Mesh;

const isPoints = (object: THREE.Object3D): object is THREE.Points => object instanceof THREE.Points;

/**
 * The surfaces, lines and points under `rootGroup` that the section clip cuts, skipping objects tagged
 * {@link sceneTag.sectionViewHelper} (contour fills and other section chrome).
 *
 * - `Line` and its subclasses, and `LineSegments2` (either backend), are listed in `lines`; `Points` in `points`.
 * - Every other `Mesh` is listed in `meshes`, and stops recomposing its matrix each frame: model parts do not move.
 */
export function collectClippableTargets(rootGroup: THREE.Object3D): ClippableTargets {
  const meshes: THREE.Mesh[] = [];
  const lines: Array<THREE.Line | LineSegments2> = [];
  const points: THREE.Points[] = [];

  rootGroup.traverse((child: THREE.Object3D) => {
    if (hasSceneTag(child, sceneTag.sectionViewHelper) || !(child as Partial<THREE.Mesh>).material) {
      return;
    }
    if (isLineTarget(child)) {
      lines.push(child);
    } else if (isPoints(child)) {
      points.push(child);
    } else if (isMesh(child)) {
      child.matrixAutoUpdate = false;
      meshes.push(child);
    }
  });

  return { meshes, lines, points };
}

/** Compiles `clip` into the materials of every target {@link collectClippableTargets} finds under `root`. */
export function installSectionClipUnder(root: THREE.Object3D, clip: SectionClip): void {
  const { meshes, lines, points } = collectClippableTargets(root);
  for (const object of [...meshes, ...lines, ...points]) {
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      installSectionClip(material, clip);
    }
  }
}
