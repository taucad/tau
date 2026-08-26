import { esbuild } from '@taucad/esbuild';
import { middleware } from '@taucad/middleware';
import { replicad } from '@taucad/replicad';
import { defineKernel } from '@taucad/runtime/kernel';
import { defineRuntime } from '@taucad/runtime/worker';

/** Packaged-Electron hard-recovery fixture: deliberately never yields back to the utility event loop. */
const blocking = defineKernel({
  id: 'blocking',
  extensions: ['block'],
  name: 'BlockingKernel',
  version: '1.0.0',
  exportFormats: {},
  async initialize() {
    return {};
  },
  async getDependencies({ entryPath }) {
    return { resolved: [entryPath], unresolved: [] };
  },
  async getParameters() {
    return {
      success: true,
      data: { defaultParameters: {}, jsonSchema: { type: 'object', properties: {} } },
      issues: [],
    };
  },
  async createGeometry() {
    const lock = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
    Atomics.wait(lock, 0, 0);
    throw new Error('Blocking Electron recovery fixture unexpectedly resumed.');
  },
  async exportGeometry() {
    return { success: false, issues: [] };
  },
});

export const runtime = defineRuntime({
  plugins: [replicad({ kernels: { default: { wasm: 'single' } } }), esbuild(), middleware({ preset: 'cache' })],
  kernels: [blocking()],
});
