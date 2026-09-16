/* oxlint-disable no-await-in-loop -- Every loop here drives one client, one `git` child or one database statement after another on purpose. */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { desktopE2EApiUrl } from '#support/config.js';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import {
  gatewayFixtureFinalText,
  gatewayFixtureModelName,
  installGatewayFixture,
  startGatewayFixture,
} from '#support/gateway-fixture.js';
import { selectChatModel, sendPrompt } from '#support/scenario.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  browserFileDigest,
  browserSession,
  launchBrowserClient,
  openBrowserChat,
  requireRenderedOrder,
} from '#support/two-client/browser-client.js';
import type { BrowserClient } from '#support/two-client/browser-client.js';
import { startGitHttpBackend } from '#support/two-client/git-http-backend.js';
import type { GitHttpBackendFixture } from '#support/two-client/git-http-backend.js';
import {
  basicAuthorization,
  forgetSeededProjects,
  leaveProjectStorageHeadroom,
  mintOneTimeToken,
  projectLfsBytes,
  registerProjectOnRemote,
  runGit,
  seedProPlan,
  spendProjectStorage,
  tauCloudOwnerIds,
} from '#support/two-client/tau-cloud.js';
import type { TauCloudOwnerIds } from '#support/two-client/tau-cloud.js';
import { startUiServer } from '#support/two-client/ui-server.js';
import type { UiServer } from '#support/two-client/ui-server.js';

/**
 * One account, two clients (charter W18; AC17, AC18, AC21; V14, V15, V18).
 *
 * Node-side vitest beside the Electron specs, exactly as blueprint S40 rewrote
 * it after review 3: `chromium.launch()` next to `electron.launch()` in one
 * process, the backend this project already boots, a promoted account helper,
 * a real UI server on the `:3014` `config.ts` has always named, a browser
 * session minted from the desktop bearer, and a `git http-backend` fixture in
 * `mktemp`.
 *
 * W18-a4: W19-b fixed the browser Git write path. The former DEF-7/DEF-8 pins
 * are ordinary rows, and S48(15) now proves close-and-continue in both
 * directions with file, revision and chat identity.
 */

const proLimitBytes = 10 * 1024 ** 3;
const fiveMiB = 5 * 1024 ** 2;
const fiftyMiB = 50 * 1024 ** 2;
const continuationOwner = 'W13/V18 · S48(15)';
const tauGitRoot = resolve(import.meta.dirname, '../../../out/test-results/desktop-e2e/git-root');

type PageClient = Readonly<{ page: Page }>;

const required = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
};

let account: ReturnType<typeof tauTestAccount> | undefined;
let bearer = '';
let owner: TauCloudOwnerIds | undefined;
let uiServer: UiServer | undefined;
let desktop: DesktopSession | undefined;
let browser: BrowserClient | undefined;
let gitRemote: GitHttpBackendFixture | undefined;
const scratchDirectories: string[] = [];

type CapturableClient = Readonly<{ capture: (label: string) => Promise<string> }>;

/** Preserve the primary failure while asking every still-live client for its diagnostics. */
const captureFailure = async (label: string, clients: ReadonlyArray<CapturableClient | undefined>): Promise<void> => {
  const safeLabel = label.replaceAll(/[^a-zA-Z0-9_-]+/gu, '-').replaceAll(/^-+|-+$/gu, '');
  await Promise.allSettled(
    clients.flatMap((client, index) =>
      client === undefined ? [] : [client.capture(`two-client-${safeLabel}-${String(index + 1)}`)],
    ),
  );
};

/** Capture before a test's local-client `finally`, then rethrow the same error object. */
const captureAndRethrow = async (
  error: unknown,
  label: string,
  clients: ReadonlyArray<CapturableClient | undefined>,
): Promise<never> => {
  await captureFailure(label, clients);
  throw error;
};

/** A throwaway directory, removed with the suite. */
const scratch = async (label: string): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), `tau-two-client-${label}-`));
  scratchDirectories.push(directory);
  return directory;
};

/**
 * Read the project id the browser client wrote into its own OPFS store.
 *
 * The slug is the store directory the project lives in, and it matters once the
 * client holds more than one: an unslugged walk returns whichever `tau.json` it
 * reaches first, which is how a2's first close-and-continue run registered the
 * wrong project on the remote and then failed at the listing instead of at its
 * subject.
 */
const browserProjectId = async (client: BrowserClient, slug?: string): Promise<string | undefined> =>
  client.page.evaluate(async (project?: string) => {
    if (project !== undefined) {
      const root = await navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle(project);
      const handle = await directory.getFileHandle('tau.json');
      const file = await handle.getFile();
      const parsed = JSON.parse(await file.text()) as { readonly id?: string };
      return parsed.id;
    }
    const walk = async (directory: FileSystemDirectoryHandle, depth: number): Promise<string | undefined> => {
      const entries = (directory as unknown as { entries: () => AsyncIterable<[string, FileSystemHandle]> }).entries();
      for await (const [name, handle] of entries) {
        if (name === 'tau.json' && handle.kind === 'file') {
          const file = await (handle as FileSystemFileHandle).getFile();
          const parsed = JSON.parse(await file.text()) as { readonly id?: string };
          if (parsed.id !== undefined) {
            return parsed.id;
          }
        }
        if (handle.kind === 'directory' && depth > 0) {
          const found = await walk(handle as FileSystemDirectoryHandle, depth - 1);
          if (found !== undefined) {
            return found;
          }
        }
      }
      return undefined;
    };
    return walk(await navigator.storage.getDirectory(), 4);
  }, slug);

/** Every path under the browser client's OPFS root, for store-shape assertions. */
const browserStorePaths = async (client: BrowserClient, prefix: string): Promise<readonly string[]> =>
  client.page.evaluate(async (root: string) => {
    const found: string[] = [];
    const walk = async (directory: FileSystemDirectoryHandle, path: string, depth: number): Promise<void> => {
      const entries = (directory as unknown as { entries: () => AsyncIterable<[string, FileSystemHandle]> }).entries();
      for await (const [name, handle] of entries) {
        found.push(`${path}/${name}`);
        if (handle.kind === 'directory' && depth > 0) {
          await walk(handle as FileSystemDirectoryHandle, `${path}/${name}`, depth - 1);
        }
      }
    };
    await walk(await navigator.storage.getDirectory(), '', 5);
    return found.filter((entry) => entry.startsWith(root));
  }, prefix);

/** Create a project through the product's own *New project (from code)* page. */
const createProjectInBrowser = async (client: BrowserClient, name: string): Promise<string> => {
  const { page } = client;
  await page.goto('/projects/new', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Project Name *').fill(name);
  await page
    .getByRole('button', { name: /^Create Project/u })
    .first()
    .click();
  await page.waitForURL(/\/w\/[^/]+\/[^/?]+/u, { timeout: 180_000 });
  return new URL(page.url()).pathname.split('/').pop()?.split('?')[0] ?? '';
};

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

/**
 * Open the Revisions pane through the workbench's own chip.
 *
 * a1 drove the command palette (`Mod+K` → *Open revision history*) and two rows
 * died there waiting for the palette to mount, so they never reached the defect
 * they claimed to pin (W18 review R1). `revision-status-action.tsx` renders a
 * always-visible button — *Open Revisions. You are on \<branch\>* — that calls the
 * same `openPanel('revisions')`. It appears once the root answers, which is
 * also the signal that there is a projection to read.
 */
const openRevisionsPane = async (client: PageClient): Promise<void> => {
  await client.page
    .getByRole('button', { name: /^Open Revisions\./u })
    .first()
    .click({ timeout: 120_000 });
};

/** Open the Revisions pane and reveal the Sync region's connect choice. */
const openSyncRegion = async (client: PageClient): Promise<void> => {
  const { page } = client;
  await openRevisionsPane(client);
  /* D26/A29: the region replaces this button once a remote exists, so a
   * re-open finds the region directly. */
  const connect = page.getByRole('button', { name: /Back up to Tau Cloud/u }).first();
  if (await connect.isVisible()) {
    await connect.click();
  }
  await page.getByRole('region', { name: 'Sync' }).first().waitFor({ state: 'visible', timeout: 60_000 });
};

/**
 * Make the tree differ from head, through the product's own Files pane.
 *
 * The mint gesture below is `Mod+S`, and it is correctly a no-op while the tree
 * equals head (`checkout.machine`'s `treeUnchanged` guard, I5) — which is why
 * a1 concluded, wrongly, that nothing on this build mints a revision without a
 * chat turn (W18 review R5). `Ctrl+F` opens Files
 * (`projectWorkspaceKeyCombinations.files`), *Create new file* → *Blank* opens
 * the pending row, and the name is committed with Enter.
 */
const createFileInBrowser = async (client: BrowserClient, filename: string): Promise<void> => {
  const { page } = client;
  await page.keyboard.press('Control+KeyF');
  await page.getByRole('button', { name: 'Create new file' }).first().click({ timeout: 120_000 });
  await page.getByRole('menuitem', { name: 'Blank' }).first().click();
  const pending = page.getByPlaceholder('New File').first();
  await pending.waitFor({ state: 'visible', timeout: 60_000 });
  await pending.fill(filename);
  await pending.press('Enter');
  await page
    .getByRole('treeitem', { name: new RegExp(filename, 'u') })
    .first()
    .waitFor({ timeout: 60_000 });
};

/** Mint a revision the way a person does: `revision-save-shortcut.tsx`'s `Mod+S`. */
const saveRevisionInBrowser = async (client: BrowserClient): Promise<void> => {
  await client.page.keyboard.press(`${modifier}+KeyS`);
};

/** Focus the visible Monaco surface before sending keyboard input to its model. */
const focusBrowserEditor = async (client: BrowserClient): Promise<void> => {
  const surface = client.page.locator('.editor-container:visible .monaco-editor .view-lines').last();
  await surface.waitFor({ state: 'visible', timeout: 60_000 });
  await surface.click();
};

/** Upload authored bytes through the Files pane. */
const uploadFileInBrowser = async (
  client: BrowserClient,
  name: string,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<void> => {
  const { page } = client;
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

/** How many rows the Revisions pane's `History` list carries right now. */
const revisionRowCount = async (client: BrowserClient): Promise<number> =>
  client.page.getByRole('list', { name: 'Revision history' }).first().getByRole('listitem').count();

/** What the Sync region says right now. */
const syncRegionText = async (client: PageClient): Promise<string> =>
  // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- Playwright's own locator method; `textContent` would drop the line breaks the copy reads by.
  client.page.getByRole('region', { name: 'Sync' }).first().innerText();

type ChatIdentity = Readonly<{ id: string; title: string; description: string }>;

const projectSlug = (page: Page): string => {
  const slug = new URL(page.url()).pathname.split('/').at(-1);
  if (!slug) {
    throw new Error(`${continuationOwner}: the project route has no slug: ${page.url()}`);
  }
  return decodeURIComponent(slug);
};

const activeChatId = (page: Page): string => {
  const chatId = new URL(page.url()).searchParams.get('chat');
  if (chatId === null) {
    throw new Error(`${continuationOwner}: the project route has no chat id: ${page.url()}`);
  }
  return chatId;
};

const readBrowserFile = async (
  client: BrowserClient,
  slug: string,
  path: readonly string[],
): Promise<string | undefined> =>
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
          directory = await directory.getDirectoryHandle(segment);
        }
        const handle = await directory.getFileHandle(filename);
        const file = await handle.getFile();
        return await file.text();
      } catch {
        return undefined;
      }
    },
    [slug, ...path],
  );

