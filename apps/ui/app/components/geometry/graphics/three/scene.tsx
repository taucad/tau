import type { ReactNode, JSX } from 'react';
import type { StageOptions } from '~/components/geometry/graphics/three/stage.js';
import { Stage } from '~/components/geometry/graphics/three/stage.js';
import { Controls } from '~/components/geometry/graphics/three/controls.js';

type SceneProperties = {
  readonly children: ReactNode;
  readonly hasGizmo?: boolean;
  readonly hasDamping?: boolean;
  readonly hasZoom?: boolean;
  readonly hasGrid?: boolean;
  readonly hasAxesHelper?: boolean;
  readonly stageOptions?: StageOptions;
  readonly isCentered?: boolean;
  readonly zoomSpeed: number;
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
  zoomSpeed,
}: SceneProperties): JSX.Element {
  return (
    <>
      <Controls enableGizmo={hasGizmo} enableDamping={hasDamping} enableZoom={hasZoom} zoomSpeed={zoomSpeed} />
      <Stage stageOptions={stageOptions} isCentered={isCentered} hasGrid={hasGrid} hasAxesHelper={hasAxesHelper}>
        {children}
      </Stage>
    </>
  );
}
