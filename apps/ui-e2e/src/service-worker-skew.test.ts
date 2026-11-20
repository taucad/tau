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
  createProfile,
  firstPage,
  preFixWorker,
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

  /**
   * A returning visitor (FP4, D4): the visit that installed the previous deploy's worker, then the profile closed, the
   * next deploy live with no retention of the previous one's files, and the browser's HTTP cache emptied, as weeks of
   * other browsing would. The next visit's first navigation is answered by the installed worker from its precache: the
   * previous deploy's shell, which imports that deploy's route manifest (`/assets/manifest-<version>.js`).
   */
  const returningVisitor = async (
    offline: boolean,
  ): Promise<{ readonly state: BootState; readonly manifestFailed: readonly string[] }> => {
    if (deploys === undefined) {
      expect.fail('the builds did not start');
    }
    const live = await startDeployServer(
      deploys.builds,
      { shells: deploys.shells, workers: deploys.workers.scripts, clientRoots: deploys.clientRoots },
      { hold: false, retain: false },
    );
    server = live;
    const profile = await createProfile(live.origin);
    try {
      const first = await profile.visit();
      const firstOpen = await firstPage(first);
      await firstOpen.goto(`${live.origin}/projects`, { waitUntil: 'networkidle' });
      await waitForControllingWorker(firstOpen);
      await first.close();

      live.deploy();

      const second = await profile.visit();
      context = second;
      const page = await firstPage(second);
      watch(page);
      const session = await second.newCDPSession(page);
      await session.send('Network.clearBrowserCache');
      await session.detach();
      if (offline) {
        await second.setOffline(true);
      }
      const opened = await page.goto(`${live.origin}${projectPath}`, { waitUntil: 'commit' });
      expect(opened?.fromServiceWorker()).toBe(true);
      const state = await waitForMount(page).catch((error: unknown) => {
        // Name what the page could not load, so a stall says why.
        throw new Error(`not mounted; failed /assets/* requests: ${JSON.stringify(failedAssets)}`, { cause: error });
      });
      return { state, manifestFailed: failedAssets.filter((failure) => /\/assets\/manifest-/u.test(failure)) };
    } finally {
      await context?.close();
      context = undefined;
      await profile.remove();
    }
  };

  it('should mount a project from a precached shell whose deploy has aged out of asset retention (D4)', async () => {
    const { state, manifestFailed } = await returningVisitor(false);
    expect(state).toMatchObject({ mounted: true, stripShown: false });
    expect(manifestFailed).toStrictEqual([]);
  }, 240_000);

  it('should mount a project on its first controlled open offline (D4)', async () => {
    const { state, manifestFailed } = await returningVisitor(true);
    expect(state).toMatchObject({ mounted: true, stripShown: false });
    expect(manifestFailed).toStrictEqual([]);
  }, 240_000);

  /** Wait until the page's registration has no worker installing or waiting, and its active worker controls it. */
  const settledOnOneWorker = async (page: Page): Promise<boolean> => {
    try {
      return await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return (
          registration?.installing === null &&
          registration.waiting === null &&
          registration.active?.state === 'activated' &&
          navigator.serviceWorker.controller === registration.active
        );
      });
    } catch {
      return false;
    }
  };

  /**
   * Whether the page's registration has settled on one worker, in control, that reports `build` as the one it serves
   * (only a worker built since FP3 answers).
   */
  const settledOnWorkerOf = async (page: Page, build: number | undefined): Promise<boolean> => {
    if (!(await settledOnOneWorker(page))) {
      return false;
    }
    try {
      return await page.evaluate(
        async (expected) =>
          new Promise<boolean>((resolve) => {
            const channel = new MessageChannel();
            channel.port1.addEventListener('message', (event: MessageEvent) => {
              resolve((event.data as { build?: unknown }).build === expected);
            });
            channel.port1.start();
            navigator.serviceWorker.controller?.postMessage({ type: 'tau-service-worker-build' }, [channel.port2]);
            setTimeout(() => {
              resolve(false);
            }, 2000);
          }),
        build,
      );
    } catch {
      return false;
    }
  };

  /* D16, FP3: a browser holding a pre-fix worker in the staging stall (the request only the worker makes for a rebuilt
   * boot chunk fails) is replaced by the fixed worker on its own: the stalled page never runs page code, so the fixed
   * worker must activate without a page asking. By the second load after the deploy the page mounts, with no click. */
  it('should mount Home by the second load after the fixed worker deploys over a pre-fix worker in the stall (D16)', async () => {
    if (browser === undefined || deploys === undefined) {
      expect.fail('the builds and browser did not start');
    }
    const live = await startDeployServer(
      deploys.builds,
      {
        shells: deploys.shells,
        workers: { previous: await preFixWorker(), next: deploys.workers.scripts.next },
        clientRoots: deploys.clientRoots,
      },
      { hold: false, retain: true },
    );
    server = live;
    context = await browser.newContext();
    await context.addCookies([{ name: 'tau-entry', value: 'app', url: live.origin }]);
    const page = await context.newPage();
    watch(page);
    await page.goto(`${live.origin}/`, { waitUntil: 'networkidle' });
    await waitForControllingWorker(page);

    live.inject({ path: rebuiltChunkUrl(), destination: 'empty', kind: 'reset' });
    live.deploy();
    // The first load after the deploy is the pre-fix worker's: it may stall. Its update check installs the fixed worker.
    await page.reload({ waitUntil: 'commit' });
    await expect
      .poll(async () => settledOnWorkerOf(page, deploys.nextBuildId), { timeout: 60_000, interval: 500 })
      .toBe(true);

    failedAssets = [];
    await page.reload({ waitUntil: 'commit' });
    expect(await waitForMount(page)).toStrictEqual({
      mounted: true,
      stripShown: false,
      buildId: String(deploys.nextBuildId),
    });
    expect(failedAssets).toStrictEqual([]);
  }, 240_000);

  /* D6, FP3: a page reloaded under the previous worker is the next build's document, so its verdict is `live`; the
   * next worker, of the page's own build, activates instead of waiting for the life of the tab. */
  it('should leave no worker waiting after a reload under the previous worker (D6)', async () => {
    const { page, live } = await installPreviousWorker();
    live.deploy();
    await page.reload({ waitUntil: 'commit' });
    const reloaded = await waitForMount(page);
    expect(reloaded.buildId).toBe(String(deploys?.nextBuildId));
    await expect
      .poll(async () => settledOnWorkerOf(page, deploys?.nextBuildId), { timeout: 30_000, interval: 500 })
      .toBe(true);
  }, 180_000);

  /* FP3: update checks that fail offline start no install, so they never count against the registration. */
  it('should keep the registration through offline reloads', async () => {
    const { page } = await installPreviousWorker('/projects');
    await context?.setOffline(true);
    try {
      for (let reload = 0; reload < 5; reload += 1) {
        // oxlint-disable-next-line no-await-in-loop -- One reload at a time, as a visitor's.
        await page.reload({ waitUntil: 'commit' }).catch(() => undefined);
        // oxlint-disable-next-line no-await-in-loop -- As above: each load runs its update check before the next.
        await page.waitForTimeout(1500);
      }
    } finally {
      await context?.setOffline(false);
    }
    await page.reload({ waitUntil: 'networkidle' });
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()) !== undefined)).toBe(true);
  }, 180_000);

  /* D2, FP3: a registration whose installs keep failing (here every install of the next deploy's worker is refused
   * after its downloads, as a quota error would) is retired after a few, with its caches, instead of keeping a stale
   * worker for good. */
  it('should retire a registration whose installs keep failing (D2)', async () => {
    if (browser === undefined || deploys === undefined) {
      expect.fail('the builds and browser did not start');
    }
    const refusing = `self.addEventListener('install', (event) => {
      event.waitUntil(new Promise((resolve, reject) => setTimeout(() => reject(new Error('install refused')), 12000)));
    });`;
    const live = await startDeployServer(
      deploys.builds,
      {
        shells: deploys.shells,
        workers: { previous: deploys.workers.scripts.previous, next: refusing },
        clientRoots: deploys.clientRoots,
      },
      { hold: false, retain: true },
    );
    server = live;
    context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${live.origin}/projects`, { waitUntil: 'networkidle' });
    await waitForControllingWorker(page);

    live.deploy();
    const retired = async (): Promise<boolean> => {
      try {
        return await page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          const names = await caches.keys();
          return registration === undefined && !names.some((name) => name.startsWith('tau-'));
        });
      } catch {
        return false;
      }
    };
    // Each open checks for the next worker, whose install is refused; the page counts each one it sees fail.
    await expect
      .poll(
        async () => {
          if (await retired()) {
            return true;
          }
          await page.goto(`${live.origin}/projects`, { waitUntil: 'commit' }).catch(() => undefined);
          await page.waitForTimeout(14_000);
          return retired();
        },
        { timeout: 150_000, interval: 1000 },
      )
      .toBe(true);
  }, 240_000);
});
