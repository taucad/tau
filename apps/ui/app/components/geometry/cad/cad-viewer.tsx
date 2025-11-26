import type { Geometry } from '@taucad/types';
import { GltfMesh } from '#components/geometry/graphics/three/react/gltf-mesh.js';
import { ThreeProvider } from '#components/geometry/graphics/three/three-context.js';
import type { ThreeViewerProperties } from '#components/geometry/graphics/three/three-context.js';
import { SvgViewer } from '#components/geometry/graphics/svg/svg-viewer.js';

type CadViewerProperties = ThreeViewerProperties & {
  readonly geometries: Geometry[];
  readonly enableSurfaces?: boolean;
  readonly enableLines?: boolean;
  readonly enableMatcap?: boolean;
};

export function CadViewer({
  geometries,
  enableSurfaces = true,
  enableLines = true,
  enableMatcap = true,
  ...properties
}: CadViewerProperties): React.JSX.Element {
  const svgGeometries = geometries.filter((geometry) => geometry.format === 'svg');

  // If there are any SVG geometries, we render them in a SVG viewer
  if (svgGeometries.length > 0) {
    return (
      <SvgViewer enableGrid={properties.enableGrid} enableAxes={properties.enableAxes} geometries={svgGeometries} />
    );
  }

  return (
    <ThreeProvider {...properties}>
      {geometries.map((geometry, index) => {
        switch (geometry.format) {
          case 'gltf': {
            return (
              <GltfMesh
                // eslint-disable-next-line react/no-array-index-key -- TODO: add a unique key to the geometry (likely a hash key)
                key={index}
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

          default: {
            const neverGeometry: never = geometry;
            throw new Error(`Unknown geometry type: ${JSON.stringify(neverGeometry)}`);
          }
        }
      })}
    </ThreeProvider>
  );
}
