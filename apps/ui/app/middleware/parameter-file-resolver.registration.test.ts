import { describe, expect, it } from 'vitest';
import { resolveRuntimeDefinition } from '@taucad/runtime/worker';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/testing';
import { parameterFileResolver } from '#middleware/parameter-file-resolver.middleware.js';
import * as parameterFileResolverModule from '#middleware/parameter-file-resolver.middleware.js';
import { runtime } from '#runtime/ui-runtime.definition.js';

describe('parameterFileResolver plugin registration', () => {
  const moduleUrlProperty = 'moduleUrl';

  it('exposes named middleware only from the implementation module', () => {
    expect(parameterFileResolverModule.parameterFileResolver).toEqual(expect.any(Function));
    expect(Object.hasOwn(parameterFileResolverModule, 'default')).toBe(false);
  });

  it('keeps implementation details out of the public client registration', () => {
    const registration = parameterFileResolver();

    expect(registration).toMatchObject({ id: 'parameterFileResolver' });
    expect(registration).not.toHaveProperty(moduleUrlProperty);
    expect(registration).not.toHaveProperty('createModule');
  });

  it('is present in the worker-owned UI runtime with geometry hooks intact', async () => {
    const resolvedRuntime = await resolveRuntimeDefinition(runtime, {
      tauApiUrl: 'http://localhost:4000',
      tauWebSocketUrl: 'ws://localhost:4001',
    });

    expect(resolvedRuntime.middleware.map((middleware) => middleware.id)).toContain('parameterFileResolver');
    const parameterFileResolverMiddleware = await resolveRuntimePluginDefinition('middleware', parameterFileResolver());
    expect(parameterFileResolverMiddleware.name).toBe('parameter-file-resolver');
    expect(parameterFileResolverMiddleware.getDependencies).toEqual(expect.any(Function));
    expect(parameterFileResolverMiddleware.wrapCreateGeometry).toEqual(expect.any(Function));
  });
});
