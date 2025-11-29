import type { ReactNode } from 'react';
import type { StageOptions } from '#components/geometry/graphics/three/stage.js';
import { Stage } from '#components/geometry/graphics/three/stage.js';
import { Controls } from '#components/geometry/graphics/three/controls.js';
import { UpDirectionHandler } from '#components/geometry/graphics/three/up-direction-handler.js';

type SceneProperties = {
  readonly children: ReactNode;
  readonly enableGizmo?: boolean;
  readonly enableDamping?: boolean;
  readonly enableZoom?: boolean;
  readonly enablePan?: boolean;
  readonly enableGrid?: boolean;
  readonly enableAxes?: boolean;
  readonly upDirection?: 'x' | 'y' | 'z';
  readonly stageOptions?: StageOptions;
  readonly enableCentering?: boolean;
  readonly zoomSpeed: number;
  readonly gizmoContainer?: HTMLElement | string;
};

export function Scene({
  children,
  enableGizmo = false,
  enableDamping = false,
  enableZoom = false,
  enablePan = false,
  enableGrid = false,
  enableAxes = false,
  upDirection = 'z',
  stageOptions,
  enableCentering = true,
  zoomSpeed,
  gizmoContainer,
}: SceneProperties): React.JSX.Element {
  return (
    <>
      <UpDirectionHandler upDirection={upDirection} />
      <Controls
        enableGizmo={enableGizmo}
        enableDamping={enableDamping}
        enableZoom={enableZoom}
        enablePan={enablePan}
        zoomSpeed={zoomSpeed}
        gizmoContainer={gizmoContainer}
      />
      <Stage
        stageOptions={stageOptions}
        enableCentering={enableCentering}
        enableGrid={enableGrid}
        enableAxes={enableAxes}
      >
        {children}
      </Stage>
    </>
  );
}
