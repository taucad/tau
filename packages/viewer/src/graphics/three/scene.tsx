import type { ReactNode } from 'react';
import type { StageOptions } from '#graphics/three/stage-options.js';
import type { SecondaryMouseButtonMode } from '#graphics/three/three-viewer-properties.js';
import type { GizmoStyleId } from '#graphics/three/controls/viewport-gizmo-styles.js';
import type { OrbitStyle } from '#graphics/three/controls/camera-wheel-router.js';
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
  readonly orbitStyle?: OrbitStyle;
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
  orbitStyle,
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
        orbitStyle={orbitStyle}
      />
      <Stage stageOptions={stageOptions}>{children}</Stage>
    </>
  );
}
