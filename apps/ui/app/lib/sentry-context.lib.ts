import type { Event } from '@sentry/react';
import type { ClientInstrumentation } from 'react-router';
import { Topic } from '@taucad/events';
import { ENV } from '#environment.config.js';
import { readBuildId } from '#lib/build-identity.js';
import { isMemoryConstrainedDevice } from '@taucad/ui-core/lib/device-memory-class';
import { readDocumentSessionCounts } from '#lib/memory-kill-signal.js';
import { readHighWaterWasmBytes, readLastMemorySample } from '@taucad/ui-core/lib/memory-sampler';

/*
 * The Tau context processor (browser observability SB1): the tags and contexts every UI event
 * carries, whichever way it goes (the SDK's event processor in `#lib/sentry.lib`, and an event sent
 * without the SDK in `#lib/sentry-event.lib`, principle 7). It loads with the page's main bundle and
 * never imports the SDK's runtime. Unknown values are left absent, never guessed. `tau.memory`
 * comes from SB2's sampler (`#lib/memory-sampler`), which this processor reads but never drives.
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

/** The display mode and its basis or problem (adaptive app deployment mode W1), or `undefined` before it is known. */
let reportedDeploymentMode: string | undefined;

/**
 * Set the `deployment_mode` tag events carry: the display mode and its basis or problem, such as `funded/confirmed`
 * or `unknown/unreachable` (adaptive app deployment mode charter W1).
 *
 * @param mode - The tag's value, or `undefined` to clear it.
 */
export const setReportedDeploymentMode = (mode: string | undefined): void => {
  reportedDeploymentMode = mode;
};

/**
 * The desktop manifest (`apps/ui/desktop/app/routes.ts`) reads the web routes from outside its own app
 * directory, so its ids carry a `../../app/` prefix; the tag drops it so desktop and web ids match.
 */
const outOfTreeRoutePrefix = /^(?:\.\.\/)+app\//u;

/** Each route's path relative to its parent, by route id, as React Router built the routes. */
const routePaths = new Map<string, string | undefined>();

/**
 * The route instrumentation `HydratedRouter` takes (React Router 8 migration C2, RR7): React Router calls it once for
 * every route it builds, lazily discovered ones included, and it keeps each route's path so a match list names its
 * pattern. It wraps no handler.
 *
 * @public
 */
export const routePathInstrumentation: ClientInstrumentation = {
  route: ({ id, path }) => {
    routePaths.set(id, path);
  },
};

/** The matched route the page last rendered: its deepest route id and its pattern. */
let published: Readonly<{ id: string; pattern: string }> | undefined;

/** Who is told when the matched route changes (span naming, which loads with the SDK). */
const routeChanged = new Topic<void>({ name: 'published-route' });

/**
 * The pattern of a match list, as React Router's own `getRoutePattern` joins it (every matched route's path, empty
 * ones skipped), with a leading slash so it reads as the URL it matches.
 */
const patternOf = (ids: readonly string[]): string => {
  const joined = ids
    .map((id) => routePaths.get(id))
    .filter(Boolean)
    .join('/')
    .replaceAll(/\/\/+/gu, '/');
  return `/${joined.replace(/^\//u, '')}`;
};

/**
 * Publish the route ids the page rendered, root first (`useMatches()` in the root layout). A desktop id
 * (`../../app/routes/…`) reads as its web id. Listeners hear about a change only.
 *
 * @param ids - The matched route ids, root first; none clears the route.
 * @public
 */
export const publishRoute = (ids: readonly string[]): void => {
  const leaf = ids.at(-1)?.replace(outOfTreeRoutePrefix, '');
  const next = leaf === undefined || leaf === '' ? undefined : { id: leaf, pattern: patternOf(ids) };
  if (next?.id === published?.id && next?.pattern === published?.pattern) {
    return;
  }
  published = next;
  routeChanged.emit();
};

/**
 * Hear when the published route changes.
 *
 * @param listener - Called after each change.
 * @returns A function that stops it.
 * @public
 */
export const onRoutePublished = (listener: () => void): (() => void) => routeChanged.subscribe(listener);

/**
 * The React Router route id of the deepest match (for example `routes/w.$workspace.$project`), as the page last
 * rendered it.
 *
 * @returns The route id, or `undefined` before hydration and outside a page.
 */
export const readRouteId = (): string | undefined => published?.id;

/**
 * The URL pattern of the page's matched routes (for example `/w/:workspace/:project`).
 *
 * @returns The pattern, or `undefined` before hydration and outside a page.
 * @public
 */
export const readRoutePattern = (): string | undefined => published?.pattern;

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
 * The tags every UI event carries: `route`, `route.pattern`, `device_class`, `build_id`, `deploy_context` and
 * `deployment_mode`.
 *
 * @returns The known tags.
 */
const readTauEventTags = (): Record<string, string> => {
  const buildId = readBuildId();
  /* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names, filtered on by operators. */
  return defined({
    route: readRouteId(),
    'route.pattern': readRoutePattern(),
    device_class: isMemoryConstrainedDevice() ? 'constrained' : 'standard',
    build_id: buildId === 0 ? undefined : String(buildId),
    deploy_context: ENV.TAU_DEPLOY_CONTEXT,
    deployment_mode: reportedDeploymentMode,
  });
  /* eslint-enable @typescript-eslint/naming-convention -- Sentry tag names, filtered on by operators. */
};

/**
 * The `tau.memory` context (SB2): the last sample this page took and the high-water WASM total.
 *
 * The sample is read, never taken: an event is not heavy work, and a figure from the moment the
 * work started says more than one from after it failed. Absent until the first sample.
 *
 * @returns The context, or nothing while no sample has been taken.
 */
const readTauMemoryContext = (): Record<string, Record<string, unknown>> => {
  const sample = readLastMemorySample();
  const highWaterWasmBytes = readHighWaterWasmBytes();
  if (sample === undefined) {
    return {};
  }
  const { at, ...figures } = sample;
  const context = defined<unknown>({
    ...figures,
    highWaterWasmBytes,
    sampleAgeSeconds: Math.round((globalThis.performance.now() - at) / 1000),
  });
  return Object.keys(context).length === 0 ? {} : { 'tau.memory': context };
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
    ...readTauMemoryContext(),
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
