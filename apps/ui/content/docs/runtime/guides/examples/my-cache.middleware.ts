import type { CreateGeometryResult } from '@taucad/runtime';
import { defineMiddleware } from '@taucad/runtime/middleware';
import { z } from 'zod';

const cache = new Map<string, CreateGeometryResult>();

export const myCache = defineMiddleware({
  id: 'my-cache',
  name: 'MyCache',
  stateSchema: z.object({ cacheKey: z.string().optional() }),
  async wrapCreateGeometry(input, handler, { state, dependencyHash }) {
    const cached = cache.get(dependencyHash);
    if (cached) {
      state.update({ cacheKey: dependencyHash });
      return cached;
    }
    const result = await handler(input);
    cache.set(dependencyHash, result);
    return result;
  },
});
