/**
 * Remote (PostHog) flag source.
 *
 * A registry entry with a `posthogKey` takes its value from that PostHog feature flag once the PostHog client has
 * evaluated flags. The client exists only while the host admits analytics (accepted cookie consent on the web, Data
 * controls on the desktop), so without a key, before evaluation, or after a withdrawal this source holds nothing and
 * the registry default applies. Values come from the client's evaluated variants, which already include
 * `posthog.featureFlags.overrideFeatureFlags(...)` overrides, and are read without `getFeatureFlag`, so reading a
 * flag never captures a `$feature_flag_called` event.
 *
 * End-to-end suites name a flag state instead (blueprint FL4): in an undeployed debug build (`TAU_DEBUG` on and no
 * `TAU_DEPLOY_CONTEXT`, which is how `apps/ui-e2e` and `apps/desktop-e2e` start the app), PostHog flag variants
 * seeded on {@link seededFlagStateGlobal} before the page's scripts run replace the PostHog client's values for the
 * life of the page. A deployed build never reads the global, and nothing stores it, so no device can override a flag
 * this way.
 */

import { Topic } from '@taucad/events';
import type { FeatureFlagName, FlagDefinition } from '#flags/flag.constants.js';
import { featureFlagNames, flagRegistry, resolveTauDebugDefault } from '#flags/flag.constants.js';
import { ENV } from '#environment.config.js';

/** Evaluated values of the PostHog-backed flags, by registry name. A flag PostHog did not return is absent. */
export type RemoteFlagValues = Readonly<Partial<Record<FeatureFlagName, boolean>>>;

/** The part of the PostHog client this source reads. */
export type RemoteFlagClient = {
  readonly featureFlags?: { getFlagVariants(): Record<string, string | boolean> } | undefined;
  onFeatureFlags(callback: () => void): (() => void) | undefined;
};

const remoteFlagTopic = new Topic<void>({ name: 'remote-feature-flags' });

let values: RemoteFlagValues | undefined;
let disconnectClient: (() => void) | undefined;

/** Each PostHog-backed registry name with its PostHog flag key. */
const remoteFlagKeys: ReadonlyArray<readonly [FeatureFlagName, string]> = featureFlagNames.flatMap((name) => {
  const definition: FlagDefinition = flagRegistry[name];
  return definition.posthogKey === undefined ? [] : [[name, definition.posthogKey] as const];
});

/** Project the client's variants onto the registry: a variant string counts as enabled. */
function project(variants: Record<string, string | boolean>): RemoteFlagValues {
  const projected: Partial<Record<FeatureFlagName, boolean>> = {};
  for (const [name, key] of remoteFlagKeys) {
    const value = variants[key];
    if (typeof value === 'boolean' || typeof value === 'string') {
      projected[name] = value !== false;
    }
  }
  return projected;
}

/**
 * The global an end-to-end init script seeds with PostHog flag variants, keyed by PostHog flag key
 * (`apps/ui-e2e/src/support/flag-state.ts`).
 */
export const seededFlagStateGlobal = '__TAU_E2E_POSTHOG_FLAGS__';

/** Whether this build honours a seeded flag state: an undeployed debug build only. */
export const isSeededFlagSourceAllowed: boolean = resolveTauDebugDefault({
  isDebugEnvironment: ENV.TAU_DEBUG,
  deployContext: ENV.TAU_DEPLOY_CONTEXT,
});

/**
 * Project a seeded flag state onto the registry, the same way PostHog's variants are.
 *
 * @param seed - The value an init script put on {@link seededFlagStateGlobal}.
 * @returns The values, or `undefined` when nothing usable was seeded.
 */
export function projectSeededFlags(seed: unknown): RemoteFlagValues | undefined {
  if (seed === null || typeof seed !== 'object' || Array.isArray(seed)) {
    return undefined;
  }
  return project(seed as Record<string, string | boolean>);
}

/** Read once, when the module loads: a flag state is fixed for the life of the page. */
const seededValues: RemoteFlagValues | undefined = isSeededFlagSourceAllowed
  ? projectSeededFlags((globalThis as Record<string, unknown>)[seededFlagStateGlobal])
  : undefined;

function isSame(a: RemoteFlagValues | undefined, b: RemoteFlagValues | undefined): boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  return remoteFlagKeys.every(([name]) => a[name] === b[name]);
}

function update(next: RemoteFlagValues | undefined): void {
  if (isSame(values, next)) {
    return;
  }
  values = next;
  remoteFlagTopic.emit();
}

/**
 * The evaluated PostHog values, or `undefined` while no client has evaluated flags. A seeded end-to-end flag state,
 * where the build honours one, takes their place.
 */
export function readRemoteFlagValues(): RemoteFlagValues | undefined {
  return seededValues ?? values;
}

/** Listen for changes to the remote values; returns the unsubscribe. */
export function subscribeRemoteFlags(listener: () => void): () => void {
  return remoteFlagTopic.subscribe(listener);
}

/**
 * Follow a PostHog client's evaluated flags until {@link disconnectRemoteFlags}. Called by the analytics boundary
 * once the host admits analytics; replaces any earlier client.
 *
 * @param client - The initialised PostHog singleton.
 */
export function connectRemoteFlags(client: RemoteFlagClient): void {
  disconnectRemoteFlags();
  const read = (): void => {
    const variants = client.featureFlags?.getFlagVariants();
    if (variants !== undefined) {
      update(project(variants));
    }
  };
  try {
    // `onFeatureFlags` also calls back at once when flags have already loaded.
    const unsubscribe = client.onFeatureFlags(read);
    disconnectClient = typeof unsubscribe === 'function' ? unsubscribe : undefined;
  } catch {
    // Optional analytics must not prevent the product from opening; defaults stay in force.
    disconnectClient = undefined;
  }
}

/** Stop following the client and return every PostHog-backed flag to its registry default. */
export function disconnectRemoteFlags(): void {
  disconnectClient?.();
  disconnectClient = undefined;
  update(undefined);
}
