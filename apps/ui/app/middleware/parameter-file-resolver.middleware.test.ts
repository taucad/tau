// @vitest-environment node
import { beforeAll, describe, it, expect, vi } from 'vitest';
import {
  createMockRuntime,
  createMockInput,
  createMockCreateGeometryHandler,
  resolveRuntimePluginDefinition,
} from '@taucad/runtime/testing';
import { parameterFileResolver } from '#middleware/parameter-file-resolver.middleware.js';
import { parametersDirectory } from '#utils/parameter-config.utils.js';

type ParameterFileOptions = { parametersDir: string; watchDebounce: number };

function createTestContext(options?: {
  readFileResult?: string;
  readFileError?: Error;
  input?: Parameters<typeof createMockInput>[0];
}) {
  const runtime = createMockRuntime<Record<string, never>, ParameterFileOptions>({
    options: { parametersDir: parametersDirectory, watchDebounce: 200 },
  });

  if (options?.readFileError) {
    runtime.filesystem.mocks.readFile.mockRejectedValue(options.readFileError);
  } else if (options?.readFileResult !== undefined) {
    runtime.filesystem.mocks.readFile.mockResolvedValue(options.readFileResult);
  }

  return {
    runtime,
    input: createMockInput({
      filePath: '/projects/test/main.ts',
      basePath: '/projects/test',
      parameters: {},
      ...options?.input,
    }),
    handler: createMockCreateGeometryHandler(),
  };
}

function makeEntry(entry: { activeGroup: string; groups: Record<string, unknown> }): string {
  return JSON.stringify(entry);
}

