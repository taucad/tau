import { setup, sendTo, fromCallback, assertEvent, enqueueActions, assign } from 'xstate';
import type { AnyActorRef } from 'xstate';
import * as THREE from 'three';
import type { ScreenshotOptions, CameraAngle } from '~/types/graphics.js';

// Context type
type ScreenshotCapabilityContext = {
  graphicsRef: AnyActorRef;
  gl?: THREE.WebGLRenderer;
  scene?: THREE.Scene;
  camera?: THREE.Camera;
  queuedCaptureRequests: Array<{ options?: ScreenshotOptions; requestId: string }>;
  isRegistered: boolean;
  registrationError?: string;
};

// Event types
type ScreenshotCapabilityEvent =
  | { type: 'registerCapture'; gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera }
  | { type: 'unregisterCapture' }
  | { type: 'capture'; options?: ScreenshotOptions; requestId: string }
  | { type: 'screenshotCompleted'; dataUrls: string[]; requestId: string }
  | { type: 'screenshotFailed'; error: string; requestId: string }
  | { type: 'registrationTimeout' };

// Input type
type ScreenshotCapabilityInput = {
  graphicsRef: AnyActorRef;
};

// Registration timeout in milliseconds
const registrationTimeout = 5000;

/**
 * Screenshot Capability Machine
 *
 * Bridges Three.js screenshot functionality with the graphics machine.
 * Handles registration of screenshot capture function and proxies requests.
 * Queues capture requests until camera is registered with a 5-second timeout.
 * Supports multiple camera angles in a single request for efficient batch operations.
 */
