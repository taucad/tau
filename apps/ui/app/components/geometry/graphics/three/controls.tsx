import { OrbitControls } from '@react-three/drei';
import React from 'react';
import { ViewportGizmoCube } from '~/components/geometry/graphics/three/viewport-gizmo-cube.js';

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
  return (
    <>
      <OrbitControls
        makeDefault
        zoomSpeed={zoomSpeed}
        enablePan={enablePan}
        enableDamping={enableDamping}
        enableZoom={enableZoom}
      />
      {enableGizmo ? <ViewportGizmoCube /> : null}
    </>
  );
});
