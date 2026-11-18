/**
 * The web app's service worker across a deploy (progressive loading PL7, ruling OD3), on two deploys of one built UI
 * (`support/two-deploys.ts`, as `stale-deploy-recovery.test.ts` serves them).
 *
 * - A tab the worker controls is one deploy behind until the update rule fires: it keeps working on the deploy it
 *   loaded, and once the server names the new build the page activates the new worker silently, so the next document
 *   load opens the new deploy.
 * - The kill switch (`TAU_SERVICE_WORKER_KILL_SWITCH=true`, `apps/ui/build-environment.ts`): one deploy whose
 *   `/service-worker.js` is the retiring worker, built here by the build's own `buildServiceWorker`, retires an installed
 *   worker. The first open after the deploy is the last one the old worker answers and fetches the retiring worker,
 *   which activates once the old worker is idle (here, when that project page unloads); from the next page load the
 *   browser holds no worker cache and no registration, and documents are the network's, cross-origin isolated. The next deploy's pages here are
 *   the ordinary build's and register again after load; the retiring worker unregisters again, so the end state holds
 *   (a kill switch build's pages register nothing, `offline-shell.test.tsx`).
 *
 * A new suite: it runs in the nightly `test:e2e:service-worker` and joins the merge queue's `test:e2e:queue` only after
 * five consecutive green nightlies (the end-to-end ratchet).
 *
 * Needs a built UI (`nx run ui:build`). `TAU_E2E_CHROMIUM_EXECUTABLE` points at a Chromium other than Playwright's
 * pinned revision.
 */
// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
// oxlint-disable no-restricted-imports -- The Node-only target runs without browser aliases.
import { prepareDeploys, projectShellUrl, startDeployServer } from './support/two-deploys.ts';
import type { Deploy, DeployServer, Deploys } from './support/two-deploys.ts';
// oxlint-enable no-restricted-imports

/** `apps/ui/scripts/build-service-worker.ts`'s build, as far as this suite calls it. */
type BuildServiceWorker = (options: {
  readonly buildDirectory: string;
  readonly workerSourcePath: string;
  readonly classes: readonly unknown[];
  readonly killSwitch: boolean;
}) => Promise<unknown>;

const uiRoot = resolve(import.meta.dirname, '../../ui');

/** The retiring worker, as a kill switch build writes it to `/service-worker.js`. */
const buildKillSwitchWorker = async (): Promise<string> => {
  const { buildServiceWorker } = (await import(
    pathToFileURL(join(uiRoot, 'scripts/build-service-worker.ts')).href
  )) as { readonly buildServiceWorker: BuildServiceWorker };
  const buildDirectory = mkdtempSync(join(tmpdir(), 'tau-e2e-kill-switch-'));
  try {
    mkdirSync(join(buildDirectory, 'client'));
    await buildServiceWorker({
      buildDirectory,
      workerSourcePath: join(uiRoot, 'app/offline/service-worker-kill-switch.ts'),
      classes: [],
      killSwitch: true,
    });
    return readFileSync(join(buildDirectory, 'client/service-worker.js'), 'utf8');
  } finally {
    rmSync(buildDirectory, { recursive: true, force: true });
  }
};

const readBuildIdOf = async (page: Page): Promise<string | undefined> =>
  page.evaluate(() => (globalThis as { ENV?: { TAU_BUILD_ID?: string } }).ENV?.TAU_BUILD_ID);

/** Wait until a worker controls the page and is activated: its precache install has completed. */
const waitForControllingWorker = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated', undefined, {
    timeout: 60_000,
    polling: 250,
  });
};

/** The worker's registration and caches, or `undefined` while the page is between documents. */
const readWorkerState = async (
  page: Page,
): Promise<{ readonly registered: boolean; readonly caches: readonly string[] } | undefined> => {
  try {
    return await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const names = await caches.keys();
      return { registered: registration !== undefined, caches: names.filter((name) => name.startsWith('tau-')) };
    });
  } catch {
    return undefined;
  }
};

