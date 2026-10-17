// Runs main.ts outside Tau with the project's own smlibwasm and writes its binary STL.
// Usage (after `npm ci --ignore-scripts`): node run.mjs <out.stl>
import { writeFileSync } from 'node:fs';

import { toStl } from '@classcad/smlibwasm';

import main, { defaultParams } from './main.ts';

writeFileSync(process.argv[2], toStl(main(defaultParams)));
