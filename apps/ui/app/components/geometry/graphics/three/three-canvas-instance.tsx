import type { CanvasProps, RootState } from '@react-three/fiber';
import { Canvas } from '@react-three/fiber';
import { useCallback, useMemo, useState } from 'react';
import type { WebGPURenderer } from 'three/webgpu';
import { ActorBridge } from '#components/geometry/graphics/three/actor-bridge.js';
import { createTauR3fGlProp } from '#components/geometry/graphics/three/canvas-three-gl.js';
import { GraphicsContextLostFallback } from '#components/geometry/graphics/three/graphics-context-lost-fallback.js';
import { Grid } from '#components/geometry/graphics/three/grid.js';
import { PostProcessing } from '#components/geometry/graphics/three/post-processing.js';
import { SceneOverlay } from '#components/geometry/graphics/three/scene-overlay.js';
import { Scene } from '#components/geometry/graphics/three/scene.js';
import { AxesHelper } from '#components/geometry/graphics/three/react/axes-helper.js';
import { ThreeGraphicsBackendProvider } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import type { ThreeContextProperties } from '#components/geometry/graphics/three/three-viewer-properties.js';
import { WebGpuInspectorOverlay } from '#components/geometry/graphics/three/webgpu-inspector-overlay.js';
import { useFeature } from '#flags/use-feature.js';
import { cn } from '#utils/ui.utils.js';

export type ThreeCanvasInstanceProps = ThreeContextProperties & {
  /** Parent bumps canvas key — remount this instance fresh after real device/context loss retry. */
  readonly onRetry: () => void;
};

/**
 * One R3F `<Canvas>` mount plus lifecycle state tied to that GPU binding (`isCanvasReady`, loss handlers).
 * `ThreeProvider` mounts this with `key` = `${graphicsBackend}:${retryCount}` so teardown listeners never update a survivor instance.
 */
export function ThreeCanvasInstance({
  children,
  graphicsBackend,
  onRetry,
  enableGizmo = false,
  enableGrid = false,
  enableAxes = false,
  enableZoom = false,
  enablePan = false,
  enableDamping = false,
  upDirection = 'z',
  enableCentering = false,
  className,
  stageOptions,
  zoomSpeed = 2,
  gizmoContainer,
  ...canvasProperties
}: ThreeCanvasInstanceProps): React.JSX.Element {
  const dpr = Math.min(globalThis.devicePixelRatio, 2);
  const isTauDebugEnabled = useFeature('tauDebug');
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [isContextLost, setIsContextLost] = useState(false);

  const glProperty: CanvasProps['gl'] = useMemo(() => createTauR3fGlProp(graphicsBackend), [graphicsBackend]);

  const onCanvasCreated = useCallback((state: RootState): void => {
    const renderer = state.gl;
    renderer.toneMappingExposure = 1;

    if ('isWebGPURenderer' in renderer && renderer.isWebGPURenderer) {
      const webGpuRenderer = renderer as unknown as InstanceType<typeof WebGPURenderer>;
      const previousOnDeviceLost = webGpuRenderer.onDeviceLost;
      webGpuRenderer.onDeviceLost = (
        info: Parameters<InstanceType<typeof WebGPURenderer>['onDeviceLost']>[0],
      ): void => {
        previousOnDeviceLost.call(webGpuRenderer, info);
        setIsContextLost(true);
      };
    } else {
      renderer.domElement.addEventListener('webglcontextlost', (event): void => {
        event.preventDefault();
        setIsContextLost(true);
      });
    }

    setIsCanvasReady(true);
  }, []);

  if (isContextLost) {
    return <GraphicsContextLostFallback onRetry={onRetry} />;
  }

  return (
    <Canvas
      // Spread consumer props before Tau policy props so callers cannot shadow `gl`, `dpr`, `frameloop`, or `onCreated`.
      {...canvasProperties}
      gl={glProperty}
      dpr={dpr}
      frameloop='demand'
      className={cn('bg-background', className)}
      onCreated={onCanvasCreated}
    >
      <ThreeGraphicsBackendProvider value={graphicsBackend}>
        <Scene
          enableGizmo={enableGizmo}
          enableCentering={enableCentering}
          enableDamping={enableDamping}
          enableZoom={enableZoom}
          enablePan={enablePan}
          upDirection={upDirection}
          stageOptions={stageOptions}
          zoomSpeed={zoomSpeed}
          gizmoContainer={gizmoContainer}
        >
          {children}
        </Scene>
        <PostProcessing />
        {isTauDebugEnabled ? <WebGpuInspectorOverlay /> : null}
        <SceneOverlay overlayActive={enableAxes || enableGrid}>
          {enableAxes ? <AxesHelper /> : null}
          {enableGrid ? <Grid /> : null}
        </SceneOverlay>
        {isCanvasReady ? <ActorBridge /> : null}
      </ThreeGraphicsBackendProvider>
    </Canvas>
  );
}
