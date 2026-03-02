import { z } from 'zod';

/**
 * Feature Flag Registry
 *
 * Central source of truth for all feature flags. Each flag is defined with:
 *  - a zod schema (always `z.boolean()` with a default)
 *  - a human-readable label and description for the settings UI
 *
 * To add a new flag, add an entry to `flagRegistry` — everything else
 * (types, validation, settings panel) derives from it automatically.
 */

export type FlagDefinition = {
  readonly schema: z.ZodDefault<z.ZodBoolean>;
  readonly label: string;
  readonly description: string;
};

export const flagRegistry = {
  planMode: {
    schema: z.boolean().default(false),
    label: 'Planning Mode',
    description: 'Show mode selector and plan viewer in chat.',
  },
} as const satisfies Record<string, FlagDefinition>;

export type FeatureFlagName = keyof typeof flagRegistry;

export const featureFlagNames = Object.keys(flagRegistry) as FeatureFlagName[];

/**
 * Zod object schema built from the registry.
 * Parsing unknown data through this guarantees every key exists and is a
 * boolean, falling back to the registered default for missing / invalid values.
 */
export const featureFlagsSchema = z.object(
  Object.fromEntries(featureFlagNames.map((name) => [name, flagRegistry[name].schema])) as {
    [K in FeatureFlagName]: (typeof flagRegistry)[K]['schema'];
  },
);

export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

/**
 * Resolved defaults (all flags at their default values).
 * Useful as a fallback when storage is unavailable.
 */
export const featureFlagDefaults: FeatureFlags = featureFlagsSchema.parse({});

export const featureFlagStorageKey = 'tau:flags';
