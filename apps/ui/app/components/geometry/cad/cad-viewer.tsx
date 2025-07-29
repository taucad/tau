import { GltfMesh } from '~/components/geometry/graphics/three/gltf-mesh.js';
import { ThreeProvider } from '~/components/geometry/graphics/three/three-context.js';
import type { ThreeViewerProperties } from '~/components/geometry/graphics/three/three-context.js';
import type { Geometry } from '~/types/cad.types.js';
import { SvgViewer } from '~/components/geometry/graphics/svg/svg-viewer.js';

type CadViewerProperties = ThreeViewerProperties & {
  readonly shapes: Geometry[];
  readonly enableSurfaces?: boolean;
  readonly enableLines?: boolean;
};

export function CadViewer({
  shapes,
  enableSurfaces = true,
  enableLines = true,
  ...properties
}: CadViewerProperties): React.JSX.Element {
  const svgShapes = shapes.filter((shape) => shape.type === '2d');

  // If there are any SVG shapes, we render them in a SVG viewer
  if (svgShapes.length > 0) {
    return <SvgViewer shapes={svgShapes} />;
  }

  return (
    <ThreeProvider {...properties}>
      {shapes.map((shape) => {
        switch (shape.type) {
          case '3d': {
            throw new Error('3D shapes are not supported for rendering. Please use the GLTF viewer instead.');
          }

          case 'gltf': {
            return <GltfMesh key={shape.name} {...shape} enableSurfaces={enableSurfaces} enableLines={enableLines} />;
          }

          case '2d': {
            throw new Error('2D shapes are not supported');
          }

          default: {
            const neverShape: never = shape;
            throw new Error(`Unknown shape type: ${JSON.stringify(neverShape)}`);
          }
        }
      })}
    </ThreeProvider>
  );
}
