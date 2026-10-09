import React, { useEffect } from 'react';
import * as THREE from 'three';
import { renderLoopObservers } from '#components/geometry/graphics/three/render-loop-observer.js';
import type { RenderLoopCapture } from '#components/geometry/graphics/three/render-loop-observer.js';
import { createRenderFrameTimer } from '#components/geometry/graphics/three/render-frame-timing.js';
import { useFrame, useThree } from '@react-three/fiber';
import type { RendererInstance } from '#components/geometry/graphics/three/renderer.js';
import { perspectiveVerticalSpan } from '@taucad/camera';
import type { RenderFrame } from '@taucad/spatial';
import { toThreeRenderPoint } from '@taucad/three/spatial';
import { useFeature } from '#flags/use-feature.js';
import { useProject } from '#hooks/use-project.js';
import { graphicsSettingsForView } from '#workbench-records/projection.js';
import type { GraphicsViewSettings } from '#constants/editor.constants.js';
import type { GraphicsContext } from '#machines/graphics.machine.js';
import { areSectionCutsEqual, resolveSectionPieces } from '#components/geometry/graphics/section-cuts.js';
import type {
  SectionAxis,
  SectionCut,
  SectionCutPatch,
  SectionPiece,
  SectionPlane,
} from '#components/geometry/graphics/section-cuts.js';
import type { SectionHandleTarget } from '#components/geometry/graphics/three/controls/section-handles.js';
import {
  useCameraConnectorRef,
  useCameraRig,
  useGraphics,
  useModelInteractionRef,
  useSetRenderFrame,
} from '#hooks/use-graphics.js';
import { getModelComponentIdInHierarchy } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import { getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import {
  getControlsDistance,
  resolveCameraUp,
} from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';
import { hasSceneTag, sceneTag } from '#components/geometry/graphics/three/utils/scene-tags.js';
import { sectionCapOverlapDebugUserDataKey } from '#components/geometry/graphics/three/utils/section-cap-overlap-debug.js';
import type { SectionCapOverlapDebugSummary } from '#components/geometry/graphics/three/utils/section-cap-overlap-debug.js';
import { sectionCapPerformanceDebugUserDataKey } from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';
import type { SectionCapPerformanceDebugSummary } from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';
import { useViewportGizmoInteractionLock } from '#components/geometry/graphics/three/controls/viewport-gizmo-interaction-lock.js';
import type { ViewportGizmoInteractionLock } from '#components/geometry/graphics/three/controls/viewport-gizmo-interaction-lock.js';
import { getSceneRenderRoots } from '#components/geometry/graphics/three/scene-overlay.js';
import {
  infiniteGridFadeEndVisibleSpans,
  infiniteGridPresentationPlaneByUpDirection,
} from '#components/geometry/graphics/three/utils/infinite-grid-frame.js';

/**
 * A cut to add: what is left out takes the Add menu's default with no view (a plane through the bounds centre,
 * unflipped; a 90° cutaway from angle zero). A cutaway passes through the bounds centre.
 */
export type SectionViewTestCut =
  | Readonly<{ kind: 'plane'; plane: SectionPlane; offset?: number; isFlipped?: boolean }>
  | Readonly<{ kind: 'revolution'; axis: SectionAxis; start?: number; sweep?: number }>;

export type SectionViewTestSectionState = Readonly<{
  isActive: boolean;
  cuts: readonly SectionCut[];
  selectedCutId: string | undefined;
  hoveredCutId: string | undefined;
  /** The cuts the caps last certified, which picking and captures read, and the pieces they remove. */
  committedCuts: readonly SectionCut[];
  committedPieces: readonly SectionPiece[];
  certification: GraphicsContext['sectionCertification'];
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
  bounds: Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number] }>;
  handoffFov?: number;
  verticalSpan: number;
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
}>;

export type SectionViewTestCapCompleteness =
  | Readonly<{
      status: 'complete';
      admittedSourceCount: number;
      extensionSourceCount: number;
      fallbackSourceCount: number;
      trueCutComponentCount: number;
      cappedTrueCutComponentCount: number;
      unresolvedTrueCutEdgeCount: number;
      unsupportedSourceCount: number;
    }>
  | Readonly<{
      status: 'unsupported' | 'failed';
      failure: Readonly<{ sourceKey: string; code: string; message: string }>;
    }>;

