// Runs main.ts outside Tau with the project's own replicad on OpenCascade from replicad-opencascadejs (replicad's
// documented setup: `setOC` before any shape) and writes its binary STL.
// Usage (after `npm ci --ignore-scripts`): node run.mjs <out.stl>
import { writeFileSync } from 'node:fs';

import initOpenCascade from 'replicad-opencascadejs/single/init';
import { setOC } from 'replicad';

import main, { defaultParams } from './main.ts';

setOC(await initOpenCascade());
const stl = main(defaultParams).blobSTL({ binary: true });
writeFileSync(process.argv[2], Buffer.from(await stl.arrayBuffer()));
