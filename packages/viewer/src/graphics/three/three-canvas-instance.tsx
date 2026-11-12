import type { RootState } from '@react-three/fiber';
import { Canvas, flushSync as flushThreeSync } from '@react-three/fiber';
import { useSelector } from '@xstate/react';
import { flushSync } from 'react-dom';
import type { ActorRefFrom } from 'xstate';
import type { RefCallback } from 'react';
import type { Group } from 'three';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RendererInstance } from '#graphics/three/renderer.js';
import { RenderFpsOverlay } from '#graphics/three/render-fps-overlay.jsx';
import { renderLoopObservers } from '#graphics/three/render-loop-observer.js';
import { createControlsAdapter } from '#graphics/three/adapters/controls-adapter.js';
import { createTauR3fGlProp } from '#graphics/three/canvas-three-gl.js';
import type { TauR3fGlFactory } from '#graphics/three/canvas-three-gl.js';
import { GraphicsContextLostFallback } from '#graphics/three/graphics-context-lost-fallback.jsx';
import { Grid } from '#graphics/three/grid.jsx';
import { PostProcessing } from '#graphics/three/post-processing.jsx';
import { OverlayDepthProvider, SceneOverlay } from '#graphics/three/scene-overlay.jsx';
import { ModelEmphasisOverlay } from '#graphics/three/react/model-emphasis-overlay.jsx';
import { Scene } from '#graphics/three/scene.jsx';
import { AxesHelper } from '#graphics/three/react/axes-helper.jsx';
import { ThreeGraphicsBackendProvider } from '#graphics/three/three-graphics-backend-context.jsx';
import type { ThreeContextProperties } from '#graphics/three/three-viewer-properties.js';
import { setRaycasterFromCamera } from '#graphics/three/utils/raycaster-from-camera.js';
import { WebGpuInspectorOverlay } from '#graphics/three/webgpu-inspector-overlay.jsx';
import { cn } from '@taucad/ui/utils/cn';
import { useCameraConnectorRef, useCameraConsumersRef, useCameraRig, useGraphics } from '#hooks/use-graphics.jsx';
import { useViewerEnvironment, useViewerFeature } from '#environment/viewer-environment.jsx';
import { resolveViewerPixelRatio } from '#graphics/three/utils/device-tier.js';
import { viewerRendererCreated } from '#lib/viewer-events.js';
import { WebGpuInitializationError } from '#graphics/three/webgpu-initialization-error.js';
import { canvasHostCreated } from '#graphics/three/three-canvas-instance-host.js';
import {
  createViewportGizmoInteractionLock,
  ViewportGizmoInteractionLockProvider,
} from '#graphics/three/controls/viewport-gizmo-interaction-lock.jsx';
import type { CanvasHostRoot } from '#graphics/three/three-canvas-instance-host.js';
import type { CanvasEvent, CanvasFailure, CanvasRef, CanvasSnapshot } from '#machines/canvas.machine.js';
import type { webglContextMachine } from '#machines/webgl-context.machine.js';

/** The world up axis graphics keeps, read when the camera's up changes. */
const selectGraphicsUpDirection = (graphicsRef: ReturnType<typeof useGraphics>): 'x' | 'y' | 'z' =>
  graphicsRef.getSnapshot().context.upDirection;

/** Whether this mount's canvas actor still takes events: a detached one stopped with its surface. */
const selectCanvasRunning = (canvas: CanvasRef | undefined): canvas is CanvasRef =>
  canvas?.getSnapshot().status === 'active';

/**
 * Props for {@link ThreeCanvasInstance}: the Three.js context properties plus a retry callback for context loss.
 *
 * @public
 */
