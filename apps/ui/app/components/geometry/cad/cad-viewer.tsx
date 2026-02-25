import { memo } from 'react';
import type { Geometry } from '@taucad/types';
import { GltfMesh, CadCanvas } from '@taucad/three/react';
import type { StageOptions } from '@taucad/three/react';
import { SvgViewer } from '#components/geometry/graphics/svg/svg-viewer.js';
import { WebglErrorBoundary } from '#components/geometry/cad/webgl-error-boundary.js';
import { WebglErrorFallback } from '#components/geometry/cad/webgl-fallback.js';

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
  readonly enablePostProcessing?: boolean;
};

export const CadViewer = memo(
  ({
    geometries,
    enableSurfaces = true,
    enableLines = true,
    enableMatcap = false,
    ...properties
  }: CadViewerProperties): React.JSX.Element => {
    const svgGeometries = geometries.filter((geometry) => geometry.format === 'svg');

    // If there are any SVG geometries, we render them in a SVG viewer
    if (svgGeometries.length > 0) {
      return (
        <SvgViewer enableGrid={properties.enableGrid} enableAxes={properties.enableAxes} geometries={svgGeometries} />
      );
    }

    return (
      <WebglErrorBoundary fallback={(errorProps) => <WebglErrorFallback {...errorProps} />}>
        <CadCanvas {...properties}>
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
        </CadCanvas>
      </WebglErrorBoundary>
    );
  },
);
