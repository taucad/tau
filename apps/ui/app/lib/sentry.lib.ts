import * as Sentry from '@sentry/react';
import type { Breadcrumb, ErrorEvent } from '@sentry/react';
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

/**
 * Scrub the URLs navigation and fetch breadcrumbs record.
 *
 * @param breadcrumb - The breadcrumb the SDK is about to keep.
 * @returns The scrubbed breadcrumb.
 * @public
 */
export const scrubSentryBreadcrumb = (breadcrumb: Breadcrumb): Breadcrumb => {
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
    beforeSend: scrubSentryEvent,
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
