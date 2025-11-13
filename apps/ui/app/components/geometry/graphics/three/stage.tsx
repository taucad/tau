import React, { useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import * as THREE from 'three';
import { PerspectiveCamera } from '@react-three/drei';
import { useSelector } from '@xstate/react';
import { useFrame } from '@react-three/fiber';
import { AxesHelper } from '#components/geometry/graphics/three/react/axes-helper.js';
import { Grid } from '#components/geometry/graphics/three/grid.js';
import { useCameraReset } from '#components/geometry/graphics/three/use-camera-reset.js';
import { Lights } from '#components/geometry/graphics/three/react/lights.js';
import { SectionView } from '#components/geometry/graphics/three/react/section-view.js';
import { createStripedMaterial } from '#components/geometry/graphics/three/materials/striped-material.js';
import { useBuild } from '#hooks/use-build.js';

export type StageOptions = {
  /**
   * The ratio of the scene's radius to offset the camera from the center. Adjusting this value will change the applied perspective of the scene.
   */
  offsetRatio?: number;
  /**
   * The near plane of the camera.
   */
  nearPlane?: number;
  /**
   * The minimum far plane of the camera.
   */
  minimumFarPlane?: number;
  /**
   * The multiplier for the camera's far plane.
   */
  farPlaneRadiusMultiplier?: number;
  /**
   * The zoom level of the camera.
   */
  zoomLevel?: number;
  rotation?: {
    /**
     * The initial z-axis rotation of the camera in radians.
     */
    side?: number;

    /**
     * The initial xy-plane rotation of the camera in radians.
     */
    vertical?: number;
  };
};

const significantRadiusChangeRatio = 0.1;

// Default configuration constants
export const defaultStageOptions = {
  offsetRatio: 3,
  nearPlane: 1e-6,
  minimumFarPlane: 10_000_000_000,
  farPlaneRadiusMultiplier: 5,
  zoomLevel: 1,
  rotation: {
    side: -Math.PI / 4, // Default rotation is 45 degrees counter-clockwise
    vertical: Math.PI / 6, // Default rotation is 30 degrees upwards
  },
} as const satisfies StageOptions;

type StageProperties = {
  readonly children: ReactNode;
  readonly enableCentering?: boolean;
  readonly stageOptions?: StageOptions;
  readonly enableGrid?: boolean;
  readonly enableAxes?: boolean;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'id'>;

export function Stage({
  children,
  enableCentering = false,
  stageOptions = defaultStageOptions,
  ...properties
}: StageProperties): React.JSX.Element {
  const outer = React.useRef<THREE.Group>(null);
  const inner = React.useRef<THREE.Group>(null);
  const { graphicsRef: graphicsActor } = useBuild();

  const cameraFovAngle = useSelector(graphicsActor, (state) => state.context.cameraFovAngle);

  const isSectionViewActive = useSelector(graphicsActor, (state) => state.context.isSectionViewActive);
  const selectedSectionViewId = useSelector(graphicsActor, (state) => state.context.selectedSectionViewId);
  // Translation is derived from pivot for display; Stage uses pivot directly
  const sectionViewRotation = useSelector(graphicsActor, (state) => state.context.sectionViewRotation);
  const sectionViewDirection = useSelector(graphicsActor, (state) => state.context.sectionViewDirection);
  const sectionViewPivot = useSelector(graphicsActor, (state) => state.context.sectionViewPivot);
  const availableSectionViews = useSelector(graphicsActor, (state) => state.context.availableSectionViews);
  const enableClippingLines = useSelector(graphicsActor, (state) => state.context.enableClippingLines);
  const enableClippingMesh = useSelector(graphicsActor, (state) => state.context.enableClippingMesh);

  // Build THREE.Plane for the SectionView component
  const sectionView = useMemo(() => {
    if (!selectedSectionViewId) {
      // Default plane when nothing is selected
      return new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    }

    const selectedPlane = availableSectionViews.find((plane) => plane.id === selectedSectionViewId);
    if (!selectedPlane) {
      return new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    }

    // Start with the base normal from the selected plane
    const normal = new THREE.Vector3(...selectedPlane.normal);

    // Apply rotation to the normal if rotation is set
    const [rotX, rotY, rotZ] = sectionViewRotation;
    if (rotX !== 0 || rotY !== 0 || rotZ !== 0) {
      const euler = new THREE.Euler(rotX, rotY, rotZ);
      normal.applyEuler(euler);
    }

    // Apply direction after rotation
    normal.multiplyScalar(-sectionViewDirection);

    // Compute plane constant from the world-space pivot point: n·p + c = 0
    // => c = -n·p. Using pivot as source of truth ensures the plane remains
    // anchored during rotations and flips while keeping display translation stable.
    const constant = -normal.dot(new THREE.Vector3(...sectionViewPivot));

    return new THREE.Plane(normal, constant);
  }, [selectedSectionViewId, sectionViewPivot, sectionViewRotation, sectionViewDirection, availableSectionViews]);

  // Create striped material for capping surface
  const cappingMaterial = useMemo(() => createStripedMaterial(), []);

  // State for camera reset functionality
  const originalDistanceReference = React.useRef<number | undefined>(undefined);
  const isInitialResetDoneRef = React.useRef<boolean>(false);

  const [{ geometryRadius, sceneRadius }, set] = React.useState<{
    // The radius of the scene. Used to determine if the camera needs to be updated
    sceneRadius: number | undefined;
    // The radius of the geometry.
    geometryRadius: number;
  }>({
    sceneRadius: undefined,
    geometryRadius: 0,
  });

  const { offsetRatio, nearPlane, minimumFarPlane, farPlaneRadiusMultiplier, zoomLevel, rotation } = useMemo(() => {
    return {
      ...defaultStageOptions,
      ...stageOptions,
      rotation: { ...defaultStageOptions.rotation, ...stageOptions.rotation },
    };
  }, [stageOptions]);

  // Function to set scene radius
  const setSceneRadius = useCallback((radius: number) => {
    set((previous) => ({
      ...previous,
      sceneRadius: radius,
    }));
  }, []);

  // Use the camera reset hook
  const resetCamera = useCameraReset({
    geometryRadius,
    rotation: {
      side: rotation.side,
      vertical: rotation.vertical,
    },
    perspective: {
      offsetRatio,
      zoomLevel,
      nearPlane,
      minimumFarPlane,
      farPlaneRadiusMultiplier,
    },
    setSceneRadius,
    originalDistanceReference,
    cameraFovAngle,
  });

  /**
   * Position the scene.
   */
  // TODO: implement a solution that doesn't require hooking into the frame loop.
  useFrame(() => {
    if (outer.current) {
      outer.current.updateWorldMatrix(true, true);
    }

    if (!inner.current) {
      return;
    }

    const box3 = new THREE.Box3().setFromObject(inner.current);

    if (enableCentering) {
      const centerPoint = new THREE.Vector3();
      box3.getCenter(centerPoint);
      if (outer.current) {
        outer.current.position.set(
          outer.current.position.x - centerPoint.x,
          outer.current.position.y - centerPoint.y,
          outer.current.position.z - centerPoint.z,
        );
      }
    }

    const sphere = new THREE.Sphere();
    box3.getBoundingSphere(sphere);
    set((previous) => {
      return { geometryRadius: sphere.radius, sceneRadius: previous.sceneRadius };
    });
  });

  /**
   * Position the camera based on the scene's bounding box.
   */
  React.useLayoutEffect(() => {
    // If the scene radius is undefined, we need to initialize the camera, so we default to true.
    // Force update when camera type changes
    const changeRatio = sceneRadius === undefined ? 0 : Math.abs((geometryRadius - sceneRadius) / sceneRadius);
    const isSignificantChange = sceneRadius === undefined ? true : changeRatio > significantRadiusChangeRatio;

    if (isSignificantChange) {
      if (isInitialResetDoneRef.current) {
        resetCamera({ enableConfiguredAngles: false }); // Subsequent resets without XY rotation
      } else {
        resetCamera(); // Initial reset with rotation
        isInitialResetDoneRef.current = true;
      }
    }
  }, [resetCamera, sceneRadius, geometryRadius]);

  return (
    <group {...properties}>
      <PerspectiveCamera makeDefault />
      <group ref={outer}>
        {properties.enableAxes ? <AxesHelper /> : null}
        {properties.enableGrid ? <Grid /> : null}
        <SectionView
          plane={sectionView}
          enableSection={Boolean(isSectionViewActive && selectedSectionViewId)}
          enableLines={enableClippingLines}
          enableMesh={enableClippingMesh}
          cappingMaterial={cappingMaterial}
        >
          <group ref={inner}>{children}</group>
        </SectionView>
      </group>
      <Lights />
    </group>
  );
}
