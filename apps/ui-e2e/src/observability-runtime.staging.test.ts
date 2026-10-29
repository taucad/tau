// @vitest-environment node
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { gunzipSync } from 'node:zlib';
import { chromium, devices, webkit } from 'playwright';
import type { BrowserContext, BrowserType, Page, Request } from 'playwright';
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
 * P2/P3 runtime-reporting acceptance on deployed staging (browser observability SB4): A2, a FloatingPanel boundary
 * error and a hydration mismatch each produce exactly one Sentry event while PostHog receives no `$exception`; A6,
 * a kernel worker killed during a render produces one event tagged with the runtime kernel id, never labelled
 * out-of-memory from the termination alone (runtime I5). Each case drives the SB15 harness with its own `e2e_run`
 * id. Only ids, tag names, tag values of the runtime vocabulary and counts are asserted or logged; event contents,
 * PostHog payloads and credentials never are.
 */

const token = process.env['SENTRY_E2E_READ_TOKEN'] ?? '';

/** Time to wait after the first event before checking that no second one arrived. */
const duplicateWindow = 30_000;
const caseTimeout = 480_000;
/** The runtime plugin-kernel id (`runtimeKernelIds`) that evaluates the harness's `model.scad`. */
const harnessKernelId = 'openrscad';

type SentryEventDetail = {
  readonly tags: ReadonlyArray<{ readonly key: string; readonly value: string }>;
  readonly contexts: Readonly<Record<string, Readonly<Record<string, unknown>> | undefined>>;
  readonly entries: ReadonlyArray<{
    readonly type: string;
    readonly data?: { readonly values?: ReadonlyArray<{ readonly type?: string; readonly value?: string }> };
  }>;
};

const readEvent = async (id: string): Promise<SentryEventDetail> => {
  if (!/^[\da-f]{32}$/u.test(id)) {
    throw new TypeError('Sentry returned an invalid event id');
  }
  const response = await fetch(`https://us.sentry.io/api/0/projects/taucad/tau-ui/events/${id}/`, {
    headers: { authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new Error('Sentry detail query failed without exposing response details');
  });
  if (!response.ok) {
    throw new Error(`Sentry detail query refused (HTTP ${String(response.status)})`);
  }
  console.info('Reading Sentry event', { eventId: id });
  return (await response.json()) as SentryEventDetail;
};

const tagsOf = (event: SentryEventDetail): Readonly<Record<string, string>> =>
  Object.fromEntries(event.tags.map(({ key, value }) => [key, value]));

/** The outermost exception's type and value: the reported error itself. */
const exceptionOf = (event: SentryEventDetail): { readonly type?: string; readonly value?: string } =>
  event.entries.find((entry) => entry.type === 'exception')?.data?.values?.at(-1) ?? {};

/** Poll for the run's events, then wait out a window and poll again: exactly one must exist. */
const exactlyOneEvent = async (runId: string): Promise<SentryEventDetail> => {
  const first = await pollSentryEventIds({ token, runId });
  await sleep(duplicateWindow);
  const settled = await pollSentryEventIds({ token, runId });
  expect(new Set([...first, ...settled]).size, 'Exactly one Sentry event for the run').toBe(1);
  return readEvent(settled[0] ?? '');
};

/**
 * Decode one PostHog request body the way posthog-js encodes it: `gzip-js` (a gzip stream), `base64` (a form field
 * `data` holding base64 JSON) or plain JSON. Undecodable bodies decode to the empty string.
 */
const decodePosthogBody = (request: Request): string => {
  const body = request.postDataBuffer();
  if (body === null || body.length === 0) {
    return '';
  }
  try {
    if (body[0] === 0x1f && body[1] === 0x8b) {
      return gunzipSync(body).toString('utf8');
    }
    const text = body.toString('utf8');
    const data = text.startsWith('data=') ? new URLSearchParams(text).get('data') : null;
    return data === null ? text : Buffer.from(data, 'base64').toString('utf8');
  } catch {
    return '';
  }
};

/** What the page sent to PostHog: event captures seen, and how many of them carried `$exception`. */
type PosthogTraffic = {
  requests: number;
  captures: number;
  exceptions: number;
  undecodable: number;
  missingBody: number;
};

/** Watch every PostHog request the context sends through the same-origin `/api/ph` proxy. */
const observePosthog = (context: BrowserContext): PosthogTraffic => {
  const traffic: PosthogTraffic = { requests: 0, captures: 0, exceptions: 0, undecodable: 0, missingBody: 0 };
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== stagingOrigin || !url.pathname.startsWith('/api/ph/') || request.method() !== 'POST') {
      return;
    }
    traffic.requests += 1;
    if (request.postDataBuffer() === null) {
      traffic.missingBody += 1;
    }
    const body = decodePosthogBody(request);
    if (body === '') {
      traffic.undecodable += 1;
      return;
    }
    if (body.includes('"event"')) {
      traffic.captures += 1;
    }
    if (body.includes('"$exception"')) {
      traffic.exceptions += 1;
    }
  });
  return traffic;
};

/** A phone in each engine, as the delivery spec drives them. */
const engines = [
  ['chromium', chromium, devices['Pixel 7']],
  ['webkit', webkit, devices['iPhone 14']],
] as const;

type HarnessRun = {
  readonly browserType: BrowserType;
  readonly device: (typeof devices)[string];
  readonly runId: string;
  readonly trigger: string;
  readonly requirePosthog: boolean;
  readonly ready?: (page: Page) => Promise<void>;
};

/**
 * Open the harness on one trigger, with analytics consent accepted so PostHog is live, and wait until the tunnel
 * answered. `ready` is what else must be seen before the browser closes; `requirePosthog` waits until PostHog is
 * shown live, so that an absence of `$exception` proves something.
 */
