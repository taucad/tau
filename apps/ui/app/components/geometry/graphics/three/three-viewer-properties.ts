import type { CanvasProps } from '@react-three/fiber';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import type { StageOptions } from '#components/geometry/graphics/three/stage.js';

export type ThreeViewerProperties = {
  /**
   * Active rendering backend for this viewer (typically URL-merged preference + probe).
   * This drives the Canvas `gl` factory and subtree `ThreeGraphicsBackendProvider`.
   */
  readonly graphicsBackend: ResolvedGraphicsBackend;
  readonly enableGizmo?: boolean;
  readonly enableGrid?: boolean;
  readonly enableAxes?: boolean;
  readonly enableZoom?: boolean;
  readonly enablePan?: boolean;
  readonly enableDamping?: boolean;
  readonly upDirection?: 'x' | 'y' | 'z';
  readonly className?: string;
  readonly enableCentering?: boolean;
  readonly stageOptions?: StageOptions;
  readonly zoomSpeed?: number;
  readonly gizmoContainer?: HTMLElement | string;
};

export type ThreeContextProperties = CanvasProps & ThreeViewerProperties;
