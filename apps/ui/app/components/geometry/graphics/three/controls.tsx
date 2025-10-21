import { OrbitControls } from '@react-three/drei';
import React from 'react';
import type * as THREE from 'three';
import { useSelector } from '@xstate/react';
import { graphicsActor } from '#routes/builds_.$id/graphics-actor.js';
import { ViewportGizmoCube } from '#components/geometry/graphics/three/controls/viewport-gizmo-cube.js';
import { SectionViewControls } from '#components/geometry/graphics/three/react/section-view-controls.js';
import { MeasureTool } from '#components/geometry/graphics/three/react/measure-tool.js';

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
  /**
   * @description The speed of the camera zoom.
   */
  readonly zoomSpeed: number;
};

export const Controls = React.memo(function ({
  enableGizmo,
  enableDamping,
  enableZoom,
  enablePan,
  zoomSpeed,
}: ControlsProperties) {
  const isActive = useSelector(graphicsActor, (state) => state.context.isSectionViewActive);
  const selectedPlaneId = useSelector(graphicsActor, (state) => state.context.selectedSectionViewId);
  const translation = useSelector(graphicsActor, (state) => state.context.sectionViewTranslation);
  const direction = useSelector(graphicsActor, (state) => state.context.sectionViewDirection);
  const availablePlanes = useSelector(graphicsActor, (state) => state.context.availableSectionViews);
  const isMeasureActive = useSelector(graphicsActor, (state) => state.matches({ operational: 'measure' }));

  // Handlers to send events to xstate
  const handleSelectPlane = (planeId: 'xy' | 'xz' | 'yz'): void => {
    graphicsActor.send({ type: 'selectSectionView', payload: planeId });
  };

  const handleToggleDirection = (): void => {
    graphicsActor.send({ type: 'toggleSectionViewDirection' });
  };

  const handleSetTranslation = (value: number): void => {
    graphicsActor.send({ type: 'setSectionViewTranslation', payload: value });
  };

  const handleSetRotation = (eulerRotation: THREE.Euler): void => {
    graphicsActor.send({
      type: 'setSectionViewRotation',
      payload: [eulerRotation.x, eulerRotation.y, eulerRotation.z],
    });
  };

  return (
    <>
      <OrbitControls
        makeDefault
        zoomSpeed={zoomSpeed}
        enablePan={enablePan}
        enableDamping={enableDamping}
        enableZoom={enableZoom}
      />
      {Boolean(isMeasureActive) && <MeasureTool />}
      <SectionViewControls
        isActive={isActive}
        selectedPlaneId={selectedPlaneId}
        availablePlanes={availablePlanes}
        translation={translation}
        direction={direction}
        onSelectPlane={handleSelectPlane}
        onToggleDirection={handleToggleDirection}
        onSetTranslation={handleSetTranslation}
        onSetRotation={handleSetRotation}
      />
      {enableGizmo ? <ViewportGizmoCube /> : null}
    </>
  );
});
