import { memo, useMemo } from 'react';
import type { Geometry } from '@taucad/types';
import { GltfMesh } from '#components/geometry/graphics/three/react/gltf-mesh.js';
import { ThreeProvider } from '#components/geometry/graphics/three/three-context.js';
import type { ThreeViewerProperties } from '#components/geometry/graphics/three/three-viewer-properties.js';
import { SvgViewer } from '#components/geometry/graphics/svg/svg-viewer.js';
import { WebglErrorBoundary } from '#components/geometry/cad/webgl-error-boundary.js';
import { WebglErrorFallback } from '#components/geometry/cad/webgl-fallback.js';
import { useGraphicsSelector } from '#hooks/use-graphics.js';
import { mergeGraphicsBackendWithQueryOverride } from '#components/geometry/graphics/graphics-backend.js';

type CadViewerProperties = Omit<ThreeViewerProperties, 'graphicsBackend'> & {
  readonly geometries: Geometry[];
  readonly enableSurfaces?: boolean;
  readonly enableLines?: boolean;
  readonly enableMatcap?: boolean;
};

export const CadViewer = memo(
  ({
    geometries,
    enableSurfaces = true,
    enableLines = true,
    enableMatcap = false,
    ...properties
  }: CadViewerProperties): React.JSX.Element => {
    const machineResolvedBackend = useGraphicsSelector((state) => state.context.resolvedGraphicsBackend);
    const gpuAvailable = useGraphicsSelector((state) => state.context.webGpuAvailable);
    const graphicsPreference = useGraphicsSelector((state) => state.context.graphicsBackendPreference);

    const graphicsBackendEffective = useMemo(
      () => mergeGraphicsBackendWithQueryOverride(machineResolvedBackend, graphicsPreference, gpuAvailable),
      [gpuAvailable, graphicsPreference, machineResolvedBackend],
    );

    const svgGeometries = geometries.filter((geometry) => geometry.format === 'svg');

    // If there are any SVG geometries, we render them in a SVG viewer
    if (svgGeometries.length > 0) {
      return (
        <SvgViewer enableGrid={properties.enableGrid} enableAxes={properties.enableAxes} geometries={svgGeometries} />
      );
    }

    return (
      <WebglErrorBoundary fallback={(errorProps) => <WebglErrorFallback {...errorProps} />}>
        <ThreeProvider {...properties} graphicsBackend={graphicsBackendEffective}>
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
        </ThreeProvider>
      </WebglErrorBoundary>
    );
  },
);
