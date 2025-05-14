import { OrbitControls } from '@react-three/drei';
import React from 'react';
import { ViewportGizmoCube } from '~/components/geometry/graphics/three/viewport-gizmo-cube.js';

type ControlsProperties = {
  readonly enableGizmo: boolean;
  readonly enableDamping: boolean;
  readonly enableZoom: boolean;
  readonly zoomSpeed: number;
};

export const Controls = React.memo(function ({
  enableGizmo,
  enableDamping,
  enableZoom,
  zoomSpeed,
}: ControlsProperties) {
  return (
    <>
      <OrbitControls makeDefault zoomSpeed={zoomSpeed} enableDamping={enableDamping} enableZoom={enableZoom} />
      {enableGizmo ? <ViewportGizmoCube /> : null}
    </>
  );
});
