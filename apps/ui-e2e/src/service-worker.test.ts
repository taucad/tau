/**
 * The web app's one service worker on a built app (progressive loading PL7, shell invariants 8 and 9).
 *
 * The real production UI build is served as the deployed site serves it for these purposes: the client output as
 * static files, every other request to the server build, cross-origin isolation headers on every response
 * (`coiMiddleware`). A first visit installs the worker; with the browser then offline, Home (the visitor's `tau-entry`
 * preference set, and the installed app's start URL) and a project created on this device open from the worker, each
 * cross-origin isolated, from the precached shell with its headers replayed. API, auth, data requests and marketing
 * pages are never answered by it, and the precache holds exactly the list the build generated from the route-class
 * registry: no deferred-tier, wasm or worker asset.
 *
 * Needs a built UI (`nx run ui:build`). `TAU_E2E_CHROMIUM_EXECUTABLE` points at a Chromium other than Playwright's
 * pinned revision.
 */
// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createRequestHandler } from '@react-router/express';
import { coiMiddleware } from '@taucad/runtime/cross-origin-isolation/express';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page, Response as PageResponse } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type ServerBuild = Parameters<typeof createRequestHandler>[0]['build'];
// oxlint-disable-next-line typescript/no-restricted-types -- Workbox's precache wire value for "no revision".
type PrecacheEntry = { readonly url: string; readonly revision: string | null };

const buildRoot = resolve(import.meta.dirname, '../../ui/build');
const clientRoot = join(buildRoot, 'client');
const workspace = '[data-project-workspace]';

const startServer = async (build: ServerBuild): Promise<{ origin: string; close: () => Promise<void> }> => {
  const app = express();
  app.disable('x-powered-by');
  app.use(coiMiddleware());
  app.use('/assets', express.static(join(clientRoot, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(clientRoot, { maxAge: '1h' }));
  app.all('*splat', createRequestHandler({ build }));
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  };
};

/**
 * Wait until the worker controls the page and is activated: its precache install has completed. The predicate is
 * synchronous: `waitForFunction` would take an unsettled promise for a truthy answer.
 */
const waitForControllingWorker = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated', undefined, {
    timeout: 60_000,
    polling: 250,
  });
};

/** What an open shows: the response's source and headers, and the page's isolation. */
const readOpen = async (
  page: Page,
  // oxlint-disable-next-line typescript/no-restricted-types -- Playwright's `goto` answers `null` for no response.
  response: PageResponse | null,
): Promise<{
  fromServiceWorker: boolean;
  status: number;
  opener: string | undefined;
  embedder: string | undefined;
  servedFromCache: boolean;
  crossOriginIsolated: boolean;
}> => {
  if (response === null) {
    expect.fail('the navigation had no response');
  }
  const headers = await response.allHeaders();
  return {
    fromServiceWorker: response.fromServiceWorker(),
    status: response.status(),
    opener: headers['cross-origin-opener-policy'],
    embedder: headers['cross-origin-embedder-policy'],
    servedFromCache: (headers['server-timing'] ?? '').includes('sw;desc=cache'),
    crossOriginIsolated: await page.evaluate(() => globalThis.crossOriginIsolated),
  };
};

const isolatedFromCache = {
  fromServiceWorker: true,
  status: 200,
  opener: 'same-origin',
  embedder: 'require-corp',
  servedFromCache: true,
  crossOriginIsolated: true,
};

