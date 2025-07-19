import type { JSX } from 'react';
import { ReplicadMesh } from '~/components/geometry/kernel/replicad/replicad-mesh.js';
import { GLTFMesh } from '~/components/geometry/graphics/three/gltf-mesh.js';
import { ThreeProvider } from '~/components/geometry/graphics/three/three-context.js';
import type { ThreeViewerProperties } from '~/components/geometry/graphics/three/three-context.js';
import type { Shape } from '~/types/cad.types.js';
import { SvgViewer } from '~/components/geometry/graphics/svg/svg-viewer.js';

type CadViewerProperties = ThreeViewerProperties & {
  readonly shapes: Shape[];
  readonly enableSurface?: boolean;
  readonly enableLines?: boolean;
};

export function CadViewer({
  shapes,
  enableSurface = true,
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
          return <ReplicadMesh key={shape.name} {...shape} enableSurface={enableSurface} enableLines={enableLines} />;
        }

        if (shape.type === 'gltf') {
          return <GLTFMesh key={shape.name} {...shape} />;
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
