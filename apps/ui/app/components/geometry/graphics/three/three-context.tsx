import type { CanvasProps } from '@react-three/fiber';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Scene } from '~/components/geometry/graphics/three/scene.js';
import type { StageOptions } from '~/components/geometry/graphics/three/stage.js';
import rotateIconBase64 from '~/components/geometry/graphics/rotate-icon.svg?base64';
import { ActorBridge } from '~/components/geometry/graphics/three/actor-bridge.js';
import { cn } from '~/utils/ui.js';

export type ThreeViewerProperties = {
  readonly enableGizmo?: boolean;
  readonly enableGrid?: boolean;
  readonly enableAxesHelper?: boolean;
  readonly enableZoom?: boolean;
  readonly enableDamping?: boolean;
  readonly enableCameraControls?: boolean;
  readonly className?: string;
  readonly center?: boolean;
  readonly stageOptions?: StageOptions;
  readonly defaultCameraAngle?: number;
  readonly zoomSpeed?: number;
};

export type ThreeContextProperties = CanvasProps & ThreeViewerProperties;

export function ThreeProvider({
  children,
  enableGizmo = false,
  enableGrid = false,
  enableAxesHelper = false,
  enableZoom = false,
  enableDamping = false,
  enableCameraControls = false,
  className,
  stageOptions,
  center = true,
  defaultCameraAngle = 60,
  zoomSpeed = 1,
  ...properties
}: ThreeContextProperties): JSX.Element {
  const dpr = Math.min(globalThis.devicePixelRatio, 2);
  const [isCanvasReady, setIsCanvasReady] = useState(false);

  useEffect(() => {
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
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
      onCreated={(state) => {
        // Make sure the WebGLRenderer is fully initialized
        if (state.gl?.domElement) {
          setIsCanvasReady(true);
        }
      }}
      {...properties}
    >
      <Scene
        hasGizmo={enableGizmo}
        isCentered={center}
        hasDamping={enableDamping}
        hasZoom={enableZoom}
        hasGrid={enableGrid}
        hasAxesHelper={enableAxesHelper}
        stageOptions={stageOptions}
        zoomSpeed={zoomSpeed}
      >
        {children}
        {isCanvasReady ? <ActorBridge /> : null}
      </Scene>
    </Canvas>
  );
}
