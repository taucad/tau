import { useCallback, useEffect, useMemo, useState } from 'react';
import { Node } from 'three/webgpu';
import { WebglLimitFallback } from '#components/geometry/cad/webgl-fallback.js';
import { ThreeCanvasInstance } from '#components/geometry/graphics/three/three-canvas-instance.js';
import type { ThreeContextProperties } from '#components/geometry/graphics/three/three-viewer-properties.js';
import { useFeature } from '#flags/use-feature.js';
import { useWebglContextRef } from '#hooks/use-webgl-context-tracker.js';

export function ThreeProvider({
  children,
  graphicsBackend,
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
  ...properties
}: ThreeContextProperties): React.JSX.Element {
  const isTauDebugEnabled = useFeature('tauDebug');

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
    if (!isTauDebugEnabled) {
      return;
    }

    Node.captureStackTrace = true;
    return () => {
      Node.captureStackTrace = false;
    };
  }, [isTauDebugEnabled]);

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
      enableDamping={enableDamping}
      upDirection={upDirection}
      enableCentering={enableCentering}
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
