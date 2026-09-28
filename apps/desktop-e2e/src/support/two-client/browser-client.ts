import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect } from 'vitest';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Locator, Page } from 'playwright';
import { desktopE2EApiUrl, desktopE2EFrontendUrl } from '#support/config.js';
import { expectVisible } from '#support/scenario.js';

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

/** Byte length and SHA-256 of one OPFS file, without copying a large body through Playwright. */
export const browserFileDigest = async (
  client: BrowserClient,
  slug: string,
  path: readonly string[],
): Promise<Readonly<{ bytes: number; sha256: string }> | undefined> =>
  client.page.evaluate(
    async ([project, ...segments]: readonly string[]) => {
      try {
        const filename = segments.at(-1);
        if (!project || !filename) {
          return undefined;
        }
        const root = await navigator.storage.getDirectory();
        let directory = await root.getDirectoryHandle(project);
        for (const segment of segments.slice(0, -1)) {
          // oxlint-disable-next-line no-await-in-loop -- each child handle is rooted in the directory resolved immediately before it.
          directory = await directory.getDirectoryHandle(segment);
        }
        const handle = await directory.getFileHandle(filename);
        const file = await handle.getFile();
        const bytes = await file.arrayBuffer();
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        return {
          bytes: bytes.byteLength,
          sha256: [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
        };
      } catch {
        return undefined;
      }
    },
    [slug, ...path],
  );

/**
 * One chat's sidebar row, and the link inside it.
 *
 * Addressed by the route the link opens, not by its description: sidebar v2
 * gives a row an `aria-describedby` only while it has something to say, so a
 * finished chat the person is looking at has none (`selectChatFacts`,
 * `apps/ui/app/hooks/use-sidebar-status.ts`).
 */
export const chatRow = (page: Page, chatId: string): Locator =>
  page
    .locator('[data-slot="chat-trigger"]')
    .filter({ has: page.locator(`a[href*="chat=${chatId}"]`) })
    .first();

/** That row's name link. */
export const chatRowLink = (page: Page, chatId: string): Locator =>
  chatRow(page, chatId).locator(`a[href*="chat=${chatId}"]`).first();

/** Open one known chat through the same sidebar link a person uses. */
export const openBrowserChat = async (client: Pick<BrowserClient, 'page'>, chatId: string): Promise<void> => {
  await chatRowLink(client.page, chatId).click({ timeout: 120_000 });
  await client.page.waitForURL((url) => url.searchParams.get('chat') === chatId, { timeout: 60_000 });
};

/**
 * Find one project in the library (D20), narrowed by its own search box: the
 * library pages at 20 rows and a suite account holds more than that.
 *
 * @param page - A page of either client.
 * @param options - Where the library is and the project's name.
 * @param options.projectsUrl - `/projects` on the browser, `app://tau/projects` on the desktop.
 * @param options.name - The project's name.
 */
export const searchLibrary = async (
  page: Page,
  options: Readonly<{ projectsUrl: string; name: string }>,
): Promise<void> => {
  await page.goto(options.projectsUrl, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Search projects…').first().fill(options.name);
};

/** A library card this device holds: its link is *Open <name>* (D20). */
export const localLibraryCard = (page: Page, name: string): Locator =>
  page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('link', { name: `Open ${name}`, exact: true }) })
    .first();

/** A library card only Tau Cloud holds: its *Open <name>* is a button that clones it (D20). */
export const cloudOnlyLibraryCard = (page: Page, name: string): Locator =>
  page
    .locator('[data-slot="cloud-project-card"]')
    .filter({ has: page.getByRole('button', { name: `Open ${name}`, exact: true }) })
    .first();

/**
 * Open a project only Tau Cloud holds through its library card, which creates
 * it on this device under the remote's own id and pulls (D20, DEF-2).
 *
 * @param page - A page of either client.
 * @param options - Where the library is, the project's name and the row's words for a failure.
 * @param options.projectsUrl - `/projects` on the browser, `app://tau/projects` on the desktop.
 * @param options.name - The project's name.
 * @param options.message - What the calling row expected.
 * @returns The opened project route's slug.
 */
