import { createAsyncLogic, createCallbackLogic, setup, types } from 'xstate';
import type {
  ActorRefFrom,
  CallbackActorLogic,
  AnyActor,
  EnqueueObject,
  MetaObject,
  SnapshotFrom,
  StateMachine,
  Sources,
  StateSchema,
  SystemRegistry,
} from 'xstate';
import { eventSchemas } from '#machines/machine-schemas.js';
import type { GeometryComponentManifest, GridSizes } from '@taucad/types';
import type { KnownArtifact } from '@taucad/runtime';
import { idPrefix } from '@taucad/types/constants';
import { getLengthUnit, metersPerLengthUnit } from '#constants/length-units.js';
import type { LengthSymbol, UnitSystem } from '#constants/length-units.js';
import { generatePrefixedId } from '@taucad/utils/id';
import { createCameraView } from '@taucad/camera';
import { cameraMachine } from '@taucad/camera/machine';
import type { CameraMachineEmitted } from '@taucad/camera/machine';
import type {
  CameraOwnedSettings,
  GraphicsBackendPreference,
  GraphicsOwnedSettings,
  PersistedCameraView,
  PersistedSectionView,
  PinnedMeasurement,
  ResolvedGraphicsBackend,
} from '#graphics/graphics-settings.js';
import {
  onWebGpuCanvasLoss,
  probeWebGpuSupportWithin,
  resolveGraphicsBackendPreference,
} from '#graphics/graphics-backend.js';
import {
  applySectionCutPatch,
  createDefaultPlaneCut,
  createDefaultRevolutionCut,
  maxSectionCuts,
} from '#graphics/section-cuts.js';
import type { SectionAxis, SectionCut, SectionCutPatch, SectionPlane, SectionVector } from '#graphics/section-cuts.js';
import { recordRendererSpan } from '#lib/renderer-telemetry.js';
import { viewerFirstFrame } from '#lib/viewer-events.js';
import { deriveModelInteractionUnitId, modelInteractionMachine } from '#machines/model-interaction.machine.js';
import type { ModelInteractionSource, ViewerHoverSuppressionReason } from '#machines/model-interaction.machine.js';
import { kinematicsMachine } from '#machines/kinematics.machine.js';
import { canvasMachine } from '#machines/canvas.machine.js';
import type { CanvasRef, CanvasSurfaceKind } from '#machines/canvas.machine.js';
import type { webglContextMachine } from '#machines/webgl-context.machine.js';
import type { MeasurementAnchor, MeasurementRecord, MeasurementOperation } from '#constants/measurement.types.js';

/**
 * Actor reference for the model interaction machine that a graphics actor drives.
 *
 * @public
 */
export type ModelInteractionRef = ActorRefFrom<typeof modelInteractionMachine>;
/**
 * Actor reference for the kinematics machine spawned by a graphics actor.
 *
 * @public
 */
export type KinematicsRef = ActorRefFrom<typeof kinematicsMachine>;

/**
 * Actor reference for the camera spawned by a graphics actor: the view's camera, whose lifetime is the graphics
 * actor's (charter D5, I11).
 *
 * @public
 */
export type GraphicsCameraRef = ActorRefFrom<typeof cameraMachine>;

/**
 * The controls adapter a canvas hands graphics once its renderer exists: a callback actor whose closure holds the
 * canvas's `camera-controls` instance, DOM surface and native cameras (charter D4). It sends back the gesture events.
 *
 * @public
 */
export type ControlsAdapterLogic = CallbackActorLogic<
  { type: 'stop' },
  unknown,
  { type: 'interactionStarted' } | { type: 'interactionMoved' } | { type: 'interactionEnded' }
>;

/**
 * One-time framing record for an entry identity, mutated in place by the canvas framing hook.
 *
 * ponytail: a temporary bridge from the deleted camera-session registry, plain data only (charter D4). The framing
 * actor (G5b) replaces it and deletes this field.
 *
 * @public
 */
export type ViewCameraFraming = {
  /** Entry path whose geometry this record describes; a change re-latches the other fields. */
  identity: string | undefined;
  /** Persisted pose to apply once the first geometry has been framed. */
  pendingView: PersistedCameraView | undefined;
  /** A record orientation already applied to the camera before first geometry; fit without configured angles. */
  preserveOrientationOnFirstFrame: boolean;
  /** The automatic first-frame result, so its fitted span and zoom are not mistaken for a person orbit. */
  firstFrameView: PersistedCameraView | undefined;
  /** Whether the first real geometry has already been framed for this identity. */
  initialized: boolean;
};

