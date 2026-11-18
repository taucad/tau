/**
 * TAU-UI-6: a deploy lands while a freshly loaded page is still fetching its
 * lazy chunks, and the replaced build's chunks are no longer served.
 *
 * The server holds two deploys of one `apps/ui/build`: the previous one as
 * built, and the next one, a copy of its server bundle with a later build id.
 * A deploy deletes the previous deploy's hashed chunks, so once the next
 * deploy is live an `/assets/*` request from a page the previous one rendered
 * answers `404 text/html`, as Netlify does; the next deploy's own pages get
 * their chunks. Which deploy rendered a page travels in a cookie set on
 * document responses only.
 *
 * The page opens on the previous deploy. Its lazily imported command-palette
 * chunk, which every route mounts right after hydration, is held at the server
 * until the next deploy goes live, so the import fails exactly as it did on
 * staging. WebKit words it "Importing a module script failed."; Chromium, used
 * here, "Failed to fetch dynamically imported module". No retention is modelled:
 * this is the page that outlived it (`apps/ui/scripts/retain-previous-assets.mts`).
 *
 * An untouched page reloads into the new deploy on its own; a page the user has
 * worked on is offered the reload and keeps its state until the user takes it.
 *
 * Project URLs are answered as Netlify answers them (PL3): with the deploy's
 * prerendered project shell, not a server render. The shell is a build output,
 * so a page opened from it must carry its own deploy's build id for the guard
 * to tell that a newer deploy replaced it.
 *
 * The web app's service worker (PL7) is served per deploy too: the next
 * deploy's worker precaches the next deploy's project shell. A request with no
 * deploy cookie, as the worker's precache requests are, reaches the live
 * deploy, as Netlify answers a request with no skew protection token. A tab the
 * worker controls keeps working after the deploy, and the update rule (ruling
 * OD3) activates the new worker once the server names the new build, so the
 * next document load opens the new deploy.
 *
 * Needs a built UI (`nx run ui:build`). `TAU_E2E_CHROMIUM_EXECUTABLE` points at
 * a Chromium other than Playwright's pinned revision.
 */
// @vitest-environment node
import { createHash } from 'node:crypto';
import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';
import { createRequestHandler } from '@react-router/express';
import { coiMiddleware } from '@taucad/runtime/cross-origin-isolation/express';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

type Deploy = 'previous' | 'next';
type ServerBuild = Parameters<typeof createRequestHandler>[0]['build'];
type Settled = 'reloaded into the next deploy' | 'reload offered' | 'error page';

const buildRoot = resolve(import.meta.dirname, '../../ui/build');
const clientRoot = join(buildRoot, 'client');
/** Beside `server/`, so the copy resolves the same externals and `../client` assets. */
const nextServerRoot = join(buildRoot, 'server-next-deploy');
const deployCookie = 'tau-e2e-deploy';
/** The project shell the build prerenders (`apps/ui/app/lib/route-classes.ts`), and the URLs Netlify rewrites to it. */
const projectShellFile = join(clientRoot, 'w/__shell/__shell/index.html');
/** Where the service worker precaches the project shell from, and the worker itself. */
const projectShellUrl = '/w/__shell/__shell/index.html';
const serviceWorkerUrl = '/service-worker.js';
const projectUrl = /^\/w\/[^/.]+\/[^/.]+\/?$/u;
const heldChunk = /^\/assets\/example-command-items-[\w-]+\.js$/u;
/** Milliseconds between the two deploys' build ids. */
const deployGap = 60_000;

/** What Netlify answers for a hashed asset the live deploy does not have. */
const sendDeletedAsset = (response: Response): void => {
  response
    .status(404)
    .type('text/html')
    .set('Cache-Control', 'no-cache')
    .send('<!DOCTYPE html><title>Not Found</title>');
};

const readBuildId = (html: string): number => {
  const match = /TAU_BUILD_ID\\?":\\?"(\d+)/u.exec(html);
  if (match?.[1] === undefined) {
    throw new Error('The rendered document publishes no TAU_BUILD_ID.');
  }
  return Number(match[1]);
};

/** Each deploy's project shell: the prerendered file, and for the next deploy the same file under its build id. */
const readShells = async (previousBuildId: number, nextBuildId: number): Promise<Record<Deploy, string>> => {
  const previous = await readFile(projectShellFile, 'utf8');
  if (readBuildId(previous) !== previousBuildId) {
    throw new Error('The prerendered project shell carries another build id than the server bundle it was built with.');
  }
  return { previous, next: previous.replaceAll(String(previousBuildId), String(nextBuildId)) };
};

