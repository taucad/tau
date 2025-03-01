import { CadViewerProperties, ThreeProvider } from '../../graphics/three/three-context';
import { ReplicadMesh } from './replicad-mesh';
import { LoaderPinwheel } from 'lucide-react';

type ReplicadViewerProperties = CadViewerProperties & {
  mesh: any;
  zoomLevel?: number;
};

export function ReplicadViewer({
  mesh,
  enableGizmo,
  enableGrid,
  enableZoom,
  className,
  zoomLevel = 0.75,
}: ReplicadViewerProperties) {
  return (
    <div className="w-full h-full">
      {mesh ? (
        <ThreeProvider
          enableGizmo={enableGizmo}
          enableGrid={enableGrid}
          enableZoom={enableZoom}
          className={className}
          stageOptions={{ perspective: { zoomLevel } }}
        >
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
