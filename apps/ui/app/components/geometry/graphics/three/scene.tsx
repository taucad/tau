import type { ComponentRef, ReactNode, RefObject } from 'react';
import type { StageOptions } from '@/components/geometry/graphics/three/stage.js';
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
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- null is required by React
  readonly controlsRef?: RefObject<ComponentRef<typeof Controls> | null>;
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- null is required by React
  readonly stageRef?: RefObject<ComponentRef<typeof Stage> | null>;
};

export function Scene({
  children,
  hasGizmo: enableGizmo = false,
  hasDamping: enableDamping = false,
  hasZoom: enableZoom = false,
  hasGrid: enableGrid = false,
  hasAxesHelper: enableAxesHelper = false,
  stageOptions,
  isCentered = true,
  cameraMode = 'perspective',
  controlsRef,
  stageRef,
}: SceneProperties) {
  return (
    <>
      <Controls ref={controlsRef} enableGizmo={enableGizmo} enableDamping={enableDamping} enableZoom={enableZoom} />
      <Stage
        ref={stageRef}
        stageOptions={stageOptions}
        isCentered={isCentered}
        hasGrid={enableGrid}
        hasAxesHelper={enableAxesHelper}
        cameraMode={cameraMode}
      >
        {children}
      </Stage>
    </>
  );
}
