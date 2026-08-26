import { assign, assertEvent, setup, emit, enqueueActions, fromPromise, sendTo } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { GeometryComponentManifest, GridSizes, Geometry } from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import type { LengthSymbol, UnitSystem } from '@taucad/units';
import { standardInternationalBaseUnits } from '@taucad/units/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import type {
  EnvironmentPreset,
  GraphicsBackendPreference,
  PinnedMeasurement,
  ResolvedGraphicsBackend,
} from '#constants/editor.constants.js';
import {
  probeWebGpuSupport,
  resolveGraphicsBackendPreference,
} from '#components/geometry/graphics/graphics-backend.js';
import { deriveModelInteractionUnitId, modelInteractionMachine } from '#machines/model-interaction.machine.js';
import type { ModelInteractionSource, ViewerHoverSuppressionReason } from '#machines/model-interaction.machine.js';
import { buildGltfComponentManifest } from '#components/geometry/graphics/metadata/gltf-component-manifest.js';

export type ModelInteractionRef = ActorRefFrom<typeof modelInteractionMachine>;

export type ModelPointerClickSuppressionReason = 'measureTool';

const addSuppressionReason = <T extends string>(reasons: readonly T[], reason: T): T[] =>
  reasons.includes(reason) ? [...reasons] : [...reasons, reason];

const removeSuppressionReason = <T extends string>(reasons: readonly T[], reason: T): T[] =>
  reasons.filter((existingReason) => existingReason !== reason);

// Context type definition
export type GraphicsContext = {
  /**
   * The units that are currently being used for the graphics.
   */
  graphicsUnits: {
    length: {
      symbol: LengthSymbol;
      factor: number;
      system: UnitSystem;
    };
  };
  /**
   * The units that are currently being used for the CAD system.
   */
  cadUnits: {
    length: {
      symbol: LengthSymbol;
      factor: number;
    };
  };
  /**
   * Relative units for display (computed from graphicsUnits / cadUnits)
   * This represents the conversion factor from CAD coordinate space to display units
   */
  units: {
    length: {
      symbol: LengthSymbol;
      factor: number;
      system: UnitSystem;
    };
  };

  // Grid state
  /** The grid size that should be set based on the current camera position and fov */
  gridSizes: GridSizes;
  /** The grid size that is currently being displayed */
  gridSizesComputed: GridSizes;
  /** Whether the grid size should be locked to the computed value */
  isGridSizeLocked: boolean;

  /** Immutable seed used only when the provider constructs its camera actor. */
  initialCameraFovAngle: number;
  /** Projection-neutral visible vertical span supplied by the active renderer. */
  cameraVisibleSpan: number;
  geometryRadius: number;
  sceneRadius: number | undefined;

  // Visibility state
  enableSurfaces: boolean;
  enableLines: boolean;
  enableGizmo: boolean;
  enableGrid: boolean;
  enableAxes: boolean;
  enableMatcap: boolean;
  enablePostProcessing: boolean;
  upDirection: 'x' | 'y' | 'z';
  environmentPreset: EnvironmentPreset;

  /** User preference (`auto` uses runtime GPU probe). */
  graphicsBackendPreference: GraphicsBackendPreference;
  /** Probe result cached after startup (invoked probe). */
  webGpuAvailable: boolean;
  /** Active rendering backend consumed by `@react-three/fiber`. */
  resolvedGraphicsBackend: ResolvedGraphicsBackend;

  // Clipping plane state
  isSectionViewActive: boolean;
  availableSectionViews: Array<{
    id: 'xy' | 'xz' | 'yz';
    normal: [number, number, number]; // Vector3 as tuple
    constant: number;
  }>;
  selectedSectionViewId: 'xy' | 'xz' | 'yz' | undefined;
  /** Display naming for planes */
  planeName: 'cartesian' | 'face';
  /** Currently hovered section view selector id (including inverse faces) */
  hoveredSectionViewId?: 'xy' | 'xz' | 'yz' | 'yx' | 'zx' | 'zy';
  sectionViewVisualization: {
    stripeColor: string;
    stripeSpacing: number;
    stripeWidth: number;
  };
  sectionViewTranslation: number; // Current translation offset
  sectionViewRotation: [number, number, number]; // Euler rotation as tuple [x, y, z]
  sectionViewDirection: 1 | -1; // Normal direction multiplier
  /** World-space pivot point that the clipping plane passes through */
  sectionViewPivot: [number, number, number];
  enableClippingLines: boolean; // Whether to cut lines
  enableClippingMesh: boolean; // Whether to cut meshes

  // Measure state
  isMeasureActive: boolean;
  measurements: Array<{
    id: string;
    startPoint: [number, number, number];
    endPoint: [number, number, number];
    distance: number;
    name?: string;
    isPinned?: boolean;
  }>;
  currentMeasurementStart: [number, number, number] | undefined;
  measureSnapDistance: number; // Pixels
  hoveredMeasurementId?: string;

  // State flags
  cameraInteracting: boolean;
  cameraInteractionHadMovement: boolean;
  suppressNextModelPointerClick: boolean;
  modelPointerClickSuppressionReasons: ModelPointerClickSuppressionReason[];
  viewerHoverSuppressionReasons: ViewerHoverSuppressionReason[];
  /** Bumps when geometry or component display changes can invalidate renderer-side picking caches. */
  pickableMeshesVersion: number;
  modelInteractionRef: ModelInteractionRef;
  ownsModelInteractionRef: boolean;
  modelInteractionUnitId?: string;

  // Geometry data from CAD
  geometry: Geometry | undefined;
  /** Deterministic key derived from the geometry content hash. Used for skip-when-unchanged optimizations. */
  geometryKey: string;
};

