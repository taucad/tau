import React from 'react';
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
  cameraMode?: 'perspective' | 'orthographic';
  controlsRef?: React.RefObject<React.ComponentRef<typeof Controls> | null>;
  stageRef?: React.RefObject<React.ComponentRef<typeof Stage> | null>;
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
  cameraMode = 'perspective',
  controlsRef,
  stageRef,
}: SceneProperties) {
  return (
    <>
      <Controls enableGizmo={enableGizmo} enableDamping={enableDamping} enableZoom={enableZoom} ref={controlsRef} />
      <Stage
        stageOptions={stageOptions}
        center={center}
        enableGrid={enableGrid}
        enableAxesHelper={enableAxesHelper}
        cameraMode={cameraMode}
        ref={stageRef}
      >
        {children}
      </Stage>
    </>
  );
}
