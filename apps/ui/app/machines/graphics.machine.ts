import { assign, assertEvent, setup, sendTo, emit, enqueueActions } from 'xstate';
import type { AnyActorRef } from 'xstate';
import type { GridSizes, ScreenshotOptions, Geometry } from '@taucad/types';

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
  geometryRadius: number;
  sceneRadius: number | undefined;

  // Visibility state
  enableSurfaces: boolean;
  enableLines: boolean;
  enableGizmo: boolean;
  enableGrid: boolean;
  enableAxes: boolean;
  enableMatcap: boolean;

  // Clipping plane state
  isSectionViewActive: boolean;
  availableSectionViews: Array<{
    id: 'xy' | 'xz' | 'yz';
    normal: [number, number, number]; // Vector3 as tuple
    constant: number;
  }>;
  selectedSectionViewId: 'xy' | 'xz' | 'yz' | undefined;
  sectionViewVisualization: {
    stripeColor: string;
    stripeSpacing: number;
    stripeWidth: number;
  };
  sectionViewTranslation: number; // Current translation offset
  sectionViewRotation: [number, number, number]; // Euler rotation as tuple [x, y, z]
  sectionViewDirection: 1 | -1; // Normal direction multiplier
  enableClippingLines: boolean; // Whether to cut lines
  enableClippingMesh: boolean; // Whether to cut meshes

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

  // Geometry data from CAD
  geometries: Geometry[];
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
  | { type: 'setMatcapVisibility'; payload: boolean }
  // Clipping plane events
  | { type: 'setSectionViewActive'; payload: boolean }
  | { type: 'selectSectionView'; payload: 'xy' | 'xz' | 'yz' | undefined }
  | { type: 'setSectionViewTranslation'; payload: number }
  | { type: 'setSectionViewRotation'; payload: [number, number, number] }
  | { type: 'toggleSectionViewDirection' }
  | {
      type: 'setSectionViewVisualization';
      payload: Partial<GraphicsContext['sectionViewVisualization']>;
    }
  | { type: 'setClippingLinesEnabled'; payload: boolean }
  | { type: 'setClippingMeshEnabled'; payload: boolean }
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
  // Geometry updates from CAD
  | { type: 'updateGeometries'; geometries: Geometry[] };

// Emitted events
export type GraphicsEmitted =
  | { type: 'gridUpdated'; sizes: GridSizes }
  | { type: 'screenshotCompleted'; dataUrls: string[]; requestId: string }
  | { type: 'screenshotFailed'; error: string; requestId: string }
  | { type: 'cameraResetCompleted' }
  | { type: 'geometryRadiusCalculated'; radius: number };

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

// Calculate geometry radius from geometries
function calculateGeometryRadius(geometries: Geometry[]): number {
  // This is a placeholder - in reality, this would use Three.js to calculate bounding sphere
  // For now, return a default value
  return geometries.length > 0 ? 100 : 0;
}

