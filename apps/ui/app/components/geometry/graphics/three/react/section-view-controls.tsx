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
export type PlaneSelectorId = 'xy' | 'xz' | 'yz' | 'yx' | 'zx' | 'zy';
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

function getBaseFromSelector(id: PlaneSelectorId): PlaneId {
  if (id === 'xy' || id === 'yx') {
    return 'xy';
  }

  if (id === 'xz' || id === 'zx') {
    return 'xz';
  }

  return 'yz';
}

function getLabelsFor(id: PlaneSelectorId, naming: 'cartesian' | 'face'): [string, string] {
  if (naming === 'cartesian') {
    const label = id.toUpperCase();
    return [label, label];
  }

  // Face naming
  const base = getBaseFromSelector(id);
  if (base === 'xy') {
    const isInverse = id === 'yx';
    return isInverse ? ['Bottom', 'Top'] : ['Top', 'Bottom'];
  }

  if (base === 'xz') {
    const isInverse = id === 'zx';
    return isInverse ? ['Front', 'Back'] : ['Back', 'Front'];
  }

  // Base === 'yz'
  const isInverse = id === 'zy';
  return isInverse ? ['Left', 'Right'] : ['Right', 'Left'];
}

type PlaneSelectorProperties = {
  readonly planeId: PlaneSelectorId;
  readonly position: [number, number, number];
  readonly color: string;
  readonly onClick: (planeId: PlaneSelectorId) => void;
  readonly onHover: (planeId: PlaneSelectorId | undefined) => void;
  readonly matcapTexture: THREE.Texture;
  readonly size: number;
  readonly offset: number;
  readonly naming: 'cartesian' | 'face';
  readonly isExternallyHovered?: boolean;
  readonly textDepth: number;
  readonly labelDepth: number;
  readonly isInverse?: boolean;
};