/**
 * A reason for ignoring pointer clicks on the model, such as an active measure tool.
 *
 * @public
 */
export type ModelPointerClickSuppressionReason = 'measureTool';

/**
 * What a GLTF result must reach before it is presented: display only, or display plus section analysis when a section view is active.
 *
 * @public
 */
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

/**
 * Measurements reported for one GLTF presentation attempt: its identity, outcome, sizes, phase durations and loader counters.
 *
 * @public
 */
export type GltfPresentationTelemetry = Readonly<{
  revision: number;
  key: string;
  backend: ResolvedGraphicsBackend;
  barrier: GltfPresentationBarrier;
  outcome: 'presented' | 'failed' | 'cancelled' | 'stale';
  glbBytes: number;
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

/**
 * The requested and presented GLTF revision and key, with the phase of the presentation in progress.
 *
 * @public
 */
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
 *   `geometryCenter`, `resolvedGraphicsBackend`, `canvas`, `webGpuAvailable`, `hoveredSectionCutId`,
 *   `committedSectionCuts` (what the caps last committed),
 *   `hoveredMeasurementId`, `measureSnapDistance`, every
 *   suppression and interaction flag, `pickableMeshesVersion`, `geometry`, `geometryKey` and
 *   `gltfPresentation`.
 *
 * No field here stores a copy of a value another actor owns; the camera's field of view and pose
 * belong to the view's camera session, and the render timeout to the entry's CAD actor.
 * @public
 */
// oxlint-disable-next-line typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference it by name, where an alias is expanded into every transition of the machine (TS7056)
export interface GraphicsContext {
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
  /**
   * Probe result cached after startup (the `backend` region's invoked probe). Until the probe answers, the `backend`
   * region is `probing` and a WebGPU-preferring viewer mounts no canvas: a canvas mounted on WebGL meanwhile would be
   * thrown away for a WebGPU one, and on a software adapter its work also delays the adapter answer.
   */
  webGpuAvailable: boolean;
  /** Capability-derived candidate; initialization can still fall back to WebGL. */
  resolvedGraphicsBackend: ResolvedGraphicsBackend;
  /**
   * The mounted surface's canvas actor, which owns the renderer lifecycle (`creating → ready → presented ; lost ;
   * failed`). Only a Three canvas attaches one, or the placeholder that holds its place while the WebGPU probe runs, so
   * a stage showing other content (an SVG) is never waiting.
   *
   * One canvas per graphics actor: a second surface attaching replaces the first one's actor.
   */
  canvas: Readonly<{ canvasId: string; ref: CanvasRef }> | undefined;

  // Section view state
  isSectionViewActive: boolean;
  /** The section's cuts in order, at most `maxSectionCuts`; the removed volume is their union. */
  sectionCuts: readonly SectionCut[];
  /** The cut whose editor and handles show. */
  selectedSectionCutId: string | undefined;
  /** The cut hovered in the section row or the scene; both highlight it. */
  hoveredSectionCutId: string | undefined;
  /**
   * The cut list the clip, caps and raycasts show: the latest one the caps committed. Every cut list commits once the
   * sources it cuts are known; none is refused.
   */
  committedSectionCuts: readonly SectionCut[];

  // Measure state
  isMeasureActive: boolean;
  /** Whether the active tool has attached its input listeners; never persisted. */
  isMeasureInputReady: boolean;
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
  /** The view's camera. Its pose, render frame and clip policy outlive every canvas and provider mount. */
  cameraRef: GraphicsCameraRef;
  /**
   * The attached canvas's controls adapter: the only listener on its `camera-controls` instance (charter I9). It
   * stops with its canvas, so a canvas remount replaces it and never runs two.
   */
  controlsAdapter: Readonly<{ canvasId: string; ref: AnyActor }> | undefined;
  /**
   * Whether a canvas has presented the camera at least once. It stays set after the canvas detaches (a hidden tab), since
   * the camera keeps its pose.
   */
  cameraPresented: boolean;
  /** See {@link ViewCameraFraming}: a plain-data bridge the framing actor (G5b) deletes. */
  cameraFraming: ViewCameraFraming;

  // Geometry data from CAD
  artifact: KnownArtifact | undefined;
  /** Runtime-stamped projection hash, used for skip-when-unchanged optimizations. */
  artifactKey: string;
  /** Source identity travels with the artifact through the renderer handoff. */
  artifactSourceFile?: string;
  /** Requested-versus-presented GLTF identity and bounded renderer handoff measurements. */
  gltfPresentation: GltfPresentationProjection;
}

// Event types
/**
 * Events accepted by the graphics machine.
 *
 * @public
 */
export type GraphicsEvent =
  // Grid events
  | { type: 'updateGridSize'; payload: GridSizes }
  | { type: 'setGridSizeLocked'; payload: boolean }
  | { type: 'setGridUnit'; payload: { unit: LengthSymbol } }
  // Camera events
  | { type: 'fitView' }
  /** The camera child's `viewChanged`, folded into the visible span. */
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
  /** A WebGPU canvas on this page could not present, or lost its device to the browser: WebGPU is off for the page. */
  | { type: 'webGpuCanvasLost' }
  /**
   * A viewer surface entered the document: graphics starts its canvas actor, which the surface's R3F root then hosts.
   * Sent once per surface from its element's ref, so a StrictMode replay detaches and attaches again.
   */
  | {
      type: 'canvasAttached';
      canvasId: string;
      kind: CanvasSurfaceKind;
      /** The viewer's WebGL context budget, when the embedder tracks one. */
      webglContext?: ActorRefFrom<typeof webglContextMachine>;
      /** The surface estimate the viewer was admitted with. */
      admittedBytes?: number;
      /** The surface re-attached to a renderer that already exists, so its canvas actor times no load spans. */
      reattached?: boolean;
    }
  /** The surface left the document: its canvas actor stops and returns its budget. */
  | { type: 'canvasDetached'; canvasId: string }
  /**
   * The attached surface's renderer exists: graphics starts its controls adapter, which stops with the surface. A
   * re-delivery for the running adapter's surface changes nothing.
   */
  | { type: 'controlsAttached'; canvasId: string; adapter: ControlsAdapterLogic }
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
  /** From the caps, in the frame they commit a cut list. A repeated value keeps the snapshot. */
  | { type: 'commitSectionCuts'; payload: readonly SectionCut[] }
  // Measure events
  | { type: 'setMeasureActive'; payload: boolean }
  | { type: 'setMeasureInputReady'; ready: boolean }
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
  // Controls adapter events, forwarded to the camera
  | { type: 'interactionStarted' }
  /** Sent once per gesture, on its first movement. */
  | { type: 'interactionMoved' }
  | { type: 'interactionEnded' }
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
    }
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
 * The graphics machine's public alphabet: every {@link GraphicsEvent} type, in the union's order. The totality test
 * samples each one and fails when this list and the union differ.
 *
 * @public
 */
