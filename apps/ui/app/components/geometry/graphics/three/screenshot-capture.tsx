import { useImperativeHandle } from 'react';
import type { RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

export type ScreenshotOptions = {
  /**
   * Aspect ratio of the screenshot (width/height)
   * @default 16/9
   */
  aspectRatio?: number;

  /**
   * Zoom level multiplier (1.0 = no change, 2.0 = 2x zoom in, 0.5 = 2x zoom out)
   * @default 1.25
   */
  zoomLevel?: number;

  /**
   * Quality settings for rendering
   */
  quality?: {
    /**
     * Super-sampling factor for higher resolution rendering
     * Higher values increase quality but require more memory
     * @default 1
     */
    supersamplingFactor?: number;

    /**
     * Number of samples for multi-sample anti-aliasing
     * Use 0 to disable MSAA
     * @default 0
     */
    antiAliasingSamples?: number;

    /**
     * Line width enhancement factor for line objects
     * Set to 0 to disable line enhancement
     * @default 2
     */
    lineWidthEnhancement?: number;
  };

  /**
   * Output format settings
   */
  output?: {
    /**
     * File format for the output image
     * @default 'png'
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

export type ScreenshotCaptureHandle = {
  captureScreenshot: (options?: ScreenshotOptions) => string;
};

// Component to capture screenshots
export function ScreenshotCapture({
  ref: reference,
}: {
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- null is required by React
  readonly ref: RefObject<ScreenshotCaptureHandle | null>;
}) {
  const { gl, scene, camera } = useThree();

  useImperativeHandle(
    reference,
    () => ({
      captureScreenshot(options?: ScreenshotOptions) {
        if (!gl.domElement) {
          throw new Error('Screenshot attempted before renderer was ready');
        }

        // Setup default options
        const defaultOptions = {
          aspectRatio: 16 / 9,
          zoomLevel: 1.25,
          quality: {
            supersamplingFactor: 1,
            antiAliasingSamples: 0,
            lineWidthEnhancement: 2,
          },
          output: {
            format: 'image/png',
            quality: 0.92,
            isPreview: true,
          },
        } as const satisfies ScreenshotOptions;

        // Merge provided options with defaults
        const config = options
          ? {
              ...defaultOptions,
              ...options,
              quality: {
                ...defaultOptions.quality,
                ...options?.quality,
              },
              output: {
                ...defaultOptions.output,
                ...options?.output,
              },
            }
          : defaultOptions;

        const removedObjects: THREE.Object3D[] = [];

        // If we are in preview mode, remove all objects that are not for preview only
        if (config.output.isPreview) {
          scene.traverse((object) => {
            // Check if the object is for preview only
            if (object.userData?.isPreviewOnly) {
              object.visible = false;
              removedObjects.push(object);
            }
          });
        }

        // Store original canvas size for aspect ratio calculations
        const originalWidth = gl.domElement.width;
        const originalHeight = gl.domElement.height;

        // Store original camera properties
        const originalZoom = camera.zoom;
        let originalAspect: number | undefined;
        let originalFov: number | undefined;
        let originalLeft: number | undefined;
        let originalRight: number | undefined;
        let originalTop: number | undefined;
        let originalBottom: number | undefined;

        if (camera instanceof THREE.PerspectiveCamera) {
          originalAspect = camera.aspect;
          originalFov = camera.fov;
        } else if (camera instanceof THREE.OrthographicCamera) {
          originalLeft = camera.left;
          originalRight = camera.right;
          originalTop = camera.top;
          originalBottom = camera.bottom;
        }

        // Get target aspect ratio from config
        const targetAspect = config.aspectRatio;

        // Use super-sampling for higher quality
        const { supersamplingFactor } = config.quality;
        const width = Math.round(originalHeight * targetAspect) * supersamplingFactor;
        const height = originalHeight * supersamplingFactor;

        // Store original pixel ratio and set a higher one for rendering
        const originalPixelRatio = gl.getPixelRatio();
        gl.setPixelRatio(Math.max(window.devicePixelRatio, 2) * supersamplingFactor);

        // Create a WebGLRenderTarget with correct settings for proper color and anti-aliasing
        const renderTarget = new THREE.WebGLRenderTarget(width, height, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
          colorSpace: THREE.SRGBColorSpace, // Use sRGB color space for correct colors
          samples: config.quality.antiAliasingSamples, // Enable MSAA if specified
        });

        // Store renderer's initial state
        const originalRenderTarget = gl.getRenderTarget();
        const originalColorSpace = gl.outputColorSpace;

        // Set correct color space for output
        gl.outputColorSpace = THREE.SRGBColorSpace;

        // Apply zoom level from config
        camera.zoom = config.zoomLevel;

        // Temporarily adjust camera to match the target aspect ratio
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.aspect = targetAspect;
        } else if (
          camera instanceof THREE.OrthographicCamera &&
          originalLeft !== undefined &&
          originalRight !== undefined
        ) {
          // For orthographic camera, adjust the viewport
          const halfWidth = (originalRight - originalLeft) / 2;
          const newHalfWidth = halfWidth * (targetAspect / (originalWidth / originalHeight));
          camera.left = -newHalfWidth;
          camera.right = newHalfWidth;
        }

        camera.updateProjectionMatrix();

        // Enhance line width for better detail if specified
        const lineWidthEnhancement = config.quality?.lineWidthEnhancement || 0;

        if (lineWidthEnhancement > 0) {
          scene.traverse((object) => {
            if ((object instanceof THREE.Line || object instanceof THREE.LineSegments) && object.material) {
              // Store original line width if it exists
              const originalLineWidth = object.material.linewidth;
              // Increase line width for the screenshot
              if (object.material.linewidth !== undefined) {
                object.material.linewidth = Math.max(originalLineWidth, lineWidthEnhancement);
              }

              // Restore after rendering
              setTimeout(() => {
                if (object.material.linewidth !== undefined) {
                  object.material.linewidth = originalLineWidth;
                }
              }, 0);
            }
          });
        }

        // Render to the offscreen buffer
        gl.setRenderTarget(renderTarget);
        gl.render(scene, camera);

        // Create a temporary canvas to convert the render target to an image
        const temporaryCanvas = document.createElement('canvas');
        temporaryCanvas.width = width / supersamplingFactor;
        temporaryCanvas.height = height / supersamplingFactor;
        const context = temporaryCanvas.getContext('2d', { alpha: true, willReadFrequently: true });

        if (!context) {
          throw new Error('Could not get 2D context for screenshot');
        }

        // Read pixels from the render target
        const buffer = new Uint8Array(width * height * 4);
        gl.readRenderTargetPixels(renderTarget, 0, 0, width, height, buffer);

        // Create a higher resolution canvas for the raw data
        const highResolutionCanvas = document.createElement('canvas');
        highResolutionCanvas.width = width;
        highResolutionCanvas.height = height;
        const highResolutionContext = highResolutionCanvas.getContext('2d', { alpha: true });

        if (!highResolutionContext) {
          throw new Error('Could not get high resolution 2D context for screenshot');
        }

        // Create ImageData at full resolution
        const imageData = highResolutionContext.createImageData(width, height);

        // Process pixels with optional vertical flipping
        for (let y = 0; y < height; y++) {
          // Apply vertical flip, as WebGL renders upside down
          const destinationY = height - 1 - y;

          for (let x = 0; x < width; x++) {
            // Source indices
            const sourceIndex = (y * width + x) * 4;

            // Destination indices
            const destinationIndex = (destinationY * width + x) * 4;

            // Copy and assign RGBA values
            imageData.data[destinationIndex] = buffer[sourceIndex]; // R
            imageData.data[destinationIndex + 1] = buffer[sourceIndex + 1]; // G
            imageData.data[destinationIndex + 2] = buffer[sourceIndex + 2]; // B
            imageData.data[destinationIndex + 3] = buffer[sourceIndex + 3]; // A
          }
        }

        // Put the processed image data onto the high-res canvas
        highResolutionContext.putImageData(imageData, 0, 0);

        // Draw the high-res canvas onto the final canvas, downsampling with better quality
        context.drawImage(
          highResolutionCanvas,
          0,
          0,
          width,
          height,
          0,
          0,
          width / supersamplingFactor,
          height / supersamplingFactor,
        );

        // Get the data URL with the specified format and quality
        const mimeType = config.output?.format;

        // Only use quality for lossy formats
        const outputQuality =
          mimeType === 'image/jpeg' || mimeType === 'image/webp' ? config.output.quality : undefined;

        const dataURL = temporaryCanvas.toDataURL(mimeType, outputQuality);

        // Clean up
        renderTarget.dispose();
        highResolutionCanvas.remove();

        // Restore renderer state
        gl.setRenderTarget(originalRenderTarget);
        gl.outputColorSpace = originalColorSpace;
        gl.setPixelRatio(originalPixelRatio);

        // Restore camera settings
        camera.zoom = originalZoom;

        if (camera instanceof THREE.PerspectiveCamera && originalAspect !== undefined) {
          camera.aspect = originalAspect;
          if (originalFov !== undefined) {
            camera.fov = originalFov;
          }
        } else if (camera instanceof THREE.OrthographicCamera) {
          if (originalLeft !== undefined) camera.left = originalLeft;
          if (originalRight !== undefined) camera.right = originalRight;
          if (originalTop !== undefined) camera.top = originalTop;
          if (originalBottom !== undefined) camera.bottom = originalBottom;
        }

        camera.updateProjectionMatrix();

        // Restore the objects
        for (const object of removedObjects) {
          object.visible = true;
        }

        // Render the scene again to ensure everything is visible
        gl.render(scene, camera);

        return dataURL;
      },
    }),
    [gl, scene, camera],
  );

  return null;
}
