import ThreeContext from './three-context';
import ReplicadMesh from './replicad-mesh';
import { LoaderPinwheel } from 'lucide-react';

export function ReplicadViewer({ mesh }: { mesh: any }) {
  return (
    <div className="w-full h-full">
      {mesh ? (
        <ThreeContext>
          <ReplicadMesh {...mesh} />
        </ThreeContext>
      ) : (
        <div className="flex items-center font-bold text-2xl justify-center h-full">
          <LoaderPinwheel className="size-20 stroke-1 animate-spin text-primary ease-in-out" />
        </div>
      )}
    </div>
  );
}