export const graphicsEventTypes = [
  'updateGridSize',
  'setGridSizeLocked',
  'setGridUnit',
  'fitView',
  'cameraViewChanged',
  'setSurfaceVisibility',
  'setLinesVisibility',
  'setGizmoVisibility',
  'setGridVisibility',
  'setAxesVisibility',
  'setMatcapVisibility',
  'setPostProcessingVisibility',
  'setUpDirection',
  'setGraphicsBackendPreference',
  'webGpuCanvasLost',
  'canvasAttached',
  'canvasDetached',
  'controlsAttached',
  'setSectionViewActive',
  'adoptSectionView',
  'addSectionCut',
  'updateSectionCut',
  'removeSectionCut',
  'selectSectionCut',
  'hoverSectionCut',
  'commitSectionCuts',
  'setMeasureActive',
  'setMeasureInputReady',
  'adoptPinnedMeasurements',
  'startMeasurement',
  'completeMeasurement',
  'startFeatureMeasurement',
  'completeFeatureMeasurement',
  'setMeasureMode',
  'setMeasureFrame',
  'setMeasureSnapEnabled',
  'setMeasureOperation',
  'setMeasureFilter',
  'setMeasureCandidates',
  'chooseMeasureCandidate',
  'clearMeasureChosenCandidate',
  'requestMeasureCandidateCommit',
  'requestMeasureCatalog',
  'setMeasureMessage',
  'setMeasurePreviewDistance',
  'setMeasureLockedTarget',
  'measurementSourceChanged',
  'measurementPoseChanged',
  'measurementCutChanged',
  'addMeasurementRecord',
  'resolveMeasurementRecord',
  'cancelPendingMeasurements',
  'cancelCurrentMeasurement',
  'clearMeasurement',
  'clearAllMeasurements',
  'clearUnpinnedMeasurements',
  'setHoveredMeasurement',
  'setMeasurementName',
  'toggleMeasurementPinned',
  'interactionStarted',
  'interactionMoved',
  'interactionEnded',
  'beginViewerModelHoverSuppression',
  'endViewerModelHoverSuppression',
  'markModelPointerGestureMoved',
  'clearModelPointerClickGuard',
  'updateArtifact',
  'clearArtifact',
  'gltfPreparationStarted',
  'gltfDisplayReady',
  'gltfAnalysisReady',
  'gltfPresentationCommitted',
  'gltfPresentationFailed',
  'gltfPresentationMeasured',
  'loadModelComponentManifest',
  'clearModelComponentManifest',
  'setHoveredModelComponent',
  'toggleModelComponentSelection',
  'selectModelComponent',
  'clearModelComponentSelection',
  'hideModelComponent',
  'showModelComponent',
  'showHiddenModelComponents',
  'isolateModelComponent',
  'clearModelComponentIsolation',
  'setModelComponentOpacity',
  'resetModelComponentOpacities',
  'focusModelComponent',
  'clearModelComponentFocus',
  'sceneRadiusUpdated',
] as const satisfies ReadonlyArray<GraphicsEvent['type']>;

