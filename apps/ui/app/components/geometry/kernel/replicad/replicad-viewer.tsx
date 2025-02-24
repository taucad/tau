import { CadViewerProperties, ThreeProvider } from '../../graphics/three/three-context';
import { ReplicadMesh } from './replicad-mesh';
import { LoaderPinwheel } from 'lucide-react';

type ReplicadViewerProperties = CadViewerProperties & {
  mesh: any;
};

export function ReplicadViewer({ mesh, disableGizmo, disableGrid, className }: ReplicadViewerProperties) {
  return (
    <div className="w-full h-full">
      {mesh ? (
        <ThreeProvider disableGizmo={disableGizmo} disableGrid={disableGrid} className={className}>
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
