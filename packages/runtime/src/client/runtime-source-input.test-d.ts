/* eslint-disable @typescript-eslint/naming-convention -- file map keys are source paths */
/**
 * Type-level tests for canonical runtime source input.
 *
 * These tests are statically analysed by TypeScript through Vitest typecheck.
 */

import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { ExportFile, GeometryResponse } from '@taucad/types';
import { createRuntimeClient } from '#client/runtime-client.js';
import type {
  ExportResult,
  RenderOutcome,
  RuntimeSource,
  RuntimeSourceContent,
  RuntimeSourceFiles,
} from '#client/runtime-client.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { defineKernel } from '#types/runtime-kernel.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import { defineMiddleware } from '#middleware/runtime-middleware.js';
import type { KernelPlugin } from '#plugins/plugin-types.js';

const code = 'export default () => null;';
const bytes = new Uint8Array([1, 2, 3]);

describe('RuntimeSource inline source', () => {
  it('should accept a single-key file map without entry', () => {
    const source: RuntimeSource<{ 'main.ts': string }> = {
      files: { 'main.ts': code },
    };

    expectTypeOf(source.files).toEqualTypeOf<{ 'main.ts': string }>();
  });

  it('should accept a single-key file map with the matching entry', () => {
    const source: RuntimeSource<{ 'main.ts': string }> = {
      files: { 'main.ts': code },
      entry: 'main.ts',
    };

    expectTypeOf(source.entry).toEqualTypeOf<'main.ts' | undefined>();
  });

  it('should require entry for multi-key file maps', () => {
    const source: RuntimeSource<{ 'main.ts': string; 'util.ts': string }> = {
      files: { 'main.ts': code, 'util.ts': code },
      entry: 'main.ts',
    };
    expectTypeOf(source.entry).toEqualTypeOf<'main.ts' | 'util.ts'>();

    // @ts-expect-error -- multi-key inline source requires entry
    const invalid: RuntimeSource<{ 'main.ts': string; 'util.ts': string }> = {
      files: { 'main.ts': code, 'util.ts': code },
    };
    void invalid;
  });

  it('should reject invalid literal entry keys', () => {
    const source: RuntimeSource<{ 'main.ts': string; 'util.ts': string }> = {
      files: { 'main.ts': code, 'util.ts': code },
      // @ts-expect-error -- entry must be one of the files keys
      entry: 'missing.ts',
    };
    void source;
  });

  it('should reject literal empty file maps', () => {
    type EmptyFiles = Readonly<Record<never, RuntimeSourceContent>>;

    // @ts-expect-error -- literal empty files are rejected
    const source: RuntimeSource<EmptyFiles> = { files: {} };
    void source;
  });

  it('should allow wide file maps and defer multi-file entry validation to runtime', () => {
    const files: RuntimeSourceFiles = { 'main.ts': code };
    const source: RuntimeSource = { files };
    expectTypeOf(source).toExtend<RuntimeSource>();
  });

  it('should accept string and Uint8Array content', () => {
    const source: RuntimeSource<{ 'main.ts': string; 'asset.bin': Uint8Array<ArrayBuffer> }> = {
      files: { 'main.ts': code, 'asset.bin': bytes },
      entry: 'main.ts',
    };

    expectTypeOf(source.files['asset.bin']).toEqualTypeOf<Uint8Array<ArrayBuffer>>();
    expectTypeOf<RuntimeSourceContent>().toEqualTypeOf<string | Uint8Array<ArrayBuffer>>();
  });
});

describe('RuntimeSource filesystem source', () => {
  it('should accept string paths', () => {
    const stringSource: RuntimeSource = { path: '/project/main.ts' };

    expectTypeOf(stringSource.path).toEqualTypeOf<string>();
  });

  it('should reject files and entry on filesystem sources', () => {
    // @ts-expect-error -- filesystem source cannot also use files
    const mixed: RuntimeSource = {
      path: '/project/main.ts',
      files: { 'main.ts': code },
    };
    void mixed;

    // @ts-expect-error -- filesystem source cannot use entry
    const withEntry: RuntimeSource = {
      path: '/project/main.ts',
      entry: 'main.ts',
    };
    void withEntry;
  });
});

