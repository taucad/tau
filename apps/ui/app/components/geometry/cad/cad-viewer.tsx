import { LoaderPinwheel } from 'lucide-react';
import type { JSX } from 'react';
import { ReplicadMesh } from '~/components/geometry/kernel/replicad/replicad-mesh.js';
import { ThreeProvider } from '~/components/geometry/graphics/three/three-context.js';
import type { ThreeViewerProperties } from '~/components/geometry/graphics/three/three-context.js';
import type { Shape } from '~/types/cad.js';

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

  return (
    <ThreeProvider stageOptions={{ perspective: { zoomLevel } }} enableCameraControls={false} {...properties}>
      {shapes.map((shape) => (
        <ReplicadMesh key={shape.name} {...shape} />
      ))}
    </ThreeProvider>
  );
}
