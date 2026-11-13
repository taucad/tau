/**
 * React hook for feature flags.
 *
 * Wraps the flag runtime in a `useSyncExternalStore` so components
 * re-render when overrides change, and when PostHog evaluates, re-evaluates
 * or overrides a PostHog-backed flag (`#flags/remote-flags`). The server
 * snapshot is always the registry defaults, so SSR and hydration never show a
 * flagged surface on; PostHog values arrive only after hydration.
 *
 * A flag that decides first-paint geometry (`affectsLayout`) is read with
 * `useLayoutFlag` instead: the server and the hydrating render take its value
 * from the `layout-flags` cookie the request carried, which this module keeps
 * equal to the flag's settled value on the client (`#flags/layout-flags`).
 */

import { useCallback, useContext, useSyncExternalStore } from 'react';
import { UNSAFE_DataRouterStateContext as DataRouterStateContext } from 'react-router';
import { Topic } from '@taucad/events';
import type { FeatureFlagName, FeatureFlags, FlagDefinition, LayoutFlagName } from '#flags/flag.constants.js';
import { featureFlagDefaults, flagRegistry, layoutFlagNames } from '#flags/flag.constants.js';
import { getAllFlags, setFlagOverrides, resetFlagCache } from '#flags/feature-flags.js';
import { readRemoteFlagStatus, subscribeRemoteFlags } from '#flags/remote-flags.js';
import type { LayoutFlagValues } from '#flags/layout-flags.js';
import { writeLayoutFlagsCookie } from '#flags/layout-flags.js';

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

/**
 * The layout flags whose values can no longer change without a later event: a flag with no PostHog key always, a
 * PostHog-backed one once the remote source has evaluated or is absent.
 *
 * @returns The settled values, by name.
 */
export function readSettledLayoutFlags(): LayoutFlagValues {
  const isRemoteSettled = readRemoteFlagStatus() !== 'pending';
  const settled: Partial<Record<LayoutFlagName, boolean>> = {};
  for (const name of layoutFlagNames) {
    const definition: FlagDefinition = flagRegistry[name];
    if (definition.posthogKey === undefined || isRemoteSettled) {
      settled[name] = snapshot[name];
    }
  }
  return settled;
}

const mirrorLayoutFlags = (): void => {
  writeLayoutFlagsCookie(readSettledLayoutFlags());
};

// One module-lifetime listener: PostHog evaluations refresh the shared snapshot before subscribers read it.
subscribeRemoteFlags(refreshSnapshot);

/* In a document, every settled layout flag, and every later change, rides the next request (H2). */
if (typeof document !== 'undefined') {
  mirrorLayoutFlags();
  flagTopic.subscribe(mirrorLayoutFlags);
}

/**
 * Hear of any flag change outside React (an override here, or a PostHog evaluation); read the value with
 * `isFeatureEnabled`.
 *
 * @param listener - Called after the shared snapshot is refreshed.
 * @returns The unsubscribe.
 */
export const subscribeFeatureFlags = (listener: () => void): (() => void) => flagStore.subscribe(listener);

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

/** What the root loader hands a layout flag: the values the request's `layout-flags` cookie carried. */
type LayoutFlagsLoaderData = {
  readonly layoutFlags?: LayoutFlagValues;
};

/**
 * Read a layout-affecting flag (`affectsLayout` in the registry) so that the server and the client agree on it.
 *
 * The server and the hydrating render read the value the request's `layout-flags` cookie carried, through the root
 * loader's data. After hydration the client reads the settled value, else that same cookie value. With no cookie for
 * the flag, or no root loader (the desktop and SPA builds), the value is unknown until it settles.
 *
 * @param flag - The layout flag.
 * @returns The value, or `undefined` while it is unknown.
 */
export function useLayoutFlag(flag: LayoutFlagName): boolean | undefined {
  const rootData = useContext(DataRouterStateContext)?.loaderData['root'] as LayoutFlagsLoaderData | undefined;
  const remembered = rootData?.layoutFlags?.[flag];
  const getSnapshot = useCallback(() => readSettledLayoutFlags()[flag] ?? remembered, [flag, remembered]);
  const getServerSnapshot = useCallback(() => remembered, [remembered]);
  return useSyncExternalStore(flagStore.subscribe, getSnapshot, getServerSnapshot);
}