/**
 * Each deploy's service worker: the build's own for the previous deploy, and for the next one the same worker whose
 * precache names the next deploy's shell, by its content revision, as a new build's worker does.
 */
const readWorkers = async (
  shells: Readonly<Record<Deploy, string>>,
): Promise<{ scripts: Record<Deploy, string>; shellRevisions: Record<Deploy, string> }> => {
  const previous = await readFile(join(clientRoot, serviceWorkerUrl.slice(1)), 'utf8');
  const entry = new RegExp(`"revision":"([\\da-f]+)","url":"${projectShellUrl}"`, 'u').exec(previous);
  if (entry?.[1] === undefined) {
    throw new Error('The built service worker does not precache the project shell.');
  }
  const nextRevision = createHash('sha256').update(shells.next).digest('hex').slice(0, entry[1].length);
  return {
    scripts: { previous, next: previous.replace(entry[0], entry[0].replace(entry[1], nextRevision)) },
    shellRevisions: { previous: entry[1], next: nextRevision },
  };
};

/** Copy the previous deploy's server bundle as the next deploy: the same code under a later build id. */
const createNextDeploy = async (previousBuildId: number, nextBuildId: number): Promise<void> => {
  await rm(nextServerRoot, { recursive: true, force: true });
  await cp(join(buildRoot, 'server'), nextServerRoot, { recursive: true });
  const entries = await readdir(nextServerRoot, { recursive: true });
  const scripts = entries.filter((name) => name.endsWith('.js'));
  const replaced = await Promise.all(
    scripts.map(async (name) => {
      const path = join(nextServerRoot, name);
      const source = await readFile(path, 'utf8');
      if (!source.includes(String(previousBuildId))) {
        return false;
      }
      await writeFile(path, source.replaceAll(String(previousBuildId), String(nextBuildId)));
      return true;
    }),
  );
  if (!replaced.includes(true)) {
    throw new Error(`Build id ${String(previousBuildId)} does not occur in the server bundle.`);
  }
};

const importServerBuild = async (root: string): Promise<ServerBuild> =>
  (await import(pathToFileURL(join(root, 'index.js')).href)) as ServerBuild;

/** Two deploys behind one origin, switched by `deploy`. */
type DeployServer = {
  readonly origin: string;
  readonly documents: Deploy[];
  readonly heldRequest: Promise<void>;
  deploy(): void;
  close(): Promise<void>;
};

