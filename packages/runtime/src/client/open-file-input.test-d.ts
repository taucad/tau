/* eslint-disable @typescript-eslint/naming-convention -- file format names don't follow camelCase */
/**
 * Type-level tests for `CodeInput<T>` and `FileInput` open-file input types.
 *
 * Verifies compile-time mutual exclusion constraints and the generic
 * `file` requirement based on code object key count, plus
 * `RuntimeClient.openFile()`/`export()` overload resolution.
 *
 * These tests are statically analysed by the TypeScript compiler via
 * vitest --typecheck and are never executed at runtime.
 *
 * `void` is used to suppress the compiler's warning about unused variables.
 */

import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { GeometryFile } from '@taucad/types';
import type { CodeInput, ExportResult, FileInput, RenderOutcome, RuntimeClient } from '#client/runtime-client.js';
import { createRuntimeClient } from '#client/runtime-client.js';
import type { KernelPlugin } from '#plugins/plugin-types.js';
import { defineKernel } from '#types/runtime-kernel.types.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { defineRuntime } from '#worker/runtime-definition.js';

// =============================================================================
// CodeInput<T> -- single-key inline mode
// =============================================================================

describe('CodeInput single-key (file optional)', () => {
  it('should compile with single-key code object', () => {
    const input: CodeInput<{ 'box.ts': string }> = {
      code: { 'box.ts': 'const x = 1;' },
    };
    expectTypeOf(input.code).toEqualTypeOf<{ 'box.ts': string }>();
  });

  it('should compile with single-key code and explicit file', () => {
    expectTypeOf<CodeInput<{ 'box.ts': string }>>().toMatchObjectType<{
      code: { 'box.ts': string };
      file?: 'box.ts';
    }>();
  });

  it('should NOT compile with single-key code and invalid file', () => {
    const input: CodeInput<{ 'box.ts': string }> = {
      code: { 'box.ts': 'const x = 1;' },
      // @ts-expect-error -- 'invalid.ts' is not a valid key of the code object
      file: 'invalid.ts',
    };
    void input;
  });

  it('should NOT compile with multi-key code and invalid file', () => {
    const input: CodeInput<{ 'box.ts': string; 'main.ts': string }> = {
      code: { 'box.ts': 'const x = 1;', 'main.ts': 'const y = 2;' },
      // @ts-expect-error -- 'invalid.ts' is not a valid key of the code object
      file: 'invalid.ts',
    };
    void input;
  });

  it('should compile with single-key code and parameters', () => {
    expectTypeOf<CodeInput<{ 'box.ts': string }>>().toExtend<{
      code: { 'box.ts': string };
      parameters?: Record<string, unknown>;
    }>();
  });

  it('should compile with non-JS/TS extension', () => {
    const input: CodeInput<{ 'model.kcl': string }> = {
      code: { 'model.kcl': 'fn main() {}' },
    };
    expectTypeOf(input.code).toEqualTypeOf<{ 'model.kcl': string }>();
  });

  it('should NOT allow GeometryFile as file in code mode', () => {
    const geo: GeometryFile = { path: '/', filename: 'box.ts' };

    const input: CodeInput<{ 'box.ts': string }> = {
      code: { 'box.ts': 'const x = 1;' },
      // @ts-expect-error -- GeometryFile is not assignable to string (code mode)
      file: geo,
    };
    void input;
  });
});

// =============================================================================
// CodeInput<T> -- multi-key inline mode
// =============================================================================

describe('CodeInput multi-key (file required)', () => {
  it('should compile with multi-key code and required file', () => {
    const input: CodeInput<{ 'main.ts': string; 'utils.ts': string }> = {
      code: {
        'main.ts': 'import "./utils"',
        'utils.ts': 'export const x = 1;',
      },
      file: 'main.ts',
    };
    expectTypeOf(input.file).toBeString();
  });

  it('should compile with multi-key code, file, and parameters', () => {
    const input: CodeInput<{ 'main.ts': string; 'utils.ts': string }> = {
      code: {
        'main.ts': 'import "./utils"',
        'utils.ts': 'export const x = 1;',
      },
      file: 'main.ts',
      parameters: { width: 50 },
    };
    expectTypeOf(input.parameters).toEqualTypeOf<Record<string, unknown> | undefined>();
  });

  it('should NOT compile without file for multi-key code', () => {
    // @ts-expect-error -- file is required when code has multiple keys
    const input: CodeInput<{ 'main.ts': string; 'utils.ts': string }> = {
      code: {
        'main.ts': 'import "./utils"',
        'utils.ts': 'export const x = 1;',
      },
    };
    void input;
  });

  it('should NOT allow GeometryFile as file in multi-key code mode', () => {
    const geo: GeometryFile = { path: '/', filename: 'main.ts' };

    const input: CodeInput<{ 'main.ts': string; 'utils.ts': string }> = {
      code: {
        'main.ts': 'import "./utils"',
        'utils.ts': 'export const x = 1;',
      },
      // @ts-expect-error -- GeometryFile is not assignable to string (code mode)
      file: geo,
    };
    void input;
  });
});

