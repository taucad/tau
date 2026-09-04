/* oxlint-disable complexity -- Label/line sizing and camera-facing math in a single component */
import { useEffect, useRef, useState, useMemo, useCallback, useReducer, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { createActor } from 'xstate';
import { fromThreeRenderPoint, toThreeRenderPoint } from '@taucad/three/spatial';
import {
  LabelTextGeometry,
  LabelBackgroundGeometry,
} from '#components/geometry/graphics/three/geometries/label-geometry.js';
import {
  detectSnapPoints,
  findClosestSnapPoint,
} from '#components/geometry/graphics/three/utils/snap-detection.utils.js';
import type { SnapPoint } from '#components/geometry/graphics/three/utils/snap-detection.utils.js';
import { computeAxisRotationForCamera } from '#components/geometry/graphics/three/utils/rotation.utils.js';
import { matcapMaterial } from '#components/geometry/graphics/three/materials/matcap-material.js';
import {
  sceneTag,
  sceneTagData,
  hasSceneTagInHierarchy,
} from '#components/geometry/graphics/three/utils/scene-tags.js';
import type { SceneTagKey } from '#components/geometry/graphics/three/utils/scene-tags.js';
import { useGraphics, useGraphicsSelector, useModelInteractionSelector, useRenderFrame } from '#hooks/use-graphics.js';
import { createRafCoalescer } from '#components/geometry/graphics/three/utils/raf-coalescer.js';
import type { RafCoalescer } from '#components/geometry/graphics/three/utils/raf-coalescer.js';
import { raycastFirstVisibleMeshHit } from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import type { RaycastClipState } from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import {
  createSectionViewRaycastClipState,
  useSectionView,
} from '#components/geometry/graphics/three/use-section-view.js';
import { measureInputMachine } from '#machines/measure-input.machine.js';

const measurementPickBlockingSceneTags = new Set<SceneTagKey>([sceneTag.measurementUi, sceneTag.sectionViewHelper]);

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

  const size = 1; // Base size (equivalent to this.size in transform-controls)
  return (factor * size) / 4000;
}

// ── Module-scope scratch objects for useFrame callbacks (avoids per-frame GC pressure) ──

// SnapPointIndicator scratch
const _snapDirection = new THREE.Vector3();
const _snapQuaternion = new THREE.Quaternion();
const _snapUp = new THREE.Vector3(0, 1, 0);

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

type MeasureHoverState = {
  hoveredSnapPoints: SnapPoint[];
  activeSnapPoint?: SnapPoint;
  mousePosition?: THREE.Vector3;
};

