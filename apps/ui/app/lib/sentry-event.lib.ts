import type { ErrorEvent } from '@sentry/react';
import { randomUuid } from '@taucad/utils/id';
import { ENV } from '#environment.config.js';
import { readBuildId } from '#lib/build-identity.js';
import { redactInvitationTokens } from '#lib/invitation-token.lib.js';
import type { StaleBuildTag } from '#lib/stale-build-recovery.js';

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

/** Fingerprint shared by chunk failures a deploy explains, so they group apart from genuine ones. */
export const staleBuildFingerprint = ['stale-build-chunk-load'] as const;

/**
 * Decorate an event with a chunk failure's `stale_build` tag, as every path to Sentry does (the
 * SDK's `beforeSend` and an event sent without it): one a deploy explains (`superseded`) is grouped
 * apart (its own fingerprint) at level `info`; any other keeps its group and level.
 *
 * @param event - The event about to be sent.
 * @param tag - The failure's tag.
 * @returns The decorated event.
 * @public
 */
export const decorateForStaleBuild = (event: ErrorEvent, tag: StaleBuildTag): ErrorEvent => ({
  ...event,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- A Sentry tag name, filtered on by operators.
  tags: { ...event.tags, stale_build: tag },
  ...(tag === 'superseded' ? { level: 'info', fingerprint: [...staleBuildFingerprint] } : {}),
});

const staleBuildTags: ReadonlySet<string> = new Set<StaleBuildTag>(['superseded', 'current', 'unknown', 'undecided']);

const isStaleBuildTag = (value: string | undefined): value is StaleBuildTag =>
  value !== undefined && staleBuildTags.has(value);

/**
 * What Sentry's own fetch transport allows `keepalive` requests: browsers refuse one once the
 * bodies in flight pass 64 KiB, or (in some engines) past a handful of requests, so the transport
 * uses `keepalive` only while, counting the new request, at most 60 KB and fewer than 15 requests
 * are in flight.
 */
export const keepaliveBudget = { bytes: 60_000, requests: 15 } as const;

/** Longest message and stack text an event sent without the SDK carries; tighter at page exit. */
export const directEventTextLimit = { message: 2000, stack: 6000, stackAtPageExit: 2000 } as const;

const inFlight = { bytes: 0, requests: 0 };

const fitsKeepalive = (bytes: number, requests: number): boolean =>
  inFlight.bytes + bytes <= keepaliveBudget.bytes && inFlight.requests + requests < keepaliveBudget.requests;

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

/** Whether the SDK, or an earlier event sent without it, already captured a value. */
const isCaptured = (error: unknown): boolean => {
  if ((typeof error !== 'object' || error === null) && typeof error !== 'function') {
    return false;
  }
  try {
    return Reflect.get(error, '__sentry_captured__') === true;
  } catch {
    // A getter that throws: the SDK could not have marked it either.
    return false;
  }
};

const randomEventId = (): string => randomUuid().replaceAll('-', '');

/** An envelope ready to post, and its size in bytes. */
type Envelope = { readonly body: string; readonly size: number };

/** What one event sent without the SDK is built from. */
type EnvelopeInput = {
  readonly dsn: string;
  readonly error: unknown;
  readonly tags: Readonly<Record<string, string>>;
  readonly stackLimit: number;
  /** Groups the event apart from what its message alone would group it with. */
  readonly fingerprint?: readonly string[];
};