// =============================================================================
// CodeInput<T> -- dynamic Record<string, string>
// =============================================================================

describe('CodeInput dynamic Record (file required)', () => {
  it('should compile with dynamic Record and explicit file', () => {
    const dynamicFiles: Record<string, string> = { 'main.ts': 'const x = 1;' };
    const input: CodeInput<Record<string, string>> = {
      code: dynamicFiles,
      file: 'main.ts',
    };
    expectTypeOf(input.file).toBeString();
  });

  it('should NOT compile with dynamic Record without file', () => {
    const dynamicFiles: Record<string, string> = { 'main.ts': 'const x = 1;' };

    // @ts-expect-error -- file is required for wide Record<string, string>
    const input: CodeInput<Record<string, string>> = {
      code: dynamicFiles,
    };
    void input;
  });
});

// =============================================================================
// FileInput -- filesystem mode
// =============================================================================

describe('FileInput (filesystem mode)', () => {
  it('should compile with string file', () => {
    expectTypeOf<FileInput>().toExtend<{ file: string | GeometryFile }>();
  });

  it('should compile with GeometryFile', () => {
    const input: FileInput = {
      file: { path: '/projects/test', filename: 'box.ts' },
    };
    expectTypeOf(input.file).toEqualTypeOf<string | GeometryFile>();
  });

  it('should compile with parameters and options', () => {
    expectTypeOf<FileInput>().toExtend<{
      file: string | GeometryFile;
      parameters?: Record<string, unknown>;
      options?: Record<string, unknown>;
    }>();
  });

  it('should NOT allow code in file mode', () => {
    expectTypeOf<FileInput['code']>().toEqualTypeOf<undefined>();
  });
});

// =============================================================================
// RuntimeClient.openFile() overload resolution
// =============================================================================

// oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- matches plugin defaults
type TestKernel = KernelPlugin<{ step: { linearTolerance: number } }>;
type TestRuntimeClient = RuntimeClient<readonly [TestKernel]>;

describe('RuntimeClient.openFile() overload resolution', () => {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- pure type testing
  const client = {} as TestRuntimeClient;

  it('should accept single-key code (file inferred)', () => {
    expectTypeOf(client.openFile({ code: { 'box.ts': 'const x = 1;' } })).toEqualTypeOf<Promise<RenderOutcome>>();
  });

  it('should accept multi-key code with file', () => {
    expectTypeOf(
      client.openFile({
        code: {
          'main.ts': 'import "./utils"',
          'utils.ts': 'export const x = 1;',
        },
        file: 'main.ts',
      }),
    ).toEqualTypeOf<Promise<RenderOutcome>>();
  });

  it('should NOT accept single-key code with invalid file', () => {
    const input = { code: { 'box.ts': 'const x = 1;' }, file: 'invalid.ts' };
    // @ts-expect-error -- 'invalid.ts' is not a key of the code object
    void client.openFile(input);
  });

  it('should NOT accept multi-key code with invalid file', () => {
    const input = { code: { 'box.ts': 'const x = 1;', 'main.ts': 'const y = 2;' }, file: 'invalid.ts' };
    // @ts-expect-error -- 'invalid.ts' is not a key of the code object
    void client.openFile(input);
  });

  it('should accept filesystem string shorthand', () => {
    expectTypeOf(client.openFile({ file: '/src/main.ts' })).toEqualTypeOf<Promise<RenderOutcome>>();
  });

  it('should accept filesystem GeometryFile', () => {
    expectTypeOf(client.openFile({ file: { path: '/', filename: 'main.ts' } })).toEqualTypeOf<Promise<RenderOutcome>>();
  });

  it('should reject multi-key code without file', () => {
    // @ts-expect-error -- file is required for multi-key code
    void client.openFile({ code: { 'main.ts': '...', 'utils.ts': '...' } });
  });

  it('should reject empty object', () => {
    // @ts-expect-error -- neither code nor file provided
    void client.openFile({});
  });

  it('should reject only parameters', () => {
    // @ts-expect-error -- missing code or file
    void client.openFile({ parameters: { width: 50 } });
  });
});

