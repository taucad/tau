/* eslint-disable @typescript-eslint/naming-convention -- file map keys are source paths */
/**
 * Type-level tests for canonical runtime source input.
 *
 * These tests are statically analysed by TypeScript through Vitest typecheck.
 */

import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { GeometryFile, GeometryResponse } from '@taucad/types';
import { createRuntimeClient } from '#client/runtime-client.js';
import type {
  ExportResult,
  RenderOutcome,
  RuntimeClient,
  RuntimeSource,
  RuntimeSourceContent,
  RuntimeSourceFiles,
} from '#client/runtime-client.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { defineKernel } from '#types/runtime-kernel.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';

const code = 'export default () => null;';
const bytes = new Uint8Array([1, 2, 3]);
const geometryFile = { path: '/project', filename: 'main.ts' } satisfies GeometryFile;

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

  it('should require entry for wide file maps', () => {
    const files: RuntimeSourceFiles = { 'main.ts': code };
    const source: RuntimeSource = { files, entry: 'main.ts' };
    expectTypeOf(source).toExtend<RuntimeSource>();

    // @ts-expect-error -- wide records require entry
    const invalid: RuntimeSource = { files };
    void invalid;
  });

  it('should accept string and Uint8Array content', () => {
    const source: RuntimeSource<{ 'main.ts': string; 'asset.bin': Uint8Array<ArrayBuffer> }> = {
      files: { 'main.ts': code, 'asset.bin': bytes },
      entry: 'main.ts',
    };

    expectTypeOf(source.files['asset.bin']).toEqualTypeOf<Uint8Array<ArrayBuffer>>();
    expectTypeOf<RuntimeSourceContent>().toEqualTypeOf<string | Uint8Array<ArrayBuffer>>();
  });

  it('should reject path on inline sources', () => {
    // @ts-expect-error -- inline source cannot also use path
    const source: RuntimeSource<{ 'main.ts': string }> = {
      files: { 'main.ts': code },
      path: '/main.ts',
    };
    void source;
  });
});

describe('RuntimeSource filesystem source', () => {
  it('should accept string and GeometryFile paths', () => {
    const stringSource: RuntimeSource = { path: '/project/main.ts' };
    const fileSource: RuntimeSource = { path: geometryFile };

    expectTypeOf(stringSource.path).toEqualTypeOf<string | GeometryFile>();
    expectTypeOf(fileSource.path).toEqualTypeOf<string | GeometryFile>();
  });

  it('should reject files, entry, and path/content shorthand on filesystem sources', () => {
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

    const shorthand: RuntimeSource = {
      path: 'main.ts',
      // @ts-expect-error -- { path, content } shorthand is not part of the public source API
      content: code,
    };
    void shorthand;
  });
});

const testGeometry = { format: 'gltf', content: new Uint8Array([1]) } satisfies GeometryResponse;
const kernel = defineKernel({
  id: 'typedKernel',
  extensions: ['ts'],
  name: 'TypedKernel',
  version: '1.0.0',
  renderSchema: z.object({
    tessellation: z.object({
      linearTolerance: z.number(),
      angularTolerance: z.number(),
    }),
  }),
  exportSchemas: {
    step: z.object({ tolerance: z.number().default(0.1), unit: z.enum(['mm', 'in']).default('mm') }),
    stl: z.object({ binary: z.boolean() }),
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
    return { geometry: testGeometry, nativeHandle: {} };
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
  });
});

describe('RuntimeClient.setOptions input types', () => {
  it('should accept renderOptions, renderTimeout, or both', () => {
    void client.setOptions({ renderOptions: { tessellation: { linearTolerance: 0.1, angularTolerance: 12 } } });
    void client.setOptions({ renderTimeout: 60_000 });
    void client.setOptions({
      renderOptions: { tessellation: { linearTolerance: 0.1, angularTolerance: 12 } },
      renderTimeout: 60_000,
    });
  });

  it('should reject empty and flat option inputs', () => {
    // @ts-expect-error -- empty input has no effect and is rejected
    void client.setOptions({});

    // @ts-expect-error -- plugin render config belongs under renderOptions
    void client.setOptions({ tessellation: { linearTolerance: 0.1, angularTolerance: 12 } });

    // @ts-expect-error -- old `options` field is rejected
    void client.setOptions({ options: {} });
  });
});

describe('RuntimeClient.export input types', () => {
  it('should accept format-only and nested export options', () => {
    expectTypeOf(client.export('step')).toEqualTypeOf<Promise<ExportResult>>();
    expectTypeOf(client.export('step', { exportOptions: { tolerance: 0.01 } })).toEqualTypeOf<Promise<ExportResult>>();
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

    // @ts-expect-error -- parameters require source
    void client.export('step', { parameters: { width: 10 } });

    // @ts-expect-error -- export has no preview render options
    void client.export('step', { source: { files: { 'main.ts': code } }, renderOptions: {} });

    // @ts-expect-error -- old self-render code input is rejected
    void client.export('step', { code: { 'main.ts': code } });

    // @ts-expect-error -- old self-render file input is rejected
    void client.export('step', { file: 'main.ts' });
  });

  it('should expose no public openFile member', () => {
    expectTypeOf<RuntimeClient>().not.toHaveProperty('openFile');
    expectTypeOf<RuntimeClient>().toHaveProperty('render');
  });
});
