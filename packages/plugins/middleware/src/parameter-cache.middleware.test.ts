import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { GetParametersResult } from '@taucad/runtime/types';
import { createMockInput, createMockRuntime } from '@taucad/runtime-testing';
import { parameterCache } from '#parameter-cache.middleware.js';

const resolveMiddleware = async () => resolveRuntimePluginDefinition('middleware', parameterCache());
const successResult = (): GetParametersResult => ({
  success: true,
  data: {
    defaultParameters: { width: 10 },
    jsonSchema: { type: 'object', properties: { width: { type: 'number' } } },
  },
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
    expect(middleware).toMatchObject({ name: 'ParameterCache', version: '2.0.0' });
  });

  it('reuses successful extraction with value ownership and telemetry', async () => {
    const runtime = createMockRuntime();
    const input = { entryPath: createMockInput().entryPath };
    const handler = vi.fn(async () => successResult());

    const first = await middleware.wrapGetParameters!(input, handler, runtime);
    if (first.success) {
      first.data.defaultParameters['width'] = 99;
    }
    const second = await middleware.wrapGetParameters!(input, handler, runtime);

    expect(handler).toHaveBeenCalledOnce();
    expect(second.success && second.data.defaultParameters).toEqual({ width: 10 });
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

  it('misses when the dependency identity changes', async () => {
    const runtime = createMockRuntime();
    const handler = vi.fn(async () => successResult());
    const input = { entryPath: 'main.ts' };

    await middleware.wrapGetParameters!(input, handler, runtime);
    runtime.dependencyHash = 'b'.repeat(64);
    await middleware.wrapGetParameters!(input, handler, runtime);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('rejects a malformed dependency identity before invoking extraction', async () => {
    const runtime = createMockRuntime({ dependencyHash: 'not-a-digest' });
    const handler = vi.fn(async () => successResult());

    await expect(middleware.wrapGetParameters!({ entryPath: 'main.ts' }, handler, runtime)).rejects.toThrow(
      'middleware dependency hash',
    );
    expect(handler).not.toHaveBeenCalled();
  });
});
