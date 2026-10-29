// @vitest-environment node
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
// oxlint-disable no-restricted-imports -- The Node-only target runs without browser aliases.
import {
  createObservabilityRunId,
  harnessNavigationTimeout,
  observeHarnessPage,
  observabilityUrl,
  pollSentryEventIds,
  stagingOrigin,
} from './support/observability-staging.ts';
// oxlint-enable no-restricted-imports

/*
 * P2 signal acceptance for server-side render errors (A9, SB10) and browser–API correlation (A12, SB13) on the
 * deployed staging site. Only ids, tags and frame locations are read back; no response body, cookie or token is
 * logged.
 */

const sentryApi = 'https://us.sentry.io/api/0';
// React Router gives a folder route the folder's path as its id, so
// `routes/[__debug].observability/route.tsx` is `routes/[__debug].observability`
// with no `/route` suffix. The unit-test fixtures in `sentry.server.test.ts` and
// `sentry.server-sdk.test.ts` carry a `/route` suffix, but those are arbitrary
// strings the code under test only passes through; they do not describe the real id.
const harnessRouteId = 'routes/[__debug].observability';
/** The blueprint's bound on waiting for Sentry to index an event. */
const pollTimeout = 180_000;
const pollInterval = 5000;
/** How long a second query waits for a duplicate before calling one event "exactly one". */
const duplicateWindow = 20_000;
const requestIdPattern = /^[\w-]{1,64}$/u;

type SentryTag = { key: string; value: string };
type SentryFrame = { filename?: string; function?: string; inApp?: boolean };
type SentryEventDetail = {
  tags: SentryTag[];
  release?: { version?: string };
  environment?: string;
  entries: Array<{
    type: string;
    data: { values?: Array<{ value?: string; stacktrace?: { frames?: SentryFrame[] } }> };
  }>;
};

const readToken = (): string => {
  const token = process.env['SENTRY_E2E_READ_TOKEN'];
  if (!token) {
    throw new Error('Configure staging SENTRY_E2E_READ_TOKEN');
  }
  return token;
};

