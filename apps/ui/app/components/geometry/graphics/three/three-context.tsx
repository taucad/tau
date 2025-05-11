import type { CanvasProps } from '@react-three/fiber';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffect, useState, useImperativeHandle, useRef } from 'react';
import type { RefObject, ComponentRef, JSX } from 'react';
import { Focus } from 'lucide-react';
import { CameraControl, CameraHandler } from './camera-control.js';
import { Scene } from '@/components/geometry/graphics/three/scene.js';
import type { Stage, StageOptions, GridSizes } from '@/components/geometry/graphics/three/stage.js';
import rotateIconBase64 from '@/components/geometry/graphics/three/rotate-icon.svg?base64';
import type {
  ScreenshotCaptureHandle,
  ScreenshotOptions,
} from '@/components/geometry/graphics/three/screenshot-capture.js';
import { ScreenshotCapture } from '@/components/geometry/graphics/three/screenshot-capture.js';
import { cn } from '@/utils/ui.js';
import { Button } from '@/components/ui/button.js';
import { useCookie } from '@/hooks/use-cookie.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { useThreeCursor } from '@/hooks/use-three-cursor.js';

const cameraAngleCookieName = 'camera-angle';

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
  readonly onCanvasReady?: (isReady: boolean) => void;
  readonly defaultCameraAngle?: number;
  readonly zoomSpeed?: number;
};

export type ThreeContextProperties = CanvasProps & ThreeViewerProperties;

// Updated ref type to include screenshot capability
export type ThreeCanvasReference = HTMLCanvasElement & {
  captureScreenshot: (options?: ScreenshotOptions) => string;
  isScreenshotReady: boolean;
};

export function ThreeProvider({
  ref,
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
  onCanvasReady,
  defaultCameraAngle = 60,
  zoomSpeed = 1,
  ...properties
}: ThreeContextProperties & {
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- null is required by React
  readonly ref?: RefObject<ThreeCanvasReference | null>;
}): JSX.Element {
  const dpr = Math.min(globalThis.devicePixelRatio, 2);
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [gridSizes, setGridSizes] = useState<GridSizes>({
    smallSize: 1,
    largeSize: 10,
  });

  const screenshotReference = useRef<ScreenshotCaptureHandle>(null);
  const canvasReference = useRef<HTMLCanvasElement & { captureScreenshot: (options?: ScreenshotOptions) => string }>(
    null,
  );
  const stageReference = useRef<ComponentRef<typeof Stage>>(null);

  const [cameraAngle, setCameraAngle] = useCookie<number>(cameraAngleCookieName, defaultCameraAngle);

  // Use the cursor hook for mouse and keyboard interactions
  const { cursor, handleMouseDown, handleMouseUp, handleContextMenu } = useThreeCursor({
    rotateIconBase64,
  });

  useEffect(() => {
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
  }, []);

  // Notify parent when canvas state changes
  useEffect(() => {
    if (onCanvasReady && isCanvasReady) {
      onCanvasReady(true);
    }
  }, [isCanvasReady, onCanvasReady]);

  // Combine refs to provide both the canvas element and screenshot functionality
  useImperativeHandle(ref, () => {
    const canvas = canvasReference.current;
    if (!canvas) {
      throw new Error('Canvas reference is not found');
    }

    canvas.captureScreenshot = (options?: ScreenshotOptions) => {
      if (!screenshotReference.current) {
        throw new Error('Screenshot reference is not found');
      }

      return screenshotReference.current.captureScreenshot({
        ...options,
        // Adjust zoom based on the camera angle
        zoomLevel: 1.8,
      });
    };

    return canvas;
  }, [canvasReference, screenshotReference]);

  const handleGridChange = (newGridSizes: GridSizes) => {
    setGridSizes(newGridSizes);
  };

  return (
    <div className="relative size-full">
      <Canvas
        ref={canvasReference}
        gl={{
          // Enable logarithmic depth buffer for better precision at low field of view,
          // eliminating visual artifacts on the object.
          logarithmicDepthBuffer: true,
          antialias: true,
        }}
        style={{
          cursor,
        }}
        dpr={dpr}
        frameloop="demand"
        className={cn('bg-background', className)}
        onCreated={() => {
          setIsCanvasReady(true);
        }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
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
          stageRef={stageReference}
          zoomSpeed={zoomSpeed}
          onGridChange={handleGridChange}
        >
          <CameraHandler angle={Number(cameraAngle)} />
          {children}
          <ScreenshotCapture ref={screenshotReference} />
        </Scene>
      </Canvas>
      {enableCameraControls ? (
        <div className="absolute bottom-0 left-0 z-10 m-2">
          <div className="flex items-center gap-2">
            <CameraControl
              defaultAngle={cameraAngle}
              className="w-60"
              onChange={(angle) => {
                setCameraAngle(angle);
              }}
            />
            {enableGrid ? (
              <Button variant="overlay" size="icon" className="flex-col gap-0 font-mono text-xs [&>span]:leading-none">
                {gridSizes ? (
                  <>
                    <span>{gridSizes?.smallSize}</span>
                    <span>mm</span>
                  </>
                ) : null}
              </Button>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="overlay" size="icon" onClick={() => stageReference.current?.resetCamera()}>
                  <Focus />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset camera</TooltipContent>
            </Tooltip>
          </div>
        </div>
      ) : null}
    </div>
  );
}

ThreeProvider.displayName = 'ThreeProvider';
