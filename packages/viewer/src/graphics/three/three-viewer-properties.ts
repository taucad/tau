import type { CanvasProps } from '@react-three/fiber';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';
import type { StageOptions } from '#graphics/three/stage-options.js';
import type { PostProcessingSettings } from '#graphics/three/post-processing-settings.js';
import type { CameraInput } from '#graphics/three/controls/camera-wheel-router.js';
import type { GizmoStyleId } from '#graphics/three/controls/viewport-gizmo-styles.js';

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
  /**
   * How the person navigates: a mouse preset, this device's input device and the zoom and orbit toggles. Absent keeps
   * today's bindings: left drag orbits, middle and right drag pan, the wheel zooms toward the target.
   */
  readonly cameraInput?: CameraInput;
  /** The view cube's style. Absent: the rounded cube. */
  readonly gizmoStyle?: GizmoStyleId;
};

export type ThreeContextProperties = Omit<CanvasProps, 'camera' | 'orthographic'> & ThreeViewerProperties;
