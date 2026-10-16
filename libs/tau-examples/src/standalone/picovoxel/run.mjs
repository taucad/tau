// Runs main.ts outside Tau with the project's own picovoxel and writes its binary STL.
// Usage (after `npm ci --ignore-scripts`): node run.mjs <out.stl>
import { writeFileSync } from 'node:fs';

import { createPico } from 'picovoxel';

import main, { defaultParams } from './main.ts';

const pico = await createPico({ voxelSize: defaultParams.voxelSize });
const [first, ...rest] = main(pico, defaultParams);
const solid = rest.length === 0 ? first : first.union(...rest);
writeFileSync(process.argv[2], solid.toMesh().toStl());
pico.dispose();
