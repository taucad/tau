import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { desktopE2EApiUrl, desktopE2EFrontendUrl } from '#support/config.js';

/**
 * The browser half of a two-client run (blueprint S40).
 *
 * `chromium.launch()` beside the `electron.launch()` this project already
 * drives, in the same node-side vitest process, so one test can assert on both
 * clients and on the bytes underneath them. The session comes from a one-time
 * token minted against the desktop's bearer — one account, two sessions — and
 * is exchanged through the context's own request API, whose cookie jar the page
 * shares.
 */

const workspaceRoot = resolve(import.meta.dirname, '../../../../..');
const diagnosticsRoot = join(workspaceRoot, 'out/test-results/desktop-e2e');

/** One launched browser client. */
export type BrowserClient = Readonly<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
  /** Write a screenshot and the console log under `out/`. */
  capture: (label: string) => Promise<string>;
  close: () => Promise<void>;
}>;

/**
 * Launch a signed-in browser client against the UI server.
 *
 * @param options - The one-time token minted from the desktop bearer.
 * @param options.oneTimeToken - A single-use token from `/v1/auth/one-time-token/generate`.
 * @returns The live client, already on the home page.
 */
export const launchBrowserClient = async (options: {
  readonly oneTimeToken: string;
  readonly disableWebSecurity?: boolean | undefined;
}): Promise<BrowserClient> => {
  const browser = await chromium.launch({
    args: [
      '--enable-unsafe-webgpu',
      /* Only for the runs that have to reach *past* W18 defect DEF-5 to prove
       * what is behind it: the API's CORS allow-list has no `git-protocol`, so
       * `isomorphic-git`'s very first advertisement is blocked at the preflight
       * in any real browser. The defect is pinned red on its own; this flag
       * exists so the rest of the chain — initial sync, push, the Sync row, the
       * bytes a stock clone reads back — is not hidden behind it. Never set for
       * a case whose subject is the browser's own security boundary. */
      ...(options.disableWebSecurity === true ? ['--disable-web-security'] : []),
    ],
  });
  /* The workbench folds its chat column away below roughly 1400 px, and a
   * headless default of 1280 x 720 is below it — the composer is in the DOM but
   * never visible. The desktop shell's own window is wider, so this is the
   * viewport that makes the two clients comparable. */
  const context = await browser.newContext({
    baseURL: desktopE2EFrontendUrl,
    viewport: { width: 1600, height: 1000 },
  });
  context.setDefaultTimeout(60_000);

  const verified = await context.request.post(`${desktopE2EApiUrl}/v1/auth/one-time-token/verify`, {
    data: { token: options.oneTimeToken },
    headers: { origin: desktopE2EFrontendUrl },
  });
  if (!verified.ok()) {
    await browser.close();
    throw new Error(`Exchanging the one-time token failed with HTTP ${String(verified.status())}.`);
  }

  const consoleErrors: string[] = [];
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  const capture = async (label: string): Promise<string> => {
    const directory = join(diagnosticsRoot, label);
    await mkdir(directory, { recursive: true });
    await page
      .screenshot({ path: join(directory, 'browser.png'), fullPage: true, timeout: 10_000 })
      .catch(() => undefined);
    const bodyText = await page
      // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- `innerText` keeps the line breaks that make this readable.
      .evaluate(() => document.body.innerText.slice(0, 4000))
      .catch(() => '(unavailable)');
    await writeFile(
      join(directory, 'browser.log'),
      [`url: ${page.url()}`, `body: ${bodyText}`, '--- console errors ---', consoleErrors.join('\n')].join('\n'),
      'utf8',
    );
    return directory;
  };

  return {
    browser,
    capture,
    close: async () => {
      await browser.close();
    },
    context,
    page,
  };
};

/** Assert the browser client resolved its cookie into a real session. */
export const browserSession = async (client: BrowserClient): Promise<{ readonly ok: boolean; readonly body: string }> =>
  client.page.evaluate(async (api) => {
    const response = await fetch(`${api}/v1/auth/get-session`, { credentials: 'include' });
    const body = await response.text();
    return { body: body.slice(0, 200), ok: response.ok };
  }, desktopE2EApiUrl);