export const openCloudOnlyProject = async (
  page: Page,
  options: Readonly<{ projectsUrl: string; name: string; message: string }>,
): Promise<string> => {
  const { name, message } = options;
  await searchLibrary(page, options);
  const card = cloudOnlyLibraryCard(page, name);
  await expect
    .poll(async () => card.count(), { message: `${message}: the library must list it as Tau Cloud's`, timeout: 60_000 })
    .toBeGreaterThan(0);
  await card.getByRole('button', { name: `Open ${name}`, exact: true }).click();
  await expect
    .poll(async () => page.url(), { message: `${message}: Open must reach the project route`, timeout: 120_000 })
    .toMatch(/\/w\//u);
  const slug = new URL(page.url()).pathname.split('/').at(-1);
  if (!slug) {
    throw new Error(`${message}: the project route has no slug: ${page.url()}`);
  }
  return decodeURIComponent(slug);
};

/**
 * Upload authored bytes through the Files pane, beside `main.scad`.
 *
 * @param page - The project page.
 * @param name - The new file's name.
 * @param bytes - Its contents.
 */
export const uploadFileInPage = async (page: Page, name: string, bytes: Uint8Array<ArrayBuffer>): Promise<void> => {
  await page.keyboard.press('Control+KeyF');
  await page
    .getByRole('treeitem', { name: /main\.scad/u })
    .first()
    .click({ button: 'right' });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Upload Files' }).first().click();
  const fileChooser = await chooser;
  await fileChooser.setFiles({ buffer: Buffer.from(bytes), mimeType: 'model/step', name });
  await page
    .getByRole('treeitem', { name: new RegExp(name, 'u') })
    .first()
    .waitFor({ timeout: 60_000 });
};

/** How long the merged transcript has to render every turn it was told to hold. */
const renderTimeout = 180_000;

/** One turn group in the virtualized transcript, addressed by a marker it renders. */
const turnGroup = (page: Page, marker: string): Locator =>
  page
    .locator('[data-item-index]')
    .filter({ has: page.getByText(marker, { exact: true }) })
    .first();

/**
 * Walk the transcript one screen further and report where the scroller landed,
 * wrapping back to the top at the end so a turn that renders late still gets
 * another pass.
 *
 * The scroller is reached from a mounted turn rather than by selector: the chat
 * is not the only `react-virtuoso` list a project route can mount, and only the
 * transcript's own items carry these markers.
 */
const walkTranscript = async (anchor: Locator, from: number): Promise<number> =>
  anchor.evaluate(
    (element, previous: number) => {
      const scroller = element.closest('[data-virtuoso-scroller]');
      if (!(scroller instanceof HTMLElement)) {
        throw new Error('The chat transcript is not inside a virtuoso scroller.');
      }
      const next = previous + Math.max(1, Math.round(scroller.clientHeight * 0.75));
      scroller.scrollTop = next >= scroller.scrollHeight ? 0 : next;
      return scroller.scrollTop;
    },
    from,
    { timeout: 30_000 },
  );

/**
 * Require the named chat markers to render, each with its own reply, in the
 * order they were recorded.
 *
 * The transcript is virtualized: react-virtuoso unmounts a turn the scroller is
 * not over, so neither a `document.body` text scan nor a whole-page node count
 * can see a turn that happens to be scrolled out (lane B4, `ed8e011b3`). Order
 * comes off Virtuoso's own `data-item-index` — the turn's position in the data,
 * not in the DOM — and each marker is looked for while the scroller walks the
 * whole list, so a turn that is unmounted at one offset is still observed at
 * another. Reading the reply inside its own group needs no further scrolling:
 * a mounted node outside the scroll viewport is still visible to Playwright.
 */
export const requireRenderedOrder = async (
  client: Pick<BrowserClient, 'page'>,
  options: Readonly<{ markers: readonly string[]; reply: string; row: string }>,
): Promise<void> => {
  const { markers, reply, row } = options;
  const { page } = client;
  /* A replied turn is a chat turn, so it anchors the scroller without assuming
   * the chat owns the only virtualized list on the route. */
  const anchor = page
    .locator('[data-item-index]')
    .filter({ has: page.getByText(reply, { exact: true }) })
    .first();
  await anchor.waitFor({ state: 'attached', timeout: renderTimeout });

  const indices = new Map<string, number>();
  const deadline = Date.now() + renderTimeout;
  let offset = 0;
  while (indices.size < markers.length) {
    for (const marker of markers.filter((candidate) => !indices.has(candidate))) {
      const group = turnGroup(page, marker);
      // oxlint-disable-next-line no-await-in-loop -- the scroller is one shared cursor: every marker has to be read where it currently stands.
      const index = await group.getAttribute('data-item-index', { timeout: 1000 }).catch(() => undefined);
      if (index === undefined || index === null) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- as above.
      await expectVisible(group.getByText(reply, { exact: true }), 30_000);
      indices.set(marker, Number(index));
    }
    if (indices.size === markers.length) {
      break;
    }
    if (Date.now() >= deadline) {
      const missing = markers.filter((marker) => !indices.has(marker));
      throw new Error(`${row}: the transcript never rendered a replied turn for ${missing.join(', ')}.`);
    }
    // oxlint-disable-next-line no-await-in-loop -- one scroller, walked a screen at a time.
    offset = await walkTranscript(anchor, offset);
  }

  const ordered = markers.map((marker) => indices.get(marker) ?? -1);
  const inOrder = ordered.every((index, position) => position === 0 || index > (ordered[position - 1] ?? -1));
  if (!inOrder) {
    throw new Error(
      `${row}: expected ${markers.join(' before ')}, but the transcript ordered their turns ${ordered.join(', ')}.`,
    );
  }
};

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
  await context.addCookies([
    {
      name: 'tau-cookie-consent',
      value: encodeURIComponent(JSON.stringify({ status: 'declined', version: 1 })),
      url: desktopE2EFrontendUrl,
    },
  ]);

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