/**
 * The cut to add. A plane defaults to the first of XZ, YZ and XY the list lacks, and a cutaway to the up axis;
 * both pass through the geometry centre. `viewDirection` points from the view's target toward the camera (the camera
 * view's `direction`): a plane then removes the side facing the camera and a cutaway opens toward it.
 * @public
 */
export type AddSectionCutPayload =
  | { kind: 'plane'; plane?: SectionPlane; viewDirection?: SectionVector }
  | { kind: 'revolution'; axis?: SectionAxis; viewDirection?: SectionVector };

// Emitted events
/**
 * Events emitted by the graphics machine to its observers.
 *
 * @public
 */
export type GraphicsEmitted =
  | { type: 'gridUpdated'; sizes: GridSizes }
  | { type: 'viewFitRequested' }
  | { type: 'geometryRadiusCalculated'; radius: number };

/**
 * Create-only seed. The durable half is exactly the keys this machine owns (Law 1), so a new
 * owned key reaches the actor without a second mapping.
 * @public
 */
// oxlint-disable-next-line typescript/consistent-type-definitions -- an interface, not a type alias, so declarations reference it by name (TS7056)
export interface GraphicsInput extends Partial<GraphicsOwnedSettings> {
  /** The camera's create-only seed: the view's persisted field of view and pose. */
  camera?: Partial<CameraOwnedSettings>;
  measureSnapDistance?: number; // Default 10px for a fine pointer
  modelInteractionRef?: ModelInteractionRef;
}

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
  probeWebGpu: createAsyncLogic({ run: async () => probeWebGpuSupportWithin() }),
  watchWebGpuCanvasLoss: createCallbackLogic<{ type: 'stop' }>(({ sendBack }) =>
    onWebGpuCanvasLoss(() => {
      sendBack({ type: 'webGpuCanvasLost' });
    }),
  ),
  modelInteraction: modelInteractionMachine,
  kinematics: kinematicsMachine,
  canvas: canvasMachine,
  camera: cameraMachine,
};

type GraphicsEnqueue = EnqueueObject<GraphicsEvent, GraphicsEmitted, SystemRegistry, typeof graphicsActors>;

/**
 * The controls adapter stops with its canvas: a new or detached surface ends the old gesture listener. A gesture it
 * held ends with it, so the camera cannot stay `gesture.held` and hover suppression cannot stick (G3 report).
 */
const stopControlsAdapter = (
  context: GraphicsContext,
  enq: GraphicsEnqueue,
): Pick<GraphicsContext, 'controlsAdapter' | 'viewerHoverSuppressionReasons'> => {
  if (context.controlsAdapter) {
    enq.stop(context.controlsAdapter.ref);
    enq.sendTo(context.cameraRef, { type: 'interactionEnded' });
  }
  return {
    controlsAdapter: undefined,
    viewerHoverSuppressionReasons: removeSuppressionReason(context.viewerHoverSuppressionReasons, 'cameraControls'),
  };
};
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
 * Turning the section off: nothing is cut, so nothing is committed until the caps draw again, and no cut stays hovered
 * for when it turns back on.
 */