/** Open the product's persisted-share form, selecting Tau Hosted sharing when necessary. */
const openHostedShare = async (client: PageClient): Promise<void> => {
  const { page } = client;
  await page.getByRole('button', { name: 'Share', exact: true }).first().click({ timeout: 120_000 });
  await page.getByRole('region', { name: 'Share project' }).first().waitFor({ state: 'visible', timeout: 60_000 });
  const method = page.getByRole('button', { name: /^Share with /u }).first();
  if ((await method.getAttribute('aria-label')) !== 'Share with Hosted link') {
    await method.click();
    await page.getByText('Hosted link', { exact: true }).last().click();
  }
  await page
    .getByRole('combobox', { name: /Version name/iu })
    .first()
    .waitFor({ state: 'visible', timeout: 60_000 });
};

const browserHead = async (client: BrowserClient, slug: string): Promise<string | undefined> => {
  const head = await readBrowserFile(client, slug, ['.tau', 'revisions', 'refs', 'heads', 'main']);
  return head?.trim();
};

const desktopHead = async (repository: string): Promise<string | undefined> => {
  const outcome = await runGit(['rev-parse', 'refs/heads/main'], repository);
  return outcome.code === 0 ? outcome.stdout.trim() : undefined;
};

const gitOutput = async (repository: string, args: readonly string[]): Promise<string | undefined> => {
  const outcome = await runGit(args, repository);
  return outcome.code === 0 ? outcome.stdout.trim() : undefined;
};

const gitHead = async (repository: string): Promise<string | undefined> =>
  gitOutput(repository, ['rev-parse', 'refs/heads/main']);

const tauRepository = (projectId: string): string => join(tauGitRoot, `${projectId}.git`);

/** The revision id in the last durable host-attested turn settlement. */
const finalizedTurnRevision = async (logPath: string): Promise<string | undefined> => {
  const contents = await readFile(logPath, 'utf8').catch(() => '');
  if (!contents) {
    return undefined;
  }
  const lines = contents.split('\n');
  const endsWithNewline = contents.endsWith('\n');
  const lastRecordIndex = endsWithNewline ? lines.length - 2 : lines.length - 1;
  for (let index = lastRecordIndex; index >= 0; index -= 1) {
    try {
      const event = JSON.parse(lines[index] ?? '') as { readonly type?: string; readonly revisionId?: string };
      if (event.type === 'turn.finalized' && event.revisionId !== undefined) {
        return event.revisionId;
      }
    } catch (error) {
      if (endsWithNewline || index !== lastRecordIndex) {
        throw new Error(`Malformed durable agent event at ${logPath}:${String(index + 1)}.`, { cause: error });
      }
      /* The active writer may leave only its unterminated final line incomplete. */
    }
  }
  return undefined;
};

const chatIdentity = async (page: Page, chatId: string): Promise<ChatIdentity | undefined> => {
  const link = page.locator(`a[aria-describedby="chat-status-${chatId}"][href*="chat="]`).first();
  if ((await link.count()) === 0) {
    return undefined;
  }
  const href = await link.getAttribute('href');
  const descriptionId = await link.getAttribute('aria-describedby');
  if (href === null || descriptionId === null) {
    return undefined;
  }
  const id = new URL(href, 'https://tau.invalid').searchParams.get('chat');
  if (id === null) {
    return undefined;
  }
  const title = await link.textContent();
  const description = await page.locator(`#${descriptionId}`).textContent();
  return {
    id,
    title: title?.trim() ?? '',
    description: description?.trim() ?? '',
  };
};

const terminalChatIdentity = async (page: Page, chatId: string, direction: string): Promise<ChatIdentity> => {
  await expect
    .poll(
      async () => {
        const identity = await chatIdentity(page, chatId);
        return identity?.description ?? '';
      },
      {
        message: `${continuationOwner} ${direction}: source chat must reach its terminal sidebar card`,
        timeout: 180_000,
      },
    )
    .toContain(', done');
  const identity = await chatIdentity(page, chatId);
  if (identity === undefined) {
    throw new Error(`${continuationOwner} ${direction}: the terminal chat link disappeared`);
  }
  return identity;
};

