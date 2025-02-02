// import * as Comlink from 'https://unpkg.com/comlink/dist/esm/comlink.mjs';
import { useState, useEffect, useRef } from 'react';

import { wrap } from 'comlink';
import ThreeContext from './three-context';
import ReplicadMesh from './replicad-mesh';
import CadWorker from './worker.ts?worker';
import { Slider } from '@/components/ui/slider';
import { Dimensions } from './cad';
import { DownloadButton } from '@/components/download-button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { LoaderPinwheel, PencilRuler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const allDimensions = ['thickness', 'height', 'width', 'depth'];

export function ReplicadViewer() {
  const cad = useRef<any>(null);

  useEffect(() => {
    async function init() {
      const wrappedCad = wrap(new CadWorker());
      cad.current = wrappedCad;
    }
    init();
  }, []);

  const [dimensions, setDimensions] = useState<Dimensions>({
    thickness: 1,
    height: 10,
    width: 10,
    depth: 10,
  });

  const downloadModel = async () => {
    const blob = await cad.current.createBlob(dimensions);

    return blob as Blob;
  };

  const [mesh, setMesh] = useState<{ edges: any; faces: any } | null>(null);

  useEffect(() => {
    if (cad.current) {
      cad.current.createMesh(dimensions).then((m) => setMesh(m));
    }
  }, [dimensions.depth, dimensions.height, dimensions.thickness, dimensions.width]);

  return (
    <main className="flex flex-col h-full">
      {mesh ? (
        <>
          <div className="absolute top-0 right-11 z-10 flex flex-row justify-end gap-2 m-2">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="text-muted-foreground rounded-md flex flex-row">
                  <PencilRuler className="w-4 h-4 mr-2" />
                  <span>Edit</span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="absolute w-[90vw] md:w-[40dvw] top-12 -right-11 z-10 bg-background/50 backdrop-blur-sm border p-2 rounded-md flex flex-col gap-4 justify-between">
                  <div className="flex flex-col space-y-2 items-center">
                    {allDimensions.map((key) => (
                      <div key={key} className="grid grid-cols-5 gap-3 items-center">
                        <label className="col-span-1" htmlFor={key}>
                          {key}
                        </label>
                        <Slider
                          className="col-span-3"
                          step={1}
                          max={50}
                          defaultValue={[dimensions[key as keyof Dimensions]]}
                          onValueChange={([v]) => {
                            setDimensions({ ...dimensions, [key]: v });
                          }}
                        />
                        <Input
                          type="number"
                          className="border rounded-md text-sm py-0 h-8 col-span-1 shadow-none"
                          value={dimensions[key as keyof Dimensions]}
                          onChange={(event) => {
                            setDimensions({ ...dimensions, [key]: Number(event.target.value) });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
            <DownloadButton
              className="text-muted-foreground "
              variant="outline"
              size="icon"
              getBlob={downloadModel}
              title="thing.stl"
            />
          </div>
          <ThreeContext>
            <ReplicadMesh edges={mesh.edges} faces={mesh.faces} />
          </ThreeContext>
        </>
      ) : (
        <div className="flex items-center font-bold text-2xl justify-center h-full">
          <LoaderPinwheel className="size-20 stroke-1 animate-spin text-primary" />
        </div>
      )}
    </main>
  );
}
