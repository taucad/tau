import React, { useMemo } from 'react';
import * as THREE from 'three';
import { selectCameraProjection } from '@taucad/camera/machine';
import { fromThreeRenderPoint, toThreeRenderPoint } from '@taucad/three/spatial';
import {
  resolveCameraControlProps,
  TauCameraControls,
} from '#components/geometry/graphics/three/controls/tau-camera-controls.js';
import { ViewportGizmoCube } from '#components/geometry/graphics/three/controls/viewport-gizmo-cube.js';
import { SectionViewControls } from '#components/geometry/graphics/three/react/section-view-controls.js';
import { MeasureTool } from '#components/geometry/graphics/three/react/measure-tool.js';
import {
  useCameraRig,
  useCameraSelector,
  useGraphics,
  useGraphicsSelector,
  useRenderFrame,
} from '#hooks/use-graphics.js';
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
  const graphicsActor = useGraphics();
  const cameraRig = useCameraRig();
  const renderFrame = useRenderFrame();
  const isActive = useGraphicsSelector((state) => state.context.isSectionViewActive);
  const selectedPlaneId = useGraphicsSelector((state) => state.context.selectedSectionViewId);
  const rotation = useGraphicsSelector((state) => state.context.sectionViewRotation);
  const pivot = useGraphicsSelector((state) => state.context.sectionViewPivot);
  const availablePlanes = useGraphicsSelector((state) => state.context.availableSectionViews);
  const planeName = useGraphicsSelector((state) => state.context.planeName);
  const hoveredSectionViewId = useGraphicsSelector((state) => state.context.hoveredSectionViewId);
  const upDirection = useGraphicsSelector((state) => state.context.upDirection);
  const projectionKind = useCameraSelector((state) => selectCameraProjection(state).kind);
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
  const renderPivot = useMemo((): [number, number, number] => {
    const point = toThreeRenderPoint({ renderFrame, pointMeters: pivot });
    return [point.x, point.y, point.z];
  }, [pivot, renderFrame]);
  const controlProps = useMemo(
    () => resolveCameraControlProps({ enablePan, enableZoom, secondaryMouseButtonMode, projectionKind, zoomSpeed }),
    [enablePan, enableZoom, projectionKind, secondaryMouseButtonMode, zoomSpeed],
  );

  // Handlers to send events to xstate
  const handleSelectPlane = (planeId: 'xy' | 'xz' | 'yz' | 'yx' | 'zx' | 'zy'): void => {
    const id = planeId.toLowerCase() as 'xy' | 'xz' | 'yz' | 'yx' | 'zx' | 'zy';
    const isInverse = id === 'yx' || id === 'zx' || id === 'zy';
    const base: 'xy' | 'xz' | 'yz' = ((): 'xy' | 'xz' | 'yz' => {
      if (id === 'xy' || id === 'yx') {
        return 'xy';
      }

      if (id === 'xz' || id === 'zx') {
        return 'xz';
      }

      return 'yz';
    })();
    // oxlint-disable-next-line unicorn-js/prevent-abbreviations -- dir refers to direction vector, not directory
    const newDir: 1 | -1 = isInverse ? -1 : 1;
    graphicsActor.send({ type: 'selectSectionView', payload: base });
    graphicsActor.send({ type: 'setSectionViewDirection', payload: newDir });
  };

  const handleSetRotation = (eulerRotation: THREE.Euler): void => {
    graphicsActor.send({
      type: 'setSectionViewRotation',
      payload: [eulerRotation.x, eulerRotation.y, eulerRotation.z],
    });
  };

  const handleSetRenderPivot = (value: [number, number, number]): void => {
    const pointMeters = fromThreeRenderPoint({ renderFrame, point: new THREE.Vector3(...value) });
    graphicsActor.send({ type: 'setSectionViewPivot', payload: [...pointMeters] });
  };

  const handleHover = (planeId: 'xy' | 'xz' | 'yz' | 'yx' | 'zx' | 'zy' | undefined): void => {
    graphicsActor.send({ type: 'setHoveredSectionView', payload: planeId });
  };

  const handleSectionTransformDragStart = (): void => {
    graphicsActor.send({
      type: 'beginViewerModelHoverSuppression',
      reason: 'sectionViewTransform',
      source: 'viewer',
    });
  };

  const handleSectionTransformDragMove = (): void => {
    graphicsActor.send({ type: 'markModelPointerGestureMoved' });
  };

  const handleSectionTransformDragEnd = (): void => {
    graphicsActor.send({
      type: 'endViewerModelHoverSuppression',
      reason: 'sectionViewTransform',
      source: 'viewer',
    });
  };

  return (
    <>
      <TauCameraControls makeDefault initialTarget={initialTarget} {...controlProps} />
      <MeasureTool />
      <SectionViewControls
        isActive={isActive}
        selectedPlaneId={selectedPlaneId}
        availablePlanes={availablePlanes}
        rotation={rotation}
        renderPivot={renderPivot}
        planeName={planeName}
        hoveredSectionViewId={hoveredSectionViewId}
        upDirection={upDirection}
        onSelectPlane={handleSelectPlane}
        onHover={handleHover}
        onSetRotation={handleSetRotation}
        onSetRenderPivot={handleSetRenderPivot}
        onTransformDragStart={handleSectionTransformDragStart}
        onTransformDragMove={handleSectionTransformDragMove}
        onTransformDragEnd={handleSectionTransformDragEnd}
      />
      {enableGizmo ? <ViewportGizmoCube container={gizmoContainer} /> : null}
    </>
  );
});
