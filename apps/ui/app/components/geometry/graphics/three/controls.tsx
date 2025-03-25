import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei';
import React from 'react';

type ControlsProperties = {
  enableGizmo: boolean;
  enableDamping: boolean;
  enableZoom: boolean;
  zoomSpeed?: number;
};

export const Controls = React.memo(function Controls({
  enableGizmo,
  enableDamping,
  enableZoom,
  zoomSpeed = 0.4,
}: ControlsProperties) {
  return (
    <>
      <OrbitControls zoomSpeed={zoomSpeed} makeDefault enableDamping={enableDamping} enableZoom={enableZoom} />
      {enableGizmo && (
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
      )}
    </>
  );
});