describe('the web app’s service worker across a deploy (PL7)', () => {
  let browser: Browser | undefined;
  let deploys: Deploys | undefined;
  let killSwitchWorker = '';
  let server: DeployServer | undefined;
  let context: BrowserContext | undefined;

  beforeAll(async () => {
    deploys = await prepareDeploys('service-worker');
    killSwitchWorker = await buildKillSwitchWorker();
    browser = await chromium.launch({ executablePath: process.env['TAU_E2E_CHROMIUM_EXECUTABLE'] });
  }, 120_000);

  afterEach(async () => {
    await context?.close();
    await server?.close();
    context = undefined;
    server = undefined;
  });

  afterAll(async () => {
    await browser?.close();
    await deploys?.remove();
  });

  /** A fresh browser context on a fresh pair of deploys, with the previous one live and its page loaded. */
  const open = async (
    path: string,
    workers?: Readonly<Record<Deploy, string>>,
  ): Promise<{ readonly page: Page; readonly live: DeployServer }> => {
    if (browser === undefined || deploys === undefined) {
      expect.fail('the builds and browser did not start');
    }
    const live = await startDeployServer(
      deploys.builds,
      { shells: deploys.shells, workers: workers ?? deploys.workers.scripts },
      { hold: false },
    );
    server = live;
    context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${live.origin}${path}`, { waitUntil: 'networkidle' });
    return { page, live };
  };

  /* PL7, ruling OD3: a tab the service worker controls is one deploy behind until the update rule fires. It keeps
   * working on the deploy it loaded, a new document load is answered from the worker's precache, and once the server
   * names the new build the page activates the new worker silently, so the next document load opens the new deploy. */
  it('should keep a worker-controlled tab working and open the new deploy once the update rule fires', async () => {
    // The worker installs from a page outside a project workspace (B-27), then answers the project's opens.
    const { page, live } = await open('/projects');
    const buildIdOf = async (): Promise<string | undefined> => readBuildIdOf(page);
    await waitForControllingWorker(page);
    // Opened again under the worker: the shell comes from its precache and the deferred files are cached on first use.
    const controlled = await page.goto(`${live.origin}/w/home/bracket-v2`, { waitUntil: 'networkidle' });
    expect(controlled?.fromServiceWorker()).toBe(true);
    expect(await buildIdOf()).toBe(String(deploys?.previousBuildId));

    live.deploy();

    // One deploy behind: the old worker answers the open from its precache, and the page keeps working.
    const behind = await page.goto(`${live.origin}/w/home/bracket-v2`, { waitUntil: 'networkidle' });
    expect(behind?.fromServiceWorker()).toBe(true);
    expect(await buildIdOf()).toBe(String(deploys?.previousBuildId));
    await page.getByRole('main').waitFor({ timeout: 30_000 });
    expect(await page.getByRole('heading', { name: 'Something went wrong' }).count()).toBe(0);

    // That open's update check installed the next deploy's worker; once the server names the next build the page
    // activates it without reloading, and activation leaves only the next deploy's shell in the precache.
    const precachedShellRevisions = async (): Promise<string[]> =>
      page.evaluate(async (shellUrl) => {
        const names = await caches.keys();
        const name = names.find((candidate) => candidate.startsWith('tau-precache-'));
        const cache = name === undefined ? undefined : await caches.open(name);
        const keys = cache === undefined ? [] : await cache.keys();
        return keys
          .map((request) => new URL(request.url))
          .filter((url) => url.pathname === shellUrl)
          .map((url) => url.searchParams.get('__WB_REVISION__') ?? '');
      }, projectShellUrl);
    await expect
      .poll(precachedShellRevisions, { timeout: 60_000, interval: 250 })
      .toStrictEqual([deploys?.workers.shellRevisions.next]);
    const noneWaiting = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration?.waiting === null;
    });
    expect(noneWaiting).toBe(true);
    expect(await buildIdOf()).toBe(String(deploys?.previousBuildId));

    const updated = await page.goto(`${live.origin}/w/home/bracket-v2`, { waitUntil: 'networkidle' });
    expect(updated?.fromServiceWorker()).toBe(true);
    expect(await buildIdOf()).toBe(String(deploys?.nextBuildId));
    expect(await page.getByRole('heading', { name: 'Something went wrong' }).count()).toBe(0);
    expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(true);
  }, 180_000);

  it('should retire an installed worker with one deploy of the kill switch', async () => {
    const { page, live } = await open('/projects', {
      previous: deploys?.workers.scripts.previous ?? '',
      next: killSwitchWorker,
    });
    await waitForControllingWorker(page);
    const installed = await readWorkerState(page);
    expect(installed?.registered).toBe(true);
    expect(installed?.caches).toEqual(expect.arrayContaining([expect.stringMatching(/^tau-precache-/u)]));

    live.deploy();

    // The last open the old worker answers: its update check installs the retiring worker, which asks to activate at
    // once. Chrome lets it only when the old worker has no event in flight, which a project page keeps it from, so it
    // waits until that page unloads.
    // Committed is enough: once the retiring worker deletes the caches, the page may reload itself into the live deploy.
    const last = await page.goto(`${live.origin}/w/home/bracket-v2`, { waitUntil: 'commit' });
    expect(last?.fromServiceWorker()).toBe(true);
    const retiringFetched = async (): Promise<boolean> => {
      try {
        return await page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return registration === undefined || registration.waiting !== null;
        });
      } catch {
        return false;
      }
    };
    await expect.poll(retiringFetched, { timeout: 60_000, interval: 250 }).toBe(true);

    // The next page load: the old worker is let go, and the retiring one takes the page, deletes the caches and
    // unregisters.
    await page.goto(`${live.origin}/projects`, { waitUntil: 'commit' });
    await expect
      .poll(async () => readWorkerState(page), { timeout: 60_000, interval: 250 })
      .toStrictEqual({ registered: false, caches: [] });

    // Every later document load is the network's: the live deploy, cross-origin isolated, and still no worker cache.
    const next = await page.goto(`${live.origin}/w/home/bracket-v2`, { waitUntil: 'networkidle' });
    expect(next?.fromServiceWorker()).toBe(false);
    expect(await readBuildIdOf(page)).toBe(String(deploys?.nextBuildId));
    expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(true);
    expect(await page.getByRole('heading', { name: 'Something went wrong' }).count()).toBe(0);
    const after = await readWorkerState(page);
    expect(after?.caches).toStrictEqual([]);
  }, 180_000);
});
