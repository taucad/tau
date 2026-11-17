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
  harnessSentryEnvironments,
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
        for (const environment of harnessSentryEnvironments) {
          url.searchParams.append('environment', environment);
        }
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

/*
 * T-R9.3 (desktop resilient startup blueprint, R9 and D5). The staging desktop job forces one file-service configure
 * failure and one unhealthy boot in a staging build of the release under test before this target runs, and names that
 * release in `TAU_DESKTOP_SENTRY_RELEASE` (`tau-desktop@<version>`). The probe then proves the pipe end to end: each
 * event arrives in `tau-desktop` exactly once for that release, carries no path, and the issue alert filtering on its
 * `tau_event` tag fired for it (tau-cloud I1). Neither event exists yet, and whether `tau-desktop` ingests anything
 * from 0.4.0 builds is unverified, so the row lands as `it.fails`; the package that emits the last event removes the
 * mark. Only ids, tag names and counts are asserted or logged.
 */
const desktopBootSignals = ['file_service.start_failed', 'desktop-boot-unhealthy'] as const;

/** A person's home, a macOS temporary folder or a rehearsal folder: what a report must never carry (Rules, 3). */
const personalPathPattern = /\/(?:Users|home)\/[^/\s"]+|[A-Za-z]:\\{1,2}Users|\/var\/folders\/|tau-desktop-e2e-pick-/u;

const sentryRead = async (path: string, token: string): Promise<unknown> => {
  const response = await fetch(new URL(path, 'https://us.sentry.io/api/0/'), {
    headers: { authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new Error('Sentry query failed without exposing response details');
  });
  if (!response.ok) {
    throw new Error(`Sentry query refused (HTTP ${String(response.status)})`);
  }
  return response.json().catch(() => {
    throw new TypeError('Sentry query returned invalid JSON');
  });
};

describe('R9 desktop boot signals on staging (T-R9.3)', () => {
  it.fails('should receive one file_service.start_failed and one desktop-boot-unhealthy for the release with no path and fire both alerts', async () => {
    const token = process.env['SENTRY_E2E_READ_TOKEN'] ?? '';
    expect(Boolean(token), 'Configure staging SENTRY_E2E_READ_TOKEN').toBe(true);
    const release = process.env['TAU_DESKTOP_SENTRY_RELEASE'] ?? '';
    expect(release, 'Name the forced staging release in TAU_DESKTOP_SENTRY_RELEASE').toMatch(/^tau-desktop@\S+$/u);
    const rules = await sentryRead('projects/taucad/tau-desktop/rules/?expand=lastTriggered', token);
    expect(Array.isArray(rules), 'tau-desktop issue alert rules').toBe(true);
    for (const signal of desktopBootSignals) {
      const query = new URLSearchParams({
        project: '-1',
        query: `project:tau-desktop tau_event:${signal} release:"${release}"`,
        field: 'id',
        statsPeriod: '24h',
      });
      for (const environment of harnessSentryEnvironments) {
        query.append('environment', environment);
      }
      // oxlint-disable-next-line no-await-in-loop -- Two queries, read in order so a refusal names its signal.
      const listing = await sentryRead(`organizations/taucad/events/?${query.toString()}`, token);
      const ids =
        typeof listing === 'object' && listing !== null && 'data' in listing && Array.isArray(listing.data)
          ? listing.data.flatMap((row: unknown) =>
              typeof row === 'object' && row !== null && 'id' in row && typeof row.id === 'string' ? [row.id] : [],
            )
          : [];
      expect(ids, `exactly one ${signal} for the release`).toHaveLength(1);
      const id = ids[0] ?? '';
      expect(id).toMatch(/^[\da-f]{32}$/u);
      // oxlint-disable-next-line no-await-in-loop -- One detail read for each signal.
      const detail = await sentryRead(`projects/taucad/tau-desktop/events/${id}/`, token);
      // Assert only a boolean so a leaked path never reaches the test output.
      expect(personalPathPattern.test(JSON.stringify(detail)), `${signal} carries no path`).toBe(false);
      const created =
        typeof detail === 'object' &&
        detail !== null &&
        'dateCreated' in detail &&
        typeof detail.dateCreated === 'string'
          ? Date.parse(detail.dateCreated)
          : Number.NaN;
      const fired = (Array.isArray(rules) ? rules : []).some((rule: unknown) => {
        const text = JSON.stringify(rule);
        const lastTriggered =
          typeof rule === 'object' && rule !== null && 'lastTriggered' in rule && typeof rule.lastTriggered === 'string'
            ? Date.parse(rule.lastTriggered)
            : Number.NaN;
        return text.includes('tau_event') && text.includes(signal) && lastTriggered >= created;
      });
      expect(fired, `the ${signal} alert fired for the event`).toBe(true);
      console.info('Desktop boot signal observed', { signal, eventId: id });
    }
  }, 120_000);
});
