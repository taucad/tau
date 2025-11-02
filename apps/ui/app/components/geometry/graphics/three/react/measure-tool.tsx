/* eslint-disable complexity -- Label/line sizing and camera-facing math in a single component */
import { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useSelector } from '@xstate/react';
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
import { graphicsActor } from '#routes/builds_.$id/graphics-actor.js';
import { matcapMaterial } from '#components/geometry/graphics/three/materials/matcap-material.js';

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

export function MeasureTool(): React.JSX.Element {
  const { camera, gl, scene } = useThree();

  const measurements = useSelector(graphicsActor, (state) => state.context.measurements);
  const currentStart = useSelector(graphicsActor, (state) => state.context.currentMeasurementStart);
  const snapDistance = useSelector(graphicsActor, (state) => state.context.measureSnapDistance);
  const gridUnitFactor = useSelector(graphicsActor, (state) => state.context.gridUnitFactor);
  const gridUnit = useSelector(graphicsActor, (state) => state.context.gridUnit);
  const hoveredMeasurementId = useSelector(graphicsActor, (state) => state.context.hoveredMeasurementId);
  const isMeasureActive = useSelector(graphicsActor, (state) => state.context.isMeasureActive);

  const [hoveredSnapPoints, setHoveredSnapPoints] = useState<SnapPoint[]>([]);
  const [activeSnapPoint, setActiveSnapPoint] = useState<SnapPoint | undefined>();
  const [mousePosition, setMousePosition] = useState<THREE.Vector3 | undefined>();
  const lastSnapPointsRef = useRef<SnapPoint[] | undefined>(undefined);

  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const mouseDownOnMeshRef = useRef(false);
  const mouseIsDownRef = useRef(false);
  const startCameraQuatRef = useRef(new THREE.Quaternion());
  const startCameraPosRef = useRef(new THREE.Vector3());

  // Handle mouse move for snapping
  useEffect(() => {
    // Only enable interactive listeners when measure mode is active
    if (!isMeasureActive) {
      return undefined;
    }

    const handleMouseMove = (event: MouseEvent): void => {
      const rect = gl.domElement.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      // Get all meshes in scene (recursively traverse scene graph)
      // Exclude measurement UI elements to prevent feedback loops
      const meshes: THREE.Mesh[] = [];
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh && object.visible && !object.userData['isMeasurementUi']) {
          meshes.push(object as THREE.Mesh);
        }
      });

      // Find the closest intersected mesh (top-most object)
      const intersects = raycasterRef.current.intersectObjects(meshes, true);
      const firstIntersection = intersects[0];

      // Only show snap points for the closest/top-most intersected object.
      // If there is no intersection, fall back to the last detected face's snap points.
      let allSnapPoints: SnapPoint[] = [];
      if (firstIntersection?.object) {
        const topMesh = firstIntersection.object as THREE.Mesh;
        allSnapPoints = detectSnapPoints(topMesh, raycasterRef.current);
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
        snapPointBufferPx: 15, // Add buffer for hover persistence
      });
      setActiveSnapPoint(closest);

      // Update mouse position for preview line
      if (closest) {
        setMousePosition(closest.position);
      } else if (firstIntersection) {
        setMousePosition(firstIntersection.point);
      } else if (lastSnapPointsRef.current?.[0]) {
        // Use the first snap point as a stable mouse position proxy when off-face
        setMousePosition(lastSnapPointsRef.current[0].position);
      }
    };

    const handleMouseDown = (event: MouseEvent): void => {
      // Track camera state at mouse down to detect rotations/translations during drag
      if (event.button === 0 || event.button === 2) {
        startCameraQuatRef.current.copy(camera.quaternion);
        startCameraPosRef.current.copy(camera.position);
        mouseIsDownRef.current = true;
      }

      // Only handle left clicks for measurement from here
      if (event.button !== 0) {
        return;
      }

      // Track if mousedown happens on a mesh
      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      // Exclude measurement UI elements to prevent feedback loops
      const meshes: THREE.Mesh[] = [];
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh && object.visible && !object.userData['isMeasurementUi']) {
          meshes.push(object as THREE.Mesh);
        }
      });

      const intersects = raycasterRef.current.intersectObjects(meshes, true);
      // Consider a valid mousedown when either on a mesh or over a valid snap indicator
      mouseDownOnMeshRef.current = intersects.length > 0 || Boolean(activeSnapPoint);
    };

    const handleMouseUp = (event: MouseEvent): void => {
      // Handle right click - cancel current measurement only if no camera movement
      if (event.button === 2) {
        if (mouseIsDownRef.current) {
          const endQuat = camera.quaternion.clone();
          const endPos = camera.position.clone();
          const dot = Math.abs(startCameraQuatRef.current.dot(endQuat));
          const angle = 2 * Math.acos(Math.min(1, Math.max(-1, dot))); // Radians
          const rotated = angle > 0.01; // ~0.57°
          const translated = startCameraPosRef.current.distanceTo(endPos) > 1e-3;

          if (!rotated && !translated && currentStart) {
            // No camera movement: treat as explicit cancel
            graphicsActor.send({ type: 'cancelCurrentMeasurement' });
          }
        }

        mouseDownOnMeshRef.current = false;
        mouseIsDownRef.current = false;
        return;
      }

      // Only handle left clicks for measurement
      if (event.button !== 0) {
        return;
      }

      // If the camera rotated or translated while the mouse was held down, treat this as a view manipulation,
      // not a measurement click. This avoids registering a start/end point upon releasing the drag.
      if (mouseIsDownRef.current) {
        const endQuat = camera.quaternion.clone();
        const endPos = camera.position.clone();

        const dot = Math.abs(startCameraQuatRef.current.dot(endQuat));
        const angle = 2 * Math.acos(Math.min(1, Math.max(-1, dot))); // Radians
        const rotated = angle > 0.001; // ~0.057°

        const translated = startCameraPosRef.current.distanceTo(endPos) > 1e-3;

        if (rotated || translated) {
          mouseDownOnMeshRef.current = false;
          mouseIsDownRef.current = false;
          return;
        }
      }

      // Only process if interaction started on mesh OR we still have a valid snap indicator
      if (!mouseDownOnMeshRef.current && !activeSnapPoint) {
        mouseDownOnMeshRef.current = false;
        return;
      }

      // Verify mouseup is also on a mesh by performing a fresh raycast
      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      // Exclude measurement UI elements to prevent feedback loops
      const meshes: THREE.Mesh[] = [];
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh && object.visible && !object.userData['isMeasurementUi']) {
          meshes.push(object as THREE.Mesh);
        }
      });

      const intersects = raycasterRef.current.intersectObjects(meshes, true);
      if (intersects.length === 0 && !activeSnapPoint) {
        // No intersection and no active snap target, ignore
        mouseDownOnMeshRef.current = false;
        return;
      }

      // Use snap point if available, otherwise use intersection point
      const point = activeSnapPoint?.position ?? intersects[0]?.point;
      if (!point) {
        mouseDownOnMeshRef.current = false;
        return;
      }

      const pointArray: [number, number, number] = [point.x, point.y, point.z];

      if (currentStart) {
        // Disallow 0-length measurements by ignoring a completion click
        // that lands effectively on the start point (within a small epsilon)
        const startVec = new THREE.Vector3(...currentStart);
        const endVec = new THREE.Vector3(...pointArray);
        const zeroLengthEpsilon = 1e-4; // Scene units
        if (startVec.distanceTo(endVec) <= zeroLengthEpsilon) {
          mouseDownOnMeshRef.current = false;
          mouseIsDownRef.current = false;
          return;
        }

        graphicsActor.send({ type: 'completeMeasurement', payload: pointArray });
      } else {
        graphicsActor.send({ type: 'startMeasurement', payload: pointArray });
      }

      // Reset the mousedown flag
      mouseDownOnMeshRef.current = false;
      mouseIsDownRef.current = false;
    };

    const handleContextMenu = (event: MouseEvent): void => {
      // Prevent context menu from showing during measurement
      event.preventDefault();
    };

    gl.domElement.addEventListener('mousemove', handleMouseMove);
    gl.domElement.addEventListener('mousedown', handleMouseDown);
    gl.domElement.addEventListener('mouseup', handleMouseUp);
    gl.domElement.addEventListener('contextmenu', handleContextMenu);

    return () => {
      gl.domElement.removeEventListener('mousemove', handleMouseMove);
      gl.domElement.removeEventListener('mousedown', handleMouseDown);
      gl.domElement.removeEventListener('mouseup', handleMouseUp);
      gl.domElement.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [camera, gl, scene, snapDistance, currentStart, activeSnapPoint, mousePosition, isMeasureActive]);

  // Choose which measurements to display: all during measure mode, otherwise only pinned
  const visibleMeasurements = isMeasureActive ? measurements : measurements.filter((m) => m.isPinned);

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
      {isMeasureActive && currentStart ? (
        <SnapPointIndicator isActive position={new THREE.Vector3(...currentStart)} camera={camera} />
      ) : null}

      {/* Render preview line */}
      {isMeasureActive && currentStart && mousePosition ? (
        <MeasurementLine isPreview start={new THREE.Vector3(...currentStart)} end={mousePosition} />
      ) : null}

      {/* Render completed measurements */}
      {visibleMeasurements.map((measurement) => (
        <MeasurementLine
          key={measurement.id}
          id={measurement.id}
          start={new THREE.Vector3(...measurement.startPoint)}
          end={new THREE.Vector3(...measurement.endPoint)}
          distance={measurement.distance}
          gridUnitFactor={gridUnitFactor}
          gridUnit={gridUnit}
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

    // Face camera
    const direction = new THREE.Vector3();
    direction.subVectors(camera.position, position).normalize();
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

    if (outerRef.current) {
      outerRef.current.quaternion.copy(quaternion);
      outerRef.current.scale.set(scale * 500, scale * 500, scale * 500);
    }

    if (innerRef.current) {
      innerRef.current.quaternion.copy(quaternion);
      innerRef.current.scale.set(scale * 500, scale * 500, scale * 500);
    }
  });

  return (
    <group renderOrder={isActive ? 10 : 0}>
      {/* Outer border (black) */}
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
      {/* Inner fill (white or green when active/hovered/selected) */}
      <mesh
        ref={innerRef}
        position={position}
        // Ensure the hover/selected indicator is rendered on top of other indicators
        renderOrder={isActive ? 2 : 1}
        userData={{ isMeasurementUi: true }}
      >
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
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
  readonly distance?: number;
  readonly gridUnitFactor?: number;
  readonly gridUnit?: string;
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
  gridUnitFactor = 1,
  gridUnit = 'mm',
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
  const labelGroupRef = useRef<THREE.Group>(null);
  const lineGroupRef = useRef<THREE.Group>(null);
  const cylinderMeshRef = useRef<THREE.Mesh>(null);
  const startConeMeshRef = useRef<THREE.Mesh>(null);
  const endConeMeshRef = useRef<THREE.Mesh>(null);
  const [isLabelHovered, setIsLabelHovered] = useState(false);
  const isHovered = isLabelHovered || isExternallyHovered;

  // Create matcap materials following transform-controls pattern
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
    // Highlight line and arrows when hovered (from UI or viewport)
    coneMaterial.color.set(isHovered ? 0x00_ff_00 : (materials?.coneColor ?? 0x00_00_00));

    return { backgroundMaterial, textMaterial, coneMaterial };
  }, [materials, isHovered]);

  // Calculate label position (midpoint)
  const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

  // Calculate distance if not provided
  const calculatedDistance = distance ?? start.distanceTo(end);
  const distanceInMm = calculatedDistance / gridUnitFactor;
  const numericText = distanceInMm.toFixed(decimals);
  const unitsText = enableUnits ? gridUnit : '';
  const labelText = `${numericText}${enableUnits ? ` ${unitsText}` : ''}`;

  // Keep a constant width box reserved for the units portion of the label background
  const unitContainerChars = 3; // Reserve width for up to 3-char units
  const backgroundCharsLength = numericText.length + (enableUnits ? 1 + unitContainerChars : 0);
  const backgroundPlaceholderText = '0'.repeat(Math.max(1, backgroundCharsLength));

  // Memoize geometries to avoid re-creating large buffers every render frame
  const textGeometry = useMemo(
    // eslint-disable-next-line new-cap -- Three.js convention
    () => LabelTextGeometry({ text: labelText, size: textSize, depth: textDepth }),
    [labelText, textSize, textDepth],
  );

  const backgroundGeometry = useMemo(
    () =>
      // eslint-disable-next-line new-cap -- Three.js convention
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

  // Track current scale for UI sizing
  const scaleRef = useRef<number>(1);

  // Calculate measurement line direction (axis of rotation for label)
  const lineDirection = new THREE.Vector3().subVectors(end, start).normalize();

  // Billboard behavior - rotate around line axis to face camera
  useFrame(() => {
    const scale = calculateScaleFromCamera(midpoint, camera);
    scaleRef.current = scale;

    // Scale and orient label group
    if (labelGroupRef.current) {
      // 1) Establish base orientation: align X-axis with the measurement line
      //    This makes the label plane (YZ) contain the line, and its normal (Z) be
      //    perpendicular to the line so it can rotate around the line and face the camera.
      const baseQuaternion = new THREE.Quaternion();
      baseQuaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), lineDirection);

      // 2) Compute rotation around the line axis so the label's normal (local Z after base)
      //    faces the camera. We pass the current normal (Z transformed by base) as the
      //    reference vector to rotate from.
      const currentNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(baseQuaternion);
      const axisRotation = computeAxisRotationForCamera(lineDirection, midpoint, camera, currentNormal);

      // 3) Combine rotations: apply base alignment, then rotate around the world line axis.
      //    Quaternion multiplication order matters: q = axisRotation * baseQuaternion
      //    applies the base first, then the axis rotation in world space.
      let finalQuaternion = new THREE.Quaternion().multiplyQuaternions(axisRotation, baseQuaternion);

      // 4) Ensure text is upright relative to the camera. If the label's up vector
      //    points opposite to the camera's up (projected onto the label plane), flip
      //    180° around the measurement line axis.
      const labelNormalWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(finalQuaternion).normalize();
      const labelUpWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(finalQuaternion).normalize();

      const cameraUpWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
      const cameraUpProjected = new THREE.Vector3()
        .copy(cameraUpWorld)
        .addScaledVector(labelNormalWorld, -cameraUpWorld.dot(labelNormalWorld))
        .normalize();

      if (labelUpWorld.dot(cameraUpProjected) < 0) {
        // Flip around the label's normal so it stays facing the camera
        const flipQuaternion = new THREE.Quaternion().setFromAxisAngle(labelNormalWorld, Math.PI);
        finalQuaternion = new THREE.Quaternion().multiplyQuaternions(flipQuaternion, finalQuaternion);
      }

      labelGroupRef.current.quaternion.copy(finalQuaternion);
      // Enlarge label by 20% when hovered (from UI or viewport)
      labelGroupRef.current.scale.setScalar(scale * (isHovered ? 1.2 : 1));
      labelGroupRef.current.position.copy(midpoint);
    }

    // Dynamically size cylinder and cones using transform scaling with unit geometries
    const direction = new THREE.Vector3().subVectors(end, start).normalize();

    // Derive UI dimensions from scale using component props
    const coneHeightScaled = coneHeight * scale; // Height of arrow heads
    const coneRadiusScaled = coneRadius * scale; // Radius of arrow heads
    const cylinderRadiusScaled = cylinderRadius * scale; // Thickness of the line

    const effectiveCone = isPreview ? 0 : coneHeightScaled;
    const cylinderHeight = Math.max(0.0001, lineDistance - 2 * effectiveCone);

    if (cylinderMeshRef.current) {
      cylinderMeshRef.current.scale.set(cylinderRadiusScaled, cylinderHeight, cylinderRadiusScaled);
    }

    const coneOffset = direction.clone().multiplyScalar(coneHeightScaled / 2);
    if (startConeMeshRef.current) {
      startConeMeshRef.current.scale.set(coneRadiusScaled, coneHeightScaled, coneRadiusScaled);
      startConeMeshRef.current.position.copy(start.clone().add(coneOffset));
    }

    if (endConeMeshRef.current) {
      endConeMeshRef.current.scale.set(coneRadiusScaled, coneHeightScaled, coneRadiusScaled);
      endConeMeshRef.current.position.copy(end.clone().sub(coneOffset));
    }
  });

  // Calculate direction and distance for cylinder and cone rotation
  const lineDistance = start.distanceTo(end);
  const startQuaternion = new THREE.Quaternion();
  const endQuaternion = new THREE.Quaternion();
  const cylinderQuaternion = new THREE.Quaternion();

  startQuaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lineDirection.clone().negate());
  endQuaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lineDirection);
  cylinderQuaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lineDirection);

  return (
    <group>
      {/* Line group with scaling for cylinders and cones */}
      <group ref={lineGroupRef} renderOrder={1}>
        {/* Cylinder line */}
        <mesh
          ref={cylinderMeshRef}
          position={midpoint}
          quaternion={cylinderQuaternion}
          userData={{ isMeasurementUi: true }}
        >
          {/* Unit geometry – scaled per-frame */}
          <cylinderGeometry args={[1, 1, 1, 16]} />
          <primitive object={derivedMaterials.coneMaterial} attach="material" />
        </mesh>

        {/* Cone at start */}
        {!isPreview && (
          <mesh
            ref={startConeMeshRef}
            position={start}
            quaternion={startQuaternion}
            userData={{ isMeasurementUi: true }}
          >
            {/* Unit geometry – scaled per-frame */}
            <coneGeometry args={[1, 1, 16]} />
            <primitive object={derivedMaterials.coneMaterial} attach="material" />
          </mesh>
        )}

        {/* Cone at end */}
        {!isPreview && (
          <mesh ref={endConeMeshRef} position={end} quaternion={endQuaternion} userData={{ isMeasurementUi: true }}>
            {/* Unit geometry – scaled per-frame */}
            <coneGeometry args={[1, 1, 16]} />
            <primitive object={derivedMaterials.coneMaterial} attach="material" />
          </mesh>
        )}
      </group>

      {/* Label */}
      {!isPreview && (
        <group ref={labelGroupRef} renderOrder={2} position={midpoint} rotation={[0, 0, 0]}>
          {/* Stable invisible hit area to prevent hover flicker when pin appears */}
          <mesh
            position={[0, 0, 0]}
            userData={{ isMeasurementUi: true }}
            onPointerEnter={(event) => {
              event.stopPropagation();
              setIsLabelHovered(true);
              if (id) {
                graphicsActor.send({ type: 'setHoveredMeasurement', payload: id });
              }
            }}
            onPointerLeave={(event) => {
              event.stopPropagation();
              setIsLabelHovered(false);
              graphicsActor.send({ type: 'setHoveredMeasurement', payload: undefined });
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
          <mesh position={[0, 0, 0]} userData={{ isMeasurementUi: true }}>
            <primitive object={backgroundOutlineGeometry} attach="geometry" />
            <primitive object={derivedMaterials.textMaterial} attach="material" />
          </mesh>
          <mesh position={[0, 0, 0]} userData={{ isMeasurementUi: true }}>
            <primitive object={backgroundGeometry} attach="geometry" />
            <primitive object={derivedMaterials.backgroundMaterial} attach="material" />
          </mesh>

          {/* Text */}
          <mesh position={[0, 0, 0]} userData={{ isMeasurementUi: true }}>
            <primitive object={textGeometry} attach="geometry" />
            <primitive object={derivedMaterials.textMaterial} attach="material" />
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
              userData={{ isMeasurementUi: true }}
            >
              {/* Yellow/gold circular pin button (appears only on label hover) */}
              <mesh
                userData={{ isMeasurementUi: true }}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  // Keep hover state active when over pin button
                  setIsLabelHovered(true);
                  if (id) {
                    graphicsActor.send({ type: 'setHoveredMeasurement', payload: id });
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
                  matcap={matcapMaterial()}
                  transparent={false}
                />
              </mesh>

              {/* Pin glyph using simple geometry */}
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
