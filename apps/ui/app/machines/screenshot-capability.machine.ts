import { setup, sendTo, fromCallback, assertEvent, enqueueActions, assign } from 'xstate';
import type { AnyActorRef } from 'xstate';
import * as THREE from 'three';
import type { ScreenshotOptions, CameraAngle, CompositeScreenshotOptions } from '#types/graphics.types.js';

// Context type
type ScreenshotCapabilityContext = {
  graphicsRef: AnyActorRef;
  gl?: THREE.WebGLRenderer;
  scene?: THREE.Scene;
  camera?: THREE.Camera;
  queuedCaptureRequests: Array<{ options?: ScreenshotOptions; requestId: string; isComposite?: boolean }>;
  isRegistered: boolean;
  registrationError?: string;
};

// Event types
type ScreenshotCapabilityEvent =
  | { type: 'registerCapture'; gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera }
  | { type: 'unregisterCapture' }
  | { type: 'capture'; options?: ScreenshotOptions; requestId: string }
  | {
      type: 'captureComposite';
      options?: ScreenshotOptions;
      requestId: string;
    }
  | { type: 'screenshotCompleted'; dataUrls: string[]; requestId: string }
  | { type: 'screenshotFailed'; error: string; requestId: string }
  | { type: 'registrationTimeout' };

// Input type
type ScreenshotCapabilityInput = {
  graphicsRef: AnyActorRef;
};

// Registration timeout in milliseconds
const registrationTimeout = 5000;

// Default composite options
const defaultCompositeOptions = {
  enabled: true,
  preferredRatio: { columns: 3, rows: 2 },
  showLabels: true,
  padding: 12,
  labelHeight: 24,
  backgroundColor: 'transparent',
  dividerColor: '#666666',
  dividerWidth: 1,
} satisfies CompositeScreenshotOptions;

/**
 * Calculate optimal grid layout for given number of items
 */
function calculateOptimalGrid(
  itemCount: number,
  preferredRatio: { columns: number; rows: number } = defaultCompositeOptions.preferredRatio,
): { columns: number; rows: number } {
  if (itemCount <= 0) {
    return { columns: 1, rows: 1 };
  }

  if (itemCount === 1) {
    return { columns: 1, rows: 1 };
  }

  const targetRatio = preferredRatio.columns / preferredRatio.rows;

  // Find the best grid layout that can fit all items
  let bestColumns = 1;
  let bestRows = itemCount;
  let bestRatioDiff = Math.abs(bestColumns / bestRows - targetRatio);

  for (let columns = 1; columns <= itemCount; columns++) {
    const rows = Math.ceil(itemCount / columns);
    const ratio = columns / rows;
    const ratioDiff = Math.abs(ratio - targetRatio);

    if (ratioDiff < bestRatioDiff) {
      bestColumns = columns;
      bestRows = rows;
      bestRatioDiff = ratioDiff;
    }
  }

  return { columns: bestColumns, rows: bestRows };
}

/**
 * Create composite image from multiple screenshots
 */
