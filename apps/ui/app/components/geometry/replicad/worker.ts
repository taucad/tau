import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import { setOC } from 'replicad';
import { expose } from 'comlink';

// We import our model as a simple function
import { type Dimensions, drawBox } from './cad';

// This is the logic to load the web assembly code into replicad
let loaded = false;
const init = async () => {
  if (loaded) return true;

  // @ts-expect-error - incorrect types
  const OC = await opencascade({
    locateFile: () => opencascadeWasm,
  });

  loaded = true;
  setOC(OC);

  return true;
};
const started = init();

function createBlob(dimensions: Dimensions): Promise<Blob> {
  // note that you might want to do some caching for more complex models
  return started.then(() => {
    return drawBox(dimensions).blobSTL();
  });
}

function createMesh(dimensions: Dimensions): Promise<{
  faces: any;
  edges: any;
}> {
  return started.then(() => {
    const box = drawBox(dimensions);
    // This is how you get the data structure that the replica-three-helper
    // can synchronise with three BufferGeometry
    return {
      faces: box.mesh(),
      edges: box.meshEdges(),
    };
  });
}

// comlink is great to expose your functions within the worker as a simple API
// to your app.
expose({ createBlob, createMesh });
