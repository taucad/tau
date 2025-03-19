import { Canvas, CanvasProps } from '@react-three/fiber';
import * as THREE from 'three';
import { Scene } from './scene';
import { StageOptions } from './stage';
import InfiniteGrid from './infinite-grid';
import rotate3dBase64 from './rotate-3d.svg?base64';
import { cn } from '@/utils/ui';
import { useEffect, forwardRef, useState, useImperativeHandle, useRef } from 'react';
import { ScreenshotCapture, ScreenshotCaptureHandle, ScreenshotOptions } from './screenshot-capture';

export type CadViewerProperties = {
  enableGizmo?: boolean;
  enableGrid?: boolean;
  enableZoom?: boolean;
  enableDamping?: boolean;
  className?: string;
  center?: boolean;
  stageOptions?: StageOptions;
  onCanvasReady?: (isReady: boolean) => void;
};

export type ThreeContextProperties = CanvasProps & CadViewerProperties;

// Updated ref type to include screenshot capability
export type ThreeCanvasReference = HTMLCanvasElement & {
  captureScreenshot: (options?: ScreenshotOptions) => string;
  isScreenshotReady: boolean;
};

export const ThreeProvider = forwardRef<ThreeCanvasReference, ThreeContextProperties>(
  (
    {
      children,
      enableGizmo = false,
      enableGrid = false,
      enableZoom = false,
      enableDamping = false,
      className,
      stageOptions = {},
      center = true,
      onCanvasReady,
      ...properties
    },
    reference,
  ) => {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const [isCanvasReady, setIsCanvasReady] = useState(false);
    const screenshotReference = useRef<ScreenshotCaptureHandle>(null);
    const canvasReference = useRef<HTMLCanvasElement>(null);

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
    useImperativeHandle(reference, () => {
      const canvas = canvasReference.current;
      if (!canvas) {
        // Return an empty object that matches the expected interface
        return {} as ThreeCanvasReference;
      }

      (canvas as ThreeCanvasReference).captureScreenshot = (options?: ScreenshotOptions) => {
        return screenshotReference.current?.captureScreenshot(options) || '';
      };

      return canvas as ThreeCanvasReference;
    }, [canvasReference, screenshotReference, isCanvasReady]);

    return (
      <Canvas
        style={{
          // 12 is half the size of the cursor image
          cursor: `url(data:image/svg+xml;base64,${rotate3dBase64}) 12 12, auto`,
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
          stageOptions={stageOptions}
        >
          {enableGrid && <InfiniteGrid />}
          {children}
          <ScreenshotCapture ref={screenshotReference} />
        </Scene>
      </Canvas>
    );
  },
);

ThreeProvider.displayName = 'ThreeProvider';
