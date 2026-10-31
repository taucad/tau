import * as Sentry from '@sentry/react';
import type { Breadcrumb, ErrorEvent, EventHint } from '@sentry/react';
import { isAbortError } from '@taucad/utils/error';
import { ENV } from '#environment.config.js';
import { setActivityBreadcrumbSink } from '#lib/activity-breadcrumbs.js';
import { readBuildId } from '#lib/build-identity.js';
import { applyErrorDetails } from '#lib/error-details.js';
import { decorateForNetworkFailure } from '#lib/network-failure.js';
import { applyTauEventContext } from '#lib/sentry-context.lib.js';
import {
  decorateForStaleBuild,
  scrubSentryEvent,
  scrubUrl,
  sentryEnvironment,
  sentryRelease,
  sentryTunnelPath,
  usesSentryTunnel,
} from '#lib/sentry-event.lib.js';
import { classifyStaleBuildFailure, isStaleModuleError } from '#lib/stale-build-recovery.js';
import type { StaleBuildTag } from '#lib/stale-build-recovery.js';

/** The mechanism the SDK's global handlers stamp on an unhandled promise rejection. */
const unhandledRejectionMechanism = 'auto.browser.global_handlers.onunhandledrejection';

/**
 * Whether an event reports a cancellation nobody awaited: an unhandled promise rejection whose reason is an
 * `AbortError`. Aborting on unmount, navigation or supersession is expected control flow, not an error (TAU-UI-4).
 * Only the rejected value decides, never the event's text, so an error that merely mentions an abort still reports.
 *
 * @param event - The event the SDK is about to send.
 * @param hint - The SDK's hint, carrying the rejected value as `originalException`.
 * @returns `true` when the event should be dropped.
 * @public
 */
export const isUnhandledAbortRejection = (event: ErrorEvent, hint: EventHint | undefined): boolean =>
  isAbortError(hint?.originalException) &&
  (event.exception?.values?.some((value) => value.mechanism?.type === unhandledRejectionMechanism) ?? false);

/**
 * The `beforeSend` hook: drop an unhandled abort rejection, apply what reporters recorded on the error (its
 * `api_request_id`, SB13, and the SB4 tags, contexts and fingerprint), scrub everything else. A transient network
 * failure still reports, as one `warning` group of its own, so a connection blip is counted without reading as a
 * fault in Tau (TAU-UI-E).
 *
 * @param event - The event the SDK is about to send.
 * @param hint - The SDK's hint for the event.
 * @returns The scrubbed event, or `null` to drop it.
 * @public
 */
// oxlint-disable-next-line typescript/no-restricted-types -- Sentry's beforeSend drops an event by returning null.
export const beforeSendSentryEvent = (event: ErrorEvent, hint?: EventHint): ErrorEvent | null => {
  if (isUnhandledAbortRejection(event, hint)) {
    return null;
  }
  const failure = hint?.originalException;
  return scrubSentryEvent(decorateForNetworkFailure(applyErrorDetails(event, failure), failure));
};

/**
 * The `beforeSend` hook with version-skew tagging (TAU-UI-6).
 *
 * The stale-build recovery owns module load failures (`installStaleBuildRecovery` and the route
 * error page); this hook never acts on one and never drops one: Sentry marks an error captured
 * before `beforeSend` runs, so a dropped event could never be sent again. It holds the event until
 * the failure's decision settles (bounded by `staleBuildTagWait`), then tags it with that decision
 * (`stale_build` = `superseded` | `current` | `unknown`); one a deploy explains is grouped apart (its
 * own fingerprint) at level `info`, for operators to filter.
 *
 * @param describe - The failure's tag once its decision settles, bounded, asking nothing (`classifyStaleBuildFailure`).
 * @returns The hook to pass to `Sentry.init`.
 * @public
 */