export type ThreeCanvasInstanceProps = ThreeContextProperties & {
  /** Parent bumps canvas key — remount this instance fresh after real device/context loss retry. */
  readonly onRetry: () => void;
  /** The viewer's WebGL context budget; the canvas actor holds a slot in it for the canvas's life. */
  readonly webglContext?: ActorRefFrom<typeof webglContextMachine>;
  /** The surface estimate the viewer was admitted with, held until the canvas reports its own size. */
  readonly admittedBytes?: number;
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

// The R3F scene root unmounts separately from the DOM canvas root.
function CanvasRendererLifetime({ factory }: { readonly factory: TauR3fGlFactory }): undefined {
  const release = useRef<(() => void) | undefined>(undefined);
  useLayoutEffect(() => {
    // Environment targets are allocated in layout effects. The DOM canvas can retire
    // before passive effects mount, so ownership must already exist at that point.
    release.current = factory.retainScene();
  }, [factory]);
  useEffect(() => release.current, [factory]);
  return undefined;
}

/**
 * Rebuilds the error a failed canvas hands to the viewer's error boundary, which remounts on WebGL only for a WebGPU
 * initialization error.
 * @param failure - The canvas actor's recorded failure.
 * @returns The error to throw.
 */
const failureError = (failure: CanvasFailure): Error =>
  failure.kind === 'webgpu-initialization'
    ? new WebGpuInitializationError(failure.message)
    : new Error(failure.message);

/**
 * One R3F `<Canvas>` mount. Its renderer lifecycle (creating, ready, presented, lost, failed) is the graphics actor's
 * canvas child, attached from the surface element's ref and hosted from R3F's `onCreated`; this component only renders
 * the canvas, its context-lost fallback or its failure from that actor's state. The canvas actor also presents the
 * view's camera on the surface (its viewport, and its clip policy while the grid is in the
 * scene) and graphics' controls adapter steps the controls each frame. No effect here sends, subscribes or times: the
 * surface and the grid report only their own mounts, from their refs.
 * `ThreeProvider` mounts this with `key` = `${graphicsBackend}:${retryCount}`, so each mount is a new canvas actor.
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
  // Graphics' world up decides the grid's orientation and its clip plane, which the canvas actor presents.
  upDirection: _upDirection,
  className,
  stageOptions,
  postProcessingSettings,
  zoomSpeed = 2,
  gizmoContainer,
  webglContext,
  admittedBytes,
  ...canvasProperties
}: ThreeCanvasInstanceProps): React.JSX.Element {
  const dpr = resolveViewerPixelRatio();
  const isInspectorEnabled = useViewerFeature('webGpuInspector');
  const { showRenderFps = true, readableCanvas = false } = useViewerEnvironment();
  const isTauDebugEnabled = useViewerFeature('tauDebug');
  const canvasId = useId();
  const graphicsRef = useGraphics();
  const canvasRef = useSelector(graphicsRef, (snapshot) =>
    snapshot.context.canvas?.canvasId === canvasId ? snapshot.context.canvas.ref : undefined,
  );
  const phase = useSelector(canvasRef, (snapshot) => snapshot?.value);
  const failure = useSelector(canvasRef, (snapshot) => snapshot?.context.failure);
  const isContextLost = phase === 'lost';
  const cameraRig = useCameraRig();
  const cameraConnectorRef = useCameraConnectorRef();
  const cameraConsumersRef = useCameraConsumersRef();
  /** The live R3F root, kept so a surface that re-attaches (a Suspense reveal) hosts its new canvas actor on it. */
  const rootRef = useRef<CanvasHostRoot | undefined>(undefined);
  /** Host callbacks run outside React: they address this mount's canvas actor as graphics holds it now. */
  const sendToCanvas = useCallback(
    (event: CanvasEvent): void => {
      const { canvas } = graphicsRef.getSnapshot().context;
      if (canvas?.canvasId === canvasId) {
        canvas.ref.send(event);
      }
    },
    [canvasId, graphicsRef],
  );
  /**
   * This canvas's view-cube interaction lock: the cube takes it, and the controls adapter does not step while it is
   * held.
   */
  const [interactionLock] = useState(createViewportGizmoInteractionLock);
  /** Hands graphics the controls adapter for this mount's root; graphics stops it with the surface (charter I9, I11). */
  const attachControls = useCallback(
    (held: CanvasHostRoot): void => {
      graphicsRef.send({
        type: 'controlsAttached',
        canvasId,
        adapter: createControlsAdapter({
          root: held.root,
          rig: cameraRig,
          connectorRef: cameraConnectorRef,
          consumersRef: cameraConsumersRef,
          getUpAxis: () => selectGraphicsUpDirection(graphicsRef),
          isInteractionLocked: interactionLock.isActive,
        }),
      });
    },
    [cameraConnectorRef, cameraConsumersRef, cameraRig, canvasId, graphicsRef, interactionLock],
  );
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
                  const previousSize = rootRef.current?.root.get().size;
                  // Commit both React roots before drawing: the camera, composer and gizmo
                  // must see the new viewport in this same prepaint ResizeObserver delivery.
                  flushThreeSync(() => {
                    flushSync(() => {
                      callback(entries, observer);
                    });
                  });
                  const state = rootRef.current?.root.get();
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
        onCreateError(error) {
          sendToCanvas({
            type: 'rendererFailed',
            failure: {
              kind: error instanceof WebGpuInitializationError ? 'webgpu-initialization' : 'renderer',
              message: error.message,
            },
          });
        },
        preserveDrawingBuffer: readableCanvas,
      }),
    [cameraRig, graphicsBackend, readableCanvas, sendToCanvas],
  );

  // The surface attaches its canvas actor in the commit that mounts it, so the stage is never painted as ready in
  // between, and detaches it when this mount leaves; the context-lost fallback keeps the actor (and its budget). A
  // Suspense boundary that hides and reveals this mount detaches and re-attaches the surface while this mount, and
  // its R3F root, live on without a second `onCreated`. The detach records how far the renderer got, and the
  // re-attached surface's new canvas actor resumes from there: lost again, or hosted on the root it already has.
  const detachedPhase = useRef<CanvasSnapshot['value'] | undefined>(undefined);

  const attachSurface = useCallback<RefCallback<HTMLDivElement>>(
    (element) => {
      if (!element) {
        const { canvas } = graphicsRef.getSnapshot().context;
        detachedPhase.current = canvas?.canvasId === canvasId ? canvas.ref.getSnapshot().value : undefined;
        graphicsRef.send({ type: 'canvasDetached', canvasId });
        return;
      }
      const resumed = detachedPhase.current;
      detachedPhase.current = undefined;
      const reattached = resumed === 'ready' || resumed === 'presented' || resumed === 'lost';
      graphicsRef.send({ type: 'canvasAttached', canvasId, kind: 'canvas', webglContext, admittedBytes, reattached });
      const held = rootRef.current;
      if (resumed === 'lost') {
        sendToCanvas({ type: 'contextLost' });
      } else if (reattached && held && !held.isRetired()) {
        sendToCanvas(canvasHostCreated(held));
        attachControls(held);
      }
    },
    [admittedBytes, attachControls, canvasId, graphicsRef, sendToCanvas, webglContext],
  );

  /*
   * The grid's place in the scene: the canvas actor pads the camera's clip planes for the grid while it is drawn,
   * reported from the scene's own mount and unmount as the surface's attach is; graphics tells the canvas the axis the
   * grid lies across. The marker re-reports to each canvas actor this mount attaches: a Suspense reveal (which
   * re-attaches the surface but not the scene, a separate root) gives the callback a new identity, so React detaches it
   * and attaches it again.
   */
  const presentGrid = useCallback<RefCallback<Group>>(
    (marker) => {
      if (selectCanvasRunning(canvasRef)) {
        canvasRef.send({ type: 'gridChanged', enabled: marker !== null });
      }
    },
    [canvasRef],
  );

  const bindCanvas = useCallback<RefCallback<HTMLCanvasElement>>(
    (canvas) => {
      glProperty.bindCanvas(canvas ?? undefined);
    },
    [glProperty],
  );

  const onCanvasCreated = useCallback(
    (state: RootState): void => {
      if (glProperty.isRetired()) {
        return;
      }
      const held: CanvasHostRoot = { root: state, isRetired: glProperty.isRetired };
      rootRef.current = held;
      installTauPointerRays(state);
      const created = canvasHostCreated(held);
      // R3F types its renderer as WebGL even when the factory supplies WebGPU.
      const renderer = state.gl as RendererInstance;
      viewerRendererCreated(created.backend, () => ({
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      }));
      sendToCanvas(created);
      attachControls(held);
    },
    [attachControls, glProperty, sendToCanvas],
  );

  if (failure) {
    // The renderer never existed or its device is gone: hand the failure to the viewer's `WebglErrorBoundary` fallback.
    throw failureError(failure);
  }

  const surface = isContextLost ? (
    <GraphicsContextLostFallback onRetry={onRetry} />
  ) : (
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
      <CanvasRendererLifetime factory={glProperty} />
      {/* Both execution backends consume node materials. Effective API is reported above after init. */}
      <ThreeGraphicsBackendProvider value='webgpu'>
        <OverlayDepthProvider>
          <ViewportGizmoInteractionLockProvider lock={interactionLock}>
            <Scene
              enableGizmo={enableGizmo}
              enableDamping={enableDamping}
              enableZoom={enableZoom}
              enablePan={enablePan}
              secondaryMouseButtonMode={secondaryMouseButtonMode}
              stageOptions={stageOptions}
              zoomSpeed={zoomSpeed}
              gizmoContainer={gizmoContainer}
            >
              {children}
            </Scene>
          </ViewportGizmoInteractionLockProvider>
          <PostProcessing settings={postProcessingSettings} />
          {isInspectorEnabled ? <WebGpuInspectorOverlay /> : null}
          <ModelEmphasisOverlay />
          <SceneOverlay overlayActive={enableAxes || enableGrid}>
            {enableAxes ? <AxesHelper /> : null}
            {enableGrid ? <Grid /> : null}
          </SceneOverlay>
          {enableGrid ? <group ref={presentGrid} name='grid-clip-policy' /> : null}
        </OverlayDepthProvider>
        {showRenderFps && isTauDebugEnabled ? (
          <RenderFpsOverlay hasTopRightGizmo={enableGizmo && Boolean(gizmoContainer)} />
        ) : null}
      </ThreeGraphicsBackendProvider>
    </Canvas>
  );

  // The wrapper spans the canvas and its context-lost fallback, so the canvas actor outlives the swap to the fallback.
  return (
    <div ref={attachSurface} className='contents'>
      {surface}
    </div>
  );
}
