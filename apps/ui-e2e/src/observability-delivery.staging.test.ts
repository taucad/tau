// @vitest-environment node
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, devices, webkit } from 'playwright';
import type { BrowserContext, BrowserType } from 'playwright';
import { describe, expect, it } from 'vitest';
// oxlint-disable no-restricted-imports -- The Node-only target runs without browser aliases.
import {
  createObservabilityRunId,
  observeHarnessPage,
  observabilityUrl,
  pollSentryEventIds,
  stagingOrigin,
} from './support/observability-staging.ts';
// oxlint-enable no-restricted-imports

/*
 * P2 delivery acceptance on deployed staging (browser observability SB1/SB5): A1 event context, A5
 * tunnel delivery with the Sentry ingest host blocked, A10 direct-path parity. Each case drives the
 * SB15 harness with its own `e2e_run` id and polls Sentry, bounded, for exactly its own events. Only
 * ids, tag names and booleans are asserted or logged; event contents and credentials never are.
 */

const token = process.env['SENTRY_E2E_READ_TOKEN'] ?? '';
/** Optional: a staging test account's API session cookie (`name=value`) and its opaque id, for A1's user count. */
const sessionCookie = process.env['TAU_OBSERVABILITY_E2E_SESSION_COOKIE'] ?? '';
const sessionUserId = process.env['TAU_OBSERVABILITY_E2E_USER_ID'] ?? '';

/** Time to wait after the first event before checking that no second one arrived. */
const duplicateWindow = 30_000;
const caseTimeout = 420_000;

/** The parts of a Sentry event detail these checks read. */
type SentryEventDetail = {
  readonly groupID?: string;
  readonly tags: ReadonlyArray<{ readonly key: string; readonly value: string }>;
  readonly contexts: Readonly<Record<string, Readonly<Record<string, unknown>> | undefined>>;
  /** Sentry serialises absent fields as `null`, so every field is read as `unknown`. */
  readonly user?: Readonly<Record<string, unknown>>;
  readonly entries: ReadonlyArray<{ readonly type: string; readonly data?: unknown }>;
};

type SentryFrame = {
  readonly filename?: string;
  readonly absPath?: string;
  readonly function?: unknown;
  readonly lineNo?: unknown;
  readonly inApp?: boolean;
};

const sentryGet = async (path: string): Promise<unknown> => {
  const response = await fetch(new URL(path, 'https://us.sentry.io').href, {
    headers: { authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new Error('Sentry detail query failed without exposing response details');
  });
  if (!response.ok) {
    throw new Error(`Sentry detail query refused (HTTP ${String(response.status)})`);
  }
  return response.json();
};

const readEvent = async (id: string): Promise<SentryEventDetail> => {
  if (!/^[\da-f]{32}$/u.test(id)) {
    throw new TypeError('Sentry returned an invalid event id');
  }
  return (await sentryGet(`/api/0/projects/taucad/tau-ui/events/${id}/`)) as SentryEventDetail;
};

const tagsOf = (event: SentryEventDetail): Readonly<Record<string, string>> =>
  Object.fromEntries(event.tags.map(({ key, value }) => [key, value]));

/** The frames of the event's first exception, oldest first. */
const framesOf = (event: SentryEventDetail): readonly SentryFrame[] => {
  const exception = event.entries.find((entry) => entry.type === 'exception')?.data as
    | { readonly values?: ReadonlyArray<{ readonly stacktrace?: unknown }> }
    | undefined;
  const stacktrace = exception?.values?.[0]?.stacktrace as { readonly frames?: readonly SentryFrame[] } | undefined;
  return stacktrace?.frames ?? [];
};

/** Poll for the run's events, then wait out a window and poll again: exactly one must exist. */
const exactlyOneEvent = async (runId: string): Promise<SentryEventDetail> => {
  const first = await pollSentryEventIds({ token, runId });
  await sleep(duplicateWindow);
  const settled = await pollSentryEventIds({ token, runId });
  expect(new Set([...first, ...settled]).size, 'Exactly one Sentry event for the run').toBe(1);
  return readEvent(settled[0] ?? '');
};

/** SB1's tags and the browser context Sentry derives from the kept `User-Agent` (A1). */
const expectEventContext = (event: SentryEventDetail): void => {
  const tags = tagsOf(event);
  expect(tags['route'], 'route tag').toMatch(/observability/u);
  expect(tags['device_class'], 'device_class tag').toMatch(/^(constrained|standard)$/u);
  expect(tags['build_id'], 'build_id tag').toMatch(/^\d+$/u);
  expect(tags['deploy_context'], 'deploy_context tag').toMatch(/^(production|deploy-preview|branch-deploy)$/u);
  expect(typeof event.contexts['browser']?.['name'], 'browser.name').toBe('string');
  expect(typeof event.contexts['os']?.['name'], 'os.name').toBe('string');
  expect(event.contexts['device'], 'device context').toBeDefined();
  expect(event.contexts['tau.device'], 'tau.device context').toBeDefined();
  expect(event.contexts['tau.session'], 'tau.session context').toBeDefined();
};

/** The throwing frame resolves to source: a file from the app tree and a line, not a minified chunk. */
const expectResolvedTopFrame = (event: SentryEventDetail): void => {
  const top = framesOf(event).findLast((frame) => frame.inApp !== false);
  expect(top, 'an in-app frame').toBeDefined();
  expect(top?.filename, 'top frame resolved to source').not.toMatch(/\/assets\/[^/]+\.js$/u);
  expect(top?.filename, 'top frame in the harness route').toMatch(/observability/u);
  expect(typeof top?.lineNo, 'top frame line').toBe('number');
};

/** A phone in each engine: Sentry derives a `device` context from a mobile User-Agent. */
const engines = [
  ['chromium', chromium, devices['Pixel 7']],
  ['webkit', webkit, devices['iPhone 14']],
] as const;

/** Open the harness on one trigger and wait until the tunnel answered, so the browser does not close first. */
const triggerAndAwaitDelivery = async (context: BrowserContext, runId: string, trigger: string): Promise<void> => {
  const page = await context.newPage();
  observeHarnessPage(page, runId);
  const delivered = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/monitoring', {
    timeout: 60_000,
  });
  await page.goto(observabilityUrl(runId, trigger), { waitUntil: 'load' });
  await delivered;
};

