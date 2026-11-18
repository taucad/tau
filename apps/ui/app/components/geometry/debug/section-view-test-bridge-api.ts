/**
 * The section-view test bridge's contract: what `globalThis.__TAU_SECTION_VIEW_TEST__` (the newest viewport's bridge)
 * and `__TAU_SECTION_VIEW_TEST_BRIDGES__` (every mounted viewport's) answer in an undeployed debug build. The bridge
 * (`section-view-test-bridge.tsx`) implements it and the e2e suite reads it from here, so removing or changing a method
 * fails the suite's typecheck. Type-only: nothing here runs.
 *
 * @module
 */

import type { CameraSource } from '@taucad/camera/machine';
import type { RenderFrame } from '@taucad/spatial';
import type { GraphicsViewSettings } from '@taucad/viewer/graphics/graphics-settings';
import type {
  SectionAxis,
  SectionCut,
  SectionCutPatch,
  SectionCutValues,
  SectionPiece,
  SectionPlane,
} from '@taucad/viewer/graphics/section-cuts';
import type { SectionHandleTarget } from '@taucad/viewer/graphics/three/controls/section-handles';
import type { RenderLoopCapture } from '@taucad/viewer/graphics/three/render-loop-observer';
import type { RenderTier } from '@taucad/viewer/graphics/three/render-tier';
import type { SectionCapStencilDiagnostics } from '@taucad/viewer/graphics/three/utils/section-cap-stencil-debug';
import type { WorkspaceRendererIdentity } from '#components/geometry/debug/workspace-renderer-diagnostics.js';

/**
 * A cut to add: what is left out takes the Add menu's default with no view (a plane through the bounds centre,
 * unflipped; a 90° cutaway from angle zero). A cutaway passes through the bounds centre.
 */
export type SectionViewTestCut =
  | Readonly<{
      kind: 'plane';
      plane: SectionPlane;
      offset?: number;
      isFlipped?: boolean;
    }>
  | Readonly<{
      kind: 'revolution';
      axis: SectionAxis;
      start?: number;
      sweep?: number;
    }>;

export type SectionViewTestSectionState = Readonly<{
  isActive: boolean;
  cuts: readonly SectionCut[];
  selectedCutId: string | undefined;
  hoveredCutId: string | undefined;
  /** The cuts the caps last committed, which picking and captures read, and the pieces they remove. */
  committedCuts: readonly SectionCut[];
  committedPieces: readonly SectionPiece[];
  /** Whether the committed cuts hold the live cuts' values: the caps have caught up with the last edit. */
  isCommitted: boolean;
}>;

export type SectionViewTestCamera = Readonly<{
  position: readonly [number, number, number];
  target?: readonly [number, number, number];
  fov?: number;
  zoom?: number;
  rollRadians?: number;
}>;

export type SectionViewTestCameraState = Readonly<{
  actorStatus: string;
  actorError?: string;
  projection: 'orthographic' | 'perspective';
  requestedFov: number;
  requestedPerspectiveZoom: number;
  bounds: Readonly<{
    min: readonly [number, number, number];
    max: readonly [number, number, number];
  }>;
  handoffFov?: number;
  verticalSpan: number;
  /** The camera actor's view revision; it advances once for every view change the actor applies. */
  revision: number;
  /** The source of the change that produced `revision` (`input`, `framing`, `persisted` and so on). */
  lastChangeSource: CameraSource;
  position: readonly [number, number, number];
  quaternion: readonly [number, number, number, number];
  target: readonly [number, number, number];
  fov?: number;
  zoom?: number;
  aspect: number;
  controlsDistance: number;
  controlsEnabled: boolean;
  viewportGizmoLockActive: boolean;
  clipping: Readonly<{ near: number; far: number }>;
  nativeClipping: Readonly<{ near: number; far: number }>;
}>;

export type SectionViewTestCameraTransitionDiagnostics = Readonly<{
  requests: number;
  frames: number;
  actorSyncFailures: number;
  averageRequestToActorSyncMilliseconds: number;
  maximumRequestToActorSyncMilliseconds: number;
  maximumRequestToFrameMilliseconds: number;
  staleFrames: number;
}>;

export type SectionViewTestHelperSummary = Readonly<{
  sectionHelperMeshCount: number;
  sectionHelperLineSegments2Count: number;
  sectionHelperContourSegmentCount: number;
  sectionHelperRenderOrders: Readonly<{
    meshes: readonly number[];
    lineSegments2: readonly number[];
  }>;
  sectionHelperMaterialStates: readonly SectionViewTestHelperMaterialState[];
}>;

