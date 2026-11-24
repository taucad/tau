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
 *
 * The source also says whether its values are settled ({@link readRemoteFlagStatus}): `pending` while a client is
 * connected but has not answered, `evaluated` once PostHog's values (or a seeded state) are in, `absent` when the host
 * decided no answer will come (analytics not admitted or withdrawn, or no key), so the defaults are final, and `failed`
 * when an answer was due but did not arrive (the flag load failed, or the SDK could not load or subscribe). A failed
 * load decides nothing about the visitor: PostHog keeps refreshing in the background, and a later answer moves the
 * source to `evaluated` (F2d).
 *
 * Only a decision publishes `absent` ({@link disconnectRemoteFlags}). Letting go of the client because its follower
 * re-runs or remounts is not one ({@link releaseRemoteFlags}): the last answer stands until the client is followed
 * again, so a flag PostHog answered on never reads as a final off in between (F2c).
 */

import { Topic } from '@taucad/events';
import type { FeatureFlagName, FlagDefinition } from '#flags/flag.constants.js';
import { featureFlagNames, flagRegistry, resolveTauDebugDefault } from '#flags/flag.constants.js';
import { ENV } from '#environment.config.js';

/** Evaluated values of the PostHog-backed flags, by registry name. A flag PostHog did not return is absent. */
export type RemoteFlagValues = Readonly<Partial<Record<FeatureFlagName, boolean>>>;

/**
 * Where the remote values stand: `pending` until a connected client answers, `evaluated` once it has, `absent` when the
 * host decided no answer will come and the registry defaults are final, `failed` when an answer was due and did not
 * arrive. `failed` holds no values (the registry defaults show) and is not final: a later answer moves it to
 * `evaluated`.
 */
export type RemoteFlagStatus = 'pending' | 'evaluated' | 'absent' | 'failed';

/** The part of the PostHog client this source reads. */
export type RemoteFlagClient = {
  readonly featureFlags?: { getFlagVariants(): Record<string, string | boolean> } | undefined;
  /** PostHog calls back with the flags, their variants and whether loading them failed. */
  onFeatureFlags(
    callback: (
      flags?: readonly string[],
      variants?: Readonly<Record<string, string | boolean>>,
      context?: { readonly errorsLoading?: boolean },
    ) => void,
  ): (() => void) | undefined;
};

const remoteFlagTopic = new Topic<void>({ name: 'remote-feature-flags' });

let values: RemoteFlagValues | undefined;
/* Until the analytics boundary decides, nothing has answered. */
let status: RemoteFlagStatus = 'pending';
let disconnectClient: (() => void) | undefined;
/* The client whose answer (`evaluated` or `failed`) is held, so following it again keeps that answer. */
let answeredClient: RemoteFlagClient | undefined;

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

function update(next: RemoteFlagValues | undefined, nextStatus: RemoteFlagStatus): void {
  if (isSame(values, next) && status === nextStatus) {
    return;
  }
  values = next;
  status = nextStatus;
  remoteFlagTopic.emit();
}

/**
 * The evaluated PostHog values, or `undefined` while no client has evaluated flags. A seeded end-to-end flag state,
 * where the build honours one, takes their place.
 */
export function readRemoteFlagValues(): RemoteFlagValues | undefined {
  return seededValues ?? values;
}

/**
 * Whether the values {@link readRemoteFlagValues} gives are settled. A seeded end-to-end flag state is always
 * `evaluated`.
 */
export function readRemoteFlagStatus(): RemoteFlagStatus {
  return seededValues === undefined ? status : 'evaluated';
}

/** Listen for changes to the remote values or their status; returns the unsubscribe. */
export function subscribeRemoteFlags(listener: () => void): () => void {
  return remoteFlagTopic.subscribe(listener);
}

/**
 * Follow a PostHog client's evaluated flags until {@link releaseRemoteFlags} or {@link disconnectRemoteFlags}. Called
 * by the analytics boundary once the host admits analytics; replaces any earlier client.
 *
 * Following the client whose answer is held again (the boundary's effect re-ran, or the boundary remounted) keeps that
 * answer, evaluated or failed, until the client calls back. Any other client, or one followed after a decision, starts
 * `pending`.
 *
 * A callback that reports `errorsLoading` (posthog-js gave up on `/flags` after its timeout and retries) publishes
 * `failed`, unless this client has already answered: PostHog then keeps the flags it holds, and so does this source.
 *
 * @param client - The initialised PostHog singleton.
 */
export function connectRemoteFlags(client: RemoteFlagClient): void {
  releaseClient();
  if (client !== answeredClient || (status !== 'evaluated' && status !== 'failed')) {
    answeredClient = undefined;
    update(undefined, 'pending');
  }
  const read = (
    _flags?: readonly string[],
    _variants?: Readonly<Record<string, string | boolean>>,
    context?: { readonly errorsLoading?: boolean },
  ): void => {
    const isFirstAnswer = answeredClient !== client || status !== 'evaluated';
    answeredClient = client;
    /* A failed load decides nothing: keep an earlier answer, or wait for PostHog's next refresh with no values. */
    if (context?.errorsLoading === true) {
      if (isFirstAnswer) {
        update(undefined, 'failed');
      }
      return;
    }
    const variants = client.featureFlags?.getFlagVariants();
    update(variants === undefined ? values : project(variants), 'evaluated');
  };
  try {
    // `onFeatureFlags` also calls back at once when flags have already loaded.
    const unsubscribe = client.onFeatureFlags(read);
    disconnectClient = typeof unsubscribe === 'function' ? unsubscribe : undefined;
  } catch {
    // Optional analytics must not prevent the product from opening; defaults show, and nothing was decided.
    disconnectClient = undefined;
    answeredClient = undefined;
    update(undefined, 'failed');
  }
}

function releaseClient(): void {
  disconnectClient?.();
  disconnectClient = undefined;
}

/**
 * Stop following the client without deciding anything: the values and status stay as they are, and nothing is
 * published. The analytics boundary calls this when its admission effect is cleaned up, which a re-run or a remount
 * does while analytics stay admitted; whatever comes next (following the client again, or a withdrawal through
 * {@link disconnectRemoteFlags}) decides.
 */
export function releaseRemoteFlags(): void {
  releaseClient();
}

/**
 * Report that no client can answer although analytics are admitted: the SDK could not load. Every PostHog-backed flag
 * shows its registry default, and reads `unknown`, since nothing was decided about the visitor.
 */
export function failRemoteFlags(): void {
  releaseClient();
  answeredClient = undefined;
  update(undefined, 'failed');
}

/**
 * Stop following the client and return every PostHog-backed flag to its registry default, which is then final. Call it
 * only on a decision: analytics are not admitted, were withdrawn, or the build has no key. A failure is not one
 * ({@link failRemoteFlags}).
 */
export function disconnectRemoteFlags(): void {
  releaseClient();
  answeredClient = undefined;
  update(undefined, 'absent');
}