export type SectionViewTestMeasureState = Readonly<{
  isMeasureActive: boolean;
  /** True while camera controls own the pointer; a measure gesture started here is discarded. */
  cameraInteracting: boolean;
  /** Meshes the measure tool has drawn into the scene: snap indicators, lines and labels. */
  measurementUiMeshCount: number;
  rendererGeometryCount: number;
  snapDistancePx: number;
  candidates: GraphicsContext['measureCandidates'];
  activeCandidateId: string | undefined;
  lockedTargetId: string | undefined;
  mode: GraphicsContext['measureMode'];
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

export type SectionViewTestBridgeApi = Readonly<{
  getGraphicsBackend(): 'webgl' | 'webgpu';
  /** Identity from this viewport's renderer, never a separately created probe context. */
  getRendererIdentity(): Readonly<{ api: 'webgl' | 'webgpu'; name: string; frame: number }>;
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
  setPostProcessingEnabled(enabled: boolean): void;
  setGridPresentationClipPolicy(policy: Readonly<{ far: boolean; near: boolean }>): void;
  getModelComponents(): SectionViewTestModelComponent[];
  getModelVisibility(): SectionViewTestModelVisibility;
  getRenderedModelComponentState(componentId: string): SectionViewTestRenderedModelComponentState;
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
  getSectionCapOverlapDiagnostics(): SectionCapOverlapDebugSummary | undefined;
  getSectionCapPerformanceDiagnostics(): SectionCapPerformanceDebugSummary | undefined;
}>;

type SectionViewTestGlobal = typeof globalThis & {
  __TAU_SECTION_VIEW_TEST__?: SectionViewTestBridgeApi;
  __TAU_SECTION_VIEW_TEST_BRIDGES__?: SectionViewTestBridgeApi[];
};

function isActuallyVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | undefined = object;
  while (current) {
    if (!current.visible) {
      return false;
    }
    current = current.parent ?? undefined;
  }
  return true;
}

function getRenderedModelComponentState(
  scene: THREE.Object3D,
  componentId: string,
): SectionViewTestRenderedModelComponentState {
  let meshCount = 0;
  let visibleMeshCount = 0;
  const materialOpacities: number[] = [];
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || getModelComponentIdInHierarchy(object) !== componentId) {
      return;
    }
    meshCount++;
    if (isActuallyVisible(object)) {
      visibleMeshCount++;
      materialOpacities.push(...getObjectMaterials(object).map((material) => material.opacity));
    }
  });
  return { meshCount, visibleMeshCount, materialOpacities };
}

export const getSectionViewTestControlState = ({
  controls,
  interactionLock,
}: {
  readonly controls: unknown;
  readonly interactionLock: Pick<ViewportGizmoInteractionLock, 'activeRef'>;
}): Pick<SectionViewTestCameraState, 'controlsEnabled' | 'viewportGizmoLockActive'> => {
  const enabled = (controls as { enabled?: unknown } | undefined)?.enabled;

  return {
    controlsEnabled: typeof enabled === 'boolean' ? enabled : true,
    viewportGizmoLockActive: interactionLock.activeRef.current,
  };
};

export const getSectionViewTestMeasurementUiMeshCount = (scene: THREE.Object3D): number => {
  const meshes = new Set<THREE.Object3D>();

  for (const root of getSceneRenderRoots(scene as THREE.Scene)) {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh && hasSceneTag(child, sceneTag.measurementUi)) {
        meshes.add(child);
      }
    });
  }

  return meshes.size;
};

/** A point in normalized device coordinates, in viewport pixels; visible inside the view volume. */
const toProjectedPoint = (
  projected: THREE.Vector3,
  rect: Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>,
): SectionViewTestProjectedPoint => ({
  x: rect.left + ((projected.x + 1) / 2) * rect.width,
  y: rect.top + ((1 - projected.y) / 2) * rect.height,
  visible:
    projected.x >= -1 &&
    projected.x <= 1 &&
    projected.y >= -1 &&
    projected.y <= 1 &&
    projected.z >= -1 &&
    projected.z <= 1,
});

function getLineSegments2SegmentCount(object: THREE.Object3D): number {
  const attributes = (object as { geometry?: THREE.BufferGeometry }).geometry?.attributes;
  const instanceStartCount = attributes?.['instanceStart']?.count;
  if (typeof instanceStartCount === 'number') {
    return instanceStartCount;
  }

  const positionCount = attributes?.['position']?.count;
  return typeof positionCount === 'number' ? Math.floor(positionCount / 2) : 0;
}

function getObjectMaterials(object: THREE.Object3D): THREE.Material[] {
  const { material } = object as { material?: THREE.Material | THREE.Material[] };
  if (!material) {
    return [];
  }

  return Array.isArray(material) ? material : [material];
}

