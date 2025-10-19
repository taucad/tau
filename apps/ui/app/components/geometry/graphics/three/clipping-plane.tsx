import React, { useRef, useState, useEffect } from 'react';
import type { ComponentProps } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { Html, TransformControls } from '@react-three/drei';
import { useSelector } from '@xstate/react';
import { useFrame, useThree } from '@react-three/fiber';
import { ArrowLeftRight } from 'lucide-react';
import { graphicsActor } from '#routes/builds_.$id/graphics-actor.js';
import { Button } from '#components/ui/button.js';
import { ChatParametersInputNumber } from '#routes/builds_.$id/chat-parameters-input-number.js';

type PlaneId = 'xy' | 'xz' | 'yz';

// Convert a pixel measure to world units at a given world-space point.
// Accepts a loosely-typed viewport to avoid version-specific type coupling.
type PixelsToWorldUnitsInput = {
  viewport: unknown;
  camera: THREE.Camera;
  size: { width: number; height: number };
  at: THREE.Vector3;
  pixels: number;
};

function pixelsToWorldUnits({ viewport, camera, size, at, pixels }: PixelsToWorldUnitsInput): number {
  const { getCurrentViewport } = viewport as { getCurrentViewport: (...args: unknown[]) => unknown };
  const vp = getCurrentViewport(camera, at) as { width: number; height: number };
  const worldPerPixel = vp.height / size.height;
  return pixels * worldPerPixel;
}

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
    return [-Math.PI / 2, 0, 0];
  }

  // PlaneId === 'yz'
  // Rotate to face +X
  return [0, Math.PI / 2, 0];
}

// Calculate quaternion to align arrow with normal direction
function calculateArrowQuaternion(normal: THREE.Vector3): THREE.Quaternion {
  const upVector = new THREE.Vector3(0, 1, 0);
  return new THREE.Quaternion().setFromUnitVectors(upVector, normal.clone().normalize());
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

// Calculate quaternion to make HTML label face the camera
function calculateHtmlRotationToFaceCamera(camera: THREE.Camera, htmlPosition: THREE.Vector3): THREE.Quaternion {
  const direction = new THREE.Vector3().subVectors(camera.position, htmlPosition).normalize();

  // Create a quaternion that makes the label face the camera
  const quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  matrix.lookAt(htmlPosition, camera.position, camera.up);
  quaternion.setFromRotationMatrix(matrix);

  return quaternion;
}

// Calculate quaternion for arrow controls HTML to stay perpendicular to the clipping plane
function calculateArrowControlQuaternion(
  normal: THREE.Vector3,
  camera: THREE.Camera,
  position: THREE.Vector3,
): THREE.Quaternion {
  // Get the direction from position to camera
  const toCamera = camera.position.clone().sub(position).normalize();

  // Project toCamera onto the plane (remove component along normal)
  const projectedToCamera = toCamera
    .clone()
    .sub(normal.clone().multiplyScalar(toCamera.dot(normal)))
    .normalize();

  // If the projected vector is too small, use a fallback
  if (projectedToCamera.lengthSq() < 0.01) {
    // Camera is looking directly along the normal, use any perpendicular vector
    const perpendicular = new THREE.Vector3();
    if (Math.abs(normal.x) < 0.9) {
      perpendicular.set(1, 0, 0);
    } else {
      perpendicular.set(0, 1, 0);
    }

    perpendicular.cross(normal).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), perpendicular);
  }

  // Create quaternion that orients +X axis along projectedToCamera and +Y along normal
  const quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();

  // Right vector (along projectedToCamera)
  const right = projectedToCamera;
  // Up vector (along normal)
  const up = normal.clone();
  // Forward vector (perpendicular to both)
  const forward = new THREE.Vector3().crossVectors(right, up).normalize();

  matrix.makeBasis(right, up, forward);
  quaternion.setFromRotationMatrix(matrix);

  return quaternion;
}

type PlaneSelectorProperties = {
  readonly planeId: PlaneId;
  readonly position: [number, number, number];
  readonly color: string;
  readonly isSelected: boolean;
  readonly onClick: (planeId: PlaneId) => void;
};

