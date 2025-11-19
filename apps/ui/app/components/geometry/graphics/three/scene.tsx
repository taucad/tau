import type { ReactNode } from 'react';
import type { StageOptions } from '#components/geometry/graphics/three/stage.js';
import { Stage } from '#components/geometry/graphics/three/stage.js';
import { Controls } from '#components/geometry/graphics/three/controls.js';

type SceneProperties = {
  readonly children: ReactNode;
  readonly enableGizmo?: boolean;
  readonly enableDamping?: boolean;
  readonly enableZoom?: boolean;
  readonly enablePan?: boolean;
  readonly enableGrid?: boolean;
  readonly enableAxes?: boolean;
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
  stageOptions,
  enableCentering = true,
  zoomSpeed,
  gizmoContainer,
}: SceneProperties): React.JSX.Element {
  return (
    <>
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
