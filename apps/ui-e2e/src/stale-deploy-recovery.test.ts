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
