/**
 * Feature Flag Runtime
 *
 * Reads/writes flag overrides from localStorage and resolves each flag
 * through the zod schema defined in flag.constants.ts, which guarantees
 * type-safe values with automatic fallback for missing or corrupt entries.
 *
 * Usage (non-React):
 *   import { isFeatureEnabled } from '#flags/feature-flags.js';
 *   if (isFeatureEnabled('tauDebug')) { … }
 *
 * For React components prefer the `useFeature` hook instead.
 */

import type { FeatureFlagName, FeatureFlags } from '#flags/flag.constants.js';
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
      if (!flagRegistry[name].showInExperimental || (name === 'webGpu' && record['webGpuPreferenceVersion'] !== 1)) {
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

/**
 * Parse raw localStorage JSON through the zod schema.
 * Invalid / missing keys silently fall back to their registered defaults.
 */
export function resolveFlags(storage?: MinimalReadStorage): FeatureFlags {
  try {
    const store = storage ?? getDefaultStorage();
    if (!store) {
      return featureFlagDefaults;
    }

    return featureFlagsSchema.parse(readOverrides(store));
  } catch {
    return featureFlagDefaults;
  }
}

let cachedFlags: FeatureFlags | undefined;

function getFlags(storage?: MinimalReadStorage): FeatureFlags {
  if (storage) {
    return resolveFlags(storage);
  }

  cachedFlags ??= resolveFlags();
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