describe('the web app’s service worker on a built app (PL7)', () => {
  let browser: Browser | undefined;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let context: BrowserContext | undefined;
  let precache: readonly PrecacheEntry[] = [];

  beforeAll(async () => {
    const build = (await import(pathToFileURL(join(buildRoot, 'server/index.js')).href)) as ServerBuild;
    precache = JSON.parse(await readFile(join(buildRoot, 'service-worker-precache.json'), 'utf8')) as PrecacheEntry[];
    server = await startServer(build);
    browser = await chromium.launch({ executablePath: process.env['TAU_E2E_CHROMIUM_EXECUTABLE'] });
    context = await browser.newContext();
    // The first-visit analytics banner stays out, as in every other UI e2e context: Do Not Track suppresses it.
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'doNotTrack', { configurable: true, get: () => '1' });
    });
  }, 120_000);

  afterAll(async () => {
    await context?.close();
    await browser?.close();
    await server?.close();
  });

  const origin = (): string => server?.origin ?? expect.fail('the server did not start');
  const newPage = async (): Promise<Page> => (context ?? expect.fail('the browser did not start')).newPage();

  it('should open Home and a local project offline from the worker, cross-origin isolated', async () => {
    await context?.addCookies([{ name: 'tau-entry', value: 'app', url: origin() }]);
    const page = await newPage();
    await page.goto(`${origin()}/projects/new`);
    await waitForControllingWorker(page);

    await page.locator('input#project-name').fill('Offline gearbox');
    await page.getByRole('button', { name: /Create Project/u }).click();
    await page.waitForURL(/\/w\/[^/]+\/[^/?]+$/u, { timeout: 60_000 });
    await page.locator(workspace).waitFor({ timeout: 60_000 });
    const projectUrl = page.url();
    // Opened online under the worker, so the deferred files the project needs are cached on first use.
    await page.goto(projectUrl, { waitUntil: 'networkidle' });
    await page.locator(workspace).waitFor({ timeout: 60_000 });
    await page.close();

    await context?.setOffline(true);
    try {
      const offline = await newPage();
      const project = await readOpen(offline, await offline.goto(projectUrl));
      expect(project).toStrictEqual(isolatedFromCache);
      await offline.locator(workspace).waitFor({ timeout: 60_000 });
      expect(await offline.getByRole('heading', { name: 'Something went wrong' }).count()).toBe(0);

      const home = await readOpen(offline, await offline.goto(`${origin()}/`));
      expect(home).toStrictEqual(isolatedFromCache);
      await offline.getByRole('main').waitFor({ timeout: 60_000 });

      // The installed app's start URL opens Home whatever the preference.
      await context?.clearCookies({ name: 'tau-entry' });
      const launch = await readOpen(offline, await offline.goto(`${origin()}/?source=pwa`));
      expect(launch).toStrictEqual(isolatedFromCache);
      await offline.getByRole('main').waitFor({ timeout: 60_000 });
      await offline.close();
    } finally {
      await context?.setOffline(false);
    }
  }, 300_000);

  it('should leave API, auth, data and marketing requests to the network', async () => {
    const page = await newPage();
    await page.goto(`${origin()}/projects`);
    await waitForControllingWorker(page);

    const fetchFromPage = async (path: string): Promise<PageResponse> => {
      const [response] = await Promise.all([
        page.waitForResponse((candidate) => new URL(candidate.url()).pathname === path),
        page.evaluate(async (url) => {
          await fetch(url).catch(() => undefined);
        }, path),
      ]);
      return response;
    };
    /* oxlint-disable no-await-in-loop -- One request at a time, so each response is matched to its own path. */
    for (const path of [
      '/api/v1/projects',
      '/auth/get-session',
      '/_.data',
      '/w/home/bracket-v2.data',
      '/health/build',
    ]) {
      const response = await fetchFromPage(path);
      expect(response.fromServiceWorker(), path).toBe(false);
    }
    for (const path of ['/pricing', '/auth/sign-in']) {
      const response = await page.goto(`${origin()}${path}`);
      expect(response?.fromServiceWorker(), path).toBe(false);
    }
    /* oxlint-enable no-await-in-loop */
    // `/` without the app preference is marketing: the network's answer, never the cached Home shell.
    await context?.clearCookies({ name: 'tau-entry' });
    const marketing = await page.goto(`${origin()}/`);
    const marketingHeaders = await marketing?.allHeaders();
    expect(marketingHeaders?.['server-timing'] ?? '').not.toContain('sw;desc=cache');
    await page.close();
  }, 120_000);

  it('should precache exactly the generated list, and keep no API or data response anywhere', async () => {
    const page = await newPage();
    await page.goto(`${origin()}/projects`);
    await waitForControllingWorker(page);

    const stored = await page.evaluate(async () => {
      const names = await caches.keys();
      return Promise.all(
        names.map(async (name) => {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          return {
            name,
            urls: keys.map((request) => {
              const url = new URL(request.url);
              url.searchParams.delete('__WB_REVISION__');
              return `${url.pathname}${url.search}`;
            }),
          };
        }),
      );
    });
    const precached = stored.find((cache) => cache.name.startsWith('tau-precache-'));
    expect(precached?.urls.toSorted()).toStrictEqual(precache.map((entry) => entry.url).toSorted());
    expect(stored.map((cache) => cache.name).filter((name) => !name.startsWith('tau-precache-'))).toStrictEqual(
      stored.some((cache) => cache.name === 'tau-assets') ? ['tau-assets'] : [],
    );
    const everything = stored.flatMap((cache) => cache.urls);
    expect(everything.filter((url) => /\.data|^\/api\/|^\/auth\/|^\/health\//u.test(url))).toStrictEqual([]);
    expect(precache.filter((entry) => entry.url.endsWith('.wasm'))).toStrictEqual([]);
    await page.close();
  }, 120_000);
});
