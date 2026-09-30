import { memo } from 'react';
import type { CanvasProps } from '@react-three/fiber';
import type { Geometry } from '@taucad/types';
import { GltfMesh } from '#components/geometry/graphics/three/react/gltf-mesh.js';
import type { ModelComponentSecondaryPointerTarget } from '#components/geometry/graphics/three/react/gltf-mesh.js';
import { ThreeProvider } from '#components/geometry/graphics/three/three-context.js';
import type { ThreeViewerProperties } from '#components/geometry/graphics/three/three-viewer-properties.js';
import { SvgViewer } from '#components/geometry/graphics/svg/svg-viewer.js';
import { WebglErrorBoundary } from '#components/geometry/cad/webgl-error-boundary.js';
import { WebglErrorFallback } from '#components/geometry/cad/webgl-fallback.js';
import { useFeature } from '#flags/use-feature.js';
import { useGraphicsSelector } from '#hooks/use-graphics.js';
import { resolveViewerGraphicsBackend } from '#components/geometry/graphics/graphics-backend.js';

type CadViewerCanvasEventProperties = Pick<CanvasProps, 'eventSource' | 'eventPrefix'>;

type CadViewerProperties = Omit<ThreeViewerProperties, 'graphicsBackend'> &
  CadViewerCanvasEventProperties & {
    readonly geometry?: Geometry;
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
    sourceFile,
    enableSurfaces = true,
    enableLines = true,
    enableMatcap = false,
    onModelComponentSecondaryPointerCandidate,
    ...properties
  }: CadViewerProperties): React.JSX.Element => {
    const webGpuEnabled = useFeature('webGpu');
    const gpuAvailable = useGraphicsSelector((state) => state.context.webGpuAvailable);
    const requestedGltfRevision = useGraphicsSelector((state) => state.context.gltfPresentation.requestedRevision);

    const graphicsBackendEffective = resolveViewerGraphicsBackend(webGpuEnabled, gpuAvailable);

    if (geometry?.format === 'svg') {
      return <SvgViewer enableGrid={properties.enableGrid} enableAxes={properties.enableAxes} geometry={geometry} />;
    }

    let scene: React.ReactNode;
    if (geometry?.format === 'gltf') {
      scene = (
        <GltfMesh
          gltfFile={geometry.content}
          sourceFile={sourceFile}
          geometryHash={geometry.hash}
          presentationRevision={requestedGltfRevision}
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
