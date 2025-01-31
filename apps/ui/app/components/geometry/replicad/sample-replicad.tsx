// import * as Comlink from 'https://unpkg.com/comlink/dist/esm/comlink.mjs';
import { useState, useEffect, useRef } from 'react';

import { wrap } from 'comlink';
import ThreeContext from './three-context';
import ReplicadMesh from './replicad-mesh';
import CadWorker from './worker.ts?worker';

export default function ReplicadApp() {
  const cad = useRef<any>(null);

  useEffect(() => {
    async function init() {
      const wrappedCad = wrap(new CadWorker());
      cad.current = wrappedCad;
    }
    init();
  }, []);

  const [size, setSize] = useState(5);

    // const downloadModel = async () => {
    //   const blob = await cad.current.createBlob(size);
    //   FileSaver.saveAs(blob, "thing.stl");
    // };

  const [mesh, setMesh] = useState(null);

  useEffect(() => {
    if (cad.current) {
      cad.current.createMesh(size).then((m) => setMesh(m));
    }
  }, [size]);

  return (
    <main className="py-16 flex flex-col gap-4">
      <section className="flex flex-col gap-4">
        <div className="ml-3 flex flex-row gap-2 items-center">
          <label htmlFor="thicknessInput">Thickness</label>
          <input
            id="thicknessInput"
            type="number"
            step="1"
            min="1"
            max="10"
            value={size}
            className="w-16 p-1 border border-input rounded-md"
            onChange={(v) => {
              const val = parseInt(v.target.value);
              if (val > 0 && val <= 10) setSize(val);
            }}
          />
        </div>
        {/* <button onClick={downloadModel}>Download STL</button> */}
      </section>
      <section style={{ height: "600px" }}>
        {mesh ? (
          <ThreeContext className="relative">
            <ReplicadMesh edges={mesh.edges} faces={mesh.faces} />
          </ThreeContext>
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
