import { LoaderPinwheel } from 'lucide-react';
import type { RefObject, JSX } from 'react';
import { ReplicadMesh } from '@/components/geometry/kernel/replicad/replicad-mesh.js';
import { ThreeProvider } from '@/components/geometry/graphics/three/three-context.js';
import type { ThreeCanvasReference, CadViewerProperties } from '@/components/geometry/graphics/three/three-context.js';

type ReplicadViewerProperties = CadViewerProperties & {
  readonly mesh: unknown;
  readonly zoomLevel: number;
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- null is required by React
  readonly ref?: RefObject<ReplicadViewerReference | null>;
};

export type ReplicadViewerReference = ThreeCanvasReference;

export function ReplicadViewer({ mesh, zoomLevel, ...properties }: ReplicadViewerProperties): JSX.Element {
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
