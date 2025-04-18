import type { ComponentRef, ReactNode, RefObject, JSX } from 'react';
import type { StageOptions, GridSizes } from '@/components/geometry/graphics/three/stage.js';
import { Stage } from '@/components/geometry/graphics/three/stage.js';
import { Controls } from '@/components/geometry/graphics/three/controls.js';

type SceneProperties = {
  readonly children: ReactNode;
  readonly hasGizmo?: boolean;
  readonly hasDamping?: boolean;
  readonly hasZoom?: boolean;
  readonly hasGrid?: boolean;
  readonly hasAxesHelper?: boolean;
  readonly stageOptions?: StageOptions;
  readonly isCentered?: boolean;
  readonly cameraMode?: 'perspective' | 'orthographic';
  readonly onGridChange?: (gridSizes: GridSizes) => void;
  readonly zoomSpeed: number;
  readonly distanceFalloffScale?: number;
  readonly hasDynamicDistanceFalloff?: boolean;
  readonly minDistanceFalloffScale?: number;
  readonly maxDistanceFalloffScale?: number;
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- null is required by React
  readonly controlsRef?: RefObject<ComponentRef<typeof Controls> | null>;
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- null is required by React
  readonly stageRef?: RefObject<ComponentRef<typeof Stage> | null>;
};

export function Scene({
  children,
  hasGizmo = false,
  hasDamping = false,
  hasZoom = false,
  hasGrid = false,
  hasAxesHelper = false,
  stageOptions,
  isCentered = true,
  cameraMode = 'perspective',
  controlsRef,
  stageRef,
  onGridChange,
  zoomSpeed,
  distanceFalloffScale,
  hasDynamicDistanceFalloff,
  minDistanceFalloffScale,
  maxDistanceFalloffScale,
}: SceneProperties): JSX.Element {
  return (
    <>
      <Controls
        ref={controlsRef}
        enableGizmo={hasGizmo}
        enableDamping={hasDamping}
        enableZoom={hasZoom}
        zoomSpeed={zoomSpeed}
      />
      <Stage
        ref={stageRef}
        stageOptions={stageOptions}
        isCentered={isCentered}
        hasGrid={hasGrid}
        hasAxesHelper={hasAxesHelper}
        cameraMode={cameraMode}
        distanceFalloffScale={distanceFalloffScale}
        hasDynamicDistanceFalloff={hasDynamicDistanceFalloff}
        minDistanceFalloffScale={minDistanceFalloffScale}
        maxDistanceFalloffScale={maxDistanceFalloffScale}
        onGridChange={onGridChange}
      >
        {children}
      </Stage>
    </>
  );
}
