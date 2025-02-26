import React, { useRef } from 'react';
import { Stage, StageOptions } from './stage';
import { Controls } from './controls';

type SceneProperties = {
  children: React.ReactNode;
  hideGizmo?: boolean;
  enableDamping?: boolean;
  stageOptions: StageOptions;
  center?: boolean;
};

export function Scene({
  children,
  hideGizmo = false,
  enableDamping = false,
  stageOptions,
  center = true,
}: SceneProperties) {
  const controlsReference = useRef<typeof Controls>(null);

  return (
    <>
      <Controls hideGizmo={hideGizmo} ref={controlsReference} enableDamping={enableDamping} />
      <Stage controls={controlsReference} stageOptions={stageOptions} center={center}>
        {children}
      </Stage>
    </>
  );
}
