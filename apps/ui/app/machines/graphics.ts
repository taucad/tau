import { assign, assertEvent, setup, sendTo, emit, enqueueActions } from 'xstate';
import type { AnyActorRef } from 'xstate';
import type { GridSizes } from '~/components/geometry/graphics/three/grid.js';
import type { ScreenshotOptions } from '~/components/geometry/graphics/three/screenshot.js';
import type { Shape } from '~/types/cad.js';

// Context type definition
export type GraphicsContext = {
  // Grid state
  gridSizes: GridSizes;
  gridSizesComputed: GridSizes;
  isGridSizeLocked: boolean;
  gridUnit: string;
  gridUnitFactor: number;
  gridUnitSystem: 'metric' | 'imperial';

  // Camera state
  cameraAngle: number;
  cameraPosition: number;
  cameraFov: number;
  currentZoom: number;
  shapeRadius: number;
  sceneRadius: number | undefined;

  // Capability registrations
  screenshotCapability?: AnyActorRef;
  cameraCapability?: AnyActorRef;

  // State flags
  isScreenshotReady: boolean;
  isCameraReady: boolean;

  // Active operations
  activeScreenshotRequest?: {
    requestId: string;
    options: ScreenshotOptions;
  };

  // Shape data from CAD
  shapes: Shape[];
};

// Event types
export type GraphicsEvent =
  // Grid events
  | { type: 'updateGridSize'; payload: GridSizes }
  | { type: 'setGridSizeLocked'; payload: boolean }
  | { type: 'setGridUnit'; payload: { unit: string; factor: number; system: 'metric' | 'imperial' } }
  // Camera events
  | { type: 'setCameraAngle'; payload: number }
  | { type: 'updateCameraState'; position: number; fov: number; zoom: number }
  | { type: 'resetCamera'; options?: { withConfiguredAngles?: boolean } }
  | { type: 'cameraResetCompleted' }
  // Screenshot events
  | { type: 'takeScreenshot'; options: ScreenshotOptions; requestId: string }
  | { type: 'screenshotCompleted'; dataUrl: string; requestId: string }
  | { type: 'screenshotFailed'; error: string; requestId: string }
  // Capability registration
  | { type: 'registerScreenshotCapability'; actorRef: AnyActorRef }
  | { type: 'registerCameraCapability'; actorRef: AnyActorRef }
  | { type: 'unregisterScreenshotCapability' }
  | { type: 'unregisterCameraCapability' }
  // Shape updates from CAD
  | { type: 'updateShapes'; shapes: Shape[] }
  // Frame tracking
  | { type: 'frameRendered'; timestamp: number };

// Emitted events
export type GraphicsEmitted =
  | { type: 'gridUpdated'; sizes: GridSizes }
  | { type: 'screenshotCompleted'; dataUrl: string; requestId: string }
  | { type: 'cameraResetCompleted' }
  | { type: 'shapeRadiusCalculated'; radius: number };

// Input type
export type GraphicsInput = {
  defaultCameraAngle?: number;
};

// Grid size calculation logic (ported from React)
function calculateGridSizes(
  cameraPosition: number,
  cameraFov: number,
  currentZoom: number,
  gridUnitSystem: 'metric' | 'imperial',
): GridSizes {
  const visibleWidthAtDistance = 2 * cameraPosition * Math.tan((cameraFov * Math.PI) / 360);

  let baseGridSize = visibleWidthAtDistance / 5; // BaseGridSizeCoefficient

  if (gridUnitSystem === 'imperial') {
    baseGridSize /= 25.4; // MetricToImperial conversion
  }

  const exponent = Math.floor(Math.log10(baseGridSize));
  const mantissa = baseGridSize / 10 ** exponent;

  const largeSize = mantissa < Math.sqrt(10) ? 10 ** exponent : 5 * 10 ** exponent;

  const safeSize = Math.max(1, largeSize);
  const smallSize = safeSize / 10;

  return {
    smallSize,
    largeSize: safeSize,
    effectiveSize: baseGridSize,
    baseSize: cameraPosition,
    zoomFactor: 1 / currentZoom,
    fov: cameraFov,
  };
}

// Calculate shape radius from shapes
function calculateShapeRadius(shapes: Shape[]): number {
  // This is a placeholder - in reality, this would use Three.js to calculate bounding sphere
  // For now, return a default value
  return shapes.length > 0 ? 100 : 0;
}

/**
 * Graphics Machine
 *
 * Manages all graphics-related state including:
 * - Grid sizing and units
 * - Camera position and controls
 * - Screenshot capabilities
 * - Shape rendering from CAD
 */
