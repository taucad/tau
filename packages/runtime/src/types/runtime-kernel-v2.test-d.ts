import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { defineKernelV2, nonemptyExportFiles } from '#types/runtime-kernel-v2.types.js';
import type { DescribeResult, ExportDeclaration, ExportFile, ViewDeclaration } from '#types/runtime-kernel-v2.types.js';
import { definePlugin } from '#plugins/plugin.js';
import type { KernelRenderContentFor } from '#plugins/plugin-types.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import type { RuntimeKernels } from '#worker/runtime-definition.js';

const definition = defineKernelV2({
  id: 'typed',
  extensions: ['tsx', 'jsx'],
  name: 'Typed',
  version: '1',
  optionsSchema: z.object({
    endpoint: z.string(),
    retry: z.number().default(1),
  }),
  evaluateOptionsSchema: z.object({ density: z.number().default(2) }),
  views: {
    board: { title: 'Board', mimeType: 'model/gltf-binary' },
    pcb: {
      title: 'PCB',
      mimeType: 'image/svg+xml',
      optionsSchema: z.object({ pins: z.boolean().default(false) }),
      content: ['includeEdges'],
    },
    schematic: {
      title: 'Schematic',
      mimeType: 'image/svg+xml',
      instances: true,
    },
  },
  exports: {
    bom: { title: 'BOM', mimeType: 'text/csv', extension: 'csv' },
    board: {
      title: 'Board',
      mimeType: 'model/gltf-binary',
      extension: 'glb',
      optionsSchema: z.object({ scale: z.number().default(1) }),
    },
  },
  async initialize(options) {
    expectTypeOf(options.endpoint).toEqualTypeOf<string>();
    expectTypeOf(options.retry).toEqualTypeOf<number>();
    return { connection: options.endpoint };
  },
  async resolve({ entryPath }, _services, context) {
    expectTypeOf(context.connection).toEqualTypeOf<string>();
    return { resolved: [entryPath], unresolved: [] };
  },
  async describe(_input, _services, context) {
    expectTypeOf(context.connection).toEqualTypeOf<string>();
    return { success: false, issues: [] };
  },
  async evaluate(input, _services, context) {
    expectTypeOf(input.options.density).toEqualTypeOf<number>();
    expectTypeOf(context.connection).toEqualTypeOf<string>();
    // @ts-expect-error -- the v2 kernel service cannot emit the retired progress event.
    void _services.emitEvent;
    return {
      handle: { count: 1, connection: context.connection },
      views: ['board', 'pcb', 'schematic'],
      exports: ['bom', 'board'],
      instances: { schematic: [{ id: 'one', title: 'One' }] },
    };
  },
  async render(input) {
    expectTypeOf(input.handle.count).toEqualTypeOf<number>();
    if (input.view === 'pcb') {
      expectTypeOf(input.options.pins).toEqualTypeOf<boolean>();
      expectTypeOf(input.content).toEqualTypeOf<{ readonly includeEdges?: boolean } | undefined>();
      expectTypeOf(input.instance).toEqualTypeOf<undefined>();
    }
    if (input.view === 'schematic') {
      expectTypeOf(input.instance).toEqualTypeOf<string | undefined>();
      // @ts-expect-error -- the schematic has no view options.
      void input.options.pins;
    }
    return { content: new Uint8Array([1]) };
  },
  async write(input) {
    expectTypeOf(input.handle.connection).toEqualTypeOf<string>();
    if (input.exportId === 'board') {
      expectTypeOf(input.options.scale).toEqualTypeOf<number>();
    } else {
      // @ts-expect-error -- BOM has no board options.
      void input.options.scale;
    }
    return {
      files: [{ name: 'bom.csv', mimeType: 'text/csv', bytes: new Uint8Array([1]) }],
    };
  },
  serializeHandle: ({ handle }) => JSON.stringify(handle),
  deserializeHandle: ({ serialized }) => {
    expectTypeOf(serialized).toEqualTypeOf<string>();
    return { count: 1, connection: serialized };
  },
});

