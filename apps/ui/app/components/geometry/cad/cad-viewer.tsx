import { memo, useMemo } from 'react';
import type { CanvasProps } from '@react-three/fiber';
import type { Geometry } from '@taucad/types';
import type { ResolvedSceneSnapshot } from '@taucad/runtime';
import { GltfMesh } from '#components/geometry/graphics/three/react/gltf-mesh.js';
import type { ModelComponentSecondaryPointerTarget } from '#components/geometry/graphics/three/react/gltf-mesh.js';
import { ThreeProvider } from '#components/geometry/graphics/three/three-context.js';
import type { ThreeViewerProperties } from '#components/geometry/graphics/three/three-viewer-properties.js';
import { SvgViewer } from '#components/geometry/graphics/svg/svg-viewer.js';
import { WebglErrorBoundary } from '#components/geometry/cad/webgl-error-boundary.js';
import { WebglErrorFallback } from '#components/geometry/cad/webgl-fallback.js';
import { useGraphicsSelector } from '#hooks/use-graphics.js';
import { mergeGraphicsBackendWithQueryOverride } from '#components/geometry/graphics/graphics-backend.js';
import { ProgressiveScene } from '#components/geometry/graphics/three/react/progressive-scene.js';

type CadViewerCanvasEventProperties = Pick<CanvasProps, 'eventSource' | 'eventPrefix'>;

type CadViewerProperties = Omit<ThreeViewerProperties, 'graphicsBackend'> &
  CadViewerCanvasEventProperties & {
    readonly geometry?: Geometry;
    readonly progressiveSceneSnapshot?: ResolvedSceneSnapshot;
    readonly sourceFile?: string;
    readonly enableSurfaces?: boolean;
    readonly enableLines?: boolean;
    readonly enableMatcap?: boolean;
    readonly onModelComponentSecondaryPointerCandidate?: (
      target: ModelComponentSecondaryPointerTarget | undefined,
    ) => void;
  };

export const CadViewer = memo(
  ({
    geometry,
    progressiveSceneSnapshot,
    sourceFile,
    enableSurfaces = true,
    enableLines = true,
    enableMatcap = false,
    onModelComponentSecondaryPointerCandidate,
    ...properties
  }: CadViewerProperties): React.JSX.Element => {
    const machineResolvedBackend = useGraphicsSelector((state) => state.context.resolvedGraphicsBackend);
    const gpuAvailable = useGraphicsSelector((state) => state.context.webGpuAvailable);
    const graphicsPreference = useGraphicsSelector((state) => state.context.graphicsBackendPreference);

    const graphicsBackendEffective = useMemo(
      () => mergeGraphicsBackendWithQueryOverride(machineResolvedBackend, graphicsPreference, gpuAvailable),
      [gpuAvailable, graphicsPreference, machineResolvedBackend],
    );

    if (!progressiveSceneSnapshot && geometry?.format === 'svg') {
      return <SvgViewer enableGrid={properties.enableGrid} enableAxes={properties.enableAxes} geometry={geometry} />;
    }

    let scene: React.ReactNode;
    if (progressiveSceneSnapshot) {
      scene = (
        <ProgressiveScene
          snapshot={progressiveSceneSnapshot}
          enableMatcap={enableMatcap}
          enableSurfaces={enableSurfaces}
          enableLines={enableLines}
          onModelComponentSecondaryPointerCandidate={onModelComponentSecondaryPointerCandidate}
        />
      );
    } else if (geometry?.format === 'gltf') {
      scene = (
        <GltfMesh
          key={geometry.hash}
          gltfFile={geometry.content}
          sourceFile={sourceFile}
          geometryHash={geometry.hash}
          enableMatcap={enableMatcap}
          enableSurfaces={enableSurfaces}
          enableLines={enableLines}
          onModelComponentSecondaryPointerCandidate={onModelComponentSecondaryPointerCandidate}
        />
      );
    } else if (geometry?.format === 'webrtc') {
      throw new Error('WebRTC geometries are not supported');
    }

    return (
      <WebglErrorBoundary fallback={(errorProps) => <WebglErrorFallback {...errorProps} />}>
        <ThreeProvider {...properties} graphicsBackend={graphicsBackendEffective}>
          {scene}
        </ThreeProvider>
      </WebglErrorBoundary>
    );
  },
);