const openHarness = async (
  browserType: BrowserType,
  device: (typeof devices)[string],
  run: (context: BrowserContext) => Promise<void>,
): Promise<void> => {
  const browser = await browserType.launch({ headless: true });
  try {
    const context = await browser.newContext({ ...device });
    await context.addCookies([
      { name: 'tau-entry', value: 'app', url: stagingOrigin },
      ...(sessionCookie.includes('=')
        ? [
            {
              name: sessionCookie.slice(0, sessionCookie.indexOf('=')),
              value: sessionCookie.slice(sessionCookie.indexOf('=') + 1),
              url: 'https://api.taucad.dev',
              secure: true,
            },
          ]
        : []),
    ]);
    await run(context);
  } finally {
    await browser.close();
  }
};

describe('P2 staging delivery acceptance (A1, A5, A10)', () => {
  it('should have the staging read token', () => {
    expect(Boolean(token), 'Configure staging SENTRY_E2E_READ_TOKEN').toBe(true);
  });

  for (const [engine, browserType, device] of engines) {
    it(
      `A1: a ${engine} error carries browser, OS, device and the route tag`,
      async () => {
        const runId = createObservabilityRunId();
        await openHarness(browserType, device, async (context) => triggerAndAwaitDelivery(context, runId, 'uncaught'));

        const event = await exactlyOneEvent(runId);

        expectEventContext(event);
        expectResolvedTopFrame(event);
        console.info('A1 observed', { engine, runId, hasUser: typeof event.user?.['id'] === 'string' });
      },
      caseTimeout,
    );

    it(
      `A5: with the Sentry ingest host blocked in ${engine}, the error arrives through /api/monitoring`,
      async () => {
        const runId = createObservabilityRunId();
        let tunnelled = 0;
        await openHarness(browserType, device, async (context) => {
          // As a content blocker would: every request to a Sentry ingest host is refused.
          await context.route(/^https:\/\/[^/]*ingest[^/]*\.sentry\.io\//u, async (route) =>
            route.abort('blockedbyclient'),
          );
          const page = await context.newPage();
          observeHarnessPage(page, runId);
          page.on('request', (request) => {
            if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/monitoring') {
              tunnelled += 1;
            }
          });
          const delivered = page.waitForResponse(
            (response) => new URL(response.url()).pathname === '/api/monitoring' && response.ok(),
            { timeout: 60_000 },
          );
          await page.goto(observabilityUrl(runId, 'uncaught'), { waitUntil: 'load' });
          await delivered;
        });

        const event = await exactlyOneEvent(runId);

        expect(tunnelled, 'posted through the tunnel').toBeGreaterThan(0);
        expect(tagsOf(event)['delivery'], 'sent by the SDK').toBeUndefined();
      },
      caseTimeout,
    );

    it(
      `A10: a ${engine} direct-path event has resolved frames, browser context and the SB1 tags`,
      async () => {
        const runId = createObservabilityRunId();
        await openHarness(browserType, device, async (context) => triggerAndAwaitDelivery(context, runId, 'direct'));

        const event = await exactlyOneEvent(runId);

        expect(tagsOf(event)['delivery'], 'sent without the SDK').toBe('without-sdk');
        expectEventContext(event);
        expectResolvedTopFrame(event);
      },
      caseTimeout,
    );
  }

  it.skipIf(sessionCookie === '' || sessionUserId === '')(
    'A1: a signed-in error carries the opaque user id and counts one affected user',
    async () => {
      const runId = createObservabilityRunId();
      await openHarness(chromium, devices['Pixel 7'], async (context) =>
        triggerAndAwaitDelivery(context, runId, 'uncaught'),
      );

      const event = await exactlyOneEvent(runId);

      expect(event.user?.['id'] === sessionUserId, 'user.id is the opaque Tau id').toBe(true);
      const user = event.user ?? {};
      for (const field of ['email', 'username', 'name', 'ip_address']) {
        expect(user[field] ?? undefined, `no ${field}`).toBeUndefined();
      }
      const issue = (await sentryGet(`/api/0/organizations/taucad/issues/${event.groupID ?? ''}/`)) as {
        readonly userCount?: number;
      };
      expect(issue.userCount, 'affected users').toBe(1);
    },
    caseTimeout,
  );
});
