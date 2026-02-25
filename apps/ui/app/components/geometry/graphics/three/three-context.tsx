import { useCallback, useEffect, useState } from 'react';
import { CadCanvas } from '@taucad/three/react';
import type { StageOptions } from '@taucad/three/react';
import { ActorBridge } from '#components/geometry/graphics/three/actor-bridge.js';
import { cn } from '#utils/ui.utils.js';
import { useWebglContextRef } from '#hooks/use-webgl-context-tracker.js';
import { WebglContextLostFallback } from '#components/geometry/graphics/three/webgl-context-lost-fallback.js';
import { WebglLimitFallback } from '#components/geometry/cad/webgl-fallback.js';

export type ThreeViewerProperties = {
  readonly enableGizmo?: boolean;
  readonly enableGrid?: boolean;
  readonly enableAxes?: boolean;
  readonly enableZoom?: boolean;
  readonly enablePan?: boolean;
  readonly enableDamping?: boolean;
  readonly upDirection?: 'x' | 'y' | 'z';
  readonly className?: string;
  readonly enableCentering?: boolean;
  readonly stageOptions?: StageOptions;
  readonly zoomSpeed?: number;
  readonly gizmoContainer?: HTMLElement | string;
};

export type ThreeContextProperties = ThreeViewerProperties & {
  readonly children?: React.ReactNode;
};

export function ThreeProvider({
  children,
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
}: ThreeContextProperties): React.JSX.Element {
  const [isContextLost, setIsContextLost] = useState(false);

  // Read the actor snapshot once at mount to decide whether we can create a
  // new WebGL context.  This is intentionally NON-reactive -- we never
  // subscribe to count changes.  A reactive subscription would cause an
  // infinite re-render loop because acquire/release events would
  // synchronously flip `isAtLimit`.
  //
  // `webglRef` is `undefined` when no `<WebglContextTrackerProvider>` is
  // mounted above this component (e.g. single-viewer pages).
  const webglRef = useWebglContextRef();

  // eslint-disable-next-line react/hook-use-state -- one-time snapshot, setter intentionally unused
  const [isOverLimit] = useState(() => {
    if (!webglRef) {
      return false;
    }

    const snap = webglRef.getSnapshot();
    return snap.context.count >= snap.context.limit;
  });

  useEffect(() => {
    if (!webglRef || isOverLimit) {
      return;
    }

    webglRef.send({ type: 'acquire' });
    return () => {
      webglRef.send({ type: 'release' });
    };
  }, [webglRef, isOverLimit]);

  const [canvasKey, setCanvasKey] = useState(0);
  const handleRetry = useCallback(() => {
    setIsContextLost(false);
    setCanvasKey((previous) => previous + 1);
  }, []);

  if (isOverLimit) {
    return <WebglLimitFallback onRetry={handleRetry} />;
  }

  if (isContextLost) {
    return <WebglContextLostFallback onRetry={handleRetry} />;
  }

  return (
    <CadCanvas
      key={canvasKey}
      className={cn('bg-background', className)}
      enableGizmo={enableGizmo}
      enableGrid={enableGrid}
      enableAxes={enableAxes}
      enableZoom={enableZoom}
      enablePan={enablePan}
      enableDamping={enableDamping}
      upDirection={upDirection}
      enableCentering={enableCentering}
      stageOptions={stageOptions}
      zoomSpeed={zoomSpeed}
      gizmoContainer={gizmoContainer}
      onContextLost={() => {
        setIsContextLost(true);
      }}
    >
      {children}
      <ActorBridge />
    </CadCanvas>
  );
}
