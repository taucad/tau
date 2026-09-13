/* oxlint-disable no-await-in-loop -- Every loop here drives one client, one `git` child or one database statement after another on purpose. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { desktopE2EApiUrl } from '#support/config.js';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { declineCookieBanner } from '#support/scenario.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import { browserSession, launchBrowserClient } from '#support/two-client/browser-client.js';
import type { BrowserClient } from '#support/two-client/browser-client.js';
import { startGitHttpBackend } from '#support/two-client/git-http-backend.js';
import type { GitHttpBackendFixture } from '#support/two-client/git-http-backend.js';
import {
  basicAuthorization,
  forgetSeededProjects,
  mintOneTimeToken,
  registerProjectOnRemote,
  runGit,
  seedProPlan,
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
 * **Six of the cases below are red pins**, and each names the lane that owns
 * the defect. W18 lands no product code: a case that cannot pass is kept
 * failing by name rather than worked around, and the workaround that *is* used
 * — `--disable-web-security` on one client — exists only so the chain behind
 * defect DEF-5 is measurable, with DEF-5 itself pinned on its own.
 */

const proLimitBytes = 10 * 1024 ** 3;

let account: ReturnType<typeof tauTestAccount> | undefined;
let bearer = '';
let owner: TauCloudOwnerIds | undefined;
let uiServer: UiServer | undefined;
let desktop: DesktopSession | undefined;
let browser: BrowserClient | undefined;
let gitRemote: GitHttpBackendFixture | undefined;
const scratchDirectories: string[] = [];

/** A throwaway directory, removed with the suite. */
const scratch = async (label: string): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), `tau-two-client-${label}-`));
  scratchDirectories.push(directory);
  return directory;
};

/** Read the project id the browser client wrote into its own OPFS store. */
const browserProjectId = async (client: BrowserClient): Promise<string | undefined> =>
  client.page.evaluate(async () => {
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
  });

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
  await declineCookieBanner(page);
  await page
    .getByRole('button', { name: /^Create Project/u })
    .first()
    .click();
  await page.waitForURL(/\/w\/[^/]+\/[^/?]+/u, { timeout: 180_000 });
  return new URL(page.url()).pathname.split('/').pop()?.split('?')[0] ?? '';
};

/** Open the Revisions pane and reveal the Sync region's connect choice. */
const openSyncRegion = async (client: BrowserClient): Promise<void> => {
  const { page } = client;
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+KeyK' : 'Control+KeyK');
  await page.getByPlaceholder('Search projects, chats, and actions...').fill('Open revision history');
  await page.getByText('Open revision history', { exact: true }).first().click();
  await page
    .getByRole('button', { name: /Back up to Tau Cloud/u })
    .first()
    .click();
  await page.getByRole('region', { name: 'Sync' }).first().waitFor({ state: 'visible', timeout: 60_000 });
};

/** What the Sync region says right now. */
const syncRegionText = async (client: BrowserClient): Promise<string> =>
  // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- Playwright's own locator method; `textContent` would drop the line breaks the copy reads by.
  client.page.getByRole('region', { name: 'Sync' }).first().innerText();

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