type MeasureHoverAction =
  | {
      type: 'set';
      hoveredSnapPoints: SnapPoint[];
      activeSnapPoint?: SnapPoint;
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

type MeasurePointerCoordinates = {
  readonly clientX: number;
  readonly clientY: number;
};

type MeasurePointerSnapshot = {
  readonly hasTarget: boolean;
  readonly hasActiveSnapTarget: boolean;
  readonly point?: THREE.Vector3;
};

export function MeasureTool(): React.JSX.Element {
  const { camera, gl, scene, invalidate } = useThree();
  const graphicsActor = useGraphics();
  const renderFrame = useRenderFrame();
  const sectionView = useSectionView();
  const geometryKey = useGraphicsSelector((state) => state.context.geometryKey);
  const pickableMeshesVersion = useGraphicsSelector((state) => state.context.pickableMeshesVersion);
  const modelDisplayRevision = useModelInteractionSelector((state) => state.context.displayRevision);
  const measurements = useGraphicsSelector((state) => state.context.measurements);
  const currentStart = useGraphicsSelector((state) => state.context.currentMeasurementStart);
  const snapDistance = useGraphicsSelector((state) => state.context.measureSnapDistance);
  const metersPerDisplayUnit = useGraphicsSelector((state) => state.context.displayUnits.length.metersPerUnit);
  const lengthSymbol = useGraphicsSelector((state) => state.context.displayUnits.length.symbol);
  const hoveredMeasurementId = useGraphicsSelector((state) => state.context.hoveredMeasurementId);
  const isMeasureActive = useGraphicsSelector((state) => state.context.isMeasureActive);
  const cameraInteracting = useGraphicsSelector((state) => state.context.cameraInteracting);

  const [{ hoveredSnapPoints, activeSnapPoint, mousePosition }, dispatchHoverState] = useReducer(measureHoverReducer, {
    hoveredSnapPoints: [],
    activeSnapPoint: undefined,
    mousePosition: undefined,
  });
  const lastSnapPointsRef = useRef<SnapPoint[] | undefined>(undefined);

  const currentStartRef = useRef(currentStart);

  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const measureInputActor = useMemo(() => createActor(measureInputMachine), []);
  const raycastClipState = useMemo<RaycastClipState | undefined>(() => {
    return createSectionViewRaycastClipState(sectionView);
  }, [sectionView.enableMesh, sectionView.isActive, sectionView.plane]);
  const pointerMoveCoalescerRef = useRef<RafCoalescer<MeasurePointerCoordinates> | undefined>(undefined);
  const wasCameraInteractingRef = useRef(cameraInteracting);

  // Cache mesh list to avoid expensive scene.traverse() on every mouse event.
  // Invalidated when geometry or component display changes.
  const cachedMeshesRef = useRef<THREE.Mesh[]>([]);
  const cachedMeshKeyRef = useRef<string | undefined>(undefined);
  // Keep scene ref in sync for getCachedMeshes (stable callback reference)
  const sceneRef = useRef(scene);
  const geometryKeyRef = useRef(geometryKey);
  const pickableMeshesVersionRef = useRef(pickableMeshesVersion);
  const modelDisplayRevisionRef = useRef(modelDisplayRevision);
  useLayoutEffect(() => {
    currentStartRef.current = currentStart;
    sceneRef.current = scene;
    geometryKeyRef.current = geometryKey;
    pickableMeshesVersionRef.current = pickableMeshesVersion;
    modelDisplayRevisionRef.current = modelDisplayRevision;
  }, [currentStart, geometryKey, modelDisplayRevision, pickableMeshesVersion, scene]);

  // Cache detectSnapPoints results keyed by (mesh.id, faceIndex) to avoid
  // running the expensive geometry pipeline on every mouse move over the same face.
  const snapCacheRef = useRef(new Map<string, SnapPoint[]>());

  const getCachedMeshes = useRef((): THREE.Mesh[] => {
    const currentKey = `${geometryKeyRef.current}:${pickableMeshesVersionRef.current}:${modelDisplayRevisionRef.current}`;
    if (currentKey === cachedMeshKeyRef.current) {
      return cachedMeshesRef.current;
    }

    const meshes: THREE.Mesh[] = [];
    sceneRef.current.traverse((object) => {
      if (
        object instanceof THREE.Mesh &&
        object.visible &&
        !hasSceneTagInHierarchy(object, measurementPickBlockingSceneTags)
      ) {
        meshes.push(object as THREE.Mesh);
      }
    });
    cachedMeshesRef.current = meshes;
    cachedMeshKeyRef.current = currentKey;
    // Invalidate snap point cache when geometry changes
    snapCacheRef.current.clear();
    return meshes;
  }).current;

  useEffect(() => {
    measureInputActor.start();
    return () => {
      measureInputActor.stop();
    };
  }, [measureInputActor]);

  const updatePointerSnapshot = useCallback(
    ({ clientX, clientY }: MeasurePointerCoordinates): MeasurePointerSnapshot => {
      const rect = gl.domElement.getBoundingClientRect();
      mouseRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      const firstIntersection = raycastFirstVisibleMeshHit({
        raycaster: raycasterRef.current,
        meshes: getCachedMeshes(),
        clipping: raycastClipState,
      });

      let allSnapPoints: SnapPoint[] = [];
      if (firstIntersection?.object) {
        const topMesh = firstIntersection.object;
        const cacheKey = `${topMesh.id}:${firstIntersection.faceIndex ?? -1}`;
        const cached = snapCacheRef.current.get(cacheKey);
        if (cached) {
          allSnapPoints = cached;
        } else {
          allSnapPoints = detectSnapPoints(topMesh, firstIntersection);
          snapCacheRef.current.set(cacheKey, allSnapPoints);
        }

        lastSnapPointsRef.current = allSnapPoints;
      } else {
        lastSnapPointsRef.current = undefined;
      }

      const closest = findClosestSnapPoint(allSnapPoints, {
        mousePos: mouseRef.current,
        camera,
        canvas: gl.domElement,
        snapDistancePx: snapDistance,
        snapPointBufferPx: 15,
      });
      const nextMousePosition = closest?.position ?? firstIntersection?.point;

      dispatchHoverState({
        type: 'set',
        hoveredSnapPoints: allSnapPoints,
        activeSnapPoint: closest,
        mousePosition: nextMousePosition,
      });
      invalidate();

      return {
        hasTarget: Boolean(firstIntersection),
        hasActiveSnapTarget: Boolean(closest),
        point: closest?.position ?? firstIntersection?.point,
      };
    },
    [camera, getCachedMeshes, gl.domElement, invalidate, raycastClipState, snapDistance],
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
    if (!isMeasureActive) {
      pointerMoveCoalescerRef.current?.cancel();
      dispatchHoverState({ type: 'clear' });
      lastSnapPointsRef.current = undefined;
    }
  }, [isMeasureActive]);

  useEffect(() => {
    if (isMeasureActive && cameraInteracting && !wasCameraInteractingRef.current) {
      measureInputActor.send({ type: 'cameraInteractionStart' });
    }

    wasCameraInteractingRef.current = cameraInteracting;
  }, [cameraInteracting, isMeasureActive, measureInputActor]);

  // Handle mouse move for snapping
  useEffect(() => {
    // Only enable interactive listeners when measure mode is active
    if (!isMeasureActive) {
      return undefined;
    }

    const handleMouseMove = (event: MouseEvent): void => {
      pointerMoveCoalescerRef.current?.schedule({
        clientX: event.clientX,
        clientY: event.clientY,
      });
    };

    const handlePointerDown = (event: MouseEvent): void => {
      const pointerSnapshot = updatePointerSnapshot({
        clientX: event.clientX,
        clientY: event.clientY,
      });
      measureInputActor.send({
        type: 'pointerDown',
        button: event.button,
        hasTarget: pointerSnapshot.hasTarget || pointerSnapshot.hasActiveSnapTarget,
        cameraInteracting,
      });
    };

    const handlePointerUp = (event: MouseEvent): void => {
      const pointerSnapshot = updatePointerSnapshot({
        clientX: event.clientX,
        clientY: event.clientY,
      });
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
      });

      const { result } = measureInputActor.getSnapshot().context;
      measureInputActor.send({ type: 'clearResult' });

      if (result === 'cancelCurrent') {
        graphicsActor.send({ type: 'cancelCurrentMeasurement' });
        return;
      }

      if (result !== 'acceptPoint' || !pointArray) {
        return;
      }

      if (currentStartRef.current) {
        graphicsActor.send({
          type: 'completeMeasurement',
          payload: pointArray,
        });
      } else {
        graphicsActor.send({ type: 'startMeasurement', payload: pointArray });
      }
    };

    const handleContextMenu = (event: MouseEvent): void => {
      // Prevent context menu from showing during measurement
      event.preventDefault();
    };

    gl.domElement.addEventListener('mousemove', handleMouseMove);
    gl.domElement.addEventListener('pointerdown', handlePointerDown);
    gl.domElement.addEventListener('pointerup', handlePointerUp);
    gl.domElement.addEventListener('contextmenu', handleContextMenu);

    return () => {
      gl.domElement.removeEventListener('mousemove', handleMouseMove);
      gl.domElement.removeEventListener('pointerdown', handlePointerDown);
      gl.domElement.removeEventListener('pointerup', handlePointerUp);
      gl.domElement.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [
    cameraInteracting,
    gl.domElement,
    isMeasureActive,
    graphicsActor,
    measureInputActor,
    renderFrame,
    updatePointerSnapshot,
  ]);

  // Choose which measurements to display: all during measure mode, otherwise only pinned
  const visibleMeasurements = isMeasureActive ? measurements : measurements.filter((m) => m.isPinned);

  // Memoize currentStart Vector3 to avoid per-render allocation
  const currentStartVec3 = useMemo(
    () => (currentStart ? toThreeRenderPoint({ renderFrame, pointMeters: currentStart }) : undefined),
    [currentStart, renderFrame],
  );

  return (
    <group>
      {/* Render snap point indicators */}
      {isMeasureActive
        ? hoveredSnapPoints.map((snapPoint) => {
            const key = `snap-${snapPoint.position.x}-${snapPoint.position.y}-${snapPoint.position.z}`;
            return (
              <SnapPointIndicator
                key={key}
                position={snapPoint.position}
                isActive={snapPoint === activeSnapPoint}
                camera={camera}
              />
            );
          })
        : null}

      {/* Persistent indicator for the selected start point */}
      {isMeasureActive && currentStartVec3 ? (
        <SnapPointIndicator isActive position={currentStartVec3} camera={camera} />
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
          start={toThreeRenderPoint({ renderFrame, pointMeters: measurement.startPoint })}
          end={toThreeRenderPoint({ renderFrame, pointMeters: measurement.endPoint })}
          distance={measurement.distance}
          metersPerDisplayUnit={metersPerDisplayUnit}
          lengthSymbol={lengthSymbol}
          isExternallyHovered={hoveredMeasurementId === measurement.id}
          isPinned={Boolean(measurement.isPinned)}
        />
      ))}
    </group>
  );
}

