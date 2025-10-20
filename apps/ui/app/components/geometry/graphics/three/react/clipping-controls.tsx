import React, { useRef, useState, useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { Html, RoundedBoxGeometry } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { ArrowLeftRight } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { ChatParametersInputNumber } from '#routes/builds_.$id/chat-parameters-input-number.js';
import { TransformControls } from '#components/geometry/graphics/three/react/transform-controls-drei.js';
import { pixelsToWorldUnits } from '#components/geometry/graphics/three/utils/spatial.utils.js';
import { matcapMaterial } from '#components/geometry/graphics/three/materials/matcap-material.js';

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
    return [-Math.PI / 2, 0, Math.PI];
  }

  // PlaneId === 'yz'
  // Rotate to face +X
  return [Math.PI / 2, Math.PI / 2, 0];
}

// Calculate the direction from normal vector
function getDirectionFromNormal(normal: THREE.Vector3): 'positive' | 'negative' {
  if (normal.x === 1) {
    return 'positive';
  }

  if (normal.x === -1) {
    return 'negative';
  }

  if (normal.y === 1) {
    return 'positive';
  }

  if (normal.y === -1) {
    return 'negative';
  }

  if (normal.z === -1) {
    return 'negative';
  }

  return 'positive';
}

// Calculate plane label from normal vector
function getPlaneLabelFromNormal(normal: THREE.Vector3): 'XY' | 'XZ' | 'YZ' {
  if (Math.abs(normal.x) === 1) {
    return 'YZ';
  }

  if (Math.abs(normal.y) === 1) {
    return 'XZ';
  }

  if (Math.abs(normal.z) === 1) {
    return 'XY';
  }

  throw new Error(`Invalid camera normal vector: [${normal.x}, ${normal.y}, ${normal.z}]`);
}

type PerpendicularDirectionVector = [1, 0, 0] | [0, 1, 0] | [0, 0, 1] | [-1, 0, 0] | [0, -1, 0] | [0, 0, -1];

/**
 * Calculate the perpendicular unit vector from the normal vector.
 * @param normal - The normal vector of the plane.
 * @returns The perpendicular unit vector `[x, y, z]` in the plane of the normal vector.
 */
function getPerpendicularVector(normal: THREE.Vector3): PerpendicularDirectionVector {
  if (normal.x === 1) {
    return [0, 1, 0];
  }

  if (normal.y === 1) {
    return [0, 1, 0];
  }

  if (normal.z === 1) {
    return [1, 0, 0];
  }

  if (normal.x === -1) {
    return [0, -1, 0];
  }

  if (normal.y === -1) {
    return [0, -1, 0];
  }

  if (normal.z === -1) {
    return [1, 0, 0];
  }

  throw new Error('Invalid camera normal vector');
}

// Calculate control position from normal and translation
function calculateControlPosition(normal: THREE.Vector3, translation: number): THREE.Vector3 {
  return normal.clone().multiplyScalar(translation);
}

