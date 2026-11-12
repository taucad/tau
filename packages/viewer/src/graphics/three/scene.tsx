import type { ReactNode } from 'react';
import type { StageOptions } from '#graphics/three/stage-options.js';
import type { SecondaryMouseButtonMode } from '#graphics/three/three-viewer-properties.js';
import { Stage } from '#graphics/three/stage.jsx';
import { Controls } from '#graphics/three/controls.jsx';

type SceneProperties = {
  readonly children: ReactNode;
  readonly enableGizmo?: boolean;
  readonly enableDamping?: boolean;
  readonly enableZoom?: boolean;
  readonly enablePan?: boolean;
  readonly secondaryMouseButtonMode?: SecondaryMouseButtonMode;
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
  stageOptions,
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
        secondaryMouseButtonMode={secondaryMouseButtonMode}
        zoomSpeed={zoomSpeed}
        gizmoContainer={gizmoContainer}
      />
      <Stage stageOptions={stageOptions}>{children}</Stage>
    </>
  );
}
