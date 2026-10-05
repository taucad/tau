import { createAsyncLogic, setup, types } from 'xstate';
import type { ActorRefFrom, EnqueueObject, SnapshotFrom, SystemRegistry } from 'xstate';
import { eventSchemas } from '#lib/xstate.lib.js';
import type { GeometryComponentManifest, GridSizes } from '@taucad/types';
import type { KnownArtifact, SourceRevision } from '@taucad/runtime';
import { idPrefix } from '@taucad/types/constants';
import { getLengthUnit, metersPerLengthUnit } from '#constants/length-units.js';
import type { LengthSymbol, UnitSystem } from '#constants/length-units.js';
import { generatePrefixedId } from '@taucad/utils/id';
import type {
  GraphicsBackendPreference,
  GraphicsOwnedSettings,
  PersistedSectionView,
  PinnedMeasurement,
  ResolvedGraphicsBackend,
} from '#constants/editor.constants.js';
import {
  probeWebGpuSupport,
  resolveGraphicsBackendPreference,
} from '#components/geometry/graphics/graphics-backend.js';
import {
  applySectionCutPatch,
  createDefaultPlaneCut,
  createDefaultRevolutionCut,
  maxSectionCuts,
} from '#components/geometry/graphics/section-cuts.js';
import type {
  SectionAxis,
  SectionCut,
  SectionCutPatch,
  SectionPlane,
  SectionVector,
} from '#components/geometry/graphics/section-cuts.js';
import { recordRendererSpan } from '#lib/renderer-telemetry.js';
import { deriveModelInteractionUnitId, modelInteractionMachine } from '#machines/model-interaction.machine.js';
import type { ModelInteractionSource, ViewerHoverSuppressionReason } from '#machines/model-interaction.machine.js';
import { kinematicsMachine } from '#machines/kinematics.machine.js';
import type { MeasurementAnchor, MeasurementRecord, MeasurementOperation } from '#constants/measurement.types.js';

/** Actual pane subscription provenance; retains identities and source digests, never a document or artifact. */
export type PaneRenderingProvenance = Readonly<{
  documentId: string;
  evaluationId: string;
  requestId: string;
  hash: string;
  sourceRevision: SourceRevision;
  isCurrent: () => boolean;
}>;

export type ModelInteractionRef = ActorRefFrom<typeof modelInteractionMachine>;
export type KinematicsRef = ActorRefFrom<typeof kinematicsMachine>;

export type ModelPointerClickSuppressionReason = 'measureTool';

export type GltfPresentationBarrier = 'display-ready' | 'analysis-ready';

const markMeasurementsOutOfDate = (
  measurements: MeasurementRecord[],
  matches: (measurement: MeasurementRecord) => boolean,
): MeasurementRecord[] => {
  if (!measurements.some((measurement) => measurement.status !== 'out-of-date' && matches(measurement))) {
    return measurements;
  }
  return measurements.map((measurement) =>
    measurement.status !== 'out-of-date' && matches(measurement)
      ? { ...measurement, status: 'out-of-date' }
      : measurement,
  );
};
/** Private renderer policy; projected error is approximate appearance deviation, not a geometry guarantee. */
export type AssemblyDetailPolicy = Readonly<{
  triangleRatio: number;
  approximateRelativeError: number;
  screenSpace?: Readonly<{ maxApproximatePixelError: number; enterDetailRatio: number }>;
}>;

export type AssemblyDetailCalibration = AssemblyDetailPolicy &
  Readonly<{
    screenSpace: NonNullable<AssemblyDetailPolicy['screenSpace']>;
  }>;

/** Validate the ephemeral calibration seam without accepting unbounded or non-finite settings. */
export function isAssemblyDetailCalibration(value: unknown): value is AssemblyDetailCalibration {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('triangleRatio' in value) ||
    !('approximateRelativeError' in value) ||
    !('screenSpace' in value)
  ) {
    return false;
  }
  const { triangleRatio, approximateRelativeError, screenSpace } = value;
  if (
    typeof triangleRatio !== 'number' ||
    !Number.isFinite(triangleRatio) ||
    triangleRatio <= 0 ||
    triangleRatio >= 1 ||
    typeof approximateRelativeError !== 'number' ||
    !Number.isFinite(approximateRelativeError) ||
    approximateRelativeError < 0 ||
    typeof screenSpace !== 'object' ||
    screenSpace === null ||
    !('maxApproximatePixelError' in screenSpace) ||
    !('enterDetailRatio' in screenSpace)
  ) {
    return false;
  }
  const { maxApproximatePixelError, enterDetailRatio } = screenSpace;
  return (
    typeof maxApproximatePixelError === 'number' &&
    Number.isFinite(maxApproximatePixelError) &&
    maxApproximatePixelError > 0 &&
    typeof enterDetailRatio === 'number' &&
    Number.isFinite(enterDetailRatio) &&
    enterDetailRatio > 0 &&
    enterDetailRatio < 1
  );
}

