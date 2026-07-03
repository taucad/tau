import { CameraControlsImpl } from '@react-three/drei/core/CameraControls.js';
import React, { useMemo } from 'react';
import type * as THREE from 'three';
import { TauCameraControls } from '#components/geometry/graphics/three/controls/tau-camera-controls.js';
import { ViewportGizmoCube } from '#components/geometry/graphics/three/controls/viewport-gizmo-cube.js';
import { SectionViewControls } from '#components/geometry/graphics/three/react/section-view-controls.js';
import { MeasureTool } from '#components/geometry/graphics/three/react/measure-tool.js';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.js';
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
  const dollySpeed = zoomSpeed * 0.5;
  const graphicsActor = useGraphics();
  const isActive = useGraphicsSelector((state) => state.context.isSectionViewActive);
  const selectedPlaneId = useGraphicsSelector((state) => state.context.selectedSectionViewId);
  const rotation = useGraphicsSelector((state) => state.context.sectionViewRotation);
  const pivot = useGraphicsSelector((state) => state.context.sectionViewPivot);
  const availablePlanes = useGraphicsSelector((state) => state.context.availableSectionViews);
  const planeName = useGraphicsSelector((state) => state.context.planeName);
  const hoveredSectionViewId = useGraphicsSelector((state) => state.context.hoveredSectionViewId);
  const upDirection = useGraphicsSelector((state) => state.context.upDirection);
  const mouseButtons = useMemo(
    () => resolveCameraControlMouseButtons({ enablePan, enableZoom, secondaryMouseButtonMode }),
    [enablePan, enableZoom, secondaryMouseButtonMode],
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

  const handleSetPivot = (value: [number, number, number]): void => {
    graphicsActor.send({ type: 'setSectionViewPivot', payload: value });
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
      <TauCameraControls
        makeDefault
        dollySpeed={dollySpeed}
        truckSpeed={enablePan ? 2 : 0}
        smoothTime={0}
        draggingSmoothTime={0}
        mouseButtons={mouseButtons}
      />
      <MeasureTool />
      <SectionViewControls
        isActive={isActive}
        selectedPlaneId={selectedPlaneId}
        availablePlanes={availablePlanes}
        rotation={rotation}
        pivot={pivot}
        planeName={planeName}
        hoveredSectionViewId={hoveredSectionViewId}
        upDirection={upDirection}
        onSelectPlane={handleSelectPlane}
        onHover={handleHover}
        onSetRotation={handleSetRotation}
        onSetPivot={handleSetPivot}
        onTransformDragStart={handleSectionTransformDragStart}
        onTransformDragMove={handleSectionTransformDragMove}
        onTransformDragEnd={handleSectionTransformDragEnd}
      />
      {enableGizmo ? <ViewportGizmoCube container={gizmoContainer} dependencies={[upDirection]} /> : null}
    </>
  );
});

export function resolveCameraControlMouseButtons({
  enablePan,
  enableZoom,
  secondaryMouseButtonMode,
}: {
  readonly enablePan: boolean;
  readonly enableZoom: boolean;
  readonly secondaryMouseButtonMode: SecondaryMouseButtonMode;
}): React.ComponentProps<typeof TauCameraControls>['mouseButtons'] {
  return {
    left: CameraControlsImpl.ACTION.ROTATE,
    middle: enablePan ? CameraControlsImpl.ACTION.TRUCK : CameraControlsImpl.ACTION.NONE,
    right:
      enablePan && secondaryMouseButtonMode === 'camera-pan'
        ? CameraControlsImpl.ACTION.TRUCK
        : CameraControlsImpl.ACTION.NONE,
    wheel: enableZoom ? CameraControlsImpl.ACTION.DOLLY : CameraControlsImpl.ACTION.NONE,
  };
}
