// Renders main.tsx outside Tau with the project's own @tscircuit/core and writes its Circuit JSON.
// Usage (after `npm ci --ignore-scripts`): node run.mjs <circuit.json>
import { writeFileSync } from 'node:fs';

import { RootCircuit } from '@tscircuit/core';
import { createElement } from 'react';

import Board from './main.tsx';

const circuit = new RootCircuit();
circuit.add(createElement(Board));
await circuit.renderUntilSettled();
writeFileSync(process.argv[2], `${JSON.stringify(circuit.getCircuitJson(), undefined, 2)}\n`);