export type SectionViewTestHelperMaterialState = Readonly<{
  objectType: string;
  materialType: string;
  renderOrder: number;
  transparent: boolean;
  depthTest: boolean;
  depthWrite: boolean;
}>;

export type SectionViewTestProjectedPoint = Readonly<{
  x: number;
  y: number;
  visible: boolean;
}>;

export type SectionViewTestModelHoverState = Readonly<{
  activeUnitId: string | undefined;
  hoveredComponentId: string | undefined;
}>;

export type SectionViewTestModelComponent = Readonly<{
  id: string;
  name: string;
}>;

export type SectionViewTestModelVisibility = Readonly<{
  hiddenComponentIds: readonly string[];
  isolatedComponentIds: readonly string[];
}>;

export type SectionViewTestRenderedModelComponentState = Readonly<{
  meshCount: number;
  visibleMeshCount: number;
  materialOpacities: readonly number[];
  surfaceMaterialOpacities: readonly number[];
  edgeMaterialOpacities: readonly number[];
}>;

/** How the caps graded the committed sources: every source is capped, exactly or per loop. */
export type SectionViewTestCapCompleteness = Readonly<{
  status: 'complete';
  admittedSourceCount: number;
  exactSourceCount: number;
  perLoopSourceCount: number;
  pendingSourceCount: number;
  sources: ReadonlyArray<
    Readonly<{ sourceKey: string; grade: 'exact' | 'per-loop' | 'pending'; reason: string | undefined }>
  >;
}>;

export type SectionViewTestMeasureState = Readonly<{
  isMeasureActive: boolean;
  /** True while camera controls hold a gesture (`gesture.held`); a measure gesture started here is discarded. */
  cameraInteracting: boolean;
  /** Meshes the measure tool has drawn into the scene: snap indicators, lines and labels. */
  measurementUiMeshCount: number;
  rendererGeometryCount: number;
  snapDistancePx: number;
  candidates: ReadonlyArray<Readonly<{ id: string; label: string }>>;
  activeCandidateId: string | undefined;
  lockedTargetId: string | undefined;
  mode: 'auto' | 'point';
  currentStart: readonly [number, number, number] | undefined;
  measurements: ReadonlyArray<
    Readonly<{
      id: string;
      distance: number;
      startPoint: readonly [number, number, number];
      endPoint: readonly [number, number, number];
      operation?: string;
      quality?: string;
      status?: string;
      unavailableReason?: string;
    }>
  >;
}>;

/** The render tier one viewport canvas incarnation presents on, and the renderer generation it belongs to. */
export type SectionViewTestPresentedTier = Readonly<{ rendererGeneration: number; tier: RenderTier }>;

