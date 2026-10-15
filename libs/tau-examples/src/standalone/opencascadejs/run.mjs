// Runs main.ts outside Tau with the project's own libcascade and writes its binary STL with OpenCascade's
// StlAPI_Writer.
// Usage (after `npm ci --ignore-scripts`): node run.mjs <out.stl>
import { writeFileSync } from 'node:fs';

import oc, { BRepMesh_IncrementalMesh, Message_ProgressRange, StlAPI_Writer } from 'libcascade';

import main, { defaultParams } from './main.ts';

const shape = main(defaultParams);
const mesher = new BRepMesh_IncrementalMesh(shape, 0.01, false, 0.1, false);
if (!mesher.IsDone()) {
  throw new Error('BRepMesh_IncrementalMesh could not mesh the shape.');
}
const writer = new StlAPI_Writer();
if (!writer.Write(shape, '/native.stl', new Message_ProgressRange())) {
  throw new Error('StlAPI_Writer could not write the shape.');
}
writeFileSync(process.argv[2], oc.FS.readFile('/native.stl'));
