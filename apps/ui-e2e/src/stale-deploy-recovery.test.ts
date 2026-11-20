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
 * These pages run without the web app's service worker (PL7): their contexts
 * block service workers. This suite is the recovery of a page whose chunks
 * the network no longer serves. A page the worker controls asks for such a
 * chunk again without its deploy cookie (`retryUnpinnedMiss`), and here the
 * next deploy is a byte-identical copy that has every previous chunk, so
 * whether a page reached recovery depended on whether the worker, registered
 * once the page is idle, had taken it before the deploy (a flake, merge queue
 * job 135169781115). What a worker-controlled tab does across a deploy is
 * `service-worker-deploy.test.ts`'s, in the nightly suite until it ratchets.
 *
 * A page fully loaded on the previous deploy, whose chunks the next deploy still
 * serves (retention modelled), learns that the next deploy is live and then
 * navigates: the root's client middleware (RR9) loads the destination as a
 * document from the next deploy, a push as a push and a replace as a replace,
 * where the router alone would have rendered it on the previous build.
 *
 * Needs a built UI (`nx run ui:build`). `TAU_E2E_CHROMIUM_EXECUTABLE` points at
 * a Chromium other than Playwright's pinned revision.
 */
// @vitest-environment node
import process from 'node:process';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
// oxlint-disable no-restricted-imports -- The Node-only target runs without browser aliases.
import { prepareDeploys, startDeployServer } from './support/two-deploys.ts';
import type { DeployServer, Deploys } from './support/two-deploys.ts';
// oxlint-enable no-restricted-imports

