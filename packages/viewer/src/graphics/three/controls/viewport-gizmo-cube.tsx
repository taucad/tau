import { useStore } from '@react-three/fiber';
import { useCallback, useId } from 'react';
import type { ReactNode, RefCallback } from 'react';
import type { Group } from 'three';
import { createViewportGizmoAdapter } from '#graphics/three/controls/viewport-gizmo-adapter.js';
import type { SectionPlanePicker } from '#graphics/three/controls/section-plane-picker.js';
import { useThreeGraphicsBackend } from '#graphics/three/three-graphics-backend-context.jsx';
import { useCameraConsumersRef, useCameraRig, useGraphics } from '#hooks/use-graphics.jsx';
import type { GizmoStyleId } from '#graphics/three/controls/viewport-gizmo-styles.js';

type ViewportGizmoCubeProps = {
  readonly size?: number;
  /**
   * A container element or selector to append the gizmo to.
   *
   * When provided, the gizmo will be appended to this container instead of the renderer's parent.
   */
  readonly container?: HTMLElement | string;
  /** The section plane picker the cube draws beside it while Section is on, styled as the cube is. */
  readonly planePicker?: SectionPlanePicker;
  /** The gizmo's style. Absent: the rounded cube. */
  readonly gizmoStyle?: GizmoStyleId;
};

/**
 * The view cube. Graphics runs its gesture as the `viewportGizmo` child, around the DOM adapter built here from the
 * canvas's store, the view's camera rig and the cube's placement. This mount hands graphics the adapter from its
 * group's ref, the way the section handles hand over their input, and graphics stops the gesture when the ref is
 * cleared. The theme, the accent, the web font and the up axis reach the adapter as events and repaint the cube in
 * place, so none of them rebuilds it, and no effect here sends, subscribes or times. A new style is a new cube (other
 * targets, surface and triad): the ref callback changes with it, so React hands graphics a new adapter.
 */
export function ViewportGizmoCube({
  size = 96,
  container,
  planePicker,
  gizmoStyle = 'cube',
}: ViewportGizmoCubeProps): ReactNode {
  const store = useStore();
  const graphics = useGraphics();
  const rig = useCameraRig();
  const consumersRef = useCameraConsumersRef();
  const backend = useThreeGraphicsBackend();
  const gizmoId = useId();
  const attachGizmo = useCallback<RefCallback<Group>>(
    (group) => {
      if (!group) {
        graphics.send({ type: 'viewportGizmoDetached', gizmoId });
        return;
      }
      graphics.send({
        type: 'viewportGizmoAttached',
        gizmoId,
        adapter: createViewportGizmoAdapter({
          store,
          container,
          size,
          backend,
          rig,
          consumersRef,
          graphics,
          planePicker,
          gizmoStyle,
        }),
      });
    },
    [backend, consumersRef, container, gizmoId, gizmoStyle, graphics, planePicker, rig, size, store],
  );
  return <group ref={attachGizmo} name='viewport-gizmo' />;
}