function PlaneSelector({ planeId, position, color, isSelected, onClick }: PlaneSelectorProperties): React.JSX.Element {
  const { gl, camera, size, viewport } = useThree();
  const [isHovered, setIsHovered] = React.useState(false);
  const meshRef = useRef<THREE.Mesh>(null);
  const htmlQuaternionRef = useRef<THREE.Quaternion>(new THREE.Quaternion());
  // Target on-screen size for the selector in pixels (width == height)
  const targetScreenSizePx = 80;
  // Target on-screen distance from origin in pixels
  const targetScreenOffsetPx = 120;

  // Keep the selector a constant screen size and screen offset by updating each frame
  useFrame(() => {
    const currentMesh = meshRef.current;
    if (!currentMesh) {
      return;
    }

    const origin = new THREE.Vector3(0, 0, 0);
    const desiredWorldSize = pixelsToWorldUnits({ viewport, camera, size, at: origin, pixels: targetScreenSizePx });
    const desiredWorldOffset = pixelsToWorldUnits({ viewport, camera, size, at: origin, pixels: targetScreenOffsetPx });

    // Base geometry is 1x1, so scale directly to desired world size
    const scale = desiredWorldSize;
    currentMesh.scale.set(scale, scale, 1);

    // Move the selector so its distance from origin stays constant in screen space
    const baseDirection = new THREE.Vector3(position[0], position[1], position[2]);
    if (baseDirection.lengthSq() > 0) {
      baseDirection.normalize().multiplyScalar(desiredWorldOffset);
      currentMesh.position.copy(baseDirection);

      // Update HTML rotation to face camera
      htmlQuaternionRef.current = calculateHtmlRotationToFaceCamera(camera, currentMesh.position);
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

  // Calculate opacity: selected=1, hovered=0.9, default=0.7
  const opacity = isSelected ? 1 : isHovered ? 0.7 : 0.5;

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={rotation}
      renderOrder={20_000}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial transparent color={color} opacity={opacity} side={THREE.DoubleSide} depthTest={false} />
      <Html center transform position={[0, 0, 0.01]}>
        <div className="pointer-events-none rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white uppercase">
          {planeId.toUpperCase()}
        </div>
      </Html>
    </mesh>
  );
}

type CustomArrowProperties = {
  readonly position: THREE.Vector3;
  readonly normal: THREE.Vector3;
} & ComponentProps<'group'>;

const lineSegmentLength = 2;

const getDottedLineSegments = (totalLength: number, segmentLength: number): number => {
  return Math.floor(totalLength / segmentLength);
};

function DottedSegments({ position, normal, ...properties }: CustomArrowProperties): React.JSX.Element {
  const { viewport, size, camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const thicknessPixelsPerUnit = 5; // Tune visual thickness

  const quaternion = calculateArrowQuaternion(normal);

  // Calculate distance along the normal direction (works for any axis)
  const distanceAlongNormal = position.length() * 2;
  const dottedLineSegments = getDottedLineSegments(distanceAlongNormal, lineSegmentLength);

  useFrame(() => {
    const s = pixelsToWorldUnits({ viewport, camera, size, at: position, pixels: thicknessPixelsPerUnit });
    if (groupRef.current) {
      groupRef.current.scale.set(s, 1, s); // Keep length (Y) in world units; scale thickness only
    }
  });

  return (
    <group
      ref={groupRef}
      position={[position.x, position.y, position.z]}
      quaternion={quaternion}
      renderOrder={20_000}
      {...properties}
    >
      {/* Dotted line segment to indicate distance from origin */}
      {Array.from({ length: dottedLineSegments }).map((_, index) => {
        if (index % 2 === 0) {
          return (
            // eslint-disable-next-line react/no-array-index-key -- index is constant.
            <mesh key={index} position={[0, distanceAlongNormal - (index + 1) * lineSegmentLength, 0]}>
              <cylinderGeometry args={[0.2, 0.2, lineSegmentLength, 8]} />
              <meshBasicMaterial color="#444444" depthWrite={false} depthTest={false} stencilWrite={false} />
            </mesh>
          );
        }

        return null;
      })}
    </group>
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
        <div className="group relative size-16 flex-1 hover:cursor-pointer">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="absolute top-0 right-0 size-16 flex-1 stroke-border group-hover:stroke-primary"
            viewBox="0 0 24 24"
            stroke-width="4"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M 16.5 10 L 19 12" />
            <path d="M 19 12 L 16.5 14.5" />
            <path d="M5 12h14" />
          </svg>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="absolute top-0 right-0 size-16 flex-1 stroke-sidebar"
            viewBox="0 0 24 24"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M 16.5 10 L 19 12" />
            <path d="M 19 12 L 16.5 14.5" />
            <path d="M5 12h14" />
          </svg>
        </div>
      </div>
    </Html>
  );
}

export function ClippingPlane(): React.JSX.Element | undefined {
  const transformControlsRef = useRef<THREE.Object3D>(null);
  const [isDragging, setIsDragging] = useState(false);

  const camera = useThree((state) => state.camera);

  // Subscribe to graphics machine state
  const isActive = useSelector(graphicsActor, (state) => state.context.isClippingPlaneActive);
  const selectedPlaneId = useSelector(graphicsActor, (state) => state.context.selectedClippingPlaneId);
  const translation = useSelector(graphicsActor, (state) => state.context.clippingPlaneTranslation);
  const direction = useSelector(graphicsActor, (state) => state.context.clippingPlaneDirection);
  const availablePlanes = useSelector(graphicsActor, (state) => state.context.availableClippingPlanes);

  // Find the selected plane configuration
  const selectedPlane = availablePlanes.find((plane) => plane.id === selectedPlaneId);

  const handlePlaneSelect = (planeId: PlaneId): void => {
    graphicsActor.send({
      type: 'selectClippingPlane',
      payload: planeId,
    });
  };

  const handleDirectionToggle = (): void => {
    graphicsActor.send({
      type: 'toggleClippingPlaneDirection',
    });
  };

  // Calculate plane properties before any conditional returns
  const [nx, ny, nz] = selectedPlane?.normal ?? [0, 0, 1];
  const normal = new THREE.Vector3(nx, ny, nz).multiplyScalar(direction);
  const controlPosition = calculateControlPosition(normal, translation);

  const uiPadding = 5;
  const uiPosition = calculateUiPosition(normal, translation, uiPadding);

  // Update transform controls position based on translation
  useEffect(() => {
    if (transformControlsRef.current && selectedPlane) {
      const [x, y, z] = selectedPlane.normal;
      const normal = new THREE.Vector3(x, y, z).multiplyScalar(direction);
      const position = normal.clone().multiplyScalar(translation);
      transformControlsRef.current.position.copy(position);
    }
  }, [translation, selectedPlane, direction]);

  if (!isActive) {
    return undefined;
  }

  // If no plane is selected, show the 3 plane selectors
  // Position them spread out in 3D space so they're not stacked
  if (!selectedPlane) {
    return (
      <group>
        <PlaneSelector
          planeId="xy"
          position={[20, -20, 0]}
          color="#3b82f6"
          isSelected={false}
          onClick={handlePlaneSelect}
        />
        <PlaneSelector
          planeId="xz"
          position={[20, 0, 20]}
          color="#22c55e"
          isSelected={false}
          onClick={handlePlaneSelect}
        />
        <PlaneSelector
          planeId="yz"
          position={[0, -20, 20]}
          color="#ef4444"
          isSelected={false}
          onClick={handlePlaneSelect}
        />
      </group>
    );
  }

  return (
    <group>
      {/* Hidden transform controls for dragging logic */}
      <mesh ref={transformControlsRef} position={controlPosition}>
        <boxGeometry args={[0.1, 0.1, 0.1]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      <TransformControls
        object={transformControlsRef.current ?? undefined}
        mode="translate"
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
            graphicsActor.send({
              type: 'setClippingPlaneTranslation',
              payload: projectedDistance,
            });
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
        onTranslationChange={(value) => {
          graphicsActor.send({
            type: 'setClippingPlaneTranslation',
            payload: value,
          });
        }}
        onDirectionToggle={handleDirectionToggle}
      />

      {/* Custom arrow visual */}
      <DottedSegments position={controlPosition} normal={normal} />
    </group>
  );
}
