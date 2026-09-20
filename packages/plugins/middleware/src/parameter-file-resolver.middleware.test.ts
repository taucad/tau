// @vitest-environment node
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { parametersDirectory } from '@taucad/types';
import { parameterFileResolver } from '#parameter-file-resolver.middleware.js';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { createMockCreateGeometryHandler, createMockInput, createMockRuntime } from '@taucad/runtime-testing';

type ParameterFileOptions = { watchDebounce: number };

const createDependencyRuntime = (options: ParameterFileOptions) =>
  createMockRuntime<Record<string, never>, ParameterFileOptions>({ options });

function createTestContext(options?: {
  readFileResult?: string;
  readFileError?: Error;
  input?: Parameters<typeof createMockInput>[0];
}) {
  const runtime = createMockRuntime<Record<string, never>, ParameterFileOptions>({
    options: { watchDebounce: 200 },
  });

  if (options?.readFileError) {
    runtime.filesystem.mocks.readFile.mockRejectedValue(options.readFileError);
  } else if (options?.readFileResult !== undefined) {
    runtime.filesystem.mocks.readFile.mockResolvedValue(options.readFileResult);
  }

  return {
    runtime,
    input: createMockInput({
      entryPath: 'main.ts',
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
    expect(parameterFileResolverMiddleware.name).toBe('ParameterFileResolver');
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
    const notFound = Object.assign(new Error('ENOENT: file not found'), {
      code: 'ENOENT',
    });
    const { input, handler, runtime } = createTestContext({
      readFileError: notFound,
    });

    await parameterFileResolverMiddleware.wrapCreateGeometry!(input, handler, runtime);

    expect(handler).toHaveBeenCalledWith(input);
  });

  it('should propagate non-not-found filesystem errors without calling the handler', async () => {
    const permissionError = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    const { input, handler, runtime } = createTestContext({
      readFileError: permissionError,
    });

    await expect(parameterFileResolverMiddleware.wrapCreateGeometry!(input, handler, runtime)).rejects.toThrow(
      permissionError,
    );
    expect(permissionError.name).toBe('Error');
    expect(permissionError.message).toBe('EACCES: permission denied');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should diagnose invalid JSON without calling the handler', async () => {
    const { input, handler, runtime } = createTestContext({
      readFileResult: '{invalid json',
    });

    await expect(parameterFileResolverMiddleware.wrapCreateGeometry!(input, handler, runtime)).rejects.toMatchObject({
      issues: [{ code: 'INVALID_RECORD' }],
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should diagnose an entry missing activeGroup', async () => {
    const { input, handler, runtime } = createTestContext({
      readFileResult: JSON.stringify({ groups: {} }),
    });

    await expect(parameterFileResolverMiddleware.wrapCreateGeometry!(input, handler, runtime)).rejects.toMatchObject({
      issues: [{ code: 'INVALID_RECORD' }],
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should diagnose an entry missing groups', async () => {
    const { input, handler, runtime } = createTestContext({
      readFileResult: JSON.stringify({ activeGroup: 'default' }),
    });

    await expect(parameterFileResolverMiddleware.wrapCreateGeometry!(input, handler, runtime)).rejects.toMatchObject({
      issues: [{ code: 'INVALID_RECORD' }],
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'null groups', entry: { activeGroup: 'default', groups: null } },
    {
      name: 'an absent active group',
      entry: { activeGroup: 'missing', groups: { default: { values: {} } } },
    },
    {
      name: 'invalid group values',
      entry: { activeGroup: 'default', groups: { default: { values: null } } },
    },
    {
      name: 'an unknown top-level field',
      entry: {
        activeGroup: 'default',
        groups: { default: { values: {} } },
        extra: true,
      },
    },
  ])('should diagnose an entry containing $name', async ({ entry }) => {
    const { input, handler, runtime } = createTestContext({
      readFileResult: JSON.stringify(entry),
    });

    await expect(parameterFileResolverMiddleware.wrapCreateGeometry!(input, handler, runtime)).rejects.toMatchObject({
      issues: [{ code: 'INVALID_RECORD' }],
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('applies the current record and refuses one carrying retired keys', async () => {
    const current = createTestContext({
      readFileResult: JSON.stringify({ activeGroup: 'default', groups: { default: { values: { width: 42 } } } }),
    });
    await parameterFileResolverMiddleware.wrapCreateGeometry!(current.input, current.handler, current.runtime);
    expect(current.handler).toHaveBeenCalledWith(expect.objectContaining({ parameters: { width: 42 } }));

    const retired = createTestContext({
      readFileResult: JSON.stringify({
        recordVersion: 1,
        profile: 'tau-json-structure-units-03-v1',
        activeGroup: 'default',
        groups: { default: { values: { width: 99 } } },
      }),
    });
    await expect(
      parameterFileResolverMiddleware.wrapCreateGeometry!(retired.input, retired.handler, retired.runtime),
    ).rejects.toMatchObject({ issues: [{ code: 'INVALID_RECORD' }] });
    expect(retired.handler).not.toHaveBeenCalled();
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

  it('should apply input parameters over active-group values', async () => {
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
        parameters: { width: 10, height: 20 },
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

  it('should pass a source-unit value as unit-bearing text below caller overrides', async () => {
    const stored = createTestContext({
      readFileResult: JSON.stringify({
        activeGroup: 'default',
        groups: {
          default: {
            values: { width: 20 },
            units: { '/width': 'in' },
            sourceUnits: { '/width': 'in' },
          },
        },
      }),
    });
    await parameterFileResolverMiddleware.wrapCreateGeometry!(stored.input, stored.handler, stored.runtime);
    expect(stored.handler).toHaveBeenCalledWith(expect.objectContaining({ parameters: { width: '20 in' } }));

    const overridden = createTestContext({
      readFileResult: JSON.stringify({
        activeGroup: 'default',
        groups: {
          default: {
            values: { width: 20 },
            units: { '/width': 'in' },
            sourceUnits: { '/width': 'in' },
          },
        },
      }),
      input: { parameters: { width: 508 } },
    });
    await parameterFileResolverMiddleware.wrapCreateGeometry!(overridden.input, overridden.handler, overridden.runtime);
    expect(overridden.handler).toHaveBeenCalledWith(expect.objectContaining({ parameters: { width: 508 } }));
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

      const calledParams = (
        vi.mocked(handler).mock.calls[0]![0] as {
          parameters: Record<string, unknown>;
        }
      ).parameters;
      expect(calledParams).toEqual({
        base: { width: 30, depth: 20, cornerRadius: 5 },
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

      const calledParams = (
        vi.mocked(handler).mock.calls[0]![0] as {
          parameters: Record<string, unknown>;
        }
      ).parameters;
      expect(calledParams).toEqual({
        base: { width: 30, depth: 20, cornerRadius: 5 },
        profile: { line1X: 5 },
        brim: { width: 2, height: 1 },
      });
    });

    it('should replace arrays from source parameters with sidecar arrays', async () => {
      const originalParameters = {
        dimensions: [10, 20],
        nested: { values: [1, 2] },
      };
      const { input, handler, runtime } = createTestContext({
        readFileResult: makeEntry({
          activeGroup: 'default',
          groups: {
            default: {
              values: { dimensions: [30], nested: { values: [3, 4] } },
            },
          },
        }),
        input: { parameters: originalParameters },
      });

      await parameterFileResolverMiddleware.wrapCreateGeometry!(input, handler, runtime);

      const calledParams = (
        vi.mocked(handler).mock.calls[0]![0] as {
          parameters: Record<string, unknown>;
        }
      ).parameters;
      expect(calledParams).toEqual({
        dimensions: [10, 20],
        nested: { values: [1, 2] },
      });
      expect(input.parameters).toEqual(originalParameters);
    });
  });

  it('should propagate a handler SyntaxError without retrying it as malformed JSON', async () => {
    const handlerError = new SyntaxError('handler failed');
    const { input, handler, runtime } = createTestContext({
      readFileResult: makeEntry({
        activeGroup: 'default',
        groups: { default: { values: { width: 99 } } },
      }),
    });
    vi.mocked(handler).mockRejectedValueOnce(handlerError);

    await expect(parameterFileResolverMiddleware.wrapCreateGeometry!(input, handler, runtime)).rejects.toThrow(
      handlerError,
    );
    expect(handlerError.name).toBe('SyntaxError');
    expect(handlerError.message).toBe('handler failed');
    expect(handler).toHaveBeenCalledOnce();
  });

  describe('getDependencies', () => {
    it('should return the per-geometry-unit parameter file path', () => {
      const result = parameterFileResolverMiddleware.getDependencies!(
        { entryPath: 'main.ts' },
        createDependencyRuntime({
          watchDebounce: 200,
        }),
      );

      expect(result).toEqual([
        { path: `${parametersDirectory}/main.ts.json`, affects: ['createGeometry'], watchDebounce: 200 },
      ]);
    });

    it('should return synchronously (not a promise)', () => {
      const result = parameterFileResolverMiddleware.getDependencies!(
        { entryPath: 'main.ts' },
        createDependencyRuntime({
          watchDebounce: 200,
        }),
      );

      expect(Array.isArray(result)).toBe(true);
    });
  });
});
