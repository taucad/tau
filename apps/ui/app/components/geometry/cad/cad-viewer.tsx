import type { JSX } from 'react';
import { ReplicadMesh } from '~/components/geometry/kernel/replicad/replicad-mesh.js';
import { ThreeProvider } from '~/components/geometry/graphics/three/three-context.js';
import type { ThreeViewerProperties } from '~/components/geometry/graphics/three/three-context.js';
import type { Shape } from '~/types/cad.js';
import SvgViewer from '~/components/geometry/kernel/replicad/svg-viewer.js';

type CadViewerProperties = ThreeViewerProperties & {
  readonly shapes: Shape[];
  readonly enableMesh?: boolean;
  readonly enableLines?: boolean;
};

export function CadViewer({
  shapes,
  enableMesh = true,
  enableLines = true,
  ...properties
}: CadViewerProperties): JSX.Element {
  const svgShapes = shapes.filter((shape) => shape.type === '2d');

  // If there are any SVG shapes, we render them in a SVG viewer
  if (svgShapes.length > 0) {
    return <SvgViewer shapes={svgShapes} />;
  }

  return (
    <ThreeProvider {...properties}>
      {shapes.map((shape) => {
        if (shape.type === '3d') {
          return <ReplicadMesh key={shape.name} {...shape} enableMesh={enableMesh} enableLines={enableLines} />;
        }

        if (shape.type === '2d') {
          throw new Error('2D shapes are not supported');
        }

        const neverShape: never = shape;
        throw new Error(`Unknown shape type: ${JSON.stringify(neverShape)}`);
      })}
    </ThreeProvider>
  );
}
