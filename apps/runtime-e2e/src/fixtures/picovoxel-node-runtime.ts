import { esbuild } from '@taucad/esbuild';
import { picovoxel } from '@taucad/picovoxel';
import { checkAbort, createKernelSuccess, defineKernel } from '@taucad/runtime/kernel';
import { nodeWorkerHost } from '@taucad/runtime/transport/node';
import { createRuntimeWorker, defineRuntime } from '@taucad/runtime/worker';

const abortHookParameters = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:native-abort-hooks',
    $uses: ['JSONSchemaUnits'],
    name: 'NativeAbortHookParameters',
    type: 'object',
  },
  defaults: {},
} as const;

const abortHookKernel = defineKernel({
  id: 'native-abort-hooks',
  name: 'Native abort hooks',
  version: '1.0.0',
  extensions: ['hook'] as const,
  views: { model: { title: 'Model', mimeType: 'image/svg+xml' } },
  exports: { text: { title: 'Text', mimeType: 'text/plain', extension: 'txt' } },
  async initialize() {
    return {};
  },
  async resolve({ entryPath }) {
    return { resolved: [entryPath], unresolved: [] };
  },
  async describe() {
    return createKernelSuccess({ parameters: abortHookParameters });
  },
  async evaluate({ parameters }) {
    return {
      handle: { spin: parameters['spin'] === true },
      views: ['model'] as const,
      exports: ['text'] as const,
    };
  },
  async render({ handle }, runtime) {
    if (handle.spin) {
      const start = performance.now();
      let checks = 0;
      try {
        while (performance.now() - start < 5000) {
          checkAbort();
          checks++;
        }
      } catch (error) {
        runtime.logger.debug(`Native render stopped after ${checks} checks`);
        throw error;
      }
      throw new Error('Native render did not receive its abort signal.');
    }
    return { content: '<svg/>' };
  },
  async write({ handle }, runtime) {
    if (handle.spin) {
      const start = performance.now();
      let checks = 0;
      try {
        while (performance.now() - start < 5000) {
          checkAbort();
          checks++;
        }
      } catch (error) {
        runtime.logger.debug(`Native write stopped after ${checks} checks`);
        throw error;
      }
      throw new Error('Native write did not receive its abort signal.');
    }
    return { files: [{ name: 'model.txt', mimeType: 'text/plain', bytes: new TextEncoder().encode('recovered') }] };
  },
})();

// Serial: the cancellation case is about the build loop, not the artifact.
export const picovoxelNodeRuntime = defineRuntime({
  plugins: [picovoxel({ kernels: { default: { wasm: 'serial' } } }), esbuild()],
  kernels: [abortHookKernel],
});

await nodeWorkerHost({ worker: createRuntimeWorker({ runtime: picovoxelNodeRuntime }) }).open();
