import type { Object3D } from 'three';

/**
 * Typed registry of boolean scene-graph tags stored on `Object3D.userData`.
 *
 * Tags identify interactive viewport helpers that picking, clipping, and
 * section-topology traversal must distinguish from model geometry.
 * @public
 */
export const sceneTag = {
  /** Section-view controls, contour fills, and diagnostic outlines excluded from model processing. */
  sectionViewHelper: 'isSectionViewHelper',
  /** Batched draw objects excluded from canonical model processing and interaction. */
  gltfSurfacePresentation: 'isGltfSurfacePresentation',
  /** Measurement UI meshes excluded from model raycasting. */
  measurementUi: 'isMeasurementUi',
} as const;

/**
 * A `userData` key from {@link sceneTag}.
 *
 * @public
 */
export type SceneTagKey = (typeof sceneTag)[keyof typeof sceneTag];

/**
 * Check whether an Object3D carries the given scene tag.
 * @public
 */
export const hasSceneTag = (object: Object3D, tag: SceneTagKey): boolean => Boolean(object.userData[tag]);

/**
 * Check whether an Object3D or any ancestor carries one of the given scene tags.
 * @public
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
 * @public
 * @example <caption>Tag a mesh as a section view helper</caption>
 * ```tsx
 * import { sceneTag, sceneTagData } from '@taucad/viewer/graphics/three/utils/scene-tags';
 *
 * export const Helper = (): React.JSX.Element => <mesh userData={sceneTagData(sceneTag.sectionViewHelper)} />;
 * ```
 */
export const sceneTagData = (tag: SceneTagKey): Record<string, boolean> => ({ [tag]: true });
