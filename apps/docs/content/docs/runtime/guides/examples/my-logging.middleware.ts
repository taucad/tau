import { defineMiddleware } from '@taucad/runtime/middleware';
import { z } from 'zod';

export const myLogging = defineMiddleware({
  id: 'my-logging',
  name: 'MyLogging',
  optionsSchema: z.object({ enabled: z.boolean().default(true) }),
  async wrapEvaluate(input, next, { logger, options }) {
    const result = await next(input);
    if (options.enabled) logger.debug('Evaluation completed');
    return result;
  },
});