describe('v2 kernel authoring', () => {
  it('requires object input and output for declared options', () => {
    const scalarView = {
      title: 'Scalar',
      mimeType: 'text/plain',
      // @ts-expect-error -- a view option schema must accept and return an object.
      optionsSchema: z.string(),
    } satisfies ViewDeclaration;
    const scalarExport = {
      title: 'Scalar',
      mimeType: 'text/plain',
      extension: 'txt',
      // @ts-expect-error -- an export option schema must accept and return an object.
      optionsSchema: z.object({ value: z.string() }).transform(({ value }) => value),
    } satisfies ExportDeclaration;
    void scalarView;
    void scalarExport;
    const emptyContent = {
      title: 'Empty',
      mimeType: 'text/plain',
      // @ts-expect-error -- native content declarations are positive and nonempty.
      content: [],
    } satisfies ViewDeclaration;
    const unknownContent = {
      title: 'Unknown',
      mimeType: 'text/plain',
      // @ts-expect-error -- only canonical framework content keys are accepted.
      content: ['includeSketches'],
    } satisfies ViewDeclaration;
    void emptyContent;
    void unknownContent;
  });

  it('rejects non-object evaluation options and one-sided handle snapshots', () => {
    const sourceOnly = {
      id: 'source-only',
      extensions: ['src'],
      name: 'Source only',
      version: '1',
      views: {},
      exports: {},
      async initialize() {
        return {};
      },
      async resolve() {
        return { resolved: [], unresolved: [] };
      },
      async describe() {
        return { success: false, issues: [] } satisfies DescribeResult;
      },
      async evaluate(input: { entryPath: string }) {
        return { handle: { source: input.entryPath } };
      },
    };
    defineKernelV2(sourceOnly);
    defineKernelV2({
      ...sourceOnly,
      // @ts-expect-error -- evaluation options must be an object schema.
      evaluateOptionsSchema: z.string(),
    });
    // @ts-expect-error -- durable handle snapshots require both serializer and deserializer.
    defineKernelV2({
      ...sourceOnly,
      serializeHandle({ handle }: { handle: { source: string } }) {
        return handle.source;
      },
    });
  });
  it('preserves the real factory through selected plugin presets and runtime registries', () => {
    const toolkit = definePlugin({
      meta: { name: '@test/v2-kernel' },
      kernels: { typed: definition },
      presets: { default: ['kernels.typed'], empty: [] },
    });
    const selected = toolkit({ kernels: { typed: { endpoint: 'local' } } });
    expectTypeOf(selected.capabilities.kernels[0].id).toEqualTypeOf<'typed'>();
    expectTypeOf(selected.capabilities.kernels[0].extensions).toEqualTypeOf<readonly ['tsx', 'jsx']>();
    expectTypeOf(selected.capabilities.kernels[0].views.pcb.mimeType).toEqualTypeOf<'image/svg+xml'>();
    const runtime = defineRuntime({
      plugins: [selected],
      kernels: [definition({ endpoint: 'direct' })],
    });
    expectTypeOf<RuntimeKernels<typeof runtime>[0]['id']>().toEqualTypeOf<'typed'>();
    expectTypeOf<KernelRenderContentFor<RuntimeKernels<typeof runtime>, 'typed'>>().toEqualTypeOf<'includeEdges'>();
    expectTypeOf<RuntimeKernels<typeof runtime>[1]['exports']['board']['extension']>().toEqualTypeOf<'glb'>();
    // @ts-expect-error -- selected capability retains required factory options.
    toolkit();
    const empty = toolkit({ preset: 'empty' });
    expectTypeOf(empty.capabilities.kernels.length).toEqualTypeOf<0>();
  });

  it('preserves factory options and plain declaration keys', () => {
    // @ts-expect-error -- endpoint is required.
    definition();
    const plugin = definition({ endpoint: 'local' });
    expectTypeOf(plugin.id).toEqualTypeOf<'typed'>();
    expectTypeOf(plugin.extensions).toEqualTypeOf<readonly ['tsx', 'jsx']>();
    expectTypeOf(plugin.views.pcb.mimeType).toEqualTypeOf<'image/svg+xml'>();
    // @ts-expect-error -- public metadata retains the declared MIME literal.
    const wrongMime: typeof plugin.views.pcb.mimeType = 'image/png';
    void wrongMime;
    // @ts-expect-error -- a nonexistent view is not declared.
    void plugin.views.misspelled;
    // @ts-expect-error -- executable Zod parsers never live in registration metadata.
    void plugin.views.pcb.optionsSchema.parse;
  });

  it('requires render and write only for declared maps', () => {
    const hoistedView = {
      title: 'Board',
      mimeType: 'model/gltf-binary',
    } satisfies ViewDeclaration;
    defineKernelV2({
      id: 'export-only',
      extensions: ['data'],
      name: 'Export only',
      version: '1',
      views: {},
      exports: {
        data: { title: 'Data', mimeType: 'text/plain', extension: 'txt' },
      },
      async initialize() {
        return { id: 1 };
      },
      async resolve() {
        return { resolved: [], unresolved: [] };
      },
      async describe() {
        return { success: false, issues: [] };
      },
      async evaluate() {
        return { handle: { id: 1 } };
      },
      async write() {
        const mapped: ExportFile[] = ['data'].map((name) => ({
          name: `${name}.txt`,
          mimeType: 'text/plain',
          bytes: new Uint8Array(),
        }));
        return { files: nonemptyExportFiles(mapped) };
      },
    });
    const misspelledView = {
      title: 'Board',
      mimeType: 'model/gltf-binary',
      // @ts-expect-error -- this spelling must never be ignored.
      optionSchema: z.object({}),
    } satisfies ViewDeclaration;
    void misspelledView;
    // @ts-expect-error -- declared views require a render hook.
    defineKernelV2({
      id: 'invalid-view',
      extensions: ['data'],
      name: 'Invalid',
      version: '1',
      views: { board: hoistedView },
      exports: {},
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
    });
    defineKernelV2({
      id: 'invalid-empty-view',
      extensions: ['data'],
      name: 'Invalid empty view',
      version: '1',
      views: {},
      exports: {},
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
      // @ts-expect-error -- a kernel with no views cannot define render.
      async render() {
        return { content: '' };
      },
    });
  });
});