async function createCompositeImage(
  screenshots: Array<{ label: string; dataUrl: string }>,
  options: CompositeScreenshotOptions = defaultCompositeOptions,
): Promise<string> {
  const mergedOptions = {
    ...defaultCompositeOptions,
    ...options,
  };

  const { padding, labelHeight, showLabels, backgroundColor, dividerColor, dividerWidth, preferredRatio } =
    mergedOptions;

  // Create a canvas for the composite image
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not get canvas context');
  }

  // Load all images first
  const images = await Promise.all(
    screenshots.map(async (screenshot) => {
      return new Promise<{ label: string; image: HTMLImageElement }>((resolve, reject) => {
        const img = new globalThis.Image();
        img.addEventListener('load', () => {
          resolve({ label: screenshot.label, image: img });
        });
        img.addEventListener('error', reject);
        img.src = screenshot.dataUrl;
      });
    }),
  );

  if (images.length === 0) {
    throw new Error('No images to create composite image from');
  }

  // Get original dimensions
  const originalWidth = images[0]!.image.width;
  const originalHeight = images[0]!.image.height;

  // Scale down images if they're too large (optimize for composite view)
  const maxImageSize = 600;
  const scale = Math.min(1, maxImageSize / Math.max(originalWidth, originalHeight));
  const imageWidth = Math.round(originalWidth * scale);
  const imageHeight = Math.round(originalHeight * scale);

  // Calculate optimal grid layout
  const { columns, rows } = calculateOptimalGrid(images.length, preferredRatio);

  // Calculate layout dimensions
  const effectiveLabelHeight = showLabels ? labelHeight : 0;
  const effectivePadding = Math.max(padding, Math.round(imageWidth * 0.02));

  canvas.width = columns * imageWidth + (columns + 1) * effectivePadding;
  canvas.height = rows * (imageHeight + effectiveLabelHeight) + (rows + 1) * effectivePadding;

  // Optimize canvas for performance
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'low';

  // Set background color (only if not transparent)
  const isTransparent = backgroundColor === 'transparent';
  if (!isTransparent) {
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Set text properties (responsive font size)
  if (showLabels) {
    const fontSize = Math.max(12, Math.round(imageHeight * 0.06));
    context.fillStyle = '#000000';
    context.font = `bold ${fontSize}px Arial`;
    context.textAlign = 'center';
  }

  // Draw images and labels in optimal grid layout
  for (const [index, item] of images.entries()) {
    const col = index % columns;
    const row = Math.floor(index / columns);

    const x = effectivePadding + col * (imageWidth + effectivePadding);
    const y = effectivePadding + row * (imageHeight + effectiveLabelHeight + effectivePadding);

    // Draw the scaled image
    context.drawImage(item.image, x, y, imageWidth, imageHeight);

    // Draw the label below the image
    if (showLabels) {
      const labelX = x + imageWidth / 2;
      const labelY = y + imageHeight + effectiveLabelHeight - 5;
      context.fillText(item.label.toUpperCase(), labelX, labelY);
    }
  }

  // Draw divider lines based solely on showDividers setting
  if (dividerColor !== 'transparent') {
    context.strokeStyle = dividerColor;
    context.lineWidth = dividerWidth;

    context.beginPath();
    // Vertical dividers (between columns)
    for (let col = 1; col < columns; col++) {
      const dividerX = effectivePadding + col * (imageWidth + effectivePadding) - effectivePadding / 2;
      context.moveTo(dividerX, effectivePadding);
      context.lineTo(dividerX, canvas.height - effectivePadding);
    }

    // Horizontal dividers (between rows)
    for (let row = 1; row < rows; row++) {
      const dividerY =
        effectivePadding + row * (imageHeight + effectiveLabelHeight + effectivePadding) - effectivePadding / 2;
      context.moveTo(effectivePadding, dividerY);
      context.lineTo(canvas.width - effectivePadding, dividerY);
    }

    context.stroke();
  }

  // Convert canvas to blob with optimized settings for speed
  const outputFormat = 'image/webp';
  const outputQuality = 0.75;

  const blob = await new Promise<Blob | undefined>((resolve) => {
    canvas.toBlob(
      (result) => {
        resolve(result ?? undefined);
      },
      outputFormat,
      outputQuality,
    );
  });

  if (!blob) {
    throw new Error('Failed to create blob from composite canvas');
  }

  // Convert blob to data URL
  const compositeDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      resolve(reader.result as string);
    });
    reader.addEventListener('error', reject);
    reader.readAsDataURL(blob);
  });

  return compositeDataUrl;
}

/**
 * Core screenshot capture logic shared between regular and composite captures
 */
