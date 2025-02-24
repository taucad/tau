import { Canvas, CanvasProps } from '@react-three/fiber';
import * as THREE from 'three';
import { Scene } from './scene';
import InfiniteGrid from './infinite-grid';
import { cn } from '@/utils/ui';

export type CadViewerProperties = {
  disableGizmo?: boolean;
  disableGrid?: boolean;
  className?: string;
};

export type ThreeContextProperties = CanvasProps & CadViewerProperties;

// We change the default orientation - threejs tends to use Y are the height,
// while replicad uses Z. This is mostly a representation default.
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

// This is the basics to render a nice looking model user react-three-fiber
//
// The camera is positioned for the model we present (that cannot change size.
// You might need to adjust this with something like the autoadjust from the
// `Stage` component of `drei`
//
// Depending on your needs I would advice not using a light and relying on
// a matcap material instead of the meshStandardMaterial used here.
export const ThreeProvider = ({
  children,
  disableGizmo = false,
  disableGrid = false,
  className,
  ...properties
}: ThreeContextProperties) => {
  const dpr = Math.min(window.devicePixelRatio, 2);

  return (
    <Canvas className={cn('bg-background', className)} dpr={dpr} frameloop="demand" {...properties}>
      <Scene hideGizmo={disableGizmo} center={true} enableDamping={true}>
        {!disableGrid && <InfiniteGrid />}
        {children}
      </Scene>
    </Canvas>
  );
};
