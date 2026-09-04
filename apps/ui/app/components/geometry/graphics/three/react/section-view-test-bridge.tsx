import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { perspectiveVerticalSpan } from '@taucad/camera';
import type { RenderFrame } from '@taucad/spatial';
import { toThreeRenderPoint } from '@taucad/three/spatial';
import { useFeature } from '#flags/use-feature.js';
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

type SectionPlaneId = 'xy' | 'xz' | 'yz';

export type SectionViewTestState = Readonly<{
  plane: SectionPlaneId;
  direction?: 1 | -1;
  rotationRadians?: readonly [number, number, number];
  pivot?: readonly [number, number, number];
  translation?: number;
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

export type SectionViewTestPresentationState = Readonly<{
  isSectionViewActive: boolean;
  selectedSectionViewId: string | undefined;
  sectionViewDirection: 1 | -1;
  sectionViewPivot: readonly [number, number, number];
  sectionViewRotation: readonly [number, number, number];
  enableClippingLines: boolean;
  enableClippingMesh: boolean;
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

export type SectionViewTestBridgeApi = Readonly<{
  getGraphicsBackend(): 'webgl' | 'webgpu';
  isGeometryFramed(): boolean;
  showPlaneSelectors(): void;
  setSectionView(state: SectionViewTestState): void;
  clearSectionView(): void;
  setPresentation(presentation: Readonly<{ surfaces: boolean; lines: boolean }>): void;
  getPresentation(): SectionViewTestPresentationState;
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
  projectSectionTransformHandle(axis: 'X' | 'Y' | 'Z'): SectionViewTestProjectedPoint | undefined;
  getModelHoverState(): SectionViewTestModelHoverState;
  getSelectorLabels(): string[];
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

export const getSectionViewTestSelectorLabels = (scene: THREE.Object3D): string[] => {
  const labels = new Set<string>();

  for (const root of getSceneRenderRoots(scene as THREE.Scene)) {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      const label = (child.geometry.userData as Record<string, unknown>)['selectorLabel'];
      if (typeof label === 'string') {
        labels.add(label);
      }
    });
  }

  return [...labels];
};

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

export const projectSectionViewTestTransformHandle = ({
  axis,
  camera,
  rect,
  scene,
}: {
  readonly axis: 'X' | 'Y' | 'Z';
  readonly camera: THREE.Camera;
  readonly rect: Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>;
  readonly scene: THREE.Object3D;
}): SectionViewTestProjectedPoint | undefined => {
  let result: SectionViewTestProjectedPoint | undefined;
  const projectTransformHandle = (child: THREE.Object3D): void => {
    if (
      result !== undefined ||
      !(child instanceof THREE.Mesh) ||
      child.name !== axis ||
      !hasSceneTag(child, sceneTag.sectionViewHelper) ||
      !isActuallyVisible(child)
    ) {
      return;
    }

    const bounds = new THREE.Box3().setFromObject(child);
    if (bounds.isEmpty()) {
      return;
    }
    const projected = bounds.getCenter(new THREE.Vector3()).project(camera);
    result = {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - projected.y) / 2) * rect.height,
      visible:
        projected.x >= -1 &&
        projected.x <= 1 &&
        projected.y >= -1 &&
        projected.y <= 1 &&
        projected.z >= -1 &&
        projected.z <= 1,
    };
  };
  for (const root of getSceneRenderRoots(scene as THREE.Scene)) {
    root.updateMatrixWorld(true);
    root.traverse(projectTransformHandle);
  }
  return result;
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
    const bridge: SectionViewTestBridgeApi = {
      getGraphicsBackend() {
        const renderer = get().gl as unknown as { readonly backend?: { readonly isWebGPUBackend?: boolean } };
        return renderer.backend?.isWebGPUBackend === true ? 'webgpu' : 'webgl';
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
      showPlaneSelectors() {
        graphicsActor.send({ type: 'setSectionViewActive', payload: true });
        graphicsActor.send({ type: 'selectSectionView', payload: undefined });
      },
      setSectionView(state) {
        graphicsActor.send({ type: 'setSectionViewActive', payload: true });
        graphicsActor.send({ type: 'selectSectionView', payload: state.plane });
        graphicsActor.send({ type: 'setSectionViewDirection', payload: state.direction ?? 1 });
        if (state.rotationRadians) {
          graphicsActor.send({ type: 'setSectionViewRotation', payload: [...state.rotationRadians] });
        }

        if (state.pivot) {
          graphicsActor.send({ type: 'setSectionViewPivot', payload: [...state.pivot] });
        }

        if (state.translation !== undefined) {
          graphicsActor.send({ type: 'setSectionViewTranslation', payload: state.translation });
        }
      },
      clearSectionView() {
        graphicsActor.send({ type: 'setSectionViewActive', payload: false });
      },
      setPresentation(presentation) {
        graphicsActor.send({ type: 'setSurfaceVisibility', payload: presentation.surfaces });
        graphicsActor.send({ type: 'setLinesVisibility', payload: presentation.lines });
      },
      getPresentation() {
        const { context } = graphicsActor.getSnapshot();
        return {
          isSectionViewActive: context.isSectionViewActive,
          selectedSectionViewId: context.selectedSectionViewId,
          sectionViewDirection: context.sectionViewDirection,
          sectionViewPivot: [...context.sectionViewPivot],
          sectionViewRotation: [...context.sectionViewRotation],
          enableClippingLines: context.enableClippingLines,
          enableClippingMesh: context.enableClippingMesh,
        };
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
            points.push({
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

        return {
          x: rect.left + ((projected.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - projected.y) / 2) * rect.height,
          visible:
            projected.x >= -1 &&
            projected.x <= 1 &&
            projected.y >= -1 &&
            projected.y <= 1 &&
            projected.z >= -1 &&
            projected.z <= 1,
        };
      },
      projectSectionTransformHandle(axis) {
        const { camera, gl } = get();
        return projectSectionViewTestTransformHandle({
          axis,
          camera,
          rect: gl.domElement.getBoundingClientRect(),
          scene,
        });
      },
      getModelHoverState() {
        const { context } = modelInteractionRef.getSnapshot();
        const activeUnitId = getActiveUnitId();
        const hoveredComponentId = activeUnitId
          ? getModelInteractionUnitState(context, activeUnitId).hoveredComponentId
          : undefined;

        return { activeUnitId, hoveredComponentId };
      },
      getSelectorLabels() {
        return getSectionViewTestSelectorLabels(scene);
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
    setRenderFrame,
  ]);

  return undefined;
}