async function captureScreenshots(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options?: ScreenshotOptions,
): Promise<string[]> {
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
  if (config.cameraAngles.length === 0) {
    config.cameraAngles = defaultOptions.cameraAngles;
  }

  const originalHeight = gl.domElement.height;

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

  // Create a single temporary canvas for all screenshots
  const screenshotCanvas = document.createElement('canvas');
  screenshotCanvas.width = width;
  screenshotCanvas.height = height;

  // Create a single temporary WebGL renderer for all screenshots
  const screenshotRenderer = new THREE.WebGLRenderer({
    canvas: screenshotCanvas,
    alpha: true,
    antialias: true,
    logarithmicDepthBuffer: true,
  });

  try {
    // Copy settings from the main renderer
    screenshotRenderer.setSize(width, height, false);

    // For composite screenshots, use 1:1 pixel ratio to respect maxResolution
    // For high-quality single screenshots, we could use the original pixel ratio
    const useHighDpi = config.cameraAngles.length === 1;
    const pixelRatio = useHighDpi ? gl.getPixelRatio() : 1;
    screenshotRenderer.setPixelRatio(pixelRatio);

    screenshotRenderer.outputColorSpace = gl.outputColorSpace;
    screenshotRenderer.shadowMap.enabled = gl.shadowMap.enabled;
    screenshotRenderer.shadowMap.type = gl.shadowMap.type;

    const dataUrls: string[] = [];

    // Create a copy of the scene for the screenshot so we don't modify the original
    const screenshotScene = scene.clone();

    // Handle preview mode - hide non-preview objects in the cloned scene
    if (config.output.isPreview) {
      screenshotScene.traverse((object) => {
        if (object.userData['isPreviewOnly']) {
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

    return dataUrls;
  } finally {
    // Cleanup the temporary renderer
    screenshotRenderer.dispose();

    // Additional cleanup to prevent WebGL context accumulation
    screenshotRenderer.forceContextLoss();

    // Remove the canvas from memory
    screenshotCanvas.width = 0;
    screenshotCanvas.height = 0;

    // // Restore all original state
    // gl.setPixelRatio(originalPixelRatio);

    // // Re-render to ensure everything is visible
    // gl.render(scene, camera);
  }
}

/**
 * Screenshot Capability Machine
 *
 * Bridges Three.js screenshot functionality with the graphics machine.
 * Handles registration of screenshot capture function and proxies requests.
 * Queues capture requests until camera is registered with a 5-second timeout.
 * Supports multiple camera angles in a single request for efficient batch operations.
 * Supports composite image creation for multi-angle screenshots.
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
          const dataUrls = await captureScreenshots(gl, scene, camera, options);
          sendBack({ type: 'screenshotCompleted', dataUrls, requestId });
        } catch (error: unknown) {
          sendBack({
            type: 'screenshotFailed',
            error: error instanceof Error ? error.message : 'Screenshot failed',
            requestId,
          });
        }
      })();
    }),

    captureCompositeScreenshot: fromCallback<
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
          // First, capture individual screenshots using the shared logic
          const dataUrls = await captureScreenshots(gl, scene, camera, options);

          // Create composite image from individual screenshots
          const compositeOptions = options?.composite ?? defaultCompositeOptions;

          // Create screenshot data with labels based on camera angles
          const screenshots = dataUrls.map((dataUrl, index) => {
            const cameraAngle = options?.cameraAngles?.[index];
            const label = cameraAngle?.label ?? `φ${cameraAngle?.phi}° θ${cameraAngle?.theta}°`;

            return { label, dataUrl };
          });

          const compositeDataUrl = await createCompositeImage(screenshots, compositeOptions);

          sendBack({ type: 'screenshotCompleted', dataUrls: [compositeDataUrl], requestId });
        } catch (error: unknown) {
          sendBack({
            type: 'screenshotFailed',
            error: error instanceof Error ? error.message : 'Composite screenshot failed',
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
        assertEvent(event, ['capture', 'captureComposite']);
        const isComposite = event.type === 'captureComposite';
        return [...context.queuedCaptureRequests, { options: event.options, requestId: event.requestId, isComposite }];
      },
    }),
    processQueuedRequests: enqueueActions(({ enqueue, context, self }) => {
      // Process all queued capture requests
      for (const request of context.queuedCaptureRequests) {
        const eventType = request.isComposite ? 'captureComposite' : 'capture';
        enqueue.sendTo(self, {
          type: eventType,
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
        captureComposite: {
          actions: 'queueCaptureRequest',
        },
      },
    },
    registered: {
      on: {
        capture: {
          target: 'capturing',
        },
        captureComposite: {
          target: 'capturingComposite',
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
        captureComposite: {
          actions: 'queueCaptureRequest',
        },
        unregisterCapture: {
          target: 'waitingForRegistration',
          actions: 'unregisterCapture',
        },
      },
    },
    capturingComposite: {
      invoke: {
        id: 'captureCompositeScreenshot',
        src: 'captureCompositeScreenshot',
        input({ context, event }) {
          assertEvent(event, 'captureComposite');
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
        captureComposite: {
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
        captureComposite: {
          actions: enqueueActions(({ enqueue, context, event }) => {
            assertEvent(event, 'captureComposite');
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
