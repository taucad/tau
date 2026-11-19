// @vitest-environment node
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, webkit, request } from 'playwright';
import { describe, expect, it } from 'vitest';
// oxlint-disable no-restricted-imports -- The Node-only target runs without browser aliases.
import {
  createObservabilityRunId,
  diagnoseMissingDesktopSignals,
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
 * T-R9.3 (desktop resilient startup blueprint, R9 and D5). `desktop-boot-signals-staging.yml` downloads the published
 * staging release under test, forces one unhealthy boot and one file-service configure failure in it
 * (`apps/desktop/scripts/force-boot-signals.sh`), then runs these rows with that release named in
 * `TAU_DESKTOP_SENTRY_RELEASE` (`tau-desktop@<version>`) and the time the forcing began in `TAU_DESKTOP_SIGNALS_SINCE`,
 * so only that forcing's events count and the same release can be forced again. The renderer's
 * `file_service.start_failed` crosses IPC and leaves from main, so both events are filed in `tau-desktop` under main's
 * environment and release.
 *
 * Ingestion and alerting are separate rows, so the pipe can be proved before the issue alerts of tau-cloud I1 exist:
 * the first looks for each signal on its own, logs what it found for each, and asserts each arrived exactly once and
 * carries no path; the second that the alert filtering on its `tau_event` tag fired for it. No published staging
 * release emits both events yet, and I1 is not applied, so both rows land as `it.fails`; each mark goes when its row
 * passes on a dispatched run. Only ids, tag names and counts are asserted or logged. When a signal is missing the
 * first row also logs `diagnoseMissingDesktopSignals`: the signal under any environment, every event and session of
 * the release, whether Sentry lists the release, and the project's error outcomes at ingest over the window.
 */
const desktopBootSignals = ['file_service.start_failed', 'desktop-boot-unhealthy'] as const;
type DesktopBootSignal = (typeof desktopBootSignals)[number];

/** A person's home, a macOS temporary folder or a rehearsal folder: what a report must never carry (Rules, 3). */
const personalPathPattern = /\/(?:Users|home)\/[^/\s"]+|[A-Za-z]:\\{1,2}Users|\/var\/folders\/|tau-desktop-e2e-pick-/u;

/** How long a forced event may take to be searchable, and how often to look. */
const desktopSignalWindow = 180_000;
const desktopSignalInterval = 10_000;
/** After the first sighting, one more read this much later, so a late duplicate is still counted. */
const desktopSignalSettle = 15_000;

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

/** The oldest forcing the probe reads back: Sentry's event search is not asked further than this. */
const desktopSignalSinceLimit = 7 * 24 * 60 * 60 * 1000;

type DesktopSignalInputs = { token: string; release: string; since: string };

const desktopSignalInputs = (): DesktopSignalInputs => {
  const token = process.env['SENTRY_E2E_READ_TOKEN'] ?? '';
  expect(Boolean(token), 'Configure staging SENTRY_E2E_READ_TOKEN').toBe(true);
  const release = process.env['TAU_DESKTOP_SENTRY_RELEASE'] ?? '';
  expect(release, 'Name the forced staging release in TAU_DESKTOP_SENTRY_RELEASE').toMatch(/^tau-desktop@\S+$/u);
  const since = process.env['TAU_DESKTOP_SIGNALS_SINCE'] ?? '';
  expect(since, 'Name when the forcing began in TAU_DESKTOP_SIGNALS_SINCE (UTC, ISO 8601)').toMatch(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u,
  );
  const age = Date.now() - Date.parse(since);
  expect(age >= -60_000 && age <= desktopSignalSinceLimit, 'TAU_DESKTOP_SIGNALS_SINCE is within the last 7 days').toBe(
    true,
  );
  return { token, release, since };
};

/** The ids of one signal's events in `tau-desktop` for the release since the forcing began, in staging. */
const readSignalIds = async (
  signal: DesktopBootSignal,
  { release, since, token }: DesktopSignalInputs,
): Promise<string[]> => {
  const query = new URLSearchParams({
    project: '-1',
    query: `project:tau-desktop tau_event:${signal} release:"${release}"`,
    field: 'id',
    start: since,
    end: new Date().toISOString(),
  });
  for (const environment of harnessSentryEnvironments) {
    query.append('environment', environment);
  }
  const listing = await sentryRead(`organizations/taucad/events/?${query.toString()}`, token);
  return typeof listing === 'object' && listing !== null && 'data' in listing && Array.isArray(listing.data)
    ? listing.data.flatMap((row: unknown) =>
        typeof row === 'object' && row !== null && 'id' in row && typeof row.id === 'string' ? [row.id] : [],
      )
    : [];
};

/** Wait for a signal's events to be searchable, then read once more after a settle so a duplicate is counted. */
const pollSignalIds = async (signal: DesktopBootSignal, inputs: DesktopSignalInputs): Promise<string[]> => {
  const deadline = Date.now() + desktopSignalWindow;
  let attempts = 0;
  // oxlint-disable no-await-in-loop -- Sequential reads that share one bounded deadline.
  while (Date.now() < deadline) {
    attempts += 1;
    const seen = await readSignalIds(signal, inputs);
    if (seen.length > 0) {
      await sleep(desktopSignalSettle);
      const ids = await readSignalIds(signal, inputs);
      console.info('Desktop boot signal indexed', { signal, attempts, count: ids.length });
      return ids;
    }
    await sleep(Math.min(desktopSignalInterval, Math.max(0, deadline - Date.now())));
  }
  // oxlint-enable no-await-in-loop
  console.info('Desktop boot signal not indexed', { signal, attempts });
  return [];
};

const eventCreated = (detail: unknown): number =>
  typeof detail === 'object' && detail !== null && 'dateCreated' in detail && typeof detail.dateCreated === 'string'
    ? Date.parse(detail.dateCreated)
    : Number.NaN;

describe('R9 desktop boot signals on staging (T-R9.3)', () => {
  // Expected-failure: @rifont until 2026-12-15
  it.fails('should receive exactly one file_service.start_failed and one desktop-boot-unhealthy for the release with no path', async () => {
    const inputs = desktopSignalInputs();
    /* Each signal is looked for on its own, so a missing one never hides what the other did; the row fails at the
     * end, naming every signal that was missing, duplicated or carried a path. */
    const findings = await Promise.all(
      desktopBootSignals.map(async (signal) => {
        const ids = await pollSignalIds(signal, inputs);
        const [id] = ids;
        const readableId = ids.length === 1 && id !== undefined && /^[\da-f]{32}$/u.test(id);
        let carriesPath = false;
        if (readableId) {
          const detail = await sentryRead(`projects/taucad/tau-desktop/events/${id}/`, inputs.token);
          // Only a boolean leaves the detail, so a leaked path never reaches the test output.
          carriesPath = personalPathPattern.test(JSON.stringify(detail));
        }
        console.info('Desktop boot signal result', {
          signal,
          found: ids.length > 0,
          count: ids.length,
          eventIds: ids,
        });
        return { signal, count: ids.length, readableId, carriesPath };
      }),
    );
    /* A missing signal explains itself: where else it, or anything of the release, landed, and what ingest did with
     * the project's errors over the window. Counts and Sentry's own names only. */
    const missing = findings.filter(({ count }) => count === 0).map(({ signal }) => signal);
    if (missing.length > 0) {
      const diagnostics = await diagnoseMissingDesktopSignals(missing, { ...inputs, until: new Date().toISOString() });
      console.info('Desktop boot signal diagnostics', JSON.stringify(diagnostics));
    }
    const problems = findings.flatMap(({ signal, count, readableId, carriesPath }) => {
      if (count !== 1) {
        return [`${signal}: ${String(count)} events since the forcing, expected exactly one`];
      }
      if (!readableId) {
        return [`${signal}: the event id is not a Sentry event id`];
      }
      return carriesPath ? [`${signal}: carries a path`] : [];
    });
    expect(problems, 'each desktop boot signal arrived exactly once, with no path').toEqual([]);
  }, 480_000);

  // Expected-failure: @rifont until 2026-12-15
  it.fails('should fire the tau_event issue alert for each forced desktop boot signal (tau-cloud I1)', async () => {
    const inputs = desktopSignalInputs();
    const { token } = inputs;
    const rules = await sentryRead('projects/taucad/tau-desktop/rules/?expand=lastTriggered', token);
    expect(Array.isArray(rules), 'tau-desktop issue alert rules').toBe(true);
    for (const signal of desktopBootSignals) {
      // oxlint-disable-next-line no-await-in-loop -- The ingestion row already waited; one read for each signal.
      const [id] = await readSignalIds(signal, inputs);
      expect(id, `a ${signal} event for the release`).toMatch(/^[\da-f]{32}$/u);
      // oxlint-disable-next-line no-await-in-loop -- One detail read for each signal.
      const created = eventCreated(await sentryRead(`projects/taucad/tau-desktop/events/${id ?? ''}/`, token));
      const fired = (Array.isArray(rules) ? rules : []).some((rule: unknown) => {
        const text = JSON.stringify(rule);
        const lastTriggered =
          typeof rule === 'object' && rule !== null && 'lastTriggered' in rule && typeof rule.lastTriggered === 'string'
            ? Date.parse(rule.lastTriggered)
            : Number.NaN;
        return text.includes('tau_event') && text.includes(signal) && lastTriggered >= created;
      });
      expect(fired, `the ${signal} alert fired for the event`).toBe(true);
    }
  }, 60_000);
});
