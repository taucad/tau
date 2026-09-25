import { createAsyncLogic, setup, types } from 'xstate';
import type { ActorRefFrom, EnqueueObject, SnapshotFrom, SystemRegistry } from 'xstate';
import { eventSchemas } from '#lib/xstate.lib.js';
import type { GeometryComponentManifest, GridSizes, Geometry } from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import { getLengthUnit, metersPerLengthUnit } from '#constants/length-units.js';
import type { LengthSymbol, UnitSystem } from '#constants/length-units.js';
import { generatePrefixedId } from '@taucad/utils/id';
import type {
  GraphicsBackendPreference,
  GraphicsOwnedSettings,
  ResolvedGraphicsBackend,
} from '#constants/editor.constants.js';
import {
  probeWebGpuSupport,
  resolveGraphicsBackendPreference,
} from '#components/geometry/graphics/graphics-backend.js';
import { recordRendererSpan } from '#lib/renderer-telemetry.js';
import { deriveModelInteractionUnitId, modelInteractionMachine } from '#machines/model-interaction.machine.js';
import type { ModelInteractionSource, ViewerHoverSuppressionReason } from '#machines/model-interaction.machine.js';

export type ModelInteractionRef = ActorRefFrom<typeof modelInteractionMachine>;

export type ModelPointerClickSuppressionReason = 'measureTool';

export type GltfPresentationBarrier = 'display-ready' | 'analysis-ready';

export type GltfPresentationTelemetry = Readonly<{
  revision: number;
  key: string;
  backend: ResolvedGraphicsBackend;
  barrier: GltfPresentationBarrier;
  outcome: 'presented' | 'failed' | 'cancelled' | 'stale';
  glbBytes: number;
  meshCount: number;
  triangleCount: number;
  sourceLineCount: number;
  lineSegmentCount: number;
  durations: Readonly<
    Partial<
      Record<
        | 'parse'
        /** Present only when the result was written into the presented buffers in place (D22). */
        | 'inPlace'
        | 'manifest'
        | 'annotation'
        | 'topologySubmit'
        | 'topologyWorker'
        | 'topologyHydrate'
        | 'fatLines'
        | 'materials'
        | 'pipelineWarmup'
        | 'commitToFirstFrame'
        | 'receiptToFirstFrame',
        number
      >
    >
  >;
  modelEmptyFrames: number;
  committedBundleHighWaterMark: number;
  candidateBundleHighWaterMark: number;
  topologyJobsStarted: number;
  topologyJobsDiscarded: number;
}>;

export type GltfPresentationProjection = Readonly<{
  requestedRevision: number;
  requestedKey?: string;
  presentedRevision: number;
  presentedKey?: string;
  phase: 'idle' | 'preparing' | 'awaiting-analysis' | 'presented' | 'failed';
}>;

const withGltfPresentationPhase = (
  projection: Omit<GltfPresentationProjection, 'phase'>,
  phase: GltfPresentationProjection['phase'],
): GltfPresentationProjection => ({ ...projection, phase });

const addSuppressionReason = <T extends string>(reasons: readonly T[], reason: T): T[] =>
  reasons.includes(reason) ? [...reasons] : [...reasons, reason];

const removeSuppressionReason = <T extends string>(reasons: readonly T[], reason: T): T[] =>
  reasons.filter((existingReason) => existingReason !== reason);

/**
 * Context type definition.
 *
 * Law 4 of the persisted view settings ownership blueprint classifies every field here:
 *
 * - **durable** -- in `GraphicsViewSettings`, seeded once at spawn and restored identically by an
 *   in-app revisit and a page reload: `enableSurfaces`, `enableLines`, `enableGizmo`, `enableGrid`,
 *   `enableAxes`, `enableMatcap`, `enablePostProcessing`, `upDirection`, `graphicsBackendPreference`,
 *   the pinned half of `measurements`, and the section view -- `isSectionViewActive`,
 *   `selectedSectionViewId`, `sectionViewPivot`, `sectionViewRotation`, `sectionViewDirection`
 *   (entry-scoped) with `enableClippingLines`, `enableClippingMesh` and `planeName` (pane-scoped).
 * - **session** -- survives an in-app revisit because this actor is retained, and is lost on reload
 *   by decision: `displayUnits.length` (the grid unit symbol, session-scoped by ruling E4),
 *   `isGridSizeLocked`, `isMeasureActive`, the unpinned half of `measurements`,
 *   `currentMeasurementStart` and `modelInteractionUnitId`.
 * - **ephemeral** -- derived from geometry, the canvas or a pointer on every mount, never seeded:
 *   `gridSizes`, `gridSizesComputed`, `cadUnits`, `cameraVisibleSpan`, `geometryRadius`,
 *   `geometryCenter`, `resolvedGraphicsBackend`, `webGpuAvailable`, `availableSectionViews`,
 *   `hoveredSectionViewId`, `sectionViewVisualization`, `sectionViewTranslation` (the pivot's
 *   projection on the plane axis), `hoveredMeasurementId`, `measureSnapDistance`, every suppression
 *   and interaction flag, `pickableMeshesVersion`, `geometry`, `geometryKey` and `gltfPresentation`.
 *
 * No field here stores a copy of a value another actor owns; the camera's field of view and pose
 * belong to the view's camera session, and the render timeout to the entry's CAD actor.
 */
