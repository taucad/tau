/**
 * The web app's service worker on the boot path (progressive loading PL7), red-first rows of Brain
 * `research/pl7-service-worker-staging-defects-blueprint.md` ("Red-first regression test", FP0), on two deploys of one
 * built UI (`support/two-deploys.ts`) with the real worker, never `serviceWorkers: 'block'`.
 *
 * The rule under test: a worker may make the online app faster or available offline, and never make it fail where no
 * worker would. Faults are injected on the server where a row needs the browser's HTTP cache on (a cache-first shell as
 * a returning visitor gets it; a Playwright `route` turns that cache off, Finding 7g), and on a file no page has loaded,
 * since the HTTP cache would answer the worker's fetch of any other before the server could fail it:
 *
 * - **Rows 1 and 3, a request only the worker makes fails** (D1). A content blocker's rule that exempts scripts
 *   (EasyList Cookie List, `-cookie-consent-$~script`) let the page load `use-cookie-consent-<hash>.js` as a script and
 *   blocked the same URL fetched by a worker, whose requests carry `Sec-Fetch-Dest: empty`. FP6 renamed that module
 *   (`use-privacy-choices`); the rows fail the same chunk as a stand-in for any one a blocker refuses the worker. Row 1 removes the chunk from
 *   the earlier worker's precache, as for a worker from before the chunk joined the interactive tier; the page loaded
 *   the chunk before the worker took it, so its fault is a Playwright `route` (the row only reloads, which the worker
 *   answers network first anyway). Row 3 is two real builds, the next one with the chunk and everything naming it
 *   renamed, and the server resets the worker's requests for the renamed chunk.
 * - **Row 2, a precached shell names a file the live deploy no longer serves** (D4). The project shell imports React
 *   Router's route manifest from an inline script; once the deploy that built the shell has aged out of asset
 *   retention, the shell must still boot from what the worker holds.
 * - **Row 4, the next worker's install cannot fetch one entry** (D2). The successor must still install.
 * - **Row 6, the kill switch over a stalled worker**: one deploy of the retiring worker frees a browser that row 1's
 *   fault stalls (the mitigation on staging; expected green before any fix).
 * - **Row 7, the route manifest aged out, first controlled open offline** (D4).
 * - **Row 8, a navigation stays a navigation** (D15): under the worker, the server sees the browser's own navigation,
 *   never a request the worker re-issued. Chrome keeps `Sec-Fetch-Mode: navigate` on a navigation the worker passes to
 *   `fetch`, but sends it as `Sec-Fetch-Dest: empty`.
 * - **FP2, cache-first shells bounded by the server's build floor**: a returning visitor at or above `minBuildId` opens
 *   the cached shell; below a floor the page's build check handed the worker, the first online navigation is the live
 *   build; offline the precached shell opens whatever the floor.
 *
 * The page must mount within the boot watchdog's deadline (`boot-watchdog.ts`, 20 s), and online with no failed
 * `/assets/*` request. Rows 1 and 3 have a control without the fault that passes on the same harness. Row 5 (a pre-fix
 * worker, then the fix) lands with FP3, which it needs.
 *
 * Runs in the merge queue (`test:e2e:deploy-skew`) by operator decision 7 of the blueprint, outside the five-nightly
 * ratchet. Needs a built UI (`nx run ui:build`). `TAU_E2E_CHROMIUM_EXECUTABLE` points at a Chromium other than
 * Playwright's pinned revision.
 */
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
// oxlint-disable no-restricted-imports -- The Node-only target runs without browser aliases.
import {
  buildKillSwitchWorker,
  buildRoot,
  createReturningVisitor,
  killSwitchPageScript,
  prepareDeploys,
  projectShellUrl,
  readBootState,
  readPreFixWorker,
  startDeployServer,
  waitForControllingWorker,
} from './support/two-deploys.ts';
import type { BootState, Deploy, DeployServer, Deploys, ReturningVisitor } from './support/two-deploys.ts';
// oxlint-enable no-restricted-imports

/** `boot-watchdog.ts`'s deadline: a page that has not mounted its shell by then shows the strip. */
const bootDeadline = 20_000;

/** The interactive-tier chunk the script-exempting blocker rule matches. */
// FP6 renamed the chunk the rule matched (now `use-privacy-choices`, which no known rule matches); the rows fail the same
// interactive-tier chunk as a stand-in for any chunk a blocker refuses to the worker alone.
const blockedChunk = /^\/assets\/use-privacy-choices-[\w-]+\.js$/u;

