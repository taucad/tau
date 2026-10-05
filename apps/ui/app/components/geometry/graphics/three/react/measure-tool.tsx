/* oxlint-disable complexity -- Label/line sizing and camera-facing math in a single component */
import { useEffect, useRef, useState, useMemo, useCallback, useReducer, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { EventManager } from '@react-three/fiber';
import { createActor } from 'xstate';
import { fromThreeRenderPoint, toThreeRenderPoint } from '@taucad/three/spatial';
import {
  LabelTextGeometry as createLabelTextGeometry,
  LabelBackgroundGeometry as createLabelBackgroundGeometry,
} from '#components/geometry/graphics/three/geometries/label-geometry.js';
import {
  findMeasurementTargets,
  getCachedMeshMeasurementFeatures,
  getLineMeasurementFeatures,
  listMeasurementTargets,
  measureFeature,
  getMeasurementTargetWorldMatrix,
  measureTargetPair,
} from '#components/geometry/graphics/three/utils/measurement-features.js';
import type {
  MeasurementTarget,
  MeshFeature,
  MeshFeatureGraph,
} from '#components/geometry/graphics/three/utils/measurement-features.js';
import { createMeasurementFeatureWorkerClient } from '#components/geometry/graphics/three/utils/measurement-features-worker-client.js';
import type { MeasurementFeatureWorkerClient } from '#components/geometry/graphics/three/utils/measurement-features-worker-client.js';
import type { MeasurementAnchor, MeasurementRecord } from '#constants/measurement.types.js';
import { computeAxisRotationForCamera } from '#components/geometry/graphics/three/utils/rotation.utils.js';
import {
  matcapMaterial,
  subscribeToMatcapLoad,
} from '#components/geometry/graphics/three/materials/matcap-material.js';
import {
  sceneTag,
  sceneTagData,
  hasSceneTagInHierarchy,
} from '#components/geometry/graphics/three/utils/scene-tags.js';
import type { SceneTagKey } from '#components/geometry/graphics/three/utils/scene-tags.js';
import { getGltfOccurrenceLayers } from '#components/geometry/graphics/three/utils/gltf-surface-batches.js';
import {
  useGraphics,
  useGraphicsSelector,
  useKinematicsRef,
  useModelInteractionSelector,
  useRenderFrame,
} from '#hooks/use-graphics.js';
import { createRafCoalescer } from '#components/geometry/graphics/three/utils/raf-coalescer.js';
import type { RafCoalescer } from '#components/geometry/graphics/three/utils/raf-coalescer.js';
import { setRaycasterFromCamera } from '#components/geometry/graphics/three/utils/raycaster-from-camera.js';
import {
  createRaycastClipTest,
  raycastFirstVisibleMeshHit,
} from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import { resolveSectionViewRaycastClip } from '#components/geometry/graphics/three/use-section-view.js';
import { measureInputMachine } from '#machines/measure-input.machine.js';
import { selectPresentedGeometryKey } from '#machines/graphics.machine.js';
import type { GraphicsContext } from '#machines/graphics.machine.js';
import { getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import { getKinematicsUnitState } from '#machines/kinematics.machine.js';
import { useCad } from '#hooks/use-cad.js';
import { useFeature } from '#flags/use-feature.js';
import { measureExactOccurrenceDistance } from '#workers/measurement-exact.client.js';
import { getGltfAssemblySource } from '#components/geometry/graphics/three/use-geometry-bounds.js';
import { captureGltfAssemblyPlacements } from '#components/geometry/graphics/three/react/kinematics-pose-composer.js';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import {
  getModelComponentHitOwner,
  getModelComponentInstanceSlots,
  getModelComponentInstanceSlot,
  getModelComponentWorldMatrix,
} from '#components/geometry/graphics/three/utils/model-component-owner.js';

const measurementPickBlockingSceneTags = new Set<SceneTagKey>([
  sceneTag.measurementUi,
  sceneTag.sectionViewHelper,
  sceneTag.gltfSurfacePresentation,
]);
/** Read feature evidence from the immutable definition primitive for a live draw slot. */
function measurementSourceMesh(mesh: THREE.Object3D, instanceId: number | undefined): THREE.Mesh | undefined {
  const source =
    mesh instanceof THREE.InstancedMesh ? getModelComponentInstanceSlot(mesh, instanceId)?.sourceObject : mesh;
  return source instanceof THREE.Mesh ? source : undefined;
}

/** Private mounted-owner getter; reading it never prepares geometry or changes a camera. */
export const measurementCatalogGetterKey = 'measurementCatalogObservation';

type MeasurementCatalogOwner = Readonly<{
  sourceCurrent: boolean;
  geometryKey: string | undefined;
  version: number;
  cameraMatrixWorld: readonly number[];
  cameraProjectionMatrix: readonly number[];
  candidateSource?: Readonly<{
    cameraRevision: number;
    isMeasureActive: boolean;
    measureFilter: GraphicsContext['measureFilter'];
    measureMode: GraphicsContext['measureMode'];
    modelDisplayRevision: number;
    pickableMeshesVersion: number;
    poseRevision: number;
  }>;
}>;

export type MeasurementCatalogObservation = Readonly<{
  requestId: number;
  captured: MeasurementCatalogOwner;
  observed: MeasurementCatalogOwner;
  prepareResult?: 'pending' | 'ready' | 'undefined' | 'error';
  terminalBranch?:
    | 'published'
    | 'prepare-undefined'
    | 'prepare-error'
    | 'camera-changed'
    | 'source-changed'
    | 'version-changed'
    | 'effect-cleanup'
    | 'missing-canonical-source';
  sourceResolved?: boolean;
  worldMatrixAvailable?: boolean;
  graphFeatureCount?: number;
  graphBodyCount?: number;
  catalogSize: number;
}>;

/** Read the current debug owner's copied record, without acquiring feature evidence. */
export function readMeasurementCatalogObservation(scene: THREE.Object3D): MeasurementCatalogObservation | undefined {
  const read = scene.userData[measurementCatalogGetterKey] as
    | (() => MeasurementCatalogObservation | undefined)
    | undefined;
  return read?.();
}

const featureOrdinals = new WeakMap<MeshFeatureGraph, Map<string, number>>();

/** Exact native whole-part queries require one live canonical surface primitive and one complete mesh body. */
export function isWholePrimitiveMeasurementTarget({
  scene,
  componentId,
  target,
  mesh,
}: {
  scene: THREE.Object3D;
  componentId: string | undefined;
  target: MeasurementTarget | undefined;
  mesh: THREE.Object3D;
}): boolean {
  if (!componentId || !target) {
    return false;
  }
  let count = 0;
  scene.traverse((object) => {
    const slots = getModelComponentInstanceSlots(object);
    if (object instanceof THREE.InstancedMesh) {
      for (const slot of slots ?? []) {
        const metadata = slot.measurementFeatures as { kind?: string } | undefined;
        if (metadata?.kind === 'surface' && slot.owner.componentId === componentId) {
          count += 1;
        }
      }
      return;
    }
    const metadata = object.userData['measurementFeatures'] as { componentId?: string; kind?: string } | undefined;
    if (metadata?.kind === 'surface' && metadata.componentId === componentId) {
      count += 1;
    }
  });
  if (!getMeasurementTargetWorldMatrix(target, new THREE.Matrix4())) {
    return false;
  }
  const sourceMesh = measurementSourceMesh(mesh, target.instanceId);
  const graph = sourceMesh ? getCachedMeshMeasurementFeatures(sourceMesh) : undefined;
  return count === 1 && graph?.features.filter((feature) => feature.kind === 'body').length === 1;
}

/** Human-facing target names use build-local feature order while opaque IDs remain the selection values. */
export function describeMeasurementTarget(
  target: MeasurementTarget,
  mesh: THREE.Object3D & { geometry: THREE.BufferGeometry },
  manifest?: { nodesById: Record<string, { name?: string }> },
): string {
  const metadata = mesh.userData['measurementFeatures'] as { componentId?: string; kind?: string } | undefined;
  const componentId =
    mesh instanceof THREE.InstancedMesh
      ? getModelComponentHitOwner({ object: mesh, instanceId: target.instanceId })?.componentId
      : metadata?.componentId;
  const owner = [componentId ? manifest?.nodesById[componentId]?.name : undefined, mesh.name].find(Boolean) ?? 'Model';
  const sourceMesh = measurementSourceMesh(mesh, target.instanceId);
  const graph =
    metadata?.kind === 'line'
      ? getLineMeasurementFeatures(mesh)
      : sourceMesh && getCachedMeshMeasurementFeatures(sourceMesh);
  const endpoint =
    target.kind === 'endpoint'
      ? target.id.endsWith(':start')
        ? ' · start'
        : target.id.endsWith(':end')
          ? ' · end'
          : ''
      : '';
  if (!graph) {
    return `${owner}: ${target.label} 1${endpoint}`;
  }
  let ordinals = featureOrdinals.get(graph);
  if (!ordinals) {
    ordinals = new Map<string, number>();
    const counts = new Map<MeshFeature['kind'], number>();
    for (const feature of graph.features) {
      const ordinal = (counts.get(feature.kind) ?? 0) + 1;
      counts.set(feature.kind, ordinal);
      ordinals.set(feature.id, ordinal);
    }
    featureOrdinals.set(graph, ordinals);
  }
  const ordinal = ordinals.get(target.featureId) ?? 1;
  return `${owner}: ${target.label} ${ordinal}${endpoint}`;
}

function isSupportVisible(hit: THREE.Intersection | undefined, ray: THREE.Ray, support: THREE.Vector3): boolean {
  if (!hit) {
    return true;
  }
  const distance = ray.origin.distanceTo(support);
  const tolerance = 1e-9 * Math.max(1, distance, ray.origin.length(), support.length());
  return hit.distance + tolerance >= distance;
}

function featureSupports({
  feature,
  world,
  object,
  instanceId,
}: {
  feature: MeshFeature;
  world: THREE.Vector3;
  object: THREE.Object3D & { geometry: THREE.BufferGeometry };
  instanceId?: number;
}): THREE.Vector3[] {
  const worldMatrix = getModelComponentWorldMatrix(object, instanceId, new THREE.Matrix4());
  if (!worldMatrix) {
    return [];
  }
  if (feature.kind === 'body' || feature.kind === 'circle') {
    const stride = Math.max(1, Math.floor(feature.points.length / 16));
    const supports: THREE.Vector3[] = [];
    for (let index = 0; index < feature.points.length && supports.length < 16; index += stride) {
      supports.push(feature.points[index]!.clone().applyMatrix4(worldMatrix));
    }
    return supports;
  }
  if (feature.kind === 'face' && !feature.centroidOnSurface) {
    const firstTriangle = feature.triangleIndices[0];
    const position = object.geometry.getAttribute('position');
    const index = object.geometry.getIndex()?.getX((firstTriangle ?? 0) * 3) ?? (firstTriangle ?? 0) * 3;
    return [new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(worldMatrix)];
  }
  return [world];
}

function calculateScaleFromCamera(position: THREE.Vector3, camera: THREE.Camera): number {
  const distanceToCamera = camera.position.distanceTo(position);

  let factor: number;

  // Handle orthographic camera
  if ('isOrthographicCamera' in camera && camera.isOrthographicCamera) {
    const orthoCamera = camera as THREE.OrthographicCamera;
    factor = (orthoCamera.top - orthoCamera.bottom) / orthoCamera.zoom;
  } else {
    // Handle perspective camera with FOV consideration
    const perspCamera = camera as THREE.PerspectiveCamera;
    factor = distanceToCamera * Math.min((1.9 * Math.tan((Math.PI * perspCamera.fov) / 360)) / perspCamera.zoom, 7);
  }

  const size = 1; // Base size
  return (factor * size) / 4000;
}

// ── Module-scope scratch objects for useFrame callbacks (avoids per-frame GC pressure) ──

// SnapPointIndicator scratch
const _snapDirection = new THREE.Vector3();
const _snapQuaternion = new THREE.Quaternion();
const _snapUp = new THREE.Vector3(0, 1, 0);
const _snapForward = new THREE.Vector3(0, 0, 1);

// MeasurementLine scratch
const _baseQuat = new THREE.Quaternion();
const _currentNormal = new THREE.Vector3();
const _axisRotation = new THREE.Quaternion();
const _finalQuat = new THREE.Quaternion();
const _flipQuat = new THREE.Quaternion();
const _labelNormal = new THREE.Vector3();
const _labelUp = new THREE.Vector3();
const _cameraUp = new THREE.Vector3();
const _cameraUpProjected = new THREE.Vector3();
// oxlint-disable-next-line unicorn-js/prevent-abbreviations -- dir refers to direction vector, not directory
const _lineDir = new THREE.Vector3();
const _coneOffset = new THREE.Vector3();

function raycastVisibleLabel(this: THREE.Mesh, raycaster: THREE.Raycaster, intersections: THREE.Intersection[]): void {
  if (!this.visible) {
    return;
  }
  const { parent } = this;
  for (let ancestor = parent; ancestor; ancestor = ancestor.parent) {
    if (!ancestor.visible) {
      return;
    }
  }
  THREE.Mesh.prototype.raycast.call(this, raycaster, intersections);
}

type MeasureHoverState = {
  hoveredSnapPoints: MeasurementTarget[];
  activeSnapPoint?: MeasurementTarget;
  mousePosition?: THREE.Vector3;
};

type MeasureHoverAction =
  | {
      type: 'set';
      hoveredSnapPoints: MeasurementTarget[];
      activeSnapPoint?: MeasurementTarget;
      mousePosition?: THREE.Vector3;
    }
  | { type: 'clear' };

const measureHoverReducer = (_state: MeasureHoverState, action: MeasureHoverAction): MeasureHoverState => {
  if (action.type === 'clear') {
    return {
      hoveredSnapPoints: [],
      activeSnapPoint: undefined,
      mousePosition: undefined,
    };
  }

  return {
    hoveredSnapPoints: action.hoveredSnapPoints,
    activeSnapPoint: action.activeSnapPoint,
    mousePosition: action.mousePosition,
  };
};

const noMeasureHover: MeasureHoverState = { hoveredSnapPoints: [] };

/** Whether two hovers draw the same marks: the same snaps, the same active snap and the same pointer point. */
const isSameMeasureHover = (a: MeasureHoverState, b: MeasureHoverState): boolean =>
  a.activeSnapPoint === b.activeSnapPoint &&
  a.hoveredSnapPoints.length === b.hoveredSnapPoints.length &&
  a.hoveredSnapPoints.every((snapPoint, index) => snapPoint === b.hoveredSnapPoints[index]) &&
  (a.mousePosition && b.mousePosition ? a.mousePosition.equals(b.mousePosition) : a.mousePosition === b.mousePosition);

type MeasurePointerCoordinates = {
  readonly clientX: number;
  readonly clientY: number;
};

type MeasurePointerSnapshot = {
  readonly hasTarget: boolean;
  readonly hasActiveSnapTarget: boolean;
  readonly point?: THREE.Vector3;
  readonly target?: MeasurementTarget;
};

export function MeasureTool(): React.JSX.Element {
  const { camera, gl, scene, invalidate } = useThree();
  const isTauDebugEnabled = useFeature('tauDebug');
  useEffect(() => subscribeToMatcapLoad(invalidate), [invalidate]);
  const events = useThree((state) => state.events) as EventManager<HTMLElement>;
  // R3F binds pointer events to `eventSource` (the viewer region div), which covers the canvas.
  // Listening on `gl.domElement` would never fire; see `tau-camera-controls.tsx` for the same
  // resolution order.
  const pointerTarget: HTMLElement = events.connected ?? gl.domElement;
  const graphicsActor = useGraphics();
  const cadRef = useCad();
  const renderFrame = useRenderFrame();
  const geometryKey = useGraphicsSelector(selectPresentedGeometryKey);
  const modelInteractionUnitId = useGraphicsSelector((state) => state.context.modelInteractionUnitId);
  const manifest = useModelInteractionSelector((state) =>
    modelInteractionUnitId ? getModelInteractionUnitState(state.context, modelInteractionUnitId).manifest : undefined,
  );
  const pickableMeshesVersion = useGraphicsSelector((state) => state.context.pickableMeshesVersion);
  const modelDisplayRevision = useModelInteractionSelector((state) => state.context.displayRevision);
  // Read when the cache is consulted, so a playing clip does not re-render the tool every frame.
  const kinematicsRef = useKinematicsRef();
  const measurements = useGraphicsSelector((state) => state.context.measurements);
  const currentStart = useGraphicsSelector((state) => state.context.currentMeasurementStart);
  const snapDistance = useGraphicsSelector((state) => state.context.measureSnapDistance);
  const measureMode = useGraphicsSelector((state) => state.context.measureMode);
  const measureSnapEnabled = useGraphicsSelector((state) => state.context.measureSnapEnabled);
  const measureFilter = useGraphicsSelector((state) => state.context.measureFilter);
  const measureOperation = useGraphicsSelector((state) => state.context.measureOperation);
  const measureFrame = useGraphicsSelector((state) => state.context.measureFrame);
  const chosenCandidateId = useGraphicsSelector((state) => state.context.measureActiveCandidateId);
  const explicitCandidateId = useGraphicsSelector((state) => state.context.measureChosenCandidateId);
  const lockedTargetId = useGraphicsSelector((state) => state.context.measureLockedTargetId);
  const measureCommitRequest = useGraphicsSelector((state) => state.context.measureCommitRequest);
  const measureCatalogRequest = useGraphicsSelector((state) => state.context.measureCatalogRequest);
  const metersPerDisplayUnit = useGraphicsSelector((state) => state.context.displayUnits.length.metersPerUnit);
  const lengthSymbol = useGraphicsSelector((state) => state.context.displayUnits.length.symbol);
  const hoveredMeasurementId = useGraphicsSelector((state) => state.context.hoveredMeasurementId);
  const isMeasureActive = useGraphicsSelector((state) => state.context.isMeasureActive);
  const wasMeasureActiveRef = useRef(isMeasureActive);
  // A press alone raises `cameraInteracting`; only actual camera movement steals a measure gesture.
  const cameraMoving = useGraphicsSelector((state) => state.context.cameraInteractionHadMovement);

  const [{ hoveredSnapPoints, activeSnapPoint, mousePosition }, dispatchHoverState] = useReducer(measureHoverReducer, {
    hoveredSnapPoints: [],
    activeSnapPoint: undefined,
    mousePosition: undefined,
  });
  // The hover last dispatched: an unchanged one dispatches nothing, so a cut step under a resting pointer renders
  // nothing.
  const hoverRef = useRef(noMeasureHover);

  const currentStartRef = useRef(currentStart);
  const chosenCandidateIdRef = useRef(explicitCandidateId);
  const lockedTargetIdRef = useRef(lockedTargetId);
  const candidateReferences = useRef(
    new Map<string, { target: MeasurementTarget; mesh: THREE.Object3D & { geometry: THREE.BufferGeometry } }>(),
  );
  const catalogReferences = useRef(
    new Map<string, { target: MeasurementTarget; mesh: THREE.Object3D & { geometry: THREE.BufferGeometry } }>(),
  );
  const selectedTargetRef = useRef<
    { target: MeasurementTarget; mesh: THREE.Object3D & { geometry: THREE.BufferGeometry } } | undefined
  >(undefined);
  const describeTarget = useCallback(
    (target: MeasurementTarget, mesh: THREE.Object3D): string => {
      return describeMeasurementTarget(target, mesh as THREE.Object3D & { geometry: THREE.BufferGeometry }, manifest);
    },
    [manifest],
  );
  const activePointerIdsRef = useRef(new Set<number>());
  const exactAbortRef = useRef<AbortController | undefined>(undefined);
  const exactTaskRef = useRef<Promise<void> | undefined>(undefined);
  const exactRequestRef = useRef(0);
  const committedCutsRef = useRef(graphicsActor.getSnapshot().context.committedSectionCuts);
  const handledCommitRequestRef = useRef(0);
  const handledCatalogRequestRef = useRef(measureCatalogRequest);
  const catalogVersionRef = useRef(0);
  const catalogObservationRef = useRef<{ record: MeasurementCatalogObservation } | undefined>(undefined);
  const catalogDebugEnabledRef = useRef(isTauDebugEnabled);
  useEffect(() => {
    catalogDebugEnabledRef.current = isTauDebugEnabled;
    if (!isTauDebugEnabled) {
      catalogObservationRef.current = undefined;
      return undefined;
    }
    let live = true;
    const read = (): MeasurementCatalogObservation | undefined => {
      if (!live || scene.userData[measurementCatalogGetterKey] !== read) {
        return undefined;
      }
      const record = catalogObservationRef.current?.record;
      return record ? structuredClone(record) : undefined;
    };
    // oxlint-disable-next-line react/immutability -- This debug mount owns the external Three scene getter and revokes only its own registration on cleanup.
    scene.userData['measurementCatalogObservation'] = read;
    return () => {
      live = false;
      catalogObservationRef.current = undefined;
      if (scene.userData[measurementCatalogGetterKey] === read) {
        delete scene.userData['measurementCatalogObservation'];
      }
    };
  }, [isTauDebugEnabled, scene]);
  const catalogScanRef = useRef<
    | {
        meshes: Array<THREE.Object3D & { geometry: THREE.BufferGeometry }>;
        meshIndex: number;
        graph?: MeshFeatureGraph;
        featureIndex: number;
        instanceIndex: number;
        targets: MeasurementTarget[];
        targetIndex: number;
        catalog: Map<string, { target: MeasurementTarget; mesh: THREE.Object3D & { geometry: THREE.BufferGeometry } }>;
      }
    | undefined
  >(undefined);
  const [cameraRevision, setCameraRevision] = useState(0);
  const [poseRevision, setPoseRevision] = useState(0);
  const candidateSourceRef = useRef<
    | {
        cameraRevision: number;
        geometryKey: typeof geometryKey;
        graphicsActor: typeof graphicsActor;
        isMeasureActive: boolean;
        measureFilter: typeof measureFilter;
        measureMode: typeof measureMode;
        modelDisplayRevision: typeof modelDisplayRevision;
        pickableMeshesVersion: typeof pickableMeshesVersion;
        poseRevision: number;
      }
    | undefined
  >(undefined);
  const cameraMatrixRef = useRef('');
  useLayoutEffect(() => {
    if (isMeasureActive) {
      cameraMatrixRef.current = `${camera.matrixWorld.elements.join(',')}:${camera.projectionMatrix.elements.join(',')}`;
    }
  }, [camera, isMeasureActive]);
  useFrame(() => {
    if (!isMeasureActive) {
      return;
    }
    const key = `${camera.matrixWorld.elements.join(',')}:${camera.projectionMatrix.elements.join(',')}`;
    if (key !== cameraMatrixRef.current) {
      cameraMatrixRef.current = key;
      setCameraRevision((revision) => revision + 1);
    }
  });

  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const measureInputActor = useMemo(() => createActor(measureInputMachine), []);
  const pointerMoveCoalescerRef = useRef<RafCoalescer<MeasurePointerCoordinates> | undefined>(undefined);
  const pointerGraphPendingRef = useRef(new WeakSet<THREE.Mesh>());
  const graphSource = useMemo(
    () => ({
      geometryKey,
      isMeasureActive,
      modelDisplayRevision,
      pickableMeshesVersion,
    }),
    [geometryKey, isMeasureActive, modelDisplayRevision, pickableMeshesVersion],
  );
  const graphSourceRef = useRef<typeof graphSource | undefined>(undefined);
  const graphClientRef = useRef<MeasurementFeatureWorkerClient | undefined>(undefined);
  const graphClient = useCallback(() => {
    graphClientRef.current ??= createMeasurementFeatureWorkerClient();
    return graphClientRef.current;
  }, []);
  useEffect(() => {
    graphSourceRef.current = graphSource;
    return () => {
      if (graphSourceRef.current === graphSource) {
        graphSourceRef.current = undefined;
      }
      graphClientRef.current?.dispose();
      graphClientRef.current = undefined;
      pointerGraphPendingRef.current = new WeakSet();
    };
  }, [graphSource]);
  // Where the pointer last moved, so a cut change can raycast its snaps again from there.
  const lastPointerRef = useRef<MeasurePointerCoordinates | undefined>(undefined);
  const wasCameraMovingRef = useRef(cameraMoving);

  // Cache mesh list to avoid expensive scene.traverse() on every mouse event.
  // Invalidated when geometry, component display or a kinematic pose changes: a pose moves meshes, and the
  // snap points cached under them hold world positions.
  const cachedMeshesRef = useRef<THREE.Mesh[]>([]);
  const cachedLinesRef = useRef<Array<THREE.Object3D & { geometry: THREE.BufferGeometry }>>([]);
  const cachedMeshKeyRef = useRef<string | undefined>(undefined);
  // Keep scene ref in sync for getCachedMeshes (stable callback reference)
  const sceneRef = useRef(scene);
  const cameraRef = useRef(camera);
  const geometryKeyRef = useRef(geometryKey);
  const pickableMeshesVersionRef = useRef(pickableMeshesVersion);
  const modelDisplayRevisionRef = useRef(modelDisplayRevision);
  const kinematicsActorRef = useRef(kinematicsRef);
  useLayoutEffect(() => {
    currentStartRef.current = currentStart;
    chosenCandidateIdRef.current = explicitCandidateId;
    lockedTargetIdRef.current = lockedTargetId;
    sceneRef.current = scene;
    cameraRef.current = camera;
    geometryKeyRef.current = geometryKey;
    pickableMeshesVersionRef.current = pickableMeshesVersion;
    modelDisplayRevisionRef.current = modelDisplayRevision;
    kinematicsActorRef.current = kinematicsRef;
  }, [
    camera,
    currentStart,
    explicitCandidateId,
    geometryKey,
    kinematicsRef,
    lockedTargetId,
    modelDisplayRevision,
    pickableMeshesVersion,
    scene,
  ]);

  const getCachedMeshes = useCallback((): THREE.Mesh[] => {
    const poseRevision = kinematicsActorRef.current.getSnapshot().context.revision;
    const currentKey = `${geometryKeyRef.current}:${pickableMeshesVersionRef.current}:${modelDisplayRevisionRef.current}:${poseRevision}:${cameraRef.current.layers.mask}`;
    if (currentKey === cachedMeshKeyRef.current) {
      return cachedMeshesRef.current;
    }

    const meshes: THREE.Mesh[] = [];
    const lines: Array<THREE.Object3D & { geometry: THREE.BufferGeometry }> = [];
    sceneRef.current.traverseVisible((object) => {
      if (
        !getGltfOccurrenceLayers(object).test(cameraRef.current.layers) ||
        hasSceneTagInHierarchy(object, measurementPickBlockingSceneTags)
      ) {
        return;
      }
      if (object instanceof THREE.Mesh && object.visible && object.userData['measurementFeatures']?.kind !== 'line') {
        meshes.push(object as THREE.Mesh);
      } else if (
        object.userData['measurementFeatures']?.kind === 'line' &&
        object.userData['fatLineSource'] !== true &&
        'geometry' in object &&
        object.geometry instanceof THREE.BufferGeometry
      ) {
        lines.push(object as THREE.Object3D & { geometry: THREE.BufferGeometry });
      }
    });
    cachedMeshesRef.current = meshes;
    cachedLinesRef.current = lines;
    cachedMeshKeyRef.current = currentKey;
    return meshes;
  }, []);
  const getCachedLines = useCallback(() => {
    getCachedMeshes();
    return cachedLinesRef.current;
  }, [getCachedMeshes]);
  const requestPointerGraph = useCallback(
    async (surface: THREE.Mesh, presentedKey: string | undefined): Promise<void> => {
      if (graphSourceRef.current !== graphSource) {
        return;
      }
      const pending = pointerGraphPendingRef.current;
      if (pending.has(surface)) {
        return;
      }
      pending.add(surface);
      try {
        const ready = await graphClient().prepare(surface);
        if (graphSourceRef.current !== graphSource) {
          return;
        }
        if (
          ready &&
          graphicsActor.getSnapshot().context.measureMessage ===
            'Measurement features could not be prepared. Move the pointer to retry.'
        ) {
          graphicsActor.send({ type: 'setMeasureMessage' });
        }
        if (ready && presentedKey === geometryKeyRef.current && lastPointerRef.current) {
          pointerMoveCoalescerRef.current?.schedule(lastPointerRef.current);
        }
      } catch {
        if (graphSourceRef.current !== graphSource) {
          return;
        }
        const { context } = graphicsActor.getSnapshot();
        if (
          presentedKey === geometryKeyRef.current &&
          context.isMeasureActive &&
          context.measureMessage !== 'Measurement features could not be prepared. Move the pointer to retry.'
        ) {
          graphicsActor.send({
            type: 'setMeasureMessage',
            message: 'Measurement features could not be prepared. Move the pointer to retry.',
          });
        }
      } finally {
        pending.delete(surface);
      }
    },
    [graphClient, graphSource, graphicsActor],
  );

  useEffect(() => {
    measureInputActor.start();
    return () => {
      measureInputActor.stop();
    };
  }, [measureInputActor]);

  useEffect(
    () => () => {
      exactAbortRef.current?.abort();
      graphicsActor.send({
        type: 'cancelPendingMeasurements',
        reason: 'The measuring view closed before the exact query finished.',
      });
    },
    [graphicsActor],
  );

  const updatePointerSnapshot = useCallback(
    ({ clientX, clientY }: MeasurePointerCoordinates, coarsePointer = false): MeasurePointerSnapshot => {
      const rect = gl.domElement.getBoundingClientRect();
      mouseRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      setRaycasterFromCamera(raycasterRef.current, mouseRef.current, camera);

      // Read here, not selected: a section drag step must not re-render the tool or reset its pointer coalescer.
      const clipping = resolveSectionViewRaycastClip(graphicsActor.getSnapshot().context, renderFrame);
      const firstIntersection = raycastFirstVisibleMeshHit({
        raycaster: raycasterRef.current,
        meshes: getCachedMeshes(),
        clipping,
      });

      const nextCandidates = new Map<
        string,
        { target: MeasurementTarget; mesh: THREE.Object3D & { geometry: THREE.BufferGeometry } }
      >();
      const isKept = createRaycastClipTest(clipping);
      for (const mesh of measureSnapEnabled ? [...getCachedMeshes(), ...getCachedLines()] : []) {
        const slots = getModelComponentInstanceSlots(mesh);
        if (mesh instanceof THREE.InstancedMesh && !slots) {
          continue;
        }
        for (let slot = 0; slot < (slots?.length ?? 1); slot++) {
          const instanceId = slots ? slot : undefined;
          const isVisible = (
            world: THREE.Vector3,
            feature: MeasurementTarget['feature'],
            kind: MeasurementTarget['kind'],
          ): boolean => {
            const supportPoints =
              kind === 'center' || kind === 'centroid' || kind === 'body'
                ? featureSupports({ feature, world, object: mesh, instanceId })
                : [world];
            return supportPoints.some((support) => {
              if (isKept && !isKept(support)) {
                return false;
              }
              const projected = support.clone().project(camera);
              if (projected.z < -1 || projected.z > 1) {
                return false;
              }
              setRaycasterFromCamera(raycasterRef.current, new THREE.Vector2(projected.x, projected.y), camera);
              const visibleHit = raycastFirstVisibleMeshHit({
                raycaster: raycasterRef.current,
                meshes: getCachedMeshes(),
                clipping,
              });
              return isSupportVisible(visibleHit, raycasterRef.current.ray, support);
            });
          };
          const sourceMesh = measurementSourceMesh(mesh, instanceId);
          const graph =
            mesh.userData['measurementFeatures']?.kind === 'line'
              ? getLineMeasurementFeatures(mesh)
              : sourceMesh && getCachedMeshMeasurementFeatures(sourceMesh);
          if (!graph) {
            // async-iife: bootstrap -- Pointer snapshots cannot await an off-thread graph.
            if (sourceMesh) {
              void requestPointerGraph(sourceMesh, geometryKeyRef.current);
            }
            continue;
          }
          const targets = findMeasurementTargets(graph, {
            mesh,
            instanceId,
            camera,
            canvas: gl.domElement,
            mousePos: mouseRef.current,
            snapDistancePx: coarsePointer ? Math.max(18, snapDistance) : snapDistance,
            activeId:
              hoverRef.current.activeSnapPoint?.sourceMesh === mesh
                ? hoverRef.current.activeSnapPoint.id.split(':').slice(1).join(':')
                : undefined,
            filter: measureMode === 'point' ? 'point' : measureFilter,
            isKept: isKept ?? undefined,
            surfaceHit:
              firstIntersection?.object === mesh && firstIntersection.instanceId === instanceId
                ? firstIntersection.point
                : undefined,
            faceIndex:
              firstIntersection?.object === mesh && firstIntersection.instanceId === instanceId
                ? (firstIntersection.faceIndex ?? undefined)
                : undefined,
            isVisible,
          });
          for (const target of targets) {
            const id =
              instanceId === undefined
                ? `${mesh.uuid}:${target.id}`
                : `${mesh.uuid}@instance:${instanceId}:${target.id}`;
            nextCandidates.set(id, { target: { ...target, id }, mesh });
          }
        }
      }
      const allSnapPoints = [...nextCandidates.values()]
        .map(({ target }) => target)
        .toSorted((a, b) => {
          if (Math.abs(a.distancePx - b.distancePx) > 2) {
            return a.distancePx - b.distancePx;
          }
          const priority = {
            endpoint: 0,
            center: 1,
            midpoint: 2,
            edge: 3,
            nearest: 4,
            surface: 5,
            centroid: 6,
            face: 7,
            body: 8,
          };
          return priority[a.kind] - priority[b.kind] || a.id.localeCompare(b.id);
        })
        .slice(0, 5);
      candidateReferences.current = new Map([...catalogReferences.current, ...nextCandidates]);
      const preferredId = lockedTargetIdRef.current ?? chosenCandidateIdRef.current;
      const closest = candidateReferences.current.get(preferredId ?? '')?.target ?? allSnapPoints[0];
      const candidateSummaries = [...candidateReferences.current.values()].map(({ target, mesh }) => ({
        id: target.id,
        label: describeTarget(target, mesh),
      }));
      const graphicsContext = graphicsActor.getSnapshot().context;
      if (
        graphicsContext.measureActiveCandidateId !== closest?.id ||
        graphicsContext.measureCandidates.length !== candidateSummaries.length ||
        candidateSummaries.some((candidate, index) => candidate.id !== graphicsContext.measureCandidates[index]?.id)
      ) {
        graphicsActor.send({ type: 'setMeasureCandidates', candidates: candidateSummaries, activeId: closest?.id });
      }
      const hover = {
        hoveredSnapPoints: allSnapPoints,
        activeSnapPoint: closest,
        mousePosition:
          closest?.position ?? (measureMode === 'point' || !measureSnapEnabled ? firstIntersection?.point : undefined),
      };
      if (!isSameMeasureHover(hoverRef.current, hover)) {
        hoverRef.current = hover;
        dispatchHoverState({ type: 'set', ...hover });
      }
      let previewDistance: number | undefined;
      if (
        currentStartRef.current &&
        hover.mousePosition &&
        (measureMode === 'point' || measureOperation === 'point-distance')
      ) {
        const pointMeters = fromThreeRenderPoint({ renderFrame, point: hover.mousePosition });
        previewDistance = new THREE.Vector3(...currentStartRef.current).distanceTo(new THREE.Vector3(...pointMeters));
      }
      if (graphicsActor.getSnapshot().context.measurePreviewDistance !== previewDistance) {
        graphicsActor.send({ type: 'setMeasurePreviewDistance', distance: previewDistance });
      }
      invalidate();

      return {
        hasTarget: Boolean(firstIntersection) && (measureMode === 'point' || !measureSnapEnabled),
        hasActiveSnapTarget: Boolean(closest),
        point:
          closest?.position ?? (measureMode === 'point' || !measureSnapEnabled ? firstIntersection?.point : undefined),
        target: closest,
      };
    },
    [
      camera,
      describeTarget,
      getCachedLines,
      getCachedMeshes,
      requestPointerGraph,
      gl.domElement,
      graphicsActor,
      invalidate,
      measureFilter,
      measureMode,
      measureSnapEnabled,
      renderFrame,
      snapDistance,
    ],
  );
  const hoverSourceRef = useRef({
    camera,
    cameraRevision,
    geometryKey,
    element: gl.domElement,
    isMeasureActive,
    modelDisplayRevision,
    pickableMeshesVersion,
    poseRevision,
    updatePointerSnapshot,
  });

  const commitTarget = useCallback(
    (snapshot: MeasurePointerSnapshot): void => {
      const { point } = snapshot;
      if (!point) {
        return;
      }
      if (exactAbortRef.current && !exactAbortRef.current.signal.aborted) {
        exactAbortRef.current.abort();
        exactRequestRef.current++;
        graphicsActor.send({
          type: 'cancelPendingMeasurements',
          reason: 'The exact query was replaced by a new selection.',
        });
      }
      const pointMeters = [...fromThreeRenderPoint({ renderFrame, point })] as [number, number, number];
      const { target } = snapshot;
      const source = target ? candidateReferences.current.get(target.id) : undefined;
      const anchor: MeasurementAnchor = {
        point: pointMeters,
        localPoint: target ? [target.localPosition.x, target.localPosition.y, target.localPosition.z] : undefined,
        geometryKey,
        occurrenceId: target?.occurrenceId ?? source?.mesh.uuid,
        featureId: target?.featureId,
        featureKind: target?.feature.kind ?? 'point',
        label: target?.label ?? 'Surface point',
        quality: target?.evidence ?? 'mesh',
      };
      const basisSource = selectedTargetRef.current ?? source;
      const basisMesh = basisSource?.mesh;
      const basisMatrix =
        basisMesh && basisSource && getMeasurementTargetWorldMatrix(basisSource.target, new THREE.Matrix4());
      const frameOrigin = fromThreeRenderPoint({ renderFrame, point: new THREE.Vector3() });
      const frameBasis =
        measureFrame === 'selected-local' && basisMesh && basisMatrix
          ? ([0, 1, 2].map((axis) => {
              basisMesh.updateWorldMatrix(true, false);
              const worldAxis = new THREE.Vector3().setFromMatrixColumn(basisMatrix, axis).normalize();
              const endpoint = fromThreeRenderPoint({ renderFrame, point: worldAxis });
              const physical = new THREE.Vector3(
                endpoint[0] - frameOrigin[0],
                endpoint[1] - frameOrigin[1],
                endpoint[2] - frameOrigin[2],
              ).normalize();
              return [physical.x, physical.y, physical.z] as [number, number, number];
            }) as MeasurementRecord['frameBasis'])
          : undefined;
      const fitDetails = [selectedTargetRef.current?.target, target].flatMap((candidate) =>
        candidate?.feature.kind === 'circle'
          ? [
              {
                max: candidate.feature.maxResidual,
                rms: candidate.feature.rmsResidual,
                coverage: candidate.feature.angularCoverage,
              },
            ]
          : [],
      );
      const fitEvidence =
        fitDetails.length > 0
          ? `Maximum sampled-vertex residual ${(Math.max(...fitDetails.map((fit) => fit.max)) * renderFrame.metersPerRenderUnit).toPrecision(4)} m; sampled-vertex RMS ${(Math.max(...fitDetails.map((fit) => fit.rms)) * renderFrame.metersPerRenderUnit).toPrecision(4)} m; angular coverage ${((Math.min(...fitDetails.map((fit) => fit.coverage)) * 180) / Math.PI).toFixed(1)}°. Source deviation bound unknown.`
          : 'Fitted to the rendered boundary; source deviation bound unknown.';
      // oxlint-disable-next-line eslint/max-params -- A record keeps the operation, quality, witnesses and two source anchors together.
      const createRecord = (
        value: number,
        operation: MeasurementRecord['operation'],
        quality: MeasurementRecord['quality'],
        start: [number, number, number],
        end: [number, number, number],
        first?: MeasurementAnchor,
        second?: MeasurementAnchor,
      ): Omit<MeasurementRecord, 'id' | 'isPinned'> => ({
        frameId: frameBasis ? `feature:${(first ?? anchor).occurrenceId ?? 'local'}` : 'tau:root',
        frameBasis,
        startPoint: start,
        endPoint: end,
        distance: value,
        operation,
        quality,
        evidenceDetails:
          quality === 'cad'
            ? 'AP242 whole-shape minimum; unsigned, no interference classification; numerical tolerance not provided.'
            : quality === 'fitted'
              ? fitEvidence
              : 'Calculated from the rendered mesh; source deviation bound unknown.',
        anchors: [first ?? anchor, second],
        geometryKey,
        poseRevision: kinematicsRef.getSnapshot().context.revision,
        status: 'current',
      });
      if (!currentStartRef.current) {
        if (measureFrame === 'selected-local' && !source) {
          graphicsActor.send({ type: 'setMeasureMessage', message: 'Select a feature to use its local frame.' });
          return;
        }
        if (
          measureMode === 'auto' &&
          source &&
          ['point-distance', 'edge-length', 'radius', 'diameter', 'extent-x', 'extent-y', 'extent-z'].includes(
            measureOperation,
          )
        ) {
          source.mesh.updateWorldMatrix(true, false);
          const sourceMatrix = getMeasurementTargetWorldMatrix(source.target, new THREE.Matrix4());
          if (!sourceMatrix) {
            return;
          }
          const localAxes: [THREE.Vector3, THREE.Vector3, THREE.Vector3] | undefined =
            measureFrame === 'selected-local'
              ? ([0, 1, 2].map((axis) => new THREE.Vector3().setFromMatrixColumn(sourceMatrix, axis).normalize()) as [
                  THREE.Vector3,
                  THREE.Vector3,
                  THREE.Vector3,
                ])
              : undefined;
          const featureTarget: MeasurementTarget =
            source.target.feature.kind === 'edge' && source.target.kind === 'midpoint'
              ? { ...source.target, kind: 'edge' }
              : source.target;
          const available = measureFeature(featureTarget, source.mesh, localAxes);
          const operation =
            measureOperation === 'edge-length'
              ? 'length'
              : measureOperation.startsWith('extent-')
                ? 'extent'
                : measureOperation;
          const result =
            available.find(
              (candidate) =>
                candidate.operation === operation &&
                (!measureOperation.startsWith('extent-') ||
                  candidate.label.toLowerCase().startsWith(measureOperation.slice(-1))),
            ) ??
            (measureOperation === 'point-distance'
              ? available.find((candidate) => candidate.operation === 'length' || candidate.operation === 'diameter')
              : undefined);
          if (result) {
            graphicsActor.send({ type: 'setMeasureMessage' });
            const witnessStart = result.witnesses[0] ?? point;
            const witnessEnd = result.witnesses.at(-1) ?? point;
            graphicsActor.send({
              type: 'completeFeatureMeasurement',
              record: createRecord(
                result.value * renderFrame.metersPerRenderUnit,
                result.operation === 'length'
                  ? 'edge-length'
                  : result.operation === 'extent'
                    ? (`extent-${result.label[0]!.toLowerCase()}` as MeasurementRecord['operation'])
                    : (result.operation as MeasurementRecord['operation']),
                result.evidence,
                [...fromThreeRenderPoint({ renderFrame, point: witnessStart })],
                [...fromThreeRenderPoint({ renderFrame, point: witnessEnd })],
              ),
            });
            return;
          }
          if (measureOperation !== 'point-distance') {
            graphicsActor.send({
              type: 'setMeasureMessage',
              message: `${measureOperation} is unavailable for ${anchor.label}. Choose another target or operation.`,
            });
            return;
          }
        }
        selectedTargetRef.current = source;
        graphicsActor.send({ type: 'startMeasurement', payload: pointMeters, anchor });
        return;
      }
      const firstAnchor = graphicsActor.getSnapshot().context.currentMeasurementAnchor;
      if (firstAnchor?.geometryKey !== geometryKey) {
        graphicsActor.send({ type: 'cancelCurrentMeasurement' });
        return;
      }
      const first = selectedTargetRef.current?.target;
      if (
        measureOperation === 'minimum-distance' &&
        first?.feature.kind === 'body' &&
        source?.target.feature.kind === 'body'
      ) {
        exactAbortRef.current?.abort();
        graphicsActor.send({
          type: 'cancelPendingMeasurements',
          reason: 'The exact query was replaced by a new selection.',
        });
        const controller = new AbortController();
        exactAbortRef.current = controller;
        const request = ++exactRequestRef.current;
        const pose = kinematicsRef.getSnapshot().context.revision;
        const cuts = committedCutsRef.current;
        const selectedSource = selectedTargetRef.current;
        const componentA =
          selectedSource &&
          (selectedSource.mesh instanceof THREE.InstancedMesh
            ? getModelComponentHitOwner({ object: selectedSource.mesh, instanceId: selectedSource.target.instanceId })
                ?.componentId
            : (selectedSource.mesh.userData['measurementFeatures'] as { componentId?: string } | undefined)
                ?.componentId);
        const componentB =
          source.mesh instanceof THREE.InstancedMesh
            ? getModelComponentHitOwner({ object: source.mesh, instanceId: source.target.instanceId })?.componentId
            : (source.mesh.userData['measurementFeatures'] as { componentId?: string } | undefined)?.componentId;
        const isWholePrimitive = (
          componentId: string | undefined,
          selected: typeof selectedTargetRef.current,
        ): boolean =>
          selected !== undefined &&
          isWholePrimitiveMeasurementTarget({ scene, componentId, target: selected.target, mesh: selected.mesh });
        const asBuilt = modelInteractionUnitId
          ? Object.values(
              getKinematicsUnitState(kinematicsRef.getSnapshot().context, modelInteractionUnitId).coordinates,
            ).every((value) => value === 0)
          : false;
        const assemblySource = selectedTargetRef.current && getGltfAssemblySource(selectedTargetRef.current.mesh);
        const secondAssemblySource = getGltfAssemblySource(source.mesh);
        const placements =
          assemblySource &&
          assemblySource === secondAssemblySource &&
          assemblySource.display.root.digest === geometryKey &&
          modelInteractionUnitId &&
          componentA &&
          componentB
            ? captureGltfAssemblyPlacements(
                assemblySource,
                [componentA, componentB],
                getKinematicsUnitState(kinematicsRef.getSnapshot().context, modelInteractionUnitId),
              )
            : undefined;
        const assemblyPose =
          assemblySource && placements
            ? {
                root: assemblySource.display.root,
                placements,
                isCurrent: () =>
                  selectPresentedGeometryKey(graphicsActor.getSnapshot()) === geometryKey &&
                  kinematicsRef.getSnapshot().context.revision === pose,
              }
            : undefined;
        const exactPoseAvailable = asBuilt || assemblyPose !== undefined;
        const id = generatePrefixedId(idPrefix.measurement);
        const record: MeasurementRecord = {
          ...createRecord(0, 'minimum-distance', 'cad', currentStartRef.current, pointMeters, firstAnchor, anchor),
          id,
          isPinned: false,
          poseRevision: pose,
          status:
            cadRef &&
            manifest &&
            componentA &&
            componentB &&
            exactPoseAvailable &&
            isWholePrimitive(componentA, selectedTargetRef.current) &&
            isWholePrimitive(componentB, source)
              ? 'pending'
              : 'unavailable',
          unavailableReason: exactPoseAvailable
            ? !cadRef || !manifest || !componentA || !componentB
              ? 'No verified CAD occurrence mapping is available.'
              : !isWholePrimitive(componentA, selectedTargetRef.current) || !isWholePrimitive(componentB, source)
                ? 'The selected body is only part of the CAD occurrence.'
                : undefined
            : 'Exact geometry is unavailable for a moved assembly.',
        };
        graphicsActor.send({ type: 'cancelCurrentMeasurement' });
        graphicsActor.send({ type: 'addMeasurementRecord', record });
        selectedTargetRef.current = undefined;
        if (record.status === 'unavailable' || !cadRef || !manifest || !componentA || !componentB) {
          return;
        }
        const resolveExact = async (): Promise<void> => {
          try {
            const answer = await measureExactOccurrenceDistance({
              cadRef,
              manifest,
              presentedGeometryHash: geometryKey,
              occurrenceA: componentA,
              occurrenceB: componentB,
              signal: controller.signal,
              assemblyPose,
            });
            const current = graphicsActor.getSnapshot();
            if (
              controller.signal.aborted ||
              exactRequestRef.current !== request ||
              selectPresentedGeometryKey(current) !== geometryKey ||
              kinematicsRef.getSnapshot().context.revision !== pose ||
              current.context.committedSectionCuts !== cuts
            ) {
              return;
            }
            graphicsActor.send({
              type: 'resolveMeasurementRecord',
              id,
              patch:
                answer.status === 'cad-geometry'
                  ? {
                      status: 'current',
                      quality: 'cad',
                      distance: answer.distanceMeters,
                      startPoint: answer.pointAMeters,
                      endPoint: answer.pointBMeters,
                      evidenceDetails:
                        'AP242 whole-shape minimum; unsigned, no interference classification; numerical tolerance not provided.',
                    }
                  : { status: 'unavailable', unavailableReason: answer.reason },
            });
          } catch (error) {
            if (!controller.signal.aborted && exactRequestRef.current === request) {
              graphicsActor.send({
                type: 'resolveMeasurementRecord',
                id,
                patch: {
                  status: 'unavailable',
                  unavailableReason: error instanceof Error ? error.message : 'Exact geometry query failed.',
                },
              });
            }
          }
        };
        exactTaskRef.current = resolveExact();
        return;
      }
      const pair = first && source ? measureTargetPair(first, source.target) : [];
      const wanted =
        measureOperation === 'minimum-distance'
          ? 'minimum-distance'
          : measureOperation === 'center-distance'
            ? 'center-distance'
            : measureOperation === 'plane-spacing'
              ? 'plane-spacing'
              : measureOperation === 'angle'
                ? 'angle'
                : 'distance';
      const result = pair.find((candidate) => candidate.operation === wanted);
      if (measureOperation !== 'point-distance' && !result) {
        graphicsActor.send({
          type: 'setMeasureMessage',
          message: `${measureOperation} is unavailable for these targets. Choose another target or operation.`,
        });
        return;
      }
      const witnessStart =
        result?.witnesses[0] ?? toThreeRenderPoint({ renderFrame, pointMeters: currentStartRef.current });
      const witnessEnd = result?.witnesses[1] ?? point;
      const quality =
        result?.evidence ?? (anchor.quality === 'fitted' || firstAnchor.quality === 'fitted' ? 'fitted' : 'mesh');
      graphicsActor.send({
        type: 'completeFeatureMeasurement',
        record: createRecord(
          result
            ? result.operation === 'angle'
              ? result.value
              : result.value * renderFrame.metersPerRenderUnit
            : new THREE.Vector3(...currentStartRef.current).distanceTo(new THREE.Vector3(...pointMeters)),
          measureOperation,
          quality,
          [...fromThreeRenderPoint({ renderFrame, point: witnessStart })],
          [...fromThreeRenderPoint({ renderFrame, point: witnessEnd })],
          firstAnchor,
          anchor,
        ),
      });
      graphicsActor.send({ type: 'setMeasureMessage' });
      selectedTargetRef.current = undefined;
    },
    [
      cadRef,
      geometryKey,
      graphicsActor,
      kinematicsRef,
      manifest,
      measureFrame,
      measureMode,
      measureOperation,
      modelInteractionUnitId,
      renderFrame,
      scene,
    ],
  );

  useEffect(() => {
    pointerMoveCoalescerRef.current?.cancel();
    pointerMoveCoalescerRef.current = createRafCoalescer((coordinates) => {
      updatePointerSnapshot(coordinates);
    });

    return () => {
      pointerMoveCoalescerRef.current?.cancel();
      pointerMoveCoalescerRef.current = undefined;
    };
  }, [updatePointerSnapshot]);

  useEffect(() => {
    const wasActive = wasMeasureActiveRef.current;
    wasMeasureActiveRef.current = isMeasureActive;
    if (!isMeasureActive && wasActive) {
      exactAbortRef.current?.abort();
      exactRequestRef.current++;
      graphicsActor.send({
        type: 'cancelPendingMeasurements',
        reason: 'Measurement closed before the exact query finished.',
      });
      pointerMoveCoalescerRef.current?.cancel();
      hoverRef.current = noMeasureHover;
      dispatchHoverState({ type: 'clear' });
      graphicsActor.send({ type: 'setMeasurePreviewDistance' });
      lastPointerRef.current = undefined;
      candidateReferences.current.clear();
      catalogReferences.current.clear();
      selectedTargetRef.current = undefined;
    }
  }, [graphicsActor, isMeasureActive]);

  useEffect(() => {
    exactAbortRef.current?.abort();
    exactRequestRef.current++;
    graphicsActor.send({ type: 'measurementSourceChanged', geometryKey });
    graphicsActor.send({ type: 'cancelCurrentMeasurement' });
    selectedTargetRef.current = undefined;
  }, [geometryKey, graphicsActor]);

  useEffect(() => {
    let { revision } = kinematicsRef.getSnapshot().context;
    const subscription = kinematicsRef.subscribe((snapshot) => {
      if (snapshot.context.revision === revision) {
        return;
      }
      revision = snapshot.context.revision;
      graphicsActor.send({ type: 'measurementPoseChanged', revision });
      if (!isMeasureActive) {
        return;
      }
      exactAbortRef.current?.abort();
      exactRequestRef.current++;
      setPoseRevision(revision);
      graphicsActor.send({ type: 'cancelCurrentMeasurement' });
      selectedTargetRef.current = undefined;
      catalogVersionRef.current++;
      catalogScanRef.current = undefined;
      if (lastPointerRef.current) {
        pointerMoveCoalescerRef.current?.schedule(lastPointerRef.current);
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [graphicsActor, isMeasureActive, kinematicsRef]);

  useEffect(() => {
    const previous = candidateSourceRef.current;
    candidateSourceRef.current = {
      cameraRevision,
      geometryKey,
      graphicsActor,
      isMeasureActive,
      measureFilter,
      measureMode,
      modelDisplayRevision,
      pickableMeshesVersion,
      poseRevision,
    };
    catalogVersionRef.current++;
    catalogScanRef.current = undefined;
    if (!isMeasureActive) {
      return;
    }
    if (
      previous &&
      previous.cameraRevision === cameraRevision &&
      previous.geometryKey === geometryKey &&
      previous.graphicsActor === graphicsActor &&
      previous.isMeasureActive === isMeasureActive &&
      previous.measureFilter === measureFilter &&
      previous.measureMode === measureMode &&
      previous.modelDisplayRevision === modelDisplayRevision &&
      previous.pickableMeshesVersion === pickableMeshesVersion &&
      previous.poseRevision === poseRevision
    ) {
      return;
    }
    const { context } = graphicsActor.getSnapshot();
    if (previous && context.measureMessage === 'Preparing measurement features…') {
      graphicsActor.send({ type: 'setMeasureMessage' });
    }
    if (catalogReferences.current.size === 0 && !context.measureChosenCandidateId && !context.measureLockedTargetId) {
      return;
    }
    catalogReferences.current.clear();
    candidateReferences.current.clear();
    graphicsActor.send({ type: 'setMeasureCandidates', candidates: [] });
  }, [
    cameraRevision,
    geometryKey,
    graphicsActor,
    isMeasureActive,
    modelDisplayRevision,
    measureFilter,
    measureMode,
    pickableMeshesVersion,
    poseRevision,
  ]);

  useEffect(() => {
    if (!isMeasureActive || measureCatalogRequest === handledCatalogRequestRef.current) {
      return;
    }
    handledCatalogRequestRef.current = measureCatalogRequest;
    const append = graphicsActor.getSnapshot().context.measureCatalogAppend;
    if (!append || !catalogScanRef.current) {
      catalogScanRef.current = {
        meshes: [...getCachedMeshes(), ...getCachedLines()],
        meshIndex: 0,
        featureIndex: 0,
        instanceIndex: 0,
        targets: [],
        targetIndex: 0,
        catalog: new Map(),
      };
    }
    const scan = catalogScanRef.current;
    const version = catalogVersionRef.current;
    const clipping = resolveSectionViewRaycastClip(graphicsActor.getSnapshot().context, renderFrame);
    const isKept = createRaycastClipTest(clipping);
    const catalogRaycaster = new THREE.Raycaster();
    const cameraKey = `${camera.matrixWorld.elements.join(',')}:${camera.projectionMatrix.elements.join(',')}`;
    const readOwner = (): MeasurementCatalogOwner => {
      const { current: source } = candidateSourceRef;
      return {
        sourceCurrent: graphSourceRef.current === graphSource,
        geometryKey: geometryKeyRef.current,
        version: catalogVersionRef.current,
        cameraMatrixWorld: [...camera.matrixWorld.elements],
        cameraProjectionMatrix: [...camera.projectionMatrix.elements],
        candidateSource: source
          ? {
              cameraRevision: source.cameraRevision,
              isMeasureActive: source.isMeasureActive,
              measureFilter: source.measureFilter,
              measureMode: source.measureMode,
              modelDisplayRevision: source.modelDisplayRevision,
              pickableMeshesVersion: source.pickableMeshesVersion,
              poseRevision: source.poseRevision,
            }
          : undefined,
      };
    };
    const observation: { record: MeasurementCatalogObservation } | undefined = catalogDebugEnabledRef.current
      ? {
          record: {
            requestId: measureCatalogRequest,
            captured: readOwner(),
            observed: readOwner(),
            catalogSize: scan.catalog.size,
          },
        }
      : undefined;
    if (observation) {
      catalogObservationRef.current = observation;
    }
    const observe = (change: Partial<MeasurementCatalogObservation>): void => {
      if (!observation || catalogObservationRef.current !== observation) {
        return;
      }
      observation.record = {
        ...observation.record,
        ...change,
        terminalBranch: observation.record.terminalBranch ?? change.terminalBranch,
        observed: observation.record.terminalBranch ? observation.record.observed : readOwner(),
        catalogSize: observation.record.terminalBranch ? observation.record.catalogSize : scan.catalog.size,
      };
    };
    const pageEnd = scan.catalog.size + 100;
    const featureBatchSize = 32;
    const preparingMessage = 'Preparing measurement features…';
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const publish = (hasMore: boolean): void => {
      if (observation) {
        observe({ terminalBranch: 'published' });
      }
      catalogReferences.current = new Map(scan.catalog);
      candidateReferences.current = new Map(scan.catalog);
      const candidates = [...scan.catalog.values()].map(({ target, mesh }) => ({
        id: target.id,
        label: describeTarget(target, mesh),
      }));
      graphicsActor.send({ type: 'setMeasureCandidates', candidates, activeId: candidates[0]?.id, hasMore });
    };
    const requestCatalogGraph = async (surface: THREE.Mesh, presentedKey: string | undefined): Promise<void> => {
      if (observation) {
        observe({ prepareResult: 'pending', sourceResolved: true });
      }
      graphicsActor.send({ type: 'setMeasureMessage', message: preparingMessage });
      try {
        const ready = await graphClient().prepare(surface);
        if (observation) {
          observe({
            prepareResult: ready ? 'ready' : 'undefined',
            graphFeatureCount: ready?.features.length,
            graphBodyCount: ready?.features.filter(({ kind }) => kind === 'body').length,
          });
        }
        if (
          cancelled ||
          graphSourceRef.current !== graphSource ||
          version !== catalogVersionRef.current ||
          presentedKey !== geometryKeyRef.current
        ) {
          if (observation) {
            let terminalBranch: MeasurementCatalogObservation['terminalBranch'] = 'source-changed';
            if (cancelled) {
              terminalBranch = 'effect-cleanup';
            } else if (graphSourceRef.current === graphSource) {
              terminalBranch = version === catalogVersionRef.current ? 'source-changed' : 'version-changed';
            }
            observe({ terminalBranch });
          }
          return;
        }
        if (ready) {
          scan.graph = ready;
          if (graphicsActor.getSnapshot().context.measureMessage === preparingMessage) {
            graphicsActor.send({ type: 'setMeasureMessage' });
          }
          timer = setTimeout(step, 0);
        } else {
          if (observation) {
            observe({ terminalBranch: 'prepare-undefined' });
          }
          if (graphicsActor.getSnapshot().context.measureMessage === preparingMessage) {
            graphicsActor.send({ type: 'setMeasureMessage' });
          }
          publish(false);
        }
      } catch {
        if (observation) {
          observe({
            prepareResult: 'error',
            terminalBranch: cancelled
              ? 'effect-cleanup'
              : graphSourceRef.current === graphSource
                ? version === catalogVersionRef.current
                  ? 'prepare-error'
                  : 'version-changed'
                : 'source-changed',
          });
        }
        if (!cancelled && graphSourceRef.current === graphSource && version === catalogVersionRef.current) {
          graphicsActor.send({
            type: 'setMeasureMessage',
            message: 'Measurement features could not be prepared. Reopen the target list to retry.',
          });
          publish(false);
        }
      }
    };
    const step = (): void => {
      if (cancelled || version !== catalogVersionRef.current) {
        if (observation) {
          observe({ terminalBranch: cancelled ? 'effect-cleanup' : 'version-changed' });
        }
        return;
      }
      if (cameraKey !== `${camera.matrixWorld.elements.join(',')}:${camera.projectionMatrix.elements.join(',')}`) {
        if (observation) {
          observe({ terminalBranch: 'camera-changed' });
        }
        catalogScanRef.current = undefined;
        return;
      }
      const start = performance.now();
      let checked = 0;
      while (scan.catalog.size < pageEnd && checked < 16 && performance.now() - start < 8) {
        if (scan.targetIndex >= scan.targets.length) {
          if (scan.graph && scan.featureIndex >= scan.graph.features.length) {
            const mesh = scan.meshes[scan.meshIndex - 1]!;
            const slots = getModelComponentInstanceSlots(mesh);
            if (slots && scan.instanceIndex + 1 < slots.length) {
              scan.instanceIndex++;
              scan.featureIndex = 0;
              const source = measurementSourceMesh(mesh, scan.instanceIndex);
              const graph = source && getCachedMeshMeasurementFeatures(source);
              if (!graph) {
                if (source) {
                  void requestCatalogGraph(source, geometryKeyRef.current);
                } else if (observation) {
                  observe({ terminalBranch: 'missing-canonical-source', sourceResolved: false });
                }
                return;
              }
              scan.graph = graph;
            } else {
              scan.graph = undefined;
            }
          }
          if (!scan.graph) {
            if (scan.meshIndex >= scan.meshes.length) {
              publish(false);
              return;
            }
            const mesh = scan.meshes[scan.meshIndex++]!;
            scan.featureIndex = 0;
            scan.instanceIndex = 0;
            const sourceMesh = measurementSourceMesh(
              mesh,
              getModelComponentInstanceSlots(mesh) ? scan.instanceIndex : undefined,
            );
            scan.graph =
              mesh.userData['measurementFeatures']?.kind === 'line'
                ? getLineMeasurementFeatures(mesh)
                : sourceMesh && getCachedMeshMeasurementFeatures(sourceMesh);
            if (!scan.graph) {
              // async-iife: bootstrap -- The catalog's timer yields while this worker request is pending.
              if (sourceMesh) {
                void requestCatalogGraph(sourceMesh, geometryKeyRef.current);
              } else if (observation) {
                observe({ terminalBranch: 'missing-canonical-source', sourceResolved: false });
              }
              return;
            }
          }
          const { graph } = scan;
          const mesh = scan.meshes[scan.meshIndex - 1]!;
          scan.targets = listMeasurementTargets(
            { ...graph, features: graph.features.slice(scan.featureIndex, scan.featureIndex + featureBatchSize) },
            {
              mesh,
              instanceId: getModelComponentInstanceSlots(mesh) ? scan.instanceIndex : undefined,
              camera,
              canvas: gl.domElement,
              filter: measureMode === 'point' ? 'point' : measureFilter,
              isKept: isKept ?? undefined,
            },
          );
          if (observation && scan.featureIndex === 0) {
            observe({
              sourceResolved: true,
              worldMatrixAvailable:
                getModelComponentWorldMatrix(
                  mesh,
                  getModelComponentInstanceSlots(mesh) ? scan.instanceIndex : undefined,
                  new THREE.Matrix4(),
                ) !== undefined,
              graphFeatureCount: graph.features.length,
              graphBodyCount: graph.features.filter(({ kind }) => kind === 'body').length,
            });
          }
          scan.featureIndex += featureBatchSize;
          scan.targetIndex = 0;
          continue;
        }
        const target = scan.targets[scan.targetIndex++]!;
        const mesh = target.sourceMesh as THREE.Object3D & { geometry: THREE.BufferGeometry };
        checked++;
        const supportPoints =
          target.kind === 'center' || target.kind === 'centroid' || target.kind === 'body'
            ? featureSupports({
                feature: target.feature,
                world: target.position,
                object: mesh,
                instanceId: target.instanceId,
              })
            : [target.position];
        const visible = supportPoints.some((support) => {
          if (isKept && !isKept(support)) {
            return false;
          }
          const projected = support.clone().project(camera);
          if (projected.z < -1 || projected.z > 1) {
            return false;
          }
          setRaycasterFromCamera(catalogRaycaster, new THREE.Vector2(projected.x, projected.y), camera);
          const hit = raycastFirstVisibleMeshHit({ raycaster: catalogRaycaster, meshes: getCachedMeshes(), clipping });
          return isSupportVisible(hit, catalogRaycaster.ray, support);
        });
        if (visible) {
          const id = `${mesh.uuid}:${target.id}`;
          scan.catalog.set(id, { target: { ...target, id }, mesh });
        }
      }
      if (scan.catalog.size >= pageEnd) {
        publish(
          scan.targetIndex < scan.targets.length ||
            (scan.graph !== undefined &&
              (scan.featureIndex < scan.graph.features.length ||
                scan.instanceIndex + 1 <
                  (getModelComponentInstanceSlots(scan.meshes[scan.meshIndex - 1]!)?.length ?? 1))) ||
            scan.meshIndex < scan.meshes.length,
        );
      } else {
        timer = setTimeout(step, 0);
      }
    };
    timer = setTimeout(step, 0);
    return () => {
      if (observation) {
        observe({ terminalBranch: 'effect-cleanup' });
      }
      cancelled = true;
      clearTimeout(timer);
      if (graphicsActor.getSnapshot().context.measureMessage === preparingMessage) {
        graphicsActor.send({ type: 'setMeasureMessage' });
      }
    };
  }, [
    camera,
    describeTarget,
    getCachedLines,
    getCachedMeshes,
    graphClient,
    graphSource,
    gl.domElement,
    graphicsActor,
    isMeasureActive,
    measureCatalogRequest,
    measureFilter,
    measureMode,
    renderFrame,
  ]);

  useEffect(() => {
    const previous = hoverSourceRef.current;
    hoverSourceRef.current = {
      camera,
      cameraRevision,
      geometryKey,
      element: gl.domElement,
      isMeasureActive,
      modelDisplayRevision,
      pickableMeshesVersion,
      poseRevision,
      updatePointerSnapshot,
    };
    if (!isMeasureActive || !lastPointerRef.current) {
      return;
    }
    if (
      previous.camera === camera &&
      previous.cameraRevision === cameraRevision &&
      previous.geometryKey === geometryKey &&
      previous.element === gl.domElement &&
      previous.isMeasureActive === isMeasureActive &&
      previous.modelDisplayRevision === modelDisplayRevision &&
      previous.pickableMeshesVersion === pickableMeshesVersion &&
      previous.poseRevision === poseRevision &&
      previous.updatePointerSnapshot === updatePointerSnapshot
    ) {
      return;
    }
    updatePointerSnapshot(lastPointerRef.current);
  }, [
    camera,
    cameraRevision,
    geometryKey,
    gl.domElement,
    isMeasureActive,
    modelDisplayRevision,
    pickableMeshesVersion,
    poseRevision,
    updatePointerSnapshot,
  ]);

  useEffect(() => {
    if (!isMeasureActive || measureCommitRequest === handledCommitRequestRef.current) {
      return;
    }
    handledCommitRequestRef.current = measureCommitRequest;
    const entry = candidateReferences.current.get(chosenCandidateId ?? '');
    if (entry) {
      commitTarget({ hasTarget: true, hasActiveSnapTarget: true, point: entry.target.position, target: entry.target });
    }
  }, [chosenCandidateId, commitTarget, isMeasureActive, measureCommitRequest]);

  // A committed cut change (S adds a cut, Delete removes one) raycasts the resting pointer's snaps again. Subscribed
  // rather than selected, so a cut step renders nothing unless the snaps change.
  useEffect(() => {
    if (!isMeasureActive) {
      return undefined;
    }
    let cuts = graphicsActor.getSnapshot().context.committedSectionCuts;
    const subscription = graphicsActor.subscribe(({ context }) => {
      if (context.committedSectionCuts === cuts) {
        return;
      }
      cuts = context.committedSectionCuts;
      committedCutsRef.current = cuts;
      exactAbortRef.current?.abort();
      exactRequestRef.current++;
      if (
        context.currentMeasurementStart ??
        context.measurements.some(
          (measurement) =>
            measurement.anchors?.length && (measurement.status === 'current' || measurement.status === 'pending'),
        )
      ) {
        graphicsActor.send({ type: 'measurementCutChanged' });
        graphicsActor.send({ type: 'cancelCurrentMeasurement' });
      }
      selectedTargetRef.current = undefined;
      const hadCatalog = catalogReferences.current.size > 0 || catalogScanRef.current !== undefined;
      catalogReferences.current.clear();
      candidateReferences.current.clear();
      catalogVersionRef.current++;
      catalogScanRef.current = undefined;
      if (hadCatalog || Boolean(context.measureLockedTargetId) || Boolean(context.measureChosenCandidateId)) {
        graphicsActor.send({ type: 'setMeasureCandidates', candidates: [] });
      }
      if (lastPointerRef.current) {
        pointerMoveCoalescerRef.current?.schedule(lastPointerRef.current);
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [graphicsActor, isMeasureActive]);

  useEffect(() => {
    if (isMeasureActive && cameraMoving && !wasCameraMovingRef.current) {
      measureInputActor.send({ type: 'cameraMoved' });
    }

    wasCameraMovingRef.current = cameraMoving;
  }, [cameraMoving, isMeasureActive, measureInputActor]);

  // Handle mouse move for snapping
  useEffect(() => {
    // Only enable interactive listeners when measure mode is active
    if (!isMeasureActive) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent): void => {
      if (activePointerIdsRef.current.size > 1) {
        return;
      }
      lastPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
      pointerMoveCoalescerRef.current?.schedule(lastPointerRef.current);
    };

    const handlePointerDown = (event: PointerEvent): void => {
      activePointerIdsRef.current.add(event.pointerId);
      lastPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
      if (!lockedTargetIdRef.current && chosenCandidateIdRef.current) {
        chosenCandidateIdRef.current = undefined;
        graphicsActor.send({ type: 'clearMeasureChosenCandidate' });
      }
      if (activePointerIdsRef.current.size > 1) {
        measureInputActor.send({ type: 'cameraMoved' });
      }
      const pointerSnapshot = updatePointerSnapshot(
        {
          clientX: event.clientX,
          clientY: event.clientY,
        },
        event.pointerType === 'touch',
      );
      measureInputActor.send({
        type: 'pointerDown',
        button: event.button,
        hasTarget: pointerSnapshot.hasTarget || pointerSnapshot.hasActiveSnapTarget,
        cameraMoving,
        pointerId: event.pointerId,
        isPrimary: event.isPrimary && activePointerIdsRef.current.size === 1,
      });
    };

    const handlePointerUp = (event: PointerEvent): void => {
      activePointerIdsRef.current.delete(event.pointerId);
      lastPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
      const pointerSnapshot = updatePointerSnapshot(
        {
          clientX: event.clientX,
          clientY: event.clientY,
        },
        event.pointerType === 'touch',
      );
      const { hasActiveSnapTarget, hasTarget, point } = pointerSnapshot;
      const pointArray: [number, number, number] | undefined = point
        ? [...fromThreeRenderPoint({ renderFrame, point })]
        : undefined;
      const isZeroLength =
        pointArray !== undefined && currentStartRef.current !== undefined
          ? new THREE.Vector3(...currentStartRef.current).distanceTo(new THREE.Vector3(...pointArray)) === 0
          : false;

      measureInputActor.send({
        type: 'pointerUp',
        button: event.button,
        hasTarget,
        hasCurrentStart: Boolean(currentStartRef.current),
        isZeroLength,
        hasActiveSnapTarget,
        pointerId: event.pointerId,
      });

      const { result } = measureInputActor.getSnapshot().context;
      measureInputActor.send({ type: 'clearResult' });

      if (result === 'cancelCurrent') {
        graphicsActor.send({ type: 'cancelCurrentMeasurement' });
        selectedTargetRef.current = undefined;
        return;
      }

      if (event.pointerType === 'touch' && pointerSnapshot.target) {
        graphicsActor.send({ type: 'chooseMeasureCandidate', id: pointerSnapshot.target.id });
      }

      if (result !== 'acceptPoint' || !pointArray || event.pointerType === 'touch') {
        return;
      }
      commitTarget(pointerSnapshot);
    };

    const clearHover = (): void => {
      pointerMoveCoalescerRef.current?.cancel();
      lastPointerRef.current = undefined;
      hoverRef.current = noMeasureHover;
      dispatchHoverState({ type: 'clear' });
    };
    const handlePointerCancel = (event: PointerEvent): void => {
      activePointerIdsRef.current.delete(event.pointerId);
      measureInputActor.send({ type: 'pointerCancel', pointerId: event.pointerId });
      clearHover();
    };
    const handleWindowBlur = (): void => {
      activePointerIdsRef.current.clear();
      measureInputActor.send({ type: 'blur' });
      clearHover();
    };

    const handleContextMenu = (event: MouseEvent): void => {
      // Prevent context menu from showing during measurement
      event.preventDefault();
    };

    pointerTarget.addEventListener('pointermove', handlePointerMove);
    pointerTarget.addEventListener('pointerdown', handlePointerDown);
    pointerTarget.addEventListener('pointerup', handlePointerUp);
    pointerTarget.addEventListener('pointercancel', handlePointerCancel);
    pointerTarget.addEventListener('pointerleave', clearHover);
    window.addEventListener('blur', handleWindowBlur);
    pointerTarget.addEventListener('contextmenu', handleContextMenu);

    return () => {
      pointerTarget.removeEventListener('pointermove', handlePointerMove);
      pointerTarget.removeEventListener('pointerdown', handlePointerDown);
      pointerTarget.removeEventListener('pointerup', handlePointerUp);
      pointerTarget.removeEventListener('pointercancel', handlePointerCancel);
      pointerTarget.removeEventListener('pointerleave', clearHover);
      window.removeEventListener('blur', handleWindowBlur);
      pointerTarget.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [
    cameraMoving,
    commitTarget,
    pointerTarget,
    isMeasureActive,
    graphicsActor,
    measureInputActor,
    renderFrame,
    updatePointerSnapshot,
  ]);

  // Choose which measurements to display: all during measure mode, otherwise only pinned
  const visibleMeasurements = (isMeasureActive ? measurements : measurements.filter((m) => m.isPinned)).filter(
    (measurement) =>
      measurement.status !== 'pending' && measurement.status !== 'unavailable' && measurement.status !== 'out-of-date',
  );
  const labeledMeasurementId = visibleMeasurements.some((measurement) => measurement.id === hoveredMeasurementId)
    ? hoveredMeasurementId
    : visibleMeasurements.at(-1)?.id;

  // Memoize currentStart Vector3 to avoid per-render allocation
  const currentStartVec3 = useMemo(
    () => (currentStart ? toThreeRenderPoint({ renderFrame, pointMeters: currentStart }) : undefined),
    [currentStart, renderFrame],
  );
  // The current hit map is maintained by pointer events; these reads intentionally project that external viewer state.
  // oxlint-disable-next-line react/refs -- Candidate identity changes also dispatch hover state or graphics machine events.
  const chosenTarget = candidateReferences.current.get(lockedTargetId ?? explicitCandidateId ?? '')?.target;
  // oxlint-disable-next-line react/refs -- Candidate identity changes also dispatch hover state or graphics machine events.
  const activeSource = candidateReferences.current.get(
    lockedTargetId ?? explicitCandidateId ?? activeSnapPoint?.id ?? '',
  );
  const displayedTargets =
    chosenTarget && !hoveredSnapPoints.some((target) => target.id === chosenTarget.id)
      ? [chosenTarget, ...hoveredSnapPoints].slice(0, 5)
      : hoveredSnapPoints;

  return (
    <group>
      {isMeasureActive && activeSource ? <FeatureHighlight source={activeSource} /> : null}
      {/* Render snap point indicators */}
      {isMeasureActive
        ? displayedTargets.map((snapPoint) => {
            const key = `snap-${snapPoint.id}`;
            return (
              <SnapPointIndicator
                key={key}
                position={snapPoint.position}
                kind={snapPoint.kind}
                isActive={snapPoint.id === (lockedTargetId ?? explicitCandidateId ?? activeSnapPoint?.id)}
                camera={camera}
              />
            );
          })
        : null}

      {/* Persistent indicator for the selected start point */}
      {isMeasureActive && currentStartVec3 ? (
        <SnapPointIndicator isActive kind='endpoint' position={currentStartVec3} camera={camera} />
      ) : null}

      {/* Render preview line */}
      {isMeasureActive && currentStartVec3 && mousePosition ? (
        <MeasurementLine isPreview start={currentStartVec3} end={mousePosition} />
      ) : null}

      {/* Render completed measurements */}
      {visibleMeasurements.map((measurement) => (
        <MeasurementLine
          key={measurement.id}
          id={measurement.id}
          start={toThreeRenderPoint({
            renderFrame,
            pointMeters: measurement.startPoint,
          })}
          end={toThreeRenderPoint({
            renderFrame,
            pointMeters: measurement.endPoint,
          })}
          distance={measurement.distance}
          metersPerDisplayUnit={measurement.operation === 'angle' ? Math.PI / 180 : metersPerDisplayUnit}
          lengthSymbol={measurement.operation === 'angle' ? '°' : lengthSymbol}
          shouldShowLabel={measurement.id === labeledMeasurementId}
          isExternallyHovered={hoveredMeasurementId === measurement.id}
          isPinned={Boolean(measurement.isPinned)}
        />
      ))}
    </group>
  );
}

function FeatureHighlight({
  source,
}: Readonly<{
  source: { target: MeasurementTarget; mesh: THREE.Object3D & { geometry: THREE.BufferGeometry } };
}>): React.JSX.Element | undefined {
  const { target, mesh } = source;
  const group = useMemo(() => {
    const highlighted = new THREE.Group();
    highlighted.userData = sceneTagData(sceneTag.measurementUi);
    const sourceMesh = measurementSourceMesh(mesh, target.instanceId);
    const graph =
      mesh.userData['measurementFeatures']?.kind === 'line'
        ? getLineMeasurementFeatures(mesh)
        : sourceMesh && getCachedMeshMeasurementFeatures(sourceMesh);
    const worldMatrix = getMeasurementTargetWorldMatrix(target, new THREE.Matrix4());
    if (!worldMatrix) {
      return highlighted;
    }
    const paths =
      target.feature.kind === 'edge' || target.feature.kind === 'circle'
        ? [target.feature]
        : target.feature.kind === 'face'
          ? (graph?.features ?? []).filter(
              (feature) =>
                target.feature.kind === 'face' &&
                target.feature.loopIds.includes(feature.id) &&
                (feature.kind === 'edge' || feature.kind === 'circle'),
            )
          : [];
    for (const path of paths) {
      if (path.kind !== 'edge' && path.kind !== 'circle') {
        continue;
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(
        path.points.map((point) => point.clone().applyMatrix4(worldMatrix)),
      );
      const material = new THREE.LineBasicMaterial({
        // oxlint-disable-next-line tau-lint/no-hardcoded-color -- Viewport selection highlight follows existing measure green.
        color: 0x00_ff_00,
        depthTest: false,
        depthWrite: false,
      });
      highlighted.add(
        path.kind === 'circle' || path.closed
          ? new THREE.LineLoop(geometry, material)
          : new THREE.Line(geometry, material),
      );
    }
    if (target.feature.kind === 'body') {
      const helper = new THREE.Box3Helper(
        new THREE.Box3().setFromPoints(target.feature.points.map((point) => point.clone().applyMatrix4(worldMatrix))),
        0x00_ff_00,
      );
      highlighted.add(helper);
    }
    return highlighted;
  }, [mesh, target.feature, target.instanceId]);
  useEffect(
    () => () => {
      group.traverse((object) => {
        if (object instanceof THREE.Line) {
          const line = object as THREE.Line;
          line.geometry.dispose();
          const materials: THREE.Material[] = Array.isArray(line.material) ? line.material : [line.material];
          for (const material of materials) {
            material.dispose();
          }
        }
      });
    },
    [group],
  );
  return <primitive object={group} />;
}

type SnapPointIndicatorProps = {
  readonly position: THREE.Vector3;
  readonly kind: MeasurementTarget['kind'];
  // Indicates hovered/selected state for color
  readonly isActive: boolean;
  readonly camera: THREE.Camera;
};

function SnapPointIndicator({ position, kind, isActive, camera }: SnapPointIndicatorProps): React.JSX.Element {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);

  const borderSize = isActive ? 0.05 : 0.04;
  const innerSize = isActive ? 0.04 : 0.03;
  const height = 0.05;
  const segments = kind === 'midpoint' || kind === 'edge' ? 4 : kind === 'face' || kind === 'body' ? 6 : 32;

  useFrame(() => {
    const scale = calculateScaleFromCamera(position, camera);

    // Face camera -- reuse module-scope scratch objects
    _snapDirection.subVectors(camera.position, position).normalize();
    _snapQuaternion.setFromUnitVectors(_snapUp.set(0, 1, 0), _snapDirection);

    if (outerRef.current) {
      outerRef.current.quaternion.copy(_snapQuaternion);
      outerRef.current.scale.set(scale * 500, scale * 500, scale * 500);
    }

    if (innerRef.current) {
      if (kind === 'center' || kind === 'centroid') {
        innerRef.current.quaternion.setFromUnitVectors(_snapForward, _snapDirection);
      } else {
        innerRef.current.quaternion.copy(_snapQuaternion);
      }
      innerRef.current.scale.set(scale * 500, scale * 500, scale * 500);
    }
  });

  return (
    <group renderOrder={isActive ? 10 : 0}>
      {/* Outer border (black) */}
      <mesh
        ref={outerRef}
        position={position}
        renderOrder={isActive ? 2 : 1}
        userData={sceneTagData(sceneTag.measurementUi)}
      >
        <cylinderGeometry args={[borderSize, borderSize, height, segments]} />
        <meshMatcapMaterial
          transparent
          // oxlint-disable-next-line tau-lint/no-hardcoded-color -- Three.js material color
          color='#000000'
          opacity={1}
          depthTest={false}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Inner fill (white or green when active/hovered/selected) */}
      <mesh
        ref={innerRef}
        position={position}
        // Ensure the hover/selected indicator is rendered on top of other indicators
        renderOrder={isActive ? 2 : 1}
        userData={sceneTagData(sceneTag.measurementUi)}
      >
        {kind === 'center' || kind === 'centroid' ? (
          <torusGeometry args={[innerSize, Math.max(0.004, innerSize / 5), 8, 32]} />
        ) : (
          <cylinderGeometry args={[innerSize, innerSize, height, segments]} />
        )}
        <meshBasicMaterial
          transparent
          toneMapped={false}
          fog={false}
          // oxlint-disable-next-line tau-lint/no-hardcoded-color -- Three.js material color
          color={isActive ? '#00ff00' : '#ffffff'}
          opacity={1}
          depthTest={false}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

type MeasurementLineProps = {
  readonly id?: string;
  readonly start: THREE.Vector3 | readonly [number, number, number];
  readonly end: THREE.Vector3 | readonly [number, number, number];
  readonly distance?: number;
  readonly metersPerDisplayUnit?: number;
  readonly lengthSymbol?: string;
  readonly isPreview?: boolean;
  readonly shouldShowLabel?: boolean;
  readonly isExternallyHovered?: boolean;
  readonly isPinned?: boolean;
  readonly coneHeight?: number; // Base cone height in scene units
  readonly coneRadius?: number; // Base cone radius in scene units
  readonly cylinderRadius?: number; // Base cylinder radius in scene units
  // Text sizing
  readonly textSize?: number;
  readonly textDepth?: number;
  // Label/background sizing
  readonly labelHeight?: number;
  readonly labelPadding?: number;
  readonly labelCornerRadius?: number;
  readonly labelDepth?: number;
  readonly labelCharWidth?: number;
  // Formatting and behavior
  readonly decimals?: number;
  readonly enableUnits?: boolean;
  readonly materials?:
    | {
        readonly backgroundMaterial: THREE.Material;
        readonly textMaterial: THREE.Material;
        readonly coneMaterial: THREE.Material;
      }
    | {
        readonly backgroundColor: THREE.Color;
        readonly textColor: THREE.Color;
        readonly coneColor: THREE.Color;
      };
};

function MeasurementLine({
  id,
  start,
  end,
  distance,
  metersPerDisplayUnit = 1,
  lengthSymbol = 'mm',
  isPreview = false,
  shouldShowLabel = true,
  isExternallyHovered = false,
  isPinned = false,
  coneHeight = 80,
  coneRadius = 10,
  cylinderRadius = 2,
  textSize = 40,
  textDepth = 2,
  labelHeight = 80,
  labelPadding = 50,
  labelCornerRadius = 20,
  labelDepth = 1,
  labelCharWidth = 24,
  decimals = 1,
  enableUnits = true,
  materials,
}: MeasurementLineProps): React.JSX.Element {
  const { camera } = useThree();

  // Memoize Vector3 conversion so tuples from state don't allocate per render
  const startVec = useMemo(() => (start instanceof THREE.Vector3 ? start : new THREE.Vector3(...start)), [start]);
  const endVec = useMemo(() => (end instanceof THREE.Vector3 ? end : new THREE.Vector3(...end)), [end]);

  const labelGroupRef = useRef<THREE.Group>(null);
  const lineGroupRef = useRef<THREE.Group>(null);
  const cylinderMeshRef = useRef<THREE.Mesh>(null);
  const startConeMeshRef = useRef<THREE.Mesh>(null);
  const endConeMeshRef = useRef<THREE.Mesh>(null);
  const [isLabelHovered, setIsLabelHovered] = useState(false);
  const isHovered = isLabelHovered || isExternallyHovered;
  const graphicsActor = useGraphics();

  // Matcap materials for the line, cones and label.
  // Split into base materials (created once) and hover color update (cheap, per-hover).
  const derivedMaterials = useMemo(() => {
    if (materials && 'backgroundMaterial' in materials && 'textMaterial' in materials && 'coneMaterial' in materials) {
      return {
        backgroundMaterial: materials.backgroundMaterial,
        textMaterial: materials.textMaterial,
        coneMaterial: materials.coneMaterial,
      };
    }

    const matcapTexture = matcapMaterial();

    const baseMaterial = new THREE.MeshMatcapMaterial({
      matcap: matcapTexture,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });
    const basicMaterial = new THREE.MeshBasicMaterial({
      color: materials?.backgroundColor ?? 0xff_ff_ff, // White
      depthTest: false,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });

    const backgroundMaterial = basicMaterial.clone();
    backgroundMaterial.color.set(materials?.backgroundColor ?? 0xff_ff_ff); // White

    const textMaterial = baseMaterial.clone();
    textMaterial.color.set(materials?.textColor ?? 0x00_00_00); // Black

    const coneMaterial = baseMaterial.clone();
    coneMaterial.color.set(materials?.coneColor ?? 0x00_00_00);

    return { backgroundMaterial, textMaterial, coneMaterial };
  }, [materials]);

  // Memoize pin button matcap texture to avoid per-render texture creation
  const pinMatcapTexture = useMemo(() => matcapMaterial(), []);

  // Update cone color on hover without recreating all materials
  useEffect(() => {
    if (materials && 'coneMaterial' in materials) {
      return; // Externally provided materials manage their own color
    }

    const coneColor = isHovered ? 0x00_ff_00 : materials && 'coneColor' in materials ? materials.coneColor : 0x00_00_00;
    (derivedMaterials.coneMaterial as THREE.MeshMatcapMaterial).color.set(coneColor);
  }, [isHovered, derivedMaterials, materials]);

  // Calculate label position (midpoint)
  const midpoint = useMemo(
    () => new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5),
    [startVec, endVec],
  );

  // Calculate distance if not provided
  const calculatedDistance = distance ?? startVec.distanceTo(endVec);
  const distanceInDisplayUnits = calculatedDistance / metersPerDisplayUnit;
  const numericText =
    distanceInDisplayUnits !== 0 && Math.abs(distanceInDisplayUnits) < 0.5 * 10 ** -decimals
      ? distanceInDisplayUnits.toPrecision(3)
      : distanceInDisplayUnits.toFixed(decimals);
  const unitsText = enableUnits ? lengthSymbol : '';
  const labelText = `${numericText}${enableUnits ? ` ${unitsText}` : ''}`;

  // Keep a constant width box reserved for the units portion of the label background
  const unitContainerChars = 3; // Reserve width for up to 3-char units
  const backgroundCharsLength = numericText.length + (enableUnits ? 1 + unitContainerChars : 0);
  const backgroundPlaceholderText = '0'.repeat(Math.max(1, backgroundCharsLength));

  // Memoize geometries to avoid re-creating large buffers every render frame
  const textGeometry = useMemo(
    () =>
      isPreview || !shouldShowLabel
        ? undefined
        : createLabelTextGeometry({ text: labelText, size: textSize, depth: textDepth }),
    [isPreview, labelText, shouldShowLabel, textSize, textDepth],
  );

  const backgroundGeometry = useMemo(
    () =>
      isPreview || !shouldShowLabel
        ? undefined
        : createLabelBackgroundGeometry({
            // Use placeholder string sized to reserve constant-width units area
            text: backgroundPlaceholderText,
            characterWidth: labelCharWidth,
            padding: labelPadding,
            height: labelHeight,
            radius: labelCornerRadius,
            depth: labelDepth,
          }),
    [
      backgroundPlaceholderText,
      isPreview,
      shouldShowLabel,
      labelCharWidth,
      labelPadding,
      labelHeight,
      labelCornerRadius,
      labelDepth,
    ],
  );

  const backgroundOutlineGeometry = useMemo(
    () =>
      isPreview || !shouldShowLabel
        ? undefined
        : createLabelBackgroundGeometry({
            text: backgroundPlaceholderText,
            characterWidth: labelCharWidth,
            padding: labelPadding + 5,
            height: labelHeight + 10,
            radius: labelCornerRadius + 5,
            depth: labelDepth,
          }),
    [
      backgroundPlaceholderText,
      isPreview,
      shouldShowLabel,
      labelCharWidth,
      labelPadding,
      labelHeight,
      labelCornerRadius,
      labelDepth,
    ],
  );

  useEffect(
    () => () => {
      textGeometry?.dispose();
      backgroundGeometry?.dispose();
      backgroundOutlineGeometry?.dispose();
    },
    [backgroundGeometry, backgroundOutlineGeometry, textGeometry],
  );

  useEffect(
    () => () => {
      if (materials && 'backgroundMaterial' in materials) {
        return;
      }
      derivedMaterials.backgroundMaterial.dispose();
      derivedMaterials.textMaterial.dispose();
      derivedMaterials.coneMaterial.dispose();
    },
    [derivedMaterials, materials],
  );

  // Track current scale for UI sizing
  const scaleRef = useRef<number>(1);

  // Memoize measurement line direction and quaternions to avoid per-render allocations
  const lineDirection = useMemo(() => new THREE.Vector3().subVectors(endVec, startVec).normalize(), [startVec, endVec]);
  const lineDistance = useMemo(() => startVec.distanceTo(endVec), [startVec, endVec]);

  // Billboard behavior - rotate around line axis to face camera
  // All scratch objects are module-scoped to avoid per-frame GC pressure.
  useFrame(() => {
    const scale = calculateScaleFromCamera(midpoint, camera);
    scaleRef.current = scale;

    // Scale and orient label group
    if (labelGroupRef.current) {
      // 1) Establish base orientation: align X-axis with the measurement line
      _baseQuat.setFromUnitVectors(_currentNormal.set(1, 0, 0), lineDirection);

      // 2) Compute rotation around the line axis so the label's normal faces the camera
      _currentNormal.set(0, 0, 1).applyQuaternion(_baseQuat);
      const projectedAxisLength = computeAxisRotationForCamera({
        axis: lineDirection,
        position: midpoint,
        camera,
        referenceUp: _currentNormal,
        target: _axisRotation,
      });

      // A line aimed toward the eye has too little screen-space length for a
      // legible label. Separate hide/show angles avoid flicker at the cutoff.
      const labelVisible = projectedAxisLength >= (labelGroupRef.current.visible ? 0.5 : 0.55);
      if (!labelVisible && labelGroupRef.current.visible && isLabelHovered) {
        setIsLabelHovered(false);
        if (id && graphicsActor.getSnapshot().context.hoveredMeasurementId === id) {
          graphicsActor.send({ type: 'setHoveredMeasurement', payload: undefined });
        }
      }
      labelGroupRef.current.visible = labelVisible;

      // 3) Combine rotations: base alignment then axis rotation in world space
      _finalQuat.multiplyQuaternions(_axisRotation, _baseQuat);

      // 4) Ensure text is upright relative to the camera
      _labelNormal.set(0, 0, 1).applyQuaternion(_finalQuat).normalize();
      _labelUp.set(0, 1, 0).applyQuaternion(_finalQuat).normalize();

      _cameraUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      _cameraUpProjected.copy(_cameraUp).addScaledVector(_labelNormal, -_cameraUp.dot(_labelNormal)).normalize();

      if (_labelUp.dot(_cameraUpProjected) < 0) {
        // Flip around the label's normal so it stays facing the camera
        _flipQuat.setFromAxisAngle(_labelNormal, Math.PI);
        _finalQuat.copy(_axisRotation.multiplyQuaternions(_flipQuat, _finalQuat));
      }

      labelGroupRef.current.quaternion.copy(_finalQuat);
      // Enlarge label by 20% when hovered (from UI or viewport)
      labelGroupRef.current.scale.setScalar(scale * (isHovered ? 1.2 : 1));
      labelGroupRef.current.position.copy(midpoint);
    }

    // Dynamically size cylinder and cones using transform scaling with unit geometries
    _lineDir.subVectors(endVec, startVec).normalize();

    // Derive UI dimensions from scale using component props
    const coneHeightScaled = coneHeight * scale; // Height of arrow heads
    const coneRadiusScaled = coneRadius * scale; // Radius of arrow heads
    const cylinderRadiusScaled = cylinderRadius * scale; // Thickness of the line

    const effectiveCone = isPreview ? 0 : coneHeightScaled;
    const cylinderHeight = Math.max(0.0001, lineDistance - 2 * effectiveCone);

    if (cylinderMeshRef.current) {
      cylinderMeshRef.current.scale.set(cylinderRadiusScaled, cylinderHeight, cylinderRadiusScaled);
    }

    _coneOffset.copy(_lineDir).multiplyScalar(coneHeightScaled / 2);
    if (startConeMeshRef.current) {
      startConeMeshRef.current.scale.set(coneRadiusScaled, coneHeightScaled, coneRadiusScaled);
      startConeMeshRef.current.position.copy(startVec).add(_coneOffset);
    }

    if (endConeMeshRef.current) {
      endConeMeshRef.current.scale.set(coneRadiusScaled, coneHeightScaled, coneRadiusScaled);
      endConeMeshRef.current.position.copy(endVec).sub(_coneOffset);
    }
  });

  // Memoize direction, distance, and quaternions for cylinder/cone rotation
  const { startQuaternion, endQuaternion, cylinderQuaternion } = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0);
    const startQ = new THREE.Quaternion().setFromUnitVectors(up, lineDirection.clone().negate());
    const endQ = new THREE.Quaternion().setFromUnitVectors(up, lineDirection);
    const cylinderQ = new THREE.Quaternion().setFromUnitVectors(up, lineDirection);
    return {
      startQuaternion: startQ,
      endQuaternion: endQ,
      cylinderQuaternion: cylinderQ,
    };
  }, [lineDirection]);

  return (
    <group>
      {/* Line group with scaling for cylinders and cones */}
      <group ref={lineGroupRef} renderOrder={1}>
        {/* Cylinder line */}
        <mesh
          ref={cylinderMeshRef}
          position={midpoint}
          quaternion={cylinderQuaternion}
          userData={sceneTagData(sceneTag.measurementUi)}
        >
          {/* Unit geometry – scaled per-frame */}
          <cylinderGeometry args={[1, 1, 1, 16]} />
          <primitive object={derivedMaterials.coneMaterial} attach='material' />
        </mesh>

        {/* Cone at start */}
        {!isPreview && (
          <mesh
            ref={startConeMeshRef}
            position={start}
            quaternion={startQuaternion}
            userData={sceneTagData(sceneTag.measurementUi)}
          >
            {/* Unit geometry – scaled per-frame */}
            <coneGeometry args={[1, 1, 16]} />
            <primitive object={derivedMaterials.coneMaterial} attach='material' />
          </mesh>
        )}

        {/* Cone at end */}
        {!isPreview && (
          <mesh
            ref={endConeMeshRef}
            position={end}
            quaternion={endQuaternion}
            userData={sceneTagData(sceneTag.measurementUi)}
          >
            {/* Unit geometry – scaled per-frame */}
            <coneGeometry args={[1, 1, 16]} />
            <primitive object={derivedMaterials.coneMaterial} attach='material' />
          </mesh>
        )}
      </group>

      {/* Label */}
      {!isPreview && shouldShowLabel && (
        <group ref={labelGroupRef} renderOrder={2} position={midpoint} rotation={[0, 0, 0]}>
          {/* Stable invisible hit area to prevent hover flicker when pin appears */}
          <mesh
            position={[0, 0, 0]}
            userData={sceneTagData(sceneTag.measurementUi)}
            raycast={raycastVisibleLabel}
            onPointerEnter={(event) => {
              event.stopPropagation();
              setIsLabelHovered(true);
              if (id) {
                graphicsActor.send({
                  type: 'setHoveredMeasurement',
                  payload: id,
                });
              }
            }}
            onPointerLeave={(event) => {
              event.stopPropagation();
              setIsLabelHovered(false);
              graphicsActor.send({
                type: 'setHoveredMeasurement',
                payload: undefined,
              });
            }}
          >
            {(() => {
              const totalChars = backgroundPlaceholderText.length;
              const baseWidth = totalChars * labelCharWidth + 2 * labelPadding;
              const buttonDiameter = 2 * labelCharWidth;
              const hitWidth = baseWidth + buttonDiameter + Math.max(5, labelPadding * 0.2);
              const hitHeight = labelHeight + 2 * labelPadding;
              return (
                <>
                  <planeGeometry args={[hitWidth, hitHeight]} />
                  <meshBasicMaterial
                    transparent
                    opacity={0}
                    depthTest={false}
                    depthWrite={false}
                    side={THREE.DoubleSide}
                  />
                </>
              );
            })()}
          </mesh>
          {/* Background */}
          <mesh position={[0, 0, 0]} userData={sceneTagData(sceneTag.measurementUi)} raycast={raycastVisibleLabel}>
            <primitive object={backgroundOutlineGeometry!} attach='geometry' />
            <primitive object={derivedMaterials.textMaterial} attach='material' />
          </mesh>
          <mesh position={[0, 0, 0]} userData={sceneTagData(sceneTag.measurementUi)} raycast={raycastVisibleLabel}>
            <primitive object={backgroundGeometry!} attach='geometry' />
            <primitive object={derivedMaterials.backgroundMaterial} attach='material' />
          </mesh>

          {/* Text */}
          <mesh position={[0, 0, 0]} userData={sceneTagData(sceneTag.measurementUi)} raycast={raycastVisibleLabel}>
            <primitive object={textGeometry!} attach='geometry' />
            <primitive object={derivedMaterials.textMaterial} attach='material' />
          </mesh>

          {/* Pin button in top-right over label */}
          {id && isHovered ? (
            <group
              position={(() => {
                // Compute approximate background width from placeholder and char width/padding
                const totalChars = backgroundPlaceholderText.length;
                const width = totalChars * labelCharWidth + 2 * labelPadding;
                const buttonDiameter = 2 * labelCharWidth; // 2 characters width
                const offsetX = width / 2 - buttonDiameter / 2 - Math.max(5, labelPadding * 0.2);
                const offsetY = 0; // Vertically centered
                return [offsetX, offsetY, 0];
              })()}
              renderOrder={3}
              userData={sceneTagData(sceneTag.measurementUi)}
            >
              {/* Yellow/gold circular pin button (appears only on label hover) */}
              <mesh
                userData={sceneTagData(sceneTag.measurementUi)}
                raycast={raycastVisibleLabel}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  // Keep hover state active when over pin button
                  setIsLabelHovered(true);
                  if (id) {
                    graphicsActor.send({
                      type: 'setHoveredMeasurement',
                      payload: id,
                    });
                  }
                }}
                onPointerOut={(event) => {
                  event.stopPropagation();
                  // Don't clear hover immediately - let the label group handle it
                }}
                onPointerDown={(event) => {
                  if (event.nativeEvent.button === 0 && id) {
                    graphicsActor.send({ type: 'toggleMeasurementPinned', id });
                  }

                  event.stopPropagation();
                }}
              >
                <circleGeometry args={[labelCharWidth, 48]} />
                <meshMatcapMaterial
                  color={isPinned ? 0xff_d7_00 : 0xff_ff_99}
                  opacity={1}
                  depthTest={false}
                  depthWrite={false}
                  side={THREE.DoubleSide}
                  fog={false}
                  toneMapped={false}
                  matcap={pinMatcapTexture}
                  transparent={false}
                />
              </mesh>

              {/* Pin glyph using simple geometry */}
              <mesh
                position={[0, labelCharWidth * 0.15, 0]}
                userData={sceneTagData(sceneTag.measurementUi)}
                raycast={raycastVisibleLabel}
                onPointerOver={(event) => {
                  event.stopPropagation();
                }}
                onPointerOut={(event) => {
                  event.stopPropagation();
                }}
              >
                <cylinderGeometry args={[labelCharWidth * 0.12, labelCharWidth * 0.12, labelCharWidth * 0.4, 16]} />
                <primitive object={derivedMaterials.textMaterial} attach='material' />
              </mesh>
              <mesh
                position={[0, -labelCharWidth * 0.2, 0]}
                userData={sceneTagData(sceneTag.measurementUi)}
                raycast={raycastVisibleLabel}
                onPointerOver={(event) => {
                  event.stopPropagation();
                }}
                onPointerOut={(event) => {
                  event.stopPropagation();
                }}
              >
                <coneGeometry args={[labelCharWidth * 0.15, labelCharWidth * 0.35, 16]} />
                <primitive object={derivedMaterials.textMaterial} attach='material' />
              </mesh>
            </group>
          ) : null}
        </group>
      )}
    </group>
  );
}
