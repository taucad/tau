import type { Object3D } from 'three';

/**
 * Typed registry of boolean scene-graph tags stored on `Object3D.userData`.
 *
 * Each tag acts as a contract between **producers** (components that tag
 * objects) and **consumers** (screenshot capture, matcap application,
 * raycasting) without coupling them via imports.
 *
 * The underlying `userData` string keys are kept stable so existing
 * serialized scenes continue to work.
 */
export const sceneTag = {
  /** Section-view helpers (contour fills and diagnostic outlines) whose materials must not be replaced. */
  sectionViewHelper: 'isSectionViewHelper',
  /** Preview-only objects (grid, axes) hidden during screenshot capture. */
  previewOnly: 'isPreviewOnly',
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
 * Set a boolean scene tag on an Object3D.
 */
export const setSceneTag = (object: Object3D, tag: SceneTagKey, value = true): void => {
  object.userData[tag] = value;
};

/**
 * Remove a scene tag from an Object3D.
 */
export const clearSceneTag = (object: Object3D, tag: SceneTagKey): void => {
  // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- userData is an untyped record
  delete object.userData[tag];
};

/**
 * Collect all descendants (inclusive) of `root` that carry the given tag.
 */
export const findBySceneTag = (root: Object3D, tag: SceneTagKey): Object3D[] => {
  const results: Object3D[] = [];
  root.traverse((child) => {
    if (hasSceneTag(child, tag)) {
      results.push(child);
    }
  });
  return results;
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
