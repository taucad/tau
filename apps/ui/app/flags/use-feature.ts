/**
 * React hook for feature flags.
 *
 * Wraps the flag runtime in a `useSyncExternalStore` so components
 * re-render when overrides change, and when PostHog evaluates, re-evaluates
 * or overrides a PostHog-backed flag (`#flags/remote-flags`). The server
 * snapshot is always the registry defaults, so SSR and hydration never show a
 * flagged surface on; PostHog values arrive only after hydration.
 *
 * `useFeature` reads a local flag as a boolean. `useFeatureState` reads any
 * flag as `on`, `off` or `unknown`: `unknown` in the server render and while
 * hydrating, and for a PostHog-backed flag until PostHog has answered or no
 * answer will come. A PostHog-backed flag has only the three-valued reader, so a
 * guard that redirects, unmounts or writes on "off" cannot fire on "not known".
 */

import { useCallback, useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';
import type {
  FeatureFlagName,
  FeatureFlags,
  FeatureFlagState,
  FeatureFlagStates,
  LocalFeatureFlagName,
  LocalFeatureFlags,
} from '#flags/flag.constants.js';
import { featureFlagDefaults, featureFlagNames } from '#flags/flag.constants.js';
import { getAllFlags, readFeatureStates, setFlagOverrides, resetFlagCache } from '#flags/feature-flags.js';
import { subscribeRemoteFlags } from '#flags/remote-flags.js';

type FlagStore = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): LocalFeatureFlags;
  getServerSnapshot(): LocalFeatureFlags;
  getStates(): FeatureFlagStates;
  getServerStates(): FeatureFlagStates;
};

const flagTopic = new Topic<void>({ name: 'feature-flags' });

/** Nothing is known before the client has its own values: the server render and hydration. */
const unknownFlagStates: FeatureFlagStates = Object.fromEntries(
  featureFlagNames.map((name) => [name, 'unknown']),
) as Record<FeatureFlagName, FeatureFlagState>;

const defaultLocalFlags: LocalFeatureFlags = featureFlagDefaults satisfies FeatureFlags;

let snapshot = getAllFlags();
let states = readFeatureStates();

const flagStore: FlagStore = {
  subscribe(listener) {
    return flagTopic.subscribe(listener);
  },
  getSnapshot() {
    return snapshot;
  },
  getServerSnapshot() {
    return defaultLocalFlags;
  },
  getStates() {
    return states;
  },
  getServerStates() {
    return unknownFlagStates;
  },
};

function refreshSnapshot(): void {
  resetFlagCache();
  snapshot = getAllFlags();
  states = readFeatureStates();
  flagTopic.emit();
}

// One module-lifetime listener: PostHog evaluations refresh the shared snapshot before subscribers read it.
subscribeRemoteFlags(refreshSnapshot);

/**
 * Hear of any flag change outside React (an override here, or a PostHog evaluation); read the value with
 * `isFeatureEnabled`.
 *
 * @param listener - Called after the shared snapshot is refreshed.
 * @returns The unsubscribe.
 */
export const subscribeFeatureFlags = (listener: () => void): (() => void) => flagStore.subscribe(listener);

/**
 * Read a single local feature flag. Re-renders when the flag value changes. A PostHog-backed flag is read with
 * {@link useFeatureState}.
 */
export function useFeature(flag: LocalFeatureFlagName): boolean {
  const flags = useSyncExternalStore(flagStore.subscribe, flagStore.getSnapshot, flagStore.getServerSnapshot);
  return flags[flag];
}

/**
 * Read a flag as `on`, `off` or `unknown`. Re-renders when its state changes. `unknown` holds in the server render and
 * while hydrating, and for a PostHog-backed flag until PostHog has answered or no answer will come: a surface shows
 * only on `on`, and a redirect, unmount or write that follows "off" waits for `off`.
 *
 * @param flag - The flag.
 * @returns Its state.
 */
export function useFeatureState(flag: FeatureFlagName): FeatureFlagState {
  return useSyncExternalStore(flagStore.subscribe, flagStore.getStates, flagStore.getServerStates)[flag];
}

/**
 * Read all resolved local flags. Re-renders when any flag changes.
 */
export function useFeatureFlags(): LocalFeatureFlags {
  return useSyncExternalStore(flagStore.subscribe, flagStore.getSnapshot, flagStore.getServerSnapshot);
}

/**
 * Returns a setter that persists a local flag override and notifies subscribers. A PostHog-backed flag never reads a
 * stored override.
 */
export function useSetFeatureFlag(): (flag: LocalFeatureFlagName, value: boolean) => void {
  return useCallback((flag: LocalFeatureFlagName, value: boolean) => {
    setFlagOverrides({ [flag]: value });
    refreshSnapshot();
  }, []);
}
