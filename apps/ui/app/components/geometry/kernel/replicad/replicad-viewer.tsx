import {
  ThreeProvider,
  ThreeCanvasReference,
  CadViewerProperties,
} from '@/components/geometry/graphics/three/three-context';
import { ReplicadMesh } from './replicad-mesh';
import { LoaderPinwheel } from 'lucide-react';

type ReplicadViewerProperties = CadViewerProperties & {
  mesh: any;
  zoomLevel: number;
  ref?: React.RefObject<ReplicadViewerReference | null>;
};

export type ReplicadViewerReference = ThreeCanvasReference;

export function ReplicadViewer({ mesh, zoomLevel, ...properties }: ReplicadViewerProperties) {
  return (
    <div className="size-full">
      {mesh ? (
        <ThreeProvider stageOptions={{ perspective: { zoomLevel } }} {...properties}>
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