const testGeometry = { format: 'gltf', content: new Uint8Array([1]) } satisfies GeometryResponse;
const kernel = defineKernel({
  id: 'typedKernel',
  extensions: ['ts'],
  name: 'TypedKernel',
  version: '1.0.0',
  render: {
    optionsSchema: z.object({
      tessellation: z.object({
        linearTolerance: z.number(),
        angularTolerance: z.number(),
      }),
    }),
    content: ['includeEdges'],
  },
  exportFormats: {
    step: {
      optionsSchema: z.object({ tolerance: z.number().default(0.1), unit: z.enum(['mm', 'in']).default('mm') }),
    },
    stl: { optionsSchema: z.object({ binary: z.boolean() }) },
    glb: { optionsSchema: z.object({}), content: ['includeEdges'] },
  },
  async initialize() {
    return {};
  },
  async getDependencies() {
    return { resolved: [], unresolved: [] };
  },
  async getParameters() {
    return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
  },
  async createGeometry() {
    return { nativeHandle: {} };
  },
  async meshGeometry() {
    return { geometry: testGeometry };
  },
  async exportGeometry() {
    return { success: true, data: [], issues: [] };
  },
});
const runtime = defineRuntime({ kernels: [kernel()] });
const transport = inProcessTransport({ runtime, fileSystem: fromMemoryFs() });
const client = createRuntimeClient({ transport });

describe('RuntimeClient.render input types', () => {
  it('should accept source, parameters, and typed render options', () => {
    expectTypeOf(
      client.render({
        source: { files: { 'main.ts': code } },
        parameters: { width: 10 },
        renderOptions: { tessellation: { linearTolerance: 0.1, angularTolerance: 12 } },
      }),
    ).toEqualTypeOf<Promise<RenderOutcome>>();
    void client.render({ source: { files: { 'main.ts': code } }, content: { includeEdges: true } });
  });

  it('should infer multi-file keys and require entry', () => {
    // @ts-expect-error -- inference must keep both literal keys and require entry
    void client.render({ source: { files: { 'a.ts': code, 'b.ts': code } } });

    void client.render({ source: { files: { 'a.ts': code, 'b.ts': code }, entry: 'a.ts' } });
  });

  it('should reject old render option placement', () => {
    // @ts-expect-error -- old `options` field is rejected
    void client.render({ source: { files: { 'main.ts': code } }, options: {} });

    // @ts-expect-error -- plugin render config belongs under renderOptions
    void client.render({ source: { files: { 'main.ts': code } }, tessellation: {} });

    void client.render({
      source: { files: { 'main.ts': code } },
      // @ts-expect-error -- this render route advertises edges only.
      content: { includeTopology: true },
    });
  });
});

describe('RuntimeClient.setOptions input types', () => {
  it('should accept the kernel options bag and expose a synchronous timeout setter', () => {
    void client.setOptions({ tessellation: { linearTolerance: 0.1, angularTolerance: 12 } });

    expectTypeOf(client.setRenderTimeout(60_000)).toEqualTypeOf<void>();

    // @ts-expect-error -- timeout is runtime-client control state, not render options
    void client.setOptions({ renderTimeout: 60_000 });

    // @ts-expect-error -- kernel options are not wrapped
    void client.setOptions({ renderOptions: { tessellation: { linearTolerance: 0.1, angularTolerance: 12 } } });
  });

  it('should reject legacy option envelopes', () => {
    // @ts-expect-error -- old `options` field is rejected
    void client.setOptions({ options: {} });
  });
});

