import { memo, useCallback, useEffect, useState } from 'react';
import type { Geometry } from '@taucad/types';
import { GltfMesh, CadCanvas } from '@taucad/three/react';
import type { StageOptions } from '@taucad/three/react';
import { SvgViewer } from '#components/geometry/graphics/svg/svg-viewer.js';
import { WebglErrorBoundary } from '#components/geometry/cad/webgl-error-boundary.js';
import { WebglErrorFallback, WebglLimitFallback } from '#components/geometry/cad/webgl-fallback.js';
import { WebglContextLostFallback } from '#components/geometry/cad/webgl-context-lost-fallback.js';
import { ActorBridge } from '#components/geometry/cad/actor-bridge.js';
import { cn } from '#utils/ui.utils.js';
import { useWebglContextRef } from '#hooks/use-webgl-context-tracker.js';

type CadViewerProperties = {
  readonly geometries: Geometry[];
  readonly enableSurfaces?: boolean;
  readonly enableLines?: boolean;
  readonly enableMatcap?: boolean;
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

export const CadViewer = memo(
  ({
    geometries,
    enableSurfaces = true,
    enableLines = true,
    enableMatcap = false,
    className,
    ...properties
  }: CadViewerProperties): React.JSX.Element => {
    const svgGeometries = geometries.filter((geometry) => geometry.format === 'svg');

    if (svgGeometries.length > 0) {
      return (
        <SvgViewer enableGrid={properties.enableGrid} enableAxes={properties.enableAxes} geometries={svgGeometries} />
      );
    }

    return (
      <WebglErrorBoundary fallback={(errorProps) => <WebglErrorFallback {...errorProps} />}>
        <CadViewerCanvas className={className} {...properties}>
          {geometries.map((geometry) => {
            switch (geometry.format) {
              case 'gltf': {
                return (
                  <GltfMesh
                    key={geometry.hash}
                    gltfFile={geometry.content}
                    enableMatcap={enableMatcap}
                    enableSurfaces={enableSurfaces}
                    enableLines={enableLines}
                  />
                );
              }

              case 'svg': {
                throw new Error('2D geometries are not supported');
              }

              case 'webrtc': {
                throw new Error('WebRTC geometries are not supported');
              }

              default: {
                const neverGeometry: never = geometry;
                throw new Error(`Unknown geometry type: ${JSON.stringify(neverGeometry)}`);
              }
            }
          })}
        </CadViewerCanvas>
      </WebglErrorBoundary>
    );
  },
);

type CadViewerCanvasProperties = {
  readonly children: React.ReactNode;
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

function CadViewerCanvas({
  children,
  className,
  ...properties
}: CadViewerCanvasProperties): React.JSX.Element {
  const [isContextLost, setIsContextLost] = useState(false);

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
      onContextLost={() => {
        setIsContextLost(true);
      }}
      {...properties}
    >
      {children}
      <ActorBridge />
    </CadCanvas>
  );
}