export const createBeforeSend = (describe: (failure: unknown) => Promise<StaleBuildTag>) => {
  // oxlint-disable-next-line typescript/no-restricted-types -- Sentry's beforeSend drops an event by returning null.
  const tagged = async (event: ErrorEvent, hint?: EventHint): Promise<ErrorEvent | null> => {
    // Held until the failure's decision settles (bounded): the tracker hears a failure before it is decided.
    const tag = await describe(hint?.originalException);
    const annotated = decorateForStaleBuild(event, tag);
    return beforeSendSentryEvent(annotated, hint);
  };
  // oxlint-disable-next-line typescript/no-restricted-types -- Sentry's beforeSend drops an event by returning null.
  return (event: ErrorEvent, hint?: EventHint): ErrorEvent | null | Promise<ErrorEvent | null> =>
    isStaleModuleError(hint?.originalException) ? tagged(event, hint) : beforeSendSentryEvent(event, hint);
};

/**
 * Longest text a console breadcrumb keeps, per logged argument and for its message (D-UI-31).
 *
 * @public
 */
export const consoleBreadcrumbTextLimit = 500;

const truncate = (text: string): string =>
  text.length > consoleBreadcrumbTextLimit ? `${text.slice(0, consoleBreadcrumbTextLimit)}…` : text;

/**
 * Describe one logged value as bounded text, without walking it: a logged
 * object may be a mesh or a file, and serialising it here would cost what
 * keeping it did.
 */
const describeLogged = (value: unknown): string => {
  if (typeof value === 'string') {
    return truncate(value);
  }
  if (value instanceof Error) {
    return truncate(`${value.name}: ${value.message}`);
  }
  if (typeof value === 'object' && value !== null) {
    return `[${(value as { constructor?: { name?: string } }).constructor?.name ?? 'Object'}]`;
  }
  return truncate(String(value));
};

/**
 * Drop the element text a DOM breadcrumb's selector quotes (`[aria-label="…"]`, `[title="…"]`,
 * `[alt="…"]`, `[name="…"]` and the like), keeping the selector itself: tags, ids, classes and the
 * attribute names (principle 6).
 *
 * @param selector - The selector the SDK built for the element.
 * @returns The selector without quoted values.
 * @public
 */
export const scrubSelectorText = (selector: string): string =>
  selector.replaceAll(/\[([\w:-]+)=(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\]]*)\]/gu, '[$1]');

/**
 * Scrub the URLs navigation and fetch breadcrumbs record, drop element text from click and input
 * breadcrumbs ({@link scrubSelectorText}), and reduce a console
 * breadcrumb to bounded text.
 *
 * The SDK keeps the last 100 breadcrumbs, and a console breadcrumb held each
 * logged argument by reference, so a logged mesh, file or transcript stayed
 * alive until 100 more breadcrumbs pushed it out (D-UI-31).
 *
 * @param breadcrumb - The breadcrumb the SDK is about to keep.
 * @returns The scrubbed breadcrumb.
 * @public
 */
export const scrubSentryBreadcrumb = (breadcrumb: Breadcrumb): Breadcrumb => {
  if ((breadcrumb.category === 'ui.click' || breadcrumb.category === 'ui.input') && breadcrumb.message !== undefined) {
    return { ...breadcrumb, message: scrubSelectorText(breadcrumb.message) };
  }
  if (breadcrumb.category === 'console') {
    const logged: unknown = breadcrumb.data?.['arguments'];
    return {
      ...breadcrumb,
      ...(breadcrumb.message === undefined ? {} : { message: truncate(breadcrumb.message) }),
      ...(breadcrumb.data === undefined
        ? {}
        : {
            data: {
              ...breadcrumb.data,
              ...(Array.isArray(logged) ? { arguments: logged.map((value) => describeLogged(value)) } : {}),
            },
          }),
    };
  }
  if (!breadcrumb.data) {
    return breadcrumb;
  }
  const data = { ...breadcrumb.data };
  for (const key of ['url', 'from', 'to']) {
    const value: unknown = data[key];
    if (typeof value === 'string') {
      data[key] = scrubUrl(value);
    }
  }
  return { ...breadcrumb, data };
};