// Calculate UI position with padding offset for UI positioning
function calculateUiPosition(normal: THREE.Vector3, translation: number, padding: number): THREE.Vector3 {
  return normal.clone().multiplyScalar(translation - padding);
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
  const meshRef = useRef<THREE.Mesh>(null);
  const baseDirection = useMemo<THREE.Vector3>(
    () => new THREE.Vector3(position[0], position[1], position[2]),
    [position],
  );
  const origin = useMemo<THREE.Vector3>(() => new THREE.Vector3(0, 0, 0), []);

  // Keep the selector a constant screen size and screen offset by updating each frame
  useFrame(() => {
    const currentMesh = meshRef.current;
    if (!currentMesh) {
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
    currentMesh.scale.set(scale, scale, scale);

    if (baseDirection.lengthSq() > 0) {
      baseDirection.normalize().multiplyScalar(desiredWorldOffset);
      currentMesh.position.copy(baseDirection);
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

  const rotation = getPlaneRotation(planeId);

  const opacity = isHovered ? 0.7 : 0.5;

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={rotation}
      renderOrder={Infinity}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <RoundedBoxGeometry args={[1, 1, 0.1]} />
      <meshMatcapMaterial
        transparent
        matcap={matcapTexture}
        color={color}
        opacity={opacity}
        side={THREE.FrontSide}
        depthTest={false}
        depthWrite={false}
      />
      <Html
        transform
        // Disable pointer events on the HTML wrapper to give clickability to the mesh
        wrapperClass="[&_div]:pointer-events-none!"
      >
        <div className="rounded bg-transparent font-mono text-xs text-white uppercase">{planeId.toUpperCase()}</div>
      </Html>
    </mesh>
  );
}

type ArrowControlsProperties = {
  readonly position: THREE.Vector3;
  readonly normal: THREE.Vector3;
  readonly camera: THREE.Camera;
  readonly translation: number;
  readonly isDragging: boolean;
  readonly onTranslationChange: (value: number) => void;
  readonly onDirectionToggle: () => void;
};

function ArrowControls({
  position,
  normal,
  camera,
  translation,
  isDragging,
  onTranslationChange,
  onDirectionToggle,
}: ArrowControlsProperties): React.JSX.Element {
  const { viewport, size } = useThree();
  const [inputValue, setInputValue] = useState(translation.toFixed(2));
  const htmlRef = useRef<HTMLDivElement>(null);
  const targetScreenScalePx = 200; // Approximate width for the control cluster

  useEffect(() => {
    setInputValue(translation.toFixed(2));
  }, [translation, isDragging]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      const value = Number.parseFloat(inputValue);
      if (!Number.isNaN(value)) {
        onTranslationChange(value);
      }
    }
  };

  const handleDirectionToggle = (event: React.MouseEvent): void => {
    event.stopPropagation();
    onDirectionToggle();
  };

  const direction = getDirectionFromNormal(normal);
  const planeLabel = getPlaneLabelFromNormal(normal);
  const normalisedDirectionVector = getPerpendicularVector(normal);

  const cameraQuaternionRef = useRef<THREE.Quaternion>(new THREE.Quaternion());

  useFrame(() => {
    if (Math.abs(normal.x) === 1) {
      const perpendicularQuaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(...normalisedDirectionVector),
        camera.position.clone().cross(normal).normalize(),
      );
      cameraQuaternionRef.current = perpendicularQuaternion;
    } else if (Math.abs(normal.y) === 1) {
      const cameraNormal = camera.position.clone().sub(position);
      const perpendicularQuaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        cameraNormal
          .clone()
          .cross(new THREE.Vector3(0, 1, 0))
          .normalize(),
      );
      cameraQuaternionRef.current = perpendicularQuaternion;
    }
  });

  // Keep the HTML controls a consistent on-screen size
  useFrame(() => {
    const worldUnit = pixelsToWorldUnits({ viewport, camera, size, at: position, pixels: targetScreenScalePx });
    const scale = worldUnit / 5; // Tune: Html receives scale prop; base content roughly ~10 world units wide
    if (htmlRef.current) {
      // Html wraps children; we adjust its transform scale prop via style since ref points to element
      htmlRef.current.style.transform = `scale(${scale})`;
      htmlRef.current.style.transformOrigin = 'left center';
    }
  });

  return (
    <Html
      //
      ref={htmlRef}
      transform
      position={[position.x, position.y, position.z]}
      quaternion={cameraQuaternionRef.current}
      renderOrder={10_000}
    >
      <div
        data-direction={direction}
        className="flex flex-row-reverse items-center gap-2 select-none data-[direction=positive]:flex-row"
      >
        <Button
          variant="overlay"
          className="h-6 rounded-full px-2 shadow-md hover:ring-3 hover:ring-ring/50"
          type="button"
          aria-label="Toggle clipping plane direction"
          onClick={handleDirectionToggle}
        >
          <span className="font-mono text-xs">{planeLabel}</span>
          <ArrowLeftRight className="size-3" />
        </Button>
        <ChatParametersInputNumber
          name="clipping-plane-translation"
          value={inputValue}
          className="h-7 w-24 origin-left hover:ring-3 hover:ring-ring/50 dark:bg-sidebar"
          onChange={(event) => {
            setInputValue(event.target.value);
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
    </Html>
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
  readonly uiPadding?: number;
};

export function ClippingControls({
  isActive,
  selectedPlaneId,
  availablePlanes,
  translation,
  direction,
  onSelectPlane,
  onToggleDirection,
  onSetTranslation,
  onSetRotation,
  uiPadding = 15,
}: ClippingControlsProperties): React.JSX.Element | undefined {
  const transformControlsRef = useRef<THREE.Object3D>(undefined);
  const [isDragging, setIsDragging] = useState(false);
  const matcapTexture = useMemo(() => matcapMaterial(), []);

  const camera = useThree((state) => state.camera);

  // Find the selected plane configuration
  const selectedPlane = availablePlanes.find((plane) => plane.id === selectedPlaneId);

  // Calculate plane properties before any conditional returns
  const [nx, ny, nz] = selectedPlane?.normal ?? [0, 0, 1];
  const normal = new THREE.Vector3(nx, ny, nz).multiplyScalar(direction);
  const controlPosition = calculateControlPosition(normal, translation);

  const uiPosition = calculateUiPosition(normal, translation, uiPadding);

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
        onMouseDown={() => {
          setIsDragging(true);
        }}
        onMouseUp={() => {
          setIsDragging(false);
        }}
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
        onMouseDown={() => {
          setIsDragging(true);
        }}
        onMouseUp={() => {
          setIsDragging(false);
        }}
        onChange={() => {
          const currentObject = transformControlsRef.current;
          if (currentObject) {
            // Extract the rotation from the object
            const rotation = currentObject.rotation.clone();
            onSetRotation(rotation);
          }
        }}
      />

      {/* Input and toggle button UI */}
      <ArrowControls
        camera={camera}
        position={uiPosition}
        translation={translation}
        isDragging={isDragging}
        normal={normal}
        onTranslationChange={onSetTranslation}
        onDirectionToggle={onToggleDirection}
      />
    </group>
  );
}