type SnapPointIndicatorProps = {
  readonly position: THREE.Vector3;
  // Indicates hovered/selected state for color
  readonly isActive: boolean;
  readonly camera: THREE.Camera;
};

function SnapPointIndicator({ position, isActive, camera }: SnapPointIndicatorProps): React.JSX.Element {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);

  const borderSize = isActive ? 0.05 : 0.04;
  const innerSize = isActive ? 0.04 : 0.03;
  const height = 0.05;
  const segments = 32;

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
      innerRef.current.quaternion.copy(_snapQuaternion);
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
        <cylinderGeometry args={[innerSize, innerSize, height, segments]} />
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

  // Create matcap materials following transform-controls pattern.
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
  const numericText = distanceInDisplayUnits.toFixed(decimals);
  const unitsText = enableUnits ? lengthSymbol : '';
  const labelText = `${numericText}${enableUnits ? ` ${unitsText}` : ''}`;

  // Keep a constant width box reserved for the units portion of the label background
  const unitContainerChars = 3; // Reserve width for up to 3-char units
  const backgroundCharsLength = numericText.length + (enableUnits ? 1 + unitContainerChars : 0);
  const backgroundPlaceholderText = '0'.repeat(Math.max(1, backgroundCharsLength));

  // Memoize geometries to avoid re-creating large buffers every render frame
  const textGeometry = useMemo(
    // oxlint-disable-next-line new-cap -- Three.js convention
    () => LabelTextGeometry({ text: labelText, size: textSize, depth: textDepth }),
    [labelText, textSize, textDepth],
  );

  const backgroundGeometry = useMemo(
    () =>
      // oxlint-disable-next-line new-cap -- Three.js convention
      LabelBackgroundGeometry({
        // Use placeholder string sized to reserve constant-width units area
        text: backgroundPlaceholderText,
        characterWidth: labelCharWidth,
        padding: labelPadding,
        height: labelHeight,
        radius: labelCornerRadius,
        depth: labelDepth,
      }),
    [backgroundPlaceholderText, labelCharWidth, labelPadding, labelHeight, labelCornerRadius, labelDepth],
  );

  const backgroundOutlineGeometry = useMemo(
    () =>
      // oxlint-disable-next-line new-cap -- Three.js convention
      LabelBackgroundGeometry({
        text: backgroundPlaceholderText,
        characterWidth: labelCharWidth,
        padding: labelPadding + 5,
        height: labelHeight + 10,
        radius: labelCornerRadius + 5,
        depth: labelDepth,
      }),
    [backgroundPlaceholderText, labelCharWidth, labelPadding, labelHeight, labelCornerRadius, labelDepth],
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
      const axisRotation = computeAxisRotationForCamera({
        axis: lineDirection,
        position: midpoint,
        camera,
        referenceUp: _currentNormal,
      });

      // 3) Combine rotations: base alignment then axis rotation in world space
      _finalQuat.multiplyQuaternions(axisRotation, _baseQuat);

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
      {!isPreview && (
        <group ref={labelGroupRef} renderOrder={2} position={midpoint} rotation={[0, 0, 0]}>
          {/* Stable invisible hit area to prevent hover flicker when pin appears */}
          <mesh
            position={[0, 0, 0]}
            userData={sceneTagData(sceneTag.measurementUi)}
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
          <mesh position={[0, 0, 0]} userData={sceneTagData(sceneTag.measurementUi)}>
            <primitive object={backgroundOutlineGeometry} attach='geometry' />
            <primitive object={derivedMaterials.textMaterial} attach='material' />
          </mesh>
          <mesh position={[0, 0, 0]} userData={sceneTagData(sceneTag.measurementUi)}>
            <primitive object={backgroundGeometry} attach='geometry' />
            <primitive object={derivedMaterials.backgroundMaterial} attach='material' />
          </mesh>

          {/* Text */}
          <mesh position={[0, 0, 0]} userData={sceneTagData(sceneTag.measurementUi)}>
            <primitive object={textGeometry} attach='geometry' />
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
