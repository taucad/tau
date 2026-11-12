/**
 * React hook for feature flags.
 *
 * Wraps the flag runtime in a `useSyncExternalStore` so components
 * re-render when overrides change, and when PostHog evaluates, re-evaluates
 * or overrides a PostHog-backed flag (`#flags/remote-flags`). The server
 * snapshot is always the registry defaults, so SSR and hydration never show a
 * flagged surface on; PostHog values arrive only after hydration.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';
import type { FeatureFlagName, FeatureFlags } from '#flags/flag.constants.js';
import { featureFlagDefaults } from '#flags/flag.constants.js';
import { getAllFlags, setFlagOverrides, resetFlagCache } from '#flags/feature-flags.js';
import { subscribeRemoteFlags } from '#flags/remote-flags.js';

type FlagStore = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): FeatureFlags;
  getServerSnapshot(): FeatureFlags;
};

const flagTopic = new Topic<void>({ name: 'feature-flags' });

let snapshot = getAllFlags();

const flagStore: FlagStore = {
  subscribe(listener) {
    return flagTopic.subscribe(listener);
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
  flagTopic.emit();
}

// One module-lifetime listener: PostHog evaluations refresh the shared snapshot before subscribers read it.
subscribeRemoteFlags(refreshSnapshot);

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
