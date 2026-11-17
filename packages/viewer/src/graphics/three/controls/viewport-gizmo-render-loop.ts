import type * as THREE from 'three';
import type { GizmoViewport } from 'three-viewport-gizmo';
import type { SectionPlanePicker, SectionPlanePickerRenderer } from '#graphics/three/controls/section-plane-picker.js';

type ViewportGizmoRenderLoopGizmoLike = {
  readonly viewport: GizmoViewport;
  render: () => void;
};

/**
 * The view cube's viewport `[x, y, width, height]` in CSS pixels, as its last `render()` measured it, in the renderer's
 * convention (`y` from the bottom on WebGL, from the top on WebGPU). None before the first draw, and the picker then
 * skips its draw.
 *
 * @param gizmo - The cube.
 * @returns The rectangle, or `undefined` while it is empty.
 */
export const readGizmoViewport = (
  gizmo: Pick<ViewportGizmoRenderLoopGizmoLike, 'viewport'>,
): readonly [number, number, number, number] | undefined => {
  const { x, y, width, height } = gizmo.viewport;
  return width > 0 && height > 0 ? [x, y, width, height] : undefined;
};

/**
 * Draws the plane picker (when given) beside the cube, then the cube. The cube restores the host's viewport, scissor
 * and depth outside its rectangle, on a render target too, and its materials are not tone mapped.
 */
export const renderViewportGizmoFrame = ({
  gizmo,
  planePicker,
}: {
  readonly gizmo: ViewportGizmoRenderLoopGizmoLike;
  /** Drawn first, beside the cube, with the view camera it turns with. */
  readonly planePicker?: Readonly<{
    picker: SectionPlanePicker;
    renderer: SectionPlanePickerRenderer;
    camera: THREE.Camera;
  }>;
}): void => {
  const cubeViewport = planePicker ? readGizmoViewport(gizmo) : undefined;
  if (planePicker && cubeViewport) {
    planePicker.picker.render({ renderer: planePicker.renderer, camera: planePicker.camera, cubeViewport });
  }
  gizmo.render();
};
