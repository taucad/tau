// import * as Comlink from 'https://unpkg.com/comlink/dist/esm/comlink.mjs';
import { useState, useEffect, useRef } from 'react';

import { wrap } from 'comlink';
import ThreeContext from './three-context';
import ReplicadMesh from './replicad-mesh';
import CadWorker from './worker.ts?worker';
import { Slider } from '@/components/ui/slider';
import { Dimensions } from './cad';
import { DownloadButton } from '@/components/download-button';

const allDimensions = ['thickness', 'height', 'width', 'depth'];

export default function ReplicadApp() {
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

  const [mesh, setMesh] = useState<{edges: any, faces: any} | null>(null);

  useEffect(() => {
    if (cad.current) {
      cad.current.createMesh(dimensions).then((m) => setMesh(m));
    }
  }, [dimensions.depth, dimensions.height, dimensions.thickness, dimensions.width]);

  return (
    <main className="py-16 flex flex-col gap-4">
      <section className="flex flex-col gap-4">
      </section>
      <section style={{ height: "600px" }} className="relative">
        {mesh ? (
          <>
          <div className="mx-3 flex flex-col space-y-2 items-center">
          {allDimensions.map((key) => (
            <div key={key} className="flex flex-row gap-2 items-center w-full">
              <label className="w-[20%]" htmlFor={key}>{key}</label>
              <Slider
                step={1}
                className="w-[60%]"
                max={50}
                defaultValue={[dimensions[key as keyof Dimensions]]}
                onValueChange={([v]) => {
                  setDimensions({ ...dimensions, [key]: v })
                }}
              />
              <input
                type="number"
                className="w-[20%] bg-transparent border rounded-md ml-4"
                value={dimensions[key as keyof Dimensions]}
                onChange={(e) => {
                  console.log(e.target.value)
                  setDimensions({ ...dimensions, [key]: Number(e.target.value) })
                }}
              />
            </div>
          ))}
        </div>
            <DownloadButton
              getBlob={downloadModel}
              title="thing.stl"
            />
            <ThreeContext>
              <ReplicadMesh edges={mesh.edges} faces={mesh.faces} />
            </ThreeContext>
          </>
        ) : (
          <div
            style={{ display: "flex", alignItems: "center", fontSize: "2em" }}
          >
            Loading...
          </div>
        )}
      </section>
    </main>
  );
}