// Event types
export type GraphicsEvent =
  // Grid events
  | { type: 'updateGridSize'; payload: GridSizes }
  | { type: 'setGridSizeLocked'; payload: boolean }
  | { type: 'setGridUnit'; payload: { unit: LengthSymbol } }
  // Camera events
  | { type: 'resetCamera' }
  | { type: 'cameraViewChanged'; verticalSpan: number }
  // Visibility events
  | { type: 'setSurfaceVisibility'; payload: boolean }
  | { type: 'setLinesVisibility'; payload: boolean }
  | { type: 'setGizmoVisibility'; payload: boolean }
  | { type: 'setGridVisibility'; payload: boolean }
  | { type: 'setAxesVisibility'; payload: boolean }
  | { type: 'setMatcapVisibility'; payload: boolean }
  | { type: 'setPostProcessingVisibility'; payload: boolean }
  | { type: 'setUpDirection'; payload: 'x' | 'y' | 'z' }
  | { type: 'setEnvironmentPreset'; payload: EnvironmentPreset }
  | { type: 'setGraphicsBackendPreference'; payload: GraphicsBackendPreference }
  // Clipping plane events
  | { type: 'setSectionViewActive'; payload: boolean }
  | { type: 'selectSectionView'; payload: 'xy' | 'xz' | 'yz' | undefined }
  | { type: 'setSectionViewTranslation'; payload: number }
  | { type: 'setSectionViewRotation'; payload: [number, number, number] }
  | { type: 'toggleSectionViewDirection' }
  | { type: 'setSectionViewDirection'; payload: 1 | -1 }
  | { type: 'setSectionViewPivot'; payload: [number, number, number] }
  | { type: 'setPlaneName'; payload: 'cartesian' | 'face' }
  | {
      type: 'setHoveredSectionView';
      payload: 'xy' | 'xz' | 'yz' | 'yx' | 'zx' | 'zy' | undefined;
    }
  | {
      type: 'setSectionViewVisualization';
      payload: Partial<GraphicsContext['sectionViewVisualization']>;
    }
  | { type: 'setClippingLinesEnabled'; payload: boolean }
  | { type: 'setClippingMeshEnabled'; payload: boolean }
  // Measure events
  | { type: 'setMeasureActive'; payload: boolean }
  | { type: 'startMeasurement'; payload: [number, number, number] }
  | { type: 'completeMeasurement'; payload: [number, number, number] }
  | { type: 'cancelCurrentMeasurement' }
  | { type: 'clearMeasurement'; payload: string } // Measurement id
  | { type: 'clearAllMeasurements' }
  | { type: 'clearUnpinnedMeasurements' }
  | { type: 'setHoveredMeasurement'; payload: string | undefined }
  | { type: 'setMeasurementName'; id: string; name: string }
  | { type: 'toggleMeasurementPinned'; id: string }
  // Controls events
  | { type: 'controlsInteractionStart' }
  | { type: 'controlsInteractionMoved' }
  | { type: 'controlsInteractionEnd' }
  | {
      type: 'beginViewerModelHoverSuppression';
      reason: ViewerHoverSuppressionReason;
      source?: ModelInteractionSource;
    }
  | {
      type: 'endViewerModelHoverSuppression';
      reason: ViewerHoverSuppressionReason;
      source?: ModelInteractionSource;
    }
  | { type: 'markModelPointerGestureMoved' }
  | { type: 'clearModelPointerClickGuard' }
  // Geometry updates from CAD
  | {
      type: 'updateGeometry';
      geometry: Geometry;
      units: { length: LengthSymbol };
      sourceFile?: string;
    }
  // Model/component interaction events
  | {
      type: 'loadModelComponentManifest';
      unitId: string;
      manifest: GeometryComponentManifest;
      source?: ModelInteractionSource;
    }
  | { type: 'clearModelComponentManifest'; unitId: string; source?: ModelInteractionSource }
  | {
      type: 'setHoveredModelComponent';
      unitId: string;
      componentId: string | undefined;
      source?: ModelInteractionSource;
    }
  | { type: 'toggleModelComponentSelection'; unitId: string; componentId: string; source?: ModelInteractionSource }
  | { type: 'selectModelComponent'; unitId: string; componentId: string; source?: ModelInteractionSource }
  | { type: 'clearModelComponentSelection'; unitId: string; source?: ModelInteractionSource }
  | { type: 'hideModelComponent'; unitId: string; componentId: string; source?: ModelInteractionSource }
  | { type: 'showModelComponent'; unitId: string; componentId: string; source?: ModelInteractionSource }
  | { type: 'showHiddenModelComponents'; unitId: string; source?: ModelInteractionSource }
  | { type: 'isolateModelComponent'; unitId: string; componentId: string; source?: ModelInteractionSource }
  | { type: 'clearModelComponentIsolation'; unitId: string; source?: ModelInteractionSource }
  | {
      type: 'setModelComponentOpacity';
      unitId: string;
      componentId: string;
      opacity: number;
      source?: ModelInteractionSource;
    }
  | { type: 'resetModelComponentOpacities'; unitId: string; source?: ModelInteractionSource }
  | { type: 'focusModelComponent'; unitId: string; componentId: string; source?: ModelInteractionSource }
  | { type: 'clearModelComponentFocus'; unitId: string; source?: ModelInteractionSource }
  // Scene radius update from Three.js bounding sphere (sent by Stage)
  | { type: 'sceneRadiusUpdated'; radius: number };

// Emitted events
export type GraphicsEmitted =
  | { type: 'gridUpdated'; sizes: GridSizes }
  | { type: 'viewResetRequested' }
  | { type: 'geometryRadiusCalculated'; radius: number };

// Input type
export type GraphicsInput = {
  defaultCameraFovAngle?: number;
  measureSnapDistance?: number; // Default 20px
  // Per-view initial settings (from persisted GraphicsViewSettings)
  enableSurfaces?: boolean;
  enableLines?: boolean;
  enableGizmo?: boolean;
  enableGrid?: boolean;
  enableAxes?: boolean;
  enableMatcap?: boolean;
  enablePostProcessing?: boolean;
  upDirection?: 'x' | 'y' | 'z';
  environmentPreset?: EnvironmentPreset;
  /** Saved pinned measurements to restore */
  pinnedMeasurements?: PinnedMeasurement[];
  graphicsBackendPreference?: GraphicsBackendPreference;
  modelInteractionRef?: ModelInteractionRef;
};

type LengthUnitData = {
  unit: string;
  symbol: LengthSymbol;
  factor: number;
  system: UnitSystem;
};

const lengthUnitCache = new Map<LengthSymbol, LengthUnitData>();
const lengthDefinition = standardInternationalBaseUnits.length;

function getLengthUnitData(symbol: LengthSymbol): LengthUnitData {
  const cached = lengthUnitCache.get(symbol);
  if (cached) {
    return cached;
  }

  // Check base unit
  if (symbol === lengthDefinition.symbol) {
    const data: LengthUnitData = {
      unit: lengthDefinition.unit,
      symbol: lengthDefinition.symbol as LengthSymbol,
      factor: 1,
      system: 'si',
    };
    lengthUnitCache.set(symbol, data);
    return data;
  }

  // Search variants
  const variant = lengthDefinition.variants.find((v) => v.symbol === symbol);
  if (!variant) {
    throw new Error(`Unknown length symbol: ${symbol}`);
  }

  const data: LengthUnitData = {
    unit: variant.unit,
    symbol: variant.symbol as LengthSymbol,
    factor: variant.factor,
    system: variant.system,
  };
  lengthUnitCache.set(symbol, data);
  return data;
}