export type SectionViewTestBridgeApi = Readonly<{
  /**
   * Resolves once this bridge's canvas incarnation has presented its first frame, with the tier it presents on. Resolves
   * `undefined` when that incarnation ends first (a WebGPU canvas the browser destroyed remounts on WebGL as a new
   * incarnation, with a new bridge) or the bridge unmounts: the caller then asks the bridge that replaced it.
   */
  whenPresented(): Promise<SectionViewTestPresentedTier | undefined>;
  getGraphicsBackend(): 'webgl' | 'webgpu';
  /** Why this page draws on WebGL where WebGPU was asked for (`canvas-loss`), or `undefined` when it has not fallen back. */
  getWebGpuFallbackReason(): 'canvas-loss' | undefined;
  /** A number that changes whenever this viewport's renderer is replaced, as by a remount. */
  getRendererGeneration(): number;
  /** Identity from this viewport's renderer, never a separately created probe context. */
  getRendererIdentity(): WorkspaceRendererIdentity;
  /** Warmed full R3F frame submission and completion latency, in milliseconds; excludes RAF/vsync. */
  measureRenderFrames(options?: Readonly<{ gpuTiming?: boolean; orbit?: boolean }>): Promise<
    Readonly<{
      submission: readonly number[];
      completion: readonly number[];
      gpu: ReadonlyArray<number | undefined>;
      gpuMethod: string;
      firstSubmission: number;
      geometries: number;
      textures: number;
      drawCalls: number;
      triangles: number;
      revision: string;
      width: number;
      height: number;
      pixelRatio: number;
    }>
  >;
  startRenderLoopCapture(): void;
  finishRenderLoopCapture(): RenderLoopCapture;
  getViewportCanvas(): HTMLCanvasElement;
  /** The durable record this view persists, for revisit-equals-reload assertions (Law 4). */
  getViewSettings(): GraphicsViewSettings | undefined;
  isGeometryFramed(): boolean;
  /** Replaces the cuts, none selected, turning Section on (off for none); returns the ids of those added. */
  setSectionCuts(cuts: readonly SectionViewTestCut[]): string[];
  /** Adds a cut, selected, turning Section on; undefined when the list is full. */
  addSectionCut(cut: SectionViewTestCut): string | undefined;
  updateSectionCut(id: string, patch: SectionCutPatch): void;
  /** Removing the last cut turns Section off. */
  removeSectionCut(id: string): void;
  selectSectionCut(id: string | undefined): void;
  /** On with no cuts adds the default plane. */
  setSectionViewActive(active: boolean): void;
  getSectionState(): SectionViewTestSectionState;
  /** Where a drawn handle is on screen; only the selected cut has drag handles. */
  projectSectionHandle(kind: SectionHandleTarget['kind'], cutId: string): SectionViewTestProjectedPoint | undefined;
  setPresentation(presentation: Readonly<{ surfaces: boolean; lines: boolean }>): void;
  setGridPresentationClipPolicy(policy: Readonly<{ far: boolean; near: boolean }>): void;
  getModelComponents(): SectionViewTestModelComponent[];
  getModelVisibility(): SectionViewTestModelVisibility;
  getRenderedModelComponentState(componentId: string): SectionViewTestRenderedModelComponentState;
  /** Actual triangle bounds in anchor-frame metres, including the live mechanism pose. */
  getRenderedModelComponentSurfaceBounds(componentId: string):
    | Readonly<{
        min: readonly [number, number, number];
        max: readonly [number, number, number];
      }>
    | undefined;
  /** Actual triangle vertices in anchor-frame metres, independent of joint metadata. */
  getRenderedModelComponentSurfacePoints(componentId: string): Array<readonly [number, number, number]>;
  projectModelComponent(componentId: string): SectionViewTestProjectedPoint[];
  hideModelComponent(componentId: string): void;
  isolateModelComponent(componentId: string): void;
  resetModelVisibility(): void;
  setCamera(camera: SectionViewTestCamera): void;
  setFovAngle(angle: number): void;
  getCamera(): SectionViewTestCameraState;
  getCameraTransitionDiagnostics(): SectionViewTestCameraTransitionDiagnostics;
  resetCameraTransitionDiagnostics(): void;
  getRenderFrame(): RenderFrame;
  setRenderFrame(renderFrame: RenderFrame): void;
  projectWorldPoint(point: readonly [number, number, number]): SectionViewTestProjectedPoint;
  getModelHoverState(): SectionViewTestModelHoverState;
  setMeasureActive(active: boolean): void;
  getMeasureState(): SectionViewTestMeasureState;
  getSectionHelperSummary(): SectionViewTestHelperSummary;
  getSectionCapCompleteness(): SectionViewTestCapCompleteness | undefined;
  getSectionCapStencilDiagnostics(): SectionCapStencilDiagnostics | undefined;
  /**
   * Draw the section caps with or without their outlines and request a frame. Off only for a test that compares the
   * two frames to find the pixels the outlines own; returns false when no section view is mounted.
   */
  setSectionCapOutlinesVisible(visible: boolean): boolean;
}>;

/** A cut's values without its id, as `getSectionState` reports them once the id is set aside. */
export type SectionViewTestCutValues = SectionCutValues;

declare global {
  /** The newest mounted viewport's section-view test bridge, in an undeployed debug build. */
  // oxlint-disable-next-line no-var -- A global the page assigns is declared with `var`.
  // eslint-disable-next-line @typescript-eslint/naming-convention -- The page global's name is the bridge contract.
  var __TAU_SECTION_VIEW_TEST__: SectionViewTestBridgeApi | undefined;
  /** Every mounted viewport's section-view test bridge, oldest first. */
  // oxlint-disable-next-line no-var -- A global the page assigns is declared with `var`.
  // eslint-disable-next-line @typescript-eslint/naming-convention -- The page global's name is the bridge contract.
  var __TAU_SECTION_VIEW_TEST_BRIDGES__: SectionViewTestBridgeApi[] | undefined;
}