const startDeployServer = async (
  builds: Readonly<Record<Deploy, ServerBuild>>,
  files?: Readonly<{ shells: Readonly<Record<Deploy, string>>; workers: Readonly<Record<Deploy, string>> }>,
  hold = true,
): Promise<DeployServer> => {
  const shells = files?.shells;
  const workers = files?.workers;
  let live: Deploy = 'previous';
  const documents: Deploy[] = [];
  const held: Array<() => void> = [];
  let markHeld: () => void = () => undefined;
  const heldRequest = new Promise<void>((resolve) => {
    markHeld = resolve;
  });
  const handlers = {
    previous: createRequestHandler({ build: builds.previous }),
    next: createRequestHandler({ build: builds.next }),
  };
  const serveAsset = express.static(clientRoot, { immutable: true, maxAge: '1y' });

  const app = express();
  app.disable('x-powered-by');
  app.use(coiMiddleware());
  app.use('/assets', (request: Request, response: Response, next) => {
    // A request with no deploy cookie (the service worker's precache) reaches the live deploy.
    const cookie = request.headers.cookie ?? '';
    const renderedByNext =
      cookie.includes(`${deployCookie}=next`) || (live === 'next' && !cookie.includes(deployCookie));
    if (hold && live === 'previous' && heldChunk.test(request.originalUrl)) {
      held.push(() => {
        sendDeletedAsset(response);
      });
      markHeld();
      return;
    }
    if (live === 'next' && !renderedByNext) {
      sendDeletedAsset(response);
      return;
    }
    serveAsset(request, response, next);
  });
  app.get(serviceWorkerUrl, (_request: Request, response: Response, next) => {
    if (workers === undefined) {
      next();
      return;
    }
    response.status(200).type('text/javascript').set('Cache-Control', 'no-cache').send(workers[live]);
  });
  app.get(projectShellUrl, (_request: Request, response: Response, next) => {
    if (shells === undefined) {
      next();
      return;
    }
    response
      .status(200)
      .type('text/html')
      .set('Cache-Control', 'public, max-age=0, must-revalidate')
      .send(shells[live]);
  });
  app.use(express.static(clientRoot, { maxAge: '1h' }));
  app.all('*splat', (request: Request, response: Response, next) => {
    if (request.headers['sec-fetch-dest'] === 'document') {
      documents.push(live);
      response.cookie(deployCookie, live, { path: '/' });
    }
    if (shells !== undefined && request.method === 'GET' && projectUrl.test(request.path)) {
      response
        .status(200)
        .type('text/html')
        .set('Cache-Control', 'public, max-age=0, must-revalidate')
        .send(shells[live]);
      return;
    }
    void handlers[live](request, response, next);
  });

  const server: Server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    documents,
    heldRequest,
    deploy() {
      live = 'next';
      for (const release of held.splice(0)) {
        release();
      }
    },
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

/** What the page settled on after the deploy, read in one poll so no second waiter is left pending. */
const settledState = async (page: Page, nextBuildId: number): Promise<Settled> => {
  const handle = await page.waitForFunction(
    (id) => {
      if ((globalThis as { ENV?: { TAU_BUILD_ID?: string } }).ENV?.TAU_BUILD_ID === id) {
        return 'reloaded into the next deploy';
      }
      const headings = new Set([...document.querySelectorAll('h1')].map((heading) => heading.textContent));
      if (headings.has('Something went wrong')) {
        return 'error page';
      }
      // While the page's own reload is pending the same screen shows with its button disabled; that is not an offer.
      // Only a Reload on screen counts: every document also carries the boot watchdog's hidden strip and its Reload.
      const offered = [...document.querySelectorAll('button')].some(
        (button) => button.textContent.trim() === 'Reload' && !button.disabled && button.checkVisibility(),
      );
      return headings.has('Tau has been updated') && offered ? 'reload offered' : false;
    },
    String(nextBuildId),
    { timeout: 30_000 },
  );
  return (await handle.jsonValue()) as Settled;
};

describe('a deploy that replaces a freshly loaded page’s build (TAU-UI-6)', () => {
  let browser: Browser | undefined;
  let builds: Readonly<Record<Deploy, ServerBuild>> | undefined;
  let shells: Readonly<Record<Deploy, string>> | undefined;
  let workers: Awaited<ReturnType<typeof readWorkers>> | undefined;
  let server: DeployServer | undefined;
  let context: BrowserContext | undefined;
  let previousBuildId = 0;
  let nextBuildId = 0;

  beforeAll(async () => {
    const previousBuild = await importServerBuild(join(buildRoot, 'server'));
    const probe = await startDeployServer({ previous: previousBuild, next: previousBuild });
    try {
      const response = await fetch(`${probe.origin}/`, { headers: { 'sec-fetch-dest': 'document' } });
      previousBuildId = readBuildId(await response.text());
    } finally {
      await probe.close();
    }
    nextBuildId = previousBuildId + deployGap;
    await createNextDeploy(previousBuildId, nextBuildId);
    builds = { previous: previousBuild, next: await importServerBuild(nextServerRoot) };
    shells = await readShells(previousBuildId, nextBuildId);
    workers = await readWorkers(shells);
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
    await rm(nextServerRoot, { recursive: true, force: true });
  });

  /** A fresh browser context on a fresh pair of deploys, with the previous one live. */
  const open = async (
    path = '/',
    hold = true,
  ): Promise<{ readonly page: Page; readonly live: DeployServer; readonly errors: string[] }> => {
    if (browser === undefined || builds === undefined || shells === undefined || workers === undefined) {
      expect.fail('the builds and browser did not start');
    }
    const live = await startDeployServer(builds, { shells, workers: workers.scripts }, hold);
    server = live;
    context = await browser.newContext();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /dynamically imported module/u.test(message.text())) {
        errors.push(message.text());
      }
    });
    await page.goto(`${live.origin}${path}`, { waitUntil: hold ? 'commit' : 'networkidle' });
    if (hold) {
      await live.heldRequest;
    }
    return { page, live, errors };
  };

  it('should reload into the new deploy instead of showing the error page', async () => {
    const { page, live, errors } = await open();

    live.deploy();

    expect(await settledState(page, nextBuildId), `module load errors: ${JSON.stringify(errors)}`).toBe(
      'reloaded into the next deploy',
    );
    await page.getByRole('main').waitFor({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    expect(await page.getByRole('heading', { name: 'Something went wrong' }).count()).toBe(0);
    expect(live.documents).toStrictEqual(['previous', 'next']);
    // The guard of a completed reload is cleared, so a duplicated tab inherits nothing.
    expect(await page.evaluate(() => globalThis.sessionStorage.getItem('tau-stale-build-reload'))).toBeNull();
  }, 120_000);

  it('should reload a page opened from the project shell into the new deploy’s shell', async () => {
    const { page, live, errors } = await open('/w/home/bracket-v2');

    live.deploy();

    expect(await settledState(page, nextBuildId), `module load errors: ${JSON.stringify(errors)}`).toBe(
      'reloaded into the next deploy',
    );
    await page.waitForLoadState('networkidle');
    expect(await page.getByRole('heading', { name: 'Something went wrong' }).count()).toBe(0);
    expect(live.documents).toStrictEqual(['previous', 'next']);
    expect(new URL(page.url()).pathname).toBe('/w/home/bracket-v2');
  }, 120_000);

  /* React Router 8 migration RR6: route module splitting is on, so a route's client loader could load as a chunk of
   * its own, outside the patched `loadRouteModule` this recovery rests on. The import route has the app's one
   * `clientLoader`; a page fully loaded on the previous deploy navigates to it after the next deploy went live, when
   * none of the previous deploy's chunks are served. */
  it('should load the import route of a replaced build from the new deploy, client loader included', async () => {
    const { page, live, errors } = await open('/', false);
    expect(live.documents).toStrictEqual(['previous']);

    live.deploy();
    await page.evaluate(() => {
      globalThis.history.pushState(null, '', '/import/github.com/taucad/tau');
      globalThis.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(await settledState(page, nextBuildId), `module load errors: ${JSON.stringify(errors)}`).toBe(
      'reloaded into the next deploy',
    );
    await page.waitForLoadState('networkidle');
    expect(await page.getByRole('heading', { name: 'Something went wrong' }).count()).toBe(0);
    expect(live.documents).toStrictEqual(['previous', 'next']);
    expect(new URL(page.url()).pathname).toBe('/import/github.com/taucad/tau');
  }, 120_000);

  it('should offer the reload, never force it, once the user has worked on the page', async () => {
    const { page, live, errors } = await open();
    await page.getByRole('main').waitFor({ timeout: 30_000 });
    await page.mouse.click(1, 1);

    live.deploy();

    expect(await settledState(page, nextBuildId), `module load errors: ${JSON.stringify(errors)}`).toBe(
      'reload offered',
    );
    await page.waitForTimeout(2000);
    expect(live.documents).toStrictEqual(['previous']);

    await page.getByRole('button', { name: 'Reload', exact: true }).click();

    expect(await settledState(page, nextBuildId)).toBe('reloaded into the next deploy');
    expect(live.documents).toStrictEqual(['previous', 'next']);
  }, 120_000);

  /* PL7, ruling OD3: a tab the service worker controls is one deploy behind until the update rule fires. It keeps
   * working on the deploy it loaded, a new document load is answered from the worker's precache, and once the server
   * names the new build the page activates the new worker silently, so the next document load opens the new deploy. */
  it('should keep a worker-controlled tab working and open the new deploy once the update rule fires', async () => {
    // The worker installs from a page outside a project workspace (B-27), then answers the project's opens.
    const { page, live } = await open('/projects', false);
    const buildIdOf = async (): Promise<string | undefined> =>
      page.evaluate(() => (globalThis as { ENV?: { TAU_BUILD_ID?: string } }).ENV?.TAU_BUILD_ID);
    await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated', undefined, {
      timeout: 60_000,
      polling: 250,
    });
    // Opened again under the worker: the shell comes from its precache and the deferred files are cached on first use.
    const controlled = await page.goto(`${live.origin}/w/home/bracket-v2`, { waitUntil: 'networkidle' });
    expect(controlled?.fromServiceWorker()).toBe(true);
    expect(await buildIdOf()).toBe(String(previousBuildId));

    live.deploy();

    // One deploy behind: the old worker answers the open from its precache, and the page keeps working.
    const behind = await page.goto(`${live.origin}/w/home/bracket-v2`, { waitUntil: 'networkidle' });
    expect(behind?.fromServiceWorker()).toBe(true);
    expect(await buildIdOf()).toBe(String(previousBuildId));
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
      .toStrictEqual([workers?.shellRevisions.next]);
    const noneWaiting = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration?.waiting === null;
    });
    expect(noneWaiting).toBe(true);
    expect(await buildIdOf()).toBe(String(previousBuildId));

    const updated = await page.goto(`${live.origin}/w/home/bracket-v2`, { waitUntil: 'networkidle' });
    expect(updated?.fromServiceWorker()).toBe(true);
    expect(await buildIdOf()).toBe(String(nextBuildId));
    expect(await page.getByRole('heading', { name: 'Something went wrong' }).count()).toBe(0);
    expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(true);
  }, 180_000);
});
