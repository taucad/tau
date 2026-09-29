import type { EvaluateResult } from '@taucad/runtime/types';
import { defineMiddleware } from '@taucad/runtime/middleware';
import { z } from 'zod';

const cache = new Map<string, EvaluateResult>();

export const myCache = defineMiddleware({
  id: 'my-cache',
  name: 'MyCache',
  stateSchema: z.object({ cacheKey: z.string().optional() }),
  async wrapEvaluate(input, handler, { state, dependencyHash }) {
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