describe('RuntimeClient.export input types', () => {
  it('should expose only the ordered plural export success shape', () => {
    expectTypeOf<Extract<ExportResult, { success: true }>['data']>().toEqualTypeOf<ExportFile[]>();
    expectTypeOf<Extract<ExportResult, { success: true }>['data']>().not.toEqualTypeOf<ExportFile>();
  });

  it('should accept format-only and nested export options', () => {
    expectTypeOf(client.export('step')).toEqualTypeOf<Promise<ExportResult>>();
    expectTypeOf(client.export('step', { exportOptions: { tolerance: 0.01 } })).toEqualTypeOf<Promise<ExportResult>>();
    void client.export('glb', { content: { includeEdges: true } });
  });

  it('should accept request-scoped source export', () => {
    expectTypeOf(
      client.export('step', {
        source: { files: { 'main.ts': code } },
        parameters: { width: 10 },
        exportOptions: { unit: 'mm' },
      }),
    ).toEqualTypeOf<Promise<ExportResult>>();
  });

  it('should reject flat export options and invalid nested options', () => {
    // @ts-expect-error -- plugin export options belong under exportOptions
    void client.export('step', { tolerance: 0.01 });

    // @ts-expect-error -- invalid nested export option
    void client.export('step', { exportOptions: { binary: true } });

    void client.export('step', {
      // @ts-expect-error -- STEP does not advertise framework content.
      content: { includeEdges: true },
    });

    // @ts-expect-error -- parameters require source
    void client.export('step', { parameters: { width: 10 } });

    // @ts-expect-error -- export has no preview render options
    void client.export('step', { source: { files: { 'main.ts': code } }, renderOptions: {} });
  });
});

const contentEmptyKernel = defineKernel({
  id: 'contentEmptyKernel',
  extensions: ['empty'],
  name: 'Content-empty kernel',
  version: '1.0.0',
  exportFormats: { glb: { optionsSchema: z.object({}) } },
  async initialize() {
    return {};
  },
  async getDependencies() {
    return { resolved: [], unresolved: [] };
  },
  async getParameters() {
    return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
  },
  async createGeometry(input) {
    expectTypeOf(input).not.toHaveProperty('content');
    return { geometry: testGeometry, nativeHandle: {} };
  },
  async exportGeometry(input) {
    expectTypeOf(input).not.toHaveProperty('content');
    return { success: true, data: [], issues: [] };
  },
});
type ContentEmptyKernelRenderContent =
  ReturnType<typeof contentEmptyKernel> extends KernelPlugin<
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- type-test wildcard.
    any,
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- type-test wildcard.
    any,
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- type-test wildcard.
    any,
    infer Content,
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- type-test wildcard.
    any
  >
    ? Content
    : never;
expectTypeOf<ContentEmptyKernelRenderContent>().toEqualTypeOf<never>();

const contentEmptyRuntime = defineRuntime({ kernels: [contentEmptyKernel()] });
const contentEmptyClient = createRuntimeClient({
  transport: inProcessTransport({ runtime: contentEmptyRuntime, fileSystem: fromMemoryFs() }),
});

const edgeProvider = defineMiddleware({
  id: 'edgeProvider',
  name: 'Edge provider',
  content: { render: ['includeEdges'], exportFormats: { glb: ['includeEdges'] } },
  async wrapCreateGeometry(input, handler) {
    expectTypeOf(input.content).toEqualTypeOf<{ readonly includeEdges?: boolean } | undefined>();
    return handler(input);
  },
});
const composedRuntime = defineRuntime({ kernels: [contentEmptyKernel()], middleware: [edgeProvider()] });
const composedClient = createRuntimeClient({
  transport: inProcessTransport({ runtime: composedRuntime, fileSystem: fromMemoryFs() }),
});

describe('content capability composition', () => {
  it('rejects consumer content when no provider declares it', () => {
    // @ts-expect-error -- no render provider supports edges.
    void contentEmptyClient.render({ source: { files: { 'main.empty': code } }, content: { includeEdges: true } });
    // @ts-expect-error -- no GLB provider supports edges.
    void contentEmptyClient.export('glb', { content: { includeEdges: true } });
    // @ts-expect-error -- the only GLB route is content-empty.
    void contentEmptyClient.bestRouteFor('glb', { content: { includeEdges: true } });
  });

  it('lets middleware add consumer support without widening kernel hooks', () => {
    void composedClient.render({ source: { files: { 'main.empty': code } }, content: { includeEdges: true } });
    void composedClient.export('glb', { content: { includeEdges: true } });
    void composedClient.bestRouteFor('glb', { content: { includeEdges: true } });
  });
});
