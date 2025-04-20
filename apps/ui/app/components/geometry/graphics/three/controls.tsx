import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei';
import React from 'react';
import type { ComponentRef, RefObject } from 'react';

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
      {enableGizmo ? (
        <>
          {/* TODO: review use of Gizmo view cube */}
          {/* <GizmoHelper
              up={[Math.PI / 2, 0, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              alignment="bottom-right"
              margin={[60, 60]}
            >
              <GizmoViewcube
                color={color.serialized.rgb}
                textColor="#fff"
                // faces={['front', 'back', 'left', 'right', 'top', 'bottom']}
              />
            </GizmoHelper> */}
          <GizmoHelper
            up={[Math.PI / 2, 0, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            alignment="bottom-right"
            margin={[60, 60]}
          >
            <GizmoViewport />
          </GizmoHelper>
        </>
      ) : null}
    </>
  );
});