const openTauCloudProject = async (
  page: Page,
  options: Readonly<{ projectsUrl: string; name: string; direction: string }>,
): Promise<string> => {
  const { projectsUrl, name, direction } = options;
  await page.goto(projectsUrl, { waitUntil: 'domcontentloaded' });
  const region = page.getByRole('region', { name: 'From Tau Cloud' }).first();
  const title = region.getByText(name, { exact: true }).first();
  await expect
    .poll(async () => title.count(), {
      message: `${continuationOwner} ${direction}: fresh destination must list the source project`,
      timeout: 60_000,
    })
    .toBeGreaterThan(0);
  await title.locator('../..').getByRole('button', { name: 'Open' }).click();
  await expect
    .poll(async () => page.url(), {
      message: `${continuationOwner} ${direction}: destination must open the Tau Cloud project`,
      timeout: 120_000,
    })
    .toMatch(/\/w\//u);
  return projectSlug(page);
};

const assertCurrentRevision = async (
  client: PageClient,
  options: Readonly<{
    expectedHead: string;
    readHead: () => Promise<string | undefined>;
    direction: string;
  }>,
): Promise<void> => {
  const { expectedHead, readHead, direction } = options;
  await expect
    .poll(readHead, {
      message: `${continuationOwner} ${direction}: destination head must equal the source close revisionId`,
      timeout: 120_000,
    })
    .toBe(expectedHead);
  await openRevisionsPane(client);
  const current = client.page
    .getByRole('list', { name: 'Revision history' })
    .first()
    .getByRole('listitem')
    .filter({ hasText: 'Current' })
    .first();
  await expect
    .poll(async () => current.getByText('main.scad', { exact: true }).count(), {
      message: `${continuationOwner} ${direction}: destination current revision changed paths must contain main.scad`,
      timeout: 120_000,
    })
    .toBeGreaterThan(0);
};

const assertChatContinuation = async (page: Page, source: ChatIdentity, direction: string): Promise<void> => {
  await expect
    .poll(async () => chatIdentity(page, source.id), {
      message: `${continuationOwner} ${direction}: destination sidebar must preserve chat id, title and terminal card`,
      timeout: 120_000,
    })
    .toEqual(source);
};

beforeAll(async () => {
  account = tauTestAccount('two-client');
  bearer = await seedTauTestUser(account);
  owner = await tauCloudOwnerIds(account.email);
  await seedProPlan(owner);
  uiServer = await startUiServer();
  gitRemote = await startGitHttpBackend({ root: await scratch('remote'), name: 'two-client', cors: true });
}, 900_000);

afterAll(async () => {
  await browser?.close();
  await desktop?.close();
  await gitRemote?.close();
  await uiServer?.close();
  if (account && owner) {
    await forgetSeededProjects(owner);
    await deleteTauTestUser(account.email);
  }
  for (const directory of scratchDirectories) {
    await rm(directory, { force: true, recursive: true });
  }
}, 900_000);

/* Suite clients stay live until `afterAll`, so a failed row can preserve both
 * rendered state and the desktop's Home/event/process logs before teardown. */
afterEach(async ({ task }) => {
  if (task.result?.state === 'fail') {
    await captureFailure(task.name, [browser, desktop]);
  }
}, 120_000);

describe('one account, two clients', () => {
  it('should sign a desktop shell and a real browser in from one sign-in', async () => {
    desktop = await launchDesktopApp({ token: bearer });
    /* S40's rule, and the reason for the one-time token: better-auth allows
     * three `/sign-in/email` attempts per ten seconds per address, and a second
     * sign-in for the browser would spend two of them on every run. */
    browser = await launchBrowserClient({ oneTimeToken: await mintOneTimeToken(bearer) });
    await browser.page.goto('/', { waitUntil: 'domcontentloaded' });

    const session = await browserSession(browser);
    expect(session.ok, `get-session answered: ${session.body}`).toBe(true);
    expect(session.body).not.toBe('null');

    const desktopSession = await desktop.page.evaluate(async (api: string) => {
      const response = await fetch(`${api}/v1/auth/get-session`);
      const body = await response.text();
      return { body: body.slice(0, 200), ok: response.ok };
    }, desktopE2EApiUrl);
    expect(desktopSession.ok, `desktop get-session answered: ${desktopSession.body}`).toBe(true);
    expect(desktopSession.body).not.toBe('null');
  }, 900_000);
});

describe('a project on the browser client', () => {
  let slug = '';
  let projectId = '';
  let projectUrl = '';

  beforeAll(async () => {
    if (!browser) {
      throw new Error('The browser client did not launch.');
    }
    slug = await createProjectInBrowser(browser, 'W18 Two Client');
    projectId = (await browserProjectId(browser, slug)) ?? '';
    projectUrl = browser.page.url();
  }, 900_000);

  it('should keep its revisions and its chat in the project store, not in a database', async () => {
    if (!browser) {
      throw new Error('The browser client did not launch.');
    }
    const paths = await browserStorePaths(browser, `/${slug}/`);
    expect(projectId).toMatch(/^proj_/u);
    /* W17's shape, on the client's own store: the chat is a file under the
     * project, not a row anywhere. Whether `.tau/revisions` has been created
     * yet is deliberately not asserted — it appears lazily, and racing it says
     * nothing about where a chat lives. */
    expect(paths).toEqual(expect.arrayContaining([`/${slug}/tau.json`, `/${slug}/main.scad`, `/${slug}/.tau/chats`]));
    expect(paths.filter((path) => /\/\.tau\/chats\/chat_[^/]+\/chat\.json$/u.test(path))).toHaveLength(1);
  }, 300_000);

  /** W19-b fixed DEF-7: a browser Files-pane write now mints through the worker port. */
  it('should mint a revision from a Files-pane write and Mod+S', async () => {
    const client = required(browser, 'The browser client did not launch.');
    await openRevisionsPane(client);
    await createFileInBrowser(client, 'bracket.scad');
    /* `Ctrl+F` fronted Files in the same dockview group; History is only
     * readable with Revisions in front again. */
    await openRevisionsPane(client);
    await saveRevisionInBrowser(client);
    await expect
      .poll(async () => revisionRowCount(client), {
        message: 'W6/W11b/W13 (DEF-7): Mod+S must mint a browser revision',
        timeout: 120_000,
      })
      .toBeGreaterThan(0);
  }, 900_000);

  /* W18 defect DEF-5, owner W11a (the API's CORS allow-list), with W11b as the
   * client-side owner of the header.
   *
   * `isomorphic-git` sends `git-protocol` on every smart-HTTP request (protocol
   * v2), and that header is not CORS-safelisted. `createTauCorsOriginValidator`
   * answers the preflight `204` with
   * `access-control-allow-headers: request-id, authorization, user-agent,
   * content-type, anthropic-version, anthropic-beta, x-tau-proxy-authorization,
   * x-tau-attempt-id` — no `git-protocol` — so Chromium blocks the request that
   * follows and the browser leg of Tau Cloud cannot make one call. Observed on
   * the API's own log: `OPTIONS …/info/refs?service=git-upload-pack` with
   * `access-control-request-headers: git-protocol`, `204`, and no `GET` after
   * it; with `--disable-web-security` the same `GET` answers `200`.
   *
   * Fixed at the one CORS owner: `git-protocol` is in the API's shared header
   * catalogue (`apps/api/app/constants/http-header.constant.ts`), which is what
   * `corsBaseConfiguration.allowedHeaders` is built from, and the preflight is
   * pinned on the wire in `apps/api/app/api/git/git.http.integration.test.ts`.
   *
   * This case is the only one in the file that must run with the browser's own
   * security boundary intact, so it opens its own client. */
  it('should let a real browser page reach the Tau Hosted Remote advertisement', async () => {
    if (!owner) {
      throw new Error('The account was not seeded.');
    }
    await registerProjectOnRemote(owner, projectId, 'W18 Two Client');
    const strict = await launchBrowserClient({ oneTimeToken: await mintOneTimeToken(bearer) });
    try {
      await strict.page.goto('/', { waitUntil: 'domcontentloaded' });
      const outcome = await strict.page.evaluate(
        async ({ api, id }: Readonly<{ api: string; id: string }>) => {
          try {
            const response = await fetch(`${api}/v1/git/${id}.git/info/refs?service=git-upload-pack`, {
              credentials: 'include',
              headers: { 'git-protocol': 'version=2' },
            });
            return { ok: response.ok, status: response.status, error: undefined as string | undefined };
          } catch (error) {
            return { ok: false, status: 0, error: String(error).slice(0, 200) };
          }
        },
        { api: desktopE2EApiUrl, id: projectId },
      );
      expect(outcome, 'W11a (DEF-5): the advertisement was blocked before it was sent').toEqual(
        expect.objectContaining({ ok: true, status: 200 }),
      );
    } catch (error) {
      await captureAndRethrow(error, 'browser-hosted-remote-advertisement', [strict]);
    } finally {
      await strict.close();
    }
  }, 600_000);

  /** W19-b fixed DEF-8: the browser bundle now supplies Buffer to isomorphic-git. */
  it('should show a connected Tau Cloud remote in the Sync region', async () => {
    const client = required(browser, 'The browser client did not launch.');
    const accountOwner = required(owner, 'The account was not seeded.');
    await registerProjectOnRemote(accountOwner, projectId, 'W18 Two Client');
    await openSyncRegion(client);
    await client.page.getByRole('radio', { name: 'Tau Cloud' }).first().click();
    /* `revision-sync-region.tsx:342` prints the connected URL and a
     * *Disconnect* beside it, and neither exists in any other phase. */
    await expect
      .poll(async () => syncRegionText(client), {
        message: 'W11b (DEF-8): the connected Tau Cloud remote must reach the Sync region',
        timeout: 120_000,
      })
      .toMatch(new RegExp(`${projectId}|Disconnect`, 'u'));
  }, 900_000);

  /** P53's connected-session scheduler is observable now that W19-b fixed DEF-8. */
  it('should report a sync state in the Sync region once a remote is connected', async () => {
    const client = required(browser, 'The browser client did not launch.');
    const accountOwner = required(owner, 'The account was not seeded.');
    await registerProjectOnRemote(accountOwner, projectId, 'W18 Two Client');
    await openSyncRegion(client);
    const choice = client.page.getByRole('radio', { name: 'Tau Cloud' }).first();
    if (await choice.isVisible()) {
      await choice.click();
    }
    await expect
      .poll(async () => syncRegionText(client), {
        message: 'W11b/W13 (DEF-8): the connected-session scheduler must expose a Sync state',
        timeout: 120_000,
      })
      .toMatch(/Checking…|Backed up|Backing up|Not backed up/u);
  }, 900_000);

  /**
   * DEF-1 (P51) through the product's own Connect gesture.
   *
   * `PUT /v1/projects/:projectId` creates the caller's row and its bare
   * repository; `remote.machine`'s `authorize` calls `registerRemoteProject`
   * for `kind: 'tau'` before `validating`; the disk host supplies it
   * (`packages/host/src/revisions.ts`) and the browser worker supplies it under
   * **P54**. Nothing here seeds a row: this project has never been published
   * and the row this creates is the connect verb's own.
   *
   * W19-b's Buffer fix lets the browser complete the smart-HTTP leg. */
  it('should back up a project that was never published', async () => {
    const client = required(browser, 'The browser client did not launch.');
    const unregistered = await createProjectInBrowser(client, 'W18 Never Published');
    expect(unregistered, 'W11a/W11b (DEF-8): the never-published project must have a source slug').not.toBe('');
    await openSyncRegion(client);
    await client.page.getByRole('radio', { name: 'Tau Cloud' }).first().click();
    await expect
      .poll(async () => syncRegionText(client), {
        message: 'W11a/W11b (DEF-8): a never-published project must enter a Sync state',
        timeout: 120_000,
      })
      .toMatch(/Checking…|Backed up|Backing up|Not backed up/u);
  }, 900_000);

  /**
   * D16's LFS batch refusal and file list, owners W11b / W13.
   *
   * This uploads an LFS-managed authored file, so the refusal comes from D16's
   * LFS batch check before upload. The API integration suite separately covers
   * the shell pre-receive admission path.
   *
   * W19-b fixed the browser write and smart-HTTP prerequisites, so this drives
   * the actual LFS file-list path rather than assuming a small Git pack can
   * identify the authored path it contains. */
  it('should name the refused files in the Sync region when a push is over the plan', async () => {
    const client = required(browser, 'The browser client did not launch.');
    const accountOwner = required(owner, 'The account was not seeded.');
    await client.page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
    await registerProjectOnRemote(accountOwner, projectId, 'W18 Two Client');
    await openSyncRegion(client);
    const remoteChoice = client.page.getByRole('radio', { name: 'Tau Cloud' }).first();
    if (await remoteChoice.isVisible()) {
      await remoteChoice.click();
    }
    await expect.poll(async () => syncRegionText(client), { timeout: 120_000 }).toMatch(/Backed up/u);
    await leaveProjectStorageHeadroom(projectId, proLimitBytes, 1024);
    try {
      await uploadFileInBrowser(client, 'over-plan.step', Buffer.alloc(1024 * 1024 + 1, 1));
      await openRevisionsPane(client);
      await saveRevisionInBrowser(client);
      await expect
        .poll(
          async () =>
            client.page
              .getByText('These files are over your plan and were not backed up:', { exact: true })
              .first()
              .textContent(),
          {
            message: 'D16: the LFS batch refusal must use the exact over-plan sentence',
            timeout: 120_000,
          },
        )
        .toBe('These files are over your plan and were not backed up:');
      await expect
        .poll(async () => syncRegionText(client), {
          message: 'D16: the LFS batch refusal must name the authored file',
          timeout: 120_000,
        })
        .toContain('over-plan.step');
    } catch (error) {
      /* Restoration must not replace the refusal/assertion that brought us
       * here. The suite-level failure hook captures the still-open surface. */
      await spendProjectStorage(projectId, 0).catch(() => undefined);
      throw error;
    }
    await spendProjectStorage(projectId, 0);
  }, 900_000);

  it('should round-trip 5 MiB STEP files on both clients without publishing exports or re-uploading LFS', async () => {
    const source = required(browser, 'The browser client did not launch.');
    const destination = required(desktop, 'The desktop client did not launch.');
    const accountOwner = required(owner, 'The account was not seeded.');
    const name = 'W18 LFS Roundtrip';
    const sourceSlug = await createProjectInBrowser(source, name);
    const lfsProjectId = required(
      await browserProjectId(source, sourceSlug),
      'V13/V14: the browser LFS project id is absent.',
    );
    await registerProjectOnRemote(accountOwner, lfsProjectId, name);
    await openSyncRegion(source);
    await source.page.getByRole('radio', { name: 'Tau Cloud' }).first().click();
    await expect.poll(async () => syncRegionText(source), { timeout: 180_000 }).toMatch(/Backed up/u);

    const browserStep = new Uint8Array(fiveMiB).fill(0x41);
    browserStep.set(new TextEncoder().encode('ISO-10303-21;\n/* browser */\n'), 0);
    const browserDigest = createHash('sha256').update(browserStep).digest('hex');
    await uploadFileInBrowser(source, 'roundtrip.step', browserStep);
    await openRevisionsPane(source);
    await saveRevisionInBrowser(source);
    await expect
      .poll(async () => projectLfsBytes(lfsProjectId), {
        message: 'V13/V14: Tau Cloud must verify and charge the browser STEP object',
        timeout: 180_000,
      })
      .toBe(fiveMiB);
    const browserHeadAfterStep = required(
      await browserHead(source, sourceSlug),
      'V13/V14: the browser STEP revision has no head.',
    );
    await expect
      .poll(async () => gitHead(tauRepository(lfsProjectId)), { timeout: 180_000 })
      .toBe(browserHeadAfterStep);
    expect(await gitOutput(tauRepository(lfsProjectId), ['show', `${browserHeadAfterStep}:roundtrip.step`])).toContain(
      `oid sha256:${browserDigest}`,
    );

    /* The named version is authored through the product, then read from each
     * destination's own revision store — not inferred from the remote tag or
     * from the unpublished Share authoring form. */
    await openHostedShare(source);
    await source.page.getByRole('combobox', { name: /Version name/iu }).fill('v1');
    await source.page.getByRole('button', { name: /Publish and copy link/iu }).click();
    await expect
      .poll(async () => gitOutput(tauRepository(lfsProjectId), ['rev-parse', 'refs/tags/v1^{}']), {
        message: 'V15: the browser named version must reach Tau Cloud',
        timeout: 180_000,
      })
      .toBe(browserHeadAfterStep);
    const publishedTagOid = required(
      await gitOutput(tauRepository(lfsProjectId), ['rev-parse', 'refs/tags/v1']),
      'V10/V15: Tau Cloud has no unpeeled named-version ref.',
    );
    expect(publishedTagOid, 'V10/V15: the unpeeled named-version ref must be a concrete SHA-1 OID').toMatch(
      /^[0-9a-f]{40}$/u,
    );

    const browserDestination = await launchBrowserClient({ oneTimeToken: await mintOneTimeToken(bearer) });
    try {
      const browserDestinationSlug = await openTauCloudProject(browserDestination.page, {
        projectsUrl: '/projects',
        name,
        direction: 'named version browser destination',
      });
      await expect
        .poll(
          async () => {
            const ref = await readBrowserFile(browserDestination, browserDestinationSlug, [
              '.tau',
              'revisions',
              'refs',
              'tags',
              'v1',
            ]);
            return ref?.trim();
          },
          {
            message: 'V10/V15: a fresh browser destination must hold the fetched named-version ref',
            timeout: 120_000,
          },
        )
        .toBe(publishedTagOid);
    } catch (error) {
      await openSyncRegion(browserDestination).catch(() => undefined);
      await captureAndRethrow(error, 'named-version-browser-destination', [browserDestination, source, destination]);
    } finally {
      await browserDestination.close();
    }

    const destinationSlug = await openTauCloudProject(destination.page, {
      projectsUrl: 'app://tau/projects',
      name,
      direction: 'browser→desktop LFS',
    });
    const destinationRoot = join(destination.homeRoot, destinationSlug);
    await destination.page.bringToFront();
    await expect
      .poll(async () => readFile(join(destinationRoot, 'roundtrip.step')).catch(() => undefined), {
        message: 'V13/V14: desktop must smudge the browser STEP pointer to exact bytes',
        timeout: 180_000,
      })
      .toEqual(Buffer.from(browserStep));
    await expect
      .poll(async () => gitOutput(destinationRoot, ['rev-parse', 'refs/tags/v1']), {
        message: 'V15: the desktop destination must hold the fetched named-version ref',
        timeout: 120_000,
      })
      .toBe(publishedTagOid);
    await openRevisionsPane(destination);

    const desktopStep = new Uint8Array(fiveMiB).fill(0x42);
    desktopStep.set(new TextEncoder().encode('ISO-10303-21;\n/* desktop */\n'), 0);
    const desktopDigest = createHash('sha256').update(desktopStep).digest('hex');
    await writeFile(join(destinationRoot, 'roundtrip.step'), desktopStep);
    await expect
      .poll(async () => destination.page.getByText('Modified', { exact: true }).count(), { timeout: 60_000 })
      .toBeGreaterThan(0);
    await destination.page.bringToFront();
    await destination.page.keyboard.press(`${modifier}+KeyS`);
    await expect
      .poll(async () => projectLfsBytes(lfsProjectId), {
        message: 'V13/V14: Tau Cloud must verify the distinct desktop STEP object',
        timeout: 180_000,
      })
      .toBe(2 * fiveMiB);
    const desktopHeadAfterStep = required(
      await desktopHead(destinationRoot),
      'V13/V14: the desktop STEP revision has no head.',
    );
    await expect
      .poll(async () => gitHead(tauRepository(lfsProjectId)), { timeout: 180_000 })
      .toBe(desktopHeadAfterStep);
    expect(await gitOutput(tauRepository(lfsProjectId), ['show', `${desktopHeadAfterStep}:roundtrip.step`])).toContain(
      `oid sha256:${desktopDigest}`,
    );
    await source.page.reload({ waitUntil: 'domcontentloaded' });
    await expect
      .poll(async () => browserHead(source, sourceSlug), {
        message: 'V13/V14: browser must fetch the desktop STEP revision',
        timeout: 180_000,
      })
      .toBe(desktopHeadAfterStep);
    await expect
      .poll(async () => browserFileDigest(source, sourceSlug, ['roundtrip.step']), { timeout: 180_000 })
      .toEqual({ bytes: fiveMiB, sha256: desktopDigest });

    /* A later push still references the same desktop object. The API charges
     * every verified upload, so stable accounting proves the client received
     * the existing-object batch response and did not upload it again. */
    const localExport = new Uint8Array(fiftyMiB).fill(0x45);
    localExport.set(new TextEncoder().encode('ISO-10303-21;\n/* 50 MiB local export */\n'), 0);
    const localExportDigest = createHash('sha256').update(localExport).digest('hex');
    const localExportPath = join(destinationRoot, 'exports', 'local.step');
    await mkdir(join(destinationRoot, 'exports'), { recursive: true });
    await writeFile(localExportPath, localExport);
    await writeFile(join(destinationRoot, 'main.scad'), 'cube([38, 38, 38]); // repeated LFS push\n', 'utf8');
    await expect
      .poll(async () => destination.page.getByText('Modified', { exact: true }).count(), { timeout: 60_000 })
      .toBeGreaterThan(0);
    await destination.page.bringToFront();
    await destination.page.keyboard.press(`${modifier}+KeyS`);
    await expect.poll(async () => desktopHead(destinationRoot), { timeout: 120_000 }).not.toBe(desktopHeadAfterStep);
    const repeatedHead = required(
      await desktopHead(destinationRoot),
      'V13/V14: the repeated desktop push has no head.',
    );
    await expect.poll(async () => gitHead(tauRepository(lfsProjectId)), { timeout: 180_000 }).toBe(repeatedHead);
    expect(await projectLfsBytes(lfsProjectId), 'V13: an existing LFS object must not be uploaded twice').toBe(
      2 * fiveMiB,
    );
    const persistedExport = await readFile(localExportPath);
    expect(persistedExport.byteLength, 'AC16: the full 50 MiB export must remain on desktop').toBe(fiftyMiB);
    expect(createHash('sha256').update(persistedExport).digest('hex')).toBe(localExportDigest);
    const remoteExport = await runGit(['show', `${repeatedHead}:exports/local.step`], tauRepository(lfsProjectId));
    expect(remoteExport.code, 'V8/V13/AC16: the 50 MiB exports/** file must not enter the remote revision').not.toBe(0);
  }, 900_000);

  /**
   * AC17's divergent case and *Keep mine*, owner W10 (the surface) with W13
   * (`sync/<remote>/<branch>`).
   *
   * W10-a2 landed the surface this drives: `revision-branches.tsx` renders a
   * `Files to resolve in <branch>` list with a `Keep mine in <path>` button per
   * file, and finishing the resolution is a separate verb. Reaching it needs
   * two devices to record divergent revisions on one branch and both to push.
   * W19-b fixed the browser write and smart-HTTP prerequisites. */
  it('should resolve a divergent branch with Keep mine', async () => {
    const client = required(browser, 'The browser client did not launch.');
    const accountOwner = required(owner, 'The account was not seeded.');
    await client.page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
    await registerProjectOnRemote(accountOwner, projectId, 'W18 Two Client');
    await openSyncRegion(client);
    const remoteChoice = client.page.getByRole('radio', { name: 'Tau Cloud' }).first();
    if (await remoteChoice.isVisible()) {
      await remoteChoice.click();
    }
    await expect.poll(async () => syncRegionText(client), { timeout: 180_000 }).toMatch(/Backed up/u);
    const previousRemoteHead = await gitHead(tauRepository(projectId));
    const peer = await scratch('conflict-peer');
    const authorization = `http.extraHeader=Authorization: ${basicAuthorization(bearer)}`;
    const remoteUrl = `${desktopE2EApiUrl}/v1/git/${projectId}.git`;
    const cloned = await runGit(['-c', authorization, 'clone', '--quiet', remoteUrl, '.'], peer);
    expect(cloned.code, cloned.stderr).toBe(0);
    const configuredName = await runGit(['config', 'user.name', 'W18 peer'], peer);
    expect(configuredName.code, configuredName.stderr).toBe(0);
    const configuredEmail = await runGit(['config', 'user.email', 'w18-peer@tau.invalid'], peer);
    expect(configuredEmail.code, configuredEmail.stderr).toBe(0);
    await writeFile(join(peer, 'main.scad'), 'cube([31, 31, 31]); // W18 peer\n', 'utf8');
    const staged = await runGit(['add', 'main.scad'], peer);
    expect(staged.code, staged.stderr).toBe(0);
    const committed = await runGit(['commit', '--quiet', '-m', 'W18 peer divergence'], peer);
    expect(committed.code, committed.stderr).toBe(0);
    const pushed = await runGit(['-c', authorization, 'push', '--quiet', 'origin', 'HEAD:refs/heads/main'], peer);
    expect(pushed.code, pushed.stderr).toBe(0);
    await expect.poll(async () => gitHead(tauRepository(projectId)), { timeout: 120_000 }).not.toBe(previousRemoteHead);

    await client.page.keyboard.press('Control+KeyF');
    await client.page
      .getByRole('treeitem', { name: /main\.scad/u })
      .first()
      .click({ timeout: 120_000 });
    await focusBrowserEditor(client);
    const browserVersion = 'cube([32, 32, 32]); // W18 browser\n';
    await client.page.keyboard.press(`${modifier}+KeyA`);
    await client.page.keyboard.insertText(browserVersion);
    await expect
      .poll(async () => readBrowserFile(client, slug, ['main.scad']), { timeout: 10_000 })
      .toBe(browserVersion);
    await saveRevisionInBrowser(client);
    await openRevisionsPane(client);
    await expect
      .poll(async () => syncRegionText(client), {
        message: 'W10/W13: the conflict must replace the pre-conflict Backed up state',
        timeout: 120_000,
      })
      .toMatch(/Needs resolution/u);
    expect(
      await readBrowserFile(client, slug, ['.tau', 'revisions', 'refs', 'heads', 'sync', 'tau', 'main']),
      'W13: the conflict must remain reachable from sync/tau/main',
    ).toBeDefined();
    const checkoutRecords = await browserStorePaths(client, `/${slug}/.tau/revisions/checkouts/`);
    expect(
      checkoutRecords.filter((path) => path.endsWith('.json')),
      'W10: the conflicted ref must have a checkout record that can project a resolution card',
    ).not.toHaveLength(0);
    await expect
      .poll(async () => client.page.getByRole('list', { name: /^Files to resolve in/u }).count(), {
        message: 'W10/W13 (DEF-7/DEF-8): divergent revisions must reach the conflict card',
        timeout: 120_000,
      })
      .toBeGreaterThan(0);
    await client.page
      .getByRole('button', { name: /^Keep mine in / })
      .first()
      .click();
    const finishResolution = client.page.getByRole('button', { name: /^Merge into / }).first();
    await expect.poll(async () => finishResolution.isEnabled(), { timeout: 120_000 }).toBe(true);
    await finishResolution.click();
    await expect.poll(async () => syncRegionText(client), { timeout: 180_000 }).toMatch(/Backed up/u);
    const resolvedHead = required(
      await browserHead(client, slug),
      'W10/W13: Keep mine completed without a resolved local HEAD.',
    );
    await expect
      .poll(async () => gitHead(tauRepository(projectId)), {
        message: 'W10/W13: the bare remote HEAD must equal the resolved browser HEAD',
        timeout: 120_000,
      })
      .toBe(resolvedHead);
    expect(await readBrowserFile(client, slug, ['main.scad'])).toBe(browserVersion);
    const remoteFile = await runGit(['show', `${resolvedHead}:main.scad`], tauRepository(projectId));
    expect(remoteFile.code, remoteFile.stderr).toBe(0);
    expect(remoteFile.stdout).toBe(browserVersion);
  }, 900_000);

  /* W18 defect DEF-2, landed by W18-b.
   *
   * AC17 and AC21 both open with "on a second device", and until W18-b there was
   * no product path to one: no verb in `packages/cli`, no control in `apps/ui`
   * and no API route that lists a caller's projects. All three exist now —
   * `GET /v1/projects`, the library's *From Tau Cloud* section, and `tau open` —
   * so this row drives the affordance rather than a link that never existed.
   *
   * What it asserts is the entry point: the second device *names* the project it
   * has never held and opens it. The content that then arrives is AC21's row
   * below, which needs the backup chain above it to be green first. */
  it('should open a project that exists only on Tau Cloud on a second device', async () => {
    const client = required(desktop, 'The desktop client did not launch.');
    /* A desktop shell signed in as the same account is asked to show the project
     * the browser client backed up, which it has never held itself. */
    await client.page.goto('app://tau/projects', { waitUntil: 'domcontentloaded' });
    const fromTauCloud = client.page.getByRole('region', { name: 'From Tau Cloud' }).first();
    await expect
      .poll(async () => fromTauCloud.getByText(/W18 Two Client/u).count(), { timeout: 45_000 })
      .toBeGreaterThan(0);

    await fromTauCloud.getByRole('button', { name: 'Open' }).first().click();
    /* The canonical project URL (`/w/{workspace}/{project}`): the local project
     * was created under the remote's own id and the open pull is running. */
    await expect.poll(async () => client.page.url(), { timeout: 120_000 }).toMatch(/\/w\//u);
  }, 900_000);

  it('should merge and render ordered replies from two divergent device logs', async () => {
    const accountOwner = required(owner, 'The account was not seeded.');
    const source = await launchBrowserClient({ oneTimeToken: await mintOneTimeToken(bearer) });
    const destination = await launchDesktopApp({ token: bearer });
    const fixture = await startGatewayFixture({
      toolCalls: [{ name: 'use_skill', input: { skillName: 'cad-openscad' } }],
    });
    const setupPrompt = 'Establish the shared W18 chat.';
    const browserPrompt = 'Browser device reply W18-A.';
    const desktopPrompt = 'Desktop device reply W18-B.';
    try {
      await fixture.routeThrough(source.page);
      await fixture.routeThrough(destination.page);
      const sourceSlug = await createProjectInBrowser(source, 'W18 Chat Segments');
      const chatProjectId = required(
        await browserProjectId(source, sourceSlug),
        'V14/V15: the chat-segment project id is absent.',
      );
      await registerProjectOnRemote(accountOwner, chatProjectId, 'W18 Chat Segments');
      await openSyncRegion(source);
      await source.page.getByRole('radio', { name: 'Tau Cloud' }).first().click();
      await selectChatModel(source.page, gatewayFixtureModelName);
      await sendPrompt(source.page, setupPrompt);
      const chatId = activeChatId(source.page);
      const chatRef = `refs/tau/chats/${chatId}`;
      await expect.poll(async () => source.page.getByText(setupPrompt, { exact: true }).count()).toBeGreaterThan(0);
      await expect
        .poll(async () => gitOutput(tauRepository(chatProjectId), ['rev-parse', chatRef]), {
          message: 'V15: the common chat base must reach Tau Cloud before the second device opens it',
          timeout: 180_000,
        })
        .toBeDefined();

      const destinationSlug = await openTauCloudProject(destination.page, {
        projectsUrl: 'app://tau/projects',
        name: 'W18 Chat Segments',
        direction: 'chat segments device A→device B',
      });
      const destinationRoot = join(destination.homeRoot, destinationSlug);
      await openBrowserChat(destination, chatId);
      await selectChatModel(destination.page, gatewayFixtureModelName);
      await expect
        .poll(async () => destination.page.getByText(setupPrompt, { exact: true }).count(), { timeout: 120_000 })
        .toBeGreaterThan(0);

      /* Hold browser Git traffic while desktop remains online. Both replies
       * descend from the common chat base: desktop publishes its segment, then
       * the browser's stale-lease push must replay both segments in order. */
      await source.context.route(`${desktopE2EApiUrl}/v1/git/**`, async (route) => route.abort('connectionfailed'));
      await sendPrompt(source.page, browserPrompt);
      await expect.poll(async () => source.page.getByText(browserPrompt, { exact: true }).count()).toBeGreaterThan(0);
      await expect
        .poll(async () => source.page.getByText(gatewayFixtureFinalText, { exact: true }).count(), {
          timeout: 180_000,
        })
        .toBeGreaterThanOrEqual(2);
      await sendPrompt(destination.page, desktopPrompt);
      await expect
        .poll(async () => destination.page.getByText(desktopPrompt, { exact: true }).count())
        .toBeGreaterThan(0);
      await expect
        .poll(async () => destination.page.getByText(gatewayFixtureFinalText, { exact: true }).count(), {
          timeout: 180_000,
        })
        .toBeGreaterThanOrEqual(2);

      const readSourceChatHead = async (): Promise<string | undefined> => {
        const value = await readBrowserFile(source, sourceSlug, ['.tau', 'revisions', 'refs', 'tau', 'chats', chatId]);
        return value?.trim();
      };
      await expect
        .poll(readSourceChatHead, {
          message: 'V14/V15: the browser device must write its divergent local chat ref',
          timeout: 120_000,
        })
        .toBeDefined();
      const sourceChatHead = required(
        await readSourceChatHead(),
        'V15: the browser device did not write its local chat ref.',
      );
      await expect
        .poll(async () => gitOutput(destinationRoot, ['rev-parse', chatRef]), {
          message: 'V14/V15: the native desktop device must write its divergent local chat ref',
          timeout: 120_000,
        })
        .toBeDefined();
      const destinationChatHead = required(
        await gitOutput(destinationRoot, ['rev-parse', chatRef]),
        'V14/V15: the native desktop device did not write its local chat ref.',
      );
      expect(destinationChatHead, 'V14/V15: browser and native desktop must hold divergent chat-ref heads').not.toBe(
        sourceChatHead,
      );

      await expect
        .poll(async () => gitOutput(tauRepository(chatProjectId), ['rev-parse', chatRef]), {
          message: 'V14/V15: native desktop must publish its divergent segment while browser Git is held',
          timeout: 180_000,
        })
        .toBe(destinationChatHead);
      await source.context.unroute(`${desktopE2EApiUrl}/v1/git/**`);
      await expect
        .poll(
          async () => {
            const head = await gitOutput(tauRepository(chatProjectId), ['rev-parse', chatRef]);
            return head !== undefined && head !== sourceChatHead && head !== destinationChatHead ? head : undefined;
          },
          {
            message: 'V14/V15: the browser CAS loser must fetch, replay and publish both device segments',
            timeout: 180_000,
          },
        )
        .toBeDefined();
      const mergedChatHead = required(
        await gitOutput(tauRepository(chatProjectId), ['rev-parse', chatRef]),
        'V15: the merged remote chat ref is absent.',
      );
      expect(
        mergedChatHead,
        'V14/V15: replay must publish a merge head distinct from the stale browser segment',
      ).not.toBe(sourceChatHead);

      /* `backedUp` has no periodic fetch. Reload each product before reading
       * its remote-tracking ref so the assertions prove a real open pull. */
      await source.page.reload({ waitUntil: 'domcontentloaded' });
      await expect
        .poll(
          async () => {
            const head = await readBrowserFile(source, sourceSlug, [
              '.tau',
              'revisions',
              'refs',
              'remotes',
              'tau',
              'tau',
              'chats',
              chatId,
            ]);
            return head?.trim();
          },
          { message: 'V15: the first device must fetch the merged chat ref', timeout: 180_000 },
        )
        .toBe(mergedChatHead);
      await destination.page.reload({ waitUntil: 'domcontentloaded' });
      await expect
        .poll(async () => gitOutput(destinationRoot, ['rev-parse', `refs/remotes/tau/tau/chats/${chatId}`]), {
          message: 'V14/V15: native desktop must fetch the merged chat ref after product reload',
          timeout: 180_000,
        })
        .toBe(mergedChatHead);
      await openSyncRegion(destination);
      await expect.poll(async () => syncRegionText(destination), { timeout: 180_000 }).toMatch(/Backed up/u);
      await openSyncRegion(source);
      await expect.poll(async () => syncRegionText(source), { timeout: 180_000 }).toMatch(/Backed up/u);

      await openBrowserChat(source, chatId);
      await openBrowserChat(destination, chatId);
      await requireRenderedOrder(source, {
        first: browserPrompt,
        second: desktopPrompt,
        row: 'V15 browser projection',
      });
      await requireRenderedOrder(destination, {
        first: browserPrompt,
        second: desktopPrompt,
        row: 'V15 desktop projection',
      });
      expect(await source.page.getByText(gatewayFixtureFinalText, { exact: true }).count()).toBeGreaterThanOrEqual(3);
      expect(await destination.page.getByText(gatewayFixtureFinalText, { exact: true }).count()).toBeGreaterThanOrEqual(
        3,
      );
    } catch (error) {
      await captureAndRethrow(error, 'divergent-device-chat-logs', [source, destination]);
    } finally {
      await fixture.close();
      await destination.close();
      await source.close();
    }
  }, 900_000);

  it('should open a system skill link as read-only on desktop', async () => {
    const client = await launchDesktopApp({ token: bearer });
    const fixture = await startGatewayFixture({
      toolCalls: [{ name: 'use_skill', input: { skillName: 'cad-openscad' } }],
    });
    try {
      await fixture.routeThrough(client.page);
      await client.page.goto('app://tau/projects/new', { waitUntil: 'domcontentloaded' });
      await client.page.getByLabel('Project Name *').fill('W18 Desktop Skill');
      await client.page
        .getByRole('button', { name: /^Create Project/u })
        .first()
        .click();
      await client.page.waitForURL(/\/w\/[^/]+\/[^/?]+/u, { timeout: 180_000 });
      await selectChatModel(client.page, gatewayFixtureModelName);
      await sendPrompt(client.page, 'Read the desktop OpenSCAD skill.');
      await expect
        .poll(async () => client.page.getByText(gatewayFixtureFinalText, { exact: true }).count(), {
          timeout: 180_000,
        })
        .toBeGreaterThan(0);

      await client.page.getByRole('button', { name: 'Loaded 1 tool', exact: true }).last().click();
      await client.page.getByRole('button', { name: 'cad-openscad', exact: true }).last().click();
      await client.page.keyboard.press('Control+KeyF');
      await client.page.getByRole('button', { name: 'View source', exact: true }).last().click();
      const skillEditor = client.page.locator('.editor-container:visible .monaco-editor').last();
      await skillEditor.waitFor({ state: 'visible', timeout: 60_000 });
      const skillSource = skillEditor.locator('.view-lines');
      await expect
        .poll(
          async () => {
            // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- Monaco's token spans need rendered spacing; textContent collapses `OpenSCAD authoring` into `OpenSCADauthoring`.
            const renderedSource = await skillSource.innerText();
            return renderedSource.replaceAll('\u00A0', ' ');
          },
          {
            message: 'V2: the skill link must open the actual system OpenSCAD source',
            timeout: 60_000,
          },
        )
        .toContain('OpenSCAD authoring');
      await expect(skillEditor.getByRole('textbox').getAttribute('aria-autocomplete')).resolves.toBe('none');
      // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- read the same rendered Monaco text before and after the rejected edit.
      const sourceBeforeEditAttempt = await skillSource.innerText();
      await skillEditor.getByRole('textbox').focus();
      await client.page.keyboard.insertText('must-not-edit-system-skill');
      await expect
        // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- rendered spacing is part of this read-only comparison.
        .poll(async () => skillSource.innerText())
        .toBe(sourceBeforeEditAttempt);

      const skillFile = client.page.getByRole('treeitem', { name: 'SKILL.md', exact: true }).last();
      await skillFile.waitFor({ state: 'visible', timeout: 60_000 });
      await skillFile.click({ button: 'right' });
      await client.page.getByRole('menuitem', { name: 'Read-only', exact: true }).waitFor({ state: 'visible' });
      await expect(client.page.getByRole('menuitem', { name: 'Rename' }).count()).resolves.toBe(0);
      await expect(client.page.getByRole('menuitem', { name: 'Delete' }).count()).resolves.toBe(0);
    } catch (error) {
      await captureAndRethrow(error, 'system-skill-read-only', [client]);
    } finally {
      await fixture.close();
      await client.close();
    }
  }, 900_000);
});

/** Charter W13/V18 and blueprint S48(15): real close-and-continue in both directions. */
describe('close and continue', () => {
  /** The pre-insert page-clock sample, then the close signals W13/V18 require within 1 s. */
  const editThenHide = async (
    client: BrowserClient,
    options: Readonly<{ slug: string; contents: string; row: string }>,
  ): Promise<void> => {
    const { slug, contents, row } = options;
    await client.page.keyboard.press('Control+KeyF');
    await client.page
      .getByRole('treeitem', { name: /main\.scad/u })
      .first()
      .click({ timeout: 120_000 });
    await focusBrowserEditor(client);
    await client.page.keyboard.press(`${modifier}+KeyA`);
    const beforeEditInputAt = await client.page.evaluate(() => performance.now());
    await client.page.keyboard.insertText(contents);
    await expect
      .poll(async () => readBrowserFile(client, slug, ['main.scad']), {
        message: `${continuationOwner} ${row}: the product write must put the last-edit marker in main.scad`,
        timeout: 1000,
      })
      .toBe(contents);
    const persistedAt = await client.page.evaluate(() => performance.now());
    const dispatchedAt = await client.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      const timestamp = performance.now();
      document.dispatchEvent(new Event('visibilitychange'));
      globalThis.dispatchEvent(new Event('pagehide'));
      return timestamp;
    });
    expect(
      dispatchedAt - beforeEditInputAt,
      `${continuationOwner} ${row}: hidden must follow the pre-insert page-clock sample within 1 s`,
    ).toBeLessThanOrEqual(1000);
    expect(
      dispatchedAt - persistedAt,
      `${continuationOwner} ${row}: hidden must follow persisted bytes within 1 s`,
    ).toBeLessThanOrEqual(1000);
  };

  const awaitCloseRevision = async (
    client: BrowserClient,
    options: Readonly<{ slug: string; beforeClose: string; row: string }>,
  ): Promise<string> => {
    const { slug, beforeClose, row } = options;
    /* `editThenHide` owns the page-clock <=1 s proof. Durable completion is a
     * different observable and gets the existing bounded close wait. */
    await expect
      .poll(async () => browserHead(client, slug), {
        message: `${continuationOwner} ${row}: close dispatch must mint a new source revisionId`,
        timeout: 120_000,
      })
      .not.toBe(beforeClose);
    return required(await browserHead(client, slug), `${continuationOwner} ${row}: source close revisionId is absent`);
  };

  it('should continue a hidden browser tab on a desktop shell with the same file, close revision and chat', async () => {
    const direction = 'browser→desktop';
    const marker = 'cube([21, 21, 21]); // W18-a4 browser close\n';
    const source = await launchBrowserClient({ oneTimeToken: await mintOneTimeToken(bearer) });
    let destination: DesktopSession | undefined;
    let fixture: Awaited<ReturnType<typeof installGatewayFixture>> | undefined;
    try {
      const slug = await createProjectInBrowser(source, 'W18 Browser To Desktop');
      const projectId = (await browserProjectId(source, slug)) ?? '';
      if (!projectId) {
        throw new Error(`${continuationOwner} ${direction}: source project id is absent`);
      }
      await openSyncRegion(source);
      await source.page.getByRole('radio', { name: 'Tau Cloud' }).first().click();

      fixture = await installGatewayFixture(source.page, {
        targetFile: 'main.scad',
        content: 'cube([20, 20, 20]); // completed browser chat\n',
      });
      await selectChatModel(source.page, gatewayFixtureModelName);
      await sendPrompt(source.page, 'Build the browser continuation source.');
      const chatId = activeChatId(source.page);
      const sourceChat = await terminalChatIdentity(source.page, chatId, direction);
      const remote = tauRepository(projectId);
      await expect
        .poll(async () => gitOutput(remote, ['show', '-s', '--format=%B', 'refs/heads/main']), {
          message: `${continuationOwner} ${direction}: terminal chat must settle its turn revision before the last edit`,
          timeout: 180_000,
        })
        .toContain('Tau-Trigger: turn');
      const beforeClose = await gitHead(remote);
      if (beforeClose === undefined) {
        throw new Error(`${continuationOwner} ${direction}: settled turn revisionId is absent`);
      }
      await expect
        .poll(async () => browserHead(source, slug), {
          message: `${continuationOwner} ${direction}: source head must be the settled turn before the last edit`,
          timeout: 120_000,
        })
        .toBe(beforeClose);
      await openSyncRegion(source);
      await expect
        .poll(async () => syncRegionText(source), {
          message: `${continuationOwner} ${direction}: source chat revision must be backed up before the last edit`,
          timeout: 180_000,
        })
        .toMatch(/Backed up/u);
      await fixture.close();
      fixture = undefined;

      await editThenHide(source, { slug, contents: marker, row: direction });
      const closeRevisionId = await awaitCloseRevision(source, {
        slug,
        beforeClose,
        row: direction,
      });
      await expect
        .poll(async () => gitHead(remote), {
          message: `${continuationOwner} ${direction}: close revision must reach Tau Cloud`,
          timeout: 180_000,
        })
        .toBe(closeRevisionId);
      expect(
        await gitOutput(remote, ['show', '-s', '--format=%B', closeRevisionId]),
        `${continuationOwner} ${direction}: source revision must be the close event prepared while hidden`,
      ).toContain('Tau-Trigger: close');
      expect(
        await gitOutput(remote, ['diff-tree', '--no-commit-id', '--name-only', '-r', closeRevisionId]),
        `${continuationOwner} ${direction}: source close revision changed paths must contain main.scad`,
      ).toContain('main.scad');

      destination = await launchDesktopApp({ token: bearer });
      const destinationSlug = await openTauCloudProject(destination.page, {
        projectsUrl: 'app://tau/projects',
        name: 'W18 Browser To Desktop',
        direction,
      });
      const destinationRoot = join(destination.homeRoot, destinationSlug);
      await expect
        .poll(async () => readFile(join(destinationRoot, 'main.scad'), 'utf8').catch(() => undefined), {
          message: `${continuationOwner} ${direction}: destination main.scad bytes must equal the last-edit marker`,
          timeout: 120_000,
        })
        .toBe(marker);
      await assertCurrentRevision(destination, {
        expectedHead: closeRevisionId,
        readHead: async () => gitHead(destinationRoot),
        direction,
      });
      await assertChatContinuation(destination.page, sourceChat, direction);
    } catch (error) {
      await captureAndRethrow(error, 'browser-to-desktop-close-and-continue', [source, destination]);
    } finally {
      await fixture?.close();
      await destination?.close();
      await source.close();
    }
  }, 900_000);

  it('should continue a desktop quit on a fresh browser with the same file, close revision and chat', async () => {
    const direction = 'desktop→browser';
    const marker = 'cube([22, 22, 22]); // W18-a4 desktop close\n';
    const source = await launchDesktopApp({ token: bearer });
    let destination: BrowserClient | undefined;
    let fixture: Awaited<ReturnType<typeof installGatewayFixture>> | undefined;
    try {
      await source.page.goto('app://tau/projects/new', { waitUntil: 'domcontentloaded' });
      await source.page.getByLabel('Project Name *').fill('W18 Desktop To Browser');
      await source.page
        .getByRole('button', { name: /^Create Project/u })
        .first()
        .click();
      await source.page.waitForURL(/\/w\/[^/]+\/[^/?]+/u, { timeout: 180_000 });
      const slug = projectSlug(source.page);
      const sourceRoot = join(source.homeRoot, slug);
      const manifest = JSON.parse(await readFile(join(sourceRoot, 'tau.json'), 'utf8')) as { readonly id?: string };
      const projectId = manifest.id ?? '';
      if (!projectId) {
        throw new Error(`${continuationOwner} ${direction}: source project id is absent`);
      }

      await openSyncRegion(source);
      await source.page.getByRole('radio', { name: 'Tau Cloud' }).first().click();
      fixture = await installGatewayFixture(source.page, {
        targetFile: 'main.scad',
        content: 'cube([20, 20, 20]); // completed desktop chat\n',
      });
      await selectChatModel(source.page, gatewayFixtureModelName);
      await sendPrompt(source.page, 'Build the desktop continuation source.');
      const chatId = activeChatId(source.page);
      const sourceChat = await terminalChatIdentity(source.page, chatId, direction);
      const chatLog = join(sourceRoot, '.tau', 'chats', chatId, 'events.jsonl');
      await expect
        .poll(async () => finalizedTurnRevision(chatLog), {
          message: `${continuationOwner} ${direction}: the host must attest turn.finalized before the last edit`,
          timeout: 180_000,
        })
        .toBeDefined();
      const beforeClose = await finalizedTurnRevision(chatLog);
      if (beforeClose === undefined) {
        throw new Error(`${continuationOwner} ${direction}: finalized turn revisionId is absent`);
      }
      expect(
        await gitHead(sourceRoot),
        `${continuationOwner} ${direction}: finalized turn must remain local HEAD`,
      ).toBe(beforeClose);
      await openSyncRegion(source);
      await expect
        .poll(async () => syncRegionText(source), {
          message: `${continuationOwner} ${direction}: source chat revision must be backed up before the last edit`,
          timeout: 180_000,
        })
        .toMatch(/Backed up/u);
      await fixture.close();
      fixture = undefined;

      await expect
        .poll(
          async () =>
            source.page.evaluate(() => {
              const shell = globalThis as typeof globalThis & { tau?: { quit?: { isReady(): boolean } } };
              return shell.tau?.quit?.isReady() ?? false;
            }),
          {
            message: `${continuationOwner} ${direction}: the renderer quit hold must be ready before app.quit()`,
            timeout: 120_000,
          },
        )
        .toBe(true);
      const editedAt = Date.now();
      await writeFile(join(sourceRoot, 'main.scad'), marker, 'utf8');
      await expect
        .poll(async () => source.page.getByText('Modified', { exact: true }).count(), {
          message: `${continuationOwner} ${direction}: the source must observe its last edit before app.quit()`,
          timeout: 1000,
        })
        .toBeGreaterThan(0);
      const quitInvokedAt = await source.application.evaluate(({ app }) => {
        const invokedAt = Date.now();
        app.quit();
        return invokedAt;
      });
      expect(
        quitInvokedAt - editedAt,
        `${continuationOwner} ${direction}: app.quit() must follow the last edit within 1 s`,
      ).toBeLessThanOrEqual(1000);
      await expect
        .poll(async () => gitHead(sourceRoot), {
          message: `${continuationOwner} ${direction}: app.quit() must mint a new source close revisionId`,
          timeout: 120_000,
        })
        .not.toBe(beforeClose);
      const closeRevisionId = await gitHead(sourceRoot);
      if (closeRevisionId === undefined) {
        throw new Error(`${continuationOwner} ${direction}: source close revisionId is absent`);
      }
      expect(
        await gitOutput(sourceRoot, ['show', '-s', '--format=%B', closeRevisionId]),
        `${continuationOwner} ${direction}: source revision must be the desktop close event`,
      ).toContain('Tau-Trigger: close');
      expect(
        await gitOutput(sourceRoot, ['diff-tree', '--no-commit-id', '--name-only', '-r', closeRevisionId]),
        `${continuationOwner} ${direction}: source close revision changed paths must contain main.scad`,
      ).toContain('main.scad');
      await expect
        .poll(async () => gitHead(tauRepository(projectId)), {
          message: `${continuationOwner} ${direction}: close revision must reach Tau Cloud before quit completes`,
          timeout: 180_000,
        })
        .toBe(closeRevisionId);

      const destinationClient = await launchBrowserClient({ oneTimeToken: await mintOneTimeToken(bearer) });
      destination = destinationClient;
      const destinationSlug = await openTauCloudProject(destinationClient.page, {
        projectsUrl: '/projects',
        name: 'W18 Desktop To Browser',
        direction,
      });
      await expect
        .poll(async () => readBrowserFile(destinationClient, destinationSlug, ['main.scad']), {
          message: `${continuationOwner} ${direction}: destination main.scad bytes must equal the last-edit marker`,
          timeout: 120_000,
        })
        .toBe(marker);
      await assertCurrentRevision(destinationClient, {
        expectedHead: closeRevisionId,
        readHead: async () => browserHead(destinationClient, destinationSlug),
        direction,
      });
      await assertChatContinuation(destinationClient.page, sourceChat, direction);
    } catch (error) {
      await captureAndRethrow(error, 'desktop-to-browser-close-and-continue', [source, destination]);
    } finally {
      await fixture?.close();
      await destination?.close();
      await source.close();
    }
  }, 900_000);

  /* The reverse leg's one observable half, and the only part of AC21 that this
   * build can actually show: W19's quit hold. `before-quit` awaits
   * `services.quiesce(20_000)` — every launcher's `close()` → `release()` →
   * `flushClose()` → W13's `awaitSyncSettled` — and logs the outcome before
   * `services.dispose()`, which was fire-and-forget until W19 landed it. The
   * continuation that should follow it is the case below. */
  it('should hold a desktop quit open until its services have quiesced', async () => {
    const quitting = await launchDesktopApp({ token: bearer });
    let log = '';
    try {
      await quitting.page.goto('app://tau/projects', { waitUntil: 'domcontentloaded' });
      await quitting.application.evaluate(async ({ app }) => {
        app.quit();
      });
      await expect
        .poll(
          async () => {
            log = await readFile(quitting.logPath, 'utf8').catch(() => '');
            return log;
          },
          { timeout: 60_000 },
        )
        .toContain('main.quiesce');
      expect(log, 'the quit hold reported no outcome').toMatch(/main\.quiesce.*(quiesced|timeout|no-utility)/u);
    } catch (error) {
      await captureAndRethrow(error, 'desktop-quit-hold', [quitting]);
    } finally {
      await quitting.close();
    }
  }, 900_000);

  it('should say Not backed up while the API is unreachable and push the queued close head on reconnect', async () => {
    const client = required(browser, 'The browser client did not launch.');
    const accountOwner = required(owner, 'The account was not seeded.');
    const slug = await createProjectInBrowser(client, 'W18 Offline Close');
    const offlineProjectId = (await browserProjectId(client, slug)) ?? '';
    if (!offlineProjectId) {
      throw new Error(`${continuationOwner} offline: source project id is absent`);
    }
    await registerProjectOnRemote(accountOwner, offlineProjectId, 'W18 Offline Close');
    await openSyncRegion(client);
    await client.page.getByRole('radio', { name: 'Tau Cloud' }).first().click();
    await expect
      .poll(async () => syncRegionText(client), {
        message: `${continuationOwner} offline: source remote must be connected before the outage`,
        timeout: 180_000,
      })
      .toMatch(/Backed up/u);
    await createFileInBrowser(client, 'offline-baseline.scad');
    await saveRevisionInBrowser(client);
    await expect
      .poll(async () => browserHead(client, slug), {
        message: `${continuationOwner} offline: the product must mint the backed-up baseline before the outage`,
        timeout: 120_000,
      })
      .toBeDefined();
    const beforeClose = required(
      await browserHead(client, slug),
      `${continuationOwner} offline: source head is absent before close`,
    );
    await expect
      .poll(async () => gitHead(tauRepository(offlineProjectId)), {
        message: `${continuationOwner} offline: Tau Cloud must acknowledge the baseline before the outage`,
        timeout: 180_000,
      })
      .toBe(beforeClose);
    await openSyncRegion(client);
    await expect.poll(async () => syncRegionText(client), { timeout: 180_000 }).toMatch(/Backed up/u);

    /* Unreachable for this client only: the API is shared with the rest of the
     * file and stopping its listener would decide the outcome of every other
     * case in the run. */
    await client.context.route(`${desktopE2EApiUrl}/**`, async (route) => route.abort('connectionfailed'));
    await editThenHide(client, {
      slug,
      contents: 'cube([34, 34, 34]); // edited while the API was down\n',
      row: 'offline',
    });
    const queuedCloseRevisionId = await awaitCloseRevision(client, {
      slug,
      beforeClose,
      row: 'offline',
    });

    /* The reopen, still offline: this is the window V18's sentence is about. */
    await client.page.reload({ waitUntil: 'domcontentloaded' });
    await openSyncRegion(client);
    await expect
      .poll(async () => syncRegionText(client), {
        message: `${continuationOwner} offline: reopened source must expose one queued close revision`,
        timeout: 120_000,
      })
      .toMatch(/Not backed up · 1 revision/u);
    await expect
      .poll(async () => browserHead(client, slug), {
        message: `${continuationOwner} offline: reopen must preserve the queued close revisionId`,
        timeout: 120_000,
      })
      .toBe(queuedCloseRevisionId);

    await client.context.unroute(`${desktopE2EApiUrl}/**`);
    await expect
      .poll(async () => syncRegionText(client), {
        message: `${continuationOwner} offline: queued close must complete without another gesture`,
        timeout: 180_000,
      })
      .toMatch(/Backed up/u);
    await expect
      .poll(async () => gitHead(tauRepository(offlineProjectId)), {
        message: `${continuationOwner} offline: Tau Cloud destination head must equal the queued close revisionId`,
        timeout: 180_000,
      })
      .toBe(queuedCloseRevisionId);
  }, 900_000);
});