/** One Sentry API read; refusals name only the status. */
const sentryGet = async (path: string, token: string): Promise<unknown> => {
  const response = await fetch(`${sentryApi}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new Error('Sentry API request failed without exposing response details');
  });
  if (!response.ok) {
    throw new Error(`Sentry API refused (HTTP ${String(response.status)})`);
  }
  return response.json().catch(() => {
    throw new TypeError('Sentry API returned invalid JSON');
  });
};

const eventDetail = async (project: string, eventId: string, token: string): Promise<SentryEventDetail> =>
  (await sentryGet(`/projects/taucad/${project}/events/${encodeURIComponent(eventId)}/`, token)) as SentryEventDetail;

const tagOf = (event: SentryEventDetail, key: string): string | undefined =>
  event.tags.find((tag) => tag.key === key)?.value;

/** Exactly one `tau-ui` event for the run: the first poll result, unchanged after a duplicate window. */
const singleRunEvent = async (runId: string, token: string): Promise<string> => {
  const first = await pollSentryEventIds({ token, runId, pollTimeout, pollInterval });
  await sleep(duplicateWindow);
  const settled = await pollSentryEventIds({ token, runId, pollTimeout: pollInterval * 3, pollInterval });
  expect(first).toHaveLength(1);
  expect(settled).toEqual(first);
  return first[0] ?? '';
};

/** The build the staging server renders pages for (`/health/build`), as `tau-ui@<build id>`. */
const stagingRelease = async (): Promise<string> => {
  const response = await fetch(new URL('/health/build', stagingOrigin), {
    headers: { cookie: 'tau-entry=app' },
    signal: AbortSignal.timeout(15_000),
  });
  expect(response.ok).toBe(true);
  const body = (await response.json()) as { buildId?: unknown };
  expect(String(body.buildId)).toMatch(/^\d+$/u);
  return `tau-ui@${String(body.buildId)}`;
};

/** `tau-api` event ids carrying a request id, polled within the same bound. */
const pollApiEventIds = async (requestId: string, token: string): Promise<string[]> => {
  const query = new URLSearchParams({ query: `request_id:${requestId}`, statsPeriod: '1h' });
  const deadline = Date.now() + pollTimeout;
  let attempts = 0;
  // oxlint-disable no-await-in-loop -- Polls are sequential and share one bounded deadline.
  while (Date.now() < deadline) {
    attempts += 1;
    const rows = (await sentryGet(`/projects/taucad/tau-api/events/?${query.toString()}`, token)) as Array<{
      eventID?: string;
      id?: string;
    }>;
    const ids = rows.map((row) => row.eventID ?? row.id ?? '').filter(Boolean);
    if (ids.length > 0) {
      return [...new Set(ids)];
    }
    await sleep(Math.min(pollInterval, Math.max(0, deadline - Date.now())));
  }
  // oxlint-enable no-await-in-loop
  console.info('API correlation not indexed', { requestId, attempts });
  throw new Error('tau-api event query exceeded its bounded observation window');
};

describe('P2 staging signal acceptance: SSR errors and API correlation', () => {
  it('A9: a loader that throws produces one runtime:ssr event with a resolved stack', async () => {
    const token = readToken();
    const runId = createObservabilityRunId();
    console.info('SSR observation started', { runId, phase: 'build' });
    const release = await stagingRelease();
    console.info('SSR observation started', { runId, phase: 'trigger' });

    const response = await fetch(observabilityUrl(runId, 'ssr-loader'), {
      headers: { cookie: 'tau-entry=app' },
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
    await response.body?.cancel();
    console.info('SSR trigger answered', { runId, status: response.status });
    expect(response.status).toBe(500);

    const event = await eventDetail('tau-ui', await singleRunEvent(runId, token), token);
    expect(tagOf(event, 'runtime')).toBe('ssr');
    expect(tagOf(event, 'route')).toBe(harnessRouteId);
    expect(tagOf(event, 'http_status')).toBe('500');
    expect(tagOf(event, 'e2e_run')).toBe(runId);
    expect(event.environment).toBe('staging');
    expect(event.release?.version).toBe(release);

    const exception = event.entries.find((entry) => entry.type === 'exception')?.data.values?.at(-1);
    expect(exception?.value).toBe('Observability harness SSR loader error');
    // Resolved through the uploaded `build/server` maps: the source file and function, not the server chunk.
    const top = exception?.stacktrace?.frames?.at(-1);
    expect(top?.filename ?? '').toMatch(/\[__debug\]\.observability\/route\.tsx$/u);
    expect(top?.function ?? '').toMatch(/loader/u);
    console.info('A9 observed', { runId, release, eventFound: true });
  }, 420_000);

  it('A12: a failed API call surfaces an error tagged api_request_id that matches the tau-api request_id', async () => {
    const token = readToken();
    const runId = createObservabilityRunId();
    const browser = await chromium.launch({ headless: true });
    let requestId: string | undefined;
    try {
      const context = await browser.newContext();
      await context.addCookies([
        { name: 'tau-entry', value: 'app', url: stagingOrigin },
        {
          name: 'tau-cookie-consent',
          value: encodeURIComponent(JSON.stringify({ status: 'declined', version: 1 })),
          url: stagingOrigin,
        },
      ]);
      const page = await context.newPage();
      observeHarnessPage(page, runId);
      const failed = page.waitForResponse((answer) => answer.url().includes('/v1/__debug/observability/failure'), {
        timeout: 60_000,
      });
      await page.goto(observabilityUrl(runId, 'api-failure'), {
        timeout: harnessNavigationTimeout,
        waitUntil: 'domcontentloaded',
      });
      const answer = await failed;
      console.info('API trigger answered', { runId, status: answer.status() });
      expect(answer.ok()).toBe(false);
      requestId = answer.headers()['request-id'];
      expect(requestId ?? '').toMatch(requestIdPattern);
      console.info('API correlation observed', { runId, requestId });
      await page.getByRole('status').filter({ hasText: 'API failure reported' }).waitFor({ timeout: 60_000 });
      // The page read the id through CORS, so the same id is on the reported error.
      await expect(page.getByRole('status').textContent()).resolves.toContain(requestId);
    } finally {
      await browser.close();
    }

    const uiEvent = await eventDetail('tau-ui', await singleRunEvent(runId, token), token);
    expect(tagOf(uiEvent, 'api_request_id')).toBe(requestId);

    const apiEventIds = await pollApiEventIds(requestId ?? '', token);
    expect(apiEventIds).toHaveLength(1);
    const apiEvent = await eventDetail('tau-api', apiEventIds[0] ?? '', token);
    expect(tagOf(apiEvent, 'request_id')).toBe(requestId);
    console.info('A12 observed', { runId, requestId, uiEventFound: true, apiEventFound: true });
  }, 600_000);
});
