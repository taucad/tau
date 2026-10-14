/**
 * Worker entry for `node-worker-transport.host.test.ts`, written exactly as an
 * application-owned entry is: build a kernel worker, host it with
 * `nodeWorkerHost`. Its one kernel renders the thread's `workerData` as JSON.
 *
 * @internal
 */

import { workerData } from 'node:worker_threads';
import { nodeWorkerHost } from '#transport/node-worker-host.js';
import { defineKernelV2 as defineKernel } from '#types/runtime-kernel-v2.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import { createRuntimeWorker } from '#worker/create-runtime-worker.js';

const workerDataKernel = defineKernel({
  id: 'worker-data-fixture',
  extensions: ['fixture'],
  name: 'WorkerDataFixtureKernel',
  version: '1.0.0',
  views: { model: { title: 'Model', mimeType: 'model/gltf-binary' } },
  exports: {},
  async initialize() {
    return {};
  },
  async resolve({ entryPath }) {
    return { resolved: [entryPath], unresolved: [] };
  },
  async describe() {
    const schema = {
      $schema: 'https://json-structure.org/meta/extended/v0/#',
      $id: 'urn:taucad:test:worker-data-fixture-parameters',
      $uses: ['JSONSchemaUnits'],
      name: 'WorkerDataFixtureParameters',
      type: 'object',
    } as const;
    return { success: true, data: { parameters: { schema, defaults: {} } }, issues: [] };
  },
  async evaluate() {
    return { handle: {}, views: ['model'] as const };
  },
  async render() {
    const data: unknown = workerData;
    return { content: new TextEncoder().encode(JSON.stringify({ workerData: data })) };
  },
});

await nodeWorkerHost({
  worker: createRuntimeWorker({ runtime: defineRuntime({ kernels: [workerDataKernel()] }) }),
}).open();
