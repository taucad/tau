import type { RootState } from '@react-three/fiber';
import { Canvas, flushSync as flushThreeSync } from '@react-three/fiber';
import { flushSync } from 'react-dom';
import type { RefCallback } from 'react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { WebGPURenderer } from 'three/webgpu';
import { RenderFpsOverlay } from '#graphics/three/render-fps-overlay.jsx';
import { renderLoopObservers } from '#graphics/three/render-loop-observer.js';
import { ActorBridge } from '#graphics/three/actor-bridge.jsx';
import { createTauR3fGlProp } from '#graphics/three/canvas-three-gl.js';
import { GraphicsContextLostFallback } from '#graphics/three/graphics-context-lost-fallback.jsx';
import { Grid } from '#graphics/three/grid.jsx';
import { PostProcessing } from '#graphics/three/post-processing.jsx';
import { OverlayDepthProvider, SceneOverlay } from '#graphics/three/scene-overlay.jsx';
import { ModelEmphasisOverlay } from '#graphics/three/react/model-emphasis-overlay.jsx';
import { Scene } from '#graphics/three/scene.jsx';
import { AxesHelper } from '#graphics/three/react/axes-helper.jsx';
import { ThreeGraphicsBackendProvider } from '#graphics/three/three-graphics-backend-context.jsx';
import type { ThreeContextProperties } from '#graphics/three/three-viewer-properties.js';
import {
  infiniteGridFadeEndVisibleSpans,
  infiniteGridPresentationPlaneByUpDirection,
} from '#graphics/three/utils/infinite-grid-frame.js';
import { setRaycasterFromCamera } from '#graphics/three/utils/raycaster-from-camera.js';
import { WebGpuInspectorOverlay } from '#graphics/three/webgpu-inspector-overlay.jsx';
import { cn } from '@taucad/ui/utils/cn';
import { useCameraRig } from '#hooks/use-graphics.jsx';
import { useViewerEnvironment, useViewerFeature } from '#environment/viewer-environment.jsx';
import { resolveViewerPixelRatio } from '#graphics/three/utils/device-tier.js';

/**
 * Props for {@link ThreeCanvasInstance}: the Three.js context properties plus a retry callback for context loss.
 *
 * @public
 */
export type ThreeCanvasInstanceProps = ThreeContextProperties & {
  /** Parent bumps canvas key — remount this instance fresh after real device/context loss retry. */
  readonly onRetry: () => void;
};

/**
 * Sets R3F's pointer rays with {@link setRaycasterFromCamera} after whichever compute the root settled on: its own, or
 * the one an `eventPrefix` Canvas installs just before `onCreated`. Three's `setFromCamera` starts an orthographic ray
 * beyond the scene under WebGPU reversed depth, so model hover, selection and clicks missed in orthographic view.
 */
const installTauPointerRays = (state: RootState): void => {
  const { compute } = state.events;
  state.setEvents({
    compute(event, rootState, previous) {
      compute?.(event, rootState, previous);
      setRaycasterFromCamera(rootState.raycaster, rootState.pointer, rootState.camera);
    },
  });
};

