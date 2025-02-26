import { useColor } from '@/hooks/use-color';
import { OrbitControls, GizmoHelper, GizmoViewcube } from '@react-three/drei';
import React from 'react';

type ControlsProperties = {
  hideGizmo: boolean;
  enableDamping: boolean;
};

export const Controls = React.memo(
  React.forwardRef(function Controls({ hideGizmo, enableDamping }: ControlsProperties, controlsReference) {
    const color = useColor();
    return (
      <>
        <OrbitControls makeDefault ref={controlsReference} enableDamping={enableDamping} />
        {!hideGizmo && (
          <GizmoHelper
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
          </GizmoHelper>
        )}
      </>
    );
  }),
);
