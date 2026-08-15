import { esbuild } from '@taucad/runtime/bundler/esbuild';
import { defineKernel } from '@taucad/runtime/kernel';
import { replicad } from '@taucad/runtime/kernels/replicad';
import { geometryCache } from '@taucad/runtime/middleware/geometry-cache';
import { parameterCache } from '@taucad/runtime/middleware/parameter-cache';
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
  kernels: [replicad({ wasm: 'single' }), blocking()],
  bundlers: [esbuild()],
  middleware: [parameterCache(), geometryCache()],
});
