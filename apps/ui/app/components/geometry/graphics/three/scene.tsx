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
  return (
    <>
      <Controls enableGizmo={enableGizmo} enableDamping={enableDamping} enableZoom={enableZoom} />
      <Stage stageOptions={stageOptions} center={center} enableGrid={enableGrid} enableAxesHelper={enableAxesHelper}>
        {children}
      </Stage>
    </>
  );
}
