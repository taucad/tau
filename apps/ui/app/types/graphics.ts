export type GridSizes = {
  smallSize: number;
  largeSize: number;
  effectiveSize?: number;
  baseSize?: number;
  fov?: number;
};

/**
 * Camera angle configuration for screenshots
 */
export type CameraAngle = {
  /**
   * Theta angle of the camera. This is the angle from the XZ plane.
   * @default undefined (uses current camera angle)
   */
  theta?: number;

  /**
   * Phi angle of the camera. This is the angle from the XY plane.
   * @default undefined (uses current camera angle)
   */
  phi?: number;

  /**
   * Label for the camera angle.
   * @default `φ${phi}° θ${theta}°`
   */
  label?: string;
};

/**
 * Options for configuring screenshot capture
 */
export type ScreenshotOptions = {
  /**
   * Aspect ratio of the screenshot (width/height)
   * @default 16/9
   */
  aspectRatio?: number;

  /**
   * Maximum resolution (largest dimension) for the screenshot in pixels
   * This will override the default canvas size when specified
   * @default undefined (uses canvas size)
   */
  maxResolution?: number;

  /**
   * Zoom level multiplier (1.0 = no change, 2.0 = 2x zoom in, 0.5 = 2x zoom out)
   * @default 1.25
   */
  zoomLevel?: number;

  /**
   * Array of camera angles to capture. Each angle will result in a separate image.
   * @default [{phi: undefined, theta: undefined}]
   */
  cameraAngles?: CameraAngle[];

  /**
   * Output format settings
   */
  output?: {
    /**
     * File format for the output image
     * @default 'image/png'
     */
    format?: 'image/png' | 'image/jpeg' | 'image/webp';

    /**
     * Quality level for lossy formats (0.0 to 1.0)
     * Only applies to jpeg and webp formats
     * @default 0.92
     */
    quality?: number;

    /**
     * Whether to screenshot the scene as a preview.
     *
     * When true, the scene will be rendered without gizmos, grid, or zoom.
     * @default true
     */
    isPreview?: boolean;
  };
};
