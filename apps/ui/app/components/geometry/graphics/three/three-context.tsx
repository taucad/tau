import { Canvas, CanvasProps, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Scene } from './scene';
import { StageOptions } from './stage';
import InfiniteGrid from './infinite-grid';
import rotate3dBase64 from './rotate-3d.svg?base64';
import { cn } from '@/utils/ui';
import { useEffect, forwardRef, useState, useImperativeHandle, useRef } from 'react';

interface ScreenshotCaptureHandle {
  captureScreenshot: () => string;
}

// Component to capture screenshots
const ScreenshotCapture = forwardRef<ScreenshotCaptureHandle, object>((_, reference) => {
  const { gl, scene, camera } = useThree();

  useImperativeHandle(
    reference,
    () => ({
      captureScreenshot: () => {
        if (!gl.domElement) {
          throw new Error('Screenshot attempted before renderer was ready');
        }

        const removedObjects: THREE.Object3D[] = [];
        scene.traverse((object) => {
          // Check if the object is for preview only
          if (object.userData?.isPreviewOnly) {
            object.visible = false;
            removedObjects.push(object);
          }
        });

        // Ensure scene is rendered before capturing
        gl.render(scene, camera);

        // Capture screenshot
        const dataURL = gl.domElement.toDataURL('image/png');

        // Restore the objects
        for (const object of removedObjects) {
          object.visible = true;
        }

        // Render the scene again to ensure the objects are visible
        gl.render(scene, camera);

        return dataURL;
      },
    }),
    [gl, scene, camera],
  );

  // Return an empty fragment
  return <></>;
});

ScreenshotCapture.displayName = 'ScreenshotCapture';

export type CadViewerProperties = {
  enableGizmo?: boolean;
  enableGrid?: boolean;
  enableZoom?: boolean;
  className?: string;
  center?: boolean;
  stageOptions?: StageOptions;
  onCanvasReady?: (isReady: boolean) => void;
};

export type ThreeContextProperties = CanvasProps & CadViewerProperties;

// Updated ref type to include screenshot capability
export type ThreeCanvasReference = HTMLCanvasElement & {
  captureScreenshot?: () => string;
  isScreenshotReady?: boolean;
};

export const ThreeProvider = forwardRef<ThreeCanvasReference, ThreeContextProperties>(
  (
    {
      children,
      enableGizmo = false,
      enableGrid = false,
      enableZoom = false,
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

      (canvas as ThreeCanvasReference).captureScreenshot = () => {
        return screenshotReference.current?.captureScreenshot() || '';
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
          enableDamping={true}
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