export type GraphicsContext = {
  /** Session-scoped (E4): human-selected display units; lengths remain stored physically in metres. */
  displayUnits: {
    length: {
      symbol: LengthSymbol;
      metersPerUnit: number;
      system: UnitSystem;
    };
  };
  /**
   * The units that are currently being used for the CAD system.
   */
  cadUnits: {
    length: {
      symbol: LengthSymbol;
    };
  };

  // Grid state
  /** The grid size that should be set based on the current camera position and fov */
  gridSizes: GridSizes;
  /** The grid size that is currently being displayed */
  gridSizesComputed: GridSizes;
  /** Whether the grid size should be locked to the computed value */
  isGridSizeLocked: boolean;

  /** Projection-neutral visible vertical span supplied by the active renderer. */
  cameraVisibleSpan: number;
  /** Physical bounding-sphere radius in metres. */
  geometryRadius: number;
  /** Physical geometry-bounds center in the Tau root frame, measured in metres. */
  geometryCenter: [number, number, number];

  // Visibility state
  enableSurfaces: boolean;
  enableLines: boolean;
  enableGizmo: boolean;
  enableGrid: boolean;
  enableAxes: boolean;
  enableMatcap: boolean;
  enablePostProcessing: boolean;
  upDirection: 'x' | 'y' | 'z';
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
  /** Current section translation in physical metres. */
  sectionViewTranslation: number;
  sectionViewRotation: [number, number, number]; // Euler rotation as tuple [x, y, z]
  sectionViewDirection: 1 | -1; // Normal direction multiplier
  /** Physical Tau-root pivot in metres that the clipping plane passes through. */
  sectionViewPivot: [number, number, number];
  enableClippingLines: boolean; // Whether to cut lines
  enableClippingMesh: boolean; // Whether to cut meshes

  // Measure state
  isMeasureActive: boolean;
  measurements: Array<{
    id: string;
    frameId: string;
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
  /** Requested-versus-presented GLTF identity and bounded renderer handoff measurements. */
  gltfPresentation: GltfPresentationProjection;
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
  | { type: 'gltfPreparationStarted'; revision: number; key: string }
  | {
      type: 'gltfDisplayReady';
      revision: number;
      key: string;
      barrier: GltfPresentationBarrier;
    }
  | { type: 'gltfAnalysisReady'; revision: number; key: string }
  | {
      type: 'gltfPresentationCommitted';
      revision: number;
      key: string;
      unitId: string;
      manifest: GeometryComponentManifest;
    }
  | { type: 'gltfPresentationFailed'; revision: number; key: string }
  | { type: 'gltfPresentationMeasured'; telemetry: GltfPresentationTelemetry }
  // Model/component interaction events
  | {
      type: 'loadModelComponentManifest';
      unitId: string;
      manifest: GeometryComponentManifest;
      source?: ModelInteractionSource;
    }
  | {
      type: 'clearModelComponentManifest';
      unitId: string;
      source?: ModelInteractionSource;
    }
  | {
      type: 'setHoveredModelComponent';
      unitId: string;
      componentId: string | undefined;
      source?: ModelInteractionSource;
    }
  | {
      type: 'toggleModelComponentSelection';
      unitId: string;
      componentId: string;
      source?: ModelInteractionSource;
    }
  | {
      type: 'selectModelComponent';
      unitId: string;
      componentId: string;
      source?: ModelInteractionSource;
    }
  | {
      type: 'clearModelComponentSelection';
      unitId: string;
      source?: ModelInteractionSource;
    }
  | {
      type: 'hideModelComponent';
      unitId: string;
      componentId: string;
      source?: ModelInteractionSource;
    }
  | {
      type: 'showModelComponent';
      unitId: string;
      componentId: string;
      source?: ModelInteractionSource;
    }
  | {
      type: 'showHiddenModelComponents';
      unitId: string;
      source?: ModelInteractionSource;
    }
  | {
      type: 'isolateModelComponent';
      unitId: string;
      componentId: string;
      source?: ModelInteractionSource;
    }
  | {
      type: 'clearModelComponentIsolation';
      unitId: string;
      source?: ModelInteractionSource;
    }
  | {
      type: 'setModelComponentOpacity';
      unitId: string;
      componentId: string;
      opacity: number;
      source?: ModelInteractionSource;
    }
  | {
      type: 'resetModelComponentOpacities';
      unitId: string;
      source?: ModelInteractionSource;
    }
  | {
      type: 'focusModelComponent';
      unitId: string;
      componentId: string;
      source?: ModelInteractionSource;
    }
  | {
      type: 'clearModelComponentFocus';
      unitId: string;
      source?: ModelInteractionSource;
    }
  // Scene radius update from Three.js bounding sphere (sent by Stage)
  | {
      type: 'sceneRadiusUpdated';
      radius: number;
      centerMeters: [number, number, number];
    };

// Emitted events
export type GraphicsEmitted =
  | { type: 'gridUpdated'; sizes: GridSizes }
  | { type: 'viewResetRequested' }
  | { type: 'geometryRadiusCalculated'; radius: number };

/**
 * Create-only seed. The durable half is exactly the keys this machine owns (Law 1), so a new
 * owned key reaches the actor without a second mapping.
 */
export type GraphicsInput = Partial<GraphicsOwnedSettings> & {
  measureSnapDistance?: number; // Default 20px
  modelInteractionRef?: ModelInteractionRef;
};

type GraphicsSnapshot = SnapshotFrom<typeof graphicsMachine>;

type LengthUnitData = {
  unit: string;
  symbol: LengthSymbol;
  factor: number;
  system: UnitSystem;
};

function getLengthUnitData(symbol: LengthSymbol): LengthUnitData {
  const unit = getLengthUnit(symbol);
  return { unit: unit.label, symbol, factor: metersPerLengthUnit(symbol), system: unit.system };
}

/**
 * Grid size calculation logic with unit system handling
 *
 * Metric Units (mm, cm, m, etc.):
 * - Visual grid spacing is ALWAYS the same baseline calculation regardless of unit
 * - Returned GridSizes values are in base metric units (no factor applied)
 * - Display layers divide physical metre sizes by `displayUnits.length.metersPerUnit`
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
  const safeSize = largeSize * scalingFactor;
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

/**
 * Create-only section-view seed (E2). The persisted cut is applied to context directly -- replaying
 * `selectSectionView` would re-derive the pivot and rotation from the geometry centre. The
 * translation is the pivot's projection on the plane axis, so it is derived rather than restored.
 */
function createSectionViewSeed(
  sectionView: GraphicsOwnedSettings['sectionView'],
  sectionDisplay: GraphicsOwnedSettings['sectionDisplay'],
): Pick<
  GraphicsContext,
  | 'isSectionViewActive'
  | 'selectedSectionViewId'
  | 'planeName'
  | 'sectionViewTranslation'
  | 'sectionViewRotation'
  | 'sectionViewDirection'
  | 'sectionViewPivot'
  | 'enableClippingLines'
  | 'enableClippingMesh'
> {
  const plane = sectionView?.plane;
  const pivot: [number, number, number] = sectionView?.pivot ?? [0, 0, 0];
  return {
    isSectionViewActive: sectionView?.active ?? false,
    selectedSectionViewId: plane,
    planeName: sectionDisplay?.planeName ?? 'face',
    sectionViewTranslation: plane ? dot(getBaseAxis(plane), pivot) : 0,
    sectionViewRotation: sectionView?.rotation ?? [0, 0, 0],
    sectionViewDirection: sectionView?.direction ?? -1,
    sectionViewPivot: pivot,
    enableClippingLines: sectionDisplay?.clipLines ?? true,
    enableClippingMesh: sectionDisplay?.clipMesh ?? true,
  };
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
// then convert it back to the metre world unit.
function roundTranslationToUnitDecimals(valueInBase: number, unitFactor: number, decimals = 2): number {
  const factor = unitFactor === 0 ? 1 : unitFactor;
  const valueInUnit = valueInBase / factor;
  const multiplier = 10 ** decimals;
  const roundedInUnit = Math.round(valueInUnit * multiplier) / multiplier;
  return roundedInUnit * factor;
}

const graphicsActors = {
  probeWebGpu: createAsyncLogic({ run: async () => probeWebGpuSupport() }),
  modelInteraction: modelInteractionMachine,
};

type GraphicsEnqueue = EnqueueObject<GraphicsEvent, GraphicsEmitted, SystemRegistry, typeof graphicsActors>;
type GraphicsPatch = Partial<GraphicsContext>;
type ModelInteractionMessage = Parameters<ModelInteractionRef['send']>[0];

/** Every model/component command is the model-interaction actor's to apply. */
const forwardToModelInteraction = (
  context: GraphicsContext,
  enq: GraphicsEnqueue,
  message: ModelInteractionMessage,
): void => {
  enq.sendTo(context.modelInteractionRef, message);
};

const clearViewerHover = (context: GraphicsContext, enq: GraphicsEnqueue, source: ModelInteractionSource): void => {
  if (context.modelInteractionUnitId) {
    forwardToModelInteraction(context, enq, {
      type: 'setHoveredComponent',
      unitId: context.modelInteractionUnitId,
      componentId: undefined,
      source,
    });
  }
};

const gltfRequestMatches = (context: GraphicsContext, event: Readonly<{ revision: number; key: string }>): boolean =>
  event.revision === context.gltfPresentation.requestedRevision && event.key === context.gltfPresentation.requestedKey;

/* The displayed translation is the pivot's projection on the base axis, rounded
 * at the selected display-unit precision. Both callers read the pivot this
 * event started from, exactly as the property assigners they replace did. */
const projectedTranslation = (context: GraphicsContext, pivot: [number, number, number]): number =>
  roundTranslationToUnitDecimals(
    dot(getBaseAxis(context.selectedSectionViewId), pivot),
    context.displayUnits.length.metersPerUnit,
    2,
  );

const beginMeasureHoverSuppression = (context: GraphicsContext, enq: GraphicsEnqueue): GraphicsPatch => {
  if (!context.viewerHoverSuppressionReasons.includes('measureTool')) {
    clearViewerHover(context, enq, 'viewer');
  }
  return {
    modelPointerClickSuppressionReasons: addSuppressionReason(
      context.modelPointerClickSuppressionReasons,
      'measureTool',
    ),
    viewerHoverSuppressionReasons: addSuppressionReason(context.viewerHoverSuppressionReasons, 'measureTool'),
  };
};

const endMeasureHoverSuppression = (context: GraphicsContext): GraphicsPatch => ({
  modelPointerClickSuppressionReasons: removeSuppressionReason(
    context.modelPointerClickSuppressionReasons,
    'measureTool',
  ),
  viewerHoverSuppressionReasons: removeSuppressionReason(context.viewerHoverSuppressionReasons, 'measureTool'),
});

const selectSectionView = (
  context: GraphicsContext,
  payload: GraphicsContext['selectedSectionViewId'],
): GraphicsPatch => ({
  selectedSectionViewId: payload,
  // Reset translation, pivot and rotation when changing planes
  sectionViewTranslation: payload === undefined ? 0 : dot(getBaseAxis(payload), context.geometryCenter),
  sectionViewPivot: payload === undefined ? [0, 0, 0] : [...context.geometryCenter],
  sectionViewRotation: [0, 0, 0],
});

/** Enter measuring from a section view: the cut switches off, the tool's hover suppression starts. */
const measureFromSectionView = (
  {
    context,
    event,
  }: Readonly<{ context: GraphicsContext; event: Extract<GraphicsEvent, { type: 'setMeasureActive' }> }>,
  enq: GraphicsEnqueue,
) =>
  event.payload
    ? {
        target: '#graphics.operational.measure.selecting',
        context: { isSectionViewActive: false, isMeasureActive: true, ...beginMeasureHoverSuppression(context, enq) },
      }
    : undefined;

const leaveSectionView = ({ event }: Readonly<{ event: Extract<GraphicsEvent, { type: 'setSectionViewActive' }> }>) =>
  event.payload ? undefined : { target: '#graphics.operational.ready', context: { isSectionViewActive: false } };

/** Enter a section view from measuring; the measurements stay where they are. */
const sectionViewFromMeasure = ({
  context,
  event,
}: Readonly<{ context: GraphicsContext; event: Extract<GraphicsEvent, { type: 'setSectionViewActive' }> }>) => {
  if (!event.payload) {
    return undefined;
  }
  return {
    target:
      context.selectedSectionViewId === undefined
        ? '#graphics.operational.section-view.pending'
        : '#graphics.operational.section-view.active',
    context: {
      isMeasureActive: false,
      currentMeasurementStart: undefined,
      ...endMeasureHoverSuppression(context),
      isSectionViewActive: true,
    },
  };
};

const setSectionViewVisualization = ({
  context,
  event,
}: Readonly<{ context: GraphicsContext; event: Extract<GraphicsEvent, { type: 'setSectionViewVisualization' }> }>) => ({
  context: { sectionViewVisualization: { ...context.sectionViewVisualization, ...event.payload } },
});

const setClippingLinesEnabled = ({
  event,
}: Readonly<{ event: Extract<GraphicsEvent, { type: 'setClippingLinesEnabled' }> }>) => ({
  context: { enableClippingLines: event.payload },
});

const setClippingMeshEnabled = ({
  event,
}: Readonly<{ event: Extract<GraphicsEvent, { type: 'setClippingMeshEnabled' }> }>) => ({
  context: { enableClippingMesh: event.payload },
});

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
  actors: graphicsActors,
  schemas: {
    context: types<GraphicsContext>(),
    events: eventSchemas<GraphicsEvent>(),
    input: types<GraphicsInput>(),
    emitted: eventSchemas<GraphicsEmitted>(),
  },
}).createMachine({
  id: 'graphics',

  invoke: [
    {
      src: 'probeWebGpu',
      id: 'probeWebGpuInvocation',
      onDone: ({ context, event }) => {
        const output = typeof event.output === 'boolean' ? event.output : false;
        return {
          context: {
            webGpuAvailable: output,
            resolvedGraphicsBackend: resolveGraphicsBackendPreference(context.graphicsBackendPreference, output),
          },
        };
      },
      /** Probe actor rejected / threw — pessimistic fallback. */
      onError: ({ context }) => ({
        context: {
          webGpuAvailable: false,
          resolvedGraphicsBackend: resolveGraphicsBackendPreference(context.graphicsBackendPreference, false),
        },
      }),
    },
  ],

  context: ({ input, spawn, actors }) => {
    const preference = input.graphicsBackend ?? 'webgl';
    const ownsModelInteractionRef = input.modelInteractionRef === undefined;
    const modelInteractionRef =
      input.modelInteractionRef ??
      spawn(actors.modelInteraction, {
        id: 'model-interaction',
        input: {},
      });

    return {
      // Grid state
      gridSizes: { smallSize: 0.001, largeSize: 0.01 },
      gridSizesComputed: { smallSize: 0.001, largeSize: 0.01 },
      isGridSizeLocked: false,
      displayUnits: {
        length: {
          symbol: 'mm',
          metersPerUnit: 1e-3,
          system: 'si',
        },
      },
      cadUnits: {
        length: {
          symbol: 'mm', // Default to mm
        },
      },

      // Camera state
      cameraVisibleSpan: 0.002,
      geometryRadius: 0,
      geometryCenter: [0, 0, 0],

      // Visibility state (from per-view settings or defaults)
      enableSurfaces: input.enableSurfaces ?? true,
      enableLines: input.enableLines ?? true,
      enableGizmo: input.enableGizmo ?? true,
      enableGrid: input.enableGrid ?? true,
      enableAxes: input.enableAxes ?? true,
      enableMatcap: input.enableMatcap ?? false,
      enablePostProcessing: input.enablePostProcessing ?? false,
      upDirection: input.upDirection ?? 'z',
      graphicsBackendPreference: preference,
      webGpuAvailable: false,
      resolvedGraphicsBackend: resolveGraphicsBackendPreference(preference, false),

      // Clipping plane state (durable per E2; the cut is entry-scoped, its display pane-scoped)
      ...createSectionViewSeed(input.sectionView, input.sectionDisplay),
      availableSectionViews: [
        { id: 'xy', normal: [0, 0, 1], constant: 0 },
        { id: 'xz', normal: [0, 1, 0], constant: 0 },
        { id: 'yz', normal: [1, 0, 0], constant: 0 },
      ],
      hoveredSectionViewId: undefined,
      sectionViewVisualization: {
        stripeColor: '#00ff00',
        stripeSpacing: 0.01,
        stripeWidth: 0.001,
      },

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
      gltfPresentation: {
        requestedRevision: 0,
        presentedRevision: 0,
        phase: 'idle',
      },
    };
  },
  exit: ({ context }, enq) => {
    if (context.ownsModelInteractionRef) {
      enq.stop(context.modelInteractionRef);
    }
  },
  initial: 'operational',
  states: {
    operational: {
      /* A seeded cut sets context directly -- replaying `selectSectionView` would reset the pivot and
       * rotation to geometry-derived values. This raise only re-enters the matching state node. */
      entry: ({ context }, enq) => {
        if (context.isSectionViewActive) {
          enq.raise({ type: 'setSectionViewActive', payload: true });
        }
      },
      initial: 'ready',
      on: {
        // Grid events
        updateGridSize: ({ context, event }, enq) => {
          if (context.isGridSizeLocked) {
            return { context: { gridSizesComputed: event.payload } };
          }
          enq.emit({ type: 'gridUpdated', sizes: event.payload });
          return { context: { gridSizes: event.payload, gridSizesComputed: event.payload } };
        },
        setGridSizeLocked: ({ context, event }) => ({
          context: { gridSizes: context.gridSizesComputed, isGridSizeLocked: event.payload },
        }),
        setGridUnit: ({ context, event, self }, enq) => {
          const unitData = getLengthUnitData(event.payload.unit);
          const previousUnitData = getLengthUnitData(context.displayUnits.length.symbol);

          const isSystemChange = previousUnitData.system !== unitData.system;
          const isImperialFactorChange =
            unitData.system === 'imperial' && context.displayUnits.length.metersPerUnit !== unitData.factor;

          // Only recalculate grid spacing when:
          // 1. Switching between si/imperial systems (visual spacing changes)
          // 2. Changing factor in imperial units (affects visual spacing)
          // For si units, factor changes only affect display numbers, not visual spacing
          if (isSystemChange || isImperialFactorChange) {
            enq.sendTo(self, {
              type: 'updateGridSize',
              payload: calculateGridSizes({
                visibleSpan: context.cameraVisibleSpan,
                gridUnitSystem: unitData.system,
                unitFactor: unitData.factor,
              }),
            });
          }
          return {
            context: {
              displayUnits: {
                length: { symbol: unitData.symbol, metersPerUnit: unitData.factor, system: unitData.system },
              },
            },
          };
        },

        // Camera events
        resetCamera: (_, enq) => {
          enq.emit({ type: 'viewResetRequested' });
          return {};
        },
        cameraViewChanged: ({ context, event, self }, enq) => {
          if (!Number.isFinite(event.verticalSpan) || event.verticalSpan <= 0) {
            return {};
          }
          // Recalculate grid sizes based on new controls state
          enq.sendTo(self, {
            type: 'updateGridSize',
            payload: calculateGridSizes({
              visibleSpan: event.verticalSpan,
              gridUnitSystem: context.displayUnits.length.system,
              unitFactor: context.displayUnits.length.metersPerUnit,
            }),
          });
          return { context: { cameraVisibleSpan: event.verticalSpan } };
        },

        // Visibility events
        setSurfaceVisibility: {
          context: ({ context, event }) => ({
            enableSurfaces: event.payload,
            pickableMeshesVersion: context.pickableMeshesVersion + 1,
          }),
        },
        setLinesVisibility: { context: ({ event }) => ({ enableLines: event.payload }) },
        setGizmoVisibility: { context: ({ event }) => ({ enableGizmo: event.payload }) },
        setGridVisibility: { context: ({ event }) => ({ enableGrid: event.payload }) },
        setAxesVisibility: { context: ({ event }) => ({ enableAxes: event.payload }) },
        setMatcapVisibility: { context: ({ event }) => ({ enableMatcap: event.payload }) },
        setPostProcessingVisibility: { context: ({ event }) => ({ enablePostProcessing: event.payload }) },
        setUpDirection: { context: ({ event }) => ({ upDirection: event.payload }) },
        setGraphicsBackendPreference: {
          context: ({ context, event }) => ({
            graphicsBackendPreference: event.payload,
            resolvedGraphicsBackend: resolveGraphicsBackendPreference(event.payload, context.webGpuAvailable),
          }),
        },

        // Plane naming and hover are global in operational state
        setPlaneName: { context: ({ event }) => ({ planeName: event.payload }) },
        setHoveredSectionView: { context: ({ event }) => ({ hoveredSectionViewId: event.payload }) },

        // Controls events
        controlsInteractionStart: {
          context: {
            cameraInteracting: true,
            cameraInteractionHadMovement: false,
            suppressNextModelPointerClick: false,
          },
        },
        controlsInteractionMoved: ({ context }, enq) => {
          if (!context.cameraInteracting) {
            return {};
          }
          if (!context.viewerHoverSuppressionReasons.includes('cameraControls')) {
            clearViewerHover(context, enq, 'viewer');
          }
          return {
            context: {
              cameraInteractionHadMovement: true,
              suppressNextModelPointerClick: true,
              viewerHoverSuppressionReasons: addSuppressionReason(
                context.viewerHoverSuppressionReasons,
                'cameraControls',
              ),
            },
          };
        },
        controlsInteractionEnd: {
          context: ({ context }) => ({
            cameraInteracting: false,
            cameraInteractionHadMovement: false,
            viewerHoverSuppressionReasons: removeSuppressionReason(
              context.viewerHoverSuppressionReasons,
              'cameraControls',
            ),
          }),
        },
        beginViewerModelHoverSuppression: ({ context, event }, enq) => {
          if (context.viewerHoverSuppressionReasons.includes(event.reason)) {
            return {};
          }
          clearViewerHover(context, enq, event.source ?? 'viewer');
          return {
            context: {
              viewerHoverSuppressionReasons: addSuppressionReason(context.viewerHoverSuppressionReasons, event.reason),
            },
          };
        },
        endViewerModelHoverSuppression: {
          context: ({ context, event }) => ({
            viewerHoverSuppressionReasons: removeSuppressionReason(context.viewerHoverSuppressionReasons, event.reason),
          }),
        },
        markModelPointerGestureMoved: { context: { suppressNextModelPointerClick: true } },
        clearModelPointerClickGuard: { context: { suppressNextModelPointerClick: false } },

        // Geometry updates
        updateGeometry: ({ context, event }, enq) => {
          const requestedRevision = context.gltfPresentation.requestedRevision + 1;
          if (event.geometry.format !== 'gltf' && event.sourceFile) {
            forwardToModelInteraction(context, enq, {
              type: 'clearManifest',
              unitId: deriveModelInteractionUnitId({ sourceFile: event.sourceFile }),
              source: 'viewer',
            });
          }
          return {
            context: {
              geometry: event.geometry,
              geometryKey: event.geometry.hash,
              gltfPresentation:
                event.geometry.format === 'gltf'
                  ? withGltfPresentationPhase(
                      { ...context.gltfPresentation, requestedRevision, requestedKey: event.geometry.hash },
                      'preparing',
                    )
                  : withGltfPresentationPhase(
                      {
                        ...context.gltfPresentation,
                        requestedRevision,
                        requestedKey: undefined,
                        presentedRevision: requestedRevision,
                        presentedKey: undefined,
                      },
                      'idle',
                    ),
              modelInteractionUnitId:
                event.geometry.format === 'gltf'
                  ? context.modelInteractionUnitId
                  : event.sourceFile
                    ? deriveModelInteractionUnitId({ sourceFile: event.sourceFile })
                    : undefined,
              pickableMeshesVersion:
                event.geometry.format === 'gltf' ? context.pickableMeshesVersion : context.pickableMeshesVersion + 1,
              cadUnits: { length: { symbol: event.units.length } },
            },
          };
        },
        gltfPreparationStarted: {
          context: ({ context, event }) => ({
            gltfPresentation: gltfRequestMatches(context, event)
              ? withGltfPresentationPhase(context.gltfPresentation, 'preparing')
              : context.gltfPresentation,
          }),
        },
        gltfDisplayReady: {
          context: ({ context, event }) => ({
            gltfPresentation: gltfRequestMatches(context, event)
              ? withGltfPresentationPhase(
                  context.gltfPresentation,
                  event.barrier === 'analysis-ready' ? 'awaiting-analysis' : 'preparing',
                )
              : context.gltfPresentation,
          }),
        },
        gltfAnalysisReady: {
          context: ({ context, event }) => ({
            gltfPresentation: gltfRequestMatches(context, event)
              ? withGltfPresentationPhase(context.gltfPresentation, 'preparing')
              : context.gltfPresentation,
          }),
        },
        gltfPresentationCommitted: ({ context, event }, enq) => {
          if (!gltfRequestMatches(context, event)) {
            return {};
          }
          forwardToModelInteraction(context, enq, {
            type: 'loadManifest',
            unitId: event.unitId,
            manifest: event.manifest,
            source: 'viewer',
          });
          return {
            context: {
              gltfPresentation: withGltfPresentationPhase(
                { ...context.gltfPresentation, presentedRevision: event.revision, presentedKey: event.key },
                'presented',
              ),
              modelInteractionUnitId: event.unitId,
              pickableMeshesVersion: context.pickableMeshesVersion + 1,
            },
          };
        },
        gltfPresentationFailed: {
          context: ({ context, event }) => ({
            gltfPresentation: gltfRequestMatches(context, event)
              ? withGltfPresentationPhase(
                  context.gltfPresentation,
                  context.gltfPresentation.presentedKey === undefined ? 'failed' : 'presented',
                )
              : context.gltfPresentation,
          }),
        },
        /* D21: the presented frame joins the worker spans that produced it, under the renderer's own
         * producer identity. The durations ride as attributes rather than as invented child spans —
         * only their total is anchored to a real clock reading, exactly as the kernels report timings. */
        gltfPresentationMeasured: ({ event }, enq) => {
          const { durations, ...attributes } = event.telemetry;
          const duration = durations.receiptToFirstFrame ?? durations.commitToFirstFrame ?? 0;
          enq(() => {
            recordRendererSpan('renderer.presentation', {
              startTime: performance.now() - duration,
              duration,
              attributes: { ...attributes, ...durations },
            });
          });
          return {};
        },
        sceneRadiusUpdated: ({ event }, enq) => {
          enq.emit({ type: 'geometryRadiusCalculated', radius: event.radius });
          return { context: { geometryRadius: event.radius, geometryCenter: event.centerMeters } };
        },

        // Model/component interaction
        loadModelComponentManifest: ({ context, event }, enq) => {
          forwardToModelInteraction(context, enq, {
            type: 'loadManifest',
            unitId: event.unitId,
            manifest: event.manifest,
            source: event.source,
          });
          return { context: { modelInteractionUnitId: event.unitId } };
        },
        clearModelComponentManifest: ({ context, event }, enq) => {
          forwardToModelInteraction(context, enq, {
            type: 'clearManifest',
            unitId: event.unitId,
            source: event.source,
          });
          return {};
        },
        setHoveredModelComponent: ({ context, event }, enq) => {
          forwardToModelInteraction(context, enq, {
            type: 'setHoveredComponent',
            unitId: event.unitId,
            componentId: event.componentId,
            source: event.source,
          });
          return {};
        },
        toggleModelComponentSelection: ({ context, event }, enq) => {
          forwardToModelInteraction(context, enq, {
            type: 'toggleComponentSelection',
            unitId: event.unitId,
            componentId: event.componentId,
            source: event.source,
          });
          return {};
        },
        selectModelComponent: ({ context, event }, enq) => {
          forwardToModelInteraction(context, enq, {
            type: 'selectComponent',
            unitId: event.unitId,
            componentId: event.componentId,
            source: event.source,
          });
          return {};
        },
        clearModelComponentSelection: ({ context, event }, enq) => {
          forwardToModelInteraction(context, enq, {
            type: 'clearSelection',
            unitId: event.unitId,
            source: event.source,
          });
          return {};
        },
        hideModelComponent: ({ context, event }, enq) => {
          forwardToModelInteraction(context, enq, {
            type: 'hideComponent',
            unitId: event.unitId,
            componentId: event.componentId,
            source: event.source,
          });
          return {};
        },
        showModelComponent: ({ context, event }, enq) => {
          forwardToModelInteraction(context, enq, {
            type: 'showComponent',
            unitId: event.unitId,
            componentId: event.componentId,
            source: event.source,
          });
          return {};
        },
        showHiddenModelComponents: ({ context, event }, enq) => {
          forwardToModelInteraction(context, enq, {
            type: 'showHiddenComponents',
            unitId: event.unitId,
            source: event.source,
          });
          return {};
        },
        isolateModelComponent: ({ context, event }, enq) => {
          forwardToModelInteraction(context, enq, {
            type: 'isolateComponent',
            unitId: event.unitId,
            componentId: event.componentId,
            source: event.source,
          });
          return {};
        },
        clearModelComponentIsolation: ({ context, event }, enq) => {
          forwardToModelInteraction(context, enq, {
            type: 'clearIsolation',
            unitId: event.unitId,
            source: event.source,
          });
          return {};
        },
        setModelComponentOpacity: ({ context, event }, enq) => {
          forwardToModelInteraction(context, enq, {
            type: 'setComponentOpacity',
            unitId: event.unitId,
            componentId: event.componentId,
            opacity: event.opacity,
            source: event.source,
          });
          return {};
        },
        resetModelComponentOpacities: ({ context, event }, enq) => {
          forwardToModelInteraction(context, enq, {
            type: 'resetComponentOpacities',
            unitId: event.unitId,
            source: event.source,
          });
          return {};
        },
        focusModelComponent: ({ context, event }, enq) => {
          forwardToModelInteraction(context, enq, {
            type: 'focusComponent',
            unitId: event.unitId,
            componentId: event.componentId,
            source: event.source,
          });
          return {};
        },
        clearModelComponentFocus: ({ context, event }, enq) => {
          forwardToModelInteraction(context, enq, { type: 'clearFocus', unitId: event.unitId, source: event.source });
          return {};
        },
        // Section view physical pivot updates.
        setSectionViewPivot: {
          context: ({ context, event }) => ({
            sectionViewPivot: event.payload,
            sectionViewTranslation: projectedTranslation(context, event.payload),
          }),
        },

        // Measurement events (available in all operational states)
        clearMeasurement: {
          context: ({ context, event }) => ({
            measurements: context.measurements.filter((m) => m.id !== event.payload),
          }),
        },
        setHoveredMeasurement: { context: ({ event }) => ({ hoveredMeasurementId: event.payload }) },
        setMeasurementName: {
          context: ({ context, event }) => ({
            measurements: context.measurements.map((m) => (m.id === event.id ? { ...m, name: event.name } : m)),
          }),
        },
        toggleMeasurementPinned: {
          context: ({ context, event }) => ({
            measurements: context.measurements.map((m) => (m.id === event.id ? { ...m, isPinned: !m.isPinned } : m)),
          }),
        },
        clearUnpinnedMeasurements: {
          context: ({ context }) => ({ measurements: context.measurements.filter((m) => m.isPinned) }),
        },
      },
      states: {
        ready: {
          on: {
            setSectionViewActive: ({ context, event }) => {
              if (!event.payload) {
                return undefined;
              }
              return {
                target: context.selectedSectionViewId === undefined ? 'section-view.pending' : 'section-view.active',
                context: { isSectionViewActive: true },
              };
            },
            setMeasureActive: ({ context, event }, enq) =>
              event.payload
                ? {
                    target: 'measure.selecting',
                    context: { isMeasureActive: true, ...beginMeasureHoverSuppression(context, enq) },
                  }
                : undefined,
          },
        },

        'section-view': {
          initial: 'pending',
          states: {
            pending: {
              on: {
                setSectionViewActive: leaveSectionView,
                setMeasureActive: measureFromSectionView,
                selectSectionView: ({ context, event }) =>
                  event.payload === undefined
                    ? undefined
                    : { target: 'active', context: selectSectionView(context, event.payload) },
                setSectionViewVisualization,
                setClippingLinesEnabled,
                setClippingMeshEnabled,
              },
            },

            active: {
              on: {
                setSectionViewActive: leaveSectionView,
                setMeasureActive: measureFromSectionView,
                selectSectionView: ({ context, event }) =>
                  event.payload === undefined
                    ? { target: 'pending', context: selectSectionView(context, event.payload) }
                    : { context: selectSectionView(context, event.payload) },
                /* Move the pivot along the CURRENT rotated normal, preserving the component
                 * perpendicular to that normal so no jump occurs. The displayed translation is the
                 * projection of the pivot this event started from, as it always was. */
                setSectionViewTranslation: {
                  context: ({ context, event }) => {
                    // Round the physical metre value at the selected display-unit precision.
                    const desired = roundTranslationToUnitDecimals(
                      event.payload,
                      context.displayUnits.length.metersPerUnit,
                      2,
                    );

                    const a = getBaseAxis(context.selectedSectionViewId); // Base axis
                    const r = normalize(rotateVectorByEuler(a, context.sectionViewRotation)); // Rotated normal

                    const p = context.sectionViewPivot;
                    const pr = dot(p, r);
                    const pParallelR = scale(r, pr);
                    const pPerpR = sub(p, pParallelR);

                    const denom = dot(a, r);
                    const s = Math.abs(denom) > 1e-6 ? (desired - dot(a, pPerpR)) / denom : desired;
                    return {
                      sectionViewPivot: add(pPerpR, scale(r, s)),
                      sectionViewTranslation: projectedTranslation(context, context.sectionViewPivot),
                    };
                  },
                },
                /* Rotation does not change the pivot. Ensure displayed translation stays
                 * consistent with pivot projection onto the base axis. */
                setSectionViewRotation: {
                  context: ({ context, event }) => {
                    const [rx, ry, rz] = event.payload;
                    return {
                      sectionViewRotation: [
                        clampRadiansToNearestDegree(rx),
                        clampRadiansToNearestDegree(ry),
                        clampRadiansToNearestDegree(rz),
                      ],
                      sectionViewTranslation: projectedTranslation(context, context.sectionViewPivot),
                    };
                  },
                },
                toggleSectionViewDirection: {
                  context: ({ context }) => ({ sectionViewDirection: context.sectionViewDirection === 1 ? -1 : 1 }),
                },
                setSectionViewDirection: { context: ({ event }) => ({ sectionViewDirection: event.payload }) },
                setSectionViewVisualization,
                setClippingLinesEnabled,
                setClippingMeshEnabled,
              },
            },
          },
        },

        measure: {
          initial: 'selecting',
          states: {
            selecting: {
              on: {
                setMeasureActive: ({ context, event }) =>
                  event.payload
                    ? undefined
                    : {
                        target: '#graphics.operational.ready',
                        context: { isMeasureActive: false, ...endMeasureHoverSuppression(context) },
                      },
                setSectionViewActive: sectionViewFromMeasure,
                startMeasurement: {
                  target: 'selected',
                  context: ({ event }) => ({ currentMeasurementStart: event.payload }),
                },
                clearAllMeasurements: { context: { measurements: [], currentMeasurementStart: undefined } },
              },
            },

            selected: {
              on: {
                setMeasureActive: ({ context, event }) =>
                  event.payload
                    ? undefined
                    : {
                        target: '#graphics.operational.ready',
                        context: {
                          measurements: [],
                          currentMeasurementStart: undefined,
                          isMeasureActive: false,
                          ...endMeasureHoverSuppression(context),
                        },
                      },
                setSectionViewActive: sectionViewFromMeasure,
                completeMeasurement: ({ context, event }) => {
                  const start = context.currentMeasurementStart;
                  if (!start) {
                    return { target: 'selecting', context: { currentMeasurementStart: undefined } };
                  }
                  const end = event.payload;
                  return {
                    target: 'selecting',
                    context: {
                      measurements: [
                        ...context.measurements,
                        {
                          id: generatePrefixedId(idPrefix.measurement),
                          frameId: 'tau:root',
                          startPoint: start,
                          endPoint: end,
                          distance: Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]),
                          isPinned: false,
                        },
                      ],
                      currentMeasurementStart: undefined,
                    },
                  };
                },
                cancelCurrentMeasurement: { target: 'selecting', context: { currentMeasurementStart: undefined } },
                clearMeasurement: {
                  context: ({ context, event }) => ({
                    measurements: context.measurements.filter((m) => m.id !== event.payload),
                  }),
                },
                clearAllMeasurements: {
                  target: 'selecting',
                  context: { measurements: [], currentMeasurementStart: undefined },
                },
              },
            },
          },
        },
      },
    },
  },
});

export const selectPresentedGeometryKey = (snapshot: GraphicsSnapshot): string =>
  snapshot.context.gltfPresentation.presentedKey ?? snapshot.context.geometryKey;
