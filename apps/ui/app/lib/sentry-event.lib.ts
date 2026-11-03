import { observabilityHarnessTags } from '#lib/observability-harness-context.js';
import { defaultStackParser } from '@sentry/react';
import type { ErrorEvent, StackFrame } from '@sentry/react';
import { randomUuid } from '@taucad/utils/id';
import { ENV } from '#environment.config.js';
import { readBuildId } from '#lib/build-identity.js';
import { applyErrorDetails } from '#lib/error-details.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { decorateForNetworkFailure } from '#lib/network-failure.js';
import { applyTauEventContext } from '#lib/sentry-context.lib.js';
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

/** The one request header an event keeps, so Sentry derives the browser, OS and device contexts (SB1). */
const userAgentHeader = 'User-Agent';

/** The `User-Agent` of an event's request headers, whatever its case. */
const userAgentOf = (headers: Readonly<Record<string, string>> | undefined): string | undefined => {
  if (headers === undefined) {
    return undefined;
  }
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === 'user-agent');
  return typeof entry?.[1] === 'string' && entry[1] !== '' ? entry[1] : undefined;
};

/**
 * The environment an automated run reports under: its deployment's, marked `-e2e`, so the errors a suite causes on
 * purpose never land among real users' (the staging observability harness, ui-e2e and desktop-e2e runs).
 *
 * @param environment - The deployment's environment.
 * @returns `<environment>-e2e`, unchanged when already marked or absent.
 * @public
 */
export const automatedRunEnvironment = (environment: string | undefined): string | undefined =>
  environment === undefined || environment.endsWith('-e2e') ? environment : `${environment}-e2e`;

/** Whether a browser automation driver (Playwright, WebDriver) controls this page. */
const isAutomatedBrowser = (): boolean =>
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- navigator is absent during SSR.
  globalThis.navigator?.webdriver ?? false;

/**
 * Scrub an error event before it leaves the browser: no query strings, no invitation tokens, no
 * cookies, and no headers but `User-Agent` (so Sentry derives the browser, OS and device contexts).
 * The user keeps only its opaque Tau `id` (D1): no email, name, username or IP. Invitation tokens and
 * verification codes are bearer credentials that live in URLs.
 *
 * @param event - The event about to be sent.
 * @returns The scrubbed event.
 * @public
 */
