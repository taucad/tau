import { ThreeProvider, ThreeCanvasReference } from '@/components/geometry/graphics/three/three-context';
import { CadViewerProperties } from '@/components/geometry/graphics/three/three-context';
import { ReplicadMesh } from './replicad-mesh';
import { LoaderPinwheel } from 'lucide-react';
import { forwardRef } from 'react';

type ReplicadViewerProperties = CadViewerProperties & {
  mesh: any;
  zoomLevel?: number;
};

export type ReplicadViewerReference = ThreeCanvasReference;

export const ReplicadViewer = forwardRef<ReplicadViewerReference, ReplicadViewerProperties>(
  (
    {
      mesh,
      enableGizmo,
      enableGrid,
      enableZoom,
      enableAxesHelper,
      className,
      zoomLevel = 0.75,
      onCanvasReady,
      ...rest
    },
    reference,
  ) => {
    return (
      <div className="w-full h-full">
        {mesh ? (
          <ThreeProvider
            enableGizmo={enableGizmo}
            enableGrid={enableGrid}
            enableZoom={enableZoom}
            enableAxesHelper={enableAxesHelper}
            className={className}
            stageOptions={{ perspective: { zoomLevel } }}
            ref={reference}
            onCanvasReady={onCanvasReady}
            {...rest}
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
  },
);

ReplicadViewer.displayName = 'ReplicadViewer';
