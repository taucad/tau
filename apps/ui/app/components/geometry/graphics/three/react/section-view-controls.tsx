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
import { topMostRenderOrder } from '#components/geometry/graphics/three/utils/render-order.utils.js';

// Module-scope scratch vectors for PlaneSelector useFrame (avoids per-frame allocations)
// oxlint-disable-next-line unicorn-js/prevent-abbreviations -- dir refers to direction vector, not directory
const _normalizedDir = new THREE.Vector3();
const _baseOffset = new THREE.Vector3();
const _depthOffset = new THREE.Vector3();

export type PlaneId = 'xy' | 'xz' | 'yz';
export type PlaneSelectorId = 'xy' | 'xz' | 'yz' | 'yx' | 'zx' | 'zy';
export type UpDirection = 'x' | 'y' | 'z';

/**
 * Get the plane position for a given plane ID and up direction.
 * The position determines where the plane selector is placed in 3D space.
 *
 * In each coordinate system, we want the "horizontal" plane (Top/Bottom) to be
 * positioned along the up axis, and the vertical planes to be positioned along
 * the other two axes.
 */
function getPlanePositionForUpDirection(planeId: PlaneId, upDirection: UpDirection): [number, number, number] {
  // Z-up (CAD/engineering default): XY is horizontal, XZ/YZ are vertical
  if (upDirection === 'z') {
    if (planeId === 'xy') {
      return [0, 0, -1];
    }

    if (planeId === 'xz') {
      return [0, 1, 0];
    }

    // Yz
    return [-1, 0, 0];
  }

  // Y-up (standard Three.js): XZ is horizontal, XY/YZ are vertical
  if (upDirection === 'y') {
    if (planeId === 'xy') {
      return [0, 0, -1];
    }

    if (planeId === 'xz') {
      return [0, -1, 0];
    }

    // Yz
    return [-1, 0, 0];
  }

  // X-up: YZ is horizontal, XY/XZ are vertical
  if (planeId === 'xy') {
    return [0, 0, -1];
  }

  if (planeId === 'xz') {
    return [0, -1, 0];
  }

  // YZ - positioned at bottom (-X direction, like Y-up has XZ at -Y)
  return [-1, 0, 0];
}

/**
 * Get the plane rotation for a given plane ID and up direction.
 * The rotation orients the plane selector to face the correct direction.
 */
function getPlaneRotationForUpDirection(planeId: PlaneId, upDirection: UpDirection): [number, number, number] {
  // Z-up (CAD/engineering default)
  if (upDirection === 'z') {
    if (planeId === 'xy') {
      return [0, 0, 0];
    }

    if (planeId === 'xz') {
      return [-Math.PI / 2, 0, Math.PI];
    }

    // Yz
    return [Math.PI / 2, Math.PI / 2, 0];
  }

  // Y-up (standard Three.js)
  if (upDirection === 'y') {
    if (planeId === 'xy') {
      // XY plane at [0,0,-1] faces +Z, needs to face the camera with upright text
      return [0, 0, 0];
    }

    if (planeId === 'xz') {
      // XZ plane at [0,-1,0] - horizontal floor plane
      // Rotate 90° around X to make it horizontal, facing +Y (up)
      // Add 180° around Z to flip text orientation without mirroring
      return [Math.PI / 2, 0, Math.PI];
    }

    // YZ plane at [-1,0,0] - vertical side plane
    // Rotate to face +X direction
    return [0, Math.PI / 2, 0];
  }

  // X-up
  if (planeId === 'xy') {
    // XY plane at [0,0,-1] faces +Z
    return [0, 0, -Math.PI / 2];
  }

  if (planeId === 'xz') {
    // XZ plane at [0,-1,0] - vertical side plane
    // Rotate -90° around X to face +Y, add 180° Z for upright text
    return [-Math.PI / 2, Math.PI, -Math.PI / 2];
  }

  // YZ plane at [-1,0,0] - horizontal floor plane in X-up
  // Rotate 90° around Y to make it horizontal, facing +X (up)
  // Add 90° around Z for upright text when viewed from above
  return [0, Math.PI / 2, Math.PI];
}