describe('one account, two clients', () => {
  it('should sign a desktop shell and a real browser in from one sign-in', async () => {
    desktop = await launchDesktopApp({ token: bearer });
    /* S40's rule, and the reason for the one-time token: better-auth allows
     * three `/sign-in/email` attempts per ten seconds per address, and a second
     * sign-in for the browser would spend two of them on every run. */
    browser = await launchBrowserClient({
      disableWebSecurity: true,
      oneTimeToken: await mintOneTimeToken(bearer),
    });
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

  beforeAll(async () => {
    if (!browser) {
      throw new Error('The browser client did not launch.');
    }
    slug = await createProjectInBrowser(browser, 'W18 Two Client');
    projectId = (await browserProjectId(browser)) ?? '';
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
   * This case is the only one in the file that must run with the browser's own
   * security boundary intact, so it opens its own client. Remove `.fails` when
   * `git-protocol` is allowed. */
  it.fails('should let a real browser page reach the Tau Hosted Remote advertisement', async () => {
    if (!owner) {
      throw new Error('The account was not seeded.');
    }
    await registerProjectOnRemote(owner, projectId, 'W18 Two Client');
    const strict = await launchBrowserClient({ oneTimeToken: await mintOneTimeToken(bearer) });
    try {
      await strict.page.goto('/', { waitUntil: 'domcontentloaded' });
      const outcome = await strict.page.evaluate(
        async ([api, id]: readonly string[]) => {
          try {
            const response = await fetch(`${api!}/v1/git/${id!}.git/info/refs?service=git-upload-pack`, {
              credentials: 'include',
              headers: { 'git-protocol': 'version=2' },
            });
            return { ok: response.ok, status: response.status, error: undefined as string | undefined };
          } catch (error) {
            return { ok: false, status: 0, error: String(error).slice(0, 200) };
          }
        },
        [desktopE2EApiUrl, projectId],
      );
      expect(outcome, 'the advertisement was blocked before it was sent').toEqual(
        expect.objectContaining({ ok: true, status: 200 }),
      );
    } finally {
      await strict.close();
    }
  }, 600_000);

  /* W18 defect DEF-6, owner: principal ruling P45 with W13 as the sync-side
   * owner.
   *
   * Choosing *Tau Cloud* does reach the machine — the API log carries the
   * advertisement the `initialSync` actor's `port.fetch` made — but the Sync
   * region never repaints. P45 records that `onSnapshot: { actions: [] }` is
   * present on the root's `sync` invoke only; the `remote` child (and three
   * others) still lack it, so a child transition never becomes a host frame and
   * `remote.phase` stays whatever the last root transition published. W13's own
   * report says the same in `§14.5`. Until that lands, no Sync row state —
   * `Checking…`, `Backed up`, `Backing up… n`, `Not backed up · n` — is
   * observable from a client, which is what AC21 and V18 are written in terms
   * of. Remove `.fails` when the remote facet reaches the region. */
  it.fails('should report a connected remote in the Sync region after choosing Tau Cloud', async () => {
    if (!browser || !owner) {
      throw new Error('The browser client did not launch.');
    }
    await registerProjectOnRemote(owner, projectId, 'W18 Two Client');
    await openSyncRegion(browser);
    await browser.page.getByRole('radio', { name: 'Tau Cloud' }).first().click();
    await expect
      .poll(async () => syncRegionText(browser!), { timeout: 45_000 })
      .toMatch(/Checking…|Backed up|Backing up|Not backed up/u);
  }, 900_000);

  /* W18 defect DEF-1, owner W11a (server), reached here through the product's
   * own Connect gesture rather than through a request.
   *
   * Nothing registers a project on the Tau Hosted Remote:
   * `GitRepositoryService.authorize` needs a `project` row and the only
   * production writer of that table is `PublicationsService`, which runs after
   * a successful push. Every other case in this file seeds the row explicitly
   * and says so. Remove `.fails` when *Connect* creates it. */
  it.fails('should back up a project that was never published', async () => {
    if (!browser) {
      throw new Error('The browser client did not launch.');
    }
    const unregistered = await createProjectInBrowser(browser, 'W18 Never Published');
    expect(unregistered).not.toBe('');
    await openSyncRegion(browser);
    await browser.page.getByRole('radio', { name: 'Tau Cloud' }).first().click();
    await expect.poll(async () => syncRegionText(browser!), { timeout: 45_000 }).toMatch(/Backed up/u);
  }, 900_000);

  /* W18 defect DEF-4's product face, owners W11a (the plan backstop) and W11b /
   * W13 (the file list). AC16 and S35 want a refused push to name the files in
   * the Sync region; the region cannot say anything at all while DEF-6 stands,
   * and the server accepts an over-plan push anyway (pinned in
   * `apps/api-e2e/src/git/tau-hosted-remote.spec.ts`). Remove `.fails` when
   * both are fixed. */
  it.fails('should name the refused files in the Sync region when a push is over the plan', async () => {
    if (!browser || !owner) {
      throw new Error('The browser client did not launch.');
    }
    await registerProjectOnRemote(owner, projectId, 'W18 Two Client');
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    await promisify(execFile)('docker', [
      'exec',
      'tau-postgres',
      'psql',
      '-qtAX',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'dev_user',
      '-d',
      'tau_dev',
      '-c',
      `INSERT INTO project_git (project_id, storage_bytes, lfs_bytes) VALUES ('${projectId}', ${String(proLimitBytes - 1024)}, 0) ON CONFLICT (project_id) DO UPDATE SET storage_bytes = ${String(proLimitBytes - 1024)};`,
    ]);
    await openSyncRegion(browser);
    await browser.page.getByRole('radio', { name: 'Tau Cloud' }).first().click();
    await expect
      .poll(async () => syncRegionText(browser!), { timeout: 45_000 })
      .toMatch(/over your plan and were not backed up/u);
  }, 900_000);

  /* W18 defect DEF-2, owner W19 (sessions) with W11 as the transport owner.
   *
   * AC17 and AC21 both open with "on a second device". There is no product path
   * that gives a second device a project that exists only on the Tau Hosted
   * Remote: no verb in `packages/cli`, no control in `apps/ui`, and no API
   * endpoint that lists a caller's projects. The architecture asserts the
   * mechanism — "the browser on a second device fetches the graph and
   * materializes the live checkout from `main`" — but nothing names the project
   * to fetch. Remove `.fails` when a second device can open one. */
  it.fails('should open a project that exists only on Tau Cloud on a second device', async () => {
    if (!desktop) {
      throw new Error('The desktop client did not launch.');
    }
    /* A fresh desktop profile, signed in as the same account, is asked to show
     * the project the browser client just backed up. */
    await desktop.page.goto('app://tau/projects', { waitUntil: 'domcontentloaded' });
    await expect
      .poll(async () => desktop!.page.getByRole('link', { name: /W18 Two Client/u }).count(), { timeout: 45_000 })
      .toBeGreaterThan(0);
  }, 900_000);
});

/**
 * AC21 and V18 — close and continue, in both directions.
 *
 * Written last, after `execution/W19/report.md` landed, so these cases assert
 * what W19 actually shipped: a project is live iff its `project-session` actor
 * runs, `close` flushes through `release()` → W13's `awaitSyncSettled`, and the
 * desktop's `before-quit` awaits `services.quiesce(20_000)` and logs
 * `main.quiesce { outcome }` before `services.dispose()`.
 *
 * Two of the three are red pins. The chain that blocks them is the same one
 * §3 of the W18 report describes — DEF-1 (nothing registers a project on the
 * remote), DEF-5 (the browser cannot make a single git request), DEF-6 (no Sync
 * row ever repaints) and DEF-2 (no second device can name a remote-only
 * project) — and on top of it, no spec-drivable gesture on this build mints a
 * revision: `Mod+S` on a fresh project leaves History at "No revisions yet",
 * Monaco's `.view-lines` never attaches while the viewer tab is active, and a
 * chat turn never reaches the provider. The "last edit" below is therefore a
 * write into the client's own store, which is what an edit ultimately is, and
 * the pins say so rather than pretending otherwise.
 */
describe('close and continue', () => {
  /** The last edit, then the close signals S41 and W13 say flush it, inside 1 s. */
  const editThenHide = async (client: BrowserClient, slug: string, contents: string): Promise<void> => {
    await client.page.evaluate(
      async ([project, text]: readonly string[]) => {
        const root = await navigator.storage.getDirectory();
        const directory = await root.getDirectoryHandle(project!);
        const handle = await directory.getFileHandle('main.scad', { create: true });
        const writable = await handle.createWritable();
        await writable.write(text!);
        await writable.close();
      },
      [slug, contents],
    );
    await client.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      globalThis.dispatchEvent(new Event('pagehide'));
    });
  };

  /* W18 defect DEF-2 (owner W19) with DEF-1 (W11a) and DEF-5 (W11a) upstream of
   * it, against charter AC21's first clause.
   *
   * The browser tab is hidden within 1 s of its last edit, which is the signal
   * W13's `sync.machine` flushes on, and a desktop shell with a fresh user data
   * directory is then asked for the same project. It cannot be asked: nothing
   * lists a caller's projects and nothing materializes one from the remote, so
   * the continuation has no entry point. Remove `.fails` when a second device
   * can open a project it has never held. */
  it.fails('should continue a hidden browser tab on a desktop shell with a fresh user data directory', async () => {
    if (!browser) {
      throw new Error('The browser client did not launch.');
    }
    const slug = await createProjectInBrowser(browser, 'W18 Close Continue');
    await editThenHide(browser, slug, 'cube([21, 21, 21]); // the last edit before close\n');

    /* `launchDesktopApp` mkdtemps its `--user-data-dir` on every call, so this
     * shell has never held the project — the fresh directory AC21 asks for. */
    const second = await launchDesktopApp({ token: bearer });
    try {
      await second.page.goto('app://tau/projects', { waitUntil: 'domcontentloaded' });
      await expect
        .poll(async () => second.page.getByRole('link', { name: /W18 Close Continue/u }).count(), { timeout: 60_000 })
        .toBeGreaterThan(0);
    } finally {
      await second.close();
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
    } finally {
      await quitting.close();
    }
  }, 900_000);

  /* W18 defect DEF-6 (P45, with W13 on the sync side) and DEF-4's product face
   * (W11b/W13), against AC21's offline clause and V18.
   *
   * The API is made unreachable from this client's own context before the close
   * signals fire, exactly as the brief asks, and reachable again afterwards.
   * What V18 wants to read — `Not backed up · 1 revision` while the API is down,
   * then a push that completes on reconnect with no user action — is a Sync row
   * state, and no Sync row state is observable from a client while the `remote`
   * facet has no `onSnapshot`. Remove `.fails` when the region repaints. */
  it.fails('should say Not backed up while the API is unreachable and complete on reconnect', async () => {
    if (!browser || !owner) {
      throw new Error('The browser client did not launch.');
    }
    const slug = await createProjectInBrowser(browser, 'W18 Offline Close');
    const projectId = (await browserProjectId(browser)) ?? '';
    await registerProjectOnRemote(owner, projectId, 'W18 Offline Close');
    await openSyncRegion(browser);
    await browser.page.getByRole('radio', { name: 'Tau Cloud' }).first().click();

    /* Unreachable for this client only: the API is shared with the rest of the
     * file and stopping its listener would decide the outcome of every other
     * case in the run. */
    await browser.context.route(`${desktopE2EApiUrl}/**`, async (route) => route.abort('connectionfailed'));
    await editThenHide(browser, slug, 'cube([34, 34, 34]); // edited while the API was down\n');
    await expect.poll(async () => syncRegionText(browser!), { timeout: 60_000 }).toMatch(/Not backed up · 1 revision/u);

    await browser.context.unroute(`${desktopE2EApiUrl}/**`);
    await expect.poll(async () => syncRegionText(browser!), { timeout: 120_000 }).toMatch(/Backed up/u);
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
   * Either AC18's local-fixture clause or the URL rule has to give; the rule is
   * W12's and this lane may not change it. Remove `.fails` when a local address
   * is connectable, or retire the clause. */
  it.fails('should accept a local git http-backend address in Connect', async () => {
    if (!browser || !gitRemote) {
      throw new Error('The browser client or the git fixture did not start.');
    }
    await createProjectInBrowser(browser, 'W18 Git Remote');
    await openSyncRegion(browser);
    await browser.page.getByRole('radio', { name: 'Git remote' }).first().click();
    await browser.page.getByLabel('Repository address').fill(gitRemote.url);
    const connect = browser.page.getByRole('button', { name: 'Connect', exact: true }).first();
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
      const target = new URL('info/refs', `${githubSandbox!}/`);
      target.searchParams.set('service', 'git-upload-pack');
      const proxied = await fetch(`${desktopE2EApiUrl}/v1/git/proxy?url=${encodeURIComponent(target.toString())}`, {
        headers: {
          authorization: `Bearer ${bearer}`,
          'x-tau-proxy-authorization': `Bearer ${githubToken!}`,
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
