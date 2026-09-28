import type { CanvasProps } from '@react-three/fiber';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import type { StageOptions } from '#components/geometry/graphics/three/stage.js';
import type { PostProcessingSettings } from '#components/geometry/graphics/three/post-processing-settings.js';

export type SecondaryMouseButtonMode = 'camera-pan' | 'context-menu' | 'none';

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
  readonly secondaryMouseButtonMode?: SecondaryMouseButtonMode;
  readonly enableDamping?: boolean;
  readonly upDirection?: 'x' | 'y' | 'z';
  readonly className?: string;
  readonly stageOptions?: StageOptions;
  readonly postProcessingSettings?: Partial<PostProcessingSettings>;
  readonly zoomSpeed?: number;
  readonly gizmoContainer?: HTMLElement | string;
};

export type ThreeContextProperties = Omit<CanvasProps, 'camera' | 'orthographic'> & ThreeViewerProperties;
