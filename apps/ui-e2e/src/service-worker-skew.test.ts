/**
 * The web app's service worker under deploy skew and request faults (PL7 service worker staging defects blueprint,
 * Brain `research/pl7-service-worker-staging-defects-blueprint.md`, FP0), on two real builds (`support/two-deploys.ts`
 * with `renamed`): the next deploy rebuilt the interactive-tier chunk `use-cookie-consent` and so every file that
 * imports it, the root route module included, so the previous deploy's worker holds none of them.
 *
 * Every fault is injected at the server, keyed on the request's `Sec-Fetch-Dest`, so the browser's HTTP cache stays on
 * and the page's own request is never the one that fails: a request the page makes for a chunk is a `script`, and
 * every request a service worker makes is `empty`. That is the content blocker of the staging stall (EasyList Cookie
 * List's `-cookie-consent-$~script`, Finding 2), and any other policy keyed on request type or credentials.
 *
 * The rule under test: a worker may make the online app faster or available offline, and never make it fail where no
 * worker would. Each row names the defect it pins.
 *
 * Merge-queue suite `test:e2e:deploy-skew` (operator decision 7: these rows bypass the five-nightly ratchet).
 *
 * Needs a built UI (`nx run ui:build`). `TAU_E2E_CHROMIUM_EXECUTABLE` points at a Chromium other than Playwright's
 * pinned revision.
 */
// @vitest-environment node
import process from 'node:process';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
// oxlint-disable no-restricted-imports -- The Node-only target runs without browser aliases.
import {
  prepareDeploys,
  projectShellUrl,
  readBuildId,
  startDeployServer,
  watchWorkerVersions,
} from './support/two-deploys.ts';
import type { DeployServer, Deploys } from './support/two-deploys.ts';
// oxlint-enable no-restricted-imports

/** `boot-watchdog.ts`'s deadline: a page that has not mounted its shell by then shows the strip. */
const bootDeadline = 20_000;

/** The chunk the next deploy rebuilt; the staging stall's blocked chunk. */
const rebuiltChunk = /^use-cookie-consent-[\w-]{8}\.js$/u;

const projectPath = '/w/home/bracket-v2';

type BootState = { readonly mounted: boolean; readonly stripShown: boolean; readonly buildId: string | undefined };

const readBootState = async (page: Page): Promise<BootState> => {
  try {
    return await page.evaluate(() => {
      const strip = document.querySelector<HTMLElement>('#tau-boot-strip');
      return {
        mounted: (globalThis as { __tauBoot?: { shellMounted?: boolean } }).__tauBoot?.shellMounted === true,
        stripShown: strip !== null && !strip.hidden,
        buildId: (globalThis as { ENV?: { TAU_BUILD_ID?: string } }).ENV?.TAU_BUILD_ID,
      };
    });
  } catch {
    return { mounted: false, stripShown: false, buildId: undefined };
  }
};

/** Wait for the app to mount its shell within the boot watchdog's deadline, then read where it booted. */
const waitForMount = async (page: Page): Promise<BootState> => {
  const mounted = async (): Promise<boolean> => {
    const state = await readBootState(page);
    return state.mounted;
  };
  await expect.poll(mounted, { timeout: bootDeadline, interval: 250 }).toBe(true);
  return readBootState(page);
};

/** Wait until a worker controls the page and is activated: its install has completed. */
const waitForControllingWorker = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated', undefined, {
    timeout: 60_000,
    polling: 250,
  });
};

