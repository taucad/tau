import type { ErrorEvent } from '@sentry/react';
import { randomUuid } from '@taucad/utils/id';
import { ENV } from '#environment.config.js';
import { readBuildId } from '#lib/build-identity.js';
import { redactInvitationTokens } from '#lib/invitation-token.lib.js';

/*
 * What every Sentry event from the UI carries and how it is scrubbed, without the SDK: the page's
 * main bundle uses it to send an event itself when the SDK's own chunk could not be loaded.
 */

/**
 * Remove the query string and fragment, then any invitation token, from a URL.
 *
 * @param url - A URL an event or breadcrumb carries.
 * @returns The URL without credentials.
 */
export const scrubUrl = (url: string): string => redactInvitationTokens(url.split(/[?#]/u, 1)[0] ?? '');

/**
 * Scrub an error event before it leaves the browser: no query strings, no invitation tokens, no headers, cookies
 * or user. Invitation tokens and verification codes are bearer credentials that live in URLs.
 *
 * @param event - The event about to be sent.
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
 * The Sentry release for a build, so every event names the deploy it came from.
 *
 * @param id - The build id (`#lib/build-identity`).
 * @returns `tau-ui@<build id>`, or `undefined` for a bundle without one.
 * @public
 */
export const sentryRelease = (id: number): string | undefined => (id === 0 ? undefined : `tau-ui@${String(id)}`);

/**
 * The Sentry environment events are filed under.
 *
 * @returns The host's `SENTRY_ENVIRONMENT`, else the build mode.
 */
export const sentryEnvironment = (): string | undefined => ENV.SENTRY_ENVIRONMENT ?? ENV.NODE_ENV;

/**
 * The envelope endpoint of a DSN (`https://<key>@<host>[/<path>]/<project>`), as the SDK derives it.
 *
 * @param dsn - The DSN the host injected.
 * @returns The URL to post an envelope to, or `undefined` for a DSN that does not parse.
 */
export const sentryEnvelopeUrl = (dsn: string): string | undefined => {
  try {
    const url = new URL(dsn);
    const segments = url.pathname.split('/').filter(Boolean);
    const project = segments.pop();
    if (!url.username || project === undefined) {
      return undefined;
    }
    const path = segments.length > 0 ? `/${segments.join('/')}` : '';
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Sentry's own query parameters.
    const query = new URLSearchParams({ sentry_version: '7', sentry_key: url.username });
    return `${url.protocol}//${url.host}${path}/api/${project}/envelope/?${query.toString()}`;
  } catch {
    return undefined;
  }
};

/**
 * Bytes of `keepalive` request bodies a page may have in flight; browsers refuse a `keepalive`
 * request past 64 KiB in total, so, as Sentry's own transport does, stay under about 60 KB and send
 * the rest as ordinary requests (which still complete while the page lives).
 */
export const keepaliveBudget = 60_000;

/** Longest message and stack text an event sent without the SDK carries. */
export const directEventTextLimit = { message: 2000, stack: 6000 } as const;

let keepaliveInFlight = 0;

/**
 * Mark a value as captured the way the SDK does (`__sentry_captured__`, which its
 * `checkOrSetAlreadyCaught` reads), so the SDK, should it start later on this page, never sends it
 * again (for example when Vite rethrows a preload failure sent here into a global handler).
 */
const markCaptured = (error: unknown): void => {
  if ((typeof error === 'object' && error !== null) || typeof error === 'function') {
    try {
      Object.defineProperty(error, '__sentry_captured__', { value: true, enumerable: false, configurable: true });
    } catch {
      // A frozen value: the SDK would not be able to mark it either.
    }
  }
};

const randomEventId = (): string => randomUuid().replaceAll('-', '');

/**
 * Report an error without the SDK, when its chunk could not be loaded: one event, stamped with this
 * page's own release and environment, scrubbed as `beforeSend` scrubs, its message and stack
 * capped ({@link directEventTextLimit}), posted once as an envelope, with `keepalive` (so it survives
 * the page going) while the bodies in flight stay within {@link keepaliveBudget}. Nothing is stored and nothing is retried: if the
 * request is blocked as well (a content blocker), the error is lost.
 *
 * @param error - The value to report.
 * @param tags - Tags for the event, such as `stale_build`.
 * @returns Settles once the request has been answered or refused; never rejects.
 */
export const sendSentryEventDirectly = async (
  error: unknown,
  tags: Readonly<Record<string, string>>,
): Promise<void> => {
  const dsn = ENV.SENTRY_DSN;
  const endpoint = dsn ? sentryEnvelopeUrl(dsn) : undefined;
  if (!dsn || endpoint === undefined) {
    return;
  }
  markCaptured(error);
  const isError = error instanceof Error;
  const release = sentryRelease(readBuildId());
  const environment = sentryEnvironment();
  const event = scrubSentryEvent({
    type: undefined,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Sentry's event field.
    event_id: randomEventId(),
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level: 'error',
    ...(release === undefined ? {} : { release }),
    ...(environment === undefined ? {} : { environment }),
    tags: { ...tags, delivery: 'without-sdk' },
    exception: {
      values: [
        {
          type: isError ? error.name : 'Error',
          value: (isError ? error.message : String(error)).slice(0, directEventTextLimit.message),
          mechanism: { type: 'tau.error-reporting.without-sdk', handled: true },
        },
      ],
    },
    ...(isError && error.stack !== undefined
      ? { extra: { stack: error.stack.slice(0, directEventTextLimit.stack) } }
      : {}),
    request: { url: globalThis.location.href },
  });
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Sentry's envelope header fields.
  const header = { event_id: event.event_id, sent_at: new Date().toISOString(), dsn };
  const body = `${JSON.stringify(header)}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
  const size = new TextEncoder().encode(body).length;
  const keepalive = keepaliveInFlight + size <= keepaliveBudget;
  if (keepalive) {
    keepaliveInFlight += size;
  }
  try {
    // A simple request (no preflight), as the SDK's own transport sends.
    await fetch(endpoint, {
      method: 'POST',
      body,
      keepalive,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    });
  } catch {
    // Blocked or unavailable: the error is lost, and nothing reports that.
  } finally {
    if (keepalive) {
      keepaliveInFlight -= size;
    }
  }
};
