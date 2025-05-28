import { useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { screenshotCapabilityActor } from '~/routes/builds_.$id/graphics-actor.js';

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
   * Zoom level multiplier (1.0 = no change, 2.0 = 2x zoom in, 0.5 = 2x zoom out)
   * @default 1.25
   */
  zoomLevel?: number;

  /**
   * Theta angle of the camera
   * @default 0
   */
  theta?: number;

  /**
   * Phi angle of the camera
   * @default 0
   */
  phi?: number;

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

/**
 * Hook that configures screenshot capabilities using Canvas toBlob API
 */
export function useScreenCapture(): (options?: ScreenshotOptions) => Promise<string> {
  const { gl, scene, camera } = useThree();

  const captureScreenshot = useCallback(
    async (options?: ScreenshotOptions): Promise<string> => {
      if (!gl.domElement) {
        throw new Error('Screenshot attempted before renderer was ready');
      }

      // Additional validation to ensure canvas is still valid
      if (!gl.domElement.isConnected) {
        throw new Error('Screenshot attempted on disconnected canvas - canvas may have been recreated');
      }

      // Setup default options
      const defaultOptions = {
        aspectRatio: 16 / 9,
        zoomLevel: 1.25,
        theta: undefined,
        phi: undefined,
        output: {
          format: 'image/png' as const,
          quality: 0.92,
          isPreview: true,
        },
      } satisfies ScreenshotOptions;

      // Merge provided options with defaults
      const config = {
        ...defaultOptions,
        ...options,
        output: {
          ...defaultOptions.output,
          ...options?.output,
        },
      };

      // Create a copy of the camera for the screenshot so we don't modify the original
      const screenshotCamera = (camera as THREE.PerspectiveCamera).clone();
      screenshotCamera.zoom = config.zoomLevel;
      screenshotCamera.aspect = config.aspectRatio;

      // Apply spherical coordinate positioning only if both phi and theta are specified
      if (config.phi !== undefined && config.theta !== undefined) {
        // Get the current camera distance from the target (assuming target is at origin)
        const currentPosition = screenshotCamera.position.clone();
        const distance = currentPosition.length();

        // Convert phi and theta to radians
        const phiRad = (config.phi * Math.PI) / 180;
        const thetaRad = (config.theta * Math.PI) / 180;

        // Get the current up vector to determine coordinate system
        const upVector = THREE.Object3D.DEFAULT_UP.clone();

        // Calculate position using standard spherical coordinates
        // Standard convention: phi is polar angle from up axis, theta is azimuthal angle
        let x: number;
        let y: number;
        let z: number;

        if (upVector.z === 1) {
          // Z-up coordinate system (current app configuration)
          x = distance * Math.sin(phiRad) * Math.cos(thetaRad);
          y = distance * Math.sin(phiRad) * Math.sin(thetaRad);
          z = distance * Math.cos(phiRad);
        } else if (upVector.y === 1) {
          // Y-up coordinate system (Three.js default)
          x = distance * Math.sin(phiRad) * Math.cos(thetaRad);
          z = distance * Math.sin(phiRad) * Math.sin(thetaRad);
          y = distance * Math.cos(phiRad);
        } else {
          // X-up coordinate system (less common)
          y = distance * Math.sin(phiRad) * Math.cos(thetaRad);
          z = distance * Math.sin(phiRad) * Math.sin(thetaRad);
          x = distance * Math.cos(phiRad);
        }

        // Set the new camera position
        screenshotCamera.position.set(x, y, z);

        // Make the camera look at the origin (or the scene center)
        screenshotCamera.lookAt(0, 0, 0);

        console.log(
          `Screenshot camera positioned at phi=${config.phi}°, theta=${config.theta}° -> position(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) [up=${upVector.x},${upVector.y},${upVector.z}]`,
        );
      }

      screenshotCamera.updateProjectionMatrix();

      // Create a copy of the scene for the screenshot so we don't modify the original
      const screenshotScene = scene.clone();

      // Handle preview mode - hide non-preview objects in the cloned scene
      if (config.output.isPreview) {
        screenshotScene.traverse((object) => {
          if (object.userData?.isPreviewOnly) {
            object.visible = false;
          }
        });
      }

      const originalHeight = gl.domElement.height;
      const originalPixelRatio = gl.getPixelRatio();

      try {
        // Calculate target dimensions based on aspect ratio
        const targetAspect = config.aspectRatio;
        const width = Math.round(originalHeight * targetAspect);
        const height = originalHeight;

        // Create a temporary canvas for the screenshot
        const screenshotCanvas = document.createElement('canvas');
        screenshotCanvas.width = width;
        screenshotCanvas.height = height;

        // Create a temporary WebGL renderer for the screenshot
        const screenshotRenderer = new THREE.WebGLRenderer({
          canvas: screenshotCanvas,
          alpha: true,
          antialias: true,
          preserveDrawingBuffer: true,
        });

        // Copy settings from the main renderer
        screenshotRenderer.setSize(width, height, false);
        screenshotRenderer.setPixelRatio(gl.getPixelRatio());
        screenshotRenderer.outputColorSpace = gl.outputColorSpace;
        screenshotRenderer.shadowMap.enabled = gl.shadowMap.enabled;
        screenshotRenderer.shadowMap.type = gl.shadowMap.type;

        // Render the scene to the temporary canvas
        screenshotRenderer.render(screenshotScene, screenshotCamera);

        // Use toBlob API on the temporary canvas
        const blob = await new Promise<Blob | undefined>((resolve) => {
          const mimeType = config.output.format;
          const quality = mimeType === 'image/jpeg' || mimeType === 'image/webp' ? config.output.quality : undefined;

          screenshotCanvas.toBlob(
            (result) => {
              resolve(result ?? undefined);
            },
            mimeType,
            quality,
          );
        });

        if (!blob) {
          throw new Error('Failed to create blob from canvas');
        }

        // Convert blob to data URL
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.addEventListener('load', () => {
            resolve(reader.result as string);
          });
          reader.addEventListener('error', reject);
          reader.readAsDataURL(blob);
        });

        // Cleanup the temporary renderer
        screenshotRenderer.dispose();

        // Additional cleanup to prevent WebGL context accumulation
        screenshotRenderer.forceContextLoss();

        // Remove the canvas from memory
        screenshotCanvas.width = 0;
        screenshotCanvas.height = 0;

        return dataUrl;
      } finally {
        // Restore all original state
        gl.setPixelRatio(originalPixelRatio);

        // Re-render to ensure everything is visible
        gl.render(scene, camera);
      }
    },
    [gl, scene, camera],
  );

  return captureScreenshot;
}

// Simple component to setup the screenshot capability
export function ScreenshotSetup(): ReactNode {
  const capture = useScreenCapture();

  useEffect(() => {
    screenshotCapabilityActor.send({ type: 'registerCapture', capture });

    // Cleanup function to unregister on unmount
    return () => {
      screenshotCapabilityActor.send({ type: 'unregisterCapture' });
    };
  }, [capture]);

  return null;
}
