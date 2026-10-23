import * as Sentry from '@sentry/react';
import type { Breadcrumb, ErrorEvent, EventHint } from '@sentry/react';
import { isAbortError } from '@taucad/utils/error';
import { ENV } from '#environment.config.js';
import { redactInvitationTokens } from '#lib/invitation-token.lib.js';

/**
 * Remove the query string and fragment, then any invitation token, from a URL.
 *
 * @param url - A URL an event or breadcrumb carries.
 * @returns The URL without credentials.
 */
const scrubUrl = (url: string): string => redactInvitationTokens(url.split(/[?#]/u, 1)[0] ?? '');

/**
 * Scrub an error event before it leaves the browser: no query strings, no invitation tokens, no headers, cookies
 * or user. Invitation tokens and verification codes are bearer credentials that live in URLs.
 *
 * @param event - The event the SDK is about to send.
 * @returns The scrubbed event.
 * @public
 */
export const scrubSentryEvent = (event: ErrorEvent): ErrorEvent => {
  if (event.request) {
    const { url } = event.request;
    event.request = url === undefined ? {} : { url: scrubUrl(url) };
  }
  delete event.user;
  // Stack frames and messages can quote the page URL too.
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a JSON round trip of the same event.
  return JSON.parse(redactInvitationTokens(JSON.stringify(event))) as ErrorEvent;
};

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
 * The `beforeSend` hook: drop an unhandled abort rejection, scrub everything else.
 *
 * @param event - The event the SDK is about to send.
 * @param hint - The SDK's hint for the event.
 * @returns The scrubbed event, or `null` to drop it.
 * @public
 */
// oxlint-disable-next-line typescript/no-restricted-types -- Sentry's beforeSend drops an event by returning null.
export const beforeSendSentryEvent = (event: ErrorEvent, hint?: EventHint): ErrorEvent | null =>
  isUnhandledAbortRejection(event, hint) ? null : scrubSentryEvent(event);

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
 * Scrub the URLs navigation and fetch breadcrumbs record, and reduce a console
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
 * the visitor's device, which is why it does not wait for cookie consent.
 */
export const initSentry = (): void => {
  const dsn = ENV.SENTRY_DSN;
  if (!dsn) {
    return;
  }
  Sentry.init({
    dsn,
    environment: ENV.SENTRY_ENVIRONMENT ?? ENV.NODE_ENV,
    sendDefaultPii: false,
    integrations: (defaults) => defaults.filter((integration) => integration.name !== 'BrowserSession'),
    beforeSend: beforeSendSentryEvent,
    beforeBreadcrumb: scrubSentryBreadcrumb,
  });
};

/**
 * Report an error a boundary caught. A no-op before `initSentry` ran or without a DSN.
 *
 * @param error - The caught value.
 * @public
 */
export const captureUiError = (error: unknown): void => {
  if (Sentry.isInitialized()) {
    Sentry.captureException(error);
  }
};