export const scrubSentryEvent = (event: ErrorEvent): ErrorEvent => {
  const harnessTags = observabilityHarnessTags();
  const isHarnessRun = Object.keys(harnessTags).length > 0;
  if (isHarnessRun) {
    event.tags = { ...event.tags, ...harnessTags };
  }
  if (isHarnessRun || isAutomatedBrowser()) {
    event.environment = automatedRunEnvironment(event.environment ?? sentryEnvironment());
  }
  if (event.request) {
    const { url, headers } = event.request;
    const userAgent = userAgentOf(headers);
    event.request = {
      ...(url === undefined ? {} : { url: scrubUrl(url) }),
      ...(userAgent === undefined ? {} : { headers: { [userAgentHeader]: userAgent } }),
    };
  }
  const userId = event.user?.id;
  if (typeof userId === 'string' && userId !== '') {
    event.user = { id: userId };
  } else {
    delete event.user;
  }
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
 * The same-origin tunnel both delivery paths post envelopes to on the web (SB5), so a content
 * blocker that refuses the Sentry ingest host does not drop UI errors. Desktop posts directly.
 */
export const sentryTunnelPath = '/api/monitoring';

/**
 * Where this bundle posts envelopes: the tunnel on the web, the DSN's own endpoint on desktop
 * (whose `app://` origin has no server behind it).
 *
 * @returns Whether to use {@link sentryTunnelPath}.
 */
export const usesSentryTunnel = (): boolean => !isDesktopTarget();

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
 * are in flight. The browser's quota is the whole page's (the SDK, analytics and beacons share it):
 * this module counts what it put in flight itself ({@link keepaliveLedger}), a beacon the browser
 * answers at once, and a `keepalive` fetch it refused anyway goes again as an ordinary request.
 */
export const keepaliveBudget = { bytes: 60_000, requests: 15 } as const;

/**
 * Milliseconds a beacon counts as in flight. The browser never says when a beacon has gone, so the
 * ledger holds one for as long as a slow connection takes to upload the whole budget, then lets it
 * go; a beacon still uploading after that only costs a `keepalive` fetch its refusal, never the event.
 */
export const beaconHold = 10_000;

/** Longest message and stack text an event sent without the SDK carries; tighter at page exit. */
export const directEventTextLimit = { message: 2000, stack: 6000, stackAtPageExit: 2000 } as const;

/**
 * Everything this module has in flight against the page's keepalive quota, whichever way it went:
 * `keepalive` fetches until they are answered, beacons for {@link beaconHold}. Every send reads it,
 * so an error sent right after the page is shown again sees the beacons its hiding queued.
 */
const keepaliveLedger = { bytes: 0, requests: 0 };

/** Count one request in the ledger; the returned function takes it out again, once. */
const holdInLedger = (bytes: number): (() => void) => {
  keepaliveLedger.bytes += bytes;
  keepaliveLedger.requests += 1;
  let isHeld = true;
  return () => {
    if (isHeld) {
      isHeld = false;
      keepaliveLedger.bytes -= bytes;
      keepaliveLedger.requests -= 1;
    }
  };
};

const fitsKeepalive = (bytes: number, requests: number): boolean =>
  keepaliveLedger.bytes + bytes <= keepaliveBudget.bytes &&
  keepaliveLedger.requests + requests < keepaliveBudget.requests;

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

/** A chunk's source-map debug image, as the SDK attaches it (`debug_meta.images`). */
type DebugImage = { readonly type: 'sourcemap'; readonly code_file: string; readonly debug_id: string };

/** Debug ids `sentry-cli sourcemaps inject` registered on the page: an `Error().stack` per chunk, to its id. */
type InjectedDebugIds = Readonly<Record<string, string>>;

let debugIdFiles: { readonly count: number; readonly byFile: ReadonlyMap<string, string> } | undefined;

/**
 * Each injected chunk's URL and debug id, as the SDK reads them (`getFilenameToDebugIdMap`): the
 * innermost frame of the stack a chunk registered names that chunk. Parsed again only when chunks were added.
 */
const readDebugIdFiles = (): ReadonlyMap<string, string> => {
  const injected = (globalThis as { _sentryDebugIds?: InjectedDebugIds })._sentryDebugIds;
  const entries = injected === undefined ? [] : Object.entries(injected);
  if (debugIdFiles?.count !== entries.length) {
    const byFile = new Map<string, string>();
    for (const [stack, debugId] of entries) {
      const file = defaultStackParser(stack).findLast((frame) => frame.filename !== undefined)?.filename;
      if (file !== undefined) {
        byFile.set(file, debugId);
      }
    }
    debugIdFiles = { count: entries.length, byFile };
  }
  return debugIdFiles.byFile;
};

/**
 * The stack frames of an error, parsed by the SDK's own stack parser (oldest first, as Sentry
 * expects), and the debug images that let Sentry resolve them (principle 7).
 *
 * @param stack - The error's stack, already capped.
 * @returns The frames and the images for the chunks they name.
 */
const parseStackForEnvelope = (
  stack: string | undefined,
): { readonly frames: StackFrame[]; readonly images: DebugImage[] } => {
  if (stack === undefined || stack === '') {
    return { frames: [], images: [] };
  }
  const frames = defaultStackParser(stack);
  const byFile = readDebugIdFiles();
  const files = new Set(frames.flatMap((frame) => (frame.filename === undefined ? [] : [frame.filename])));
  const images = [...files].flatMap((file): DebugImage[] => {
    const debugId = byFile.get(file);
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Sentry's debug image fields.
    return debugId === undefined ? [] : [{ type: 'sourcemap', code_file: file, debug_id: debugId }];
  });
  return { frames, images };
};

/** The browser's user agent, for the `User-Agent` request header the SDK sends too. */
const readUserAgent = (): string | undefined =>
  typeof navigator === 'undefined' || navigator.userAgent === '' ? undefined : navigator.userAgent;

const buildEnvelope = ({ dsn, error, tags, stackLimit, fingerprint }: EnvelopeInput): Envelope => {
  const isError = error instanceof Error;
  const stack = isError && error.stack !== undefined ? error.stack.slice(0, stackLimit) : undefined;
  const { frames, images } = parseStackForEnvelope(stack);
  const userAgent = readUserAgent();
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
          ...(frames.length === 0 ? {} : { stacktrace: { frames } }),
        },
      ],
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Sentry's event field.
    ...(images.length === 0 ? {} : { debug_meta: { images } }),
    ...(stack === undefined ? {} : { extra: { stack } }),
    request: {
      url: globalThis.location.href,
      ...(userAgent === undefined ? {} : { headers: { [userAgentHeader]: userAgent } }),
    },
    ...(fingerprint === undefined ? {} : { fingerprint: [...fingerprint] }),
  };
  // Given the processor's context and the reporter's details, decorated as the SDK's own events are (principle 7).
  const withContext = decorateForNetworkFailure(applyTauEventContext(applyErrorDetails(plain, error)), error);
  const event = scrubSentryEvent(
    isStaleBuildTag(staleBuild) ? decorateForStaleBuild(withContext, staleBuild) : withContext,
  );
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Sentry's envelope header fields.
  const header = { event_id: event.event_id, sent_at: new Date().toISOString(), dsn };
  const body = `${JSON.stringify(header)}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
  return { body, size: new TextEncoder().encode(body).length };
};

/** One ordinary or `keepalive` request; rejects as `fetch` does. */
const request = async (endpoint: string, envelope: Envelope, keepalive: boolean): Promise<void> => {
  // A simple request (no preflight), as the SDK's own transport sends.
  await fetch(endpoint, {
    method: 'POST',
    body: envelope.body,
    keepalive,
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
  });
};

/**
 * Post one envelope, with `keepalive` when asked; never rejects. A `keepalive` request the browser
 * refused (the page's shared quota was full) goes once more as an ordinary one, which works while
 * the page lives: the same envelope, so Sentry keeps one event should both arrive. A refused
 * ordinary request (a content blocker) is simply lost.
 */
const post = async (endpoint: string, envelope: Envelope, keepalive: boolean): Promise<void> => {
  const release = keepalive ? holdInLedger(envelope.size) : undefined;
  try {
    await request(endpoint, envelope, keepalive);
    return;
  } catch {
    // Refused, or blocked: an ordinary request may still go.
  } finally {
    release?.();
  }
  if (keepalive) {
    try {
      await request(endpoint, envelope, false);
    } catch {
      // Blocked or unavailable: the error is lost, and nothing reports that.
    }
  }
};

/**
 * The browser's beacon, where it has one. `sendBeacon` answers at once whether the page's shared
 * keepalive quota had room, where a refused `keepalive` fetch only rejects later, when the page may
 * no longer run. A string body goes as `text/plain;charset=UTF-8`, a simple request, as the SDK's
 * own transport sends.
 */
const beaconOf = (): ((url: string, body: string) => boolean) | undefined => {
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Older engines have no beacons.
  const navigator = globalThis.navigator as Navigator | undefined;
  return typeof navigator?.sendBeacon === 'function' ? (url, body) => navigator.sendBeacon(url, body) : undefined;
};

const endpointOf = (): { readonly dsn: string; readonly endpoint: string } | undefined => {
  const dsn = ENV.SENTRY_DSN;
  const direct = dsn ? sentryEnvelopeUrl(dsn) : undefined;
  // The tunnel only forwards a DSN that parses (`sentryEnvelopeUrl`), so both checks hold for either path.
  const endpoint = direct !== undefined && usesSentryTunnel() ? sentryTunnelPath : direct;
  return dsn && endpoint !== undefined ? { dsn, endpoint } : undefined;
};

/**
 * Report an error without the SDK while the page lives, when the SDK's chunk could not be loaded:
 * one event, stamped with this page's own release and environment, with the SDK's frames, debug
 * images, `User-Agent` and the Tau context (principle 7), decorated and scrubbed as `beforeSend` does, its message and stack capped ({@link directEventTextLimit}), posted once as an
 * envelope, with `keepalive` while {@link keepaliveBudget} allows and as an ordinary request
 * otherwise. A value the SDK (or an earlier such event) already captured is skipped. Nothing is
 * stored and nothing is retried. On the web it goes through the same-origin tunnel
 * ({@link sentryTunnelPath}); if that is blocked as well, the error is lost.
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

/** One error to send as the page is hidden. */
export type HiddenPageReport = { readonly error: unknown; readonly tags: Readonly<Record<string, string>> };

/**
 * Report errors without the SDK as the page is hidden (the document hidden, or `pagehide`), where
 * only beacons and `keepalive` requests survive: within {@link keepaliveBudget} (counting what is
 * already in flight, {@link keepaliveLedger}), newest first, each stack trimmed to
 * {@link directEventTextLimit}`.stackAtPageExit`, and only while the browser takes each one: a
 * beacon where the browser has one, since its quota is the whole page's and only the browser knows
 * what is left of it; else a `keepalive` fetch, taken as queued. An error is marked captured only
 * once the browser took it.
 *
 * Hidden is not gone: what does not fit is the caller's still, to keep for the SDK or the next
 * hide. Only at exit (`isExit`, a `pagehide` the page will not come back from) is the rest counted
 * in one small final event ({@link undeliveredAtPageExitMessage}): room is kept for it while
 * anything might be left out, and the summary sent is the very envelope that room was measured
 * for, so its own bytes (a timestamp written longer, a shorter count) cannot push it out.
 *
 * @param reports - The errors and their tags, oldest first.
 * @param options - `isExit`: the page is going for good, so what is left is summarised and given up.
 * @returns The reports that need nothing more: sent now, or captured already.
 */
export const sendSentryEventsOnHide = <Report extends HiddenPageReport>(
  reports: readonly Report[],
  { isExit }: { readonly isExit: boolean },
): ReadonlySet<Report> => {
  const done = new Set(reports.filter((report) => isCaptured(report.error)));
  const target = endpointOf();
  if (target === undefined) {
    return done;
  }
  const newestFirst = reports.filter((report) => !done.has(report)).toReversed();
  const beacon = beaconOf();
  const queue = (envelope: Envelope): boolean => {
    if (beacon === undefined) {
      // async-iife: bootstrap -- the page may be going; nothing on it can wait for the answer.
      void post(target.endpoint, envelope, true);
      return true;
    }
    let isTaken = false;
    try {
      isTaken = beacon(target.endpoint, envelope.body);
    } catch {
      // Refused outright (a URL the browser will not beacon to): not queued.
    }
    if (isTaken) {
      // Never answered: held in the ledger for as long as it may take to go.
      setTimeout(holdInLedger(envelope.size), beaconHold);
    }
    return isTaken;
  };
  let left = newestFirst.length;
  // At exit, the summary for what is left if the next error does not go; replaced each time one does.
  let summary = isExit ? buildSummaryEnvelope(target.dsn, left) : undefined;
  for (const report of newestFirst) {
    const envelope = buildEnvelope({
      dsn: target.dsn,
      error: report.error,
      tags: report.tags,
      stackLimit: directEventTextLimit.stackAtPageExit,
    });
    const next = isExit && left > 1 ? buildSummaryEnvelope(target.dsn, left - 1) : undefined;
    if (!fitsKeepalive(envelope.size + (next?.size ?? 0), next === undefined ? 1 : 2) || !queue(envelope)) {
      break;
    }
    markCaptured(report.error);
    done.add(report);
    left -= 1;
    summary = next ?? summary;
  }
  if (summary !== undefined && left > 0 && fitsKeepalive(summary.size, 1)) {
    queue(summary);
  }
  return done;
};
