/** Camera angle configuration for screenshots. */
export type CameraAngle = {
  /** Theta angle of the camera (angle from the XZ plane). */
  theta?: number;
  /** Phi angle of the camera (angle from the XY plane). */
  phi?: number;
  /** Human-readable label for this camera angle. */
  label?: string;
};

/** Output format settings for screenshots. */
export type ScreenshotOutputOptions = {
  /** File format for the output image. */
  format?: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Quality level for lossy formats (0.0 to 1.0). Only applies to jpeg and webp. */
  quality?: number;
  /**
   * Whether to screenshot the scene as a preview.
   * When true, objects marked with `isPreviewOnly` userData will be hidden.
   */
  isPreview?: boolean;
};

/** Options for configuring composite (grid) image creation. */
export type CompositeScreenshotOptions = {
  enabled: boolean;
  maxColumns?: number;
  maxRows?: number;
  preferredRatio?: { columns: number; rows: number };
  padding?: number;
  labelHeight?: number;
  showLabels?: boolean;
  backgroundColor?: string | 'transparent';
  dividerColor?: string | 'transparent';
  dividerWidth?: number;
};

/** Options for configuring screenshot capture. */
export type ScreenshotOptions = {
  /** Aspect ratio of the screenshot (width/height). */
  aspectRatio?: number;
  /** Maximum resolution (largest dimension) for the screenshot in pixels. */
  maxResolution?: number;
  /** Zoom level multiplier (1.0 = no change). */
  zoomLevel?: number;
  /** Array of camera angles to capture. Each angle produces a separate image. */
  cameraAngles?: CameraAngle[];
  /** Output format settings. */
  output?: ScreenshotOutputOptions;
  /** Composite image settings for multi-angle captures. */
  composite?: CompositeScreenshotOptions;
};
