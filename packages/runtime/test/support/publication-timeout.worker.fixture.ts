import { createKernelSuccess, defineKernel } from '@taucad/runtime/kernel';
import { nodeWorkerHost } from '@taucad/runtime/transport/node';
import { createRuntimeWorker, defineRuntime } from '@taucad/runtime/worker';
import { emptyGlb } from '#framework/published-part-test-fixture.js';

const kernel = defineKernel({
  id: 'publication-timeout',
  name: 'Publication timeout fixture',
  version: '1.0.0',
  extensions: ['shape'],
  views: { model: { title: 'Model', mimeType: 'model/gltf-binary' } },
  exports: {},
  async initialize() {
    return {};
  },
  async resolve() {
    return { resolved: [], unresolved: [] };
  },
  async describe() {
    return createKernelSuccess({
      parameters: {
        schema: {
          $schema: 'https://json-structure.org/meta/extended/v0/#',
          $id: 'urn:taucad:test:publication-timeout',
          $uses: ['JSONSchemaUnits'],
          name: 'PublicationTimeoutParameters',
          type: 'object',
        },
        defaults: {},
      },
    });
  },
  async evaluate() {
    return { handle: {}, views: ['model'] };
  },
  async render() {
    return { content: emptyGlb() };
  },
});

await nodeWorkerHost({
  worker: createRuntimeWorker({
    runtime: defineRuntime({ kernels: [kernel()] }),
    admitAssemblyDisplay: async () => undefined,
  }),
}).open();
