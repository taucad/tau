import { useCallback, useEffect, useMemo, useState } from 'react';
import { Node } from 'three/webgpu';
import { WebglLimitFallback } from '#cad/webgl-fallback.jsx';
import { ThreeCanvasInstance } from '#graphics/three/three-canvas-instance.jsx';
import type { ThreeContextProperties } from '#graphics/three/three-viewer-properties.js';
import { useWebglContextRef } from '#hooks/use-webgl-context-tracker.jsx';
import { useViewerFeature } from '#environment/viewer-environment.jsx';

// Three owns one global switch; each requesting WebGPU canvas holds a reference.
let shaderStackOwners = 0;

/**
 * Mounts the Three.js canvas for the chosen graphics backend, showing a fallback when the WebGL context limit is reached.
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

  // oxlint-disable-next-line react/hook-use-state -- one-time snapshot, setter intentionally unused
  const [isOverLimit] = useState(() => {
    if (!webglRef) {
      return false;
    }

    const snap = webglRef.getSnapshot();
    return snap.context.count >= snap.context.limit;
  });

  useEffect(() => {
    if (graphicsBackend !== 'webgl' || !webglRef || isOverLimit) {
      return;
    }

    webglRef.send({ type: 'acquire' });
    return () => {
      webglRef.send({ type: 'release' });
    };
  }, [graphicsBackend, webglRef, isOverLimit]);

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

  if (graphicsBackend === 'webgl' && isOverLimit) {
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
    >
      {children}
    </ThreeCanvasInstance>
  );
}
