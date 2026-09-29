import React, { useEffect, useMemo, useState } from 'react';
import { selectCameraProjection } from '@taucad/camera/machine';
import { toThreeRenderPoint } from '@taucad/three/spatial';
import { createSectionPlanePicker } from '#components/geometry/graphics/three/controls/section-plane-picker.js';
import {
  resolveCameraControlProps,
  TauCameraControls,
} from '#components/geometry/graphics/three/controls/tau-camera-controls.js';
import { ViewportGizmoCube } from '#components/geometry/graphics/three/controls/viewport-gizmo-cube.js';
import { SectionPlanePickerContext } from '#components/geometry/graphics/three/controls/viewport-gizmo-render-loop.js';
import { MeasureTool } from '#components/geometry/graphics/three/react/measure-tool.js';
import { SectionHandles } from '#components/geometry/graphics/three/react/section-handles.js';
import { useCameraRig, useCameraSelector, useGraphicsSelector, useRenderFrame } from '#hooks/use-graphics.js';
import type { SecondaryMouseButtonMode } from '#components/geometry/graphics/three/three-viewer-properties.js';

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
  const cameraRig = useCameraRig();
  const renderFrame = useRenderFrame();
  const isSectionViewActive = useGraphicsSelector((state) => state.context.isSectionViewActive);
  const projectionKind = useCameraSelector((state) => selectCameraProjection(state).kind);
  // The section plane picker draws beside the view cube, from the cube's render loop, while Section is on.
  const [planePicker] = useState(createSectionPlanePicker);
  useEffect(
    () => () => {
      planePicker.dispose();
    },
    [planePicker],
  );
  /* `initialTarget` is read once, in the controls' own state initializer, which writes the live
   * camera's orientation before `ActorBridge` is mounted. It is a render-unit API, so the actor's
   * metre target is converted here rather than landing 1/metersPerRenderUnit away for two frames. */
  const initialTarget = useMemo((): [number, number, number] => {
    const point = toThreeRenderPoint({
      renderFrame,
      pointMeters: cameraRig.actorRef.getSnapshot().context.view.target,
    });
    return [point.x, point.y, point.z];
  }, [cameraRig, renderFrame]);
  const controlProps = useMemo(
    () => resolveCameraControlProps({ enablePan, enableZoom, secondaryMouseButtonMode, projectionKind, zoomSpeed }),
    [enablePan, enableZoom, projectionKind, secondaryMouseButtonMode, zoomSpeed],
  );

  return (
    <>
      <TauCameraControls makeDefault initialTarget={initialTarget} {...controlProps} />
      <MeasureTool />
      <SectionHandles planePicker={enableGizmo ? planePicker : undefined} />
      {enableGizmo ? (
        <SectionPlanePickerContext.Provider value={isSectionViewActive ? planePicker : undefined}>
          <ViewportGizmoCube container={gizmoContainer} />
        </SectionPlanePickerContext.Provider>
      ) : null}
    </>
  );
});
