import { Canvas, CanvasProps } from '@react-three/fiber';
import * as THREE from 'three';
import { Scene } from './scene';
import { StageOptions } from './stage';
import InfiniteGrid from './infinite-grid';
import rotate3dBase64 from './rotate-3d.svg?base64';
import { cn } from '@/utils/ui';
import { useEffect } from 'react';

export type CadViewerProperties = {
  enableGizmo?: boolean;
  enableGrid?: boolean;
  enableZoom?: boolean;
  className?: string;
  center?: boolean;
  stageOptions?: StageOptions;
};

export type ThreeContextProperties = CanvasProps & CadViewerProperties;

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
  enableGizmo = false,
  enableGrid = false,
  enableZoom = false,
  className,
  stageOptions = {},
  center = true,
  ...properties
}: ThreeContextProperties) => {
  const dpr = Math.min(window.devicePixelRatio, 2);

  useEffect(() => {
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
  }, []);

  return (
    <Canvas
      style={{
        cursor: `url(data:image/svg+xml;base64,${rotate3dBase64}) 12 12, auto`,
      }}
      dpr={dpr}
      frameloop="demand"
      className={cn('bg-background', className)}
      {...properties}
    >
      <Scene
        enableGizmo={enableGizmo}
        center={center}
        enableDamping={true}
        enableZoom={enableZoom}
        stageOptions={stageOptions}
      >
        {enableGrid && <InfiniteGrid />}
        {children}
      </Scene>
    </Canvas>
  );
};
