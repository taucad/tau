import { ThreeProvider, ThreeCanvasReference } from '@/components/geometry/graphics/three/three-context';
import { CadViewerProperties } from '@/components/geometry/graphics/three/three-context';
import { ReplicadMesh } from './replicad-mesh';
import { LoaderPinwheel } from 'lucide-react';

type ReplicadViewerProperties = CadViewerProperties & {
  mesh: any;
  zoomLevel?: number;
  ref?: React.RefObject<ReplicadViewerReference>;
};

export type ReplicadViewerReference = ThreeCanvasReference;

export function ReplicadViewer({ mesh, zoomLevel = 0.75, ...properties }: ReplicadViewerProperties) {
  return (
    <div className="w-full h-full">
      {mesh ? (
        <ThreeProvider stageOptions={{ perspective: { zoomLevel } }} {...properties}>
          <ReplicadMesh {...mesh} />
        </ThreeProvider>
      ) : (
        <div className="flex items-center font-bold text-2xl justify-center h-full">
          <LoaderPinwheel className="size-20 stroke-1 animate-spin text-primary ease-in-out" />
        </div>
      )}
    </div>
  );
}
