import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Page } from 'playwright';

export const stagingOrigin = 'https://taucad.dev';
export const productionOrigin = 'https://tau.new';
export const harnessPath = '/__debug/observability';

/**
 * How long one harness navigation may take. The harness boots the runtime kernel and the PostHog
 * extension bundles before `load`, which has been measured past Playwright's 30 s default on both
 * CI and a local run; the suite's other waits already allow 120 s.
 */
export const harnessNavigationTimeout = 120_000;

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

/** Record bounded counts and envelope ids even when navigation or an assertion fails. */
export const observeHarnessPage = (page: Page, runId: string): void => {
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
    console.info('Harness observation finished', { runId, counts, eventIds: [...eventIds] });
  });
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
  url.searchParams.set('environment', 'staging');
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
        console.info('Sentry run indexed', { runId, attempts, count: new Set(ids).size });
        return [...new Set(ids)];
      }
    }
    await sleep(Math.min(pollInterval, Math.max(0, deadline - Date.now())));
  }
  // oxlint-enable no-await-in-loop
  console.info('Sentry run not indexed', { runId, attempts, lastStatus });
  throw new Error('Sentry event query exceeded its bounded observation window');
}
