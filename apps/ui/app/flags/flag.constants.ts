import { z } from 'zod';
import { ENV } from '#environment.config.js';

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

/**
 * Resolve the boolean default for `tauDebug` from the runtime environment
 * (`TAU_DEBUG=1|true`). The env var is the source of truth (drives e2e and
 * deployment toggling); a localStorage override still wins because the
 * default only fires when no override is stored.
 */
const tauDebugDefault = Boolean(ENV.TAU_DEBUG);

export const flagRegistry = {
  planMode: {
    schema: z.boolean().default(false),
    label: 'Planning Mode',
    description: 'Show mode selector and plan viewer in chat.',
  },
  pluginsStore: {
    schema: z.boolean().default(false),
    label: 'Plugins Store',
    description: 'Expose the plugin and skill store while it is under development.',
  },
  tauDebug: {
    schema: z.boolean().default(tauDebugDefault),
    label: 'Tau Debug',
    description: 'Enable in-app debug surfaces (e2e diagnostic panels, geometry inspectors).',
  },
  marketingLanding: {
    schema: z.boolean().default(false),
    label: 'Marketing Landing',
    description:
      'Render the marketing landing page for signed-out visitors and the project library for signed-in users on the home route.',
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
