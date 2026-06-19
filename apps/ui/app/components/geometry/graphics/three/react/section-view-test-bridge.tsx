import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useFeature } from '#flags/use-feature.js';
import { useGraphics, useModelInteractionRef } from '#hooks/use-graphics.js';
import { getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import {
  getControlsDistance,
  resolveControlsTarget,
  syncControlsLookAt,
} from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';
import { hasSceneTag, sceneTag } from '#components/geometry/graphics/three/utils/scene-tags.js';
import { sectionCapOverlapDebugUserDataKey } from '#components/geometry/graphics/three/utils/section-cap-overlap-debug.js';
import type { SectionCapOverlapDebugSummary } from '#components/geometry/graphics/three/utils/section-cap-overlap-debug.js';
import { sectionCapPerformanceDebugUserDataKey } from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';
import type { SectionCapPerformanceDebugSummary } from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';
import { useViewportGizmoInteractionLock } from '#components/geometry/graphics/three/controls/viewport-gizmo-interaction-lock.js';
import type { ViewportGizmoInteractionLock } from '#components/geometry/graphics/three/controls/viewport-gizmo-interaction-lock.js';

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
}>;

export type SectionViewTestCameraState = Readonly<{
  position: readonly [number, number, number];
  quaternion: readonly [number, number, number, number];
  target: readonly [number, number, number];
  fov?: number;
  zoom?: number;
  controlsDistance: number;
  controlsEnabled: boolean;
  viewportGizmoLockActive: boolean;
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

export type SectionViewTestBridgeApi = Readonly<{
  showPlaneSelectors(): void;
  setSectionView(state: SectionViewTestState): void;
  setCamera(camera: SectionViewTestCamera): void;
  setFovAngle(angle: number): void;
  getCamera(): SectionViewTestCameraState;
  projectWorldPoint(point: readonly [number, number, number]): SectionViewTestProjectedPoint;
  getModelHoverState(): SectionViewTestModelHoverState;
  getSelectorLabels(): string[];
  getSectionHelperSummary(): SectionViewTestHelperSummary;
  getSectionCapOverlapDiagnostics(): SectionCapOverlapDebugSummary | undefined;
  getSectionCapPerformanceDiagnostics(): SectionCapPerformanceDebugSummary | undefined;
}>;

type SectionViewTestGlobal = typeof globalThis & {
  __TAU_SECTION_VIEW_TEST__?: SectionViewTestBridgeApi;
};

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

  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    const label = (child.geometry.userData as Record<string, unknown>)['selectorLabel'];
    if (typeof label === 'string') {
      labels.add(label);
    }
  });

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

  scene.traverse((child) => {
    if (!hasSceneTag(child, sceneTag.sectionViewHelper)) {
      return;
    }

    if (child instanceof THREE.Mesh) {
      sectionHelperMeshCount++;
      meshRenderOrders.push(child.renderOrder);
    }

    if (child.type === 'LineSegments2') {
      sectionHelperLineSegments2Count++;
      sectionHelperContourSegmentCount += getLineSegments2SegmentCount(child);
      lineSegments2RenderOrders.push(child.renderOrder);
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
  });

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

export function SectionViewTestBridge(): React.ReactNode {
  const isTauDebugEnabled = useFeature('tauDebug');
  const graphicsActor = useGraphics();
  const modelInteractionRef = useModelInteractionRef();
  const { camera, controls, gl, invalidate, scene } = useThree();
  const interactionLock = useViewportGizmoInteractionLock();

  useEffect(() => {
    if (!isTauDebugEnabled) {
      return undefined;
    }

    const bridgeGlobal = globalThis as SectionViewTestGlobal;
    const bridge: SectionViewTestBridgeApi = {
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
      setCamera(nextCamera) {
        const target = new THREE.Vector3(...(nextCamera.target ?? [0, 0, 0]));
        camera.position.set(...nextCamera.position);
        camera.lookAt(target);

        if (camera instanceof THREE.PerspectiveCamera) {
          if (nextCamera.fov !== undefined) {
            camera.fov = nextCamera.fov;
          }

          if (nextCamera.zoom !== undefined) {
            camera.zoom = nextCamera.zoom;
          }

          camera.updateProjectionMatrix();
        }

        syncControlsLookAt({ camera, controls: controls ?? undefined, target, transition: false });
        invalidate();
      },
      setFovAngle(angle) {
        graphicsActor.send({ type: 'setFovAngle', payload: angle });
      },
      getCamera() {
        const target = resolveControlsTarget({ camera, controls: controls ?? undefined });
        const controlState = getSectionViewTestControlState({ controls, interactionLock });
        const state: SectionViewTestCameraState = {
          position: [camera.position.x, camera.position.y, camera.position.z],
          quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
          target: [target.x, target.y, target.z],
          controlsDistance: getControlsDistance({ camera, controls: controls ?? undefined }),
          fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : undefined,
          zoom: camera instanceof THREE.PerspectiveCamera ? camera.zoom : undefined,
          ...controlState,
        };

        return state;
      },
      projectWorldPoint(point) {
        const rect = gl.domElement.getBoundingClientRect();
        const projected = new THREE.Vector3(...point).project(camera);

        return {
          x: rect.left + ((projected.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - projected.y) / 2) * rect.height,
          visible: projected.z >= -1 && projected.z <= 1,
        };
      },
      getModelHoverState() {
        const { context } = modelInteractionRef.getSnapshot();
        const { activeUnitId } = context;
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
      getSectionCapOverlapDiagnostics() {
        return getSectionViewTestCapOverlapDiagnostics(scene);
      },
      getSectionCapPerformanceDiagnostics() {
        return getSectionViewTestCapPerformanceDiagnostics(scene);
      },
    };

    bridgeGlobal.__TAU_SECTION_VIEW_TEST__ = bridge;

    return () => {
      if (bridgeGlobal.__TAU_SECTION_VIEW_TEST__ === bridge) {
        delete bridgeGlobal.__TAU_SECTION_VIEW_TEST__;
      }
    };
  }, [
    camera,
    controls,
    gl.domElement,
    graphicsActor,
    interactionLock,
    invalidate,
    isTauDebugEnabled,
    modelInteractionRef,
    scene,
  ]);

  return undefined;
}
