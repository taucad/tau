import { describe, expect, it } from 'vitest';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import * as publicExports from '#index.js';
import { parameterCacheDefinition } from '#parameter-cache.middleware.js';

// Public export enumeration tests the actual published names and reference identity.
const compatibilityExport: unknown = Object.entries(publicExports).find(([name]) => name === 'parameterCache')?.[1];

describe('parameter cache compatibility export', () => {
  it('should expose exactly the canonical factory under the retained public name', () => {
    expect(compatibilityExport).toBe(parameterCacheDefinition);
    expect(Object.keys(publicExports)).not.toContain('parameterCacheDefinition');
  });

  it('should keep explicit parameter-cache selection executable with its previous identity', async () => {
    const invocation = parameterCacheDefinition();
    expect(invocation.id).toBe('parameterCache');
    const selected = await resolveRuntimePluginDefinition('middleware', invocation);
    expect(selected).toMatchObject({ name: 'ParameterCache', version: '4.0.0' });
    expect(typeof selected.wrapDescribe).toBe('function');
    expect(publicExports.middleware().capabilities.middleware.map(({ id }) => id)).not.toContain('parameterCache');
    expect(publicExports.middleware({ preset: 'cache' }).capabilities.middleware.map(({ id }) => id)).toEqual([
      'geometryCache',
    ]);
  });
});
