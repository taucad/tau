/**
 * Feature Flag Runtime
 *
 * Reads/writes flag overrides from localStorage and resolves each flag
 * through the zod schema defined in flag.constants.ts, which guarantees
 * type-safe values with automatic fallback for missing or corrupt entries.
 *
 * Usage (non-React):
 *   import { isFeatureEnabled } from '#flags/feature-flags.js';
 *   if (isFeatureEnabled('planMode')) { … }
 *
 * For React components prefer the `useFeature` hook instead.
 */

import type { FeatureFlagName, FeatureFlags } from '#flags/flag.constants.js';
import { featureFlagsSchema, featureFlagDefaults, featureFlagStorageKey } from '#flags/flag.constants.js';

type MinimalReadStorage = Pick<Storage, 'getItem'>;
type MinimalStorage = Pick<Storage, 'getItem' | 'setItem'>;

function getDefaultStorage(): MinimalStorage | undefined {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    return globalThis.localStorage;
  }

  return undefined;
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

    const raw = store.getItem(featureFlagStorageKey);
    if (!raw) {
      return featureFlagDefaults;
    }

    const parsed: unknown = JSON.parse(raw);
    return featureFlagsSchema.parse(typeof parsed === 'object' && parsed !== null ? parsed : {});
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

  const existing = resolveFlags(store);
  const merged = { ...existing, ...overrides };
  store.setItem(featureFlagStorageKey, JSON.stringify(merged));
  resetFlagCache();
}
