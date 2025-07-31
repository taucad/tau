import type { CanvasProps } from '@react-three/fiber';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffect, useState } from 'react';
import { CameraHandler } from '#components/geometry/graphics/three/camera-handler.js';
import { Scene } from '#components/geometry/graphics/three/scene.js';
import type { StageOptions } from '#components/geometry/graphics/three/stage.js';
import rotateIconBase64 from '#components/geometry/graphics/rotate-icon.svg?base64';
import { ActorBridge } from '#components/geometry/graphics/three/actor-bridge.js';
import { cn } from '#utils/ui.js';

export type ThreeViewerProperties = {
  readonly enableGizmo?: boolean;
  readonly enableGrid?: boolean;
  readonly enableAxes?: boolean;
  readonly enableZoom?: boolean;
  readonly enablePan?: boolean;
  readonly enableDamping?: boolean;
  readonly className?: string;
  readonly enableCentering?: boolean;
  readonly stageOptions?: StageOptions;
  readonly zoomSpeed?: number;
};

export type ThreeContextProperties = CanvasProps & ThreeViewerProperties;

export function ThreeProvider({
  children,
  enableGizmo = false,
  enableGrid = false,
  enableAxes = false,
  enableZoom = false,
  enablePan = false,
  enableDamping = false,
  className,
  stageOptions,
  enableCentering = true,
  zoomSpeed = 1,
  ...properties
}: ThreeContextProperties): React.JSX.Element {
  const dpr = Math.min(globalThis.devicePixelRatio, 2);
  const [isCanvasReady, setIsCanvasReady] = useState(false);

  useEffect(() => {
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1); // Z-up coordinate system
  }, []);

  return (
    <Canvas
      gl={{
        // Enable logarithmic depth buffer for better precision at low field of view,
        // eliminating visual artifacts on the object.
        logarithmicDepthBuffer: true,
        antialias: true,
      }}
      style={{
        cursor: `url(data:image/svg+xml;base64,${rotateIconBase64}) 13 13, auto`,
      }}
      dpr={dpr}
      frameloop="demand"
      className={cn('bg-background', className)}
      onCreated={() => {
        setIsCanvasReady(true);
      }}
      {...properties}
    >
      <Scene
        enableGizmo={enableGizmo}
        enableCentering={enableCentering}
        enableDamping={enableDamping}
        enableZoom={enableZoom}
        enablePan={enablePan}
        enableGrid={enableGrid}
        enableAxes={enableAxes}
        stageOptions={stageOptions}
        zoomSpeed={zoomSpeed}
      >
        {children}
        <CameraHandler />
        {isCanvasReady ? <ActorBridge /> : null}
      </Scene>
    </Canvas>
  );
}