/** A request the page's worker makes: it has no destination. */
const workerOnly = ['empty'];

// oxlint-disable-next-line typescript/no-restricted-types -- Workbox's precache wire value for "no revision".
type PrecacheEntry = { readonly url: string; readonly revision: string | null };

/** A route manifest only the previous deploy serves, which its project shell imports. */
const previousOnlyManifest = '/assets/manifest-00000000.js';

describe('the web app’s service worker on the boot path (PL7 staging stall)', () => {
  let browser: Browser | undefined;
  let deploys: Deploys | undefined;
  let renamedDeploys: Deploys | undefined;
  let killSwitchWorker = '';
  let server: DeployServer | undefined;
  let context: BrowserContext | undefined;
  let visitor: ReturningVisitor<BrowserContext> | undefined;
  /** Every `/assets/*` request the page saw fail, as the console would show it. */
  let failedAssets: string[] = [];

  beforeAll(async () => {
    deploys = await prepareDeploys('service-worker-boot');
    renamedDeploys = await prepareDeploys('service-worker-boot-renamed', { rename: blockedChunk });
    killSwitchWorker = await buildKillSwitchWorker();
    browser = await chromium.launch({ executablePath: process.env['TAU_E2E_CHROMIUM_EXECUTABLE'] });
  }, 300_000);

  afterEach(async () => {
    await context?.close();
    await visitor?.remove();
    await server?.close();
    context = undefined;
    visitor = undefined;
    server = undefined;
    failedAssets = [];
  });

  afterAll(async () => {
    await browser?.close();
    await deploys?.remove();
    await renamedDeploys?.remove();
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

  const requireDeploys = (): { readonly same: Deploys; readonly renamed: Deploys; readonly browser: Browser } => {
    if (browser === undefined || deploys === undefined || renamedDeploys === undefined) {
      expect.fail('the builds and browser did not start');
    }
    return { same: deploys, renamed: renamedDeploys, browser };
  };

  /** The blocked chunk's URL in the build's own precache list. */
  const readBlockedChunk = (): string => {
    const entries = JSON.parse(
      readFileSync(join(buildRoot, 'service-worker-precache.json'), 'utf8'),
    ) as PrecacheEntry[];
    const chunk = entries.find((entry) => blockedChunk.test(entry.url));
    if (chunk === undefined) {
      expect.fail(
        'the build precaches no use-privacy-choices chunk: pick another interactive-tier chunk for these rows',
      );
    }
    return chunk.url;
  };

  /** The build's worker without one precache entry: the worker of a deploy from before the chunk joined the tier. */
  const withoutPrecacheEntry = (script: string, url: string): string => {
    const entry = `{"revision":null,"url":"${url}"}`;
    const without = script.includes(`${entry},`) ? script.replace(`${entry},`, '') : script.replace(`,${entry}`, '');
    if (without === script) {
      expect.fail(`the built worker does not precache ${url}`);
    }
    return without;
  };

  /** A fresh context on a fresh server, with the previous deploy live, its Home open and its worker in control. */
  const openUnderWorker = async (
    pair: Deploys,
    workers: Readonly<Record<Deploy, string>>,
    path = '/',
  ): Promise<{ readonly page: Page; readonly live: DeployServer }> => {
    const { browser: launched } = requireDeploys();
    const live = await startDeployServer(
      pair.builds,
      { shells: pair.shells, workers, clientRoots: pair.clientRoots },
      { hold: false, retain: true },
    );
    server = live;
    context = await launched.newContext();
    await context.addCookies([{ name: 'tau-entry', value: 'app', url: live.origin }]);
    const page = await context.newPage();
    watch(page);
    await page.goto(`${live.origin}${path}`, { waitUntil: 'networkidle' });
    await waitForControllingWorker(page);
    return { page, live };
  };

  /**
   * Row 1's fault: every request for the chunk fails but the page's own script load, as the script-exempting blocker
   * rule does (a `route` turns the HTTP cache off, which is what lets the worker's fetch reach it).
   */
  const blockAllButPageScript = async (chunk: string): Promise<void> => {
    await context?.route(`**${chunk}`, async (route) => {
      if (route.request().resourceType() === 'script' && route.request().serviceWorker() === null) {
        await route.continue();
        return;
      }
      await route.abort('blockedbyclient');
    });
  };

  /** A pre-fix worker stalls Home under row 1's fault: the page is not mounted and the boot strip shows. */
  const stallUnderPreFixWorker = async (
    next: string,
  ): Promise<{ readonly page: Page; readonly live: DeployServer; readonly chunk: string }> => {
    const { same } = requireDeploys();
    const chunk = readBlockedChunk();
    const { page, live } = await openUnderWorker(same, { previous: readPreFixWorker([chunk]), next });
    await blockAllButPageScript(chunk);
    await page.reload({ waitUntil: 'commit' });
    await expect
      .poll(async () => readBootState(page), { timeout: bootDeadline + 10_000, interval: 500 })
      .toMatchObject({ mounted: false, stripShown: true });
    return { page, live, chunk };
  };

  /** The registration's workers and the origin's caches, or `undefined` while the page is between documents. */
  const readWorkerState = async (
    page: Page,
  ): Promise<
    Readonly<{ registered: boolean; installing: boolean; waiting: boolean; caches: readonly string[] }> | undefined
  > => {
    try {
      return await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        const names = await caches.keys();
        return {
          registered: registration !== undefined,
          installing: registration?.installing !== null && registration?.installing !== undefined,
          waiting: registration?.waiting !== null && registration?.waiting !== undefined,
          caches: names.toSorted(),
        };
      });
    } catch {
      return undefined;
    }
  };

  /**
   * Where the next deploy's worker is: installed once a precache holds the next project shell's revision, then waiting
   * or active. A cache-name-agnostic read, so it reads a pre-fix and a fixed worker alike.
   */
  const readNextWorker = async (
    page: Page,
    pair: Deploys,
  ): Promise<'between documents' | 'not installed' | 'installing' | 'waiting' | 'active'> => {
    const worker = await readWorkerState(page);
    if (worker === undefined) {
      return 'between documents';
    }
    const nextShell = `${projectShellUrl}?__WB_REVISION__=${pair.workers.shellRevisions.next}`;
    const installed = await page
      .evaluate(async (key) => {
        for (const name of await caches.keys()) {
          // oxlint-disable-next-line no-await-in-loop -- a handful of caches, read in order.
          if (name.startsWith('tau-precache-')) {
            // oxlint-disable-next-line no-await-in-loop -- as above.
            const cache = await caches.open(name);
            // oxlint-disable-next-line no-await-in-loop -- as above.
            if ((await cache.match(key)) !== undefined) {
              return true;
            }
          }
        }
        return false;
      }, nextShell)
      .catch(() => false);
    if (worker.installing) {
      return 'installing';
    }
    if (!installed) {
      return 'not installed';
    }
    return worker.waiting ? 'waiting' : 'active';
  };

  const waitForMount = async (page: Page): Promise<BootState> => {
    await expect
      .poll(async () => readBootState(page), { timeout: bootDeadline, interval: 250 })
      .toMatchObject({ mounted: true });
    return readBootState(page);
  };

  const reloadAfterDeploy = async (page: Page, live: DeployServer, chunk: string | undefined): Promise<BootState> => {
    live.deploy();
    if (chunk !== undefined) {
      live.inject({ path: chunk, destination: workerOnly, answer: 'reset' });
    }
    failedAssets = [];
    await page.reload({ waitUntil: 'commit' });
    return waitForMount(page);
  };

  describe('when a request only the worker makes fails (D1)', () => {
    const openHomeUnderEarlierWorker = async (): Promise<{ readonly page: Page; readonly live: DeployServer }> => {
      const { same } = requireDeploys();
      return openUnderWorker(same, {
        previous: withoutPrecacheEntry(same.workers.scripts.previous, readBlockedChunk()),
        next: same.workers.scripts.next,
      });
    };

    it('control: should mount Home on the live build after a reload under an earlier worker', async () => {
      const { page, live } = await openHomeUnderEarlierWorker();
      const state = await reloadAfterDeploy(page, live, undefined);
      expect(state).toStrictEqual({ mounted: true, stripShown: false, buildId: String(deploys?.nextBuildId) });
      expect(failedAssets).toStrictEqual([]);
    }, 180_000);

    it('row 1: should mount Home on the live build when the worker’s own fetch of an interactive chunk fails', async () => {
      const { page, live } = await openHomeUnderEarlierWorker();
      // The page loaded the chunk before the worker took it, so the HTTP cache would answer the worker's fetch before
      // the server could fail it. This row only reloads, which the worker answers network first whatever the cache, so
      // the fault is the browser's own: Playwright fails every request for the chunk but the page's script load, as the
      // blocker does (a `route` turns the HTTP cache off, which is what makes the worker's fetch reach it).
      const chunk = readBlockedChunk();
      await context?.route(`**${chunk}`, async (route) => {
        if (route.request().resourceType() === 'script' && route.request().serviceWorker() === null) {
          await route.continue();
          return;
        }
        await route.abort('blockedbyclient');
      });
      const state = await reloadAfterDeploy(page, live, undefined);
      expect(state).toStrictEqual({ mounted: true, stripShown: false, buildId: String(deploys?.nextBuildId) });
      expect(failedAssets).toStrictEqual([]);
    }, 180_000);

    const renamedChunk = (): string => {
      const renamed = renamedDeploys?.renamed.get(readBlockedChunk());
      if (renamed === undefined) {
        expect.fail('the next deploy did not rename the blocked chunk');
      }
      return renamed;
    };

    it('control: should mount Home on the next real build after a reload under the previous build’s worker', async () => {
      const { renamed } = requireDeploys();
      const { page, live } = await openUnderWorker(renamed, renamed.workers.scripts);
      const state = await reloadAfterDeploy(page, live, undefined);
      expect(state).toStrictEqual({ mounted: true, stripShown: false, buildId: String(renamed.nextBuildId) });
      expect(failedAssets).toStrictEqual([]);
      expect(live.requests.some((request) => request.path === renamedChunk())).toBe(true);
    }, 180_000);

    it('row 3: should mount Home on the next real build when the worker’s own fetch of its renamed boot chunk fails', async () => {
      const { renamed } = requireDeploys();
      const { page, live } = await openUnderWorker(renamed, renamed.workers.scripts);
      const state = await reloadAfterDeploy(page, live, renamedChunk());
      expect(state).toStrictEqual({ mounted: true, stripShown: false, buildId: String(renamed.nextBuildId) });
      expect(failedAssets).toStrictEqual([]);
    }, 180_000);
  });

  it('row 4: should install the next deploy’s worker when its fetch of one precache entry fails', async () => {
    const { renamed } = requireDeploys();
    const { page, live } = await openUnderWorker(renamed, renamed.workers.scripts, '/projects');
    live.deploy();
    // The next deploy's renamed chunk: no page has loaded it, so the install's fetch cannot come from the HTTP cache.
    const chunk = renamed.renamed.get(readBlockedChunk()) ?? '';
    live.inject({ path: chunk, destination: workerOnly, answer: 'reset' });
    // The browser's update check, from the page that stays on the previous deploy.
    const outcome = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration === undefined) {
        return 'no registration';
      }
      const settled = new Promise<string>((resolve) => {
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'redundant') {
              resolve('redundant');
            } else if (worker.state !== 'installing') {
              resolve('installed');
            }
          });
        });
        setTimeout(() => {
          resolve('still installing');
        }, 60_000);
      });
      await registration.update().catch(() => undefined);
      return settled;
    });
    expect(live.requests.some((request) => request.path === chunk && request.fault === 'reset')).toBe(true);
    expect(outcome).toBe('installed');
  }, 180_000);

  it('FP1: should install without one file, mount Home online and offline, and never serve that class from cache', async () => {
    const { same, browser: launched } = requireDeploys();
    // A precached script the project shell preloads and Home's shell does not name.
    const homeShell = readFileSync(join(buildRoot, 'client/__shell/home/index.html'), 'utf8');
    const entries = JSON.parse(
      readFileSync(join(buildRoot, 'service-worker-precache.json'), 'utf8'),
    ) as PrecacheEntry[];
    const projectOnly = entries.find(
      ({ url }) => url.endsWith('.js') && same.shells.previous.includes(`"${url}"`) && !homeShell.includes(url),
    )?.url;
    if (projectOnly === undefined) {
      expect.fail('the project shell names no precached script Home’s does not');
    }
    const live = await startDeployServer(
      same.builds,
      { shells: same.shells, workers: same.workers.scripts },
      {
        hold: false,
        retain: true,
      },
    );
    server = live;
    // Only the worker's requests for the file fail; no page asks for it here but a prefetch, which the fault fails too.
    live.inject({ path: projectOnly, destination: workerOnly, answer: 'reset' });
    context = await launched.newContext();
    await context.addCookies([{ name: 'tau-entry', value: 'app', url: live.origin }]);
    const page = await context.newPage();
    await page.goto(`${live.origin}/projects`, { waitUntil: 'networkidle' });
    await waitForControllingWorker(page);
    expect(live.requests.some((request) => request.path === projectOnly && request.fault === 'reset')).toBe(true);

    await page.goto(`${live.origin}/`, { waitUntil: 'commit' });
    await waitForMount(page);

    await context.setOffline(true);
    const homeOffline = await page.goto(`${live.origin}/`, { waitUntil: 'commit' });
    expect(homeOffline?.fromServiceWorker()).toBe(true);
    await waitForMount(page);
    // The project class is incomplete: its navigation is the network's, which is offline.
    await expect(page.goto(`${live.origin}/w/home/bracket-v2`, { waitUntil: 'commit' })).rejects.toThrow(
      /ERR_INTERNET_DISCONNECTED|ERR_FAILED/u,
    );
  }, 180_000);

  it('FP1: should answer a stored file offline when the request itself restarts the worker', async () => {
    const { same } = requireDeploys();
    const { page } = await openUnderWorker(same, same.workers.scripts);
    // A precached script Home's shell names: stored by the install, and loaded by this page.
    const homeShell = readFileSync(join(buildRoot, 'client/__shell/home/index.html'), 'utf8');
    const entries = JSON.parse(
      readFileSync(join(buildRoot, 'service-worker-precache.json'), 'utf8'),
    ) as PrecacheEntry[];
    const stored = entries.find(({ url }) => url.endsWith('.js') && homeShell.includes(`"${url}"`))?.url;
    if (stored === undefined || context === undefined) {
      expect.fail('Home’s shell names no precached script');
    }
    // Only the worker can answer: no HTTP cache copy, no network, and an idle worker that this request restarts, so
    // its index is not loaded yet.
    const session = await context.newCDPSession(page);
    await session.send('Network.clearBrowserCache');
    await session.send('ServiceWorker.enable');
    await session.send('ServiceWorker.stopAllWorkers');
    await context.setOffline(true);
    const answer = await page.evaluate(async (url) => {
      try {
        const response = await fetch(url);
        return response.status;
      } catch (error) {
        return String(error);
      }
    }, stored);
    expect(answer).toBe(200);
  }, 180_000);

  it('row 6: should free a browser that a stalled worker holds with one deploy of the kill switch', async () => {
    const { same } = requireDeploys();
    // A worker from before FP1 (the fixed one never stalls the page): the stall to free is the pre-fix worker's.
    const { page, live } = await stallUnderPreFixWorker(killSwitchWorker);
    // From here the live deploy is a kill switch build: its pages register nothing.
    await context?.addInitScript(killSwitchPageScript);
    live.deploy();
    // The first load after the deploy may still be the stalled worker's; its update check fetches the retiring worker.
    await page.reload({ waitUntil: 'commit' });
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
    // The second mounts, with no worker and no worker cache left.
    failedAssets = [];
    await page.reload({ waitUntil: 'commit' });
    const state = await waitForMount(page);
    expect(state.buildId).toBe(String(same.nextBuildId));
    const workerState = async (): Promise<unknown> => {
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
    await expect.poll(workerState, { timeout: 30_000, interval: 250 }).toStrictEqual({ registered: false, caches: [] });
    expect(failedAssets).toStrictEqual([]);
  }, 180_000);

  describe('the update and fleet rule (FP3)', () => {
    it('row 5: should mount Home by the second load after the fixed worker deploys over a stalled pre-fix worker, with no click', async () => {
      const { same } = requireDeploys();
      const { page, live } = await stallUnderPreFixWorker(same.workers.scripts.next);
      live.deploy();
      // The first load after the deploy is still the stalled worker's; the browser's update check installs the fixed
      // worker, which activates over the pre-fix one by itself, since the stalled page runs none of its own code.
      await page.reload({ waitUntil: 'commit' });
      await expect.poll(async () => readNextWorker(page, same), { timeout: 60_000, interval: 500 }).toBe('active');
      failedAssets = [];
      await page.reload({ waitUntil: 'commit' });
      const state = await waitForMount(page);
      expect(state).toStrictEqual({ mounted: true, stripShown: false, buildId: String(same.nextBuildId) });
      expect(failedAssets).toStrictEqual([]);
    }, 180_000);

    it('should leave no worker waiting after a reload under the previous deploy’s worker (D6)', async () => {
      const { same } = requireDeploys();
      const { page, live } = await openUnderWorker(same, same.workers.scripts);
      live.deploy();
      // A reload asks the network first, so the page is on the live build under the previous build's worker.
      await page.reload({ waitUntil: 'commit' });
      const state = await waitForMount(page);
      expect(state.buildId).toBe(String(same.nextBuildId));
      // The next deploy's worker installs on the browser's update check; it must not be left waiting.
      await expect.poll(async () => readNextWorker(page, same), { timeout: 60_000, interval: 500 }).toBe('active');
    }, 180_000);

    it('should keep the registration through offline reloads', async () => {
      const { same } = requireDeploys();
      const { page } = await openUnderWorker(same, same.workers.scripts);
      await context?.setOffline(true);
      /* oxlint-disable no-await-in-loop -- reloads in order. */
      for (let reload = 0; reload < 3; reload += 1) {
        await page.reload({ waitUntil: 'commit' });
        await waitForMount(page);
      }
      /* oxlint-enable no-await-in-loop */
      await page.waitForTimeout(2000);
      expect(await readWorkerState(page)).toMatchObject({ registered: true, waiting: false });
    }, 180_000);

    it('should delete the worker caches no registration owns, such as the empty tau-assets a retired worker leaves', async () => {
      const { same, browser: launched } = requireDeploys();
      // No deploy serves a worker, so the page's registration fails and none owns the caches below.
      const live = await startDeployServer(
        same.builds,
        { shells: same.shells, workers: { previous: '', next: '' } },
        { hold: false },
      );
      server = live;
      context = await launched.newContext();
      await context.addCookies([{ name: 'tau-entry', value: 'app', url: live.origin }]);
      const page = await context.newPage();
      await page.goto(`${live.origin}/projects`, { waitUntil: 'networkidle' });
      // On staging an in-flight fetch of the retired worker re-created an empty `tau-assets` after the kill switch had
      // deleted every worker cache (Brain blueprint, "Not verified"); a pre-fix precache can be left the same way.
      await page.evaluate(async () => {
        await caches.open('tau-assets');
        await caches.open('tau-precache-v2-orphan');
        await caches.open('another-app');
      });
      await page.reload({ waitUntil: 'commit' });
      await waitForMount(page);
      await expect
        .poll(async () => readWorkerState(page), { timeout: 30_000, interval: 250 })
        .toMatchObject({ registered: false, caches: ['another-app'] });
    }, 180_000);
  });

  describe('recovery before mount (FP5)', () => {
    it('should mount the app when the strip’s Reload is pressed in a page a pre-fix worker stalls', async () => {
      const { same } = requireDeploys();
      // No deploy: the browser keeps the pre-fix worker, and every reload of its own stalls again (D5).
      const { page } = await stallUnderPreFixWorker(same.workers.scripts.next);
      failedAssets = [];
      const reloaded = page.waitForEvent('load', { timeout: 30_000 });
      await page.locator('#tau-boot-strip [data-boot-action=reload]').click();
      await reloaded;
      const state = await waitForMount(page);
      expect(state).toStrictEqual({ mounted: true, stripShown: false, buildId: String(same.previousBuildId) });
      expect(failedAssets).toStrictEqual([]);
    }, 180_000);

    it('should answer safe mode from the network and leave the worker', async () => {
      const { same } = requireDeploys();
      const { page, live } = await openUnderWorker(same, same.workers.scripts);
      const response = await page.goto(`${live.origin}/?safe=1`, { waitUntil: 'commit' });
      expect(response?.fromServiceWorker()).toBe(false);
      await waitForMount(page);
      await expect
        .poll(async () => readWorkerState(page), { timeout: 30_000, interval: 250 })
        .toMatchObject({ registered: false, caches: [] });
      /* The worker still controls this page, but writes nothing after safe mode stopped it: a lazy chunk the person
       * loads well after the page settled (here `/usage`, against a funded API) is not cached again, whatever the
       * timing (FP5, adaptive app deployment mode W12 rework). */
      await page.route(/\/v1\/deployment(?:\?|$)/u, async (route) => {
        await route.fulfill({
          status: 200,
          headers: { 'access-control-allow-origin': live.origin, 'content-type': 'application/json' },
          body: JSON.stringify({
            version: 1,
            edition: 'cloud',
            billing: { funded: true, environment: 'development' },
            maxAgeSeconds: 300,
          }),
        });
      });
      await page.waitForTimeout(15_000);
      const lateChunks: string[] = [];
      page.on('request', (request) => {
        const { pathname } = new URL(request.url());
        if (pathname.startsWith('/assets/') && pathname.endsWith('.js')) {
          lateChunks.push(pathname);
        }
      });
      await page.evaluate(async () => {
        const router = (
          globalThis as unknown as { __reactRouterDataRouter: { navigate: (path: string) => Promise<void> } }
        ).__reactRouterDataRouter;
        await router.navigate('/usage');
      });
      await page.waitForURL(/\/usage$/u);
      await page.waitForTimeout(5000);
      expect(lateChunks.length, 'the in-app navigation loaded no lazy chunk').toBeGreaterThan(0);
      expect(await readWorkerState(page)).toMatchObject({ registered: false, caches: [] });
    }, 180_000);
  });

  describe('cache-first shells bounded by the server’s build floor (FP2)', () => {
    /**
     * The page's own build check (`installLiveBuildChecks`): restored from the back/forward cache, a page asks
     * `/health/build`, and hands the floor in the answer to its worker. Dispatched rather than waited for, since the
     * other triggers are five minutes visible or a minute hidden.
     */
    const askLiveBuild = async (page: Page): Promise<void> => {
      await page.evaluate(() => {
        globalThis.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      });
    };

    /** The floor the worker stored (`tau-state-v3`), read without creating its cache. */
    const readStoredFloor = async (page: Page): Promise<string | undefined> => {
      try {
        return await page.evaluate(async () => {
          const stored = await caches.match('/__tau/build-floor', { cacheName: 'tau-state-v3' });
          return stored === undefined ? undefined : stored.text();
        });
      } catch {
        // Between documents.
        return undefined;
      }
    };

    /**
     * A returning visitor's two visits: the first installs the previous deploy's worker (and, with `floor`, the
     * operator raises the floor above that build while it is live and the page's build check hands it to the worker);
     * the next deploy goes live; the second visit opens a project, and its first navigation is the installed worker's
     * to answer, from a worker started afresh.
     */
    const reopenAfterDeploy = async (
      options: Readonly<{ floor?: boolean; offline?: boolean }> = {},
    ): Promise<{
      readonly state: BootState;
      readonly fromCache: boolean;
      readonly fromWorker: boolean;
      readonly live: DeployServer;
      readonly page: Page;
    }> => {
      const { same } = requireDeploys();
      const live = await startDeployServer(
        same.builds,
        { shells: same.shells, workers: same.workers.scripts },
        { hold: false, retain: true },
      );
      server = live;
      visitor = createReturningVisitor(async (profile) =>
        chromium.launchPersistentContext(profile, { executablePath: process.env['TAU_E2E_CHROMIUM_EXECUTABLE'] }),
      );
      await visitor.visit(async (page) => {
        await page.goto(`${live.origin}/projects`, { waitUntil: 'networkidle' });
        await waitForControllingWorker(page);
        if (options.floor === true) {
          // The operator's floor (`TAU_MIN_BUILD_ID`), read by both deploys' `/health/build` on every request.
          process.env['TAU_MIN_BUILD_ID'] = String((deploys?.previousBuildId ?? 0) + 1);
          await askLiveBuild(page);
          await expect
            .poll(async () => readStoredFloor(page), { timeout: 30_000, interval: 250 })
            .toBe(process.env['TAU_MIN_BUILD_ID']);
        }
      });
      live.deploy();
      // Kept open, so a row can go on in the same visit.
      const result = await visitor.visit(
        async (page, context) => {
          watch(page);
          if (options.offline === true) {
            await context.setOffline(true);
          }
          const response = await page.goto(`${live.origin}/w/home/bracket-v2`, { waitUntil: 'commit' });
          const headers = await response?.allHeaders();
          const state = await waitForMount(page);
          return {
            state,
            fromCache: (headers?.['server-timing'] ?? '').includes('sw;desc=cache'),
            fromWorker: response?.fromServiceWorker() === true,
            page,
          };
        },
        { keepOpen: true },
      );
      return { ...result, live };
    };

    afterEach(() => {
      delete process.env['TAU_MIN_BUILD_ID'];
    });

    it('should open the cached shell at or above the floor with no document request first, then the next build once replaced', async () => {
      const { same } = requireDeploys();
      const { state, fromCache, page, live } = await reopenAfterDeploy();
      expect(fromCache).toBe(true);
      expect(state).toStrictEqual({ mounted: true, stripShown: false, buildId: String(same.previousBuildId) });
      expect(failedAssets).toStrictEqual([]);

      // The page's build check finds the next deploy (`replaced`); the update rule activates the next worker, which
      // the browser's update check on the open installed.
      await askLiveBuild(page);
      await expect.poll(async () => readNextWorker(page, same), { timeout: 60_000, interval: 500 }).toBe('active');
      await page.goto(`${live.origin}/w/home/bracket-v2`, { waitUntil: 'commit' });
      expect(await waitForMount(page)).toStrictEqual({
        mounted: true,
        stripShown: false,
        buildId: String(same.nextBuildId),
      });
      expect(failedAssets).toStrictEqual([]);
    }, 180_000);

    it('should open the live build on the first online navigation when the cached shell is below the floor the server reported', async () => {
      const { same } = requireDeploys();
      const { state, fromCache } = await reopenAfterDeploy({ floor: true });
      expect(fromCache).toBe(false);
      expect(state).toStrictEqual({ mounted: true, stripShown: false, buildId: String(same.nextBuildId) });
      expect(failedAssets).toStrictEqual([]);
    }, 180_000);

    it('should open the precached shell offline whatever the floor', async () => {
      const { state, fromWorker } = await reopenAfterDeploy({ floor: true, offline: true });
      expect(fromWorker).toBe(true);
      expect(state).toMatchObject({ mounted: true, stripShown: false });
    }, 180_000);
  });

  describe('when the precached shell names a route manifest the live deploy no longer serves (D4)', () => {
    /**
     * A returning visitor's two visits. The first installs the worker from a page outside a project workspace; between
     * them the next deploy goes live and the previous deploy's route manifest leaves retention; the second opens a
     * project, online or offline, and its first navigation is answered by the installed worker.
     */
    const visitTwice = async (
      offline: boolean,
    ): Promise<{ readonly state: BootState; readonly fromWorker: boolean }> => {
      const { same } = requireDeploys();
      const manifest = /import "(\/assets\/manifest-[\da-f]+\.js)"/u.exec(same.shells.previous)?.[1];
      if (manifest === undefined) {
        expect.fail('the prerendered project shell imports no route manifest');
      }
      const live = await startDeployServer(
        same.builds,
        {
          shells: { previous: same.shells.previous.replaceAll(manifest, previousOnlyManifest), next: same.shells.next },
          // The previous deploy's worker names the manifest wherever its build named it.
          workers: {
            previous: same.workers.scripts.previous.replaceAll(manifest, previousOnlyManifest),
            next: same.workers.scripts.next,
          },
          previousOnly: { [previousOnlyManifest]: readFileSync(join(buildRoot, 'client', manifest.slice(1)), 'utf8') },
        },
        { hold: false, retain: true },
      );
      server = live;
      visitor = createReturningVisitor(async (profile) =>
        chromium.launchPersistentContext(profile, { executablePath: process.env['TAU_E2E_CHROMIUM_EXECUTABLE'] }),
      );
      await visitor.visit(async (page) => {
        await page.goto(`${live.origin}/projects`, { waitUntil: 'networkidle' });
        await waitForControllingWorker(page);
      });
      live.deploy();
      return visitor.visit(async (page, opened) => {
        watch(page);
        if (offline) {
          await opened.setOffline(true);
        }
        const response = await page.goto(`${live.origin}/w/home/bracket-v2`, { waitUntil: 'commit' });
        const state = await waitForMount(page);
        return { state, fromWorker: response?.fromServiceWorker() === true };
      });
    };

    it('row 2: should mount a project online within the boot deadline with no failed file', async () => {
      const { state } = await visitTwice(false);
      expect(state.mounted).toBe(true);
      expect(state.stripShown).toBe(false);
      expect(failedAssets).toStrictEqual([]);
    }, 180_000);

    it('row 7: should mount a project on its first controlled open offline', async () => {
      const { state, fromWorker } = await visitTwice(true);
      expect(fromWorker).toBe(true);
      expect(state.mounted).toBe(true);
      expect(state.stripShown).toBe(false);
    }, 180_000);
  });

  it('row 8: should let the browser’s own navigation reach the server under the worker', async () => {
    const { same } = requireDeploys();
    const { page, live } = await openUnderWorker(same, same.workers.scripts);
    const from = live.requests.length;
    // A reload of Home with the app entry (network first), and Home without it (passed to the network).
    await page.reload({ waitUntil: 'commit' });
    await waitForMount(page);
    await context?.clearCookies({ name: 'tau-entry' });
    await page.goto(`${live.origin}/`, { waitUntil: 'commit' });
    await page.waitForLoadState('domcontentloaded');
    const documents = live.requests.slice(from).filter((request) => request.path === '/');
    expect(documents.length).toBeGreaterThanOrEqual(2);
    // Chrome keeps `navigate` as the mode of a navigation the worker re-issues, but not its destination (`empty`).
    expect(documents.map(({ mode, destination }) => ({ mode, destination }))).toStrictEqual(
      documents.map(() => ({ mode: 'navigate', destination: 'document' })),
    );
  }, 180_000);
});
