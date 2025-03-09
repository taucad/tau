import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei';
import React from 'react';

type ControlsProperties = {
  enableGizmo: boolean;
  enableDamping: boolean;
  enableZoom: boolean;
};

export const Controls = React.memo(
  React.forwardRef(function Controls(
    { enableGizmo, enableDamping, enableZoom }: ControlsProperties,
    controlsReference,
  ) {
    return (
      <>
        <OrbitControls makeDefault ref={controlsReference} enableDamping={enableDamping} enableZoom={enableZoom} />
        {enableGizmo && (
          <>
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
  }),
);