/**
 * One R3F `<Canvas>` mount plus lifecycle state tied to that GPU binding (`isCanvasReady`, loss handlers).
 * `ThreeProvider` mounts this with `key` = `${graphicsBackend}:${retryCount}` so teardown listeners never update a survivor instance.
 * @public
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
  secondaryMouseButtonMode = 'camera-pan',
  enableDamping = false,
  upDirection = 'z',
  className,
  stageOptions,
  postProcessingSettings,
  zoomSpeed = 2,
  gizmoContainer,
  ...canvasProperties
}: ThreeCanvasInstanceProps): React.JSX.Element {
  const dpr = resolveViewerPixelRatio();
  const isInspectorEnabled = useViewerFeature('webGpuInspector');
  const { showRenderFps = true, readableCanvas = false } = useViewerEnvironment();
  const isTauDebugEnabled = useViewerFeature('tauDebug');
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [isContextLost, setIsContextLost] = useState(false);
  const [rendererError, setRendererError] = useState<Error>();
  const cameraRig = useCameraRig();
  const rootRef = useRef<RootState | undefined>(undefined);
  const resize = useMemo(
    () => ({
      // React-use-measure uses the scroll debounce for native element resizes too.
      debounce: 0,
      polyfill:
        typeof ResizeObserver === 'undefined'
          ? undefined
          : class extends ResizeObserver {
              public constructor(callback: ResizeObserverCallback) {
                super((entries, observer) => {
                  const previousSize = rootRef.current?.get().size;
                  // Commit both React roots before drawing: the camera, composer and gizmo
                  // must see the new viewport in this same prepaint ResizeObserver delivery.
                  flushThreeSync(() => {
                    flushSync(() => {
                      callback(entries, observer);
                    });
                  });
                  const state = rootRef.current?.get();
                  if (state && state.size !== previousSize && state.size.width > 0 && state.size.height > 0) {
                    const render = (): void => {
                      state.advance(performance.now(), false);
                    };
                    const observer = renderLoopObservers.get(state.gl.domElement);
                    if (observer) {
                      observer.withResizeSubmission(render);
                    } else {
                      render();
                    }
                    // Advance runs outside R3F's demand loop. Retain its normal followup
                    // so controls damping/useFrame invalidations cannot be consumed here.
                    state.invalidate();
                  }
                });
              }
            },
    }),
    [],
  );

  const glProperty = useMemo(
    () =>
      createTauR3fGlProp(graphicsBackend, [cameraRig.perspectiveCamera, cameraRig.orthographicCamera], {
        onCreateError: setRendererError,
        preserveDrawingBuffer: readableCanvas,
      }),
    [cameraRig, graphicsBackend, readableCanvas],
  );

  const bindCanvas = useCallback<RefCallback<HTMLCanvasElement>>(
    (canvas) => {
      glProperty.bindCanvas(canvas ?? undefined);
    },
    [glProperty],
  );

  useLayoutEffect(() => {
    cameraRig.setClipPlanes(
      enableGrid && !isContextLost
        ? {
            farPaddingVerticalSpans: infiniteGridFadeEndVisibleSpans,
            presentationPlane: infiniteGridPresentationPlaneByUpDirection[upDirection],
          }
        : undefined,
    );
  }, [cameraRig, enableGrid, isContextLost, upDirection]);

  useLayoutEffect(
    () => () => {
      cameraRig.setClipPlanes(undefined);
    },
    [cameraRig],
  );

  const onCanvasCreated = useCallback(
    (state: RootState): void => {
      if (glProperty.isRetired()) {
        return;
      }
      rootRef.current = state;
      installTauPointerRays(state);
      const renderer = state.gl;

      if ('isWebGPURenderer' in renderer && renderer.isWebGPURenderer) {
        const webGpuRenderer = renderer as unknown as InstanceType<typeof WebGPURenderer>;
        const previousOnDeviceLost = webGpuRenderer.onDeviceLost;
        webGpuRenderer.onDeviceLost = (
          info: Parameters<InstanceType<typeof WebGPURenderer>['onDeviceLost']>[0],
        ): void => {
          if (glProperty.isRetired()) {
            return;
          }
          previousOnDeviceLost.call(webGpuRenderer, info);
          setIsContextLost(true);
        };
      } else {
        renderer.domElement.addEventListener('webglcontextlost', (event): void => {
          if (glProperty.isRetired()) {
            return;
          }
          event.preventDefault();
          setIsContextLost(true);
        });
      }

      setIsCanvasReady(true);
    },
    [glProperty],
  );

  if (rendererError) {
    // The renderer never existed: hand the failure to the viewer's `WebglErrorBoundary` fallback.
    throw rendererError;
  }

  if (isContextLost) {
    return <GraphicsContextLostFallback onRetry={onRetry} />;
  }

  return (
    <Canvas
      // Spread consumer props before Tau policy props so callers cannot shadow `gl`, `dpr`, `frameloop`, or `onCreated`.
      {...canvasProperties}
      ref={bindCanvas}
      camera={cameraRig.activeCamera}
      gl={glProperty}
      dpr={dpr}
      frameloop='demand'
      resize={resize}
      className={cn('bg-background', className)}
      onCreated={onCanvasCreated}
    >
      <ThreeGraphicsBackendProvider value={graphicsBackend}>
        <Scene
          enableGizmo={enableGizmo}
          enableDamping={enableDamping}
          enableZoom={enableZoom}
          enablePan={enablePan}
          secondaryMouseButtonMode={secondaryMouseButtonMode}
          upDirection={upDirection}
          stageOptions={stageOptions}
          zoomSpeed={zoomSpeed}
          gizmoContainer={gizmoContainer}
        >
          {children}
        </Scene>
        <OverlayDepthProvider>
          <PostProcessing settings={postProcessingSettings} />
          {isInspectorEnabled ? <WebGpuInspectorOverlay /> : null}
          <ModelEmphasisOverlay />
          <SceneOverlay overlayActive={enableAxes || enableGrid}>
            {enableAxes ? <AxesHelper /> : null}
            {enableGrid ? <Grid /> : null}
          </SceneOverlay>
        </OverlayDepthProvider>
        {isCanvasReady ? <ActorBridge /> : null}
        {showRenderFps && isTauDebugEnabled ? (
          <RenderFpsOverlay hasTopRightGizmo={enableGizmo && Boolean(gizmoContainer)} />
        ) : null}
      </ThreeGraphicsBackendProvider>
    </Canvas>
  );
}
