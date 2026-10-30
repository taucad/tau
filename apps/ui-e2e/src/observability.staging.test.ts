// @vitest-environment node
import process from 'node:process';
import { chromium, webkit, request } from 'playwright';
import { describe, expect, it } from 'vitest';
// oxlint-disable no-restricted-imports -- The Node-only target runs without browser aliases.
import {
  createObservabilityRunId,
  observeHarnessPage,
  harnessNavigationTimeout,
  harnessPath,
  observabilityUrl,
  productionOrigin,
  stagingOrigin,
} from './support/observability-staging.ts';
// oxlint-enable no-restricted-imports

// P1 intentionally proves only deployed harness access. These are not A1–A17 signal acceptance.
describe('P1 deployed staging observability harness', () => {
  it('should read staging event ids for tau-ui and tau-api', async () => {
    const token = process.env['SENTRY_E2E_READ_TOKEN'];
    expect(Boolean(token), 'Configure staging SENTRY_E2E_READ_TOKEN').toBe(true);
    await Promise.all(
      (
        [
          ['tau-ui', '4512297038446593'],
          ['tau-api', '4512297038512128'],
        ] as const
      ).map(async ([projectName, projectId]) => {
        const url = new URL('https://us.sentry.io/api/0/organizations/taucad/events/');
        url.searchParams.set('project', projectId);
        url.searchParams.set('environment', 'staging');
        url.searchParams.set('query', `e2e_run:${createObservabilityRunId()}`);
        url.searchParams.set('field', 'id');
        url.searchParams.set('statsPeriod', '1h');
        // A fresh correlation id avoids reading existing events; an empty 200 proves read access.
        const response = await fetch(url, {
          headers: { authorization: `Bearer ${token}` },
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
        }).catch(() => {
          throw new Error(`Sentry read check failed for ${projectName} without exposing response details`);
        });
        expect(response.status, `Sentry staging read access for ${projectName}`).toBe(200);
        const body: unknown = await response.json().catch(() => {
          throw new TypeError(`Sentry read check returned invalid JSON for ${projectName}`);
        });
        // Assert only a boolean so malformed responses cannot leak event contents in test output.
        expect(
          typeof body === 'object' && body !== null && 'data' in body && Array.isArray(body.data),
          `Sentry event-id result for ${projectName}`,
        ).toBe(true);
      }),
    );
  }, 20_000);

  for (const [browserName, browserType] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ] as const) {
    for (const consent of ['accepted', 'declined'] as const) {
      it(`should expose the staging harness in ${browserName} with consent ${consent}`, async () => {
        const browser = await browserType.launch({ headless: true });
        try {
          const context = await browser.newContext();
          await context.addCookies([
            { name: 'tau-entry', value: 'app', url: stagingOrigin },
            {
              name: 'tau-cookie-consent',
              value: encodeURIComponent(JSON.stringify({ status: consent, version: 1 })),
              url: stagingOrigin,
            },
          ]);
          const page = await context.newPage();
          const runId = createObservabilityRunId();
          const counts = observeHarnessPage(page, runId);
          const response = await page.goto(observabilityUrl(runId), {
            timeout: harnessNavigationTimeout,
            waitUntil: 'domcontentloaded',
          });
          expect(response?.status()).toBe(200);
          expect(new URL(page.url()).origin).toBe(stagingOrigin);
          await page.getByRole('heading', { name: 'Observability harness', exact: true }).waitFor();
          for (const label of [
            'Uncaught error',
            'Unhandled rejection',
            'FloatingPanel boundary',
            'Hydration mismatch',
            'Worker error',
            'Kernel worker termination',
            'SSR loader error',
            'Revision failure',
            'Direct-path send',
            'Memory pressure',
          ]) {
            // oxlint-disable-next-line no-await-in-loop -- Inspect controls in this one page, in order.
            await page.getByRole('button', { name: label, exact: true }).waitFor();
          }
          const build = await page.evaluate(() => {
            const environment = (globalThis as typeof globalThis & { ENV?: Record<string, unknown> }).ENV;
            return { buildId: environment?.['TAU_BUILD_ID'], release: environment?.['TAU_RELEASE'] };
          });
          expect(build.buildId).toMatch(/^\d+$/u);
          expect(build.release).toMatch(/^[\da-f]{7,12}$/u);
          const expectedCommit = process.env['TAU_OBSERVABILITY_DEPLOY_SHA'];
          if (expectedCommit) {
            expect(
              expectedCommit.startsWith(String(build.release)),
              'Staging advanced or has not served the triggering deployment',
            ).toBe(true);
          }
          // Only explicitly public build metadata is recorded; never page/event contents or cookies.
          console.info('Observed staging build', {
            browserName,
            consent,
            buildId: build.buildId,
            servedCommit: build.release,
            expectedCommit,
          });
          const cookies = await context.cookies();
          const cookie = cookies.find(({ name }) => name === 'tau-cookie-consent');
          expect(JSON.parse(decodeURIComponent(cookie?.value ?? 'null'))).toMatchObject({ status: consent });
          // Staging took everything the SDK sent it. A PostHog request that is answered with an error leaves the
          // page looking instrumented while the data is gone, which the suite otherwise only notices in the
          // eight-minute A2 cases, and only for captures. This is the same check in seventeen seconds.
          expect(
            Object.keys(counts).filter((key) => /^posthog:(?:failed|status:(?!2\d\d))/u.test(key)),
            'staging answered every PostHog request',
          ).toEqual([]);
        } finally {
          await browser.close();
        }
      }, 60_000);
    }
  }
});

describe('P4 production acceptance — OPEN until authorized deploy', () => {
  // Operator ruling 2026-10-26: defer only this legacy production URL check to P4.
  // Remove .skip after the authorized production deploy; a skipped check is not acceptance.
  it.skip('should return 404 for the harness on production', async () => {
    const api = await request.newContext();
    try {
      const response = await api.get(new URL(harnessPath, productionOrigin).href, { maxRedirects: 0 });
      expect(response.status()).toBe(404);
    } finally {
      await api.dispose();
    }
  });
});

// Explicit migration gates: enable with real signal assertions when their owners land.
// Polling support is unit-tested separately; an event id alone never proves source maps/context/count.
describe('Later staging signal acceptance — pending implementation', () => {
  it.todo(
    'P2: each browser/consent failure has exactly one resolved event and release, context and route tags (A1/A9/A10/A12)',
  );
  it.todo('P2: blocked Sentry ingest still delivers through the tunnel (A5)');
  it.todo('P3: physical-device kills carry samples and feedback (A3/A4/A11/A14)');
  it.todo('P5: consented events link PostHog replay; retired capture emits no PostHog exception (A8)');
});