const sectionOffContext: Pick<GraphicsContext, 'isSectionViewActive' | 'committedSectionCuts' | 'hoveredSectionCutId'> =
  {
    isSectionViewActive: false,
    committedSectionCuts: [],
    hoveredSectionCutId: undefined,
  };

/** Selecting or hovering names a cut in the list, or none; naming the current one again changes nothing. */
const isSectionCutReference = (context: GraphicsContext, current: string | undefined, next: string | undefined) =>
  next !== current && (next === undefined || context.sectionCuts.some((cut) => cut.id === next));

/** WebGPU is off for the page: the preference resolves without it. */
const webGpuOffContext = ({ context }: { context: GraphicsContext }): GraphicsPatch => ({
  webGpuAvailable: false,
  resolvedGraphicsBackend: resolveGraphicsBackendPreference(context.graphicsBackendPreference, false),
});

/** The camera's opening direction when the view has no persisted pose. */
const initialCameraDirection = [Math.sqrt(3 / 8), -Math.sqrt(3 / 8), 0.5] as const;
const upAxisVectors = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } as const;

/* The camera seed as the view-camera registry built it: the persisted pose and field of view, else the default pose. */
const cameraSeed = (input: GraphicsInput, upDirection: 'x' | 'y' | 'z') => {
  const pixelRatio: unknown = Reflect.get(globalThis, 'devicePixelRatio');
  return {
    pixelBudget: 0.25,
    initialView: createCameraView({
      ...(input.camera?.cameraView ?? {
        target: [0, 0, 0],
        direction: initialCameraDirection,
        up: upAxisVectors[upDirection],
        // Keep the seed bounds in front of the camera so the empty scene has stable depth precision.
        verticalSpan: 4,
        perspectiveZoom: 1,
      }),
      frameId: 'tau:root',
      // Matches `defaultGraphicsSettings.cameraFovAngle`.
      requestedVerticalFieldOfView: input.camera?.cameraFovAngle ?? 60,
      viewport: {
        width: 1,
        height: 1,
        pixelRatio: Math.min(typeof pixelRatio === 'number' && pixelRatio > 0 ? pixelRatio : 1, 2),
      },
      bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
    }),
  };
};

