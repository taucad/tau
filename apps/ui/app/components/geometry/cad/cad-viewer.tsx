import { LoaderPinwheel } from 'lucide-react';
import type { JSX } from 'react';
import { ReplicadMesh } from '@/components/geometry/kernel/replicad/replicad-mesh.js';
import { ThreeProvider } from '@/components/geometry/graphics/three/three-context.js';
import type { ThreeViewerProperties } from '@/components/geometry/graphics/three/three-context.js';

type CadViewerProperties = Omit<ThreeViewerProperties, 'enableCameraControls'> & {
  readonly mesh: unknown;
  readonly zoomLevel: number;
};

export function CadViewer({ mesh, zoomLevel, ...properties }: CadViewerProperties): JSX.Element {
  return (
    <div className="size-full">
      {mesh ? (
        <ThreeProvider stageOptions={{ perspective: { zoomLevel } }} enableCameraControls={false} {...properties}>
          <ReplicadMesh {...mesh} />
        </ThreeProvider>
      ) : (
        <div className="flex h-full items-center justify-center text-2xl font-bold">
          <LoaderPinwheel className="size-20 animate-spin stroke-1 text-primary ease-in-out" />
        </div>
      )}
    </div>
  );
}