/**
 * Get the labels for a plane selector based on the up direction.
 * The semantic meaning of "Top/Bottom/Front/Back/Left/Right" changes depending
 * on which axis is "up" and the position of the selector in 3D space.
 *
 * The label mapping must match the physical position of the selector:
 * - The selector at the "up" position should show "Top"
 * - The selector at the "down" position should show "Bottom"
 * - etc.
 */
function getLabelsForUpDirection(
  id: PlaneSelectorId,
  naming: 'cartesian' | 'face',
  upDirection: UpDirection,
): [string, string] {
  if (naming === 'cartesian') {
    const label = id.toUpperCase();
    return [label, label];
  }

  const base = getBaseFromSelector(id);
  // IsInverse is true for 'yx', 'zx', 'zy' (the reversed versions)
  const isInverse = id !== base;

  if (upDirection === 'z') {
    // Z-up: XY → Top/Bottom, XZ → Front/Back, YZ → Left/Right
    // XY at [0,0,-1]: faces +Z (up), so 'xy' shows "Top"
    // XZ at [0,1,0]: faces -Y, so 'xz' shows "Back"
    // YZ at [-1,0,0]: faces +X, so 'yz' shows "Right"
    if (base === 'xy') {
      return isInverse ? ['Bottom', 'Top'] : ['Top', 'Bottom'];
    }

    if (base === 'xz') {
      return isInverse ? ['Front', 'Back'] : ['Back', 'Front'];
    }

    // Yz
    return isInverse ? ['Left', 'Right'] : ['Right', 'Left'];
  }

  if (upDirection === 'y') {
    // Y-up: XZ → Top/Bottom, XY → Front/Back, YZ → Left/Right
    // XZ at [0,-1,0]: The selector is below the model, the visible face (facing +Y) should show "Top"
    // But the 'xz' ID with isInverse=true render prop uses base rotation, making it face +Y
    // So 'zx' (which faces -Y, away from viewer looking down) should show "Top"
    // and 'xz' (facing +Y toward viewer) should show "Bottom"
    if (base === 'xz') {
      return isInverse ? ['Top', 'Bottom'] : ['Bottom', 'Top'];
    }

    // XY at [0,0,-1]: Front/Back need to be on opposite faces
    if (base === 'xy') {
      return isInverse ? ['Back', 'Front'] : ['Front', 'Back'];
    }

    // Yz - Right/Left remains the same
    return isInverse ? ['Left', 'Right'] : ['Right', 'Left'];
  }

  // X-up: YZ → Top/Bottom, XY → Front/Back, XZ → Left/Right
  // YZ at [-1,0,0]: swap so 'yz' shows "Top", 'zy' shows "Bottom"
  if (base === 'yz') {
    return isInverse ? ['Bottom', 'Top'] : ['Top', 'Bottom'];
  }

  // XY at [0,0,-1]: 'xy' faces +Z → shows "Front", 'yx' faces -Z → shows "Back"
  if (base === 'xy') {
    return isInverse ? ['Back', 'Front'] : ['Front', 'Back'];
  }

  // XZ at [0,-1,0]: swap so 'xz' shows "Left", 'zx' shows "Right"
  return isInverse ? ['Right', 'Left'] : ['Left', 'Right'];
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
  readonly upDirection: UpDirection;
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
  upDirection,
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
      _normalizedDir.copy(baseDirection).normalize();
      _baseOffset.copy(_normalizedDir).multiplyScalar(desiredWorldOffset);

      // For inverse faces, add an additional offset to account for label depth
      // so they're truly back-to-back without overlapping
      if (isInverse) {
        _depthOffset.copy(_normalizedDir).multiplyScalar(-labelDepth * scale);
      } else {
        _depthOffset.set(0, 0, 0);
      }

      if (planeId === 'xz' || planeId === 'zx') {
        currentGroup.position.copy(_baseOffset.sub(_depthOffset));
      } else {
        currentGroup.position.copy(_baseOffset.add(_depthOffset));
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

  const [forwardPlaneName] = getLabelsForUpDirection(planeId, naming, upDirection);

  const frontFontGeometry = useMemo(
    // oxlint-disable-next-line new-cap -- Three.js naming convention
    () => FontGeometry({ text: forwardPlaneName, depth: textDepth, size: 0.2 }),
    [forwardPlaneName, textDepth],
  );
  const roundedRectangleGeometry = useMemo(
    // oxlint-disable-next-line new-cap -- Three.js naming convention
    () => RoundedRectangleGeometry({ width: 1, height: 1, radius: 0.1, smoothness: 16, depth: labelDepth }),
    [labelDepth],
  );
  const darkenedColor = useMemo(() => adjustHexColorBrightness(color, -0.5), [color]);
  const slightlyDarkenedColor = useMemo(() => adjustHexColorBrightness(color, -0.3), [color]);

  const baseRotation = getPlaneRotationForUpDirection(getBaseFromSelector(planeId), upDirection);
  // For inverse faces, rotate 180 degrees to face the opposite direction
  // The rotation axis depends on the up direction to maintain upright text
  const rotation = isInverse
    ? baseRotation
    : ((): [number, number, number] => {
        const base = getBaseFromSelector(planeId);

        // X-up needs different inverse rotations due to different base rotations
        if (upDirection === 'x') {
          if (base === 'xy') {
            // Front→Back: flip around X to keep text upright
            return [baseRotation[0] + Math.PI, baseRotation[1], baseRotation[2]];
          }

          if (base === 'xz') {
            // Right→Left: flip around X
            return [baseRotation[0] + Math.PI, baseRotation[1], baseRotation[2]];
          }

          // YZ (Top→Bottom): flip around Y
          return [baseRotation[0], baseRotation[1] + Math.PI, baseRotation[2]];
        }

        // Z-up and Y-up use 180° Y rotation
        if (base === 'xy') {
          return [baseRotation[0], baseRotation[1] + Math.PI, baseRotation[2]];
        }

        if (base === 'xz') {
          return [baseRotation[0], baseRotation[1] + Math.PI, baseRotation[2]];
        }

        // Base === 'yz'
        return [baseRotation[0], baseRotation[1] + Math.PI, baseRotation[2]];
      })();
  const displayedHover = isHovered || Boolean(isExternallyHovered);
  const actualColor = displayedHover ? darkenedColor : slightlyDarkenedColor;

  return (
    <group ref={groupRef} renderOrder={topMostRenderOrder} position={position} rotation={rotation}>
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
          color='black'
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
  readonly upDirection: UpDirection;
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
  upDirection,
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
    /* oxlint-disable tau-lint/no-hardcoded-color -- Three.js plane selector colors */
    const planes: Array<{ idPos: PlaneSelectorId; idNeg: PlaneSelectorId; normal: THREE.Vector3; color: string }> = [
      { idPos: 'xy', idNeg: 'yx', normal: new THREE.Vector3(0, 0, -1), color: '#3b82f6' },
      { idPos: 'xz', idNeg: 'zx', normal: new THREE.Vector3(0, -1, 0), color: '#22c55e' },
      { idPos: 'yz', idNeg: 'zy', normal: new THREE.Vector3(-1, 0, 0), color: '#ef4444' },
    ];
    /* oxlint-enable tau-lint/no-hardcoded-color */

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
        {planes.map(({ idPos, idNeg, color }) => {
          // Use coordinate-aware position based on up direction
          const baseId = getBaseFromSelector(idPos);
          const position = getPlanePositionForUpDirection(baseId, upDirection);

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
                upDirection={upDirection}
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
                upDirection={upDirection}
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
        mode='translate'
        space='local'
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
        mode='rotate'
        space='local'
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