const graphicsMachineDefinition = setup({
  actors: graphicsActors,
  schemas: {
    context: types<GraphicsContext>(),
    events: eventSchemas<GraphicsEvent>(),
    input: types<GraphicsInput>(),
    emitted: eventSchemas<GraphicsEmitted>(),
    tags: types<GraphicsTag>(),
  },
}).createMachine({
  id: 'graphics',

  invoke: [{ src: 'watchWebGpuCanvasLoss', id: 'watchWebGpuCanvasLossInvocation' }],

  context: ({ input, spawn, actors }) => {
    const preference = input.graphicsBackend ?? 'webgpu';
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
      enablePostProcessing: input.enablePostProcessing ?? true,
      upDirection: input.upDirection ?? 'z',
      graphicsBackendPreference: preference,
      webGpuAvailable: false,
      resolvedGraphicsBackend: resolveGraphicsBackendPreference(preference, false),
      canvas: undefined,

      // Section view state (the cuts are durable and entry-scoped)
      ...createSectionViewSeed(input.sectionView),
      committedSectionCuts: [],

      // Measure state
      isMeasureActive: false,
      isMeasureInputReady: false,
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
      suppressNextModelPointerClick: false,
      modelPointerClickSuppressionReasons: [],
      viewerHoverSuppressionReasons: [],
      pickableMeshesVersion: 0,
      modelInteractionRef,
      ownsModelInteractionRef,
      modelInteractionUnitId: undefined,
      kinematicsRef: spawn(actors.kinematics, { id: 'kinematics', input: {} }),
      cameraRef: spawn(actors.camera, { id: 'camera', input: cameraSeed(input, input.upDirection ?? 'z') }),
      controlsAdapter: undefined,
      cameraPresented: false,
      cameraFraming: {
        identity: undefined,
        pendingView: input.camera?.cameraView,
        preserveOrientationOnFirstFrame: false,
        firstFrameView: undefined,
        initialized: false,
      },

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
    if (context.controlsAdapter) {
      enq.stop(context.controlsAdapter.ref);
    }
    if (context.canvas) {
      enq.stop(context.canvas.ref);
    }
    enq.stop(context.cameraRef);
  },
  initial: 'operational',
  states: {
    operational: {
      /* Seeded cuts set context directly; this raise only enters the section region's `on` state. */
      entry: ({ context }, enq) => {
        enq.listen(
          context.cameraRef,
          'viewChanged',
          (event): GraphicsEvent => ({
            type: 'cameraViewChanged',
            verticalSpan: (event as CameraMachineEmitted & { type: 'viewChanged' }).verticalSpan,
          }),
        );
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
          // Every camera change emits `viewChanged`; only a new span re-derives the grid.
          if (
            !Number.isFinite(event.verticalSpan) ||
            event.verticalSpan <= 0 ||
            event.verticalSpan === context.cameraVisibleSpan
          ) {
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
        setUpDirection: ({ context, event }, enq) => {
          if (event.payload === context.upDirection) {
            return {};
          }
          // The camera keeps its view direction and takes the new world up, unless the two are parallel.
          enq.sendTo(context.cameraRef, { type: 'setUpDirection', axis: event.payload });
          return { context: { upDirection: event.payload } };
        },
        setGraphicsBackendPreference: {
          context: ({ context, event }) => ({
            graphicsBackendPreference: event.payload,
            resolvedGraphicsBackend: resolveGraphicsBackendPreference(event.payload, context.webGpuAvailable),
          }),
        },

        canvasAttached: ({ context, event, actors }, enq) => {
          if (context.canvas?.canvasId === event.canvasId) {
            // Idempotent re-delivery: this surface's actor is already running.
            return {};
          }
          if (context.canvas) {
            enq.stop(context.canvas.ref);
          }
          const adapter = stopControlsAdapter(context, enq);
          const ref = enq.spawn(actors.canvas, {
            id: `canvas:${event.canvasId}`,
            input: {
              canvasId: event.canvasId,
              kind: event.kind,
              webglContext: event.webglContext,
              admittedBytes: event.admittedBytes,
              reattached: event.reattached,
            },
          });
          return { context: { canvas: { canvasId: event.canvasId, ref }, ...adapter } };
        },
        canvasDetached: ({ context, event }, enq) => {
          if (context.canvas?.canvasId !== event.canvasId) {
            // Stale: a replacement surface already took the slot.
            return {};
          }
          enq.stop(context.canvas.ref);
          return { context: { canvas: undefined, ...stopControlsAdapter(context, enq) } };
        },
        controlsAttached: ({ context, event }, enq) => {
          if (context.canvas?.canvasId !== event.canvasId) {
            // Stale: that surface is no longer attached.
            return {};
          }
          if (context.controlsAdapter?.canvasId === event.canvasId) {
            // Idempotent re-delivery: this surface's adapter is already running.
            return {};
          }
          const ref = enq.spawn(event.adapter, { id: `controls:${event.canvasId}` });
          return { context: { controlsAdapter: { canvasId: event.canvasId, ref }, cameraPresented: true } };
        },

        // Controls adapter events: the camera owns the gesture phase; graphics owns click and hover suppression.
        interactionStarted: ({ context }, enq) => {
          enq.sendTo(context.cameraRef, { type: 'interactionStarted' });
          return { context: { suppressNextModelPointerClick: false } };
        },
        interactionMoved: ({ context }, enq) => {
          if (!context.cameraRef.getSnapshot().matches({ gesture: 'held' })) {
            // A move with no held gesture (a stray control event) neither guards a click nor drops the hover.
            return {};
          }
          enq.sendTo(context.cameraRef, { type: 'interactionMoved' });
          if (context.viewerHoverSuppressionReasons.includes('cameraControls')) {
            return { context: { suppressNextModelPointerClick: true } };
          }
          clearViewerHover(context, enq, 'viewer');
          return {
            context: {
              suppressNextModelPointerClick: true,
              viewerHoverSuppressionReasons: addSuppressionReason(
                context.viewerHoverSuppressionReasons,
                'cameraControls',
              ),
            },
          };
        },
        interactionEnded: ({ context }, enq) => {
          enq.sendTo(context.cameraRef, { type: 'interactionEnded' });
          return {
            context: {
              viewerHoverSuppressionReasons: removeSuppressionReason(
                context.viewerHoverSuppressionReasons,
                'cameraControls',
              ),
            },
          };
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
          if (!context.artifact && !context.modelInteractionUnitId && context.artifactKey === '') {
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
            if (attributes.outcome === 'presented' && durations.receiptToFirstFrame !== undefined) {
              viewerFirstFrame({
                backend: attributes.backend,
                duration: durations.receiptToFirstFrame,
                triangles: attributes.triangleCount,
              });
            }
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
        commitSectionCuts: ({ context, event }) =>
          event.payload === context.committedSectionCuts ? {} : { context: { committedSectionCuts: event.payload } },

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
        /*
         * The rendering backend: `probing` while the WebGPU capability probe runs, `resolved` once it answered (or failed
         * or ran out of time), and `lost` once a WebGPU canvas on this page could not present. A canvas loss reported
         * while probing turns WebGPU off but, as before, the probe's own answer then decides.
         */
        backend: {
          initial: 'probing',
          states: {
            probing: {
              tags: ['backend-probing'],
              invoke: {
                src: 'probeWebGpu',
                id: 'probeWebGpuInvocation',
                onDone: ({ context, event }) => {
                  const output = typeof event.output === 'boolean' ? event.output : false;
                  return {
                    target: 'resolved',
                    context: {
                      webGpuAvailable: output,
                      resolvedGraphicsBackend: resolveGraphicsBackendPreference(
                        context.graphicsBackendPreference,
                        output,
                      ),
                    },
                  };
                },
                /** Probe actor rejected / threw — pessimistic fallback. */
                onError: ({ context }) => ({
                  target: 'resolved',
                  context: {
                    webGpuAvailable: false,
                    resolvedGraphicsBackend: resolveGraphicsBackendPreference(context.graphicsBackendPreference, false),
                  },
                }),
              },
              on: {
                webGpuCanvasLost: { context: webGpuOffContext },
              },
            },
            resolved: {
              on: {
                // A Retry or remount then starts on WebGL instead of repeating the WebGPU start the browser cannot present.
                webGpuCanvasLost: { target: 'lost', context: webGpuOffContext },
              },
            },
            lost: {
              on: {
                webGpuCanvasLost: { context: webGpuOffContext },
              },
            },
          },
        },
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
                        context: {
                          isMeasureActive: true,
                          isMeasureInputReady: false,
                          ...beginMeasureHoverSuppression(context, enq),
                        },
                      }
                    : undefined,
              },
            },

            on: {
              initial: 'selecting',
              on: {
                // Listener ownership is synchronous and local to the active tool; late inactive reports are ignored.
                setMeasureInputReady: { context: ({ event }) => ({ isMeasureInputReady: event.ready }) },
                // Leaving keeps every measurement; only a half-placed one is dropped.
                setMeasureActive: ({ context, event }) =>
                  event.payload
                    ? undefined
                    : {
                        target: 'off',
                        context: {
                          isMeasureActive: false,
                          isMeasureInputReady: false,
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

/**
 * The (state, event) pairs the graphics machine leaves unanswered today (MC-R17): its totality baseline. Each
 * state is a dotted path or `'*'`. The list records the gaps without changing them; a later change that answers one of
 * these events removes its pair here, and the totality test fails on a stale pair or an unlisted gap.
 *
 * @public
 */
export const graphicsIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  // Declared in the alphabet but handled in no state.
  ['*', 'startFeatureMeasurement'],
  // Turning the section on while on, or off while off, returns `undefined`.
  ['operational.section.off', 'setSectionViewActive'],
  ['operational.section.on', 'setSectionViewActive'],
  // Turning the measuring tool on while on, or off while off, returns `undefined`.
  ['operational.measure.off', 'setMeasureActive'],
  ['operational.measure.on', 'setMeasureActive'],
  // The measuring tool's own events, handled only inside `measure.on`.
  ['operational.measure.off', 'setMeasureInputReady'],
  ['operational.measure.off', 'clearAllMeasurements'],
  ['operational.measure.off', 'startMeasurement'],
  ['operational.measure.off', 'completeMeasurement'],
  ['operational.measure.off', 'completeFeatureMeasurement'],
  ['operational.measure.off', 'cancelCurrentMeasurement'],
  // A point is placed only while selecting, and completed or cancelled only once placed.
  ['operational.measure.on.selected', 'startMeasurement'],
  ['operational.measure.on.selecting', 'completeMeasurement'],
  ['operational.measure.on.selecting', 'cancelCurrentMeasurement'],
];

/** The graphics machine's state value: the operational backend, section and measure regions. @public */
export type GraphicsStateValue = {
  operational: {
    backend: 'probing' | 'resolved' | 'lost';
    measure: 'off' | { on: 'selected' | 'selecting' };
    section: 'off' | 'on';
  };
};

/**
 * The graphics machine's tags. `backend-probing`: the WebGPU capability probe has not answered yet.
 *
 * @public
 */
export type GraphicsTag = 'backend-probing';

/**
 * The graphics machine's type, written out rather than inferred. The inferred type carries every inline
 * handler's parameters expanded from the whole setup, which overflows declaration emit (TS7056;
 * xstate-policy K-17).
 *
 * @public
 */
export type GraphicsMachine = StateMachine<
  GraphicsContext,
  GraphicsEvent,
  Record<string, AnyActor>,
  GraphicsStateValue,
  GraphicsTag,
  GraphicsInput,
  Record<never, never>,
  GraphicsEmitted,
  MetaObject,
  StateSchema,
  Record<never, never>,
  typeof graphicsActors,
  Sources['guards'],
  Sources['delays']
>;

/** The parameters a written machine type must share with its definition: everything except the config. */
type CheckedMachineParameters<Machine> =
  Machine extends StateMachine<
    infer TContext,
    infer TEvent,
    infer TChildren,
    infer TStateValue,
    infer TTag,
    infer TInput,
    infer TOutput,
    infer TEmitted,
    MetaObject,
    infer _TConfig,
    infer _TActionMap,
    infer TActorMap,
    infer _TGuardMap,
    infer _TDelayMap
  >
    ? {
        context: TContext;
        event: TEvent;
        children: TChildren;
        stateValue: TStateValue;
        tag: TTag;
        input: TInput;
        output: TOutput;
        emitted: TEmitted;
        actors: TActorMap;
      }
    : never;

/** `true` when `A` and `B` are assignable to each other, so neither accepts a value the other rejects. */
type IsSameType<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** The names of the parameters on which `Written` and `Definition` disagree; `never` when they agree. */
type MachineParameterDrift<Written, Definition> = {
  [K in keyof CheckedMachineParameters<Written>]: IsSameType<
    CheckedMachineParameters<Written>[K],
    K extends keyof CheckedMachineParameters<Definition> ? CheckedMachineParameters<Definition>[K] : never
  > extends true
    ? never
    : K;
}[keyof CheckedMachineParameters<Written>];

/** `Definition` when the written type matches it, else a type `Definition` cannot be assigned to that names the drift. */
type MatchingDefinition<Definition, Written> = [MachineParameterDrift<Written, Definition>] extends [never]
  ? Definition
  : { readonly parameterDrift: MachineParameterDrift<Written, Definition> };

/* The inferred machine keeps its full config type, which is what cannot be serialized; the written type
 * drops only that config parameter. This module-private assignment fails to compile when the written
 * context, events, children, state value, tags, input, output, emitted events or actors drift from the
 * definition, so the cast below never publishes an unverified type. */
const checkedGraphicsMachineDefinition: MatchingDefinition<typeof graphicsMachineDefinition, GraphicsMachine> =
  graphicsMachineDefinition;

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
 *   ├── backend
 *   │   ├── probing (default; the WebGPU capability probe runs)
 *   │   ├── resolved
 *   │   └── lost (a WebGPU canvas on the page could not present)
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
 * @public
 */
export const graphicsMachine = checkedGraphicsMachineDefinition as unknown as GraphicsMachine;

/**
 * Selects the key of the geometry currently on screen, falling back to the artifact key before any GLTF has been presented.
 *
 * @param snapshot - The graphics machine snapshot.
 * @returns The presented geometry key.
 * @public
 */
export const selectPresentedGeometryKey = (snapshot: GraphicsSnapshot): string =>
  snapshot.context.gltfPresentation.presentedKey ?? snapshot.context.artifactKey;
