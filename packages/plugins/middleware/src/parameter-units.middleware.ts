import { z } from 'zod';
import { inferParameterManifest } from '@taucad/parameters';
import { defineMiddleware } from '@taucad/runtime/middleware';

/** Infer bounded parameter-unit semantics while preserving producer values and declarations. @public */
export const parameterUnits = defineMiddleware({
  id: 'parameterUnits',
  name: 'ParameterUnits',
  version: '2.1.0',
  optionsSchema: z.object({
    angleDefault: z.enum(['deg', 'rad']).default('deg'),
  }),

  async wrapGetParameters(input, handler, { options }) {
    const result = await handler(input);
    if (!result.success || input.resolution?.mode === 'declared-only') {
      return result;
    }
    const language = input.resolution?.inferenceLanguage ?? 'en';
    if (!/^en(?:-|$)/iu.test(language)) {
      return result;
    }
    return {
      ...result,
      data: await inferParameterManifest(result.data, { angleDefault: options.angleDefault, language }),
    };
  },
});
