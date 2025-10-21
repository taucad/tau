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
import { graphicsActor } from '#routes/builds_.$id/graphics-actor.js';
import { matcapMaterial } from '#components/geometry/graphics/three/materials/matcap-material.js';

function calculateScaleFromCamera(position: THREE.Vector3, camera: THREE.Camera): number {
  const distanceToCamera = camera.position.distanceTo(position);
  return distanceToCamera * 0.0003; // Consistent scaling factor
}

export function MeasureTool(): React.JSX.Element {
  const { camera, gl, scene } = useThree();

  const measurements = useSelector(graphicsActor, (state) => state.context.measurements);
  const currentStart = useSelector(graphicsActor, (state) => state.context.currentMeasurementStart);
  const snapDistance = useSelector(graphicsActor, (state) => state.context.measureSnapDistance);
  const gridUnitFactor = useSelector(graphicsActor, (state) => state.context.gridUnitFactor);
  const gridUnit = useSelector(graphicsActor, (state) => state.context.gridUnit);

  const [hoveredSnapPoints, setHoveredSnapPoints] = useState<SnapPoint[]>([]);
  const [activeSnapPoint, setActiveSnapPoint] = useState<SnapPoint | undefined>();
  const [mousePosition, setMousePosition] = useState<THREE.Vector3 | undefined>();

  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const mouseDownOnMeshRef = useRef(false);

  // Handle mouse move for snapping
  useEffect(() => {
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

      let allSnapPoints: SnapPoint[] = [];
      for (const mesh of meshes) {
        const points = detectSnapPoints(mesh, raycasterRef.current, camera, snapDistance);
        allSnapPoints = [...allSnapPoints, ...points];
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
      } else {
        const intersects = raycasterRef.current.intersectObjects(meshes, true);
        const firstIntersection = intersects[0];
        if (firstIntersection) {
          setMousePosition(firstIntersection.point);
        }
      }
    };

    const handleMouseDown = (event: MouseEvent): void => {
      // Only handle left clicks for measurement
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
      mouseDownOnMeshRef.current = intersects.length > 0;
    };

    const handleMouseUp = (event: MouseEvent): void => {
      // Handle right click - cancel current measurement
      if (event.button === 2) {
        if (currentStart) {
          // Cancel the current measurement start without clearing completed measurements
          graphicsActor.send({ type: 'cancelCurrentMeasurement' });
          mouseDownOnMeshRef.current = false;
        }

        return;
      }

      // Only handle left clicks for measurement
      if (event.button !== 0) {
        return;
      }

      // Only process if both mousedown and mouseup happened on a mesh
      if (!mouseDownOnMeshRef.current) {
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
      if (intersects.length === 0) {
        // No intersection with mesh on mouseup, ignore
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
        graphicsActor.send({ type: 'completeMeasurement', payload: pointArray });
      } else {
        graphicsActor.send({ type: 'startMeasurement', payload: pointArray });
      }

      // Reset the mousedown flag
      mouseDownOnMeshRef.current = false;
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
  }, [camera, gl, scene, snapDistance, currentStart, activeSnapPoint, mousePosition]);

  return (
    <group>
      {/* Render snap point indicators */}
      {hoveredSnapPoints.map((snapPoint) => {
        const key = `snap-${snapPoint.position.x}-${snapPoint.position.y}-${snapPoint.position.z}`;
        return (
          <SnapPointIndicator
            key={key}
            position={snapPoint.position}
            isActive={snapPoint === activeSnapPoint}
            camera={camera}
          />
        );
      })}

      {/* Render preview line */}
      {currentStart && mousePosition ? (
        <MeasurementLine isPreview start={new THREE.Vector3(...currentStart)} end={mousePosition} />
      ) : null}

      {/* Render completed measurements */}
      {measurements.map((measurement) => (
        <MeasurementLine
          key={measurement.id}
          start={new THREE.Vector3(...measurement.startPoint)}
          end={new THREE.Vector3(...measurement.endPoint)}
          distance={measurement.distance}
          gridUnitFactor={gridUnitFactor}
          gridUnit={gridUnit}
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
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (meshRef.current) {
      const scale = calculateScaleFromCamera(position, camera);
      meshRef.current.scale.setScalar(scale * 100);
    }
  });

  return (
    <mesh ref={meshRef} position={position} userData={{ isMeasurementUi: true }}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshBasicMaterial transparent color={isActive ? '#00ff00' : '#ffffff'} opacity={isActive ? 1 : 0.8} />
    </mesh>
  );
}

type MeasurementLineProps = {
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
  readonly distance?: number;
  readonly gridUnitFactor?: number;
  readonly gridUnit?: string;
  readonly isPreview?: boolean;
};

function MeasurementLine({
  start,
  end,
  distance,
  gridUnitFactor = 1,
  gridUnit = 'mm',
  isPreview = false,
}: MeasurementLineProps): React.JSX.Element {
  const { camera } = useThree();
  const labelGroupRef = useRef<THREE.Group>(null);
  const lineGroupRef = useRef<THREE.Group>(null);

  // Create matcap materials following transform-controls pattern
  const materials = useMemo(() => {
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

    const backgroundMaterial = baseMaterial.clone();
    backgroundMaterial.color.set(0xff_ff_ff); // White

    const textMaterial = baseMaterial.clone();
    textMaterial.color.set(0x00_00_00); // Black

    const coneMaterial = baseMaterial.clone();
    coneMaterial.color.set(0x00_00_00); // Black

    return { backgroundMaterial, textMaterial, coneMaterial };
  }, []);

  // Calculate label position (midpoint)
  const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

  // Calculate distance if not provided
  const calculatedDistance = distance ?? start.distanceTo(end);
  const distanceInMm = calculatedDistance / gridUnitFactor;
  const labelText = `${distanceInMm.toFixed(1)} ${gridUnit}`;

  // Billboard behavior - always face camera and scale with distance
  useFrame(() => {
    const scale = calculateScaleFromCamera(midpoint, camera);

    // Scale label group
    if (labelGroupRef.current) {
      labelGroupRef.current.quaternion.copy(camera.quaternion);
      labelGroupRef.current.scale.setScalar(scale);
    }

    // Scale line group (cylinders and cones)
    if (lineGroupRef.current) {
      // TODO: scale the line group
      // LineGroupRef.current.scale.setScalar(scale);
    }
  });

  // Calculate direction and distance for cylinder and cone rotation
  const direction = new THREE.Vector3().subVectors(end, start).normalize();
  const lineDistance = start.distanceTo(end);
  const startQuaternion = new THREE.Quaternion();
  const endQuaternion = new THREE.Quaternion();
  const cylinderQuaternion = new THREE.Quaternion();

  startQuaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().negate());
  endQuaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  cylinderQuaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

  return (
    <group>
      {/* Line group with scaling for cylinders and cones */}
      <group ref={lineGroupRef}>
        {/* Cylinder line */}
        <mesh position={midpoint} quaternion={cylinderQuaternion} userData={{ isMeasurementUi: true }}>
          <cylinderGeometry args={[0.1, 0.1, lineDistance, 16]} />
          <primitive
            object={
              isPreview
                ? new THREE.MeshBasicMaterial({
                    color: '#888888',
                    transparent: true,
                    opacity: 0.5,
                    depthTest: false,
                    depthWrite: false,
                  })
                : materials.coneMaterial
            }
            attach="material"
          />
        </mesh>

        {/* Cone at start */}
        {!isPreview && (
          <mesh position={start} quaternion={startQuaternion} userData={{ isMeasurementUi: true }}>
            <coneGeometry args={[0.2, 0.6, 16]} />
            <primitive object={materials.coneMaterial} attach="material" />
          </mesh>
        )}

        {/* Cone at end */}
        {!isPreview && (
          <mesh position={end} quaternion={endQuaternion} userData={{ isMeasurementUi: true }}>
            <coneGeometry args={[0.2, 0.6, 16]} />
            <primitive object={materials.coneMaterial} attach="material" />
          </mesh>
        )}
      </group>

      {/* Label */}
      {!isPreview && (
        <group ref={labelGroupRef} position={midpoint}>
          {/* Background */}
          <mesh position={[0, 0, 0]} userData={{ isMeasurementUi: true }}>
            {/* eslint-disable-next-line new-cap -- Three.js geometry function */}
            <primitive object={LabelBackgroundGeometry({ text: labelText })} />
            <primitive object={materials.backgroundMaterial} attach="material" />
          </mesh>

          {/* Text */}
          <mesh position={[0, 0.035, 0.001]} userData={{ isMeasurementUi: true }}>
            {/* eslint-disable-next-line new-cap -- Three.js geometry function */}
            <primitive object={LabelTextGeometry({ text: labelText })} />
            <primitive object={materials.textMaterial} attach="material" />
          </mesh>
        </group>
      )}
    </group>
  );
}
