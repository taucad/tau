// Renders main.tsx outside Tau with the project's own @tscircuit/core and writes its Circuit JSON.
// Usage (after `npm ci --ignore-scripts`): node run.mjs <circuit.json>
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import ts from 'typescript';

import { RootCircuit } from '@tscircuit/core';
import { createElement } from 'react';

// Compile with the project's explicit TypeScript peer, without workspace loaders.
const output = ts.transpileModule(readFileSync(new URL('main.tsx', import.meta.url), 'utf8'), {
  fileName: 'main.tsx',
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
});
const compiled = new URL('.standalone-main.mjs', import.meta.url);
writeFileSync(compiled, output.outputText, { flag: 'wx' });
let Board;
try {
  ({ default: Board } = await import(compiled.href));
} finally {
  unlinkSync(compiled);
}

const circuit = new RootCircuit();
circuit.add(createElement(Board));
await circuit.renderUntilSettled();
writeFileSync(process.argv[2], `${JSON.stringify(circuit.getCircuitJson(), undefined, 2)}\n`);
