import { useCallback, useEffect, useMemo, useState } from 'react';
import { Node } from 'three/webgpu';
import { WebglLimitFallback } from '#cad/webgl-fallback.jsx';
import { ThreeCanvasInstance } from '#graphics/three/three-canvas-instance.jsx';
import type { ThreeContextProperties } from '#graphics/three/three-viewer-properties.js';
import { useWebglContextRef } from '#hooks/use-webgl-context-tracker.jsx';
import { useViewerFeature } from '#environment/viewer-environment.jsx';
import { WebglErrorBoundary } from '#cad/webgl-error-boundary.jsx';
import { WebGpuInitializationError } from '#graphics/three/webgpu-initialization-error.js';
import { webGpuFallbackReason } from '#graphics/graphics-backend.js';
import { resolveViewerPixelRatio } from '#graphics/three/utils/device-tier.js';
import { admitsViewerContext, estimateViewerSurfaceBytes } from '#machines/webgl-context.machine.js';

// Three owns one global switch; each requesting WebGPU canvas holds a reference.
let shaderStackOwners = 0;

/**
 * Mounts the Three.js canvas for the chosen graphics backend, showing a fallback when the viewer context limit or
 * render-surface budget is reached. Until the canvas reports its size, a viewer counts as filling the window.
 *
 * @param properties - The backend, canvas, camera control and stage options.
 * @returns The canvas, or the WebGL limit fallback.
 * @public
 */
export function ThreeProvider(properties: ThreeContextProperties): React.JSX.Element {
  // A canvas loss turns the viewer's backend to WebGL (graphics machine `webGpuCanvasLost`) while this boundary already
  // shows its WebGL fallback: keeping the boundary's key then keeps that canvas instead of mounting a second one.
  const boundaryBackend =
    properties.graphicsBackend === 'webgl' && webGpuFallbackReason() === 'canvas-loss'
      ? 'webgpu'
      : properties.graphicsBackend;
  return (
    <WebglErrorBoundary
      key={boundaryBackend}
      fallback={({ error }) => {
        if (boundaryBackend !== 'webgpu' || !(error instanceof WebGpuInitializationError)) {
          throw error ?? new Error('Renderer failed without an error description');
        }
        // A canvas cannot change its GPU context type, so WebGL mounts on a fresh owner, and only once. An error thrown
        // while a boundary renders its fallback goes to the boundary above, but the WebGL canvas reports a failed start
        // after it has mounted (its renderer is created asynchronously), and this boundary, still an ancestor, would
        // catch that and mount WebGL again, without end when no WebGL context can be created (the node pipeline
        // reports its own failed start as a WebGPU initialization error too). The inner boundary passes any failure of
        // the fallback up as an ordinary error, for the viewer's failure screen and its Retry.
        return (
          <WebglErrorBoundary
            fallback={({ error: fallbackError }) => {
              throw fallbackError instanceof WebGpuInitializationError
                ? new Error(fallbackError.message, { cause: fallbackError })
                : (fallbackError ?? new Error('The WebGL renderer failed without an error description'));
            }}
          >
            <ThreeProviderCanvas {...properties} graphicsBackend='webgl' />
          </WebglErrorBoundary>
        );
      }}
    >
      <ThreeProviderCanvas {...properties} />
    </WebglErrorBoundary>
  );
}

function ThreeProviderCanvas({
  children,
  graphicsBackend,
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
  zoomSpeed = 2,
  gizmoContainer,
  ...properties
}: ThreeContextProperties): React.JSX.Element {
  const captureShaderStacks = useViewerFeature('webGpuShaderStacks');

  // The canvas actor holds this viewer's slot in the budget for the canvas's life (acquire, resize, release).
  const webglRef = useWebglContextRef();

  // oxlint-disable-next-line react/hook-use-state -- one-time snapshot, setter intentionally unused
  const [initialSurfaceBytes] = useState(() =>
    estimateViewerSurfaceBytes(
      (globalThis.innerWidth || 0) * (globalThis.innerHeight || 0),
      resolveViewerPixelRatio() || 1,
    ),
  );

  // oxlint-disable-next-line react/hook-use-state -- one-time snapshot, setter intentionally unused
  const [isOverLimit] = useState(() => {
    if (!webglRef) {
      return false;
    }

    return !admitsViewerContext(webglRef.getSnapshot().context, initialSurfaceBytes);
  });

  useEffect(() => {
    if (!captureShaderStacks || graphicsBackend !== 'webgpu') {
      return;
    }

    shaderStackOwners += 1;
    Node.captureStackTrace = true;
    return () => {
      shaderStackOwners -= 1;
      Node.captureStackTrace = shaderStackOwners > 0;
    };
  }, [captureShaderStacks, graphicsBackend]);

  const [canvasKey, setCanvasKey] = useState(0);

  const canvasMountKey = useMemo(() => `${graphicsBackend}:${canvasKey}`, [graphicsBackend, canvasKey]);

  const handleRetry = useCallback(() => {
    setCanvasKey((previous) => previous + 1);
  }, []);

  if (isOverLimit) {
    return <WebglLimitFallback onRetry={handleRetry} />;
  }

  return (
    <ThreeCanvasInstance
      key={canvasMountKey}
      {...properties}
      enableGizmo={enableGizmo}
      enableGrid={enableGrid}
      enableAxes={enableAxes}
      enableZoom={enableZoom}
      enablePan={enablePan}
      secondaryMouseButtonMode={secondaryMouseButtonMode}
      enableDamping={enableDamping}
      upDirection={upDirection}
      className={className}
      stageOptions={stageOptions}
      zoomSpeed={zoomSpeed}
      gizmoContainer={gizmoContainer}
      graphicsBackend={graphicsBackend}
      onRetry={handleRetry}
      webglContext={webglRef}
      admittedBytes={initialSurfaceBytes}
    >
      {children}
    </ThreeCanvasInstance>
  );
}
