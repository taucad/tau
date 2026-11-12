/**
 * Remote (PostHog) flag source.
 *
 * A registry entry with a `posthogKey` takes its value from that PostHog feature flag once the PostHog client has
 * evaluated flags. The client exists only while the host admits analytics (accepted cookie consent on the web, Data
 * controls on the desktop), so without a key, before evaluation, or after a withdrawal this source holds nothing and
 * the registry default applies. Values come from the client's evaluated variants, which already include
 * `posthog.featureFlags.overrideFeatureFlags(...)` overrides, and are read without `getFeatureFlag`, so reading a
 * flag never captures a `$feature_flag_called` event.
 */

import { Topic } from '@taucad/events';
import type { FeatureFlagName, FlagDefinition } from '#flags/flag.constants.js';
import { featureFlagNames, flagRegistry } from '#flags/flag.constants.js';

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

/** The evaluated PostHog values, or `undefined` while no client has evaluated flags. */
export function readRemoteFlagValues(): RemoteFlagValues | undefined {
  return values;
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
