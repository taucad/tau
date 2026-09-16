import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { createRuntimeClient } from '#client/runtime-client.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { definePlugin } from '#plugins/plugin.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { defineKernel } from '#types/runtime-kernel.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import type {
  RuntimeBundlers,
  RuntimeKernels,
  RuntimeMiddleware,
  RuntimeTranscoders,
} from '#worker/runtime-definition.js';
// oxlint-disable-next-line no-restricted-imports -- Runtime-private fixture stays outside the package build graph.
import { createParameterDeclaration } from '../../test/support/kernel-worker.fixture.js';

const kernel = defineKernel({
  id: 'typed-export',
  name: 'Typed export',
  version: '1.0.0',
  extensions: ['typed'],
  exportFormats: { stl: { optionsSchema: z.object({ binary: z.boolean() }) } },
  async initialize() {
    return {};
  },
  async getDependencies() {
    return { resolved: [], unresolved: [] };
  },
  async getParameters() {
    return createParameterDeclaration();
  },
  async createGeometry() {
    return { geometry: { format: 'gltf', content: new Uint8Array() }, nativeHandle: {} };
  },
  async exportGeometry() {
    return { success: true, data: [], issues: [] };
  },
});

const toolkit = definePlugin({
  meta: { name: '@taucad/typed-export' },
  kernels: { default: kernel },
  presets: { default: ['kernels.default'] },
});

describe('runtime capability tuple composition', () => {
  it('should preserve a singleton toolkit export when direct buckets are omitted', async () => {
    const runtime = defineRuntime({ plugins: [toolkit()] });
    expectTypeOf<RuntimeKernels<typeof runtime>['length']>().toEqualTypeOf<1>();
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }),
    });
    await client.export('stl', { source: { path: 'model.typed' }, exportOptions: { binary: true } });
    // @ts-expect-error -- the route's options must survive toolkit composition.
    await client.export('stl', { source: { path: 'model.typed' }, exportOptions: { binary: 'yes' } });
    // @ts-expect-error -- no STEP route is declared.
    await client.export('step');
  });

  it('should preserve direct and configured tuples without an empty variadic tail', () => {
    const direct = defineRuntime({ kernels: [kernel()] });
    const configured = defineRuntime({
      configSchema: z.object({}),
      createRuntime: () => ({ plugins: [toolkit()] }),
    });
    expectTypeOf<RuntimeKernels<typeof direct>['length']>().toEqualTypeOf<1>();
    expectTypeOf<RuntimeKernels<typeof configured>['length']>().toEqualTypeOf<1>();
    const empty = defineRuntime({});
    expectTypeOf<RuntimeKernels<typeof empty>['length']>().toEqualTypeOf<0>();
    const configuredEmpty = defineRuntime({ configSchema: z.object({}), createRuntime: () => ({}) });
    expectTypeOf<RuntimeKernels<typeof configuredEmpty>['length']>().toEqualTypeOf<0>();
    expectTypeOf<RuntimeMiddleware<typeof configuredEmpty>['length']>().toEqualTypeOf<0>();
    expectTypeOf<RuntimeBundlers<typeof configuredEmpty>['length']>().toEqualTypeOf<0>();
    expectTypeOf<RuntimeTranscoders<typeof configuredEmpty>['length']>().toEqualTypeOf<0>();
  });
});
