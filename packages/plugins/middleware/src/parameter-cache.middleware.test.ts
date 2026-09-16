import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contentDigest } from '@taucad/cache-core';
import { compileParameterManifest } from '@taucad/parameters';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { GetParametersResult } from '@taucad/runtime/types';
import { createMockInput, createMockRuntime } from '@taucad/runtime-testing';
import { parameterCache } from '#parameter-cache.middleware.js';

const resolveMiddleware = async () => resolveRuntimePluginDefinition('middleware', parameterCache());
const dependency = contentDigest({ value: `sha256:${'1'.repeat(64)}` });
const middlewareIdentity = contentDigest({ value: `sha256:${'2'.repeat(64)}` });
const successResult = async (width = 10): Promise<GetParametersResult> => ({
  success: true,
  data: await compileParameterManifest({
    declaration: {
      schema: {
        $schema: 'https://json-structure.org/meta/extended/v0/#',
        $id: 'urn:taucad:test:parameter-cache',
        $uses: ['JSONSchemaUnits'],
        name: 'ParameterCacheTest',
        type: 'object',
        properties: { width: { type: 'double' } },
      },
      defaults: { width },
    },
    scope: { kind: 'source', authority: 'test', root: '', entry: 'main.ts' },
    source: { id: 'test-kernel', version: '1', revision: dependency, capability: 'json-structure' },
    dependency,
    middleware: middlewareIdentity,
    resolution: {},
  }),
  issues: [],
});
const failureResult = (): GetParametersResult => ({
  success: false,
  issues: [{ type: 'kernel', severity: 'error', code: 'RUNTIME', message: 'No parameters' }],
});

describe('parameterCache', () => {
  let middleware: Awaited<ReturnType<typeof resolveMiddleware>>;

  beforeEach(async () => {
    middleware = await resolveMiddleware();
  });

  it('declares the CAS-backed middleware identity', () => {
    expect(middleware).toMatchObject({ name: 'ParameterCache', version: '3.0.0' });
  });

  it('reuses successful extraction with value ownership and telemetry', async () => {
    const runtime = createMockRuntime();
    const input = { entryPath: createMockInput().entryPath };
    const handler = vi.fn(async () => successResult());

    const first = await middleware.wrapGetParameters!(input, handler, runtime);
    const second = await middleware.wrapGetParameters!(input, handler, runtime);

    expect(handler).toHaveBeenCalledOnce();
    expect(second.success && second.data.defaults).toEqual({ width: 10 });
    expect(second).not.toBe(first);
    expect(second.success && first.success && second.data).not.toBe(first.success ? first.data : undefined);
    expect(runtime.logger.debug).toHaveBeenNthCalledWith(1, expect.stringContaining('computed'));
    expect(runtime.logger.debug).toHaveBeenNthCalledWith(2, expect.stringContaining('cache'));
    expect(runtime.tracer.startSpan).toHaveBeenCalledWith('cache.parameter.evaluate');
  });

  it('does not publish failed extraction', async () => {
    const runtime = createMockRuntime();
    const handler = vi.fn(async () => failureResult());
    const input = { entryPath: 'main.ts' };

    await middleware.wrapGetParameters!(input, handler, runtime);
    await middleware.wrapGetParameters!(input, handler, runtime);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('misses when the parameter semantic identity changes', async () => {
    const runtime = createMockRuntime();
    let width = 10;
    const handler = vi.fn(async () => successResult(width));
    const input = { entryPath: 'main.ts' };

    const first = await middleware.wrapGetParameters!(input, handler, runtime);
    width = 20;
    runtime.dependencyHash = 'b'.repeat(64);
    const second = await middleware.wrapGetParameters!(input, handler, runtime);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(first.success && first.data.defaults).toEqual({ width: 10 });
    expect(second.success && second.data.defaults).toEqual({ width: 20 });
  });

  it('rejects a malformed parameter semantic identity before invoking extraction', async () => {
    const runtime = createMockRuntime({ dependencyHash: 'not-a-digest' });
    const handler = vi.fn(async () => successResult());

    await expect(middleware.wrapGetParameters!({ entryPath: 'main.ts' }, handler, runtime)).rejects.toThrow(
      'parameter semantic hash',
    );
    expect(handler).not.toHaveBeenCalled();
  });
});
