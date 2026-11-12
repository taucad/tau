import type { ReactNode } from 'react';
import type { StageOptions } from '#graphics/three/stage-options.js';
import type { SecondaryMouseButtonMode } from '#graphics/three/three-viewer-properties.js';
import type { GizmoStyleId } from '#graphics/three/controls/viewport-gizmo-styles.js';
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
  readonly gizmoStyle?: GizmoStyleId;
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
  gizmoStyle,
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
        gizmoStyle={gizmoStyle}
      />
      <Stage stageOptions={stageOptions}>{children}</Stage>
    </>
  );
}
