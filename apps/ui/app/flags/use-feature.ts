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
 * answer will come; a failed flag load stays `unknown`. A PostHog-backed flag has
 * only the three-valued reader, so a guard that redirects, unmounts or writes on
 * "off" cannot fire on "not known". `useFeatureGate` gates a page on a flag: it
 * waits, fails open on a failed load and, once open, stays open.
 */

import { useCallback, useState, useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';
import type {
  FeatureFlagAnswer,
  FeatureFlagName,
  FeatureFlags,
  FeatureFlagState,
  FeatureGate,
  LocalFeatureFlagName,
  LocalFeatureFlags,
} from '#flags/flag.constants.js';
import { featureFlagDefaults } from '#flags/flag.constants.js';
import {
  getAllFlags,
  readFeatureAnswer,
  readFeatureState,
  setFlagOverrides,
  resetFlagCache,
} from '#flags/feature-flags.js';
import { subscribeRemoteFlags } from '#flags/remote-flags.js';

type FlagStore = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): LocalFeatureFlags;
  getServerSnapshot(): LocalFeatureFlags;
};

const flagTopic = new Topic<void>({ name: 'feature-flags' });

const defaultLocalFlags: LocalFeatureFlags = featureFlagDefaults satisfies FeatureFlags;

let snapshot = getAllFlags();

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
};

/** Nothing is known before the client has its own values: the server render and hydration. */
const getServerFlagState = (): FeatureFlagState => 'unknown';
const getServerFlagAnswer = (): FeatureFlagAnswer => 'pending';

function refreshSnapshot(): void {
  resetFlagCache();
  snapshot = getAllFlags();
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
  return useSyncExternalStore(flagStore.subscribe, () => readFeatureState(flag), getServerFlagState);
}

/**
 * Gate a page or step on a flag, for a consumer whose "off" cannot be undone (a redirect away from a deep link).
 *
 * - `waiting` in the server render, while hydrating, and while PostHog's answer is still coming: show a placeholder.
 * - `closed` on an answered (or decided) `off` before the gate opened: act on it.
 * - `open` on `on`, and on a failed flag load, which decided nothing about the visitor: the gate fails open, with no
 *   error shown. The wait is therefore bounded by posthog-js giving up on `/flags` (its request timeout times one plus
 *   its retries) or by the SDK failing to load.
 *
 * Once open, the gate stays open for the life of the component: a later answer (PostHog's background refresh after a
 * failed load, or a re-evaluation) never closes what the person is already looking at.
 *
 * @param flag - The flag.
 * @returns The gate.
 */
export function useFeatureGate(flag: FeatureFlagName): FeatureGate {
  const answer = useSyncExternalStore(flagStore.subscribe, () => readFeatureAnswer(flag), getServerFlagAnswer);
  const isOpenNow = answer === 'on' || answer === 'failed';
  const [hasOpened, setHasOpened] = useState(false);
  if (isOpenNow && !hasOpened) {
    // Remember it across renders, so a later `off` cannot close the gate (React's "information from previous renders").
    setHasOpened(true);
  }
  if (isOpenNow || hasOpened) {
    return 'open';
  }
  return answer === 'off' ? 'closed' : 'waiting';
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
