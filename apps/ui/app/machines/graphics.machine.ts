import { assign, assertEvent, setup, sendTo, emit, enqueueActions } from 'xstate';
import type { AnyActorRef } from 'xstate';
import type { GridSizes, ScreenshotOptions } from '~/types/graphics.types.js';
import type { Shape } from '~/types/cad.types.js';

// Context type definition
export type GraphicsContext = {
  // Grid state
  /** The grid size that should be set based on the current camera position and fov */
  gridSizes: GridSizes;
  /** The grid size that is currently being displayed */
  gridSizesComputed: GridSizes;
  /** Whether the grid size should be locked to the computed value */
  isGridSizeLocked: boolean;
  gridUnit: string;
  gridUnitFactor: number;
  gridUnitSystem: 'metric' | 'imperial';

  // Camera state (library-agnostic)
  cameraFovAngle: number; // The FOV set by the user
  cameraFovAngleComputed: number; // The FOV computed from the camera position and fov
  cameraPosition: number;
  currentZoom: number;
  shapeRadius: number;
  sceneRadius: number | undefined;

  // Visibility state
  enableSurfaces: boolean;
  enableLines: boolean;
  enableGizmo: boolean;
  enableGrid: boolean;
  enableAxes: boolean;

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
  | { type: 'setFovAngle'; payload: number }
  | { type: 'resetCamera'; options?: { enableConfiguredAngles?: boolean } }
  | { type: 'cameraResetCompleted' }
  // Visibility events
  | { type: 'setSurfaceVisibility'; payload: boolean }
  | { type: 'setLinesVisibility'; payload: boolean }
  | { type: 'setGizmoVisibility'; payload: boolean }
  | { type: 'setGridVisibility'; payload: boolean }
  | { type: 'setAxesVisibility'; payload: boolean }
  // Controls events
  | { type: 'controlsInteractionStart' }
  | { type: 'controlsChanged'; zoom: number; position: number; fov: number }
  | { type: 'controlsInteractionEnd' }
  // Screenshot events
  | { type: 'takeScreenshot'; options: ScreenshotOptions; requestId: string }
  | {
      type: 'takeCompositeScreenshot';
      options: ScreenshotOptions;
      requestId: string;
    }
  | { type: 'screenshotCompleted'; dataUrls: string[]; requestId: string }
  | { type: 'screenshotFailed'; error: string; requestId: string }
  // Capability registration
  | { type: 'registerScreenshotCapability'; actorRef: AnyActorRef }
  | { type: 'registerCameraCapability'; actorRef: AnyActorRef }
  | { type: 'unregisterScreenshotCapability' }
  | { type: 'unregisterCameraCapability' }
  // Shape updates from CAD
  | { type: 'updateShapes'; shapes: Shape[] };

// Emitted events
export type GraphicsEmitted =
  | { type: 'gridUpdated'; sizes: GridSizes }
  | { type: 'screenshotCompleted'; dataUrls: string[]; requestId: string }
  | { type: 'screenshotFailed'; error: string; requestId: string }
  | { type: 'cameraResetCompleted' }
  | { type: 'shapeRadiusCalculated'; radius: number };

// Input type
export type GraphicsInput = {
  defaultCameraFovAngle?: number;
};

/**
 * Grid size calculation logic with unit system handling
 *
 * Metric Units (mm, cm, m, etc.):
 * - Visual grid spacing is ALWAYS the same baseline calculation regardless of unit
 * - Returned GridSizes values are in base metric units (no factor applied)
 * - Display layer must apply gridUnitFactor when showing grid labels to user
 * - Grid recalculation only happens on camera/controls changes, not unit factor changes
 *
 * Imperial Units (inches, feet):
 * - Visual grid spacing changes when switching from metric to imperial (applies /25.4 conversion)
 * - Fixed scaling factors applied to produce reasonable grid sizes
 * - Inches (factor=1): scaled by 0.5 to produce reasonable inch values
 * - Feet (factor=12): scaled by 0.6/factor to produce reasonable foot values
 * - Returned GridSizes values include all conversions and factors applied
 */
// Grid size calculation logic (ported from React)
function calculateGridSizes(
  cameraPosition: number,
  cameraFov: number,
  gridUnitSystem: 'metric' | 'imperial',
  gridUnitFactor: number,
): GridSizes {
  const visibleWidthAtDistance = 2 * cameraPosition * Math.tan((cameraFov * Math.PI) / 360);
  let baseGridSize = visibleWidthAtDistance / 5; // BaseGridSizeCoefficient

  let scalingFactor;
  if (gridUnitSystem === 'imperial') {
    // For imperial: convert to imperial units AND scale appropriately
    baseGridSize /= gridUnitFactor;
    scalingFactor = gridUnitFactor;
  } else {
    // For metric: calculate grid spacing normally, then apply factor only to display values
    scalingFactor = 1;
  }

  // For metric: calculate grid spacing normally, then apply factor only to display values
  const exponent = Math.floor(Math.log10(baseGridSize));
  const mantissa = baseGridSize / 10 ** exponent;
  const largeSize = mantissa < Math.sqrt(10) ? 10 ** exponent : 5 * 10 ** exponent;
  const safeSize = Math.max(1e-6, largeSize) * scalingFactor;
  const smallSize = safeSize / 10;

  // For metric: visual spacing stays the same, factor is just metadata for display
  return {
    smallSize,
    largeSize: safeSize,
    effectiveSize: baseGridSize,
    baseSize: cameraPosition,
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

    setGridUnit: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'setGridUnit');

      const isSystemChange = context.gridUnitSystem !== event.payload.system;
      const isImperialFactorChange =
        event.payload.system === 'imperial' && context.gridUnitFactor !== event.payload.factor;

      enqueue.assign({
        gridUnit: event.payload.unit,
        gridUnitFactor: event.payload.factor,
        gridUnitSystem: event.payload.system,
      });

      // Only recalculate grid spacing when:
      // 1. Switching between metric/imperial systems (visual spacing changes)
      // 2. Changing factor in imperial units (affects visual spacing)
      // For metric units, factor changes only affect display numbers, not visual spacing
      if (isSystemChange || isImperialFactorChange) {
        const newGridSizes = calculateGridSizes(
          context.cameraPosition,
          context.cameraFovAngleComputed,
          event.payload.system,
          event.payload.factor,
        );

        enqueue.sendTo(({ self }) => self, {
          type: 'updateGridSize',
          payload: newGridSizes,
        });
      }
    }),

    setFovAngle: assign({
      cameraFovAngle({ event }) {
        assertEvent(event, 'setFovAngle');
        return event.payload;
      },
    }),

    handleControlsChange: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'controlsChanged');

      enqueue.assign({
        currentZoom: event.zoom,
        cameraPosition: event.position,
        cameraFovAngleComputed: event.fov,
      });

      // Recalculate grid sizes based on new controls state
      const newGridSizes = calculateGridSizes(
        event.position,
        event.fov,
        context.gridUnitSystem,
        context.gridUnitFactor,
      );

      enqueue.sendTo(({ self }) => self, {
        type: 'updateGridSize',
        payload: newGridSizes,
      });
    }),

    handleControlsInteractionStart() {
      // Could add loading state or disable certain actions during interaction
    },

    handleControlsInteractionEnd() {
      // Could emit completion events or re-enable actions after interaction
    },

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
        const isComposite = 'composite' in context.activeScreenshotRequest.options;

        enqueue.sendTo(event.actorRef, {
          type: isComposite ? 'captureComposite' : 'capture',
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

    requestCompositeScreenshot: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'takeCompositeScreenshot');

      enqueue.assign({
        activeScreenshotRequest: {
          requestId: event.requestId,
          options: event.options,
        },
      });

      // Only send to capability if it's registered, otherwise it will be sent when capability registers
      if (context.screenshotCapability) {
        enqueue.sendTo(context.screenshotCapability, {
          type: 'captureComposite',
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
        dataUrls: event.dataUrls,
        requestId: event.requestId,
      });
    }),

    failScreenshot: enqueueActions(({ enqueue, event }) => {
      assertEvent(event, 'screenshotFailed');

      enqueue.assign({
        activeScreenshotRequest: undefined,
      });

      enqueue.emit({
        type: 'screenshotFailed' as const,
        error: event.error,
        requestId: event.requestId,
      });
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

    setSurfaceVisibility: assign({
      enableSurfaces({ event }) {
        assertEvent(event, 'setSurfaceVisibility');
        return event.payload;
      },
    }),

    setLinesVisibility: assign({
      enableLines({ event }) {
        assertEvent(event, 'setLinesVisibility');
        return event.payload;
      },
    }),

    setGizmoVisibility: assign({
      enableGizmo({ event }) {
        assertEvent(event, 'setGizmoVisibility');
        return event.payload;
      },
    }),

    setGridVisibility: assign({
      enableGrid({ event }) {
        assertEvent(event, 'setGridVisibility');
        return event.payload;
      },
    }),

    setAxesVisibility: assign({
      enableAxes({ event }) {
        assertEvent(event, 'setAxesVisibility');
        return event.payload;
      },
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
    cameraFovAngle: input.defaultCameraFovAngle ?? 60,
    cameraFovAngleComputed: 75,
    cameraPosition: 1000,
    currentZoom: 1,
    shapeRadius: 0,
    sceneRadius: undefined,

    // Visibility state
    enableSurfaces: true,
    enableLines: true,
    enableGizmo: true,
    enableGrid: true,
    enableAxes: true,

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
        setFovAngle: {
          actions: 'setFovAngle',
        },
        resetCamera: {
          actions: 'requestCameraReset',
        },

        // Visibility events
        setSurfaceVisibility: {
          actions: 'setSurfaceVisibility',
        },
        setLinesVisibility: {
          actions: 'setLinesVisibility',
        },
        setGizmoVisibility: {
          actions: 'setGizmoVisibility',
        },
        setGridVisibility: {
          actions: 'setGridVisibility',
        },
        setAxesVisibility: {
          actions: 'setAxesVisibility',
        },

        // Controls events
        controlsInteractionStart: {
          actions: 'handleControlsInteractionStart',
        },
        controlsChanged: {
          actions: 'handleControlsChange',
        },
        controlsInteractionEnd: {
          actions: 'handleControlsInteractionEnd',
        },

        // Screenshot events
        takeScreenshot: {
          actions: 'requestScreenshot',
        },
        takeCompositeScreenshot: {
          actions: 'requestCompositeScreenshot',
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
      },
    },
  },
});
