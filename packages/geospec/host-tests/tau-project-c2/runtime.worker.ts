import { createRequire } from 'node:module';

import { esbuild } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime';
import type { AnyPluginInstance, MiddlewarePlugin } from '@taucad/runtime';
import { nodeWorkerHost } from '@taucad/runtime/transport/node';
import { createRuntimeWorker } from '@taucad/runtime/worker';

const requireReplicad = createRequire(new URL('../../../plugins/replicad/package.json', import.meta.url));
const replicadModule: unknown = await import(requireReplicad.resolve('@taucad/replicad'));
if (
  typeof replicadModule !== 'object' ||
  replicadModule === null ||
  !('replicad' in replicadModule) ||
  typeof replicadModule.replicad !== 'function'
) {
  throw new TypeError('@taucad/replicad must export its public plugin factory.');
}
const replicad = replicadModule.replicad as () => AnyPluginInstance;

const requireMiddleware = createRequire(new URL('../../../plugins/middleware/package.json', import.meta.url));
const middlewareModule: unknown = await import(requireMiddleware.resolve('@taucad/middleware'));
const middleware = [
  'parameterFileResolver',
  'parameterCache',
  'parameterUnits',
  'geometryCache',
  'gltfEdgeDetection',
].map((name) => {
  if (typeof middlewareModule !== 'object' || middlewareModule === null) {
    throw new TypeError('@taucad/middleware must export its public middleware factories.');
  }
  const factory: unknown = Reflect.get(middlewareModule, name);
  if (typeof factory !== 'function') {
    throw new TypeError(`@taucad/middleware must export ${name}.`);
  }
  return (factory as () => MiddlewarePlugin)();
});

const runtime = defineRuntime({ plugins: [esbuild(), replicad()], middleware });

await nodeWorkerHost({ worker: createRuntimeWorker({ runtime }) }).open();
