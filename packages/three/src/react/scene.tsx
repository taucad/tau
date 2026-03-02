import type { ReactNode } from 'react';
import type { StageOptions } from './stage.js';
import { Stage } from './stage.js';
import { Controls } from './controls.js';
import { UpDirectionHandler } from './up-direction-handler.js';

type SceneProperties = {
  readonly children: ReactNode;
  readonly enableGizmo?: boolean;
  readonly enableDamping?: boolean;
  readonly enableZoom?: boolean;
  readonly enablePan?: boolean;
  readonly upDirection?: 'x' | 'y' | 'z';
  readonly stageOptions?: StageOptions;
  readonly enableCentering?: boolean;
  readonly zoomSpeed: number;
  readonly gizmoContainer?: HTMLElement | string;
  readonly geometryKey?: string;
  readonly onSceneRadiusChange?: (radius: number) => void;
  readonly onResetCamera?: () => void;
};

export function Scene({
  children,
  enableGizmo = false,
  enableDamping = false,
  enableZoom = false,
  enablePan = false,
  upDirection = 'z',
  stageOptions,
  enableCentering = false,
  zoomSpeed,
  gizmoContainer,
  geometryKey,
  onSceneRadiusChange,
  onResetCamera,
}: SceneProperties): React.JSX.Element {
  return (
    <>
      <UpDirectionHandler upDirection={upDirection} onResetCamera={onResetCamera} />
      <Controls
        enableGizmo={enableGizmo}
        enableDamping={enableDamping}
        enableZoom={enableZoom}
        enablePan={enablePan}
        zoomSpeed={zoomSpeed}
        gizmoContainer={gizmoContainer}
        geometryKey={geometryKey}
      />
      <Stage
        stageOptions={stageOptions}
        isCenteringEnabled={enableCentering}
        geometryKey={geometryKey}
        onSceneRadiusChange={onSceneRadiusChange}
      >
        {children}
      </Stage>
    </>
  );
}