export type GltfPresentationTelemetry = Readonly<{
  /** Actual candidate scene identity; absent when preparation failed before a bundle existed. */
  candidateSceneId?: string;
  revision: number;
  key: string;
  backend: ResolvedGraphicsBackend;
  barrier: GltfPresentationBarrier;
  outcome: 'presented' | 'failed' | 'cancelled' | 'stale';
  glbBytes: number;
  /** Candidate-local resource accounting; GPU/image/BVH fields are estimates, not browser heap measurements. */
  assemblyResources?: Readonly<{
    validatedSourceBytes: number;
    residentCompressedBytes: number;
    geometryCpuBytes: number;
    geometryGpuBytesEstimate: number;
    instanceAttributeCpuBytes: number;
    instanceAttributeGpuBytesEstimate: number;
    instanceSlotDescriptorsSerializedBytes: number;
    /** Exact unique resident ArrayBuffer sizes; excludes object heaps and unmeasured transients. */
    exactResidentBufferCpuBytes: number;
    currentAndCandidateExactBufferCpuBytes: number;
    detailGeometryCount: number;
    detailUploadGpuBytesEstimate: number;
    detailDecisionSerializedBytes: number;
    detailCalibration?: Readonly<{
      maxProjectedApproximateErrorPixels: number;
      projectionUnavailableCount: number;
      selectedFullEvidenceCount: number;
    }>;
    edgeCpuBytes: number;
    edgeGpuBytesEstimate: number;
    surfaceBatchCount: number;
    edgeBatchCount: number;
    wrapperObjectCount: number;
    canonicalSurfaceTriangleCount: number;
    detailSurfaceTriangleCount: number;
    /** Authored fat-line draw geometry index triangles times segment instances, not raster submissions. */
    mandatoryEdgeTriangleCount: number;
    unmeasuredInventory: readonly string[];
    textureCpuBytesEstimate: number;
    textureGpuBytesEstimate: number;
    texturesWithUnknownSize: number;
    bvhTreeCount: number;
    bvhTreesWithUnknownSize: number;
    /** Known-version object graph estimate; unknown tree sizes are reported separately. */
    bvhBytesEstimate: number;
    metadataSerializedBytes: number;
    demandIndexCpuBytes: number;
    demandDescriptorsSerializedBytes: number;
    parserJsonSerializedBytes: number;
    parsedDependencyCpuBytes: number;
    parserObjectCount: number;
    currentAndCandidateBytesEstimate: number;
    definitionCount: number;
    residentOccurrenceCount: number;
    queuedPreparationCount: number;
    sceneObjectCount: number;
    materialCount: number;
  }>;
  /** Submission is a CPU boundary; pixels require browser or GPU evidence. */
  renderBoundary?: 'submitted';
  meshCount: number;
  triangleCount: number;
  sourceLineCount: number;
  lineSegmentCount: number;
  durations: Readonly<
    Partial<
      Record<
        | 'receiptToPreparation'
        | 'parse'
        /** Present only when the result was written into the presented buffers in place (D22). */
        | 'inPlace'
        | 'manifest'
        | 'annotation'
        | 'topologySubmit'
        | 'topologyWorker'
        | 'topologyPack'
        | 'topologyHydrate'
        | 'topologyResolve'
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
  /** Observed loader concurrency and work; cumulative for this viewer owner. */
  activeParses?: number;
  activeParseHighWaterMark?: number;
  parsesStarted?: number;
  parsesDiscarded?: number;
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
 *   the pinned half of `measurements`, and the section view -- `isSectionViewActive` and the values of
 *   `sectionCuts` (entry-scoped; the cut ids are made anew at every seed).
 * - **session** -- survives an in-app revisit because this actor is retained, and is lost on reload
 *   by decision: `displayUnits.length` (the grid unit symbol, session-scoped by ruling E4),
 *   `isGridSizeLocked`, `isMeasureActive`, the unpinned half of `measurements`,
 *   `currentMeasurementStart`, `modelInteractionUnitId` and `selectedSectionCutId`.
 * - **ephemeral** -- derived from geometry, the canvas or a pointer on every mount, never seeded:
 *   `gridSizes`, `gridSizesComputed`, `cadUnits`, `cameraVisibleSpan`, `geometryRadius`,
 *   `geometryCenter`, `resolvedGraphicsBackend`, `webGpuAvailable`, `hoveredSectionCutId`,
 *   `committedSectionCuts` and `sectionCertification` (what the caps last certified),
 *   `hoveredMeasurementId`, `measureSnapDistance`, every
 *   suppression and interaction flag, `pickableMeshesVersion`, `artifact`, `artifactKey`,
 *   `artifactSourceFile` and `gltfPresentation`.
 *
 * No field here stores a copy of a value another actor owns; the camera's field of view and pose
 * belong to the view's camera session, and the render timeout to the entry's CAD actor.
 */
export type GraphicsContext = {
  /** Ephemeral calibration input; production default must follow actual pixel/backend calibration. */
  assemblyDetailCalibration?: AssemblyDetailCalibration;
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

  // Section view state
  isSectionViewActive: boolean;
  /** The section's cuts in order, at most `maxSectionCuts`; the removed volume is their union. */
  sectionCuts: readonly SectionCut[];
  /** The cut whose editor and handles show. */
  selectedSectionCutId: string | undefined;
  /** The cut hovered in the section row or the scene; both highlight it. */
  hoveredSectionCutId: string | undefined;
  /** The cut list the clip, caps and raycasts show: the latest one whose every cap face certified. */
  committedSectionCuts: readonly SectionCut[];
  /**
   * Whether the caps certified the latest cut list they drew, or refused it and still show `committedSectionCuts`.
   * A certified list's caps are complete, though its exact overlap result may still be pending.
   */
  sectionCertification: 'certified' | 'rejected';

  // Measure state
  isMeasureActive: boolean;
  measurements: MeasurementRecord[];
  currentMeasurementStart: [number, number, number] | undefined;
  currentMeasurementAnchor?: MeasurementAnchor;
  measureMode: 'auto' | 'point';
  measureFrame: 'tau:root' | 'selected-local';
  measureSnapEnabled: boolean;
  measureOperation: MeasurementOperation;
  measureFilter: 'auto' | 'point' | 'edge' | 'face' | 'circle' | 'body';
  measureLockedTargetId?: string;
  measureCandidates: Array<{ id: string; label: string }>;
  measureActiveCandidateId?: string;
  measureChosenCandidateId?: string;
  measureCommitRequest: number;
  measureCatalogRequest: number;
  measureCatalogAppend: boolean;
  measureCatalogHasMore: boolean;
  measureMessage?: string;
  measurePreviewDistance?: number;
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
  /** Per-view mechanism pose, keyed by the same unit ids as model interaction. */
  kinematicsRef: KinematicsRef;

  // Geometry data from CAD
  artifact: KnownArtifact | undefined;
  /** Runtime-stamped projection hash, used for skip-when-unchanged optimizations. */
  artifactKey: string;
  /** Source identity travels with the artifact through the renderer handoff. */
  artifactSourceFile?: string;
  /** Read authority belongs to the still-current pane subscription, independently of the CAD default view. */
  paneRendering?: PaneRenderingProvenance;
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
  | { type: 'fitView' }
  | { type: 'cameraViewChanged'; verticalSpan: number }
  // Visibility events
  | { type: 'setAssemblyDetailCalibration'; calibration?: AssemblyDetailCalibration }
  | { type: 'setSurfaceVisibility'; payload: boolean }
  | { type: 'setLinesVisibility'; payload: boolean }
  | { type: 'setGizmoVisibility'; payload: boolean }
  | { type: 'setGridVisibility'; payload: boolean }
  | { type: 'setAxesVisibility'; payload: boolean }
  | { type: 'setMatcapVisibility'; payload: boolean }
  | { type: 'setPostProcessingVisibility'; payload: boolean }
  | { type: 'setUpDirection'; payload: 'x' | 'y' | 'z' }
  | { type: 'setGraphicsBackendPreference'; payload: GraphicsBackendPreference }
  // Section view events
  /** Turning the section on with no cuts adds the default plane, removing the side `viewDirection` faces. */
  | { type: 'setSectionViewActive'; payload: boolean; viewDirection?: SectionVector }
  | { type: 'adoptSectionView'; section: PersistedSectionView }
  /** Adds a cut with the defaults, selects it and turns the section on. Refused at `maxSectionCuts`. */
  | { type: 'addSectionCut'; payload: AddSectionCutPayload }
  /** A patch that changes no value keeps the snapshot. */
  | { type: 'updateSectionCut'; payload: { id: string; patch: SectionCutPatch } }
  /** Removing the last cut turns the section off. */
  | { type: 'removeSectionCut'; payload: string }
  | { type: 'selectSectionCut'; payload: string | undefined }
  | { type: 'hoverSectionCut'; payload: string | undefined }
  /** From the caps, in the frame they certify or refuse a cut list. A repeated value keeps the snapshot. */
  | {
      type: 'setSectionCertification';
      payload: { status: 'certified' | 'rejected'; cuts: readonly SectionCut[] };
    }
  // Measure events
  | { type: 'setMeasureActive'; payload: boolean }
  | { type: 'adoptPinnedMeasurements'; measurements: readonly PinnedMeasurement[] }
  | { type: 'startMeasurement'; payload: [number, number, number]; anchor?: MeasurementAnchor }
  | {
      type: 'completeMeasurement';
      payload: [number, number, number];
      anchor?: MeasurementAnchor;
      operation?: MeasurementOperation;
      distance?: number;
      quality?: MeasurementRecord['quality'];
    }
  | { type: 'startFeatureMeasurement'; anchor: MeasurementAnchor }
  | { type: 'completeFeatureMeasurement'; record: Omit<MeasurementRecord, 'id' | 'isPinned'> }
  | { type: 'setMeasureMode'; mode: 'auto' | 'point' }
  | { type: 'setMeasureFrame'; frame: GraphicsContext['measureFrame'] }
  | { type: 'setMeasureSnapEnabled'; enabled: boolean }
  | { type: 'setMeasureOperation'; operation: MeasurementOperation }
  | { type: 'setMeasureFilter'; filter: GraphicsContext['measureFilter'] }
  | {
      type: 'setMeasureCandidates';
      candidates: GraphicsContext['measureCandidates'];
      activeId?: string;
      hasMore?: boolean;
    }
  | { type: 'chooseMeasureCandidate'; id: string }
  | { type: 'clearMeasureChosenCandidate' }
  | { type: 'requestMeasureCandidateCommit' }
  | { type: 'requestMeasureCatalog'; append?: boolean }
  | { type: 'setMeasureMessage'; message?: string }
  | { type: 'setMeasurePreviewDistance'; distance?: number }
  | { type: 'setMeasureLockedTarget'; id?: string }
  | { type: 'measurementSourceChanged'; geometryKey: string }
  | { type: 'measurementPoseChanged'; revision: number }
  | { type: 'measurementCutChanged' }
  | { type: 'addMeasurementRecord'; record: MeasurementRecord }
  | { type: 'resolveMeasurementRecord'; id: string; patch: Partial<MeasurementRecord> }
  | { type: 'cancelPendingMeasurements'; reason: string }
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
  // Artifact updates from CAD
  | {
      type: 'updateArtifact';
      artifact: KnownArtifact;
      hash: string;
      sourceFile?: string;
      paneRendering?: PaneRenderingProvenance;
    }
  | { type: 'updateAssembly'; key: string; units: { length: LengthSymbol }; sourceFile?: string }
  | { type: 'clearArtifact' }
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
  | { type: 'gltfPresentationReleased'; revision: number; key: string }
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

/**
 * The cut to add. A plane defaults to the first of XZ, YZ and XY the list lacks, and a cutaway to the up axis;
 * both pass through the geometry centre. `viewDirection` points from the view's target toward the camera (the camera
 * view's `direction`): a plane then removes the side facing the camera and a cutaway opens toward it.
 */
export type AddSectionCutPayload =
  | { kind: 'plane'; plane?: SectionPlane; viewDirection?: SectionVector }
  | { kind: 'revolution'; axis?: SectionAxis; viewDirection?: SectionVector };

// Emitted events
export type GraphicsEmitted =
  | { type: 'gridUpdated'; sizes: GridSizes }
  | { type: 'viewFitRequested' }
  | { type: 'geometryRadiusCalculated'; radius: number };

/**
 * Create-only seed. The durable half is exactly the keys this machine owns (Law 1), so a new
 * owned key reaches the actor without a second mapping.
 */
export type GraphicsInput = Partial<GraphicsOwnedSettings> & {
  measureSnapDistance?: number; // Default 10px for a fine pointer
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

/**
 * Create-only section-view seed. The persisted cuts are applied to context directly, each under a new id, and the
 * section is on only with a cut to show.
 */
function createSectionViewSeed(
  sectionView: GraphicsOwnedSettings['sectionView'],
): Pick<GraphicsContext, 'isSectionViewActive' | 'sectionCuts' | 'selectedSectionCutId' | 'hoveredSectionCutId'> {
  const sectionCuts = (sectionView?.cuts ?? []).map(
    (cut): SectionCut => ({ ...cut, id: generatePrefixedId(idPrefix.sectionCut) }),
  );
  return {
    isSectionViewActive: (sectionView?.active ?? false) && sectionCuts.length > 0,
    sectionCuts,
    selectedSectionCutId: undefined,
    hoveredSectionCutId: undefined,
  };
}

const adoptedSection = (context: GraphicsContext, section: PersistedSectionView) => {
  const unchanged =
    context.isSectionViewActive === (section.active && section.cuts.length > 0) &&
    JSON.stringify(context.sectionCuts.map(({ id: _id, ...cut }) => cut)) === JSON.stringify(section.cuts);
  return unchanged ? undefined : createSectionViewSeed(section);
};

const graphicsActors = {
  probeWebGpu: createAsyncLogic({ run: async () => probeWebGpuSupport() }),
  modelInteraction: modelInteractionMachine,
  kinematics: kinematicsMachine,
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

/** Appends a cut made with the defaults, selects it and marks the section on; the caller checks the budget. */
const appendSectionCut = (
  context: GraphicsContext,
  payload: AddSectionCutPayload,
): Pick<GraphicsContext, 'isSectionViewActive' | 'sectionCuts' | 'selectedSectionCutId'> => {
  const id = generatePrefixedId(idPrefix.sectionCut);
  const cut =
    payload.kind === 'plane'
      ? createDefaultPlaneCut({
          id,
          plane: payload.plane,
          existing: context.sectionCuts,
          center: context.geometryCenter,
          viewDirection: payload.viewDirection,
        })
      : createDefaultRevolutionCut({
          id,
          axis: payload.axis ?? context.upDirection,
          center: context.geometryCenter,
          viewDirection: payload.viewDirection,
        });
  return { isSectionViewActive: true, sectionCuts: [...context.sectionCuts, cut], selectedSectionCutId: id };
};

/** Drops the cut and the selection and hover that name it; `undefined` when no cut has that id. */
const withoutSectionCut = (
  context: GraphicsContext,
  id: string,
): Pick<GraphicsContext, 'sectionCuts' | 'selectedSectionCutId' | 'hoveredSectionCutId'> | undefined => {
  const sectionCuts = context.sectionCuts.filter((cut) => cut.id !== id);
  if (sectionCuts.length === context.sectionCuts.length) {
    return undefined;
  }
  return {
    sectionCuts,
    selectedSectionCutId: context.selectedSectionCutId === id ? undefined : context.selectedSectionCutId,
    hoveredSectionCutId: context.hoveredSectionCutId === id ? undefined : context.hoveredSectionCutId,
  };
};

/**
 * Turning the section off: nothing is cut, so nothing is committed or refused until the caps draw again, and no cut
 * stays hovered for when it turns back on.
 */
const sectionOffContext: Pick<
  GraphicsContext,
  'isSectionViewActive' | 'committedSectionCuts' | 'sectionCertification' | 'hoveredSectionCutId'
> = {
  isSectionViewActive: false,
  committedSectionCuts: [],
  sectionCertification: 'certified',
  hoveredSectionCutId: undefined,
};

/** Selecting or hovering names a cut in the list, or none; naming the current one again changes nothing. */
const isSectionCutReference = (context: GraphicsContext, current: string | undefined, next: string | undefined) =>
  next !== current && (next === undefined || context.sectionCuts.some((cut) => cut.id === next));

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
 * operational (parallel: the tools run together)
 *   ├── section
 *   │   ├── off (default; the cuts are kept)
 *   │   └── on (at least one cut)
 *   └── measure
 *       ├── off (default; the measurements are kept)
 *       └── on
 *           ├── selecting (clicking first points)
 *           └── selected (a first point is placed)
 *
 * Common events (grid, camera, visibility, screenshots) and the cut data events are handled once at
 * the operational level. A transition that turns a tool on or off lives inside that tool's region, so it
 * never exits and resets the other region.
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
  version: '1',

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

      // Section view state (the cuts are durable and entry-scoped)
      ...createSectionViewSeed(input.sectionView),
      committedSectionCuts: [],
      sectionCertification: 'certified',

      // Measure state
      isMeasureActive: false,
      measurements: (input.pinnedMeasurements ?? []).map((m) => ({
        ...m,
        isPinned: true,
        status: m.anchors?.length ? 'out-of-date' : 'snapshot',
        quality: m.quality ?? 'snapshot',
      })),
      currentMeasurementStart: undefined,
      currentMeasurementAnchor: undefined,
      measureMode: 'auto',
      measureFrame: 'tau:root',
      measureSnapEnabled: true,
      measureOperation: 'point-distance',
      measureFilter: 'auto',
      measureLockedTargetId: undefined,
      measureCandidates: [],
      measureActiveCandidateId: undefined,
      measureChosenCandidateId: undefined,
      measureCommitRequest: 0,
      measureCatalogRequest: 0,
      measureCatalogAppend: false,
      measureCatalogHasMore: false,
      measureMessage: undefined,
      measurePreviewDistance: undefined,
      measureSnapDistance: input.measureSnapDistance ?? 10,
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
      kinematicsRef: spawn(actors.kinematics, { id: 'kinematics', input: {} }),

      // Shapes
      artifact: undefined,
      artifactKey: '',
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
    enq.stop(context.kinematicsRef);
  },
  initial: 'operational',
  states: {
    operational: {
      /* Seeded cuts set context directly; this raise only enters the section region's `on` state. */
      entry: ({ context }, enq) => {
        if (context.isSectionViewActive) {
          enq.raise({ type: 'setSectionViewActive', payload: true });
        }
      },
      type: 'parallel',
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
        fitView: (_, enq) => {
          enq.emit({ type: 'viewFitRequested' });
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
        setAssemblyDetailCalibration: ({ event }) => {
          const { calibration } = event;
          if (calibration === undefined) {
            return { context: { assemblyDetailCalibration: undefined } };
          }
          if (!isAssemblyDetailCalibration(calibration)) {
            return {};
          }
          return {
            context: {
              assemblyDetailCalibration: Object.freeze({
                triangleRatio: calibration.triangleRatio,
                approximateRelativeError: calibration.approximateRelativeError,
                screenSpace: Object.freeze({
                  maxApproximatePixelError: calibration.screenSpace.maxApproximatePixelError,
                  enterDetailRatio: calibration.screenSpace.enterDetailRatio,
                }),
              }),
            },
          };
        },
        setSurfaceVisibility: {
          context: ({ context, event }) => ({
            enableSurfaces: event.payload,
            pickableMeshesVersion: context.pickableMeshesVersion + 1,
          }),
        },
        setLinesVisibility: {
          context: ({ context, event }) => ({
            enableLines: event.payload,
            pickableMeshesVersion: context.pickableMeshesVersion + 1,
          }),
        },
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
        // Sent on every step of a gizmo drag; only the first one changes anything.
        markModelPointerGestureMoved: ({ context }) =>
          context.suppressNextModelPointerClick ? {} : { context: { suppressNextModelPointerClick: true } },
        clearModelPointerClickGuard: { context: { suppressNextModelPointerClick: false } },

        // Artifact updates
        clearArtifact: ({ context }, enq) => {
          if (
            !context.artifact &&
            !context.modelInteractionUnitId &&
            context.artifactKey === '' &&
            !context.paneRendering
          ) {
            return {};
          }
          if (context.ownsModelInteractionRef && context.modelInteractionUnitId) {
            forwardToModelInteraction(context, enq, {
              type: 'clearManifest',
              unitId: context.modelInteractionUnitId,
              source: 'viewer',
            });
            forwardToModelInteraction(context, enq, {
              type: 'clearSelection',
              unitId: context.modelInteractionUnitId,
              source: 'viewer',
            });
            forwardToModelInteraction(context, enq, {
              type: 'clearFocus',
              unitId: context.modelInteractionUnitId,
              source: 'viewer',
            });
          }
          const revision = context.gltfPresentation.requestedRevision + 1;
          return {
            context: {
              artifact: undefined,
              artifactKey: '',
              artifactSourceFile: undefined,
              paneRendering: undefined,
              gltfPresentation: { requestedRevision: revision, presentedRevision: revision, phase: 'idle' },
              modelInteractionUnitId: undefined,
              pickableMeshesVersion: context.pickableMeshesVersion + 1,
              geometryRadius: 0,
              geometryCenter: [0, 0, 0] as [number, number, number],
            },
          };
        },
        updateArtifact: ({ context, event }, enq) => {
          if (context.ownsModelInteractionRef && event.artifact.mimeType !== 'model/gltf-binary') {
            const incomingUnitId = event.sourceFile
              ? deriveModelInteractionUnitId({ sourceFile: event.sourceFile })
              : undefined;
            for (const unitId of new Set([context.modelInteractionUnitId, incomingUnitId])) {
              if (!unitId) {
                continue;
              }
              forwardToModelInteraction(context, enq, { type: 'clearManifest', unitId, source: 'viewer' });
              forwardToModelInteraction(context, enq, { type: 'clearSelection', unitId, source: 'viewer' });
              forwardToModelInteraction(context, enq, { type: 'clearFocus', unitId, source: 'viewer' });
            }
          }
          const requestedRevision = context.gltfPresentation.requestedRevision + 1;
          return {
            context: {
              artifact: event.artifact,
              artifactKey: event.hash,
              artifactSourceFile: event.sourceFile,
              paneRendering:
                event.paneRendering?.hash === event.hash &&
                event.paneRendering.sourceRevision.entry === event.sourceFile
                  ? event.paneRendering
                  : undefined,
              gltfPresentation:
                event.artifact.mimeType === 'model/gltf-binary'
                  ? withGltfPresentationPhase(
                      { ...context.gltfPresentation, requestedRevision, requestedKey: event.hash },
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
                event.artifact.mimeType === 'model/gltf-binary'
                  ? context.modelInteractionUnitId
                  : event.sourceFile
                    ? deriveModelInteractionUnitId({ sourceFile: event.sourceFile })
                    : undefined,
              pickableMeshesVersion:
                event.artifact.mimeType === 'model/gltf-binary'
                  ? context.pickableMeshesVersion
                  : context.pickableMeshesVersion + 1,
              cadUnits: { length: { symbol: event.artifact.units?.length ?? 'mm' } },
            },
          };
        },
        updateAssembly: ({ context, event }) => ({
          context: {
            artifact: undefined,
            artifactKey: event.key,
            artifactSourceFile: event.sourceFile,
            paneRendering: undefined,
            gltfPresentation: withGltfPresentationPhase(
              {
                ...context.gltfPresentation,
                requestedRevision: context.gltfPresentation.requestedRevision + 1,
                requestedKey: event.key,
              },
              'preparing',
            ),
            cadUnits: { length: { symbol: event.units.length } },
          },
        }),
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
        gltfPresentationReleased: {
          context: ({ context, event }) => {
            if (
              context.gltfPresentation.presentedRevision !== event.revision ||
              context.gltfPresentation.presentedKey !== event.key
            ) {
              return {};
            }
            return {
              gltfPresentation: withGltfPresentationPhase(
                { ...context.gltfPresentation, presentedKey: undefined },
                context.gltfPresentation.requestedKey === undefined ? 'idle' : 'preparing',
              ),
              modelInteractionUnitId: undefined,
              pickableMeshesVersion: context.pickableMeshesVersion + 1,
            };
          },
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
        gltfPresentationMeasured: ({ event, self }, enq) => {
          const { durations, assemblyResources, ...attributes } = event.telemetry;
          const { detailCalibration, unmeasuredInventory, ...resourceAttributes } = assemblyResources ?? {};
          const resourceDetails = assemblyResources
            ? {
                ...resourceAttributes,
                unmeasuredInventoryJson: JSON.stringify(unmeasuredInventory),
                ...(detailCalibration ? { detailCalibrationJson: JSON.stringify(detailCalibration) } : {}),
              }
            : {};
          const viewportActorSessionId: unknown = Reflect.get(self, 'sessionId');
          if (typeof viewportActorSessionId !== 'string') {
            throw new TypeError('Expected actual graphics actor session ID.');
          }
          const duration = durations.receiptToFirstFrame ?? durations.commitToFirstFrame ?? 0;
          enq(() => {
            recordRendererSpan('renderer.presentation', {
              startTime: performance.now() - duration,
              duration,
              attributes: { ...attributes, ...durations, ...resourceDetails, viewportActorSessionId },
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

        // Section cuts are data: editing one never changes a region.
        updateSectionCut: ({ context, event }) => {
          const cut = context.sectionCuts.find((candidate) => candidate.id === event.payload.id);
          if (!cut) {
            return {};
          }
          const next = applySectionCutPatch(cut, event.payload.patch, context.geometryCenter);
          return next === cut
            ? {}
            : {
                context: {
                  sectionCuts: context.sectionCuts.map((candidate) => (candidate === cut ? next : candidate)),
                },
              };
        },
        selectSectionCut: ({ context, event }) =>
          isSectionCutReference(context, context.selectedSectionCutId, event.payload)
            ? { context: { selectedSectionCutId: event.payload } }
            : {},
        hoverSectionCut: ({ context, event }) =>
          isSectionCutReference(context, context.hoveredSectionCutId, event.payload)
            ? { context: { hoveredSectionCutId: event.payload } }
            : {},
        setSectionCertification: ({ context, event }) =>
          event.payload.cuts === context.committedSectionCuts && event.payload.status === context.sectionCertification
            ? {}
            : {
                context: {
                  committedSectionCuts: event.payload.cuts,
                  sectionCertification: event.payload.status,
                },
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
        adoptPinnedMeasurements: ({ context, event }) => {
          const current = context.measurements.filter((measurement) => measurement.isPinned);
          if (
            JSON.stringify(
              current.map(({ isPinned: _pinned, status: _status, quality: _quality, ...rest }) => rest),
            ) === JSON.stringify(event.measurements)
          ) {
            return {};
          }
          return {
            context: {
              measurements: [
                ...context.measurements.filter((measurement) => !measurement.isPinned),
                ...event.measurements.map(
                  (measurement) =>
                    ({ ...measurement, isPinned: true, status: 'snapshot', quality: 'snapshot' }) as const,
                ),
              ],
            },
          };
        },
        addMeasurementRecord: {
          context: ({ context, event }) => ({ measurements: [...context.measurements, event.record] }),
        },
        resolveMeasurementRecord: {
          context: ({ context, event }) => ({
            measurements: context.measurements.map((measurement) =>
              measurement.id === event.id && measurement.status === 'pending'
                ? { ...measurement, ...event.patch }
                : measurement,
            ),
          }),
        },
        cancelPendingMeasurements: {
          context: ({ context, event }) => ({
            measurements: context.measurements.map((measurement) =>
              measurement.status === 'pending'
                ? { ...measurement, status: 'unavailable', unavailableReason: event.reason }
                : measurement,
            ),
          }),
        },
        setMeasureMode: {
          context: ({ event }) => ({
            measureMode: event.mode,
            measureCatalogHasMore: false,
            measureLockedTargetId: undefined,
            measureChosenCandidateId: undefined,
          }),
        },
        setMeasureFrame: { context: ({ event }) => ({ measureFrame: event.frame }) },
        setMeasureSnapEnabled: {
          context: ({ event }) => ({
            measureSnapEnabled: event.enabled,
            measureLockedTargetId: undefined,
            measureChosenCandidateId: undefined,
          }),
        },
        setMeasureOperation: { context: ({ event }) => ({ measureOperation: event.operation }) },
        setMeasureFilter: {
          context: ({ event }) => ({
            measureFilter: event.filter,
            measureCatalogHasMore: false,
            measureLockedTargetId: undefined,
            measureChosenCandidateId: undefined,
          }),
        },
        setMeasureCandidates: {
          context: ({ context, event }) => ({
            measureCandidates: event.candidates,
            measureCatalogHasMore: event.hasMore ?? (event.candidates.length > 0 && context.measureCatalogHasMore),
            measureChosenCandidateId: event.candidates.some(
              (candidate) => candidate.id === context.measureChosenCandidateId,
            )
              ? context.measureChosenCandidateId
              : undefined,
            measureLockedTargetId: event.candidates.some((candidate) => candidate.id === context.measureLockedTargetId)
              ? context.measureLockedTargetId
              : undefined,
            measureActiveCandidateId: event.candidates.some(
              (candidate) => candidate.id === context.measureChosenCandidateId,
            )
              ? context.measureChosenCandidateId
              : event.activeId,
          }),
        },
        chooseMeasureCandidate: {
          context: ({ context, event }) =>
            context.measureCandidates.some((candidate) => candidate.id === event.id)
              ? { measureActiveCandidateId: event.id, measureChosenCandidateId: event.id }
              : {},
        },
        clearMeasureChosenCandidate: {
          context: () => ({ measureChosenCandidateId: undefined }),
        },
        requestMeasureCandidateCommit: {
          context: ({ context }) => ({ measureCommitRequest: context.measureCommitRequest + 1 }),
        },
        requestMeasureCatalog: {
          context: ({ context, event }) => ({
            measureCatalogRequest: context.measureCatalogRequest + 1,
            measureCatalogAppend: event.append ?? false,
          }),
        },
        setMeasureMessage: { context: ({ event }) => ({ measureMessage: event.message }) },
        setMeasurePreviewDistance: { context: ({ event }) => ({ measurePreviewDistance: event.distance }) },
        setMeasureLockedTarget: { context: ({ event }) => ({ measureLockedTargetId: event.id }) },
        measurementSourceChanged: {
          context: ({ context, event }) => ({
            currentMeasurementStart:
              context.currentMeasurementAnchor?.geometryKey === event.geometryKey
                ? context.currentMeasurementStart
                : undefined,
            currentMeasurementAnchor:
              context.currentMeasurementAnchor?.geometryKey === event.geometryKey
                ? context.currentMeasurementAnchor
                : undefined,
            measurements: markMeasurementsOutOfDate(context.measurements, (measurement) =>
              Boolean(measurement.geometryKey && measurement.geometryKey !== event.geometryKey),
            ),
          }),
        },
        measurementPoseChanged: {
          context: ({ context, event }) => ({
            currentMeasurementStart: undefined,
            currentMeasurementAnchor: undefined,
            measurements: markMeasurementsOutOfDate(
              context.measurements,
              (measurement) => measurement.poseRevision !== undefined && measurement.poseRevision !== event.revision,
            ),
          }),
        },
        measurementCutChanged: {
          context: ({ context }) => ({
            currentMeasurementStart: undefined,
            currentMeasurementAnchor: undefined,
            measurements: markMeasurementsOutOfDate(context.measurements, (measurement) =>
              Boolean(measurement.anchors?.length && measurement.status !== 'snapshot'),
            ),
          }),
        },
      },
      states: {
        section: {
          initial: 'off',
          states: {
            off: {
              on: {
                adoptSectionView: ({ context, event }) => {
                  const patch = adoptedSection(context, event.section);
                  return patch ? { target: patch.isSectionViewActive ? 'on' : 'off', context: patch } : {};
                },
                setSectionViewActive: ({ context, event }) => {
                  if (!event.payload) {
                    return undefined;
                  }
                  return {
                    target: 'on',
                    context:
                      context.sectionCuts.length === 0
                        ? appendSectionCut(context, { kind: 'plane', viewDirection: event.viewDirection })
                        : { isSectionViewActive: true },
                  };
                },
                addSectionCut: ({ context, event }) =>
                  context.sectionCuts.length >= maxSectionCuts
                    ? {}
                    : { target: 'on', context: appendSectionCut(context, event.payload) },
                removeSectionCut: ({ context, event }) => {
                  const patch = withoutSectionCut(context, event.payload);
                  return patch ? { context: patch } : {};
                },
              },
            },

            on: {
              on: {
                adoptSectionView: ({ context, event }) => {
                  const patch = adoptedSection(context, event.section);
                  return patch ? { target: patch.isSectionViewActive ? 'on' : 'off', context: patch } : {};
                },
                setSectionViewActive: ({ event }) =>
                  event.payload ? undefined : { target: 'off', context: { ...sectionOffContext } },
                addSectionCut: ({ context, event }) =>
                  context.sectionCuts.length >= maxSectionCuts
                    ? {}
                    : { context: appendSectionCut(context, event.payload) },
                removeSectionCut: ({ context, event }) => {
                  const patch = withoutSectionCut(context, event.payload);
                  if (!patch) {
                    return {};
                  }
                  return patch.sectionCuts.length === 0
                    ? { target: 'off', context: { ...patch, ...sectionOffContext } }
                    : { context: patch };
                },
              },
            },
          },
        },

        measure: {
          initial: 'off',
          states: {
            off: {
              on: {
                setMeasureActive: ({ context, event }, enq) =>
                  event.payload
                    ? {
                        target: 'on',
                        context: { isMeasureActive: true, ...beginMeasureHoverSuppression(context, enq) },
                      }
                    : undefined,
              },
            },

            on: {
              initial: 'selecting',
              on: {
                // Leaving keeps every measurement; only a half-placed one is dropped.
                setMeasureActive: ({ context, event }) =>
                  event.payload
                    ? undefined
                    : {
                        target: 'off',
                        context: {
                          isMeasureActive: false,
                          currentMeasurementStart: undefined,
                          currentMeasurementAnchor: undefined,
                          measureCandidates: [],
                          measureCatalogHasMore: false,
                          measureActiveCandidateId: undefined,
                          measureChosenCandidateId: undefined,
                          measureLockedTargetId: undefined,
                          ...endMeasureHoverSuppression(context),
                        },
                      },
                clearAllMeasurements: {
                  target: '.selecting',
                  context: {
                    measurements: [],
                    currentMeasurementStart: undefined,
                    currentMeasurementAnchor: undefined,
                  },
                },
              },
              states: {
                selecting: {
                  on: {
                    completeFeatureMeasurement: {
                      context: ({ context, event }) => ({
                        measurements: [
                          ...context.measurements,
                          { ...event.record, id: generatePrefixedId(idPrefix.measurement), isPinned: false },
                        ],
                      }),
                    },
                    startMeasurement: {
                      target: 'selected',
                      context: ({ event }) => ({
                        currentMeasurementStart: event.payload,
                        currentMeasurementAnchor: event.anchor,
                      }),
                    },
                  },
                },

                selected: {
                  on: {
                    completeFeatureMeasurement: {
                      target: 'selecting',
                      context: ({ context, event }) => ({
                        measurements: [
                          ...context.measurements,
                          { ...event.record, id: generatePrefixedId(idPrefix.measurement), isPinned: false },
                        ],
                        currentMeasurementStart: undefined,
                        currentMeasurementAnchor: undefined,
                      }),
                    },
                    completeMeasurement: ({ context, event }) => {
                      const start = context.currentMeasurementStart;
                      if (!start) {
                        return {
                          target: 'selecting',
                          context: { currentMeasurementStart: undefined, currentMeasurementAnchor: undefined },
                        };
                      }
                      const end = event.payload;
                      const sourceGeometryKey =
                        context.currentMeasurementAnchor?.geometryKey ?? event.anchor?.geometryKey;
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
                              distance:
                                event.distance ?? Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]),
                              operation: event.operation ?? 'point-distance',
                              quality: event.quality ?? context.currentMeasurementAnchor?.quality ?? 'mesh',
                              anchors: context.currentMeasurementAnchor
                                ? [context.currentMeasurementAnchor, event.anchor]
                                : undefined,
                              geometryKey: sourceGeometryKey,
                              poseRevision: context.kinematicsRef.getSnapshot().context.revision,
                              status: 'current',
                              isPinned: false,
                            },
                          ],
                          currentMeasurementStart: undefined,
                          currentMeasurementAnchor: undefined,
                        },
                      };
                    },
                    cancelCurrentMeasurement: {
                      target: 'selecting',
                      context: { currentMeasurementStart: undefined, currentMeasurementAnchor: undefined },
                    },
                  },
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
  snapshot.context.gltfPresentation.presentedKey ?? snapshot.context.artifactKey;
