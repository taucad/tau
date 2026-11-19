import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Page } from 'playwright';

export const stagingOrigin = 'https://taucad.dev';
export const productionOrigin = 'https://tau.new';
export const harnessPath = '/__debug/observability';
/**
 * The environment the harness's events are filed under (`staging-e2e`, apart from real staging use), with `staging`
 * listed too: Sentry answers 404 to a query naming only environments it has never seen, as before the first run.
 */
export const harnessSentryEnvironments = ['staging', 'staging-e2e'] as const;

/**
 * How long one harness navigation may take. The harness boots the runtime kernel and the PostHog
 * extension bundles before `load`, which has been measured past Playwright's 30 s default on both
 * CI and a local run; the suite's other waits already allow 120 s.
 */
export const harnessNavigationTimeout = 120_000;

/**
 * Whether a Sentry envelope carries an error event: an item whose header is `{"type":"event"}`. The SDK also posts
 * session updates and transactions to the tunnel, and in WebKit a session update usually answers first, so a wait on
 * the first tunnel response closes the browser while the error is still in flight.
 *
 * @param body - The posted envelope: its header line, then each item's header line and its one-line payload.
 * @returns `true` for an envelope with an error event in it.
 */
export const isEventEnvelope = (body: string | undefined): boolean => {
  const lines = body?.split('\n') ?? [];
  // ponytail: one payload line per item, as the browser SDK writes them; a multi-line binary attachment would misalign.
  for (let index = 1; index < lines.length; index += 2) {
    try {
      const header: unknown = JSON.parse(lines[index] ?? '');
      if (typeof header === 'object' && header !== null && 'type' in header && header.type === 'event') {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
};

/** One correlation id per failure, browser and consent decision. */
export function createObservabilityRunId(): string {
  return `e2e-${randomUUID()}`;
}

export function observabilityUrl(runId: string, trigger?: string): string {
  if (!/^e2e-[a-z\d-]+$/u.test(runId)) {
    throw new TypeError('Invalid observability run id');
  }
  const url = new URL(harnessPath, stagingOrigin);
  url.searchParams.set('e2e_run', runId);
  if (trigger) {
    url.searchParams.set('trigger', trigger);
  }
  return url.href;
}

/** Fixed categories only: paths, query values and foreign origins never reach diagnostics. */
export const observabilityRequestKind = (address: string): string => {
  const url = new URL(address);
  if (url.origin === stagingOrigin) {
    if (url.pathname === harnessPath) {
      return 'document';
    }
    if (url.pathname === '/api/monitoring') {
      return 'monitoring';
    }
    if (url.pathname.startsWith('/api/ph/')) {
      return 'posthog';
    }
  }
  if (url.origin === 'https://api.taucad.dev' && url.pathname === '/v1/__debug/observability/failure') {
    return 'api-failure';
  }
  return 'other';
};

/**
 * Record bounded counts and envelope ids even when navigation or an assertion fails. The returned record is the
 * live one the listeners write to, so a caller reads it after the page has settled and can assert on it.
 */
export const observeHarnessPage = (page: Page, runId: string): Readonly<Record<string, number>> => {
  observabilityUrl(runId);
  const counts: Record<string, number> = {};
  const eventIds = new Set<string>();
  const count = (key: string): void => {
    counts[key] = (counts[key] ?? 0) + 1;
  };
  console.info('Harness observation started', { runId });
  page.on('pageerror', () => {
    count('pageErrors');
  });
  page.on('requestfailed', (request) => {
    count(`${observabilityRequestKind(request.url())}:failed`);
  });
  page.on('response', (response) => {
    count(`${observabilityRequestKind(response.url())}:status:${String(response.status())}`);
  });
  page.on('request', (request) => {
    const kind = observabilityRequestKind(request.url());
    count(`${kind}:requests`);
    if (kind !== 'monitoring' || eventIds.size >= 20) {
      return;
    }
    try {
      const header: unknown = JSON.parse(request.postData()?.split('\n')[0] ?? '{}');
      if (
        typeof header === 'object' &&
        header !== null &&
        'event_id' in header &&
        typeof header.event_id === 'string' &&
        /^[\da-f]{32}$/u.test(header.event_id)
      ) {
        eventIds.add(header.event_id);
      }
    } catch {
      count('monitoring:unreadableHeader');
    }
  });
  page.once('close', () => {
    console.info('Harness observation finished', {
      runId,
      counts,
      eventIds: [...eventIds],
    });
  });
  return counts;
};

type PollOptions = {
  token: string;
  runId: string;
  /** Milliseconds; capped at the blueprint's three-minute bound. */
  pollTimeout?: number;
  /** Milliseconds. */
  pollInterval?: number;
  fetchEvents?: typeof fetch;
};

function readEventIds(body: unknown): string[] {
  if (typeof body !== 'object' || body === null || !('data' in body) || !Array.isArray(body.data)) {
    throw new TypeError('Sentry event query returned an invalid result');
  }
  const rows: unknown[] = body.data;
  return rows.map((row) => {
    if (typeof row !== 'object' || row === null || !('id' in row) || typeof row.id !== 'string') {
      throw new TypeError('Sentry event query returned an invalid event id');
    }
    return row.id;
  });
}

/**
 * Poll only event ids: responses and credentials never enter logs or test artifacts.
 * Later signal acceptance fetches individual event details separately for scrubbed assertions.
 */
export async function pollSentryEventIds({
  token,
  runId,
  pollTimeout = 180_000,
  pollInterval = 5000,
  fetchEvents = fetch,
}: PollOptions): Promise<string[]> {
  observabilityUrl(runId);
  if (
    !token ||
    !Number.isFinite(pollTimeout) ||
    pollTimeout <= 0 ||
    pollTimeout > 180_000 ||
    !Number.isFinite(pollInterval) ||
    pollInterval <= 0
  ) {
    throw new TypeError('Sentry polling requires a token and bounded positive timing');
  }
  const url = new URL('https://us.sentry.io/api/0/organizations/taucad/events/');
  url.searchParams.set('project', '4512297038446593');
  for (const environment of harnessSentryEnvironments) {
    url.searchParams.append('environment', environment);
  }
  url.searchParams.set('query', `e2e_run:${runId}`);
  url.searchParams.set('field', 'id');
  url.searchParams.set('statsPeriod', '1h');
  const deadline = Date.now() + pollTimeout;
  let attempts = 0;
  let lastStatus = 0;
  // oxlint-disable no-await-in-loop -- Polls are sequential and share one bounded deadline.
  while (Date.now() < deadline) {
    attempts += 1;
    const response = await fetchEvents(url, {
      headers: { authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(Math.max(1, Math.min(15_000, deadline - Date.now()))),
    }).catch(() => {
      throw new Error('Sentry event query failed without exposing response details');
    });
    lastStatus = response.status;
    if (!response.ok && response.status !== 429 && response.status < 500) {
      throw new Error(`Sentry event query refused (HTTP ${response.status})`);
    }
    if (response.ok) {
      const body: unknown = await response.json().catch(() => {
        throw new TypeError('Sentry event query returned invalid JSON');
      });
      const ids = readEventIds(body);
      if (ids.length > 0) {
        console.info('Sentry run indexed', {
          runId,
          attempts,
          count: new Set(ids).size,
        });
        return [...new Set(ids)];
      }
    }
    await sleep(Math.min(pollInterval, Math.max(0, deadline - Date.now())));
  }
  // oxlint-enable no-await-in-loop
  console.info('Sentry run not indexed', { runId, attempts, lastStatus });
  throw new Error('Sentry event query exceeded its bounded observation window');
}

/** `tau-desktop`'s Sentry project id (the desktop DSN's project; the stats and release endpoints take ids, not slugs). */
export const tauDesktopProjectId = '4512297038446592';

/** What a failed desktop probe needs to explain itself: the read token, the release and the forcing's window. */
export type DesktopSignalWindow = {
  token: string;
  release: string;
  since: string;
  until: string;
};

/** A diagnostic read's answer: the counts it found, or why it could not be read (an HTTP status, never a body). */
export type DiagnosticReading<Counts> = Counts | { unreadable: string };

/**
 * Why a forced desktop signal was not found, in ids, counts and Sentry's own names only. Each entry rules a cause in
 * or out: the signal under another environment, any event of the release at all (the transport and the DSN), whether
 * Sentry knows the release (the build's release name), the release's sessions (main's SDK delivered something) and
 * the project's ingest outcomes over the window (filtered, rate limited or invalid at ingest).
 */
export type DesktopSignalDiagnostics = {
  /** For each missing signal, its events for the release by environment, with no environment filter. */
  signalByEnvironment: Record<string, DiagnosticReading<Record<string, number>>>;
  /** Every `tau-desktop` event for the release since the forcing, by environment. */
  releaseEventsByEnvironment: DiagnosticReading<Record<string, number>>;
  /** Whether `tau-desktop`'s release list holds the release, as `{ listed }`. */
  releaseListed: DiagnosticReading<{ listed: boolean }>;
  /** Release-health sessions for the release, by session status, over the hour-aligned window. */
  releaseSessions: DiagnosticReading<Record<string, number>>;
  /** `tau-desktop` error outcomes (`outcome` or `outcome:reason`) over the hour-aligned window, every release. */
  errorOutcomes: DiagnosticReading<Record<string, number>>;
};

const sentryApi = 'https://us.sentry.io/api/0/';
const hour = 60 * 60 * 1000;

const readSentry = async ({
  path,
  query,
  token,
  fetchSentry,
}: {
  path: string;
  query: URLSearchParams;
  token: string;
  fetchSentry: typeof fetch;
}): Promise<{ body: unknown } | { unreadable: string }> => {
  try {
    const response = await fetchSentry(new URL(`${path}?${query.toString()}`, sentryApi), {
      headers: { authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return { unreadable: `HTTP ${String(response.status)}` };
    }
    return { body: (await response.json()) as unknown };
  } catch {
    return { unreadable: 'no response' };
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Sum `count()` by `environment` from an aggregate events listing; only names and numbers leave it. */
const countByEnvironment = (body: unknown): DiagnosticReading<Record<string, number>> => {
  if (!isRecord(body) || !Array.isArray(body['data'])) {
    return { unreadable: 'unexpected shape' };
  }
  const counts: Record<string, number> = {};
  for (const row of body['data'] as unknown[]) {
    if (isRecord(row) && typeof row['count()'] === 'number') {
      const environment = typeof row['environment'] === 'string' ? row['environment'] : '(none)';
      counts[environment] = (counts[environment] ?? 0) + row['count()'];
    }
  }
  return counts;
};

/** Sum a stats or sessions series' totals by the named group keys, joined with `:`; only names and numbers leave it. */
const countByGroup = (
  body: unknown,
  keys: readonly string[],
  field: string,
): DiagnosticReading<Record<string, number>> => {
  if (!isRecord(body) || !Array.isArray(body['groups'])) {
    return { unreadable: 'unexpected shape' };
  }
  const counts: Record<string, number> = {};
  for (const group of body['groups'] as unknown[]) {
    if (!isRecord(group)) {
      continue;
    }
    const { by, totals } = group;
    const total = isRecord(totals) ? totals[field] : undefined;
    if (!isRecord(by) || typeof total !== 'number') {
      continue;
    }
    const name = keys
      .map((key) => by[key])
      .filter((part): part is string => typeof part === 'string' && part !== '')
      .join(':');
    counts[name || '(none)'] = (counts[name || '(none)'] ?? 0) + total;
  }
  return counts;
};

const aggregate = (query: string, { since, until }: DesktopSignalWindow, project: string): URLSearchParams => {
  const parameters = new URLSearchParams({
    project,
    query,
    start: since,
    end: until,
  });
  parameters.append('field', 'environment');
  parameters.append('field', 'count()');
  return parameters;
};

/** The window widened to whole hours, as the stats and sessions endpoints count. */
const hourWindow = ({ since, until }: DesktopSignalWindow): { start: string; end: string } => ({
  start: new Date(Math.floor(Date.parse(since) / hour) * hour).toISOString(),
  end: new Date(Math.ceil(Date.parse(until) / hour) * hour).toISOString(),
});

/**
 * Read why forced desktop signals are missing (T-R9.3). Every read is bounded and independent; one that fails reports
 * its HTTP status and the others still run. Nothing from an event's body, message or path is returned.
 *
 * @param missing - The `tau_event` names the probe did not find.
 * @param window - The token, the release and the forcing's window.
 * @param fetchSentry - The fetch to use, for tests.
 * @returns Counts and Sentry's own names only.
 */
export async function diagnoseMissingDesktopSignals(
  missing: readonly string[],
  window: DesktopSignalWindow,
  fetchSentry: typeof fetch = fetch,
): Promise<DesktopSignalDiagnostics> {
  const { token, release } = window;
  const read = async <Counts>(
    path: string,
    query: URLSearchParams,
    toCounts: (body: unknown) => DiagnosticReading<Counts>,
  ): Promise<DiagnosticReading<Counts>> => {
    const answer = await readSentry({ path, query, token, fetchSentry });
    return 'body' in answer ? toCounts(answer.body) : answer;
  };
  const events = 'organizations/taucad/events/';
  const { start, end } = hourWindow(window);
  const [signalReadings, releaseEventsByEnvironment, releaseListed, releaseSessions, errorOutcomes] = await Promise.all(
    [
      Promise.all(
        missing.map(async (signal) => {
          // The probe's own query (all projects, `project:` in the search) without its environment filter.
          const query = aggregate(`project:tau-desktop tau_event:${signal} release:"${release}"`, window, '-1');
          return [signal, await read(events, query, countByEnvironment)] as const;
        }),
      ),
      // By project id and with no tag, so neither the tag, the environment nor `project=-1` can hide an event.
      read(events, aggregate(`release:"${release}"`, window, tauDesktopProjectId), countByEnvironment),
      read(
        'organizations/taucad/releases/',
        new URLSearchParams({ project: tauDesktopProjectId, query: release }),
        (body) =>
          Array.isArray(body)
            ? {
                listed: body.some((entry: unknown) => isRecord(entry) && entry['version'] === release),
              }
            : { unreadable: 'unexpected shape' },
      ),
      read(
        'organizations/taucad/sessions/',
        new URLSearchParams({
          project: tauDesktopProjectId,
          field: 'sum(session)',
          groupBy: 'session.status',
          query: `release:"${release}"`,
          start,
          end,
          interval: '1h',
        }),
        (body) => countByGroup(body, ['session.status'], 'sum(session)'),
      ),
      read(
        'organizations/taucad/stats_v2/',
        (() => {
          const query = new URLSearchParams({
            project: tauDesktopProjectId,
            category: 'error',
            field: 'sum(quantity)',
            start,
            end,
            interval: '1h',
          });
          query.append('groupBy', 'outcome');
          query.append('groupBy', 'reason');
          return query;
        })(),
        (body) => countByGroup(body, ['outcome', 'reason'], 'sum(quantity)'),
      ),
    ],
  );
  return {
    signalByEnvironment: Object.fromEntries(signalReadings),
    releaseEventsByEnvironment,
    releaseListed,
    releaseSessions,
    errorOutcomes,
  };
}
