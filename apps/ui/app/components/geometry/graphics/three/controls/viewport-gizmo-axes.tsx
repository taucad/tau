/* oxlint-disable @typescript-eslint/no-unnecessary-condition -- TODO: review these types, some are actually required */
import { useThree } from '@react-three/fiber';
import type { GizmoOptions } from 'three-viewport-gizmo';
import { ViewportGizmo } from 'three-viewport-gizmo';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type * as THREE from 'three';
import { useColor } from '#hooks/use-color.js';
import { useTheme } from '#hooks/use-theme.js';
import { bindViewportGizmoControls } from '#components/geometry/graphics/three/controls/viewport-gizmo-controls-adapter.js';
import type { ViewportGizmoControlsBinding } from '#components/geometry/graphics/three/controls/viewport-gizmo-controls-adapter.js';
import { useViewportGizmoInteractionLock } from '#components/geometry/graphics/three/controls/viewport-gizmo-interaction-lock.js';
import {
  bindViewportGizmoInvalidationEvents,
  useViewportGizmoRenderLoop,
} from '#components/geometry/graphics/three/controls/viewport-gizmo-render-loop.js';
import { resolveGizmoContainer, useGizmoResizeSync } from '#components/geometry/graphics/three/utils/gizmo.utils.js';
import { useGraphics } from '#hooks/use-graphics.js';

type ViewportGizmoAxesProps = {
  readonly size?: number;
  /**
   * A container element or selector to append the gizmo to.
   *
   * When provided, the gizmo will be appended to this container instead of the renderer's parent.
   */
  readonly container?: HTMLElement | string;
  /**
   * Optional dependencies array that will be appended to the effect dependencies.
   * When any of these values change, the gizmo will be disposed and recreated.
   */
  readonly dependencies?: readonly unknown[];
};

const className = 'viewport-gizmo-axes';
const emptyDependencies: readonly unknown[] = [];

export function ViewportGizmoAxes({
  size = 96,
  container,
  dependencies = emptyDependencies,
}: ViewportGizmoAxesProps): ReactNode {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const gl = useThree((state) => state.gl);
  const controls = useThree((state) => state.controls);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const interactionLock = useViewportGizmoInteractionLock();
  const graphicsActor = useGraphics();

  const { serialized } = useColor();
  const { theme } = useTheme();

  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref
  const gizmoRef = useRef<ViewportGizmo | undefined>(undefined);
  const controlsBindingRef = useRef<ViewportGizmoControlsBinding | undefined>(undefined);

  useViewportGizmoRenderLoop({ gizmoRef, renderer: gl, controlsBindingRef, invalidate });

  useGizmoResizeSync(gizmoRef);

  useEffect(() => {
    if (!camera || !gl || !controls) {
      return;
    }

    const containerToUse = resolveGizmoContainer(container, gl.domElement);
    if (!containerToUse) {
      return;
    }

    const gizmoConfig: GizmoOptions = {
      type: 'sphere',
      placement: 'bottom-right',
      size,
      resolution: 256,
      className,
      container: containerToUse,
      font: {
        weight: 'normal',
        family: 'monospace',
      },
      offset: {
        bottom: 0,
        right: 0,
      },
    };

    const gizmo = new ViewportGizmo(camera, gl, gizmoConfig);
    gizmoRef.current = gizmo;

    const removeInvalidationListeners = bindViewportGizmoInvalidationEvents({ gizmo, invalidate });

    gizmo.scale.multiplyScalar(0.7);

    const controlsBinding = bindViewportGizmoControls({
      camera,
      controls,
      gizmo,
      interactionLock,
      modelPointerInteraction: {
        onStart: () => {
          graphicsActor.send({
            type: 'beginViewerModelHoverSuppression',
            reason: 'viewportGizmo',
            source: 'viewer',
          });
        },
        onMove: () => {
          graphicsActor.send({ type: 'markModelPointerGestureMoved' });
        },
        onEnd: () => {
          graphicsActor.send({
            type: 'endViewerModelHoverSuppression',
            reason: 'viewportGizmo',
            source: 'viewer',
          });
        },
      },
    });
    if (!controlsBinding) {
      gizmoRef.current = undefined;
      removeInvalidationListeners();
      gizmo.dispose();
      return;
    }
    controlsBindingRef.current = controlsBinding;

    invalidate();

    return () => {
      const existing = gizmoRef.current;
      gizmoRef.current = undefined;
      controlsBindingRef.current = undefined;

      if (existing) {
        controlsBinding.detach();
        removeInvalidationListeners();
        existing.dispose();
      }
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- dependencies array is user-provided for custom recreation triggers
  }, [
    camera,
    gl,
    controls,
    scene,
    serialized.hex,
    theme,
    size,
    container,
    invalidate,
    interactionLock,
    graphicsActor,
    ...dependencies,
  ]);

  return null;
}
