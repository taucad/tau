import { esbuildBundler } from '@taucad/esbuild';
import { createTestRuntimeClient } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';

import { opencascadeKernel } from '#index.js';

// No middleware: every content key accepted below is one the kernel claims itself.
const client = createTestRuntimeClient({
  runtime: defineRuntime({ kernels: [opencascadeKernel()], bundlers: [esbuildBundler()] }),
  files: { 'main.ts': '' },
});
const document = client.open({ source: { path: 'main.ts' } });

document.view('model', { content: { includeEdges: true } });
void document.export('glb', { content: { includeEdges: false } });
// @ts-expect-error -- the kernel does not claim topology.
document.view('model', { content: { includeTopology: true } });
// @ts-expect-error -- an STL export has no edge overlay.
void document.export('stl', { content: { includeEdges: true } });
// @ts-expect-error -- a STEP export has no edge overlay.
void document.export('step', { content: { includeEdges: true } });
