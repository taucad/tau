import { OrbitControls } from '@react-three/drei';
import React from 'react';
import { useSelector } from '@xstate/react';
import { graphicsActor } from '#routes/builds_.$id/graphics-actor.js';
import { ViewportGizmoCube } from '#components/geometry/graphics/three/controls/viewport-gizmo-cube.js';
import { ClippingControls } from '#components/geometry/graphics/three/react/clipping-controls.js';

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
  // Read clipping state from xstate
  const isActive = useSelector(graphicsActor, (state) => state.context.isClippingPlaneActive);
  const selectedPlaneId = useSelector(graphicsActor, (state) => state.context.selectedClippingPlaneId);
  const translation = useSelector(graphicsActor, (state) => state.context.clippingPlaneTranslation);
  const direction = useSelector(graphicsActor, (state) => state.context.clippingPlaneDirection);
  const availablePlanes = useSelector(graphicsActor, (state) => state.context.availableClippingPlanes);

  // Handlers to send events to xstate
  const handleSelectPlane = (planeId: 'xy' | 'xz' | 'yz'): void => {
    graphicsActor.send({ type: 'selectClippingPlane', payload: planeId });
  };

  const handleToggleDirection = (): void => {
    graphicsActor.send({ type: 'toggleClippingPlaneDirection' });
  };

  const handleSetTranslation = (value: number): void => {
    graphicsActor.send({ type: 'setClippingPlaneTranslation', payload: value });
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
      <ClippingControls
        isActive={isActive}
        selectedPlaneId={selectedPlaneId}
        availablePlanes={availablePlanes}
        translation={translation}
        direction={direction}
        onSelectPlane={handleSelectPlane}
        onToggleDirection={handleToggleDirection}
        onSetTranslation={handleSetTranslation}
      />
      {enableGizmo ? <ViewportGizmoCube /> : null}
    </>
  );
});
