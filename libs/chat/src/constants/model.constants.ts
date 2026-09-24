import { modelFamilySchema, providerIdSchema } from '#schemas/provider.schema.js';

/** AI model providers, derived from the canonical schema. @public */
export const modelProviders = providerIdSchema.options;

/** AI model families, derived from the canonical schema. @public */
export const modelFamilies = modelFamilySchema.options;

/**
 * Reasoning levels a Tau model can run at, ascending.
 *
 * One vocabulary for the catalog's `support.reasoning.levels`, the chat's
 * persisted choice and the portable host's admitted effort. `minimal` is
 * deliberately absent: `low` is the floor on every provider Tau sends a level
 * to, so the menu never offers a value only some codecs accept.
 *
 * @public
 */
export const reasoningLevels = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

/** One of {@link reasoningLevels}. @public */
export type ReasoningLevel = (typeof reasoningLevels)[number];
