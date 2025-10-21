import React, { useRef, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { TransformControls } from '#components/geometry/graphics/three/react/transform-controls-drei.js';
import { pixelsToWorldUnits } from '#components/geometry/graphics/three/utils/spatial.utils.js';
import { matcapMaterial } from '#components/geometry/graphics/three/materials/matcap-material.js';
import { FontGeometry } from '#components/geometry/graphics/three/geometries/font-geometry.js';
import { RoundedRectangleGeometry } from '#components/geometry/graphics/three/geometries/rounded-rectangle-geometry.js';
import { adjustHexColorBrightness } from '#utils/color.utils.js';

export type PlaneId = 'xy' | 'xz' | 'yz';

// Calculate rotation for plane selector based on plane orientation
// - XY plane: normal = [0, 0, 1], no rotation needed (default orientation)
// - XZ plane: normal = [0, 1, 0], rotate -90° around X axis
// - YZ plane: normal = [1, 0, 0], rotate 90° around Y axis
function getPlaneRotation(planeId: PlaneId): [number, number, number] {
  if (planeId === 'xy') {
    // No rotation, faces +Z
    return [0, 0, 0];
  }

  if (planeId === 'xz') {
    // Rotate to face +Y
    return [-Math.PI / 2, Math.PI, Math.PI];
  }

  // PlaneId === 'yz'
  // Rotate to face +X
  return [Math.PI / 2, Math.PI / 2, 0];
}

type PlaneSelectorProperties = {
  readonly planeId: PlaneId;
  readonly position: [number, number, number];
  readonly color: string;
  readonly onClick: (planeId: PlaneId) => void;
  readonly matcapTexture: THREE.Texture;
  readonly size: number;
  readonly offset: number;
};

function PlaneSelector({
  planeId,
  position,
  color,
  onClick,
  matcapTexture,
  size,
  offset,
}: PlaneSelectorProperties): React.JSX.Element {
  const { gl, camera, size: threeSize, viewport } = useThree();
  const [isHovered, setIsHovered] = React.useState(false);
  const groupRef = useRef<THREE.Group>(null);
  const baseDirection = useMemo<THREE.Vector3>(
    () => new THREE.Vector3(position[0], position[1], position[2]),
    [position],
  );
  const origin = useMemo<THREE.Vector3>(() => new THREE.Vector3(0, 0, 0), []);

  // Keep the selector a constant screen size and screen offset by updating each frame
  useFrame(() => {
    const currentGroup = groupRef.current;
    if (!currentGroup) {
      return;
    }

    const desiredWorldSize = pixelsToWorldUnits({
      viewport,
      camera,
      size: threeSize,
      at: origin,
      pixels: size,
    });
    const desiredWorldOffset = pixelsToWorldUnits({
      viewport,
      camera,
      size: threeSize,
      at: origin,
      pixels: offset,
    });

    // Base geometry is 1x1, so scale directly to desired world size
    const scale = desiredWorldSize;
    currentGroup.scale.set(scale, scale, scale);

    if (baseDirection.lengthSq() > 0) {
      baseDirection.normalize().multiplyScalar(desiredWorldOffset);
      currentGroup.position.copy(baseDirection);
    }
  });

  const handleClick = (event: ThreeEvent<MouseEvent>): void => {
    event.stopPropagation();
    onClick(planeId);
  };

  const handlePointerOver = (event: ThreeEvent<PointerEvent>): void => {
    event.stopPropagation();
    setIsHovered(true);
    gl.domElement.style.cursor = 'pointer';
  };

  const handlePointerOut = (event: ThreeEvent<PointerEvent>): void => {
    event.stopPropagation();
    setIsHovered(false);
    gl.domElement.style.cursor = 'auto';
  };

  const textDepth = 0.025;

  const fontGeometry = useMemo(
    // eslint-disable-next-line new-cap -- Three.js naming convention
    () => FontGeometry({ text: planeId.toUpperCase(), depth: textDepth, size: 0.2 }),
    [planeId],
  );
  const roundedRectangleGeometry = useMemo(
    // eslint-disable-next-line new-cap -- Three.js naming convention
    () => RoundedRectangleGeometry({ width: 1, height: 1, radius: 0.1, smoothness: 16, depth: 0.05 }),
    [],
  );

  const rotation = getPlaneRotation(planeId);

  const actualColor = isHovered ? adjustHexColorBrightness(color, -0.5) : adjustHexColorBrightness(color, -0.3);

  return (
    <group ref={groupRef} renderOrder={Infinity} position={position} rotation={rotation}>
      <mesh onClick={handleClick} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
        <primitive object={roundedRectangleGeometry} />
        <meshMatcapMaterial
          transparent
          matcap={matcapTexture}
          color={actualColor}
          opacity={1}
          side={THREE.FrontSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0, textDepth]}>
        <primitive object={fontGeometry} />
        <meshMatcapMaterial
          transparent
          matcap={matcapTexture}
          color="black"
          opacity={1}
          side={THREE.FrontSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export type AvailablePlane = { id: PlaneId; normal: [number, number, number]; constant: number };

type ClippingControlsProperties = {
  readonly isActive: boolean;
  readonly selectedPlaneId: PlaneId | undefined;
  readonly availablePlanes: AvailablePlane[];
  readonly translation: number;
  readonly direction: 1 | -1;
  readonly onSelectPlane: (planeId: PlaneId) => void;
  readonly onToggleDirection: () => void;
  readonly onSetTranslation: (value: number) => void;
  readonly onSetRotation: (rotation: THREE.Euler) => void;
};

export function ClippingControls({
  isActive,
  selectedPlaneId,
  availablePlanes,
  translation,
  direction,
  onSelectPlane,
  // @ts-expect-error -- USE THIS
  onToggleDirection,
  onSetTranslation,
  onSetRotation,
}: ClippingControlsProperties): React.JSX.Element | undefined {
  const transformControlsRef = useRef<THREE.Object3D>(undefined);
  const matcapTexture = useMemo(() => matcapMaterial(), []);

  // Find the selected plane configuration
  const selectedPlane = availablePlanes.find((plane) => plane.id === selectedPlaneId);

  // Calculate plane properties before any conditional returns
  const [nx, ny, nz] = selectedPlane?.normal ?? [0, 0, 1];
  const normal = new THREE.Vector3(nx, ny, nz).multiplyScalar(direction);

  // Update transform controls position based on translation
  useFrame(() => {
    if (transformControlsRef.current && selectedPlane) {
      const [x, y, z] = selectedPlane.normal;
      const nextNormal = new THREE.Vector3(x, y, z).multiplyScalar(direction);
      const position = nextNormal.clone().multiplyScalar(translation);
      transformControlsRef.current.position.copy(position);
    }
  });

  if (!isActive) {
    return undefined;
  }

  // If no plane is selected, show the 3 plane selectors
  if (!selectedPlane) {
    return (
      <group>
        <PlaneSelector
          matcapTexture={matcapTexture}
          planeId="xy"
          position={[20, -20, 0]}
          color="#3b82f6"
          size={60}
          offset={60}
          onClick={onSelectPlane}
        />
        <PlaneSelector
          matcapTexture={matcapTexture}
          planeId="xz"
          position={[20, 0, 20]}
          color="#22c55e"
          size={60}
          offset={60}
          onClick={onSelectPlane}
        />
        <PlaneSelector
          matcapTexture={matcapTexture}
          planeId="yz"
          position={[0, -20, 20]}
          color="#ef4444"
          size={60}
          offset={60}
          onClick={onSelectPlane}
        />
      </group>
    );
  }

  return (
    <group>
      {/* Hidden transform controls for dragging logic */}
      <mesh ref={transformControlsRef}>
        <boxGeometry args={[0.1, 0.1, 0.1]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      <TransformControls
        object={transformControlsRef as React.RefObject<THREE.Object3D>}
        mode="translate"
        space="local"
        size={1}
        visible={false}
        showX={Math.abs(normal.x) > 0.5}
        showY={Math.abs(normal.y) > 0.5}
        showZ={Math.abs(normal.z) > 0.5}
        onChange={() => {
          const currentObject = transformControlsRef.current;
          if (currentObject) {
            // Project the position onto the normal axis
            const { position } = currentObject;
            const projectedDistance = position.dot(normal);
            onSetTranslation(projectedDistance);
          }
        }}
      />
      <TransformControls
        object={transformControlsRef as React.RefObject<THREE.Object3D>}
        mode="rotate"
        space="local"
        size={1}
        visible={false}
        showX={Math.abs(normal.y) > 0.5 || Math.abs(normal.z) > 0.5}
        showY={Math.abs(normal.x) > 0.5 || Math.abs(normal.z) > 0.5}
        showZ={Math.abs(normal.x) > 0.5 || Math.abs(normal.y) > 0.5}
        onChange={() => {
          const currentObject = transformControlsRef.current;
          if (currentObject) {
            // Extract the rotation from the object
            const rotation = currentObject.rotation.clone();
            onSetRotation(rotation);
          }
        }}
      />
    </group>
  );
}
