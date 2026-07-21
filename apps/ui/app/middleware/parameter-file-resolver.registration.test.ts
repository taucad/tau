import { describe, expect, it } from 'vitest';
import { resolveRuntimeDefinition } from '@taucad/runtime/worker';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/testing';
import { parameterFileResolver } from '@taucad/runtime/middleware';
import * as parameterFileResolverModule from '@taucad/runtime/middleware/parameter-file-resolver';
import { runtime } from '#runtime/ui-runtime.definition.js';

describe('parameterFileResolver plugin registration', () => {
  const moduleUrlProperty = 'moduleUrl';

  it('should expose only the named middleware from the implementation module', () => {
    expect(Object.keys(parameterFileResolverModule)).toEqual(['parameterFileResolver']);
  });

  it('should keep implementation details out of the public client registration', () => {
    const registration = parameterFileResolver();

    expect(registration).toMatchObject({ id: 'parameterFileResolver' });
    expect(registration).not.toHaveProperty(moduleUrlProperty);
    expect(registration).not.toHaveProperty('createModule');
  });

  it('should register geometry hooks in the worker-owned UI runtime', async () => {
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