export const getSectionViewTestHelperSummary = (scene: THREE.Object3D): SectionViewTestHelperSummary => {
  let sectionHelperMeshCount = 0;
  let sectionHelperLineSegments2Count = 0;
  let sectionHelperContourSegmentCount = 0;
  const meshRenderOrders: number[] = [];
  const lineSegments2RenderOrders: number[] = [];
  const sectionHelperMaterialStates: SectionViewTestHelperMaterialState[] = [];

  const visitSectionHelper = (child: THREE.Object3D): void => {
    if (!hasSceneTag(child, sceneTag.sectionViewHelper)) {
      return;
    }

    if (child.type === 'LineSegments2') {
      sectionHelperLineSegments2Count++;
      sectionHelperContourSegmentCount += getLineSegments2SegmentCount(child);
      lineSegments2RenderOrders.push(child.renderOrder);
    } else if (child instanceof THREE.Mesh) {
      sectionHelperMeshCount++;
      meshRenderOrders.push(child.renderOrder);
    }

    for (const material of getObjectMaterials(child)) {
      sectionHelperMaterialStates.push({
        objectType: child.type,
        materialType: material.type,
        renderOrder: child.renderOrder,
        transparent: material.transparent,
        depthTest: material.depthTest,
        depthWrite: material.depthWrite,
      });
    }
  };
  for (const root of getSceneRenderRoots(scene as THREE.Scene)) {
    root.traverse(visitSectionHelper);
  }

  return {
    sectionHelperMeshCount,
    sectionHelperLineSegments2Count,
    sectionHelperContourSegmentCount,
    sectionHelperRenderOrders: {
      meshes: meshRenderOrders,
      lineSegments2: lineSegments2RenderOrders,
    },
    sectionHelperMaterialStates,
  };
};

/**
 * Where a section handle is on screen: the centre of the bounds of its hit meshes, which the handles name
 * `kind:cutId`; undefined while none is drawn.
 */
export const projectSectionViewTestHandle = ({
  target,
  camera,
  rect,
  scene,
}: {
  readonly target: SectionHandleTarget;
  readonly camera: THREE.Camera;
  readonly rect: Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>;
  readonly scene: THREE.Object3D;
}): SectionViewTestProjectedPoint | undefined => {
  const name = `${target.kind}:${target.cutId}`;
  const bounds = new THREE.Box3();
  for (const root of getSceneRenderRoots(scene as THREE.Scene)) {
    root.updateMatrixWorld(true);
    root.traverse((child) => {
      if (child.name === name && hasSceneTag(child, sceneTag.sectionViewHelper) && isActuallyVisible(child)) {
        bounds.expandByObject(child);
      }
    });
  }
  return bounds.isEmpty() ? undefined : toProjectedPoint(bounds.getCenter(new THREE.Vector3()).project(camera), rect);
};

export const getSectionViewTestCapOverlapDiagnostics = (
  scene: THREE.Object3D,
): SectionCapOverlapDebugSummary | undefined => {
  let summary: SectionCapOverlapDebugSummary | undefined;

  scene.traverse((child) => {
    const candidate = (child.userData as Record<string, unknown>)[sectionCapOverlapDebugUserDataKey];
    if (candidate && typeof candidate === 'object') {
      summary = candidate as SectionCapOverlapDebugSummary;
    }
  });

  return summary;
};

export const getSectionViewTestCapPerformanceDiagnostics = (
  scene: THREE.Object3D,
): SectionCapPerformanceDebugSummary | undefined => {
  let summary: SectionCapPerformanceDebugSummary | undefined;

  scene.traverse((child) => {
    const candidate = (child.userData as Record<string, unknown>)[sectionCapPerformanceDebugUserDataKey];
    if (candidate && typeof candidate === 'object') {
      summary = candidate as SectionCapPerformanceDebugSummary;
    }
  });

  return summary;
};

