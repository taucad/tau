import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { createRuntimeClient } from '#client/runtime-client.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { definePlugin } from '#plugins/plugin.js';
import type { CollectFormatMap, ExportOptionsFor, KernelExportContentFor } from '#plugins/plugin-types.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { defineKernelV2, nonemptyExportFiles } from '#types/runtime-kernel-v2.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import type {
  RuntimeBundlers,
  RuntimeKernels,
  RuntimeMiddleware,
  RuntimeTranscoders,
} from '#worker/runtime-definition.js';
const kernel = defineKernelV2({
  id: 'typed-export',
  name: 'Typed export',
  version: '1.0.0',
  extensions: ['typed'],
  views: {},
  exports: {
    mesh: {
      title: 'STL',
      mimeType: 'model/stl',
      extension: 'stl',
      optionsSchema: z.object({ binary: z.boolean() }),
      content: ['includeEdges'],
    },
  },
  async initialize() {
    return {};
  },
  async resolve() {
    return { resolved: [], unresolved: [] };
  },
  async describe() {
    return { success: false, issues: [] };
  },
  async evaluate() {
    return { handle: {} };
  },
  async write() {
    return { files: nonemptyExportFiles([{ name: 'model.stl', mimeType: 'model/stl', bytes: new Uint8Array([1]) }]) };
  },
});

const toolkit = definePlugin({
  meta: { name: '@taucad/typed-export' },
  kernels: { default: kernel },
  presets: { default: ['kernels.default'] },
});

describe('runtime capability tuple composition', () => {
  it('should preserve a singleton toolkit export when direct buckets are omitted', async () => {
    const registration = kernel();
    expectTypeOf<CollectFormatMap<readonly [typeof registration]>['stl']>().toEqualTypeOf<{ binary: boolean }>();
    const runtime = defineRuntime({ plugins: [toolkit()] });
    expectTypeOf<RuntimeKernels<typeof runtime>['length']>().toEqualTypeOf<1>();
    expectTypeOf<RuntimeKernels<typeof runtime>[0]['exports']['mesh']['extension']>().toEqualTypeOf<'stl'>();
    expectTypeOf<CollectFormatMap<RuntimeKernels<typeof runtime>>['stl']>().toEqualTypeOf<{ binary: boolean }>();
    expectTypeOf<
      ExportOptionsFor<RuntimeKernels<typeof runtime>, RuntimeTranscoders<typeof runtime>, 'stl'>
    >().toEqualTypeOf<{ binary: boolean }>();
    expectTypeOf<KernelExportContentFor<RuntimeKernels<typeof runtime>, 'stl'>>().toEqualTypeOf<'includeEdges'>();
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }),
    });
    await client.export('stl', {
      source: { path: 'model.typed' },
      exportOptions: { binary: true },
      content: { includeEdges: true },
    });
    // @ts-expect-error -- export content stays narrowed through the toolkit and runtime.
    await client.export('stl', { source: { path: 'model.typed' }, content: { includeTopology: true } });
    // @ts-expect-error -- declaration IDs are metadata until the W3 client/wire migration.
    await client.export('mesh');
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
