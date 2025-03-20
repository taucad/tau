import React, { useRef } from 'react';
import { Stage, StageOptions } from './stage';
import { Controls } from './controls';

type SceneProperties = {
  children: React.ReactNode;
  enableGizmo?: boolean;
  enableDamping?: boolean;
  enableZoom?: boolean;
  enableGrid?: boolean;
  enableAxesHelper?: boolean;
  stageOptions: StageOptions;
  center?: boolean;
};

export function Scene({
  children,
  enableGizmo = false,
  enableDamping = false,
  enableZoom = false,
  enableGrid = false,
  enableAxesHelper = false,
  stageOptions,
  center = true,
}: SceneProperties) {
  const controlsReference = useRef<typeof Controls>(null);

  return (
    <>
      <Controls
        enableGizmo={enableGizmo}
        ref={controlsReference}
        enableDamping={enableDamping}
        enableZoom={enableZoom}
      />
      <Stage
        controls={controlsReference}
        stageOptions={stageOptions}
        center={center}
        enableGrid={enableGrid}
        enableAxesHelper={enableAxesHelper}
      >
        {children}
      </Stage>
    </>
  );
}
