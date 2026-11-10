import { useThreeGraphicsBackend } from '#graphics/three/three-graphics-backend-context.jsx';
import React, { useLayoutEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import CameraControlsImpl from 'camera-controls';
import { selectCameraProjection } from '@taucad/camera/machine';
import { createSectionPlanePicker } from '#graphics/three/controls/section-plane-picker.js';
import {
  resolveCameraControlProps,
  shouldUpdateTauCameraControlsFrame,
} from '#graphics/three/controls/tau-camera-controls.jsx';
import { useViewportGizmoInteractionLock } from '#graphics/three/controls/viewport-gizmo-interaction-lock.jsx';
import { ViewportGizmoCube } from '#graphics/three/controls/viewport-gizmo-cube.jsx';
import { SectionPlanePickerContext } from '#graphics/three/controls/viewport-gizmo-render-loop.jsx';
import type { SectionPlanePicker } from '#graphics/three/controls/section-plane-picker.js';
import { useCameraSelector, useGraphicsSelector } from '#hooks/use-graphics.jsx';
import type { SecondaryMouseButtonMode } from '#graphics/three/three-viewer-properties.js';

const MeasureTool = React.lazy(async () => {
  const module = await import('#graphics/three/react/measure-tool.jsx');
  return { default: module.MeasureTool };
});
const SectionHandles = React.lazy(async () => {
  const module = await import('#graphics/three/react/section-handles.jsx');
  return { default: module.SectionHandles };
});

type CameraControlsFeel = ReturnType<typeof resolveCameraControlProps>;

/**
 * The view's `camera-controls` instance as an R3F primitive: it applies the control feel as props and steps the
 * controls each frame. The controls adapter owns the instance, its DOM connection and its only listener (charter I9),
 * and installs it as R3F's `controls`; this renders nothing until it does.
 */
function ViewerCameraControls({ feel }: { readonly feel: CameraControlsFeel }): React.JSX.Element | null {
  const controls = useThree((state) => state.controls);
  const interactionLock = useViewportGizmoInteractionLock();
  useFrame((_state, delta) => {
    if (controls instanceof CameraControlsImpl && shouldUpdateTauCameraControlsFrame({ controls, interactionLock })) {
      controls.update(delta);
    }
  }, -1);
  return controls instanceof CameraControlsImpl ? <primitive object={controls} {...feel} /> : null;
}

type ControlsProperties = {
  /**
   * @description Whether to enable the gizmo for the viewport.
   */
  readonly enableGizmo: boolean;
  /**
   * @description Whether to enable damping for the camera.
   */
  readonly enableDamping: boolean;
  /**
   * @description Whether to enable zooming for the camera.
   */
  readonly enableZoom: boolean;
  /**
   * @description Whether to enable panning for the camera.
   */
  readonly enablePan: boolean;
  readonly secondaryMouseButtonMode?: SecondaryMouseButtonMode;
  /**
   * @description The speed of the camera zoom.
   */
  readonly zoomSpeed: number;
  /**
   * A container element or selector to append the gizmo to.
   */
  readonly gizmoContainer?: HTMLElement | string;
};

export const Controls = React.memo(function ({
  enableGizmo,
  enableZoom,
  enablePan,
  secondaryMouseButtonMode = 'camera-pan',
  zoomSpeed,
  gizmoContainer,
}: ControlsProperties) {
  const backend = useThreeGraphicsBackend();
  const isSectionViewActive = useGraphicsSelector((state) => state.context.isSectionViewActive);
  const shouldMountMeasure = useGraphicsSelector(
    (state) => state.context.isMeasureActive || state.context.measurements.some((measurement) => measurement.isPinned),
  );
  const projectionKind = useCameraSelector((state) => selectCameraProjection(state).kind);
  // The section plane picker draws beside the view cube, from the cube's render loop, while Section is on.
  const [planePicker, setPlanePicker] = useState<SectionPlanePicker>();
  useLayoutEffect(() => {
    if (!enableGizmo || !isSectionViewActive) {
      // oxlint-disable-next-line react/set-state-in-effect -- Publish the effect-owned external Three resource after disposal.
      setPlanePicker(undefined);
      return undefined;
    }
    const picker = createSectionPlanePicker(backend);
    // oxlint-disable-next-line react/set-state-in-effect -- The effect owns allocation and StrictMode-safe teardown of this external resource.
    setPlanePicker(picker);
    return () => {
      picker.dispose();
    };
  }, [backend, enableGizmo, isSectionViewActive]);
  const controlProps = useMemo(
    () =>
      resolveCameraControlProps({
        enablePan,
        enableZoom,
        secondaryMouseButtonMode,
        projectionKind,
        zoomSpeed,
      }),
    [enablePan, enableZoom, projectionKind, secondaryMouseButtonMode, zoomSpeed],
  );

  return (
    <>
      <ViewerCameraControls feel={controlProps} />
      <React.Suspense fallback={null}>
        {shouldMountMeasure ? <MeasureTool /> : null}
        {isSectionViewActive ? <SectionHandles planePicker={planePicker} /> : null}
      </React.Suspense>
      {enableGizmo ? (
        <SectionPlanePickerContext.Provider value={isSectionViewActive ? planePicker : undefined}>
          <ViewportGizmoCube container={gizmoContainer} />
        </SectionPlanePickerContext.Provider>
      ) : null}
    </>
  );
});