/**
 * Graphics Machine
 *
 * Manages all graphics-related state including:
 * - Grid sizing and units
 * - Camera position and controls
 * - Screenshot capabilities
 * - Geometry rendering from CAD
 *
 * State Architecture:
 *
 * operational (parent state)
 *   ├── ready (default state)
 *   └── section-view (modal viewing mode)
 *       ├── pending (waiting for plane selection)
 *       └── active (plane selected, can manipulate)
 *
 * Future modes can be added as siblings to section-view:
 *   ├── measurement (future)
 *   ├── annotation (future)
 *
 * Common events (grid, camera, visibility, screenshots) are handled
 * once at the operational parent level to avoid duplication.
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

    updateGeometries: enqueueActions(({ enqueue, event }) => {
      assertEvent(event, 'updateGeometries');

      const geometryRadius = calculateGeometryRadius(event.geometries);

      enqueue.assign({
        geometries: event.geometries,
        geometryRadius,
      });

      enqueue.emit({
        type: 'geometryRadiusCalculated' as const,
        radius: geometryRadius,
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

    setMatcapVisibility: assign({
      enableMatcap({ event }) {
        assertEvent(event, 'setMatcapVisibility');
        return event.payload;
      },
    }),

    setSectionViewActive: assign({
      isSectionViewActive({ event }) {
        assertEvent(event, 'setSectionViewActive');
        return event.payload;
      },
      // Reset selection when deactivating
      selectedSectionViewId({ event }) {
        assertEvent(event, 'setSectionViewActive');
        return event.payload ? undefined : undefined;
      },
    }),

    selectSectionView: assign({
      selectedSectionViewId({ event }) {
        assertEvent(event, 'selectSectionView');
        return event.payload;
      },
      // Reset translation when changing planes
      sectionViewTranslation({ event }) {
        assertEvent(event, 'selectSectionView');
        return event.payload === undefined ? 0 : 0;
      },
      // Reset rotation when changing planes
      sectionViewRotation({ event }): [number, number, number] {
        assertEvent(event, 'selectSectionView');
        return event.payload === undefined ? [0, 0, 0] : [0, 0, 0];
      },
    }),

    setSectionViewTranslation: assign({
      sectionViewTranslation({ event }) {
        assertEvent(event, 'setSectionViewTranslation');
        return event.payload;
      },
    }),

    setSectionViewRotation: assign({
      sectionViewRotation({ event }) {
        assertEvent(event, 'setSectionViewRotation');
        return event.payload;
      },
    }),

    toggleSectionViewDirection: assign({
      sectionViewDirection({ context }) {
        return context.sectionViewDirection === 1 ? -1 : 1;
      },
      // When flipping direction, negate translation to keep plane at same position
      // Plane equation: normal · point + constant = 0
      // If we negate normal, we must negate constant
      sectionViewTranslation({ context }) {
        return -context.sectionViewTranslation;
      },
    }),

    setSectionViewVisualization: assign({
      sectionViewVisualization({ event, context }) {
        assertEvent(event, 'setSectionViewVisualization');
        return {
          ...context.sectionViewVisualization,
          ...event.payload,
        };
      },
    }),

    setClippingLinesEnabled: assign({
      enableClippingLines({ event }) {
        assertEvent(event, 'setClippingLinesEnabled');
        return event.payload;
      },
    }),

    setClippingMeshEnabled: assign({
      enableClippingMesh({ event }) {
        assertEvent(event, 'setClippingMeshEnabled');
        return event.payload;
      },
    }),
  },
  guards: {
    isActivatingClipping({ event }) {
      assertEvent(event, 'setSectionViewActive');
      return event.payload;
    },
    isDeactivatingSectionView({ event }) {
      assertEvent(event, 'setSectionViewActive');
      return !event.payload;
    },
    isSelectingPlane({ event }) {
      assertEvent(event, 'selectSectionView');
      return event.payload !== undefined;
    },
    isDeselectingPlane({ event }) {
      assertEvent(event, 'selectSectionView');
      return event.payload === undefined;
    },
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
    geometryRadius: 0,
    sceneRadius: undefined,

    // Visibility state
    enableSurfaces: true,
    enableLines: true,
    enableGizmo: true,
    enableGrid: true,
    enableAxes: true,
    enableMatcap: false,

    // Clipping plane state
    isSectionViewActive: false,
    availableSectionViews: [
      { id: 'xy', normal: [0, 0, 1], constant: 0 },
      { id: 'xz', normal: [0, 1, 0], constant: 0 },
      { id: 'yz', normal: [1, 0, 0], constant: 0 },
    ],
    selectedSectionViewId: undefined,
    sectionViewVisualization: {
      stripeColor: '#00ff00',
      stripeSpacing: 10,
      stripeWidth: 1,
    },
    sectionViewTranslation: 0,
    sectionViewRotation: [0, 0, 0],
    sectionViewDirection: -1,
    enableClippingLines: true,
    enableClippingMesh: true,

    // Capabilities
    screenshotCapability: undefined,
    cameraCapability: undefined,

    // State flags
    isScreenshotReady: false,
    isCameraReady: false,

    // Active operations
    activeScreenshotRequest: undefined,

    // Shapes
    geometries: [],
  }),
  initial: 'operational',
  states: {
    operational: {
      initial: 'ready',
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
        cameraResetCompleted: {
          actions: 'completeCameraReset',
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
        setMatcapVisibility: {
          actions: 'setMatcapVisibility',
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

        // Geometry updates
        updateGeometries: {
          actions: 'updateGeometries',
        },
      },
      states: {
        ready: {
          on: {
            setSectionViewActive: {
              guard: 'isActivatingClipping',
              actions: 'setSectionViewActive',
              target: 'section-view.pending',
            },
          },
        },

        'section-view': {
          initial: 'pending',
          states: {
            pending: {
              on: {
                setSectionViewActive: {
                  guard: 'isDeactivatingSectionView',
                  actions: 'setSectionViewActive',
                  target: '#graphics.operational.ready',
                },
                selectSectionView: {
                  guard: 'isSelectingPlane',
                  actions: 'selectSectionView',
                  target: 'active',
                },
                setSectionViewVisualization: {
                  actions: 'setSectionViewVisualization',
                },
                setClippingLinesEnabled: {
                  actions: 'setClippingLinesEnabled',
                },
                setClippingMeshEnabled: {
                  actions: 'setClippingMeshEnabled',
                },
              },
            },

            active: {
              on: {
                setSectionViewActive: {
                  guard: 'isDeactivatingSectionView',
                  actions: 'setSectionViewActive',
                  target: '#graphics.operational.ready',
                },
                selectSectionView: [
                  {
                    guard: 'isDeselectingPlane',
                    actions: 'selectSectionView',
                    target: 'pending',
                  },
                  {
                    actions: 'selectSectionView',
                  },
                ],
                setSectionViewTranslation: {
                  actions: 'setSectionViewTranslation',
                },
                setSectionViewRotation: {
                  actions: 'setSectionViewRotation',
                },
                toggleSectionViewDirection: {
                  actions: 'toggleSectionViewDirection',
                },
                setSectionViewVisualization: {
                  actions: 'setSectionViewVisualization',
                },
                setClippingLinesEnabled: {
                  actions: 'setClippingLinesEnabled',
                },
                setClippingMeshEnabled: {
                  actions: 'setClippingMeshEnabled',
                },
              },
            },
          },
        },
      },
    },
  },
});