describe('the web app’s service worker under deploy skew and request faults (PL7, FP0)', () => {
  let browser: Browser | undefined;
  let deploys: Deploys | undefined;
  let server: DeployServer | undefined;
  let context: BrowserContext | undefined;
  /** Every `/assets/*` request a page saw fail, as its console would show it. */
  let failedAssets: string[] = [];

  beforeAll(async () => {
    deploys = await prepareDeploys('service-worker-skew', { renamed: rebuiltChunk });
    browser = await chromium.launch({ executablePath: process.env['TAU_E2E_CHROMIUM_EXECUTABLE'] });
  }, 180_000);

  afterEach(async () => {
    await context?.close();
    await server?.close();
    context = undefined;
    server = undefined;
    failedAssets = [];
  });

  afterAll(async () => {
    await browser?.close();
    await deploys?.remove();
  });

  const watch = (page: Page): void => {
    page.on('requestfailed', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/assets/')) {
        failedAssets.push(`${pathname} ${request.failure()?.errorText ?? ''}`);
      }
    });
    page.on('response', (response) => {
      const { pathname } = new URL(response.url());
      if (pathname.startsWith('/assets/') && response.status() >= 400) {
        failedAssets.push(`${pathname} ${String(response.status())}`);
      }
    });
  };

  /** The next deploy's name for the rebuilt chunk. */
  const rebuiltChunkUrl = (): string => {
    const renamed = [...(deploys?.renames ?? new Map<string, string>())].find(([from]) => rebuiltChunk.test(from));
    if (renamed === undefined) {
      expect.fail('the next deploy did not rebuild the use-cookie-consent chunk');
    }
    return `/assets/${renamed[1]}`;
  };

  /**
   * A browser that installed the previous deploy's worker from `path` (outside a project workspace, B-27), with the
   * `tau-entry=app` preference, so `/` is Home.
   */
  const installPreviousWorker = async (path = '/'): Promise<{ readonly page: Page; readonly live: DeployServer }> => {
    if (browser === undefined || deploys === undefined) {
      expect.fail('the builds and browser did not start');
    }
    const live = await startDeployServer(
      deploys.builds,
      { shells: deploys.shells, workers: deploys.workers.scripts, clientRoots: deploys.clientRoots },
      { hold: false, retain: true },
    );
    server = live;
    context = await browser.newContext();
    await context.addCookies([{ name: 'tau-entry', value: 'app', url: live.origin }]);
    const page = await context.newPage();
    watch(page);
    await page.goto(`${live.origin}${path}`, { waitUntil: 'networkidle' });
    await waitForControllingWorker(page);
    return { page, live };
  };

  /* D1, D3: after the deploy, a reload under the previous worker is the next build's document; its rebuilt boot chunks
   * are not in that worker's precache. */
  it('control: should mount Home on the next build after a reload under the previous deploy’s worker', async () => {
    const { page, live } = await installPreviousWorker();
    live.deploy();
    failedAssets = [];
    await page.reload({ waitUntil: 'commit' });
    expect(await waitForMount(page)).toStrictEqual({
      mounted: true,
      stripShown: false,
      buildId: String(deploys?.nextBuildId),
    });
    expect(failedAssets).toStrictEqual([]);
  }, 180_000);

  it('should mount Home on the next build when only the worker’s request for a rebuilt boot chunk fails (D1)', async () => {
    const { page, live } = await installPreviousWorker();
    live.inject({ path: rebuiltChunkUrl(), destination: 'empty', kind: 'reset' });
    live.deploy();
    failedAssets = [];
    await page.reload({ waitUntil: 'commit' });
    expect(await waitForMount(page)).toStrictEqual({
      mounted: true,
      stripShown: false,
      buildId: String(deploys?.nextBuildId),
    });
    expect(failedAssets).toStrictEqual([]);
  }, 180_000);

  /* D2, D16: one precache entry of the next deploy that only the worker cannot fetch (here the project shell) must not
   * keep the next deploy's worker from installing. Its install stores what it can; the project's shell is then never
   * served from the cache, and Home's, whose closure is complete, still is. */
  it('should install the next worker when one precache entry cannot be fetched by the worker, and serve only complete classes offline (D2)', async () => {
    const { page, live } = await installPreviousWorker('/projects');
    if (context === undefined) {
      expect.fail('the browser did not start');
    }
    const versions = await watchWorkerVersions(context, page);
    await expect.poll(() => [...versions.statuses().values()], { timeout: 10_000 }).toContain('activated');
    const before = new Set(versions.statuses().keys());

    live.inject({ path: projectShellUrl, destination: 'empty', kind: 'reset' });
    live.deploy();
    // Home opens online, and the open's update check installs the next deploy's worker.
    await page.goto(`${live.origin}/`, { waitUntil: 'commit' });
    const online = await waitForMount(page);
    expect(online.mounted).toBe(true);

    const installedVersions = (): string[] =>
      [...versions.statuses()]
        .filter(([id, status]) => !before.has(id) && ['installed', 'activating', 'activated'].includes(status))
        .map(([, status]) => status);
    await expect.poll(installedVersions, { timeout: 60_000, interval: 500 }).not.toStrictEqual([]);
    await versions.stop();

    // The update rule activates it (`pwa-registration.ts` posts this once the verdict is `replaced`), and it takes
    // the page.
    const next = page;
    await next.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    });
    const takenOver = async (): Promise<boolean> =>
      next.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return (
          registration?.waiting === null &&
          registration.installing === null &&
          navigator.serviceWorker.controller === registration.active &&
          registration.active?.state === 'activated'
        );
      });
    await expect.poll(takenOver, { timeout: 60_000, interval: 250 }).toBe(true);

    await context.setOffline(true);
    try {
      const home = await next.goto(`${live.origin}/`, { waitUntil: 'commit' });
      expect(home?.fromServiceWorker()).toBe(true);
      const homeHeaders = await home?.allHeaders();
      expect(homeHeaders?.['server-timing'] ?? '').toContain('sw;desc=cache');
      const homeDocument = (await home?.text()) ?? '';
      expect(readBuildId(homeDocument)).toBe(deploys?.nextBuildId);
      // Whether that shell then boots offline is the route manifest's (FP4), not this row's.
      // The project class's closure is not complete, so its shell is never answered from the cache.
      const project = await next.goto(`${live.origin}${projectPath}`, { waitUntil: 'commit' }).catch(() => undefined);
      const projectHeaders = await project?.allHeaders();
      expect(projectHeaders?.['server-timing'] ?? '').not.toContain('sw;desc=cache');
    } finally {
      await context.setOffline(false);
    }
  }, 240_000);

  /* D15: under the worker, every document request reaches the server as the browser's own navigation, never as a
   * request the worker re-issued (`Sec-Fetch-Mode: same-origin`), whichever way the worker answers it. */
  it('should leave every document request a navigation under the worker (D15)', async () => {
    const { page, live } = await installPreviousWorker('/projects');
    const from = live.requests.length;

    // Home, answered cache-first; then reloaded, network-first; a project, cache-first; `/` without the preference.
    await page.goto(`${live.origin}/`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.goto(`${live.origin}${projectPath}`, { waitUntil: 'networkidle' });
    await context?.clearCookies({ name: 'tau-entry' });
    await page.goto(`${live.origin}/`, { waitUntil: 'networkidle' });

    const documentPaths = new Set(['/', projectPath]);
    const documentRequests = live.requests
      .slice(from)
      .filter((request) => documentPaths.has(request.path))
      .map((request) => `${request.method} ${request.path} ${request.mode ?? ''}`);
    expect(documentRequests.length).toBeGreaterThanOrEqual(4);
    expect(documentRequests.filter((request) => !request.endsWith(' navigate'))).toStrictEqual([]);
  }, 180_000);
});
