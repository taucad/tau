/** Process-isolated consumer for the durable MeshShape snapshot regression. */
import { join } from 'node:path';
import { esbuildBundler } from '@taucad/esbuild';
import { geometryCache } from '@taucad/middleware';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { createSqliteComputeEngine, fromSqlite } from '@taucad/runtime/node';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { replicadKernel } from '#replicad.kernel.js';

const [mode, directory] = process.argv.slice(2);
if ((mode !== 'seed' && mode !== 'restore') || directory === undefined) {
  throw new Error('Expected seed|restore and a project directory.');
}

const plugin = replicadKernel({ wasm: 'single', computeReuse: false });
const definition = await resolveRuntimePluginDefinition('kernel', plugin);
const originalCreateGeometry = definition.evaluate.bind(definition);
const originalDeserializeNativeHandle = definition.deserializeHandle?.bind(definition);
let builds = 0;
let restores = 0;
definition.evaluate = async (...args) => {
  builds += 1;
  return originalCreateGeometry(...args);
};
if (originalDeserializeNativeHandle === undefined) {
  throw new Error('Replicad must expose native snapshot restoration.');
}
definition.deserializeHandle = async (...args) => {
  restores += 1;
  return originalDeserializeNativeHandle(...args);
};

const store = createSqliteComputeEngine({ directory: join(directory, 'cache') });
const client = createRuntimeClient({
  transport: inProcessTransport({
    runtime: defineRuntime({ kernels: [plugin], middleware: [geometryCache()], bundlers: [esbuildBundler()] }),
    fileSystem: fromNodeFs(directory),
    compute: { mode: 'durable', store: fromSqlite({ store, workspace: '/project/replicad-mesh-process' }) },
  }),
});

try {
  const document = client.open({ source: { path: 'mesh.ts' } });
  const renderOutcome = await document.view('model').rendering();
  if (renderOutcome.superseded) {
    throw new Error('Unexpected superseded rendering.');
  }
  const render = renderOutcome.rendering;
  if (!render.success) {
    throw new Error(`MeshShape render failed: ${JSON.stringify(render.issues)}`);
  }
  let stlBytes = 0;
  if (mode === 'restore') {
    const exported = await document.export('stl');
    if (!exported.success) {
      throw new Error(`MeshShape export failed: ${JSON.stringify(exported.issues)}`);
    }
    stlBytes = exported.files[0]?.bytes.byteLength ?? 0;
  }
  process.stdout.write(`MESH_CACHE_RESULT ${JSON.stringify({ builds, restores, stlBytes })}\n`);
} finally {
  await client.shutdown();
  await store.dispose();
}