/**
 * Start browser error reporting (launch gate OBS-7) when the host injected `SENTRY_DSN`.
 *
 * Errors only: no tracing, no replay, no session tracking and no default PII. Unlike PostHog it writes nothing to
 * the visitor's device, which is why it does not wait for cookie consent. On the web, envelopes go through the
 * same-origin tunnel (`sentryTunnelPath`, SB5); desktop posts to the DSN directly. Every event gets the Tau
 * context (`applyTauEventContext`, SB1) before `beforeSend` scrubs it, and activity breadcrumbs reach the trail.
 */
export const initSentry = (): void => {
  const dsn = ENV.SENTRY_DSN;
  if (!dsn) {
    return;
  }
  Sentry.init({
    dsn,
    environment: sentryEnvironment(),
    release: sentryRelease(readBuildId()),
    sendDefaultPii: false,
    ...(usesSentryTunnel() ? { tunnel: sentryTunnelPath } : {}),
    integrations: (defaults) => defaults.filter((integration) => integration.name !== 'BrowserSession'),
    beforeSend: createBeforeSend(classifyStaleBuildFailure),
    beforeBreadcrumb: scrubSentryBreadcrumb,
  });
  // Error events only: the processor never touches a transaction or feedback.
  Sentry.addEventProcessor((event) => (event.type === undefined ? applyTauEventContext(event) : event));
  setActivityBreadcrumbSink((message) => {
    Sentry.addBreadcrumb({ category: 'tau.activity', message, level: 'info' });
  });
};

/**
 * Report an error a boundary caught. A no-op before `initSentry` ran or without a DSN.
 *
 * @param error - The caught value.
 * @returns The event's id, which the crash prompt attaches its feedback to (SB12), or `undefined`
 * when there was no SDK to capture it.
 * @public
 */
export const captureUiError = (error: unknown): string | undefined => {
  if (Sentry.isInitialized()) {
    return Sentry.captureException(error);
  }
  return undefined;
};

/**
 * Send what someone wrote about a crash they saw, as Sentry user feedback on that crash's event
 * (SB12, D9). Nothing is collected automatically: the message is typed, the email is optional and
 * empty by default, and no screenshot is taken (the screen after a reload shows nothing useful and
 * could carry private model or file content).
 *
 * @param feedback - The message, the optional email, and the event the feedback belongs to.
 * @returns Whether the SDK took it.
 * @public
 */
export const captureUserFeedback = (
  feedback: Readonly<{ message: string; email?: string; associatedEventId?: string }>,
): boolean => {
  if (!Sentry.isInitialized()) {
    return false;
  }
  Sentry.captureFeedback({
    message: feedback.message,
    source: 'tau.crash-prompt',
    ...(feedback.email === undefined || feedback.email === '' ? {} : { email: feedback.email }),
    ...(feedback.associatedEventId === undefined ? {} : { associatedEventId: feedback.associatedEventId }),
  });
  return true;
};

/**
 * Turn the SDK off for the page after `initSentry` threw part-way: the client may already be bound,
 * with some integrations (the global handlers) installed, and would otherwise capture (or mark as
 * captured) what the page then reports without it. Disabled and unbound at once, so those handlers
 * return early; the client's own close settles on its own.
 *
 * @public
 */
export const stopSentry = (): void => {
  setActivityBreadcrumbSink(undefined);
  const client = Sentry.getClient();
  if (client === undefined) {
    return;
  }
  client.getOptions().enabled = false;
  // Unbound, so the installed handlers return before capturing (and marking) anything.
  Sentry.getCurrentScope().setClient(undefined);
  // async-iife: bootstrap -- disabling is immediate; the close only flushes, and settles on its own.
  void client.close(0);
};
