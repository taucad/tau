import { modelFamilySchema, providerIdSchema } from '#schemas/provider.schema.js';

/** AI model providers, derived from the canonical schema. @public */
export const modelProviders = providerIdSchema.options;

/** AI model families, derived from the canonical schema. @public */
export const modelFamilies = modelFamilySchema.options;