export function SectionViewTestBridge({ isGeometryFramed }: { readonly isGeometryFramed: boolean }): React.ReactNode {
  const isTauDebugEnabled = useFeature('tauDebug');
  const graphicsActor = useGraphics();
  const project = useProject({ enableNoContext: true });
  const cameraRig = useCameraRig();
  const cameraConnectorRef = useCameraConnectorRef();
  const setRenderFrame = useSetRenderFrame();
  const modelInteractionRef = useModelInteractionRef();
  const get = useThree((state) => state.get);
  const interactionLock = useViewportGizmoInteractionLock();
  const pendingCameraTransitionRef = React.useRef<
    { readonly camera: THREE.Camera; readonly requestedAt: number } | undefined
  >(undefined);
  const cameraTransitionDiagnosticsRef = React.useRef<SectionViewTestCameraTransitionDiagnostics>({
    requests: 0,
    frames: 0,
    actorSyncFailures: 0,
    averageRequestToActorSyncMilliseconds: 0,
    maximumRequestToActorSyncMilliseconds: 0,
    maximumRequestToFrameMilliseconds: 0,
    staleFrames: 0,
  });

  useFrame((state) => {
    const pending = pendingCameraTransitionRef.current;
    if (!pending) {
      return;
    }
    const controlsCamera =
      (state.controls as { camera?: unknown; object?: unknown } | undefined)?.camera ??
      (state.controls as { object?: unknown } | undefined)?.object;
    const isStale =
      state.camera !== pending.camera ||
      cameraRig.activeCamera !== pending.camera ||
      (controlsCamera !== undefined && controlsCamera !== pending.camera);
    const elapsed = performance.now() - pending.requestedAt;
    const diagnostics = cameraTransitionDiagnosticsRef.current;
    cameraTransitionDiagnosticsRef.current = {
      ...diagnostics,
      frames: diagnostics.frames + 1,
      maximumRequestToFrameMilliseconds: Math.max(diagnostics.maximumRequestToFrameMilliseconds, elapsed),
      staleFrames: diagnostics.staleFrames + (isStale ? 1 : 0),
    };
    pendingCameraTransitionRef.current = undefined;
  }, 4);

  useEffect(() => {
    if (!isTauDebugEnabled) {
      return undefined;
    }

    const { scene } = get();
    const bridgeGlobal = globalThis as SectionViewTestGlobal;
    const getActiveUnitId = (): string | undefined => graphicsActor.getSnapshot().context.modelInteractionUnitId;
    const setFovAngle = (angle: number): void => {
      const expectedCamera = angle === 0 ? cameraRig.orthographicCamera : cameraRig.perspectiveCamera;
      const requestedAt = performance.now();
      pendingCameraTransitionRef.current = { camera: expectedCamera, requestedAt };
      cameraRig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: angle });
      const elapsed = performance.now() - requestedAt;
      const diagnostics = cameraTransitionDiagnosticsRef.current;
      const requests = diagnostics.requests + 1;
      const actorSynced =
        cameraRig.actorRef.getSnapshot().context.view.requestedVerticalFieldOfView === angle &&
        cameraRig.activeCamera === expectedCamera;
      cameraTransitionDiagnosticsRef.current = {
        ...diagnostics,
        requests,
        actorSyncFailures: diagnostics.actorSyncFailures + (actorSynced ? 0 : 1),
        averageRequestToActorSyncMilliseconds:
          (diagnostics.averageRequestToActorSyncMilliseconds * diagnostics.requests + elapsed) / requests,
        maximumRequestToActorSyncMilliseconds: Math.max(diagnostics.maximumRequestToActorSyncMilliseconds, elapsed),
      };
    };
    const addSectionCut = (cut: SectionViewTestCut): string | undefined => {
      const count = graphicsActor.getSnapshot().context.sectionCuts.length;
      graphicsActor.send({
        type: 'addSectionCut',
        payload: cut.kind === 'plane' ? { kind: 'plane', plane: cut.plane } : { kind: 'revolution', axis: cut.axis },
      });
      const added = graphicsActor.getSnapshot().context.sectionCuts[count];
      if (added) {
        // The cut is its own patch: a patch ignores `kind`, and a value left out keeps the default.
        graphicsActor.send({ type: 'updateSectionCut', payload: { id: added.id, patch: cut } });
      }
      return added?.id;
    };
    const bridge: SectionViewTestBridgeApi = {
      getViewSettings() {
        if (!project) {
          return undefined;
        }
        /* The view id is the Dockview panel id the project keyed this graphics actor by, so the
         * bridge finds its own record without a prop drilled through the whole R3F tree. */
        const viewId = [...project.projectRef.getSnapshot().context.viewGraphics.entries()].find(
          ([, actor]) => actor === graphicsActor,
        )?.[0];
        return viewId === undefined
          ? undefined
          : project.viewRecords.get(viewId)
            ? graphicsSettingsForView(project.viewRecords.get(viewId)!)
            : undefined;
      },
      getGraphicsBackend() {
        const renderer = get().gl as unknown as { readonly backend?: { readonly isWebGPUBackend?: boolean } };
        return renderer.backend?.isWebGPUBackend === true ? 'webgpu' : 'webgl';
      },
      getRendererIdentity() {
        const { gl } = get();
        const renderer = gl as RendererInstance;
        const api = 'isWebGPURenderer' in gl && gl.isWebGPURenderer ? 'webgpu' : 'webgl';
        const context = api === 'webgl' ? gl.getContext() : undefined;
        const debug = context?.getExtension('WEBGL_debug_renderer_info');
        return {
          api,
          name: debug ? String(context?.getParameter(debug.UNMASKED_RENDERER_WEBGL) ?? '') : '',
          frame: 'drawCalls' in renderer.info.render ? renderer.info.render.calls : renderer.info.render.frame,
        };
      },
      async measureRenderFrames(options = {}) {
        const state = get();
        const initialCamera = bridge.getCamera();
        const offset = new THREE.Vector3(...initialCamera.position).sub(new THREE.Vector3(...initialCamera.target));
        const renderer = state.gl as RendererInstance;
        const previousFrameloop = state.frameloop;
        const previousAutoReset = renderer.info.autoReset;
        const timer = createRenderFrameTimer(renderer, options.gpuTiming === true);
        const gpu: Array<number | undefined> = [];
        let firstSubmission = 0;
        const submission: number[] = [];
        const completion: number[] = [];
        // Three exposes the native device on its backend; its declaration omits the device field.
        const device =
          'backend' in renderer
            ? (Reflect.get(renderer.backend, 'device') as {
                queue: { onSubmittedWorkDone(): Promise<void> };
              })
            : undefined;
        let drawCalls = 0;
        let triangles = 0;
        state.setFrameloop('never');
        renderer.info.autoReset = false;
        try {
          // oxlint-disable-next-line no-await-in-loop -- serialize frames so completion covers this frame alone.
          for (let index = 0; index < 140; index++) {
            // Three advances its FRAME node cache on RAF; exclude pacing from the measured work.
            // oxlint-disable-next-line no-await-in-loop -- each sample must render a fresh scene pass.
            await new Promise<void>((resolve) => {
              requestAnimationFrame(() => {
                resolve();
              });
            });
            renderer.info.reset();
            if (options.orbit) {
              const position = offset.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), index * 0.005);
              position.add(new THREE.Vector3(...initialCamera.target));
              bridge.setCamera({
                position: [position.x, position.y, position.z],
                target: initialCamera.target,
                zoom: initialCamera.zoom,
              });
            }
            timer.begin();
            const startedAt = performance.now();
            state.advance(startedAt / 1000, false);
            const submittedAt = performance.now();
            timer.end();
            if (index === 0) {
              firstSubmission = submittedAt - startedAt;
            }
            if (device) {
              // oxlint-disable-next-line no-await-in-loop -- completion fence for the measured frame.
              await device.queue.onSubmittedWorkDone();
            } else if (renderer instanceof THREE.WebGLRenderer) {
              renderer.getContext().finish();
            }
            const completedAt = performance.now();
            // oxlint-disable-next-line no-await-in-loop -- resolve all passes from this frame before the next.
            const gpuDuration = await timer.resolve();
            if (index >= 20) {
              gpu.push(gpuDuration);
              submission.push(submittedAt - startedAt);
              completion.push(completedAt - startedAt);
            }
            drawCalls =
              'drawCalls' in renderer.info.render ? renderer.info.render.drawCalls : renderer.info.render.calls;
            triangles = renderer.info.render.triangles;
          }
        } finally {
          renderer.info.autoReset = previousAutoReset;
          timer.dispose();
          if (options.orbit) {
            bridge.setCamera({
              position: initialCamera.position,
              target: initialCamera.target,
              zoom: initialCamera.zoom,
            });
          }
          state.setFrameloop(previousFrameloop);
          state.invalidate();
        }
        return {
          submission,
          completion,
          gpu,
          gpuMethod: timer.method,
          firstSubmission,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          drawCalls,
          triangles,
          revision: THREE.REVISION,
          width: renderer.domElement.width,
          height: renderer.domElement.height,
          pixelRatio: renderer.getPixelRatio(),
        };
      },
      startRenderLoopCapture() {
        const observer = renderLoopObservers.get(get().gl.domElement);
        if (!observer) {
          throw new Error('Render-loop observer is not mounted');
        }
        observer.startCapture(performance.now());
      },
      finishRenderLoopCapture() {
        const observer = renderLoopObservers.get(get().gl.domElement);
        if (!observer) {
          throw new Error('Render-loop observer is not mounted');
        }
        return observer.finishCapture(performance.now());
      },
      getViewportCanvas() {
        return get().gl.domElement;
      },
      isGeometryFramed() {
        const { size } = get();
        const cameraSnapshot = cameraRig.actorRef.getSnapshot();
        return (
          isGeometryFramed &&
          cameraConnectorRef.current !== undefined &&
          cameraSnapshot.status === 'active' &&
          cameraSnapshot.context.view.viewport.width === size.width &&
          cameraSnapshot.context.view.viewport.height === size.height
        );
      },
      setSectionCuts(cuts) {
        for (const { id } of graphicsActor.getSnapshot().context.sectionCuts) {
          graphicsActor.send({ type: 'removeSectionCut', payload: id });
        }
        const ids = cuts.flatMap((cut) => addSectionCut(cut) ?? []);
        graphicsActor.send({ type: 'selectSectionCut', payload: undefined });
        return ids;
      },
      addSectionCut,
      updateSectionCut(id, patch) {
        graphicsActor.send({ type: 'updateSectionCut', payload: { id, patch } });
      },
      removeSectionCut(id) {
        graphicsActor.send({ type: 'removeSectionCut', payload: id });
      },
      selectSectionCut(id) {
        graphicsActor.send({ type: 'selectSectionCut', payload: id });
      },
      setSectionViewActive(active) {
        graphicsActor.send({ type: 'setSectionViewActive', payload: active });
      },
      getSectionState() {
        const { context } = graphicsActor.getSnapshot();
        return {
          isActive: context.isSectionViewActive,
          cuts: context.sectionCuts,
          selectedCutId: context.selectedSectionCutId,
          hoveredCutId: context.hoveredSectionCutId,
          committedCuts: context.committedSectionCuts,
          committedPieces: resolveSectionPieces(context.committedSectionCuts),
          certification: context.sectionCertification,
          isCommitted: areSectionCutsEqual(context.committedSectionCuts, context.sectionCuts),
        };
      },
      projectSectionHandle(kind, cutId) {
        const { camera, gl } = get();
        return projectSectionViewTestHandle({
          target: { kind, cutId },
          camera,
          rect: gl.domElement.getBoundingClientRect(),
          scene,
        });
      },
      setPresentation(presentation) {
        graphicsActor.send({ type: 'setSurfaceVisibility', payload: presentation.surfaces });
        graphicsActor.send({ type: 'setLinesVisibility', payload: presentation.lines });
      },
      setPostProcessingEnabled(enabled) {
        graphicsActor.send({ type: 'setPostProcessingVisibility', payload: enabled });
      },
      setGridPresentationClipPolicy(policy) {
        const { upDirection } = graphicsActor.getSnapshot().context;
        cameraRig.setClipPlanes(
          policy.far || policy.near
            ? {
                farPaddingVerticalSpans: policy.far ? infiniteGridFadeEndVisibleSpans : 0,
                ...(policy.near ? { presentationPlane: infiniteGridPresentationPlaneByUpDirection[upDirection] } : {}),
              }
            : undefined,
        );
      },
      getModelComponents() {
        const { context } = modelInteractionRef.getSnapshot();
        const activeUnitId = getActiveUnitId();
        const unit = activeUnitId ? getModelInteractionUnitState(context, activeUnitId) : undefined;
        return (unit?.manifest?.nodeOrder ?? [])
          .filter((id) => id !== unit?.manifest?.rootId)
          .map((id) => ({ id, name: unit?.manifest?.nodesById[id]?.name ?? id }));
      },
      getModelVisibility() {
        const { context } = modelInteractionRef.getSnapshot();
        const activeUnitId = getActiveUnitId();
        const unit = activeUnitId ? getModelInteractionUnitState(context, activeUnitId) : undefined;
        return {
          hiddenComponentIds: [...(unit?.hiddenComponentIds ?? [])],
          isolatedComponentIds: [...(unit?.isolatedComponentIds ?? [])],
        };
      },
      getRenderedModelComponentState(componentId) {
        return getRenderedModelComponentState(scene, componentId);
      },
      projectModelComponent(componentId) {
        const { camera, gl } = get();
        const rect = gl.domElement.getBoundingClientRect();
        const points: SectionViewTestProjectedPoint[] = [];
        scene.updateMatrixWorld(true);
        scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh) || getModelComponentIdInHierarchy(object) !== componentId) {
            return;
          }

          const geometry = object.geometry as THREE.BufferGeometry;
          const position = geometry.getAttribute('position');
          const { index } = geometry;
          const triangleCount = Math.floor((index?.count ?? position.count) / 3);
          const sampleStep = Math.max(1, Math.floor(triangleCount / 24));
          for (let triangle = 0; triangle < triangleCount && points.length < 24; triangle += sampleStep) {
            const vertices = [0, 1, 2].map((offset) =>
              new THREE.Vector3()
                .fromBufferAttribute(position, index?.getX(triangle * 3 + offset) ?? triangle * 3 + offset)
                .applyMatrix4(object.matrixWorld),
            );
            const projected = vertices[0]!
              .add(vertices[1]!)
              .add(vertices[2]!)
              .multiplyScalar(1 / 3)
              .project(camera);
            points.push(toProjectedPoint(projected, rect));
          }
        });
        return points;
      },
      hideModelComponent(componentId) {
        const activeUnitId = getActiveUnitId();
        if (activeUnitId) {
          graphicsActor.send({ type: 'hideModelComponent', unitId: activeUnitId, componentId, source: 'screenshot' });
        }
      },
      isolateModelComponent(componentId) {
        const activeUnitId = getActiveUnitId();
        if (activeUnitId) {
          graphicsActor.send({
            type: 'isolateModelComponent',
            unitId: activeUnitId,
            componentId,
            source: 'screenshot',
          });
        }
      },
      resetModelVisibility() {
        const activeUnitId = getActiveUnitId();
        if (activeUnitId) {
          graphicsActor.send({ type: 'showHiddenModelComponents', unitId: activeUnitId, source: 'screenshot' });
          graphicsActor.send({ type: 'clearModelComponentIsolation', unitId: activeUnitId, source: 'screenshot' });
        }
      },
      setCamera(nextCamera) {
        const currentView = cameraRig.actorRef.getSnapshot().context.view;
        const target = new THREE.Vector3(...(nextCamera.target ?? [0, 0, 0]));
        const position = new THREE.Vector3(...nextCamera.position);
        const offset = position.sub(target);
        const distance = offset.length();
        if (distance <= 0) {
          throw new RangeError('Section view test camera position must differ from its target.');
        }
        const direction = offset.normalize();
        const up = resolveCameraUp({
          direction,
          preferredUp: new THREE.Vector3(...currentView.up),
        }).applyAxisAngle(direction, nextCamera.rollRadians ?? 0);
        const requestedFov = nextCamera.fov ?? currentView.requestedVerticalFieldOfView;
        const verticalSpan =
          requestedFov > 0
            ? perspectiveVerticalSpan({
                distance,
                verticalFieldOfView: requestedFov,
                zoom: nextCamera.zoom ?? 1,
              })
            : currentView.verticalSpan / (nextCamera.zoom ?? 1);
        cameraRig.actorRef.send({
          type: 'setView',
          target: [target.x, target.y, target.z],
          direction: [direction.x, direction.y, direction.z],
          up: [up.x, up.y, up.z],
          verticalSpan,
          ...(requestedFov > 0 ? { perspectiveZoom: nextCamera.zoom ?? 1 } : {}),
        });
        if (nextCamera.fov !== undefined) {
          setFovAngle(nextCamera.fov);
        }
      },
      setFovAngle(angle) {
        setFovAngle(angle);
      },
      getCamera() {
        const { camera, controls } = get();
        const actorSnapshot = cameraRig.actorRef.getSnapshot();
        const cameraContext = actorSnapshot.context;
        const cameraView = cameraContext.view;
        const physicalCamera = cameraRig.readState();
        const controlState = getSectionViewTestControlState({ controls, interactionLock });
        const state: SectionViewTestCameraState = {
          actorStatus: actorSnapshot.status,
          actorError:
            actorSnapshot.error instanceof Error
              ? `${actorSnapshot.error.name}: ${actorSnapshot.error.message}`
              : undefined,
          projection: camera instanceof THREE.OrthographicCamera ? 'orthographic' : 'perspective',
          requestedFov: cameraView.requestedVerticalFieldOfView,
          requestedPerspectiveZoom: cameraView.perspectiveZoom,
          bounds: cameraView.bounds,
          handoffFov: cameraContext.handoffVerticalFieldOfView,
          verticalSpan: cameraView.verticalSpan,
          position: physicalCamera.position,
          quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
          target: physicalCamera.target,
          controlsDistance:
            getControlsDistance({ camera, controls: controls ?? undefined }) *
            cameraRig.renderFrame.metersPerRenderUnit,
          fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : undefined,
          zoom:
            camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera
              ? camera.zoom
              : undefined,
          aspect:
            camera instanceof THREE.PerspectiveCamera
              ? camera.aspect
              : camera instanceof THREE.OrthographicCamera
                ? (camera.right - camera.left) / (camera.top - camera.bottom)
                : 1,
          clipping: physicalCamera.clipping,
          nativeClipping: { near: camera.near, far: camera.far },
          ...controlState,
        };

        return state;
      },
      getCameraTransitionDiagnostics() {
        return cameraTransitionDiagnosticsRef.current;
      },
      resetCameraTransitionDiagnostics() {
        pendingCameraTransitionRef.current = undefined;
        cameraTransitionDiagnosticsRef.current = {
          requests: 0,
          frames: 0,
          actorSyncFailures: 0,
          averageRequestToActorSyncMilliseconds: 0,
          maximumRequestToActorSyncMilliseconds: 0,
          maximumRequestToFrameMilliseconds: 0,
          staleFrames: 0,
        };
      },
      getRenderFrame() {
        return cameraRig.renderFrame;
      },
      setRenderFrame(nextRenderFrame) {
        setRenderFrame(nextRenderFrame);
      },
      projectWorldPoint(point) {
        const { camera, gl } = get();
        const rect = gl.domElement.getBoundingClientRect();
        const projected = toThreeRenderPoint({ renderFrame: cameraRig.renderFrame, pointMeters: point }).project(
          camera,
        );

        return toProjectedPoint(projected, rect);
      },
      getModelHoverState() {
        const { context } = modelInteractionRef.getSnapshot();
        const activeUnitId = getActiveUnitId();
        const hoveredComponentId = activeUnitId
          ? getModelInteractionUnitState(context, activeUnitId).hoveredComponentId
          : undefined;

        return { activeUnitId, hoveredComponentId };
      },
      setMeasureActive(active) {
        graphicsActor.send({ type: 'setMeasureActive', payload: active });
      },
      getMeasureState() {
        const { context } = graphicsActor.getSnapshot();
        return {
          isMeasureActive: context.isMeasureActive,
          cameraInteracting: context.cameraInteracting,
          measurementUiMeshCount: getSectionViewTestMeasurementUiMeshCount(scene),
          rendererGeometryCount: get().gl.info.memory.geometries,
          snapDistancePx: context.measureSnapDistance,
          candidates: context.measureCandidates,
          activeCandidateId: context.measureActiveCandidateId,
          lockedTargetId: context.measureLockedTargetId,
          mode: context.measureMode,
          currentStart: context.currentMeasurementStart,
          measurements: context.measurements.map(
            ({ id, distance, startPoint, endPoint, operation, quality, status, unavailableReason }) => ({
              id,
              distance,
              startPoint,
              endPoint,
              operation,
              quality,
              status,
              unavailableReason,
            }),
          ),
        };
      },
      getSectionHelperSummary() {
        return getSectionViewTestHelperSummary(scene);
      },
      getSectionCapCompleteness() {
        let completeness: SectionViewTestCapCompleteness | undefined;
        scene.traverse((child) => {
          completeness =
            (child.userData['sectionCapCompleteness'] as SectionViewTestCapCompleteness | undefined) ?? completeness;
        });
        return completeness;
      },
      getSectionCapOverlapDiagnostics() {
        return getSectionViewTestCapOverlapDiagnostics(scene);
      },
      getSectionCapPerformanceDiagnostics() {
        return getSectionViewTestCapPerformanceDiagnostics(scene);
      },
    };

    const bridges = bridgeGlobal.__TAU_SECTION_VIEW_TEST_BRIDGES__ ?? [];
    bridges.push(bridge);
    bridgeGlobal.__TAU_SECTION_VIEW_TEST_BRIDGES__ = bridges;
    bridgeGlobal.__TAU_SECTION_VIEW_TEST__ = bridge;

    return () => {
      const index = bridges.indexOf(bridge);
      if (index !== -1) {
        bridges.splice(index, 1);
      }
      if (bridgeGlobal.__TAU_SECTION_VIEW_TEST__ === bridge) {
        bridgeGlobal.__TAU_SECTION_VIEW_TEST__ = bridges.at(-1);
      }
      if (bridges.length === 0) {
        delete bridgeGlobal.__TAU_SECTION_VIEW_TEST__;
        delete bridgeGlobal.__TAU_SECTION_VIEW_TEST_BRIDGES__;
      }
    };
  }, [
    cameraConnectorRef,
    cameraRig,
    get,
    graphicsActor,
    interactionLock,
    isGeometryFramed,
    isTauDebugEnabled,
    modelInteractionRef,
    project,
    setRenderFrame,
  ]);

  return undefined;
}
