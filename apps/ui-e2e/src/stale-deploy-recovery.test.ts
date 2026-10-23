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
 * Needs a built UI (`nx run ui:build`). `TAU_E2E_CHROMIUM_EXECUTABLE` points at
 * a Chromium other than Playwright's pinned revision.
 */
// @vitest-environment node
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

const startDeployServer = async (builds: Readonly<Record<Deploy, ServerBuild>>): Promise<DeployServer> => {
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
    const renderedByNext = request.headers.cookie?.includes(`${deployCookie}=next`) === true;
    if (live === 'previous' && heldChunk.test(request.originalUrl)) {
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
  app.use(express.static(clientRoot, { maxAge: '1h' }));
  app.all('*splat', (request: Request, response: Response, next) => {
    if (request.headers['sec-fetch-dest'] === 'document') {
      documents.push(live);
      response.cookie(deployCookie, live, { path: '/' });
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
      const offered = [...document.querySelectorAll('button')].some(
        (button) => button.textContent?.trim() === 'Reload' && !button.disabled,
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
  const open = async (): Promise<{ readonly page: Page; readonly live: DeployServer; readonly errors: string[] }> => {
    if (browser === undefined || builds === undefined) {
      expect.fail('the builds and browser did not start');
    }
    const live = await startDeployServer(builds);
    server = live;
    context = await browser.newContext();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /dynamically imported module/u.test(message.text())) {
        errors.push(message.text());
      }
    });
    await page.goto(`${live.origin}/`, { waitUntil: 'commit' });
    await live.heldRequest;
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
});