const buildEnvelope = ({ dsn, error, tags, stackLimit, fingerprint }: EnvelopeInput): Envelope => {
  const isError = error instanceof Error;
  const release = sentryRelease(readBuildId());
  const environment = sentryEnvironment();
  const staleBuild = tags['stale_build'];
  const plain: ErrorEvent = {
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
    ...(isError && error.stack !== undefined ? { extra: { stack: error.stack.slice(0, stackLimit) } } : {}),
    request: { url: globalThis.location.href },
    ...(fingerprint === undefined ? {} : { fingerprint: [...fingerprint] }),
  };
  // Decorated exactly as `beforeSend` decorates the SDK's own events.
  const event = scrubSentryEvent(isStaleBuildTag(staleBuild) ? decorateForStaleBuild(plain, staleBuild) : plain);
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Sentry's envelope header fields.
  const header = { event_id: event.event_id, sent_at: new Date().toISOString(), dsn };
  const body = `${JSON.stringify(header)}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
  return { body, size: new TextEncoder().encode(body).length };
};

/** Post one envelope, with `keepalive` when asked; never rejects, and a refused request is simply lost. */
const post = async (endpoint: string, envelope: Envelope, keepalive: boolean): Promise<void> => {
  if (keepalive) {
    inFlight.bytes += envelope.size;
    inFlight.requests += 1;
  }
  try {
    // A simple request (no preflight), as the SDK's own transport sends.
    await fetch(endpoint, {
      method: 'POST',
      body: envelope.body,
      keepalive,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    });
  } catch {
    // Blocked or unavailable: the error is lost, and nothing reports that.
  } finally {
    if (keepalive) {
      inFlight.bytes -= envelope.size;
      inFlight.requests -= 1;
    }
  }
};

const endpointOf = (): { readonly dsn: string; readonly endpoint: string } | undefined => {
  const dsn = ENV.SENTRY_DSN;
  const endpoint = dsn ? sentryEnvelopeUrl(dsn) : undefined;
  return dsn && endpoint !== undefined ? { dsn, endpoint } : undefined;
};

/**
 * Report an error without the SDK while the page lives, when the SDK's chunk could not be loaded:
 * one event, stamped with this page's own release and environment, decorated and scrubbed as
 * `beforeSend` does, its message and stack capped ({@link directEventTextLimit}), posted once as an
 * envelope, with `keepalive` while {@link keepaliveBudget} allows and as an ordinary request
 * otherwise. A value the SDK (or an earlier such event) already captured is skipped. Nothing is
 * stored and nothing is retried: if the request is blocked as well (a content blocker), the error is lost.
 *
 * @param error - The value to report.
 * @param tags - Tags for the event, such as `stale_build`.
 * @returns Settles once the request has been answered or refused; never rejects.
 */
export const sendSentryEventDirectly = async (
  error: unknown,
  tags: Readonly<Record<string, string>>,
): Promise<void> => {
  const target = endpointOf();
  if (target === undefined || isCaptured(error)) {
    return;
  }
  markCaptured(error);
  const envelope = buildEnvelope({ dsn: target.dsn, error, tags, stackLimit: directEventTextLimit.stack });
  await post(target.endpoint, envelope, fitsKeepalive(envelope.size, 1));
};

/** The message of the event that stands in for errors a page could not send as it went. */
export const undeliveredAtPageExitMessage = (count: number): string =>
  `${String(count)} further UI errors were not delivered at page exit`;

/** Fingerprint of that event, so every page's summary is one issue whatever its count. */
export const undeliveredAtPageExitFingerprint = ['ui-errors-undelivered-at-page-exit'] as const;

const buildSummaryEnvelope = (dsn: string, count: number): Envelope =>
  buildEnvelope({
    dsn,
    error: new Error(undeliveredAtPageExitMessage(count)),
    tags: {},
    stackLimit: 0,
    fingerprint: undeliveredAtPageExitFingerprint,
  });

/**
 * Report errors without the SDK as the page goes (`pagehide`), where only `keepalive` requests
 * survive: within {@link keepaliveBudget} (counting what is already in flight), newest first, each
 * stack trimmed to {@link directEventTextLimit}`.stackAtPageExit`. Those that do not fit are counted
 * in one small final event ({@link undeliveredAtPageExitMessage}), sent when that still fits; the
 * errors themselves are lost.
 *
 * @param reports - The errors and their tags, oldest first.
 */
export const sendSentryEventsAtPageExit = (
  reports: ReadonlyArray<{ readonly error: unknown; readonly tags: Readonly<Record<string, string>> }>,
): void => {
  const target = endpointOf();
  if (target === undefined) {
    return;
  }
  const newestFirst = reports.filter((report) => !isCaptured(report.error)).toReversed();
  // Room is kept for the summary while anything might be left out: its count has at most as many digits as the total.
  const summarySize = buildSummaryEnvelope(target.dsn, newestFirst.length).size;
  let sent = 0;
  for (const [index, report] of newestFirst.entries()) {
    const envelope = buildEnvelope({
      dsn: target.dsn,
      error: report.error,
      tags: report.tags,
      stackLimit: directEventTextLimit.stackAtPageExit,
    });
    const isLast = index === newestFirst.length - 1;
    if (!fitsKeepalive(envelope.size + (isLast ? 0 : summarySize), isLast ? 1 : 2)) {
      break;
    }
    markCaptured(report.error);
    // async-iife: bootstrap -- the page is going; nothing on it can wait for the answer.
    void post(target.endpoint, envelope, true);
    sent += 1;
  }
  const left = newestFirst.length - sent;
  if (left > 0) {
    const summary = buildSummaryEnvelope(target.dsn, left);
    if (fitsKeepalive(summary.size, 1)) {
      // async-iife: bootstrap -- the page is going; nothing on it can wait for the answer.
      void post(target.endpoint, summary, true);
    }
  }
};
