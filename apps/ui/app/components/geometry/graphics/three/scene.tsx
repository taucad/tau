import type { ReactNode } from 'react';
import type { StageOptions } from '#components/geometry/graphics/three/stage.js';
import type { SecondaryMouseButtonMode } from '#components/geometry/graphics/three/three-viewer-properties.js';
import { Stage } from '#components/geometry/graphics/three/stage.js';
import { Controls } from '#components/geometry/graphics/three/controls.js';
import { ViewportGizmoInteractionLockProvider } from '#components/geometry/graphics/three/controls/viewport-gizmo-interaction-lock.js';
import { UpDirectionHandler } from '#components/geometry/graphics/three/up-direction-handler.js';

type SceneProperties = {
  readonly children: ReactNode;
  readonly enableGizmo?: boolean;
  readonly enableDamping?: boolean;
  readonly enableZoom?: boolean;
  readonly enablePan?: boolean;
  readonly secondaryMouseButtonMode?: SecondaryMouseButtonMode;
  readonly upDirection?: 'x' | 'y' | 'z';
  readonly stageOptions?: StageOptions;
  readonly zoomSpeed: number;
  readonly gizmoContainer?: HTMLElement | string;
};

export function Scene({
  children,
  enableGizmo = false,
  enableDamping = false,
  enableZoom = false,
  enablePan = false,
  secondaryMouseButtonMode = 'camera-pan',
  upDirection = 'z',
  stageOptions,
  zoomSpeed,
  gizmoContainer,
}: SceneProperties): React.JSX.Element {
  return (
    <>
      <UpDirectionHandler upDirection={upDirection} />
      <ViewportGizmoInteractionLockProvider>
        <Controls
          enableGizmo={enableGizmo}
          enableDamping={enableDamping}
          enableZoom={enableZoom}
          enablePan={enablePan}
          secondaryMouseButtonMode={secondaryMouseButtonMode}
          zoomSpeed={zoomSpeed}
          gizmoContainer={gizmoContainer}
        />
        <Stage stageOptions={stageOptions}>{children}</Stage>
      </ViewportGizmoInteractionLockProvider>
    </>
  );
}
