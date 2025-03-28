import { Canvas, CanvasProps } from '@react-three/fiber';
import * as THREE from 'three';
import { Scene } from './scene';
import { Stage, StageOptions } from './stage';
import rotate3dBase64 from './rotate-3d.svg?base64';
import { cn } from '@/utils/ui';
import { useEffect, useState, useImperativeHandle, useRef } from 'react';
import { ScreenshotCapture, ScreenshotCaptureHandle, ScreenshotOptions } from './screenshot-capture';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCookie } from '@/utils/cookies';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Focus } from 'lucide-react';

const CAMERA_MODE_COOKIE_NAME = 'camera-mode';

export type CadViewerProperties = {
  enableGizmo?: boolean;
  enableGrid?: boolean;
  enableAxesHelper?: boolean;
  enableZoom?: boolean;
  enableDamping?: boolean;
  enableCameraControls?: boolean;
  className?: string;
  center?: boolean;
  stageOptions?: StageOptions;
  onCanvasReady?: (isReady: boolean) => void;
  defaultCameraMode?: 'perspective' | 'orthographic';
};

export type ThreeContextProperties = CanvasProps & CadViewerProperties;

// Updated ref type to include screenshot capability
export type ThreeCanvasReference = HTMLCanvasElement & {
  captureScreenshot: (options?: ScreenshotOptions) => string;
  isScreenshotReady: boolean;
};

export const ThreeProvider = ({
  ref,
  children,
  enableGizmo = false,
  enableGrid = false,
  enableAxesHelper = false,
  enableZoom = false,
  enableDamping = false,
  enableCameraControls = false,
  className,
  stageOptions = {},
  center = true,
  onCanvasReady,
  defaultCameraMode = 'perspective',
  ...properties
}: ThreeContextProperties & {
  ref?: React.RefObject<ThreeCanvasReference | null>;
}) => {
  const dpr = Math.min(window.devicePixelRatio, 2);
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const screenshotReference = useRef<ScreenshotCaptureHandle>(null);
  const canvasReference = useRef<HTMLCanvasElement & { captureScreenshot: (options?: ScreenshotOptions) => string }>(
    null,
  );
  const stageReference = useRef<React.ComponentRef<typeof Stage>>(null);
  const [cameraMode, setCameraMode] = useCookie<'perspective' | 'orthographic'>(
    CAMERA_MODE_COOKIE_NAME,
    defaultCameraMode,
  );

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
      return screenshotReference.current?.captureScreenshot(options) || '';
    };

    return canvas;
  }, [canvasReference, screenshotReference]);

  return (
    <div className="relative size-full">
      <Canvas
        style={{
          // 13 is half the size of the cursor viewbox
          cursor: `url(data:image/svg+xml;base64,${rotate3dBase64}) 13 13, auto`,
        }}
        dpr={dpr}
        frameloop="demand"
        className={cn('bg-background', className)}
        ref={canvasReference}
        onCreated={() => {
          setIsCanvasReady(true);
        }}
        {...properties}
      >
        <Scene
          enableGizmo={enableGizmo}
          center={center}
          enableDamping={enableDamping}
          enableZoom={enableZoom}
          enableGrid={enableGrid}
          enableAxesHelper={enableAxesHelper}
          stageOptions={stageOptions}
          cameraMode={cameraMode}
          stageRef={stageReference}
        >
          {children}
          <ScreenshotCapture ref={screenshotReference} />
        </Scene>
      </Canvas>
      {enableCameraControls && (
        <div className="absolute bottom-0 left-0 z-10 m-2">
          <div className="flex items-center gap-2">
            <Tabs
              value={cameraMode}
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Tabs loses type inference
              onValueChange={(value) => setCameraMode(value as 'perspective' | 'orthographic')}
            >
              <TabsList>
                <TabsTrigger value="perspective">Perspective</TabsTrigger>
                <TabsTrigger value="orthographic">Orthographic</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="overlay" size="icon" className="flex-col gap-0 font-mono text-xs [&>span]:leading-none">
              <span>1</span>
              <span>mm</span>
            </Button>
            {/* TODO: implement camera reset */}
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
      )}
    </div>
  );
};

ThreeProvider.displayName = 'ThreeProvider';
