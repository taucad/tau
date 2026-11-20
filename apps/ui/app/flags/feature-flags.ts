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
 * Three-valued state: a PostHog-backed flag (and one that `requires` it) is `unknown` until the remote source has
 * answered or no answer will come (`readRemoteFlagStatus`). Such a flag has no boolean reader, so "not known yet" can
 * never be read as "off": read it with `readFeatureState` (or `useFeatureState`) and decide what `unknown` means at
 * the call site, or wait with `whenFeatureKnown`. A redirect, a persisted write or a one-shot decision must not act on
 * `unknown`.
 *
 * Usage (non-React):
 *   import { isFeatureEnabled, readFeatureState } from '#flags/feature-flags.js';
 *   if (isFeatureEnabled('tauDebug')) { … }
 *   if (readFeatureState('onboarding') === 'on') { … }
 *
 * For React components prefer the `useFeature` / `useFeatureState` hooks instead.
 */

import type {
  FeatureFlagName,
  FeatureFlags,
  FeatureFlagState,
  FeatureFlagStates,
  FlagDefinition,
  LocalFeatureFlagName,
  LocalFeatureFlags,
} from '#flags/flag.constants.js';
import type { RemoteFlagStatus, RemoteFlagValues } from '#flags/remote-flags.js';
import {
  isSeededFlagSourceAllowed,
  readRemoteFlagStatus,
  readRemoteFlagValues,
  subscribeRemoteFlags,
} from '#flags/remote-flags.js';
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
 * Check whether a single local feature flag is enabled. A PostHog-backed flag (`RemoteFeatureFlagName`) is not
 * accepted: its value may not be known yet, so read it with {@link readFeatureState}.
 */
export function isFeatureEnabled(flag: LocalFeatureFlagName, storage?: MinimalReadStorage): boolean {
  return getFlags(storage)[flag];
}

/**
 * Each flag's three-valued state from its resolved value and the remote source's status: a PostHog-backed flag is
 * `unknown` while the source is `pending`, and a flag that `requires` an unknown flag is `unknown` too.
 *
 * @param flags - The resolved values ({@link resolveFlags}).
 * @param status - The remote source's status.
 * @returns Every flag's state.
 */
export function resolveFlagStates(flags: FeatureFlags, status: RemoteFlagStatus): FeatureFlagStates {
  const states: Partial<Record<FeatureFlagName, FeatureFlagState>> = {};
  const stateOf = (name: FeatureFlagName): FeatureFlagState => {
    const known = states[name];
    if (known !== undefined) {
      return known;
    }
    const { posthogKey, requires }: FlagDefinition = flagRegistry[name];
    const state: FeatureFlagState =
      (posthogKey !== undefined && status === 'pending') ||
      (requires !== undefined && stateOf(requires as FeatureFlagName) === 'unknown')
        ? 'unknown'
        : flags[name]
          ? 'on'
          : 'off';
    states[name] = state;
    return state;
  };
  for (const name of featureFlagNames) {
    stateOf(name);
  }
  return states as FeatureFlagStates;
}

let cachedStates: { flags: FeatureFlags; status: RemoteFlagStatus; states: FeatureFlagStates } | undefined;

/**
 * Every flag's state now, outside React. Stable while neither the values nor the remote status change.
 *
 * @returns Every flag's state.
 */
export function readFeatureStates(): FeatureFlagStates {
  const flags = getFlags();
  const status = readRemoteFlagStatus();
  if (cachedStates?.flags !== flags || cachedStates.status !== status) {
    cachedStates = { flags, status, states: resolveFlagStates(flags, status) };
  }
  return cachedStates.states;
}

/**
 * One flag's state now, outside React: `on`, `off`, or `unknown` while its value has not arrived.
 *
 * @param flag - The flag.
 * @returns Its state.
 */
export function readFeatureState(flag: FeatureFlagName): FeatureFlagState {
  return readFeatureStates()[flag];
}

/**
 * Wait until a flag is known, for a decision that cannot be taken again later (a one-shot write).
 *
 * @param flag - The flag.
 * @returns Whether it is on, once it is `on` or `off`; at once when it already is.
 */
export async function whenFeatureKnown(flag: FeatureFlagName): Promise<boolean> {
  return new Promise((resolve) => {
    let unsubscribe: (() => void) | undefined;
    const settle = (): boolean => {
      const state = readFeatureState(flag);
      if (state === 'unknown') {
        return false;
      }
      unsubscribe?.();
      resolve(state === 'on');
      return true;
    };
    if (!settle()) {
      unsubscribe = subscribeRemoteFlags(() => {
        settle();
      });
    }
  });
}

/**
 * Return the resolved values of the local flags. The PostHog-backed flags are left out of the type: read them with
 * {@link readFeatureState}.
 */
export function getAllFlags(storage?: MinimalReadStorage): LocalFeatureFlags {
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
  Object.defineProperty(globalThis, flagProbeGlobal, { configurable: true, value: () => getFlags() });
}
