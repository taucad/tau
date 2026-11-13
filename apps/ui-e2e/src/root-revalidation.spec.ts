/**
 * Root loader revalidation on a client navigation (loading-states blueprint, lane S-nav, row F11).
 *
 * The forced condition: every `.data` request that would run the root loader is held for 3 s in the
 * page. A click on a project row from Home must change the URL without one, so it never waits on the
 * server. The row fails on the defect's own assertion, the root `.data` requests the click issued,
 * never on a timeout.
 */
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

const projectRoute = /\/w\/[^/]+\/[^/]+$/u;
const destinationName = 'Project Navigation B';
const rootDataDelay = 3000;

/** One `.data` request that would run the root loader, and when the page issued it. */
type RootDataRequest = { readonly url: string; readonly at: number };

/** What the page recorded about the click and the requests and URL change that followed it. */
type NavigationRecord = {
  readonly clickAt: number | undefined;
  readonly pushAt: number | undefined;
  readonly rootDataRequests: readonly RootDataRequest[];
};

type RecorderWindow = Window & { __rootRevalidation?: NavigationRecord };

/**
 * Hold every root `.data` request by `holdDelay` milliseconds and record it, the first `pushState` and
 * the first click. A single fetch with no `_routes` parameter loads every matched route, the root
 * included; one with `_routes` loads only the routes it lists.
 */
const installRecorder = (holdDelay: number): void => {
  const record: { clickAt?: number; pushAt?: number; rootDataRequests: RootDataRequest[] } = {
    rootDataRequests: [],
  };
  (globalThis as unknown as RecorderWindow).__rootRevalidation = record as NavigationRecord;
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, globalThis.location.href);
    const routes = url.searchParams.get('_routes');
    const loadsRoot = url.pathname.endsWith('.data') && (routes === null || routes.split(',').includes('root'));
    if (loadsRoot) {
      record.rootDataRequests.push({ url: url.pathname + url.search, at: performance.now() });
      await new Promise((resolve) => {
        setTimeout(resolve, holdDelay);
      });
    }
    return originalFetch(input, init);
  };
  const originalPushState = history.pushState.bind(history);
  history.pushState = (...parameters: Parameters<History['pushState']>) => {
    record.pushAt ??= performance.now();
    originalPushState(...parameters);
  };
  globalThis.addEventListener(
    'click',
    () => {
      record.clickAt ??= performance.now();
    },
    { capture: true },
  );
};

const readRecord = async (): Promise<NavigationRecord> =>
  target.evaluate(() => {
    const record = (globalThis as unknown as RecorderWindow).__rootRevalidation;
    return {
      clickAt: record?.clickAt,
      pushAt: record?.pushAt,
      rootDataRequests: [...(record?.rootDataRequests ?? [])],
    };
  });

test.fails('F11 (U23, expected failure, S-nav): a click on a project row from Home changes the URL with no root loader request', async ({
  annotate,
}) => {
  await target.setViewport({ width: 1440, height: 900 });
  // Seeds projects A and B through the debug route, so Home lists both.
  await target.navigate('/__e2e/project-navigation');
  await target.expectUrl(projectRoute, 60_000);

  await target.addInitScript(installRecorder, rootDataDelay);
  await target.navigate('/');
  const row = selectors.getByRole('link', { name: destinationName, exact: true }).first();
  await target.expectVisible(row, 60_000);
  // Hydration and the seeded tab's own requests are not the click's: record from here.
  await target.evaluate(() => {
    const record = (globalThis as unknown as RecorderWindow).__rootRevalidation as {
      rootDataRequests: unknown[];
      clickAt?: number;
      pushAt?: number;
    };
    record.rootDataRequests.length = 0;
    record.clickAt = undefined;
    record.pushAt = undefined;
  });

  await target.click(row);
  await target.waitFor(
    () => (globalThis as unknown as RecorderWindow).__rootRevalidation?.pushAt !== undefined,
    undefined,
    {
      timeout: rootDataDelay * 3,
    },
  );
  const record = await readRecord();
  const elapsed = (record.pushAt ?? Number.NaN) - (record.clickAt ?? Number.NaN);
  await annotate(
    `click to pushState: ${elapsed.toFixed(1)} ms; root .data requests: ${record.rootDataRequests.length}`,
  );

  expect(record.rootDataRequests, 'the click re-ran the root loader on the server').toStrictEqual([]);
  expect(elapsed, 'the URL changed only after a held root loader request').toBeLessThan(rootDataDelay);
  await target.expectUrl(projectRoute);
});
