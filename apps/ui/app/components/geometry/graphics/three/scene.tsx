import React, { useRef } from 'react';
import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { Stage } from './stage';

type ControlsProperties = {
  hideGizmo: boolean;
  enableDamping: boolean;
};

const Controls = React.memo(
  React.forwardRef(function Controls({ hideGizmo, enableDamping }: ControlsProperties, controlsReference) {
    return (
      <>
        <OrbitControls makeDefault ref={controlsReference} enableDamping={enableDamping} />
        {!hideGizmo && (
          <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewport font="18px Inter var, HKGrotesk, sans-serif" />
          </GizmoHelper>
        )}
      </>
    );
  }),
);

export type SceneProperties = {
  hideGizmo: boolean;
  center: boolean;
  enableDamping: boolean;
  children: React.ReactNode;
};

export const Scene = React.memo(function Scene({ hideGizmo, center, enableDamping = true, children }: SceneProperties) {
  const controlsReference = useRef(null);

  return (
    <>
      <Controls hideGizmo={hideGizmo} ref={controlsReference} enableDamping={enableDamping} />
      <Stage controls={controlsReference} center={center}>
        {children}
      </Stage>
    </>
  );
});
