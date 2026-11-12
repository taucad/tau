/**
 * Feature Flag Runtime
 *
 * Reads/writes flag overrides from localStorage and resolves each flag
 * through the zod schema defined in flag.constants.ts, which guarantees
 * type-safe values with automatic fallback for missing or corrupt entries.
 *
 * Resolution order per flag:
 *  1. a flag with a `posthogKey` takes PostHog's evaluated value once the
 *     PostHog client has evaluated flags (`#flags/remote-flags`);
 *  2. otherwise a stored override, for any flag without a `posthogKey` or
 *     `localOverride: false` (hidden flags included, for console opt-in);
 *  3. otherwise the registry default.
 * A flag with `requires` is then off whenever the flag it names is off.
 *
 * Usage (non-React):
 *   import { isFeatureEnabled } from '#flags/feature-flags.js';
 *   if (isFeatureEnabled('tauDebug')) { … }
 *
 * For React components prefer the `useFeature` hook instead.
 */

import type { FeatureFlagName, FeatureFlags, FlagDefinition } from '#flags/flag.constants.js';
import type { RemoteFlagValues } from '#flags/remote-flags.js';
import { isSeededFlagSourceAllowed, readRemoteFlagValues } from '#flags/remote-flags.js';
import {
  featureFlagsSchema,
  featureFlagDefaults,
  featureFlagStorageKey,
  featureFlagNames,
  flagRegistry,
} from '#flags/flag.constants.js';

type MinimalReadStorage = Pick<Storage, 'getItem'>;
type MinimalStorage = Pick<Storage, 'getItem' | 'setItem'>;

function getDefaultStorage(): MinimalStorage | undefined {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    return globalThis.localStorage;
  }

  return undefined;
}

/**
 * Old writes saved the entire resolved map, including the former WebGPU=false default.
 * That format cannot distinguish an opt-out from an incidental snapshot. Refresh that
 * one legacy preference once; versioned explicit choices continue to win thereafter.
 */
function readOverrides(store: MinimalReadStorage): Partial<FeatureFlags> {
  try {
    const parsed: unknown = JSON.parse(store.getItem(featureFlagStorageKey) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const record = parsed as Record<string, unknown>;
    const overrides: Partial<FeatureFlags> = {};
    for (const name of featureFlagNames) {
      const definition: FlagDefinition = flagRegistry[name];
      if (
        definition.posthogKey !== undefined ||
        definition.localOverride === false ||
        (name === 'webGpu' && record['webGpuPreferenceVersion'] !== 1)
      ) {
        continue;
      }
      const value = record[name];
      if (typeof value === 'boolean') {
        overrides[name] = value;
      }
    }
    return overrides;
  } catch {
    return {};
  }
}

/** Apply PostHog's evaluated values, then switch off every flag whose `requires` flag is off. */
function applyRemoteAndDependencies(flags: FeatureFlags, remote: RemoteFlagValues | undefined): FeatureFlags {
  const resolved: FeatureFlags = { ...flags, ...remote };
  for (const name of featureFlagNames) {
    const { requires }: FlagDefinition = flagRegistry[name];
    if (requires !== undefined && !resolved[requires as FeatureFlagName]) {
      resolved[name] = false;
    }
  }
  return resolved;
}

/**
 * Parse raw localStorage JSON through the zod schema, then apply PostHog's
 * evaluated values and flag dependencies.
 * Invalid / missing keys silently fall back to their registered defaults.
 */
export function resolveFlags(
  storage?: MinimalReadStorage,
  remote: RemoteFlagValues | undefined = readRemoteFlagValues(),
): FeatureFlags {
  let local: FeatureFlags;
  try {
    const store = storage ?? getDefaultStorage();
    local = store ? featureFlagsSchema.parse(readOverrides(store)) : featureFlagDefaults;
  } catch {
    local = featureFlagDefaults;
  }
  return applyRemoteAndDependencies(local, remote);
}

let cachedFlags: FeatureFlags | undefined;
let cachedRemote: RemoteFlagValues | undefined;

function getFlags(storage?: MinimalReadStorage): FeatureFlags {
  if (storage) {
    return resolveFlags(storage);
  }

  const remote = readRemoteFlagValues();
  if (cachedFlags === undefined || cachedRemote !== remote) {
    cachedFlags = resolveFlags(undefined, remote);
    cachedRemote = remote;
  }
  return cachedFlags;
}

/**
 * Check whether a single feature flag is enabled.
 */
export function isFeatureEnabled(flag: FeatureFlagName, storage?: MinimalReadStorage): boolean {
  return getFlags(storage)[flag];
}

/**
 * Return the full resolved flag map.
 */
export function getAllFlags(storage?: MinimalReadStorage): FeatureFlags {
  return getFlags(storage);
}

/** Reset the in-memory cache so the next call re-reads localStorage. */
export function resetFlagCache(): void {
  cachedFlags = undefined;
}

/**
 * Persist flag overrides to localStorage and reset the cache.
 */
export function setFlagOverrides(overrides: Partial<FeatureFlags>, storage?: MinimalStorage): void {
  const store = storage ?? getDefaultStorage();
  if (!store) {
    return;
  }

  const existing = readOverrides(store);
  const merged = { ...existing, ...overrides };
  store.setItem(featureFlagStorageKey, JSON.stringify({ ...merged, webGpuPreferenceVersion: 1 }));
  resetFlagCache();
}

/** The probe an end-to-end spec reads the resolved flags through (`apps/ui-e2e/src/support/flag-state.ts`). */
export const flagProbeGlobal = '__tauFeatureFlags';

/* Undeployed debug builds only (the e2e suites and local development), and only in a document. */
if (isSeededFlagSourceAllowed && typeof document !== 'undefined') {
  Object.defineProperty(globalThis, flagProbeGlobal, { configurable: true, value: () => getAllFlags() });
}