/**
 * Grid size calculation logic with unit system handling
 *
 * Metric Units (mm, cm, m, etc.):
 * - Visual grid spacing is ALWAYS the same baseline calculation regardless of unit
 * - Returned GridSizes values are in base metric units (no factor applied)
 * - Display layer must apply units.length.factor when showing grid labels to user
 * - Grid recalculation only happens on camera/controls changes, not unit factor changes
 *
 * Imperial Units (inches, feet):
 * - Visual grid spacing changes when switching from metric to imperial (applies /25.4 conversion)
 * - Fixed scaling factors applied to produce reasonable grid sizes
 * - Inches (factor=1): scaled by 0.5 to produce reasonable inch values
 * - Feet (factor=12): scaled by 0.6/factor to produce reasonable foot values
 * - Returned GridSizes values include all conversions and factors applied
 */
// Lower values produce coarser spacing on average; raise to fit more cells per view.
const baseGridSizeCoefficient = 3;

// Grid size calculation logic (ported from React)
function calculateGridSizes({
  visibleSpan,
  gridUnitSystem,
  unitFactor,
}: {
  visibleSpan: number;
  gridUnitSystem: 'si' | 'imperial';
  unitFactor: number;
}): GridSizes {
  let baseGridSize = visibleSpan / baseGridSizeCoefficient;

  let scalingFactor;
  if (gridUnitSystem === 'imperial') {
    // For imperial: convert to imperial units AND scale appropriately
    baseGridSize /= unitFactor;
    scalingFactor = unitFactor;
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
    baseSize: visibleSpan,
  };
}

// Clamp a radian angle to the nearest whole degree and return radians
function clampRadiansToNearestDegree(radians: number): number {
  const degrees = (radians * 180) / Math.PI;
  const rounded = Math.round(degrees);
  return (rounded * Math.PI) / 180;
}

