import type { Event } from '@sentry/react';
import { ENV } from '#environment.config.js';
import { readBuildId } from '#lib/build-identity.js';
import { isMemoryConstrainedDevice } from '#lib/device-memory-class.js';
import { readDocumentSessionCounts } from '#lib/memory-kill-signal.js';

/*
 * The Tau context processor (browser observability SB1): the tags and contexts every UI event
 * carries, whichever way it goes (the SDK's event processor in `#lib/sentry.lib`, and an event sent
 * without the SDK in `#lib/sentry-event.lib`, principle 7). It loads with the page's main bundle and
 * never imports the SDK's runtime. Unknown values are left absent, never guessed. `tau.memory` is
 * SB2's (the memory sampler) and is not added here until that sampler exists.
 */

/** The opaque Tau user id events carry as `user.id` (D1), or `undefined` when signed out or unknown. */
let reportedUserId: string | undefined;

/**
 * Set the opaque Tau user id events carry (D1): the account id, never an email, name, IP or token.
 * `undefined` clears it, as on sign-out.
 *
 * @param id - The signed-in account's id, or `undefined`.
 */
export const setReportedUserId = (id: string | undefined): void => {
  reportedUserId = id === '' ? undefined : id;
};

/** The router React Router's `HydratedRouter` publishes, as far as the processor reads it. */
type PublishedRouter = {
  readonly state?: { readonly matches?: ReadonlyArray<{ readonly route?: { readonly id?: unknown } }> };
};

/**
 * The React Router route id of the deepest match (for example `routes/w.$workspace.$project`), from
 * the data router the framework's `HydratedRouter` publishes on `window`.
 *
 * @returns The route id, or `undefined` before hydration and outside a page.
 */
export const readRouteId = (): string | undefined => {
  try {
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent in a worker and during SSR.
    const router = (globalThis.window as (Window & { __reactRouterDataRouter?: PublishedRouter }) | undefined)
      ?.__reactRouterDataRouter;
    const id = router?.state?.matches?.at(-1)?.route?.id;
    return typeof id === 'string' && id !== '' ? id : undefined;
  } catch {
    return undefined;
  }
};

/** `navigator.deviceMemory` (Chromium only, rounded), which the DOM library does not declare. */
const readDeviceMemory = (): number | undefined => {
  if (typeof navigator === 'undefined' || !('deviceMemory' in navigator)) {
    return undefined;
  }
  const { deviceMemory } = navigator;
  return typeof deviceMemory === 'number' ? deviceMemory : undefined;
};

/** Drop the `undefined` entries of a record, so absent values stay absent on the wire. */
const defined = <Value>(record: Readonly<Record<string, Value | undefined>>): Record<string, Value> =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as Record<string, Value>;

/**
 * The tags every UI event carries: `route`, `device_class`, `build_id` and `deploy_context`.
 *
 * @returns The known tags.
 */
const readTauEventTags = (): Record<string, string> => {
  const buildId = readBuildId();
  /* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names, filtered on by operators. */
  return defined({
    route: readRouteId(),
    device_class: isMemoryConstrainedDevice() ? 'constrained' : 'standard',
    build_id: buildId === 0 ? undefined : String(buildId),
    deploy_context: ENV.TAU_DEPLOY_CONTEXT,
  });
  /* eslint-enable @typescript-eslint/naming-convention -- Sentry tag names, filtered on by operators. */
};

/**
 * The `tau.device` and `tau.session` contexts: hardware hints, viewport and isolation; live project
 * and chat counts, uptime and visibility. Counts and text are structure only (principle 6).
 *
 * @returns The contexts, each holding only what this page can read.
 */
const readTauEventContexts = (): Record<string, Record<string, unknown>> => {
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent in a worker and during SSR.
  const page = globalThis.window as Window | undefined;
  const counts = readDocumentSessionCounts();
  const hardwareConcurrency = typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency;
  return {
    'tau.device': defined<unknown>({
      deviceMemory: readDeviceMemory(),
      hardwareConcurrency: typeof hardwareConcurrency === 'number' ? hardwareConcurrency : undefined,
      viewport: page === undefined ? undefined : `${String(page.innerWidth)}x${String(page.innerHeight)}`,
      crossOriginIsolated:
        typeof globalThis.crossOriginIsolated === 'boolean' ? globalThis.crossOriginIsolated : undefined,
    }),
    'tau.session': defined<unknown>({
      liveProjectCount: counts?.liveProjectCount,
      chatCount: counts?.chatCount,
      uptimeSeconds: Math.round(globalThis.performance.now() / 1000),
      visibility: typeof document === 'undefined' ? undefined : document.visibilityState,
    }),
  };
};

/**
 * Add the Tau context to an event (the processor): tags the event already has win, contexts are
 * added beside the SDK's own, and `user.id` is the opaque Tau user id while one is known.
 *
 * @param event - The event about to be sent.
 * @returns The event with the Tau context.
 * @public
 */
export const applyTauEventContext = <Reported extends Event>(event: Reported): Reported => ({
  ...event,
  tags: { ...readTauEventTags(), ...event.tags },
  contexts: { ...event.contexts, ...readTauEventContexts() },
  ...(reportedUserId === undefined ? {} : { user: { id: reportedUserId } }),
});
