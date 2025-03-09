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
        // 12 is half the size of the cursor image
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
