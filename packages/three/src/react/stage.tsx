import React from 'react';
import type { ReactNode } from 'react';
import type * as THREE from 'three';
import { PerspectiveCamera } from '@react-three/drei';
import { Lights } from '#react/lights.js';
import { SectionView } from '#react/section-view.js';
import { useSectionView } from '#react/hooks/use-section-view.js';
import { useGeometryBounds } from '#react/hooks/use-geometry-bounds.js';
import { useCameraFraming } from '#react/hooks/use-camera-framing.js';
import { useViewerStore } from '#react/stores/store-context.js';

/** Configuration options for the 3D stage camera and view. */
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

export const defaultStageOptions = {
  offsetRatio: 2,
  nearPlane: 1e-3,
  minimumFarPlane: 10_000_000_000,
  farPlaneRadiusMultiplier: 5,
  zoomLevel: 1,
  rotation: {
    side: -Math.PI / 4,
    vertical: Math.PI / 6,
  },
} as const satisfies StageOptions;

type StageProperties = {
  readonly children: ReactNode;
  readonly enableCentering?: boolean;
  readonly stageOptions?: StageOptions;
  readonly geometryKey?: string;
  readonly onSceneRadiusChange?: (radius: number) => void;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'id'>;

export function Stage({
  children,
  enableCentering = false,
  stageOptions = defaultStageOptions,
  geometryKey,
  onSceneRadiusChange,
  ...properties
}: StageProperties): React.JSX.Element {
  const outer = React.useRef<THREE.Group>(null);
  const inner = React.useRef<THREE.Group>(null);

  const enableMatcap = useViewerStore((s) => s.enableMatcap);
  const environmentPreset = useViewerStore((s) => s.environmentPreset);
  const upDirection = useViewerStore((s) => s.upDirection);

  const sectionView = useSectionView();

  const { geometryRadius, geometryCenter } = useGeometryBounds(inner, outer, {
    enableCentering,
    geometryKey,
    onSceneRadiusChange,
  });

  useCameraFraming(geometryRadius, geometryCenter, stageOptions);

  return (
    <group {...properties}>
      <PerspectiveCamera makeDefault />
      <group ref={outer}>
        <SectionView
          plane={sectionView.plane}
          enableSection={sectionView.isActive}
          enableLines={sectionView.enableLines}
          enableMesh={sectionView.enableMesh}
          cappingMaterial={sectionView.cappingMaterial}
        >
          <group ref={inner}>{children}</group>
        </SectionView>
      </group>
      <Lights
        enableMatcap={enableMatcap}
        environmentPreset={environmentPreset}
        sceneRadius={geometryRadius}
        upDirection={upDirection}
      />
    </group>
  );
}
