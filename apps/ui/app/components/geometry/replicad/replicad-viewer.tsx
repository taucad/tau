import { useState, useEffect, useRef } from 'react';
import { wrap, type Remote } from 'comlink';
import ThreeContext from './three-context';
import ReplicadMesh, { type ReplicadMeshProps as ReplicadMeshProperties } from './replicad-mesh';
import BuilderWorker from './builder.worker?worker';
import type { BuilderWorkerInterface } from './builder.worker';
import { LoaderPinwheel } from 'lucide-react';

interface ReplicadViewerProperties {
  code: string;
  parameters: Record<string, any>;
}

export function ReplicadViewer({ code, parameters }: ReplicadViewerProperties) {
  const cad = useRef<Remote<BuilderWorkerInterface> | undefined>(undefined);
  const [mesh, setMesh] = useState<ReplicadMeshProperties | undefined>();

  useEffect(() => {
    let worker: Worker | undefined;

    async function init() {
      worker = new BuilderWorker();
      cad.current = wrap<BuilderWorkerInterface>(worker);
      await cad.current.ready();
    }

    init();

    return () => {
      worker?.terminate();
      cad.current = undefined;
    };
  }, []);

  useEffect(() => {
    const currentCad = cad.current;
    if (!currentCad || !code) return;

    const updateMesh = async () => {
      try {
        const result = await currentCad.buildShapesFromCode(code, parameters);
        if ('error' in result) {
          throw new Error(result.message);
        }

        const firstShape = result[0];
        if (!firstShape || firstShape.error) {
          throw new Error(firstShape?.error || 'Failed to generate shape');
        }

        setMesh({
          faces: firstShape.mesh,
          edges: firstShape.edges,
        });
      } catch (error) {
        console.error('Failed to create mesh:', error);
        setMesh(undefined);
      }
    };

    updateMesh();
  }, [code, parameters]);

  return (
    <div className="w-full h-full">
      {mesh ? (
        <ThreeContext>
          <ReplicadMesh {...mesh} />
        </ThreeContext>
      ) : (
        <div className="flex items-center font-bold text-2xl justify-center h-full">
          <LoaderPinwheel className="size-20 stroke-1 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