describe('a git remote', () => {
  /* W18 defect DEF-3, owner W12 (the Connect URL rule), against charter AC18.
   *
   * AC18 is written around "a local bare repository served by `git
   * http-backend`", and the product refuses exactly that address:
   * `gitRemoteUrlProblem` answers "Only https addresses can be connected." for
   * `http://127.0.0.1:<port>/…` and "That address is on this machine or a
   * private network" for every loopback and private host, on both legs — so
   * neither the desktop's native push nor the browser's proxied one can be
   * driven to the fixture through the product. The API's own
   * `GitProxyController` refuses the same addresses (pinned in
   * `apps/api-e2e/src/git/tau-hosted-remote.spec.ts`), which is why the real
   * proxy hop is only provable against the env-gated GitHub sandbox.
   *
   * Ruling P50 settles it in AC18's favour, for a development machine only:
   * `TAU_GIT_REMOTE_ALLOW_PRIVATE=1` relaxes the same two refusals on both legs.
   * The API half is landed (`GitProxyController` reads the env once at boot and
   * says so in the log; the schema refuses the value in production) and so is
   * the rule half — `gitRemoteUrlProblem(url, { allowPrivate: true })`, whose
   * default is unchanged.
   *
   * The last mile landed under **P54**: the Connect dialog reads
   * `ENV.TAU_GIT_REMOTE_ALLOW_PRIVATE` and passes `{ allowPrivate }`, and this
   * tier's own `:3014` server and API both set the value (a2 — `ui-server.ts`
   * and `global-setup.ts`). `apps/api-e2e` must never set it: three of its rows
   * assert exactly the refusals it relaxes. */
  it('should accept a local git http-backend address in Connect', async () => {
    if (!browser || !gitRemote) {
      throw new Error('The browser client or the git fixture did not start.');
    }
    await createProjectInBrowser(browser, 'W18 Git Remote');
    await openSyncRegion(browser);
    const syncRegion = browser.page.getByRole('region', { name: 'Sync' }).filter({ visible: true }).last();
    await syncRegion.getByRole('radio', { name: 'Git remote' }).click();
    await syncRegion.getByText('Advanced HTTPS remote', { exact: true }).click();
    await syncRegion.getByLabel('Repository address').fill(gitRemote.url);
    const connect = syncRegion.getByRole('button', { name: 'Connect', exact: true });
    await expect.poll(async () => connect.isEnabled(), { timeout: 30_000 }).toBe(true);
  }, 900_000);

  it('should round-trip a branch and a tag and serve a byte-for-byte stock clone', async () => {
    if (!gitRemote) {
      throw new Error('The git fixture did not start.');
    }
    const tree = await scratch('tree');
    for (const args of [
      ['init', '-q', '--initial-branch=main', '.'],
      ['config', 'user.email', 'w18@example.test'],
      ['config', 'user.name', 'W18 E2E'],
    ]) {
      const outcome = await runGit(args, tree);
      expect(outcome.code, outcome.stderr).toBe(0);
    }
    await writeFile(join(tree, 'main.scad'), 'cube([12, 12, 12]);\n', 'utf8');
    await writeFile(join(tree, 'tau.json'), '{"name":"W18 Git Remote"}\n', 'utf8');
    for (const args of [
      ['add', '.'],
      ['commit', '-m', 'first revision'],
      ['tag', '-a', 'v1', '-m', 'first named version'],
      ['push', gitRemote.url, 'HEAD:refs/heads/main', 'refs/tags/v1'],
    ]) {
      const outcome = await runGit(args, tree);
      expect(outcome.code, `git ${args.join(' ')}: ${outcome.stderr}`).toBe(0);
    }

    const into = await scratch('clone');
    const clone = join(into, 'clone');
    const cloned = await runGit(['clone', '-q', gitRemote.url, clone], into);
    expect(cloned.code, cloned.stderr).toBe(0);

    const source = await runGit(['ls-tree', '-r', '--format=%(objectname) %(path)', 'HEAD'], tree);
    const target = await runGit(['ls-tree', '-r', '--format=%(objectname) %(path)', 'HEAD'], clone);
    expect(target.stdout).toBe(source.stdout);
    expect(await readFile(join(clone, 'main.scad'), 'utf8')).toBe('cube([12, 12, 12]);\n');

    const tags = await runGit(['tag', '--list'], clone);
    expect(tags.stdout.trim()).toBe('v1');
  }, 600_000);

  it('should clone its dumb-HTTP URL with stock git', async () => {
    if (!gitRemote) {
      throw new Error('The git fixture did not start.');
    }
    /* `post-update` runs `git update-server-info` on every push, which is the
     * whole of the dumb protocol's index; a clone that walks `info/refs` and
     * `objects/info/packs` is the assertion that it ran. `protocol.version=0`
     * and a disabled smart service are not available to a client, so the
     * evidence is that the dumb files describe the same head. */
    const advertised = await fetch(new URL('info/refs', `${gitRemote.url}/`));
    expect(advertised.status).toBe(200);
    const head = await gitRemote.git(['rev-parse', 'refs/heads/main']);
    expect(await advertised.text()).toContain(`${head}\trefs/heads/main`);

    const into = await scratch('dumb');
    const clone = join(into, 'clone');
    const cloned = await runGit(['clone', '-q', gitRemote.url, clone], into);
    expect(cloned.code, cloned.stderr).toBe(0);
    const cloneHead = await runGit(['rev-parse', 'HEAD'], clone);
    expect(cloneHead.stdout.trim()).toBe(head);
  }, 600_000);

  const githubSandbox = process.env['TAU_E2E_GITHUB_SANDBOX'];
  const githubToken = process.env['TAU_E2E_GITHUB_TOKEN'];

  /* The only place the *real* `GitProxyController` can be exercised: it refuses
   * `http:` and every loopback and private address by design, so a local
   * fixture can never go through it. Env-gated, never a secret under a project
   * or workspace directory — the token is read from the environment and is
   * never written anywhere. */
  it.skipIf(!githubSandbox || !githubToken)(
    'should proxy a public https git advertisement for a browser client',
    async () => {
      const sandbox = required(githubSandbox, 'TAU_E2E_GITHUB_SANDBOX is required for the GitHub sandbox row.');
      const token = required(githubToken, 'TAU_E2E_GITHUB_TOKEN is required for the GitHub sandbox row.');
      const target = new URL('info/refs', `${sandbox}/`);
      target.searchParams.set('service', 'git-upload-pack');
      const proxied = await fetch(`${desktopE2EApiUrl}/v1/git/proxy?url=${encodeURIComponent(target.toString())}`, {
        headers: {
          authorization: `Bearer ${bearer}`,
          'x-tau-proxy-authorization': `Bearer ${token}`,
        },
      });
      expect(proxied.status).toBe(200);
      expect(await proxied.text()).toContain('service=git-upload-pack');
    },
    600_000,
  );
});

/** Kept for the git-remote cases that push with a Tau credential. */
void basicAuthorization;