describe('parameterFileResolverMiddleware', () => {
  let parameterFileResolverMiddleware: Awaited<ReturnType<typeof resolveParameterFileResolverMiddleware>>;

  const resolveParameterFileResolverMiddleware = async () =>
    resolveRuntimePluginDefinition('middleware', parameterFileResolver());

  beforeAll(async () => {
    parameterFileResolverMiddleware = await resolveParameterFileResolverMiddleware();
  });

  it('should have correct name', () => {
    expect(parameterFileResolverMiddleware.name).toBe('parameter-file-resolver');
  });

  it('should merge file override values into input parameters', async () => {
    const { input, handler, runtime } = createTestContext({
      readFileResult: makeEntry({
        activeGroup: 'default',
        groups: { default: { values: { width: 99, height: 50 } } },
      }),
    });

    await parameterFileResolverMiddleware.wrapCreateGeometry!(input, handler, runtime);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: { width: 99, height: 50 },
      }),
    );
  });

  it('should pass through when file does not exist', async () => {
    const { input, handler, runtime } = createTestContext({
      readFileError: new Error('ENOENT: file not found'),
    });

    await parameterFileResolverMiddleware.wrapCreateGeometry!(input, handler, runtime);

    expect(handler).toHaveBeenCalledWith(input);
  });

  it('should pass through when JSON is invalid', async () => {
    const { input, handler, runtime } = createTestContext({
      readFileResult: '{invalid json',
    });

    await parameterFileResolverMiddleware.wrapCreateGeometry!(input, handler, runtime);

    expect(handler).toHaveBeenCalledWith(input);
  });

  it('should pass through when entry is missing activeGroup', async () => {
    const { input, handler, runtime } = createTestContext({
      readFileResult: JSON.stringify({ groups: {} }),
    });

    await parameterFileResolverMiddleware.wrapCreateGeometry!(input, handler, runtime);

    expect(handler).toHaveBeenCalledWith(input);
  });

  it('should pass through when entry is missing groups', async () => {
    const { input, handler, runtime } = createTestContext({
      readFileResult: JSON.stringify({ activeGroup: 'default' }),
    });

    await parameterFileResolverMiddleware.wrapCreateGeometry!(input, handler, runtime);

    expect(handler).toHaveBeenCalledWith(input);
  });

  it('should register watch path for per-geometry-unit parameter file', async () => {
    const { input, handler, runtime } = createTestContext({
      readFileResult: makeEntry({ activeGroup: 'default', groups: {} }),
    });

    await parameterFileResolverMiddleware.wrapCreateGeometry!(input, handler, runtime);

    expect(runtime.registerWatchPath).toHaveBeenCalledWith(`/projects/test/${parametersDirectory}/main.ts.json`, {
      watchDebounce: 200,
    });
  });

  it('should preserve existing input parameters when no file overrides apply', async () => {
    const { input, handler, runtime } = createTestContext({
      readFileResult: makeEntry({
        activeGroup: 'empty',
        groups: { empty: { values: {} } },
      }),
      input: { parameters: { width: 10, depth: 5 } },
    });

    await parameterFileResolverMiddleware.wrapCreateGeometry!(input, handler, runtime);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: { width: 10, depth: 5 },
      }),
    );
  });

  it('should apply active-group values over existing input parameters', async () => {
    const { input, handler, runtime } = createTestContext({
      readFileResult: makeEntry({
        activeGroup: 'default',
        groups: { default: { values: { width: 99 } } },
      }),
      input: { parameters: { width: 10, height: 20 } },
    });

    await parameterFileResolverMiddleware.wrapCreateGeometry!(input, handler, runtime);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: { width: 99, height: 20 },
      }),
    );
  });

  it('should fill missing input parameters from active-group values', async () => {
    const { input, handler, runtime } = createTestContext({
      readFileResult: makeEntry({
        activeGroup: 'wide',
        groups: { wide: { values: { width: 99, depth: 40 } } },
      }),
      input: { parameters: { height: 20 } },
    });

    await parameterFileResolverMiddleware.wrapCreateGeometry!(input, handler, runtime);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: { height: 20, width: 99, depth: 40 },
      }),
    );
  });

  describe('nested parameter deep merge', () => {
    it('should deep-merge active-group values into nested input parameters', async () => {
      const { input, handler, runtime } = createTestContext({
        readFileResult: makeEntry({
          activeGroup: 'default',
          groups: { default: { values: { base: { cornerRadius: 10 } } } },
        }),
        input: {
          parameters: {
            base: { width: 30, depth: 20, cornerRadius: 5 },
            profile: { line1X: 5, line1Y: 5 },
          },
        },
      });

      await parameterFileResolverMiddleware.wrapCreateGeometry!(input, handler, runtime);

      const calledParams = (vi.mocked(handler).mock.calls[0]![0] as { parameters: Record<string, unknown> }).parameters;
      expect(calledParams).toEqual({
        base: { width: 30, depth: 20, cornerRadius: 10 },
        profile: { line1X: 5, line1Y: 5 },
      });
    });

    it('should deep-merge multiple active-group objects into nested input parameters', async () => {
      const { input, handler, runtime } = createTestContext({
        readFileResult: makeEntry({
          activeGroup: 'default',
          groups: {
            default: {
              values: {
                base: { cornerRadius: 10 },
                brim: { height: 3 },
              },
            },
          },
        }),
        input: {
          parameters: {
            base: { width: 30, depth: 20, cornerRadius: 5 },
            profile: { line1X: 5 },
            brim: { width: 2, height: 1 },
          },
        },
      });

      await parameterFileResolverMiddleware.wrapCreateGeometry!(input, handler, runtime);

      const calledParams = (vi.mocked(handler).mock.calls[0]![0] as { parameters: Record<string, unknown> }).parameters;
      expect(calledParams).toEqual({
        base: { width: 30, depth: 20, cornerRadius: 10 },
        profile: { line1X: 5 },
        brim: { width: 2, height: 3 },
      });
    });
  });

  describe('getDependencies', () => {
    it('should return the per-geometry-unit parameter file path', () => {
      const result = parameterFileResolverMiddleware.getDependencies!(
        { filePath: '/projects/test/main.ts', basePath: '/projects/test' },
        { parametersDir: parametersDirectory, watchDebounce: 200 },
      );

      expect(result).toEqual([`/projects/test/${parametersDirectory}/main.ts.json`]);
    });

    it('should use custom parametersDir option', () => {
      const result = parameterFileResolverMiddleware.getDependencies!(
        { filePath: '/projects/test/main.ts', basePath: '/projects/test' },
        { parametersDir: '.config/params', watchDebounce: 200 },
      );

      expect(result).toEqual(['/projects/test/.config/params/main.ts.json']);
    });

    it('should return synchronously (not a promise)', () => {
      const result = parameterFileResolverMiddleware.getDependencies!(
        { filePath: '/projects/test/main.ts', basePath: '/projects/test' },
        { parametersDir: parametersDirectory, watchDebounce: 200 },
      );

      expect(Array.isArray(result)).toBe(true);
    });
  });
});