function PlaneSelector({
  planeId,
  position,
  color,
  onClick,
  onHover,
  matcapTexture,
  size,
  offset,
  naming,
  isExternallyHovered,
  textDepth,
  labelDepth,
  isInverse = false,
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
      const normalizedDir = baseDirection.clone().normalize();
      const baseOffset = normalizedDir.clone().multiplyScalar(desiredWorldOffset);

      // For inverse faces, add an additional offset to account for label depth
      // so they're truly back-to-back without overlapping
      const depthOffset = isInverse
        ? normalizedDir.clone().multiplyScalar(-labelDepth * scale)
        : new THREE.Vector3(0, 0, 0);

      if (planeId === 'xz' || planeId === 'zx') {
        currentGroup.position.copy(baseOffset.sub(depthOffset));
      } else {
        currentGroup.position.copy(baseOffset.add(depthOffset));
      }
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
    onHover(planeId);
  };

  const handlePointerOut = (event: ThreeEvent<PointerEvent>): void => {
    event.stopPropagation();
    setIsHovered(false);
    gl.domElement.style.cursor = 'auto';
    onHover(undefined);
  };

  const [forwardPlaneName] = getLabelsFor(planeId, naming);

  const frontFontGeometry = useMemo(
    // eslint-disable-next-line new-cap -- Three.js naming convention
    () => FontGeometry({ text: forwardPlaneName, depth: textDepth, size: 0.2 }),
    [forwardPlaneName, textDepth],
  );
  const roundedRectangleGeometry = useMemo(
    // eslint-disable-next-line new-cap -- Three.js naming convention
    () => RoundedRectangleGeometry({ width: 1, height: 1, radius: 0.1, smoothness: 16, depth: labelDepth }),
    [labelDepth],
  );
  const darkenedColor = useMemo(() => adjustHexColorBrightness(color, -0.5), [color]);
  const slightlyDarkenedColor = useMemo(() => adjustHexColorBrightness(color, -0.3), [color]);

  const baseRotation = getPlaneRotation(getBaseFromSelector(planeId));
  // For inverse faces, rotate 180 degrees around the plane's normal axis to face the opposite direction
  const rotation = isInverse
    ? baseRotation
    : ((): [number, number, number] => {
        const base = getBaseFromSelector(planeId);
        if (base === 'xy') {
          // Rotate 180° around Z axis
          return [baseRotation[0] + Math.PI, baseRotation[1], baseRotation[2]];
        }

        if (base === 'xz') {
          // Rotate 180° around Y axis
          return [baseRotation[0], baseRotation[1] + Math.PI, baseRotation[2]];
        }

        // Base === 'yz', rotate 180° around X axis
        return [baseRotation[0], baseRotation[1] + Math.PI, baseRotation[2]];
      })();
  const displayedHover = isHovered || Boolean(isExternallyHovered);
  const actualColor = displayedHover ? darkenedColor : slightlyDarkenedColor;

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
      <mesh>
        <primitive object={frontFontGeometry} />
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

type SectionViewControlsProperties = {
  readonly isActive: boolean;
  readonly selectedPlaneId: PlaneId | undefined;
  readonly availablePlanes: AvailablePlane[];
  readonly pivot?: [number, number, number];
  readonly rotation: [number, number, number];
  readonly planeName: 'cartesian' | 'face';
  readonly hoveredSectionViewId: PlaneSelectorId | undefined;
  readonly onSelectPlane: (planeId: PlaneSelectorId) => void;
  readonly onHover: (planeId: PlaneSelectorId | undefined) => void;
  readonly onSetRotation: (rotation: THREE.Euler) => void;
  readonly onSetPivot?: (value: [number, number, number]) => void;
};

export function SectionViewControls({
  isActive,
  selectedPlaneId,
  availablePlanes,
  pivot,
  rotation,
  planeName,
  hoveredSectionViewId,
  onSelectPlane,
  onHover,
  onSetRotation,
  onSetPivot,
}: SectionViewControlsProperties): React.JSX.Element | undefined {
  const transformControlsRef = useRef<THREE.Object3D>(undefined);
  // Track the latest rotation locally to project translation along the rotated plane normal
  const rotationRef = useRef<THREE.Euler>(new THREE.Euler(0, 0, 0));
  // Keep an optional world-space anchor so the gizmo doesn't "jump" after rotations
  const anchorPositionRef = useRef<THREE.Vector3 | undefined>(undefined);
  const matcapTexture = useMemo(() => matcapMaterial(), []);
  // Track whether the user is actively dragging translate/rotate so we don't override the position mid-drag
  const isTranslatingRef = useRef<boolean>(false);
  const isRotatingRef = useRef<boolean>(false);
  // World-space pivot point to keep the plane anchored during rotation
  const pivotPointRef = useRef<THREE.Vector3>(new THREE.Vector3());

  const planes = React.useMemo(() => {
    const planes: Array<{ idPos: PlaneSelectorId; idNeg: PlaneSelectorId; normal: THREE.Vector3; color: string }> = [
      { idPos: 'xy', idNeg: 'yx', normal: new THREE.Vector3(0, 0, -1), color: '#3b82f6' },
      { idPos: 'xz', idNeg: 'zx', normal: new THREE.Vector3(0, -1, 0), color: '#22c55e' },
      { idPos: 'yz', idNeg: 'zy', normal: new THREE.Vector3(-1, 0, 0), color: '#ef4444' },
    ];

    return planes;
  }, []);

  // Find the selected plane configuration
  const selectedPlane = availablePlanes.find((plane) => plane.id === selectedPlaneId);

  // Calculate plane properties before any conditional returns
  const [nx, ny, nz] = selectedPlane?.normal ?? [0, 0, 1];
  const normal = new THREE.Vector3(nx, ny, nz);

  // Single frame loop to keep rotation and position in sync.
  // - When not dragging rotate: sync object rotation from props
  // - When not dragging translate/rotate: position object at pivot
  useFrame(() => {
    const { current } = transformControlsRef;
    if (!current || !selectedPlane) {
      return;
    }

    // Sync external rotation when not rotating
    if (!isRotatingRef.current) {
      rotationRef.current.set(rotation[0], rotation[1], rotation[2]);
      current.rotation.set(rotation[0], rotation[1], rotation[2]);
    }

    // While dragging, do not override transform-controls position
    if (isRotatingRef.current || isTranslatingRef.current) {
      return;
    }

    // Keep anchor if set (post-drag/rotate)
    if (anchorPositionRef.current) {
      current.position.copy(anchorPositionRef.current);
      return;
    }

    // Controlled position from pivot
    if (pivot) {
      current.position.set(pivot[0], pivot[1], pivot[2]);
    }
  });

  // Keep transform controls controlled by external state changes.
  // When plane selection, translation, or rotation are changed via the UI/state
  // (not by dragging), clear any anchor so the gizmo snaps to the computed
  // position in the next frame.
  React.useEffect(() => {
    if (isTranslatingRef.current || isRotatingRef.current) {
      return;
    }

    anchorPositionRef.current = undefined;
  }, [selectedPlaneId, rotation, pivot]);

  if (!isActive) {
    return undefined;
  }

  // If no plane is selected, show the 6 plane selectors (3 base + 3 inverse faces)
  // Constants for depth calculations - extracted to allow precise back-to-back positioning
  const textDepth = 0.01;
  const labelDepth = 0.02;
  const offsetPx = 40;
  if (!selectedPlane) {
    return (
      <group>
        {planes.map(({ idPos, idNeg, normal, color }) => {
          let position: [number, number, number] = normal.toArray();
          switch (idPos) {
            case 'xy': {
              position = [0, 0, -1];

              break;
            }

            case 'xz': {
              position = [0, 1, 0];

              break;
            }

            case 'yz': {
              position = [-1, 0, 0];

              break;
            }
            // No default
          }

          return (
            <group key={idPos}>
              <PlaneSelector
                isInverse
                matcapTexture={matcapTexture}
                planeId={idPos}
                position={position}
                color={color}
                size={60}
                offset={offsetPx}
                naming={planeName}
                isExternallyHovered={hoveredSectionViewId === idPos}
                textDepth={textDepth}
                labelDepth={labelDepth}
                onClick={onSelectPlane}
                onHover={onHover}
              />
              <PlaneSelector
                isInverse={false}
                matcapTexture={matcapTexture}
                planeId={idNeg}
                position={position}
                color={color}
                size={60}
                offset={offsetPx}
                naming={planeName}
                isExternallyHovered={hoveredSectionViewId === idNeg}
                textDepth={textDepth}
                labelDepth={labelDepth}
                onClick={onSelectPlane}
                onHover={onHover}
              />
            </group>
          );
        })}
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
          if (!isTranslatingRef.current) {
            return;
          }

          const currentObject = transformControlsRef.current;
          if (currentObject) {
            const { position } = currentObject;
            if (onSetPivot) {
              onSetPivot([position.x, position.y, position.z]);
            }
          }
        }}
        onPointerDown={() => {
          // Keep current anchor so the gizmo does not snap to the plane projection
          isTranslatingRef.current = true;
        }}
        onPointerUp={() => {
          isTranslatingRef.current = false;
          // Persist the final world position as the new anchor to avoid any post-drag snapping
          if (transformControlsRef.current) {
            anchorPositionRef.current = transformControlsRef.current.position.clone();
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
          if (!isRotatingRef.current) {
            return;
          }

          const currentObject = transformControlsRef.current;
          if (currentObject) {
            // Extract the rotation from the object
            const rotation = currentObject.rotation.clone();
            rotationRef.current.copy(rotation);
            onSetRotation(rotation);
            // Do not change translation here; machine derives display value from pivot
          }
        }}
        onPointerDown={() => {
          isRotatingRef.current = true;
          if (transformControlsRef.current) {
            // Capture current gizmo world position as the rotation pivot
            pivotPointRef.current.copy(transformControlsRef.current.position);
            // Set anchor so when rotation ends the gizmo stays where it was left
            anchorPositionRef.current = pivotPointRef.current.clone();
          }
        }}
        onPointerUp={() => {
          isRotatingRef.current = false;
          // Keep anchor until the next manipulation (or translation drag)
        }}
      />
    </group>
  );
}
