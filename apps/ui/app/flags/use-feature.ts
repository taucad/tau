/**
 * React hook for feature flags.
 *
 * Wraps the flag runtime in a `useSyncExternalStore` so components
 * re-render when overrides change. A future context provider can
 * inject per-user / remote overrides by supplying a custom resolver.
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { FeatureFlagName, FeatureFlags } from '#flags/flag.constants.js';
import { featureFlagDefaults } from '#flags/flag.constants.js';
import { getAllFlags, setFlagOverrides, resetFlagCache } from '#flags/feature-flags.js';

type FlagStore = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): FeatureFlags;
  getServerSnapshot(): FeatureFlags;
};

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

let snapshot = getAllFlags();

const flagStore: FlagStore = {
  subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot() {
    return snapshot;
  },
  getServerSnapshot() {
    return featureFlagDefaults;
  },
};

function refreshSnapshot(): void {
  resetFlagCache();
  snapshot = getAllFlags();
  notify();
}

/**
 * Read a single feature flag. Re-renders when the flag value changes.
 */
export function useFeature(flag: FeatureFlagName): boolean {
  const flags = useSyncExternalStore(flagStore.subscribe, flagStore.getSnapshot, flagStore.getServerSnapshot);
  return flags[flag];
}

/**
 * Read all resolved flags. Re-renders when any flag changes.
 */
export function useFeatureFlags(): FeatureFlags {
  return useSyncExternalStore(flagStore.subscribe, flagStore.getSnapshot, flagStore.getServerSnapshot);
}

/**
 * Returns a setter that persists a flag override and notifies subscribers.
 */
export function useSetFeatureFlag(): (flag: FeatureFlagName, value: boolean) => void {
  return useCallback((flag: FeatureFlagName, value: boolean) => {
    setFlagOverrides({ [flag]: value });
    refreshSnapshot();
  }, []);
}
