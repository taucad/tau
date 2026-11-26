import type { AnnotationVec2, AnnotationView } from '@taucad/chat/annotations';
import type { CommentSurfacePick } from '@taucad/viewer/cad/comment-pins';
import { rayThroughImage } from '#components/comments/image-projection.js';
import { useViewerSurfaces } from '#components/comments/viewer-surfaces.js';

/** The surface under a point of a picture, as a pane showing its scene finds it. */
export type ImageLift = (at: AnnotationVec2) => CommentSurfacePick | undefined;

/**
 * How a picture finds the part under one of its points, while a pane shows its scene at its revision.
 *
 * @param view - The picture's view; a picture that is not of the model has none.
 * @returns The lift, or `undefined` when no pane can lift this picture now.
 */
export function useImageLift(view: AnnotationView | undefined): ImageLift | undefined {
  const surfaces = useViewerSurfaces();
  if (!surfaces || !view) {
    return undefined;
  }
  return (at) => {
    // Asked at each use: the pane may have changed what it shows since mark up opened.
    const surface = surfaces.showing(view)?.surface.current;
    return surface?.pickRay(rayThroughImage(view.camera, at));
  };
}
