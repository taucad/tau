import { LoaderPinwheel } from 'lucide-react';
import type { JSX } from 'react';
import { ReplicadMesh } from '~/components/geometry/kernel/replicad/replicad-mesh.js';
import { ThreeProvider } from '~/components/geometry/graphics/three/three-context.js';
import type { ThreeViewerProperties } from '~/components/geometry/graphics/three/three-context.js';
import type { Shape } from '~/types/cad.js';
import SvgViewer from '~/components/geometry/kernel/replicad/svg-viewer.js';

type CadViewerProperties = Omit<ThreeViewerProperties, 'enableCameraControls'> & {
  readonly shapes: Shape[];
  readonly zoomLevel: number;
};

export function CadViewer({ shapes, zoomLevel, ...properties }: CadViewerProperties): JSX.Element {
  if (!shapes || shapes.length === 0) {
    return (
      <div className="flex size-full items-center justify-center text-2xl font-bold">
        <LoaderPinwheel className="size-20 animate-spin stroke-1 text-primary ease-in-out" />
      </div>
    );
  }

  const svgShapes = shapes.filter((shape) => shape.type === '2d');

  // If there are any SVG shapes, we render them in a SVG viewer
  if (svgShapes.length > 0) {
    return <SvgViewer shapes={svgShapes} />;
  }

  return (
    <ThreeProvider stageOptions={{ perspective: { zoomLevel } }} enableCameraControls={false} {...properties}>
      {shapes.map((shape) => {
        if (shape.type === '3d') {
          return <ReplicadMesh key={shape.name} {...shape} />;
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