type Settled = 'reloaded into the next deploy' | 'reload offered' | 'error page';

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
  let deploys: Deploys | undefined;
  let server: DeployServer | undefined;
  let context: BrowserContext | undefined;
  let nextBuildId = 0;

  beforeAll(async () => {
    deploys = await prepareDeploys('recovery');
    nextBuildId = deploys.nextBuildId;
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

  /** A fresh browser context on a fresh pair of deploys, with the previous one live. */
  const open = async (
    path = '/',
    hold = true,
    retain = false,
  ): Promise<{ readonly page: Page; readonly live: DeployServer; readonly errors: string[] }> => {
    if (browser === undefined || deploys === undefined) {
      expect.fail('the builds and browser did not start');
    }
    const live = await startDeployServer(
      deploys.builds,
      { shells: deploys.shells, workers: deploys.workers.scripts },
      { hold, retain },
    );
    server = live;
    // No worker (see the file comment): recovery must not depend on whether one took the page first.
    context = await browser.newContext({ serviceWorkers: 'block' });
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

  /** Deploy the next build and have the page ask the server, as a tab restored from the back/forward cache does. */
  const deployAndTell = async (page: Page, live: DeployServer): Promise<void> => {
    live.deploy();
    await page.evaluate(() => {
      globalThis.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    // `build-skew` takes the server's word after it named the next build three times (`serverConfirmations`).
    await expect.poll(() => live.buildChecks(), { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
    await page.waitForTimeout(500);
  };

  /* React Router 8 migration RR9: once the server names another build, the root's client middleware turns a client
   * navigation into a document load from the live deploy. The previous deploy's chunks are still served here, so
   * without it the router would render the destination on the previous build. */
  it('should load the next page from the new deploy once the server names it, as a push', async () => {
    const { page, live } = await open('/', false, true);
    await page.getByRole('main').waitFor({ timeout: 30_000 });
    const historyLength = await page.evaluate(() => globalThis.history.length);

    // Any in-app link to another page that Home shows: `<Link>` calls the router's `navigate`.
    const link = page.locator('a[href^="/"]:not([href="/"]):not([href^="//"]):visible').first();
    const href = await link.getAttribute('href');

    await deployAndTell(page, live);
    await link.click();

    expect(await settledState(page, nextBuildId)).toBe('reloaded into the next deploy');
    await page.waitForLoadState('networkidle');
    expect(new URL(page.url()).pathname).toBe(new URL(href ?? '', live.origin).pathname);
    expect(live.documents).toStrictEqual(['previous', 'next']);
    expect(await page.evaluate(() => globalThis.history.length)).toBe(historyLength + 1);
  }, 120_000);

  it('should load the next page from the new deploy once the server names it, keeping a replace', async () => {
    const { page, live } = await open('/', false, true);
    await page.getByRole('main').waitFor({ timeout: 30_000 });
    const historyLength = await page.evaluate(() => globalThis.history.length);

    await deployAndTell(page, live);
    // `useNavigate()(to, { replace: true })` calls this; the test reaches it through React Router's own global.
    await page.evaluate(() => {
      const router = (
        globalThis as unknown as {
          readonly __reactRouterDataRouter: {
            navigate: (to: string, options: { readonly replace: boolean }) => Promise<void>;
          };
        }
      ).__reactRouterDataRouter;
      void router.navigate('/files?from=home', { replace: true });
    });

    expect(await settledState(page, nextBuildId)).toBe('reloaded into the next deploy');
    await page.waitForLoadState('networkidle');
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe('/files?from=home');
    expect(live.documents).toStrictEqual(['previous', 'next']);
    expect(await page.evaluate(() => globalThis.history.length)).toBe(historyLength);
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

/*
 * PL7 staging defects FP9 (rows 9 and 11 of its red-first table): one build, the file present, one transient failure.
 * A code load that failed once can never succeed again in the same page, since the browser keeps a failed module, and
 * every module that failed with it, for the realm's life; the only general recovery is a new realm. So a failure on a
 * build the server still runs reloads an untouched page into that build, and optional code degrades where it failed.
 * The server drops the connection of one request after its response has begun (`failNext`), as a network change on
 * wake or a dead connection does; a missing file would not catch it. The TAU-UI-6 rows above are the control: a chunk
 * a replaced build no longer serves.
 */
describe('a code load that fails once on the build the server still runs (FP9, FP10)', () => {
  let browser: Browser | undefined;
  let deploys: Deploys | undefined;
  let server: DeployServer | undefined;
  let context: BrowserContext | undefined;

  beforeAll(async () => {
    deploys = await prepareDeploys('transient');
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

  /** A fresh context on a server whose previous deploy stays live: no deploy happens in these rows. */
  const open = async (): Promise<{ readonly page: Page; readonly live: DeployServer; readonly failures: string[] }> => {
    if (browser === undefined || deploys === undefined) {
      expect.fail('the builds and browser did not start');
    }
    const live = await startDeployServer(
      deploys.builds,
      { shells: deploys.shells, workers: deploys.workers.scripts },
      { hold: false },
    );
    server = live;
    context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const failures: string[] = [];
    page.on('console', (message) => {
      if (/dynamically imported module|Importing a module script failed/u.test(message.text())) {
        failures.push(message.text());
      }
    });
    page.on('pageerror', (error) => {
      if (/dynamically imported module/u.test(error.message)) {
        failures.push(error.message);
      }
    });
    page.on('requestfailed', (request) => {
      if (new URL(request.url()).pathname.startsWith('/assets/')) {
        failures.push(`${request.url()} ${request.failure()?.errorText ?? ''}`);
      }
    });
    return { page, live, failures };
  };

  const buildIdOf = async (page: Page): Promise<string | undefined> =>
    page.evaluate(() => (globalThis as { ENV?: { TAU_BUILD_ID?: string } }).ENV?.TAU_BUILD_ID);

  it('should reload an untouched page into the live build once when a lazy chunk it needs fails to load once', async () => {
    const { page, live, failures } = await open();
    const chunk = /^\/assets\/example-command-items-[\w-]+\.js$/u;
    // A module import's own request (`script`), not a page's idle prefetch of the same file.
    const failed = live.failNext(chunk, { dest: 'script' });

    await page.goto(`${live.origin}/`, { waitUntil: 'commit' });
    await failed;

    // One new realm on the same build: the second document is the same deploy's.
    try {
      await expect.poll(() => live.documents.length, { timeout: 30_000 }).toBe(2);
    } catch (error) {
      throw new Error(
        `No reload into the live build after the failed chunk (documents ${JSON.stringify(live.documents)}); module load errors: ${JSON.stringify(failures)}`,
        { cause: error },
      );
    }
    await page.getByRole('main').waitFor({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    expect(live.documents).toStrictEqual(['previous', 'previous']);
    expect(await buildIdOf(page)).toBe(String(deploys?.previousBuildId));
    // The new page mounts the palette items once idle, so its own request for the chunk may follow the load.
    await expect.poll(() => live.requests(chunk), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    expect(await page.getByRole('heading', { name: 'Something went wrong' }).count()).toBe(0);
    expect(await page.getByRole('button', { name: /^try again$/iu }).count()).toBe(0);
  }, 120_000);

  /**
   * Start a chat from Home's composer, as the production report did (`/w/home/new-project?chat=…`): the chat panel
   * mounts its activity row, whose spinner loads its own chunk.
   */
  const startChatFromHome = async (page: Page, origin: string): Promise<void> => {
    await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
    await page
      .getByRole('button', { name: 'Continue without' })
      .click({ timeout: 5000 })
      .catch(() => undefined);
    const composer = page.getByRole('textbox', { name: 'Ask Tau to build anything...' }).first();
    await composer.click();
    await page.keyboard.type('Make a cube');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/w\/home\/new-project\?chat=/u, { timeout: 30_000 });
  };

  it('should keep the chat panel usable when its decorative spinner fails to load once', async () => {
    const { page, live, failures } = await open();
    const spinnerChunk = /^\/assets\/metal-morph-spinner-(?!service-)[\w-]+\.js$/u;
    // The import's own request: Home's idle prefetch of the project tier (`empty`) may ask for the chunk first.
    const failed = live.failNext(spinnerChunk, { dest: 'script' });

    await startChatFromHome(page, live.origin);
    await failed;
    await page.waitForTimeout(3000);

    // The spinner is optional code: it degrades to the flat spinner instead of taking the chat panel down (D20).
    expect(
      await page.getByRole('heading', { name: 'Chat Unavailable' }).count(),
      `module load errors: ${JSON.stringify(failures)}`,
    ).toBe(0);
    const composer = page.getByRole('textbox', { name: 'Ask Tau to build anything...' }).last();
    await composer.waitFor({ timeout: 10_000 });
    await composer.click();
    await page.keyboard.type('Still here');
    expect(await composer.textContent()).toContain('Still here');
    expect(await page.getByRole('button', { name: /^try again$/iu }).count()).toBe(0);
    // The page was worked on, so it never reloads by itself for code it can do without.
    expect(live.documents).toStrictEqual(['previous']);
  }, 120_000);

  /**
   * Let a chat turn reach the agent host without an API: the page's model catalog and the self-host deployment answer,
   * as the browser specs' fixtures give them. The run's own model call then fails, which these rows do not read.
   */
  const routeTurnAdmission = async (origin: string): Promise<void> => {
    const { isModelListEntryEnabled, modelList, modelListEntryToModel } =
      // eslint-disable-next-line @nx/enforce-module-boundaries -- This e2e-only catalog stub deliberately uses the API's real rows.
      await import('../../libs/api-llm-gateway/src/models/model.constants.js');
    const catalog = Object.values(modelList)
      .flatMap((entries) => Object.values(entries))
      .filter((entry) => isModelListEntryEnabled(entry))
      .map((entry) => modelListEntryToModel(entry));
    const answer = (body: unknown) => ({
      status: 200,
      headers: {
        'access-control-allow-credentials': 'true',
        'access-control-allow-origin': origin,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    await context?.route(/\/v1\/models(?:\?|$)/u, async (route) => route.fulfill(answer(catalog)));
    await context?.route(/\/v1\/deployment(?:\?|$)/u, async (route) =>
      route.fulfill(answer({ version: 1, edition: 'self-host', billing: { funded: false }, maxAgeSeconds: 300 })),
    );
  };

  const implementation = /^\/assets\/agent-host\.impl-[\w-]+\.js$/u;
  const agentWorkerScript = /^\/assets\/agent-host\.worker-[\w-]+\.js$/u;

  /*
   * FP10 (row 10 of the blueprint's table): the agent host worker's own import of its implementation fails. The
   * server answers it 404 once, as an edge that has not caught up with a deploy does, then serves it. The worker is a
   * realm of its own, so the page replaces it with a new worker instead of asking the one whose import failed again.
   */
  it('should replace the agent host worker whose implementation failed to load once, with no reload', async () => {
    const { page, live, failures } = await open();
    await routeTurnAdmission(live.origin);
    const failed = live.failNext(implementation, { answer: 'not-found' });

    await startChatFromHome(page, live.origin);
    await failed;

    // A new worker, which loads the implementation: the failed one is never asked again.
    try {
      await expect.poll(() => live.requests(agentWorkerScript), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
    } catch (error) {
      throw new Error(
        `The page asked the failed worker again instead of starting another (agent host workers ${String(live.requests(agentWorkerScript))}, implementation requests ${String(live.requests(implementation))}); module load errors: ${JSON.stringify(failures)}`,
        { cause: error },
      );
    }
    await page.waitForTimeout(3000);
    expect(await page.getByText(/failed to load|did not finish loading/iu).count()).toBe(0);
    expect(live.documents).toStrictEqual(['previous']);
  }, 120_000);

  it('should offer Reload, never Try again, once new workers could not load the agent host either', async () => {
    const { page, live } = await open();
    await routeTurnAdmission(live.origin);
    void live.failNext(implementation, { answer: 'not-found', count: 3 });

    await startChatFromHome(page, live.origin);

    await page
      .getByText(/failed to load|did not finish loading/iu)
      .first()
      .waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1000);
    expect(await page.getByRole('button', { name: /^try again$/iu }).count()).toBe(0);
    expect(await page.getByRole('button', { name: 'Reload', exact: true }).count()).toBeGreaterThanOrEqual(1);
    // A new worker for each failure up to the bound; a later use may start another, which the fault no longer meets.
    expect(live.requests(agentWorkerScript)).toBeGreaterThanOrEqual(3);
  }, 120_000);
});