// =============================================================================
// RuntimeClient.export() overload resolution
// =============================================================================

describe('RuntimeClient.export() overload resolution', () => {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- pure type testing
  const client: TestRuntimeClient = {} as TestRuntimeClient;

  it('should accept format-only (export from last render)', () => {
    expectTypeOf(client.export('step')).toEqualTypeOf<Promise<ExportResult>>();
  });

  it('should accept format with export options', () => {
    expectTypeOf(client.export('step', { linearTolerance: 0.01 })).toEqualTypeOf<Promise<ExportResult>>();
  });

  it('should NOT accept format with invalid export options', () => {
    // @ts-expect-error -- invalid export options - `linearTolerances` is not a valid option for `step`
    expectTypeOf(client.export('step', { linearTolerances: 0.01 })).toEqualTypeOf<Promise<ExportResult>>();
  });

  it('should NOT accept invalid format', () => {
    // @ts-expect-error -- invalid format
    expectTypeOf(client.export('invalid', { linearTolerance: 0.01 })).toEqualTypeOf<Promise<ExportResult>>();
  });

  it('should accept self-rendering with single-file inline code', () => {
    expectTypeOf(client.export('step', { code: { 'box.ts': 'const x = 1;' } })).toEqualTypeOf<Promise<ExportResult>>();
  });

  it('should accept self-rendering with multi-file inline code', () => {
    expectTypeOf(
      client.export('step', {
        code: { 'main.ts': 'import "./lib"', 'lib.ts': 'export const x = 1;' },
        file: 'main.ts',
      }),
    ).toEqualTypeOf<Promise<ExportResult>>();
  });

  it('should NOT accept single-key code export with invalid file', () => {
    const input = { code: { 'box.ts': 'const x = 1;' }, file: 'invalid.ts' };
    // @ts-expect-error -- 'invalid.ts' is not a key of the code object
    void client.export('step', input);
  });

  it('should NOT accept multi-key code export with invalid file', () => {
    const input = { code: { 'box.ts': 'const x = 1;', 'main.ts': 'const y = 2;' }, file: 'invalid.ts' };
    // @ts-expect-error -- 'invalid.ts' is not a key of the code object
    void client.export('step', input);
  });

  it('should accept self-rendering with filesystem file', () => {
    expectTypeOf(client.export('step', { file: '/src/main.ts' })).toEqualTypeOf<Promise<ExportResult>>();
  });

  it('should accept self-rendering with GeometryFile', () => {
    expectTypeOf(
      client.export('step', {
        file: { path: '/', filename: 'main.ts' },
      }),
    ).toEqualTypeOf<Promise<ExportResult>>();
  });
});

// =============================================================================
// RuntimeClient.openFile() typed options
// =============================================================================

describe('RuntimeClient.openFile() typed options', () => {
  const tessSchema = z.object({
    tessellation: z.object({ linearTolerance: z.number(), angularTolerance: z.number() }),
  });

  const kernel = defineKernel({
    id: 'k1',
    extensions: ['ts'],
    name: 'TestKernel',
    version: '1.0.0',
    renderSchema: tessSchema,
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
      return { geometry: [], nativeHandle: {} };
    },
    async exportGeometry() {
      return { success: true, data: [], issues: [] };
    },
  });
  const runtime = defineRuntime({ kernels: [kernel()] });
  const transport = inProcessTransport({ runtime, fileSystem: fromMemoryFs() });

  it('should accept valid open-file options on CodeInput', () => {
    const client = createRuntimeClient({ transport });
    void client.openFile({
      code: { 'main.ts': 'const x = 1;' },
      options: { tessellation: { linearTolerance: 0.1, angularTolerance: 10 } },
    });
  });

  it('should accept valid open-file options on FileInput', () => {
    const client = createRuntimeClient({ transport });
    void client.openFile({
      file: 'main.ts',
      options: { tessellation: { linearTolerance: 0.1, angularTolerance: 10 } },
    });
  });
});
