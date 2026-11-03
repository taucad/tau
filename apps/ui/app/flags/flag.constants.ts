import { z } from 'zod';
import { isMachinesFeatureEnabled } from '@taucad/types/constants';
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
  /** Whether users can discover and override this flag in Experimental settings. */
  readonly showInExperimental: boolean;
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
  machines: {
    schema: z.boolean().default(isMachinesFeatureEnabled(ENV.TAU_MACHINES_ENABLED)),
    showInExperimental: false,
    label: 'Machines',
    description: 'Connect machines and use the Print workbench',
  },
  automaticReload: {
    schema: z.boolean().default(false),
    showInExperimental: false,
    label: 'Automatic reload',
    description: 'Show automatic credit reload controls in Billing',
  },
  partsWarehouse: {
    showInExperimental: false,
    schema: z.boolean().default(false),
    label: 'Parts warehouse',
    description: 'Browse and remix reusable parametric parts',
  },
  webGpu: {
    showInExperimental: true,
    schema: z.boolean().default(true),
    label: 'Prefer WebGPU',
    description: 'Falls back to WebGL2 when WebGPU is unavailable',
  },
  webGpuShaderStacks: {
    showInExperimental: false,
    schema: z.boolean().default(false),
    label: 'WebGPU shader stacks',
    description: 'Capture shader source stacks for diagnostics. This slows large model loading substantially.',
  },
  webGpuInspector: {
    showInExperimental: false,
    schema: z.boolean().default(false),
    label: 'WebGPU inspector',
    description: 'Load the Three.js pipeline inspector for WebGPU diagnostics',
  },
  modelPinning: {
    showInExperimental: false,
    schema: z.boolean().default(false),
    label: 'Model pinning',
    description: 'Pin models to the top of the model selector',
  },
  pluginsStore: {
    showInExperimental: false,
    schema: z.boolean().default(false),
    label: 'Plugin store',
    description: 'Browse plugins and skills',
  },
  tauDebug: {
    showInExperimental: true,
    schema: z.boolean().default(tauDebugDefault),
    label: 'Debug tools',
    description: 'Show diagnostic panels and geometry inspectors',
  },
} as const satisfies Record<string, FlagDefinition>;

export type FeatureFlagName = keyof typeof flagRegistry;

export const featureFlagNames = Object.keys(flagRegistry) as FeatureFlagName[];

export const experimentalFeatureFlagNames = featureFlagNames.filter((name) => flagRegistry[name].showInExperimental);

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