export const screenshotCapabilityMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    context: {} as ScreenshotCapabilityContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    events: {} as ScreenshotCapabilityEvent,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    input: {} as ScreenshotCapabilityInput,
  },
  actors: {
    captureScreenshot: fromCallback<
      | { type: 'screenshotCompleted'; dataUrls: string[]; requestId: string }
      | { type: 'screenshotFailed'; error: string; requestId: string },
      {
        gl: THREE.WebGLRenderer;
        scene: THREE.Scene;
        camera: THREE.Camera;
        options?: ScreenshotOptions;
        requestId: string;
      }
    >(({ input, sendBack }) => {
      const { gl, scene, camera, options, requestId } = input;

      (async () => {
        try {
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
            cameraAngles: [{ phi: undefined, theta: undefined }] as CameraAngle[],
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

          // Ensure we have camera angles array
          if (!config.cameraAngles || config.cameraAngles.length === 0) {
            config.cameraAngles = defaultOptions.cameraAngles;
          }

          const originalHeight = gl.domElement.height;
          const originalPixelRatio = gl.getPixelRatio();

          // Calculate target dimensions based on aspect ratio
          const targetAspect = config.aspectRatio;
          let width = Math.round(originalHeight * targetAspect);
          let height = originalHeight;

          // Apply maxResolution constraint if specified
          if (config.maxResolution) {
            const maxDimension = Math.max(width, height);
            if (maxDimension > config.maxResolution) {
              const scale = config.maxResolution / maxDimension;
              width = Math.round(width * scale);
              height = Math.round(height * scale);
            }
          }

          console.log(
            `Screenshot dimensions: ${width}x${height} (aspect: ${targetAspect}, maxRes: ${config.maxResolution})`,
          );

          // Create a single temporary canvas for all screenshots
          const screenshotCanvas = document.createElement('canvas');
          screenshotCanvas.width = width;
          screenshotCanvas.height = height;

          // Create a single temporary WebGL renderer for all screenshots
          const screenshotRenderer = new THREE.WebGLRenderer({
            canvas: screenshotCanvas,
            alpha: true,
            antialias: true,
          });

          try {
            // Copy settings from the main renderer
            screenshotRenderer.setSize(width, height, false);

            // For composite screenshots, use 1:1 pixel ratio to respect maxResolution
            // For high-quality single screenshots, we could use the original pixel ratio
            const useHighDpi = config.cameraAngles && config.cameraAngles.length === 1;
            const pixelRatio = useHighDpi ? gl.getPixelRatio() : 1;
            screenshotRenderer.setPixelRatio(pixelRatio);

            console.log(`Using pixel ratio: ${pixelRatio} (original: ${gl.getPixelRatio()})`);

            screenshotRenderer.outputColorSpace = gl.outputColorSpace;
            screenshotRenderer.shadowMap.enabled = gl.shadowMap.enabled;
            screenshotRenderer.shadowMap.type = gl.shadowMap.type;

            const dataUrls: string[] = [];

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

            // Process each camera angle using the same canvas and renderer
            for (const cameraAngle of config.cameraAngles) {
              // Create a copy of the camera for the screenshot so we don't modify the original
              const screenshotCamera = (camera as THREE.PerspectiveCamera).clone();
              screenshotCamera.zoom = config.zoomLevel;
              screenshotCamera.aspect = config.aspectRatio;

              // Apply spherical coordinate positioning only if both phi and theta are specified
              if (cameraAngle.phi !== undefined && cameraAngle.theta !== undefined) {
                // Get the current camera distance from the target (assuming target is at origin)
                const currentPosition = screenshotCamera.position.clone();
                const distance = currentPosition.length();

                // Convert phi and theta to radians
                const phiRad = (cameraAngle.phi * Math.PI) / 180;
                const thetaRad = (cameraAngle.theta * Math.PI) / 180;

                // Get the current up vector to determine coordinate system
                const upVector = THREE.Object3D.DEFAULT_UP.clone();

                // Calculate position using standard spherical coordinates
                // Standard convention: phi is polar angle from up axis, theta is azimuthal angle
                let x: number;
                let y: number;
                let z: number;

                // eslint-disable-next-line max-depth -- refactor this
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
              }

              screenshotCamera.updateProjectionMatrix();

              // Render the scene to the canvas with this camera angle
              screenshotRenderer.render(screenshotScene, screenshotCamera);

              // Use toBlob API on the canvas
              // eslint-disable-next-line no-await-in-loop -- sequential processing required for shared canvas
              const blob = await new Promise<Blob | undefined>((resolve) => {
                const mimeType = config.output.format;
                const quality =
                  mimeType === 'image/jpeg' || mimeType === 'image/webp' ? config.output.quality : undefined;

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
              // eslint-disable-next-line no-await-in-loop -- sequential processing required for shared canvas
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.addEventListener('load', () => {
                  resolve(reader.result as string);
                });
                reader.addEventListener('error', reject);
                reader.readAsDataURL(blob);
              });

              dataUrls.push(dataUrl);
            }

            // Cleanup the temporary renderer
            screenshotRenderer.dispose();

            // Additional cleanup to prevent WebGL context accumulation
            screenshotRenderer.forceContextLoss();

            // Remove the canvas from memory
            screenshotCanvas.width = 0;
            screenshotCanvas.height = 0;

            sendBack({ type: 'screenshotCompleted', dataUrls, requestId });
          } finally {
            // Restore all original state
            gl.setPixelRatio(originalPixelRatio);

            // Re-render to ensure everything is visible
            gl.render(scene, camera);
          }
        } catch (error: unknown) {
          sendBack({
            type: 'screenshotFailed',
            error: error instanceof Error ? error.message : 'Screenshot failed',
            requestId,
          });
        }
      })();
    }),
  },
  actions: {
    registerWithGraphics: enqueueActions(({ enqueue, context, event, self }) => {
      assertEvent(event, 'registerCapture');
      enqueue.assign({
        gl: event.gl,
        scene: event.scene,
        camera: event.camera,
        isRegistered: true,
      });
      enqueue.sendTo(context.graphicsRef, {
        type: 'registerScreenshotCapability',
        actorRef: self,
      });
    }),
    unregisterFromGraphics: sendTo(({ context }) => context.graphicsRef, { type: 'unregisterScreenshotCapability' }),
    unregisterCapture: enqueueActions(({ enqueue, context }) => {
      enqueue.assign({
        gl: undefined,
        scene: undefined,
        camera: undefined,
        isRegistered: false,
      });
      enqueue.sendTo(context.graphicsRef, { type: 'unregisterScreenshotCapability' });
    }),
    forwardResult: sendTo(
      ({ context }) => context.graphicsRef,
      ({ event }) => event,
    ),
    queueCaptureRequest: assign({
      queuedCaptureRequests({ context, event }) {
        assertEvent(event, 'capture');
        return [...context.queuedCaptureRequests, { options: event.options, requestId: event.requestId }];
      },
    }),
    processQueuedRequests: enqueueActions(({ enqueue, context, self }) => {
      // Process all queued capture requests
      for (const request of context.queuedCaptureRequests) {
        enqueue.sendTo(self, {
          type: 'capture',
          options: request.options,
          requestId: request.requestId,
        });
      }

      // Clear the queue
      enqueue.assign({
        queuedCaptureRequests: [],
      });
    }),
    failQueuedRequests: enqueueActions(({ enqueue, context }) => {
      // Fail all queued requests due to registration timeout
      for (const request of context.queuedCaptureRequests) {
        enqueue.sendTo(context.graphicsRef, {
          type: 'screenshotFailed',
          error: 'Screenshot capability registration timeout',
          requestId: request.requestId,
        });
      }

      // Clear the queue
      enqueue.assign({
        queuedCaptureRequests: [],
        registrationError: 'Registration timeout after 5 seconds',
      });
    }),
  },
  guards: {
    isRegistered: ({ context }) => context.isRegistered,
    hasQueuedRequests: ({ context }) => context.queuedCaptureRequests.length > 0,
  },
}).createMachine({
  id: 'screenshotCapability',
  context: ({ input }) => ({
    graphicsRef: input.graphicsRef,
    gl: undefined,
    scene: undefined,
    camera: undefined,
    queuedCaptureRequests: [],
    isRegistered: false,
    registrationError: undefined,
  }),
  initial: 'waitingForRegistration',
  states: {
    // Waiting for camera registration with timeout
    waitingForRegistration: {
      after: {
        [registrationTimeout]: {
          target: 'registrationFailed',
          actions: 'failQueuedRequests',
        },
      },
      on: {
        registerCapture: [
          {
            guard: 'hasQueuedRequests',
            target: 'registered',
            actions: ['registerWithGraphics', 'processQueuedRequests'],
          },
          {
            target: 'registered',
            actions: 'registerWithGraphics',
          },
        ],
        capture: {
          actions: 'queueCaptureRequest',
        },
      },
    },
    registered: {
      on: {
        capture: {
          target: 'capturing',
        },
        // Allow re-registration when canvas is recreated
        registerCapture: {
          actions: 'registerWithGraphics',
        },
        unregisterCapture: {
          target: 'waitingForRegistration',
          actions: 'unregisterCapture',
        },
      },
    },
    capturing: {
      invoke: {
        id: 'captureScreenshot',
        src: 'captureScreenshot',
        input({ context, event }) {
          assertEvent(event, 'capture');
          return {
            gl: context.gl!,
            scene: context.scene!,
            camera: context.camera!,
            options: event.options,
            requestId: event.requestId,
          };
        },
      },
      on: {
        screenshotCompleted: {
          target: 'registered',
          actions: 'forwardResult',
        },
        screenshotFailed: {
          target: 'registered',
          actions: 'forwardResult',
        },
        capture: {
          actions: 'queueCaptureRequest',
        },
        unregisterCapture: {
          target: 'waitingForRegistration',
          actions: 'unregisterCapture',
        },
      },
    },
    registrationFailed: {
      on: {
        registerCapture: {
          target: 'registered',
          actions: 'registerWithGraphics',
        },
        capture: {
          actions: enqueueActions(({ enqueue, context, event }) => {
            assertEvent(event, 'capture');
            // Immediately fail new capture requests when registration has failed
            enqueue.sendTo(context.graphicsRef, {
              type: 'screenshotFailed',
              error: context.registrationError ?? 'Screenshot capability not available',
              requestId: event.requestId,
            });
          }),
        },
      },
    },
  },
});
