/* eslint-disable complexity -- Label/line sizing and camera-facing math in a single component */
import React, { useEffect, useRef, useState, useMemo, useContext } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { LabelTextGeometry, LabelBackgroundGeometry } from '#geometries/label-geometry.js';
import { detectSnapPoints, findClosestSnapPoint } from '#utils/snap-detection.utils.js';
import type { SnapPoint } from '#utils/snap-detection.utils.js';
import { computeAxisRotationForCamera } from '#utils/rotation.utils.js';
import { matcapMaterial } from '#materials/matcap-material.js';
import { useMeasureStore, CadStoreContext } from '#react/stores/store-context.js';

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

  const size = 1;
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
const _lineDir = new THREE.Vector3();
const _coneOffset = new THREE.Vector3();

type MeasureToolProperties = {
  readonly geometryKey?: string;
};

/** Interactive measurement tool for Three.js scenes, providing snap-to-vertex/edge measurement with labels. */
export function MeasureTool({ geometryKey = '' }: MeasureToolProperties): React.JSX.Element {
  const { camera, gl, scene } = useThree();
  const stores = useContext(CadStoreContext);
  if (!stores) {
    throw new Error('MeasureTool must be used within a CadStoreProvider');
  }

  const { measureStore } = stores;

  const measurements = useMeasureStore((s) => s.measurements);
  const currentStart = useMeasureStore((s) => s.currentStart);
  const snapDistance = useMeasureStore((s) => s.snapDistance);
  const lengthFactor = useMeasureStore((s) => s.units.factor);
  const lengthSymbol = useMeasureStore((s) => s.units.symbol);
  const hoveredMeasurementId = useMeasureStore((s) => s.hoveredMeasurementId);
  const isMeasureActive = useMeasureStore((s) => s.isActive);

  const [hoveredSnapPoints, setHoveredSnapPoints] = useState<SnapPoint[]>([]);
  const [activeSnapPoint, setActiveSnapPoint] = useState<SnapPoint | undefined>();
  const [mousePosition, setMousePosition] = useState<THREE.Vector3 | undefined>();
  const lastSnapPointsRef = useRef<SnapPoint[] | undefined>(undefined);

  // Refs for values that change rapidly (every mouse move) so the event-listener
  // effect doesn't tear down and re-add 4 DOM listeners per mouse event.
  const activeSnapPointRef = useRef(activeSnapPoint);
  activeSnapPointRef.current = activeSnapPoint;
  const mousePositionRef = useRef(mousePosition);
  mousePositionRef.current = mousePosition;
  const currentStartRef = useRef(currentStart);
  currentStartRef.current = currentStart;

  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const pointerDownOnMeshRef = useRef(false);
  const mouseIsDownRef = useRef(false);
  const startCameraQuatRef = useRef(new THREE.Quaternion());
  const startCameraPosRef = useRef(new THREE.Vector3());

  // Cache mesh list to avoid expensive scene.traverse() on every mouse event.
  // Invalidated when geometryKey changes (new geometry loaded/unloaded).
  const cachedMeshesRef = useRef<THREE.Mesh[]>([]);
  const cachedMeshKeyRef = useRef<string | undefined>(undefined);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const geometryKeyRef = useRef(geometryKey);
  geometryKeyRef.current = geometryKey;

  // Cache detectSnapPoints results keyed by (mesh.id, faceIndex) to avoid
  // running the expensive geometry pipeline on every mouse move over the same face.
  const snapCacheRef = useRef(new Map<string, SnapPoint[]>());

  const getCachedMeshes = useRef((): THREE.Mesh[] => {
    const currentKey = geometryKeyRef.current;
    if (currentKey === cachedMeshKeyRef.current) {
      return cachedMeshesRef.current;
    }

    const meshes: THREE.Mesh[] = [];
    sceneRef.current.traverse((object) => {
      if (object instanceof THREE.Mesh && object.visible && !object.userData['isMeasurementUi']) {
        meshes.push(object as THREE.Mesh);
      }
    });
    cachedMeshesRef.current = meshes;
    cachedMeshKeyRef.current = currentKey;
    snapCacheRef.current.clear();
    return meshes;
  }).current;

  useEffect(() => {
    if (!isMeasureActive) {
      return undefined;
    }

    const handleMouseMove = (event: MouseEvent): void => {
      const rect = gl.domElement.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      const meshes = getCachedMeshes();
      const intersects = raycasterRef.current.intersectObjects(meshes, true);
      const firstIntersection = intersects[0];

      let allSnapPoints: SnapPoint[] = [];
      if (firstIntersection?.object) {
        const topMesh = firstIntersection.object as THREE.Mesh;
        const cacheKey = `${topMesh.id}:${firstIntersection.faceIndex ?? -1}`;
        const cached = snapCacheRef.current.get(cacheKey);
        if (cached) {
          allSnapPoints = cached;
        } else {
          allSnapPoints = detectSnapPoints(topMesh, raycasterRef.current);
          snapCacheRef.current.set(cacheKey, allSnapPoints);
        }

        lastSnapPointsRef.current = allSnapPoints;
      } else if (lastSnapPointsRef.current?.length) {
        allSnapPoints = lastSnapPointsRef.current;
      }

      setHoveredSnapPoints(allSnapPoints);

      const closest = findClosestSnapPoint(allSnapPoints, {
        mousePos: mouseRef.current,
        camera,
        canvas: gl.domElement,
        snapDistancePx: snapDistance,
        snapPointBufferPx: 15,
      });
      setActiveSnapPoint(closest);

      if (closest) {
        setMousePosition(closest.position);
      } else if (firstIntersection) {
        setMousePosition(firstIntersection.point);
      } else if (lastSnapPointsRef.current?.[0]) {
        setMousePosition(lastSnapPointsRef.current[0].position);
      }
    };

    const handlePointerDown = (event: MouseEvent): void => {
      if (event.button === 0 || event.button === 2) {
        startCameraQuatRef.current.copy(camera.quaternion);
        startCameraPosRef.current.copy(camera.position);
        mouseIsDownRef.current = true;
      }

      if (event.button !== 0) {
        return;
      }

      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      const meshes = getCachedMeshes();
      const intersects = raycasterRef.current.intersectObjects(meshes, true);
      pointerDownOnMeshRef.current = intersects.length > 0 || Boolean(activeSnapPointRef.current);
    };

    const handlePointerUp = (event: MouseEvent): void => {
      if (event.button === 2) {
        if (mouseIsDownRef.current) {
          const endQuat = camera.quaternion.clone();
          const endPos = camera.position.clone();
          const dot = Math.abs(startCameraQuatRef.current.dot(endQuat));
          const angle = 2 * Math.acos(Math.min(1, Math.max(-1, dot)));
          const rotated = angle > 0.01;
          const translated = startCameraPosRef.current.distanceTo(endPos) > 1e-3;

          if (!rotated && !translated && currentStartRef.current) {
            measureStore.getState().cancelMeasurement();
          }
        }

        pointerDownOnMeshRef.current = false;
        mouseIsDownRef.current = false;
        return;
      }

      if (event.button !== 0) {
        return;
      }

      if (mouseIsDownRef.current) {
        const endQuat = camera.quaternion.clone();
        const endPos = camera.position.clone();

        const dot = Math.abs(startCameraQuatRef.current.dot(endQuat));
        const angle = 2 * Math.acos(Math.min(1, Math.max(-1, dot)));
        const rotated = angle > 0.001;

        const translated = startCameraPosRef.current.distanceTo(endPos) > 1e-3;

        if (rotated || translated) {
          pointerDownOnMeshRef.current = false;
          mouseIsDownRef.current = false;
          return;
        }
      }

      if (!pointerDownOnMeshRef.current && !activeSnapPointRef.current) {
        pointerDownOnMeshRef.current = false;
        return;
      }

      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      const meshes = getCachedMeshes();
      const intersects = raycasterRef.current.intersectObjects(meshes, true);
      if (intersects.length === 0 && !activeSnapPointRef.current) {
        pointerDownOnMeshRef.current = false;
        return;
      }

      const point = activeSnapPointRef.current?.position ?? intersects[0]?.point;
      if (!point) {
        pointerDownOnMeshRef.current = false;
        return;
      }

      const pointArray: [number, number, number] = [point.x, point.y, point.z];

      if (currentStartRef.current) {
        const startVec = new THREE.Vector3(...currentStartRef.current);
        const endVec = new THREE.Vector3(...pointArray);
        const zeroLengthEpsilon = 1e-4;
        if (startVec.distanceTo(endVec) <= zeroLengthEpsilon) {
          pointerDownOnMeshRef.current = false;
          mouseIsDownRef.current = false;
          return;
        }

        measureStore.getState().completeMeasurement(pointArray);
      } else {
        measureStore.getState().startMeasurement(pointArray);
      }

      pointerDownOnMeshRef.current = false;
      mouseIsDownRef.current = false;
    };

    const handleContextMenu = (event: MouseEvent): void => {
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
  }, [camera, gl, scene, snapDistance, isMeasureActive, measureStore, getCachedMeshes]);

  const visibleMeasurements = isMeasureActive ? measurements : measurements.filter((m) => m.isPinned);

  const currentStartVec3 = useMemo(
    () => (currentStart ? new THREE.Vector3(...currentStart) : undefined),
    [currentStart],
  );

  return (
    <group>
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

      {isMeasureActive && currentStartVec3 ? (
        <SnapPointIndicator isActive position={currentStartVec3} camera={camera} />
      ) : null}

      {isMeasureActive && currentStartVec3 && mousePosition ? (
        <MeasurementLine isPreview start={currentStartVec3} end={mousePosition} />
      ) : null}

      {visibleMeasurements.map((measurement) => (
        <MeasurementLine
          key={measurement.id}
          id={measurement.id}
          start={measurement.startPoint}
          end={measurement.endPoint}
          distance={measurement.distance}
          lengthFactor={lengthFactor}
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
      <mesh ref={outerRef} position={position} renderOrder={isActive ? 2 : 1} userData={{ isMeasurementUi: true }}>
        <cylinderGeometry args={[borderSize, borderSize, height, segments]} />
        <meshMatcapMaterial
          transparent
          color="#000000"
          opacity={1}
          depthTest={false}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={innerRef} position={position} renderOrder={isActive ? 2 : 1} userData={{ isMeasurementUi: true }}>
        <cylinderGeometry args={[innerSize, innerSize, height, segments]} />
        <meshBasicMaterial
          transparent
          toneMapped={false}
          fog={false}
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
  readonly lengthFactor?: number;
  readonly lengthSymbol?: string;
  readonly isPreview?: boolean;
  readonly isExternallyHovered?: boolean;
  readonly isPinned?: boolean;
  readonly coneHeight?: number;
  readonly coneRadius?: number;
  readonly cylinderRadius?: number;
  readonly textSize?: number;
  readonly textDepth?: number;
  readonly labelHeight?: number;
  readonly labelPadding?: number;
  readonly labelCornerRadius?: number;
  readonly labelDepth?: number;
  readonly labelCharWidth?: number;
  readonly decimals?: number;
  // eslint-disable-next-line react/boolean-prop-naming -- Three.js component API convention
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
  lengthFactor = 1,
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
  const stores = useContext(CadStoreContext);
  if (!stores) {
    throw new Error('MeasurementLine must be used within a CadStoreProvider');
  }

  const { measureStore } = stores;

  const startVec = useMemo(() => (start instanceof THREE.Vector3 ? start : new THREE.Vector3(...start)), [start]);
  const endVec = useMemo(() => (end instanceof THREE.Vector3 ? end : new THREE.Vector3(...end)), [end]);

  const labelGroupRef = useRef<THREE.Group>(null);
  const lineGroupRef = useRef<THREE.Group>(null);
  const cylinderMeshRef = useRef<THREE.Mesh>(null);
  const startConeMeshRef = useRef<THREE.Mesh>(null);
  const endConeMeshRef = useRef<THREE.Mesh>(null);
  const [isLabelHovered, setIsLabelHovered] = useState(false);
  const isHovered = isLabelHovered || isExternallyHovered;

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
      color: materials?.backgroundColor ?? 0xff_ff_ff,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });

    const backgroundMaterial = basicMaterial.clone();
    backgroundMaterial.color.set(materials?.backgroundColor ?? 0xff_ff_ff);

    const textMaterial = baseMaterial.clone();
    textMaterial.color.set(materials?.textColor ?? 0x00_00_00);

    const coneMaterial = baseMaterial.clone();
    coneMaterial.color.set(materials?.coneColor ?? 0x00_00_00);

    return { backgroundMaterial, textMaterial, coneMaterial };
  }, [materials]);

  const pinMatcapTexture = useMemo(() => matcapMaterial(), []);

  useEffect(() => {
    if (materials && 'coneMaterial' in materials) {
      return;
    }

    const coneColor = isHovered ? 0x00_ff_00 : materials && 'coneColor' in materials ? materials.coneColor : 0x00_00_00;
    (derivedMaterials.coneMaterial as THREE.MeshMatcapMaterial).color.set(coneColor);
  }, [isHovered, derivedMaterials, materials]);

  const midpoint = useMemo(
    () => new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5),
    [startVec, endVec],
  );

  const calculatedDistance = distance ?? startVec.distanceTo(endVec);
  const distanceInMm = calculatedDistance / lengthFactor;
  const numericText = distanceInMm.toFixed(decimals);
  const unitsText = enableUnits ? lengthSymbol : '';
  const labelText = `${numericText}${enableUnits ? ` ${unitsText}` : ''}`;

  const unitContainerChars = 3;
  const backgroundCharsLength = numericText.length + (enableUnits ? 1 + unitContainerChars : 0);
  const backgroundPlaceholderText = '0'.repeat(Math.max(1, backgroundCharsLength));

  const textGeometry = useMemo(
    // eslint-disable-next-line new-cap -- Three.js convention
    () => LabelTextGeometry({ text: labelText, size: textSize, depth: textDepth }),
    [labelText, textSize, textDepth],
  );

  const backgroundGeometry = useMemo(
    () =>
      // eslint-disable-next-line new-cap -- Three.js convention
      LabelBackgroundGeometry({
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
      // eslint-disable-next-line new-cap -- Three.js convention
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

  const scaleRef = useRef<number>(1);

  const lineDirection = useMemo(() => new THREE.Vector3().subVectors(endVec, startVec).normalize(), [startVec, endVec]);

  useFrame(() => {
    const scale = calculateScaleFromCamera(midpoint, camera);
    scaleRef.current = scale;

    if (labelGroupRef.current) {
      _baseQuat.setFromUnitVectors(_currentNormal.set(1, 0, 0), lineDirection);

      _currentNormal.set(0, 0, 1).applyQuaternion(_baseQuat);
      const axisRotation = computeAxisRotationForCamera({
        axis: lineDirection,
        position: midpoint,
        camera,
        referenceUp: _currentNormal,
      });

      _finalQuat.multiplyQuaternions(axisRotation, _baseQuat);

      _labelNormal.set(0, 0, 1).applyQuaternion(_finalQuat).normalize();
      _labelUp.set(0, 1, 0).applyQuaternion(_finalQuat).normalize();

      _cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
      _cameraUpProjected.copy(_cameraUp).addScaledVector(_labelNormal, -_cameraUp.dot(_labelNormal)).normalize();

      if (_labelUp.dot(_cameraUpProjected) < 0) {
        _flipQuat.setFromAxisAngle(_labelNormal, Math.PI);
        _finalQuat.copy(_axisRotation.multiplyQuaternions(_flipQuat, _finalQuat));
      }

      labelGroupRef.current.quaternion.copy(_finalQuat);
      labelGroupRef.current.scale.setScalar(scale * (isHovered ? 1.2 : 1));
      labelGroupRef.current.position.copy(midpoint);
    }

    _lineDir.subVectors(endVec, startVec).normalize();

    const coneHeightScaled = coneHeight * scale;
    const coneRadiusScaled = coneRadius * scale;
    const cylinderRadiusScaled = cylinderRadius * scale;

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

  const lineDistance = useMemo(() => startVec.distanceTo(endVec), [startVec, endVec]);
  const { startQuaternion, endQuaternion, cylinderQuaternion } = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0);
    const startQ = new THREE.Quaternion().setFromUnitVectors(up, lineDirection.clone().negate());
    const endQ = new THREE.Quaternion().setFromUnitVectors(up, lineDirection);
    const cylinderQ = new THREE.Quaternion().setFromUnitVectors(up, lineDirection);
    return { startQuaternion: startQ, endQuaternion: endQ, cylinderQuaternion: cylinderQ };
  }, [lineDirection]);

  return (
    <group>
      <group ref={lineGroupRef} renderOrder={1}>
        <mesh
          ref={cylinderMeshRef}
          position={midpoint}
          quaternion={cylinderQuaternion}
          userData={{ isMeasurementUi: true }}
        >
          <cylinderGeometry args={[1, 1, 1, 16]} />
          <primitive object={derivedMaterials.coneMaterial} attach="material" />
        </mesh>

        {!isPreview && (
          <mesh
            ref={startConeMeshRef}
            position={start}
            quaternion={startQuaternion}
            userData={{ isMeasurementUi: true }}
          >
            <coneGeometry args={[1, 1, 16]} />
            <primitive object={derivedMaterials.coneMaterial} attach="material" />
          </mesh>
        )}

        {!isPreview && (
          <mesh ref={endConeMeshRef} position={end} quaternion={endQuaternion} userData={{ isMeasurementUi: true }}>
            <coneGeometry args={[1, 1, 16]} />
            <primitive object={derivedMaterials.coneMaterial} attach="material" />
          </mesh>
        )}
      </group>

      {!isPreview && (
        <group ref={labelGroupRef} renderOrder={2} position={midpoint} rotation={[0, 0, 0]}>
          <mesh
            position={[0, 0, 0]}
            userData={{ isMeasurementUi: true }}
            onPointerEnter={(event) => {
              event.stopPropagation();
              setIsLabelHovered(true);
              if (id) {
                measureStore.getState().setHoveredMeasurement(id);
              }
            }}
            onPointerLeave={(event) => {
              event.stopPropagation();
              setIsLabelHovered(false);
              measureStore.getState().setHoveredMeasurement(undefined);
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
          <mesh position={[0, 0, 0]} userData={{ isMeasurementUi: true }}>
            <primitive object={backgroundOutlineGeometry} attach="geometry" />
            <primitive object={derivedMaterials.textMaterial} attach="material" />
          </mesh>
          <mesh position={[0, 0, 0]} userData={{ isMeasurementUi: true }}>
            <primitive object={backgroundGeometry} attach="geometry" />
            <primitive object={derivedMaterials.backgroundMaterial} attach="material" />
          </mesh>

          <mesh position={[0, 0, 0]} userData={{ isMeasurementUi: true }}>
            <primitive object={textGeometry} attach="geometry" />
            <primitive object={derivedMaterials.textMaterial} attach="material" />
          </mesh>

          {id && isHovered ? (
            <group
              position={(() => {
                const totalChars = backgroundPlaceholderText.length;
                const width = totalChars * labelCharWidth + 2 * labelPadding;
                const buttonDiameter = 2 * labelCharWidth;
                const offsetX = width / 2 - buttonDiameter / 2 - Math.max(5, labelPadding * 0.2);
                const offsetY = 0;
                return [offsetX, offsetY, 0];
              })()}
              renderOrder={3}
              userData={{ isMeasurementUi: true }}
            >
              <mesh
                userData={{ isMeasurementUi: true }}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  setIsLabelHovered(true);
                  if (id) {
                    measureStore.getState().setHoveredMeasurement(id);
                  }
                }}
                onPointerOut={(event) => {
                  event.stopPropagation();
                }}
                onPointerDown={(event) => {
                  if (event.nativeEvent.button === 0 && id) {
                    measureStore.getState().togglePinned(id);
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

              <mesh
                position={[0, labelCharWidth * 0.15, 0]}
                userData={{ isMeasurementUi: true }}
                onPointerOver={(event) => {
                  event.stopPropagation();
                }}
                onPointerOut={(event) => {
                  event.stopPropagation();
                }}
              >
                <cylinderGeometry args={[labelCharWidth * 0.12, labelCharWidth * 0.12, labelCharWidth * 0.4, 16]} />
                <primitive object={derivedMaterials.textMaterial} attach="material" />
              </mesh>
              <mesh
                position={[0, -labelCharWidth * 0.2, 0]}
                userData={{ isMeasurementUi: true }}
                onPointerOver={(event) => {
                  event.stopPropagation();
                }}
                onPointerOut={(event) => {
                  event.stopPropagation();
                }}
              >
                <coneGeometry args={[labelCharWidth * 0.15, labelCharWidth * 0.35, 16]} />
                <primitive object={derivedMaterials.textMaterial} attach="material" />
              </mesh>
            </group>
          ) : null}
        </group>
      )}
    </group>
  );
}
