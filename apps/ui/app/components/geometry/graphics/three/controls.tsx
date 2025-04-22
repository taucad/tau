import { OrbitControls } from '@react-three/drei';
import React from 'react';
import type { ComponentRef, RefObject } from 'react';
import { ViewportGizmoHelper } from './viewport-gizmo.js';

type ControlsProperties = {
  readonly enableGizmo: boolean;
  readonly enableDamping: boolean;
  readonly enableZoom: boolean;
  readonly zoomSpeed: number;
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- null is required by React
  readonly ref?: RefObject<ComponentRef<typeof OrbitControls> | null>;
};

export const Controls = React.memo(function ({
  enableGizmo,
  enableDamping,
  enableZoom,
  zoomSpeed,
  ref,
}: ControlsProperties) {
  return (
    <>
      <OrbitControls
        ref={ref}
        makeDefault
        zoomSpeed={zoomSpeed}
        enableDamping={enableDamping}
        enableZoom={enableZoom}
      />
      {enableGizmo ? <ViewportGizmoHelper /> : null}
    </>
  );
});
