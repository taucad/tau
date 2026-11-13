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
  /**
   * PostHog feature flag key this flag follows. Once the PostHog client has evaluated flags, its value (including a
   * console `posthog.featureFlags.overrideFeatureFlags` override) replaces the default; without a PostHog key, before
   * evaluation, or without analytics consent the default applies. See `#flags/remote-flags`.
   */
  readonly posthogKey?: string;
  /** Registry name of a flag that must also be on for this one to take effect. */
  readonly requires?: string;
  /**
   * `false` keeps the flag at its default whatever `tau:flags` stores. Otherwise a stored override applies to hidden
   * flags too, so a developer can turn one on from the console. A PostHog-backed flag never reads `tau:flags`.
   */
  readonly localOverride?: false;
};

/**
 * Resolve the boolean default for `tauDebug` (the *Debug tools* switch).
 *
 * `TAU_DEBUG=1|true` turns the switch on by default only in an undeployed
 * build (local dev and the e2e suite, which set it). A deployed site
 * (`TAU_DEPLOY_CONTEXT` set, staging included) may carry `TAU_DEBUG` for its
 * debug routes and harnesses, but users there start with debug tools off and
 * opt in from Experimental settings. A stored override always wins because the
 * default only fires when no override is stored.
 */
export function resolveTauDebugDefault({
  isDebugEnvironment,
  deployContext,
}: {
  readonly isDebugEnvironment: boolean | undefined;
  readonly deployContext: string | undefined;
}): boolean {
  return Boolean(isDebugEnvironment) && deployContext === undefined;
}

const tauDebugDefault = resolveTauDebugDefault({
  isDebugEnvironment: ENV.TAU_DEBUG,
  deployContext: ENV.TAU_DEPLOY_CONTEXT,
});

export const flagRegistry = {
  machines: {
    schema: z.boolean().default(isMachinesFeatureEnabled(ENV.TAU_MACHINES_ENABLED)),
    showInExperimental: false,
    localOverride: false,
    label: 'Machines',
    description: 'Connect machines and use the Print workbench',
  },
  automaticReload: {
    schema: z.boolean().default(false),
    showInExperimental: false,
    localOverride: false,
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
  zooCloudDispatch: {
    showInExperimental: false,
    schema: z.boolean().default(false),
    label: 'Zoo cloud dispatch',
    description:
      "Offer Zoo to automatic kernel routing. Off while Zoo's cloud dispatch is closed; the change that opens dispatch turns it on",
  },
  viewerControls: {
    showInExperimental: false,
    schema: z.boolean().default(false),
    posthogKey: 'viewer-controls',
    label: 'Viewer controls',
    description: 'Control presets, gizmo styles and Settings → Viewer',
  },
  onboarding: {
    showInExperimental: false,
    schema: z.boolean().default(false),
    posthogKey: 'onboarding',
    label: 'Onboarding',
    description: 'The setup route, the product tour and home suggestions',
  },
  onboardingAutoOpen: {
    showInExperimental: false,
    schema: z.boolean().default(false),
    posthogKey: 'onboarding-auto-open',
    requires: 'onboarding',
    label: 'Open setup on first visit',
    description: 'Open setup automatically for a person who has not finished it. Needs Onboarding',
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
