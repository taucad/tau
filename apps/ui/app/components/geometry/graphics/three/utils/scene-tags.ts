import type { Object3D } from 'three';

/**
 * Typed registry of boolean scene-graph tags stored on `Object3D.userData`.
 *
 * Tags identify interactive viewport helpers that picking, clipping, and
 * section-topology traversal must distinguish from model geometry.
 */
export const sceneTag = {
  /** Section-view controls, contour fills, and diagnostic outlines excluded from model processing. */
  sectionViewHelper: 'isSectionViewHelper',
  /** Measurement UI meshes excluded from model raycasting. */
  measurementUi: 'isMeasurementUi',
} as const;

export type SceneTagKey = (typeof sceneTag)[keyof typeof sceneTag];

/**
 * Check whether an Object3D carries the given scene tag.
 */
export const hasSceneTag = (object: Object3D, tag: SceneTagKey): boolean => Boolean(object.userData[tag]);

/**
 * Check whether an Object3D or any ancestor carries one of the given scene tags.
 */
export const hasSceneTagInHierarchy = (object: Object3D, tags: ReadonlySet<SceneTagKey>): boolean => {
  let current: Object3D | undefined = object;
  while (current) {
    for (const tag of tags) {
      if (hasSceneTag(current, tag)) {
        return true;
      }
    }

    current = current.parent ?? undefined;
  }

  return false;
};

/**
 * Build a `userData` object for use in R3F JSX props.
 *
 * @example
 * ```typescript
 * <mesh userData={sceneTagData(sceneTag.sectionViewHelper)} />
 * ```
 */
export const sceneTagData = (tag: SceneTagKey): Record<string, boolean> => ({ [tag]: true });
