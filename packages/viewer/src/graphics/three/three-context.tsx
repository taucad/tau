import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useState } from 'react';
import { Node } from 'three/webgpu';
import { WebglLimitFallback } from '#cad/webgl-fallback.jsx';
import { ThreeCanvasInstance } from '#graphics/three/three-canvas-instance.jsx';
import type { ThreeContextProperties } from '#graphics/three/three-viewer-properties.js';
import { useWebglContextRef } from '#hooks/use-webgl-context-tracker.jsx';
import { useViewerFeature } from '#environment/viewer-environment.jsx';
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
export function ThreeProvider({
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

  const webglRef = useWebglContextRef();
  const holderId = useId();

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

  // A layout effect, so the holder exists before the canvas reports its first size.
  useLayoutEffect(() => {
    if (!webglRef || isOverLimit) {
      return;
    }

    // WebGPU canvases hold a device and surface too, so both backends count against one budget.
    webglRef.send({ type: 'acquire', id: holderId, bytes: initialSurfaceBytes });
    return () => {
      webglRef.send({ type: 'release', id: holderId });
    };
  }, [graphicsBackend, webglRef, isOverLimit, holderId, initialSurfaceBytes]);

  const handleSurfaceResize = useCallback(
    (cssPixels: number, pixelRatio: number): void => {
      webglRef?.send({ type: 'resize', id: holderId, bytes: estimateViewerSurfaceBytes(cssPixels, pixelRatio) });
    },
    [webglRef, holderId],
  );

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
      onSurfaceResize={webglRef ? handleSurfaceResize : undefined}
    >
      {children}
    </ThreeCanvasInstance>
  );
}