export const graphicsMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as GraphicsContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as GraphicsEvent,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as GraphicsInput,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as GraphicsEmitted,
  },
  actions: {
    updateGridSize: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'updateGridSize');

      if (context.isGridSizeLocked) {
        enqueue.assign({
          gridSizesComputed: event.payload,
        });
      } else {
        enqueue.assign({
          gridSizes: event.payload,
          gridSizesComputed: event.payload,
        });
        enqueue.emit({
          type: 'gridUpdated' as const,
          sizes: event.payload,
        });
      }
    }),

    setGridSizeLocked: assign({
      gridSizes: ({ context }) => context.gridSizesComputed,
      isGridSizeLocked({ event }) {
        assertEvent(event, 'setGridSizeLocked');
        return event.payload;
      },
    }),

    setGridUnit: assign(({ event }) => {
      assertEvent(event, 'setGridUnit');
      return {
        gridUnit: event.payload.unit,
        gridUnitFactor: event.payload.factor,
        gridUnitSystem: event.payload.system,
      };
    }),

    setCameraAngle: assign({
      cameraAngle({ event }) {
        assertEvent(event, 'setCameraAngle');
        return event.payload;
      },
    }),

    updateCameraState: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'updateCameraState');

      enqueue.assign({
        cameraPosition: event.position,
        cameraFov: event.fov,
        currentZoom: event.zoom,
      });

      // Recalculate grid sizes based on new camera state
      const newGridSizes = calculateGridSizes(event.position, event.fov, event.zoom, context.gridUnitSystem);

      enqueue.sendTo(({ self }) => self, {
        type: 'updateGridSize',
        payload: newGridSizes,
      });
    }),

    updateShapes: enqueueActions(({ enqueue, event }) => {
      assertEvent(event, 'updateShapes');

      const shapeRadius = calculateShapeRadius(event.shapes);

      enqueue.assign({
        shapes: event.shapes,
        shapeRadius,
      });

      enqueue.emit({
        type: 'shapeRadiusCalculated' as const,
        radius: shapeRadius,
      });
    }),

    registerScreenshotCapability: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'registerScreenshotCapability');

      enqueue.assign({
        screenshotCapability: event.actorRef,
        isScreenshotReady: true,
      });

      // If there's a pending screenshot request, send it now that capability is registered
      if (context.activeScreenshotRequest) {
        enqueue.sendTo(event.actorRef, {
          type: 'capture',
          options: context.activeScreenshotRequest.options,
          requestId: context.activeScreenshotRequest.requestId,
        });
      }
    }),

    unregisterScreenshotCapability: assign({
      screenshotCapability: undefined,
      isScreenshotReady: false,
    }),

    registerCameraCapability: assign({
      cameraCapability({ event }) {
        assertEvent(event, 'registerCameraCapability');
        return event.actorRef;
      },
      isCameraReady: true,
    }),

    unregisterCameraCapability: assign({
      cameraCapability: undefined,
      isCameraReady: false,
    }),

    requestScreenshot: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'takeScreenshot');

      enqueue.assign({
        activeScreenshotRequest: {
          requestId: event.requestId,
          options: event.options,
        },
      });

      // Only send to capability if it's registered, otherwise it will be sent when capability registers
      if (context.screenshotCapability) {
        enqueue.sendTo(context.screenshotCapability, {
          type: 'capture',
          options: event.options,
          requestId: event.requestId,
        });
      }
    }),

    completeScreenshot: enqueueActions(({ enqueue, event }) => {
      assertEvent(event, 'screenshotCompleted');

      enqueue.assign({
        activeScreenshotRequest: undefined,
      });

      enqueue.emit({
        type: 'screenshotCompleted' as const,
        dataUrl: event.dataUrl,
        requestId: event.requestId,
      });
    }),

    failScreenshot: assign({
      activeScreenshotRequest: undefined,
    }),

    requestCameraReset: sendTo(
      ({ context }) => context.cameraCapability!,
      ({ event }) => {
        assertEvent(event, 'resetCamera');
        return {
          type: 'reset',
          options: event.options,
        };
      },
    ),

    completeCameraReset: emit({
      type: 'cameraResetCompleted' as const,
    }),
  },
}).createMachine({
  id: 'graphics',
  context: ({ input }) => ({
    // Grid state
    gridSizes: { smallSize: 1, largeSize: 10 },
    gridSizesComputed: { smallSize: 1, largeSize: 10 },
    isGridSizeLocked: false,
    gridUnit: 'mm',
    gridUnitFactor: 1,
    gridUnitSystem: 'metric' as const,

    // Camera state
    cameraAngle: input.defaultCameraAngle ?? 60,
    cameraPosition: 1000,
    cameraFov: 75,
    currentZoom: 1,
    shapeRadius: 0,
    sceneRadius: undefined,

    // Capabilities
    screenshotCapability: undefined,
    cameraCapability: undefined,

    // State flags
    isScreenshotReady: false,
    isCameraReady: false,

    // Active operations
    activeScreenshotRequest: undefined,

    // Shapes
    shapes: [],
  }),
  initial: 'ready',
  states: {
    ready: {
      on: {
        // Grid events
        updateGridSize: {
          actions: 'updateGridSize',
        },
        setGridSizeLocked: {
          actions: 'setGridSizeLocked',
        },
        setGridUnit: {
          actions: 'setGridUnit',
        },

        // Camera events
        setCameraAngle: {
          actions: 'setCameraAngle',
        },
        updateCameraState: {
          actions: 'updateCameraState',
        },
        resetCamera: {
          // Target: 'resettingCamera',
          actions: 'requestCameraReset',
        },

        // Screenshot events
        takeScreenshot: {
          // Target: 'takingScreenshot',
          actions: 'requestScreenshot',
        },
        screenshotCompleted: {
          actions: 'completeScreenshot',
        },
        screenshotFailed: {
          actions: 'failScreenshot',
        },

        // Capability registration
        registerScreenshotCapability: {
          actions: 'registerScreenshotCapability',
        },
        unregisterScreenshotCapability: {
          actions: 'unregisterScreenshotCapability',
        },
        registerCameraCapability: {
          actions: 'registerCameraCapability',
        },
        unregisterCameraCapability: {
          actions: 'unregisterCameraCapability',
        },

        // Shape updates
        updateShapes: {
          actions: 'updateShapes',
        },

        // Frame tracking (no action needed, just for tracking)
        frameRendered: {},
      },
    },
  },
});