// Return the fixed base axis for a given plane id. This axis is used for
// computing the displayed translation from the world-space pivot so that
// rotation does not change the displayed value.
function getBaseAxis(planeId: 'xy' | 'xz' | 'yz' | undefined): [number, number, number] {
  if (planeId === 'xz') {
    return [0, 1, 0];
  }

  if (planeId === 'yz') {
    return [1, 0, 0];
  }

  // Default and 'xy'
  return [0, 0, 1];
}

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function scale(v: [number, number, number], s: number): [number, number, number] {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function sub(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function length(v: [number, number, number]): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize(v: [number, number, number]): [number, number, number] {
  const length_ = length(v) || 1;
  return [v[0] / length_, v[1] / length_, v[2] / length_];
}

function extractComponentManifestUpdates({
  geometry,
  sourceFile,
}: {
  readonly geometry: Geometry;
  readonly sourceFile?: string;
}): { unitId: string; manifest: GeometryComponentManifest } | undefined {
  if (geometry.format !== 'gltf') {
    return undefined;
  }

  try {
    const manifest = buildGltfComponentManifest(geometry.content, {
      sourceFile,
      geometryHash: geometry.hash,
    });
    return {
      unitId: deriveModelInteractionUnitId({
        sourceFile,
        geometryHash: geometry.hash,
        manifest,
      }),
      manifest,
    };
  } catch (error) {
    console.error('Failed to extract GLTF component manifest in graphics machine', error);
    return undefined;
  }
}

// Apply XYZ-order Euler rotation to a vector
function rotateVectorByEuler(v: [number, number, number], euler: [number, number, number]): [number, number, number] {
  const [x, y, z] = v;
  const [rx, ry, rz] = euler;

  // Rotate around X
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const y1 = y * cx - z * sx;
  const z1 = y * sx + z * cx;

  // Rotate around Y
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const x2 = x * cy + z1 * sy;
  const y2 = y1;
  const z2 = -x * sy + z1 * cy;

  // Rotate around Z
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  const x3 = x2 * cz - y2 * sz;
  const y3 = x2 * sz + y2 * cz;
  const z3 = z2;

  return [x3, y3, z3];
}

// Round a translation value to a given number of decimals in the current unit,
// then convert it back to the base unit (mm). For example, with unitFactor=1000 (m),
// 6262 mm -> 6.262 m -> 6.26 m -> 6260 mm.
function roundTranslationToUnitDecimals(valueInBase: number, unitFactor: number, decimals = 2): number {
  const factor = unitFactor === 0 ? 1 : unitFactor;
  const valueInUnit = valueInBase / factor;
  const multiplier = 10 ** decimals;
  const roundedInUnit = Math.round(valueInUnit * multiplier) / multiplier;
  return roundedInUnit * factor;
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
 *   ├── section-view (modal viewing mode) [mutually exclusive]
 *   │   ├── pending (waiting for plane selection)
 *   │   └── active (plane selected, can manipulate)
 *   └── measure (measurement mode) [mutually exclusive]
 *       ├── selecting (clicking first points)
 *       └── selected (points selected, can add more)
 *
 * Future modes can be added as siblings:
 *   ├── annotation (future)
 *
 * Common events (grid, camera, visibility, screenshots) are handled
 * once at the operational parent level to avoid duplication.
 */
export const graphicsMachine = setup({
  actors: {
    probeWebGpu: fromPromise(async () => probeWebGpuSupport()),
    modelInteraction: modelInteractionMachine,
  },
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as GraphicsContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as GraphicsEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as GraphicsInput,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
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
          type: 'gridUpdated',
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

      const unitData = getLengthUnitData(event.payload.unit);
      const previousUnitData = getLengthUnitData(context.graphicsUnits.length.symbol);

      const isSystemChange = previousUnitData.system !== unitData.system;
      const isImperialFactorChange =
        unitData.system === 'imperial' && context.graphicsUnits.length.factor !== unitData.factor;

      // Calculate relative factor for display (displayFactor / cadFactor)
      const relativeFactor = unitData.factor / context.cadUnits.length.factor;

      enqueue.assign({
        graphicsUnits: {
          length: {
            symbol: unitData.symbol,
            factor: unitData.factor,
            system: unitData.system,
          },
        },
        units: {
          length: {
            symbol: unitData.symbol,
            factor: relativeFactor,
            system: unitData.system,
          },
        },
      });

      // Only recalculate grid spacing when:
      // 1. Switching between si/imperial systems (visual spacing changes)
      // 2. Changing factor in imperial units (affects visual spacing)
      // For si units, factor changes only affect display numbers, not visual spacing
      if (isSystemChange || isImperialFactorChange) {
        // Use relative factor × 1000 for grid calculations
        const gridUnitFactor = relativeFactor * 1000;
        const newGridSizes = calculateGridSizes({
          visibleSpan: context.cameraVisibleSpan,
          gridUnitSystem: unitData.system,
          unitFactor: gridUnitFactor,
        });

        enqueue.sendTo(({ self }) => self, {
          type: 'updateGridSize',
          payload: newGridSizes,
        });
      }
    }),

    handleCameraViewChange: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'cameraViewChanged');
      if (!Number.isFinite(event.verticalSpan) || event.verticalSpan <= 0) {
        return;
      }

      enqueue.assign({
        cameraVisibleSpan: event.verticalSpan,
      });

      // Recalculate grid sizes based on new controls state
      // Use relative factor × 1000 for grid calculations
      const gridUnitFactor = context.units.length.factor * 1000;
      const newGridSizes = calculateGridSizes({
        visibleSpan: event.verticalSpan,
        gridUnitSystem: context.units.length.system,
        unitFactor: gridUnitFactor,
      });

      enqueue.sendTo(({ self }) => self, {
        type: 'updateGridSize',
        payload: newGridSizes,
      });
    }),

    handleControlsInteractionStart: enqueueActions(({ enqueue }) => {
      enqueue.assign({
        cameraInteracting: true,
        cameraInteractionHadMovement: false,
        suppressNextModelPointerClick: false,
      });
    }),

    handleControlsInteractionMoved: enqueueActions(({ enqueue, context }) => {
      if (!context.cameraInteracting) {
        return;
      }

      enqueue.assign({
        cameraInteractionHadMovement: true,
        suppressNextModelPointerClick: true,
        viewerHoverSuppressionReasons: addSuppressionReason(context.viewerHoverSuppressionReasons, 'cameraControls'),
      });
      if (!context.viewerHoverSuppressionReasons.includes('cameraControls') && context.modelInteractionUnitId) {
        enqueue.sendTo(context.modelInteractionRef, {
          type: 'setHoveredComponent',
          unitId: context.modelInteractionUnitId,
          componentId: undefined,
          source: 'viewer',
        });
      }
    }),

    handleControlsInteractionEnd: enqueueActions(({ enqueue, context }) => {
      enqueue.assign({
        cameraInteracting: false,
        cameraInteractionHadMovement: false,
        viewerHoverSuppressionReasons: removeSuppressionReason(context.viewerHoverSuppressionReasons, 'cameraControls'),
      });
    }),

    beginViewerModelHoverSuppression: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'beginViewerModelHoverSuppression');
      if (context.viewerHoverSuppressionReasons.includes(event.reason)) {
        return;
      }
      enqueue.assign({
        viewerHoverSuppressionReasons: addSuppressionReason(context.viewerHoverSuppressionReasons, event.reason),
      });
      if (context.modelInteractionUnitId) {
        enqueue.sendTo(context.modelInteractionRef, {
          type: 'setHoveredComponent',
          unitId: context.modelInteractionUnitId,
          componentId: undefined,
          source: event.source ?? 'viewer',
        });
      }
    }),

    endViewerModelHoverSuppression: assign(({ context, event }) => {
      assertEvent(event, 'endViewerModelHoverSuppression');
      return {
        viewerHoverSuppressionReasons: removeSuppressionReason(context.viewerHoverSuppressionReasons, event.reason),
      };
    }),

    markModelPointerGestureMoved: assign({
      suppressNextModelPointerClick: true,
    }),

    clearModelPointerClickGuard: assign({
      suppressNextModelPointerClick: false,
    }),

    beginMeasureHoverSuppression: enqueueActions(({ enqueue, context }) => {
      enqueue.assign({
        modelPointerClickSuppressionReasons: addSuppressionReason(
          context.modelPointerClickSuppressionReasons,
          'measureTool',
        ),
        viewerHoverSuppressionReasons: addSuppressionReason(context.viewerHoverSuppressionReasons, 'measureTool'),
      });
      if (!context.viewerHoverSuppressionReasons.includes('measureTool') && context.modelInteractionUnitId) {
        enqueue.sendTo(context.modelInteractionRef, {
          type: 'setHoveredComponent',
          unitId: context.modelInteractionUnitId,
          componentId: undefined,
          source: 'viewer',
        });
      }
    }),

    endMeasureHoverSuppression: enqueueActions(({ enqueue, context }) => {
      enqueue.assign({
        modelPointerClickSuppressionReasons: removeSuppressionReason(
          context.modelPointerClickSuppressionReasons,
          'measureTool',
        ),
        viewerHoverSuppressionReasons: removeSuppressionReason(context.viewerHoverSuppressionReasons, 'measureTool'),
      });
    }),

    bumpPickableMeshesVersion: assign({
      pickableMeshesVersion: ({ context }) => context.pickableMeshesVersion + 1,
    }),

    updateGeometry: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'updateGeometry');

      const cadUnitData = getLengthUnitData(event.units.length);
      const componentManifestUpdate = extractComponentManifestUpdates({
        geometry: event.geometry,
        sourceFile: event.sourceFile,
      });

      // Calculate relative factor for display (displayFactor / cadFactor)
      const relativeFactor = context.graphicsUnits.length.factor / cadUnitData.factor;

      enqueue.assign({
        geometry: event.geometry,
        geometryKey: event.geometry.hash,
        modelInteractionUnitId:
          componentManifestUpdate?.unitId ??
          (event.sourceFile ? deriveModelInteractionUnitId({ sourceFile: event.sourceFile }) : undefined),
        pickableMeshesVersion: context.pickableMeshesVersion + 1,
        cadUnits: {
          length: {
            symbol: event.units.length,
            factor: cadUnitData.factor,
          },
        },
        units: {
          length: {
            symbol: context.graphicsUnits.length.symbol,
            factor: relativeFactor,
            system: context.graphicsUnits.length.system,
          },
        },
      });

      if (componentManifestUpdate) {
        enqueue.sendTo(context.modelInteractionRef, {
          type: 'loadManifest',
          unitId: componentManifestUpdate.unitId,
          manifest: componentManifestUpdate.manifest,
          source: 'viewer',
        });
      }

      if (event.sourceFile && !componentManifestUpdate) {
        enqueue.sendTo(context.modelInteractionRef, {
          type: 'clearManifest',
          unitId: deriveModelInteractionUnitId({ sourceFile: event.sourceFile }),
          source: 'viewer',
        });
      }
    }),

    updateSceneRadius: enqueueActions(({ enqueue, event }) => {
      assertEvent(event, 'sceneRadiusUpdated');
      enqueue.assign({ geometryRadius: event.radius });
      enqueue.emit({
        type: 'geometryRadiusCalculated',
        radius: event.radius,
      });
    }),

    requestCameraReset: emit(({ event }) => {
      assertEvent(event, 'resetCamera');
      return { type: 'viewResetRequested' } satisfies GraphicsEmitted;
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

    setPostProcessingVisibility: assign({
      enablePostProcessing({ event }) {
        assertEvent(event, 'setPostProcessingVisibility');
        return event.payload;
      },
    }),

    setUpDirection: assign({
      upDirection({ event }) {
        assertEvent(event, 'setUpDirection');
        return event.payload;
      },
    }),

    setEnvironmentPreset: assign({
      environmentPreset({ event }) {
        assertEvent(event, 'setEnvironmentPreset');
        return event.payload;
      },
    }),

    setGraphicsBackendPreference: assign({
      graphicsBackendPreference({ event }) {
        assertEvent(event, 'setGraphicsBackendPreference');
        return event.payload;
      },
      resolvedGraphicsBackend({ context, event }) {
        assertEvent(event, 'setGraphicsBackendPreference');
        return resolveGraphicsBackendPreference(event.payload, context.webGpuAvailable);
      },
    }),

    recordWebGpuProbeResult: enqueueActions(({ enqueue, context, event }) => {
      const probeEvent = event as Record<string, unknown>;
      const outputCandidate = probeEvent['output'];
      const output = typeof outputCandidate === 'boolean' ? outputCandidate : false;

      enqueue.assign({
        webGpuAvailable: output,
        resolvedGraphicsBackend: resolveGraphicsBackendPreference(context.graphicsBackendPreference, output),
      });
    }),

    /** Probe actor rejected / threw — pessimistic fallback. */
    recordWebGpuProbeFailure: enqueueActions(({ enqueue, context }) => {
      enqueue.assign({
        webGpuAvailable: false,
        resolvedGraphicsBackend: resolveGraphicsBackendPreference(context.graphicsBackendPreference, false),
      });
    }),

    setSectionViewActive: assign({
      isSectionViewActive({ event }) {
        assertEvent(event, 'setSectionViewActive');
        return event.payload;
      },
    }),

    deactivateSectionView: assign({
      isSectionViewActive: false,
    }),

    selectSectionView: assign({
      selectedSectionViewId({ event }) {
        assertEvent(event, 'selectSectionView');
        return event.payload;
      },
      // Reset translation and pivot when changing planes
      sectionViewTranslation({ event }) {
        assertEvent(event, 'selectSectionView');
        return event.payload === undefined ? 0 : 0;
      },
      sectionViewPivot({ event }): [number, number, number] {
        assertEvent(event, 'selectSectionView');
        return [0, 0, 0];
      },
      // Reset rotation when changing planes
      sectionViewRotation({ event }): [number, number, number] {
        assertEvent(event, 'selectSectionView');
        return event.payload === undefined ? [0, 0, 0] : [0, 0, 0];
      },
    }),

    setSectionViewDirection: assign({
      sectionViewDirection({ event }) {
        assertEvent(event, 'setSectionViewDirection');
        return event.payload;
      },
    }),

    setSectionViewTranslation: assign({
      // Move pivot along the CURRENT rotated normal, preserving the component
      // Perpendicular to that normal so no jump occurs; keep displayed
      // translation as the rounded requested value.
      sectionViewPivot({ event, context }): [number, number, number] {
        assertEvent(event, 'setSectionViewTranslation');
        // Convert from display units to CAD coordinate space using relative factor
        const desired = roundTranslationToUnitDecimals(event.payload, context.units.length.factor, 2);

        const a = getBaseAxis(context.selectedSectionViewId); // Base axis
        const r = normalize(rotateVectorByEuler(a, context.sectionViewRotation)); // Rotated normal

        const p = context.sectionViewPivot;
        const pr = dot(p, r);
        const pParallelR = scale(r, pr);
        const pPerpR = sub(p, pParallelR);

        const denom = dot(a, r);
        const s = Math.abs(denom) > 1e-6 ? (desired - dot(a, pPerpR)) / denom : desired;
        const newPivot = add(pPerpR, scale(r, s));
        return newPivot;
      },
      sectionViewTranslation({ context }) {
        const axis = getBaseAxis(context.selectedSectionViewId);
        const projected = dot(axis, context.sectionViewPivot);
        // Convert from CAD coordinate space to display units using relative factor
        return roundTranslationToUnitDecimals(projected, context.units.length.factor, 2);
      },
    }),

    setSectionViewRotation: assign({
      sectionViewRotation({ event }): [number, number, number] {
        assertEvent(event, 'setSectionViewRotation');
        const [rx, ry, rz] = event.payload;
        return [clampRadiansToNearestDegree(rx), clampRadiansToNearestDegree(ry), clampRadiansToNearestDegree(rz)];
      },
      // Rotation does not change the pivot. Ensure displayed translation stays
      // consistent with pivot projection onto the base axis.
      sectionViewTranslation({ context }) {
        const axis = getBaseAxis(context.selectedSectionViewId);
        const projected = dot(axis, context.sectionViewPivot);
        // Convert from CAD coordinate space to display units using relative factor
        return roundTranslationToUnitDecimals(projected, context.units.length.factor, 2);
      },
    }),

    toggleSectionViewDirection: assign({
      sectionViewDirection({ context }) {
        return context.sectionViewDirection === 1 ? -1 : 1;
      },
    }),

    setSectionViewPivot: assign({
      sectionViewPivot({ event }) {
        assertEvent(event, 'setSectionViewPivot');
        return event.payload;
      },
      sectionViewTranslation({ event, context }) {
        assertEvent(event, 'setSectionViewPivot');
        const axis = getBaseAxis(context.selectedSectionViewId);
        const projected = dot(axis, event.payload);
        // Convert from CAD coordinate space to display units using relative factor
        return roundTranslationToUnitDecimals(projected, context.units.length.factor, 2);
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

    setPlaneName: assign({
      planeName({ event }) {
        assertEvent(event, 'setPlaneName');
        return event.payload;
      },
    }),

    setHoveredSectionView: assign({
      hoveredSectionViewId({ event }) {
        assertEvent(event, 'setHoveredSectionView');
        return event.payload;
      },
    }),

    setMeasureActive: assign({
      isMeasureActive({ event }) {
        assertEvent(event, 'setMeasureActive');
        return event.payload;
      },
    }),

    deactivateMeasure: assign({
      isMeasureActive: false,
      measurements: [],
      currentMeasurementStart: undefined,
    }),

    // Deactivate measure mode but keep existing measurements in place
    deactivateMeasurePreserveMeasurements: assign({
      isMeasureActive: false,
      currentMeasurementStart: undefined,
    }),

    startMeasurement: assign({
      currentMeasurementStart({ event }) {
        assertEvent(event, 'startMeasurement');
        return event.payload;
      },
    }),

    completeMeasurement: assign({
      measurements({ event, context }) {
        assertEvent(event, 'completeMeasurement');
        if (!context.currentMeasurementStart) {
          return context.measurements;
        }

        const start = context.currentMeasurementStart;
        const end = event.payload;
        const distance = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);

        return [
          ...context.measurements,
          {
            id: generatePrefixedId(idPrefix.measurement),
            startPoint: start,
            endPoint: end,
            distance,
            isPinned: false,
          },
        ];
      },
      currentMeasurementStart: undefined,
    }),

    cancelCurrentMeasurement: assign({
      currentMeasurementStart: undefined,
    }),

    clearMeasurement: assign({
      measurements({ event, context }) {
        assertEvent(event, 'clearMeasurement');
        const filtered = context.measurements.filter((m) => m.id !== event.payload);
        return filtered;
      },
    }),

    clearAllMeasurements: assign({
      measurements: [],
      currentMeasurementStart: undefined,
    }),

    clearUnpinnedMeasurements: assign({
      measurements({ context }) {
        return context.measurements.filter((m) => m.isPinned);
      },
    }),

    setHoveredMeasurement: assign({
      hoveredMeasurementId({ event }) {
        assertEvent(event, 'setHoveredMeasurement');
        return event.payload;
      },
    }),

    setMeasurementName: assign({
      measurements({ event, context }) {
        assertEvent(event, 'setMeasurementName');
        return context.measurements.map((m) => (m.id === event.id ? { ...m, name: event.name } : m));
      },
    }),

    toggleMeasurementPinned: assign({
      measurements({ event, context }) {
        assertEvent(event, 'toggleMeasurementPinned');
        const updated = context.measurements.map((m) => (m.id === event.id ? { ...m, isPinned: !m.isPinned } : m));
        return updated;
      },
    }),

    loadModelComponentManifest: sendTo(
      ({ context }) => context.modelInteractionRef,
      ({ event }) => {
        assertEvent(event, 'loadModelComponentManifest');
        return { type: 'loadManifest', unitId: event.unitId, manifest: event.manifest, source: event.source };
      },
    ),
    clearModelComponentManifest: sendTo(
      ({ context }) => context.modelInteractionRef,
      ({ event }) => {
        assertEvent(event, 'clearModelComponentManifest');
        return { type: 'clearManifest', unitId: event.unitId, source: event.source };
      },
    ),
    setHoveredModelComponent: sendTo(
      ({ context }) => context.modelInteractionRef,
      ({ event }) => {
        assertEvent(event, 'setHoveredModelComponent');
        return {
          type: 'setHoveredComponent',
          unitId: event.unitId,
          componentId: event.componentId,
          source: event.source,
        };
      },
    ),
    bindModelInteractionUnit: assign(({ event }) => {
      assertEvent(event, 'loadModelComponentManifest');
      return { modelInteractionUnitId: event.unitId };
    }),
    toggleModelComponentSelection: sendTo(
      ({ context }) => context.modelInteractionRef,
      ({ event }) => {
        assertEvent(event, 'toggleModelComponentSelection');
        return {
          type: 'toggleComponentSelection',
          unitId: event.unitId,
          componentId: event.componentId,
          source: event.source,
        };
      },
    ),
    selectModelComponent: sendTo(
      ({ context }) => context.modelInteractionRef,
      ({ event }) => {
        assertEvent(event, 'selectModelComponent');
        return {
          type: 'selectComponent',
          unitId: event.unitId,
          componentId: event.componentId,
          source: event.source,
        };
      },
    ),
    clearModelComponentSelection: sendTo(
      ({ context }) => context.modelInteractionRef,
      ({ event }) => {
        assertEvent(event, 'clearModelComponentSelection');
        return { type: 'clearSelection', unitId: event.unitId, source: event.source };
      },
    ),
    hideModelComponent: sendTo(
      ({ context }) => context.modelInteractionRef,
      ({ event }) => {
        assertEvent(event, 'hideModelComponent');
        return { type: 'hideComponent', unitId: event.unitId, componentId: event.componentId, source: event.source };
      },
    ),
    showModelComponent: sendTo(
      ({ context }) => context.modelInteractionRef,
      ({ event }) => {
        assertEvent(event, 'showModelComponent');
        return { type: 'showComponent', unitId: event.unitId, componentId: event.componentId, source: event.source };
      },
    ),
    showHiddenModelComponents: sendTo(
      ({ context }) => context.modelInteractionRef,
      ({ event }) => {
        assertEvent(event, 'showHiddenModelComponents');
        return { type: 'showHiddenComponents', unitId: event.unitId, source: event.source };
      },
    ),
    isolateModelComponent: sendTo(
      ({ context }) => context.modelInteractionRef,
      ({ event }) => {
        assertEvent(event, 'isolateModelComponent');
        return { type: 'isolateComponent', unitId: event.unitId, componentId: event.componentId, source: event.source };
      },
    ),
    clearModelComponentIsolation: sendTo(
      ({ context }) => context.modelInteractionRef,
      ({ event }) => {
        assertEvent(event, 'clearModelComponentIsolation');
        return { type: 'clearIsolation', unitId: event.unitId, source: event.source };
      },
    ),
    setModelComponentOpacity: sendTo(
      ({ context }) => context.modelInteractionRef,
      ({ event }) => {
        assertEvent(event, 'setModelComponentOpacity');
        return {
          type: 'setComponentOpacity',
          unitId: event.unitId,
          componentId: event.componentId,
          opacity: event.opacity,
          source: event.source,
        };
      },
    ),
    resetModelComponentOpacities: sendTo(
      ({ context }) => context.modelInteractionRef,
      ({ event }) => {
        assertEvent(event, 'resetModelComponentOpacities');
        return { type: 'resetComponentOpacities', unitId: event.unitId, source: event.source };
      },
    ),
    focusModelComponent: sendTo(
      ({ context }) => context.modelInteractionRef,
      ({ event }) => {
        assertEvent(event, 'focusModelComponent');
        return { type: 'focusComponent', unitId: event.unitId, componentId: event.componentId, source: event.source };
      },
    ),
    clearModelComponentFocus: sendTo(
      ({ context }) => context.modelInteractionRef,
      ({ event }) => {
        assertEvent(event, 'clearModelComponentFocus');
        return { type: 'clearFocus', unitId: event.unitId, source: event.source };
      },
    ),
    stopOwnedModelInteraction: enqueueActions(({ enqueue, context }) => {
      if (context.ownsModelInteractionRef) {
        enqueue.stopChild(context.modelInteractionRef);
      }
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
    isActivatingMeasure({ event }) {
      assertEvent(event, 'setMeasureActive');
      return event.payload;
    },
    isDeactivatingMeasure({ event }) {
      assertEvent(event, 'setMeasureActive');
      return !event.payload;
    },
    hasSelectedPoints({ context }) {
      return context.measurements.length > 0;
    },
    hasSelectedSectionView({ context }) {
      return context.selectedSectionViewId !== undefined;
    },
    isActivatingClippingWithSelection({ event, context }) {
      assertEvent(event, 'setSectionViewActive');
      return event.payload && context.selectedSectionViewId !== undefined;
    },
  },
}).createMachine({
  id: 'graphics',

  invoke: [
    {
      src: 'probeWebGpu',
      id: 'probeWebGpuInvocation',
      onDone: { actions: 'recordWebGpuProbeResult' },
      onError: { actions: 'recordWebGpuProbeFailure' },
    },
  ],

  context: ({ input, spawn }) => {
    const preference = input.graphicsBackendPreference ?? 'webgl';
    const ownsModelInteractionRef = input.modelInteractionRef === undefined;
    const modelInteractionRef =
      input.modelInteractionRef ??
      spawn('modelInteraction', {
        id: 'model-interaction',
        input: {},
      });

    return {
      // Grid state
      gridSizes: { smallSize: 1, largeSize: 10 },
      gridSizesComputed: { smallSize: 1, largeSize: 10 },
      isGridSizeLocked: false,
      graphicsUnits: {
        length: {
          symbol: 'mm',
          factor: 1e-3,
          system: 'si',
        },
      },
      cadUnits: {
        length: {
          symbol: 'mm', // Default to mm
          factor: 1e-3,
        },
      },
      // Relative units = display units / CAD units
      // When both are mm: 1 / 1 = 1
      units: {
        length: {
          symbol: 'mm',
          factor: 1, // 1 / 1 = 1
          system: 'si',
        },
      },

      // Camera state
      initialCameraFovAngle: input.defaultCameraFovAngle ?? 60,
      cameraVisibleSpan: 2,
      geometryRadius: 0,
      sceneRadius: undefined,

      // Visibility state (from per-view settings or defaults)
      enableSurfaces: input.enableSurfaces ?? true,
      enableLines: input.enableLines ?? true,
      enableGizmo: input.enableGizmo ?? true,
      enableGrid: input.enableGrid ?? true,
      enableAxes: input.enableAxes ?? true,
      enableMatcap: input.enableMatcap ?? false,
      enablePostProcessing: input.enablePostProcessing ?? false,
      upDirection: input.upDirection ?? 'z',
      environmentPreset: input.environmentPreset ?? 'performance',

      graphicsBackendPreference: preference,
      webGpuAvailable: false,
      resolvedGraphicsBackend: resolveGraphicsBackendPreference(preference, false),

      // Clipping plane state
      isSectionViewActive: false,
      availableSectionViews: [
        { id: 'xy', normal: [0, 0, 1], constant: 0 },
        { id: 'xz', normal: [0, 1, 0], constant: 0 },
        { id: 'yz', normal: [1, 0, 0], constant: 0 },
      ],
      selectedSectionViewId: undefined,
      planeName: 'face',
      hoveredSectionViewId: undefined,
      sectionViewVisualization: {
        stripeColor: '#00ff00',
        stripeSpacing: 10,
        stripeWidth: 1,
      },
      sectionViewTranslation: 0,
      sectionViewRotation: [0, 0, 0],
      sectionViewDirection: -1,
      sectionViewPivot: [0, 0, 0],
      enableClippingLines: true,
      enableClippingMesh: true,

      // Measure state
      isMeasureActive: false,
      measurements: (input.pinnedMeasurements ?? []).map((m) => ({
        ...m,
        isPinned: true,
      })),
      currentMeasurementStart: undefined,
      measureSnapDistance: input.measureSnapDistance ?? 40,
      hoveredMeasurementId: undefined,

      // State flags
      cameraInteracting: false,
      cameraInteractionHadMovement: false,
      suppressNextModelPointerClick: false,
      modelPointerClickSuppressionReasons: [],
      viewerHoverSuppressionReasons: [],
      pickableMeshesVersion: 0,
      modelInteractionRef,
      ownsModelInteractionRef,
      modelInteractionUnitId: undefined,

      // Shapes
      geometry: undefined,
      geometryKey: '',
    };
  },
  exit: 'stopOwnedModelInteraction',
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
        resetCamera: {
          actions: 'requestCameraReset',
        },
        cameraViewChanged: {
          actions: 'handleCameraViewChange',
        },

        // Visibility events
        setSurfaceVisibility: {
          actions: ['setSurfaceVisibility', 'bumpPickableMeshesVersion'],
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
        setPostProcessingVisibility: {
          actions: 'setPostProcessingVisibility',
        },
        setUpDirection: {
          actions: 'setUpDirection',
        },
        setEnvironmentPreset: {
          actions: 'setEnvironmentPreset',
        },
        setGraphicsBackendPreference: {
          actions: 'setGraphicsBackendPreference',
        },

        // Plane naming and hover are global in operational state
        setPlaneName: {
          actions: 'setPlaneName',
        },
        setHoveredSectionView: {
          actions: 'setHoveredSectionView',
        },

        // Controls events
        controlsInteractionStart: {
          actions: 'handleControlsInteractionStart',
        },
        controlsInteractionMoved: {
          actions: 'handleControlsInteractionMoved',
        },
        controlsInteractionEnd: {
          actions: 'handleControlsInteractionEnd',
        },
        beginViewerModelHoverSuppression: {
          actions: 'beginViewerModelHoverSuppression',
        },
        endViewerModelHoverSuppression: {
          actions: 'endViewerModelHoverSuppression',
        },
        markModelPointerGestureMoved: {
          actions: 'markModelPointerGestureMoved',
        },
        clearModelPointerClickGuard: {
          actions: 'clearModelPointerClickGuard',
        },

        // Geometry updates
        updateGeometry: {
          actions: 'updateGeometry',
        },
        sceneRadiusUpdated: {
          actions: 'updateSceneRadius',
        },

        // Model/component interaction
        loadModelComponentManifest: {
          actions: ['bindModelInteractionUnit', 'loadModelComponentManifest'],
        },
        clearModelComponentManifest: {
          actions: 'clearModelComponentManifest',
        },
        setHoveredModelComponent: {
          actions: 'setHoveredModelComponent',
        },
        toggleModelComponentSelection: {
          actions: 'toggleModelComponentSelection',
        },
        selectModelComponent: {
          actions: 'selectModelComponent',
        },
        clearModelComponentSelection: {
          actions: 'clearModelComponentSelection',
        },
        hideModelComponent: {
          actions: 'hideModelComponent',
        },
        showModelComponent: {
          actions: 'showModelComponent',
        },
        showHiddenModelComponents: {
          actions: 'showHiddenModelComponents',
        },
        isolateModelComponent: {
          actions: 'isolateModelComponent',
        },
        clearModelComponentIsolation: {
          actions: 'clearModelComponentIsolation',
        },
        setModelComponentOpacity: {
          actions: 'setModelComponentOpacity',
        },
        resetModelComponentOpacities: {
          actions: 'resetModelComponentOpacities',
        },
        focusModelComponent: {
          actions: 'focusModelComponent',
        },
        clearModelComponentFocus: {
          actions: 'clearModelComponentFocus',
        },
        // Section view pivot updates (world-space anchor)
        setSectionViewPivot: {
          actions: 'setSectionViewPivot',
        },

        // Measurement events (available in all operational states)
        clearMeasurement: {
          actions: 'clearMeasurement',
        },
        setHoveredMeasurement: {
          actions: 'setHoveredMeasurement',
        },
        setMeasurementName: {
          actions: 'setMeasurementName',
        },
        toggleMeasurementPinned: {
          actions: 'toggleMeasurementPinned',
        },
        clearUnpinnedMeasurements: {
          actions: 'clearUnpinnedMeasurements',
        },
      },
      states: {
        ready: {
          on: {
            setSectionViewActive: [
              {
                guard: 'isActivatingClippingWithSelection',
                actions: 'setSectionViewActive',
                target: 'section-view.active',
              },
              {
                guard: 'isActivatingClipping',
                actions: 'setSectionViewActive',
                target: 'section-view.pending',
              },
            ],
            setMeasureActive: {
              guard: 'isActivatingMeasure',
              actions: ['setMeasureActive', 'beginMeasureHoverSuppression'],
              target: 'measure.selecting',
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
                setMeasureActive: {
                  guard: 'isActivatingMeasure',
                  actions: ['deactivateSectionView', 'setMeasureActive', 'beginMeasureHoverSuppression'],
                  target: '#graphics.operational.measure.selecting',
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
                setMeasureActive: {
                  guard: 'isActivatingMeasure',
                  actions: ['deactivateSectionView', 'setMeasureActive', 'beginMeasureHoverSuppression'],
                  target: '#graphics.operational.measure.selecting',
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
                setSectionViewDirection: {
                  actions: 'setSectionViewDirection',
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

        measure: {
          initial: 'selecting',
          states: {
            selecting: {
              on: {
                setMeasureActive: {
                  guard: 'isDeactivatingMeasure',
                  actions: ['setMeasureActive', 'endMeasureHoverSuppression'],
                  target: '#graphics.operational.ready',
                },
                setSectionViewActive: [
                  {
                    guard: 'isActivatingClippingWithSelection',
                    actions: [
                      'deactivateMeasurePreserveMeasurements',
                      'endMeasureHoverSuppression',
                      'setSectionViewActive',
                    ],
                    target: '#graphics.operational.section-view.active',
                  },
                  {
                    guard: 'isActivatingClipping',
                    actions: [
                      'deactivateMeasurePreserveMeasurements',
                      'endMeasureHoverSuppression',
                      'setSectionViewActive',
                    ],
                    target: '#graphics.operational.section-view.pending',
                  },
                ],
                startMeasurement: {
                  actions: 'startMeasurement',
                  target: 'selected',
                },
                clearAllMeasurements: {
                  actions: 'clearAllMeasurements',
                },
              },
            },

            selected: {
              on: {
                setMeasureActive: {
                  guard: 'isDeactivatingMeasure',
                  actions: ['clearAllMeasurements', 'setMeasureActive', 'endMeasureHoverSuppression'],
                  target: '#graphics.operational.ready',
                },
                setSectionViewActive: [
                  {
                    guard: 'isActivatingClippingWithSelection',
                    actions: [
                      'deactivateMeasurePreserveMeasurements',
                      'endMeasureHoverSuppression',
                      'setSectionViewActive',
                    ],
                    target: '#graphics.operational.section-view.active',
                  },
                  {
                    guard: 'isActivatingClipping',
                    actions: [
                      'deactivateMeasurePreserveMeasurements',
                      'endMeasureHoverSuppression',
                      'setSectionViewActive',
                    ],
                    target: '#graphics.operational.section-view.pending',
                  },
                ],
                completeMeasurement: {
                  actions: 'completeMeasurement',
                  target: 'selecting',
                },
                cancelCurrentMeasurement: {
                  actions: 'cancelCurrentMeasurement',
                  target: 'selecting',
                },
                clearMeasurement: {
                  actions: 'clearMeasurement',
                },
                clearAllMeasurements: {
                  actions: 'clearAllMeasurements',
                  target: 'selecting',
                },
              },
            },
          },
        },
      },
    },
  },
});
