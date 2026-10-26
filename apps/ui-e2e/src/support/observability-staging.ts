import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

export const stagingOrigin = 'https://taucad.dev';
export const productionOrigin = 'https://tau.new';
export const harnessPath = '/__debug/observability';

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
  // oxlint-disable no-await-in-loop -- Polls are sequential and share one bounded deadline.
  while (Date.now() < deadline) {
    const response = await fetchEvents(url, {
      headers: { authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(Math.max(1, Math.min(15_000, deadline - Date.now()))),
    }).catch(() => {
      throw new Error('Sentry event query failed without exposing response details');
    });
    if (!response.ok && response.status !== 429 && response.status < 500) {
      throw new Error(`Sentry event query refused (HTTP ${response.status})`);
    }
    if (response.ok) {
      const body: unknown = await response.json().catch(() => {
        throw new TypeError('Sentry event query returned invalid JSON');
      });
      const ids = readEventIds(body);
      if (ids.length > 0) {
        return [...new Set(ids)];
      }
    }
    await sleep(Math.min(pollInterval, Math.max(0, deadline - Date.now())));
  }
  // oxlint-enable no-await-in-loop
  throw new Error('Sentry event query exceeded its bounded observation window');
}