const triggerAndAwaitDelivery = async ({
  browserType,
  device,
  runId,
  trigger,
  requirePosthog,
  ready,
}: HarnessRun): Promise<PosthogTraffic> => {
  const browser = await browserType.launch({ headless: true });
  try {
    const context = await browser.newContext({ ...device });
    // As in the analytics consent fixture, let PostHog capture this automated browser's events.
    // Its bot filter otherwise suppresses every event, making the no-$exception check inconclusive.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { configurable: true, value: false });
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        value: navigator.userAgent.replace('HeadlessChrome', 'Chrome'),
      });
    });
    await context.addCookies([
      { name: 'tau-entry', value: 'app', url: stagingOrigin },
      {
        name: 'tau-cookie-consent',
        value: encodeURIComponent(JSON.stringify({ status: 'accepted', version: 1 })),
        url: stagingOrigin,
      },
    ]);
    const traffic = observePosthog(context);
    context.once('close', () => {
      console.info('PostHog observation', { runId, ...traffic });
    });
    const page = await context.newPage();
    observeHarnessPage(page, runId);
    const delivered = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/monitoring', {
      timeout: 120_000,
    });
    await page.goto(observabilityUrl(runId, trigger), { waitUntil: 'load' });
    await ready?.(page);
    await delivered;
    if (requirePosthog) {
      await expect
        .poll(() => traffic.captures, { timeout: 60_000, message: 'PostHog captured at least one event' })
        .toBeGreaterThan(0);
      // Give an exception autocapture the error could have triggered time to leave the page.
      await sleep(5000);
    }
    return traffic;
  } finally {
    await browser.close();
  }
};

/** No PostHog request carried `$exception`, and none was unreadable, so none could have hidden one. */
const expectNoPosthogException = (traffic: PosthogTraffic): void => {
  expect(traffic.undecodable, 'every PostHog request body was readable').toBe(0);
  expect(traffic.exceptions, 'PostHog received no $exception').toBe(0);
};

describe('P2/P3 staging runtime-reporting acceptance (A2, A6)', () => {
  it('should have the staging read token', () => {
    expect(Boolean(token), 'Configure staging SENTRY_E2E_READ_TOKEN').toBe(true);
  });

  for (const [engine, browserType, device] of engines) {
    it(
      `A2: a ${engine} FloatingPanel boundary error is one Sentry event and no PostHog $exception`,
      async () => {
        const runId = createObservabilityRunId();
        const traffic = await triggerAndAwaitDelivery({
          browserType,
          device,
          runId,
          trigger: 'boundary',
          requirePosthog: true,
        });

        const event = await exactlyOneEvent(runId);

        expect(tagsOf(event)['boundary'], 'reported by the FloatingPanel boundary').toBe('floating-panel');
        expect(exceptionOf(event).value, 'the harness boundary error').toBe(
          'Observability harness FloatingPanel boundary error',
        );
        expect(typeof event.contexts['react']?.['componentStack'], 'React component stack').toBe('string');
        expectNoPosthogException(traffic);
        console.info('A2 boundary observed', { engine, runId, ...traffic });
      },
      caseTimeout,
    );

    it(
      `A2: a ${engine} hydration mismatch is one Sentry event and no PostHog $exception`,
      async () => {
        const runId = createObservabilityRunId();
        const traffic = await triggerAndAwaitDelivery({
          browserType,
          device,
          runId,
          trigger: 'hydration',
          requirePosthog: true,
        });

        const event = await exactlyOneEvent(runId);

        // Production React reports the mismatch by its error code; a development build names it.
        expect(exceptionOf(event).value ?? '', 'a hydration error').toMatch(
          /hydrat|react\.dev\/errors\/(?:418|423|425)\b/iu,
        );
        expectNoPosthogException(traffic);
        console.info('A2 hydration observed', { engine, runId, ...traffic });
      },
      caseTimeout,
    );

    it(
      `A6: a ${engine} kernel worker killed during a render is one Sentry event tagged with the kernel id`,
      async () => {
        const runId = createObservabilityRunId();
        await triggerAndAwaitDelivery({
          browserType,
          device,
          runId,
          trigger: 'kernel-termination',
          requirePosthog: false,
          ready: async (page) =>
            page.getByRole('status').filter({ hasText: 'Kernel worker terminated' }).waitFor({ timeout: 120_000 }),
        });

        const event = await exactlyOneEvent(runId);
        const tags = tagsOf(event);

        expect(exceptionOf(event).type, 'reported by the runtime client').toBe('RuntimeAttemptFailure');
        expect(tags['kernel'], 'the runtime plugin-kernel id').toBe(harnessKernelId);
        expect(tags['runtime.outcome'], 'a runtime failure outcome').toMatch(/^(?:terminated|timed-out)$/u);
        expect(tags['runtime.transport'], 'the browser worker transport').toBe('web-worker');
        if (tags['runtime.outcome'] === 'terminated') {
          expect(tags['runtime.close'], 'the transport close cause').toMatch(/^[\w-]+$/u);
        }
        // Runtime I5: a termination alone never names memory.
        const labels = [exceptionOf(event).value ?? '', ...Object.values(tags)].join(' ');
        expect(labels, 'no out-of-memory label without typed evidence').not.toMatch(/out[ -]of[ -]memory|\boom\b/iu);
        console.info('A6 observed', {
          engine,
          runId,
          kernel: tags['kernel'],
          outcome: tags['runtime.outcome'],
          close: tags['runtime.close'],
          phase: tags['runtime.phase'],
        });
      },
      caseTimeout,
    );
  }
});
