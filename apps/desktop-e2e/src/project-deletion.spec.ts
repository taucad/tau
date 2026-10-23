/* eslint-disable @typescript-eslint/naming-convention -- Process environment and tau.json retain their wire spelling. */
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import type { BrowserContext, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { desktopE2EApiUrl, desktopE2EFrontendUrl } from '#support/config.js';
import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { basicAuthorization, mintOneTimeToken, runGit } from '#support/two-client/tau-cloud.js';
import { startUiServer } from '#support/two-client/ui-server.js';
import type { UiServer } from '#support/two-client/ui-server.js';

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(import.meta.dirname, '../../..');
let artifacts: string;
let token: string;
let userId: string;
let ownerEmail: string;
let ui: UiServer | undefined;

/** SQL is allowed only after the exact owned container and database URL agree. */
const sql = async (statement: string): Promise<string> => {
  const container = process.env['TAU_E2E_POSTGRES_CONTAINER'] ?? '';
  const database = process.env['TAU_E2E_POSTGRES_DATABASE'] ?? '';
  const url = new URL(process.env['DATABASE_URL'] ?? 'http://invalid');
  if (
    !/^cpd07-acceptance-postgres-[a-f0-9]+$/u.test(container) ||
    container !== process.env['CPD_ACCEPTANCE_POSTGRES_CONTAINER'] ||
    !/^tau_scratch_project_deletion_[a-f0-9]+_\d+$/u.test(database) ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.port === '5432' ||
    url.username !== 'cpd_acceptance' ||
    url.pathname !== `/${database}`
  ) {
    throw new Error('Deletion desktop acceptance requires its owned migrated scratch database.');
  }
  const published = await execFileAsync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' });
  if (published.stdout.trim() !== url.host) {
    throw new Error('Deletion database URL does not match its owned container port.');
  }
  const result = await execFileAsync(
    'docker',
    [
      'exec',
      container,
      'psql',
      '-qtAX',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'cpd_acceptance',
      '-d',
      database,
      '-c',
      statement,
    ],
    { encoding: 'utf8' },
  );
  return result.stdout.trim();
};

const authHeaders = (): Record<string, string> => ({ authorization: `Bearer ${token}` });

/** Registration is seeded for a free owner: deletion must not require purchasing a sync plan. */
const seedProject = async (name: string): Promise<string> => {
  const id = `proj_${randomBytes(16).toString('hex').slice(0, 21)}`;
  if (!/^[a-zA-Z0-9 -]+$/u.test(name) || !/^[a-zA-Z0-9_-]+$/u.test(userId)) {
    throw new Error('Unexpected fixture identity.');
  }
  await sql(`INSERT INTO project (id, owner_id, name) VALUES ('${id}', '${userId}', '${name}');`);
  return id;
};

const state = async (id: string): Promise<string> => {
  const response = await fetch(`${desktopE2EApiUrl}/v1/projects/${id}/deletion`, { headers: authHeaders() });
  expect(response.status).toBe(200);
  return ((await response.json()) as { state: string }).state;
};

/** Real browser security and a persistent profile, retained after the browser exits. */
const browser = async (profile: string, touch = false): Promise<BrowserContext> => {
  const context = await chromium.launchPersistentContext(join(artifacts, profile), {
    baseURL: desktopE2EFrontendUrl,
    viewport: { width: 1600, height: 1000 },
    serviceWorkers: 'block',
    hasTouch: touch,
  });
  try {
    context.setDefaultTimeout(60_000);
    await context.addCookies([
      {
        name: 'tau-cookie-consent',
        value: encodeURIComponent(JSON.stringify({ status: 'declined', version: 1 })),
        url: desktopE2EFrontendUrl,
      },
    ]);
    const response = await context.request.post(`${desktopE2EApiUrl}/v1/auth/one-time-token/verify`, {
      data: { token: await mintOneTimeToken(token) },
      headers: { origin: desktopE2EFrontendUrl },
    });
    expect(response.status()).toBe(200);
    return context;
  } catch (error) {
    await context.close();
    throw error;
  }
};

const openDeletion = async (page: Page, name: string, keyboard = false): Promise<void> => {
  const actions = page.getByRole('button', { name: `Actions for ${name}`, exact: true });
  if (keyboard) {
    await actions.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: 'Delete from Tau Cloud…', exact: true }).focus();
    await page.keyboard.press('Enter');
  } else {
    await actions.click();
    await page.getByRole('menuitem', { name: 'Delete from Tau Cloud…', exact: true }).click();
  }
  await page.getByRole('alertdialog').waitFor();
  expect(await page.getByRole('alertdialog').textContent()).toContain('30 days');
};

const git = async (cwd: string, args: readonly string[]): Promise<string> => {
  const result = await runGit(args, cwd);
  expect(result.code, result.stderr).toBe(0);
  return result.stdout.trim();
};

/** Use the completed CLI with a dedicated secret vault and no operator Git configuration. */
const cli = async (args: readonly string[]): Promise<Record<string, unknown>> => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [resolve(workspaceRoot, 'packages/cli/dist/bin/tau.mjs'), ...args],
    {
      cwd: artifacts,
      encoding: 'utf8',
      timeout: 120_000,
      env: {
        ...process.env,
        TAU_API_URL: desktopE2EApiUrl,
        TAU_AUTH_TOKEN: token,
        TAU_CONFIG_DIR: join(artifacts, 'cli-config'),
        TAU_SECRET_VAULT: 'file',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
      },
    },
  );
  return JSON.parse(stdout) as Record<string, unknown>;
};

/** Install the normal development paid fixture only for the downloaded-copy case. */
const seedPaidPlan = async (): Promise<void> => {
  await sql('SELECT 1');
  await execFileAsync(
    process.execPath,
    [
      '--import',
      '@oxc-node/core/register',
      'apps/api/app/testing/development-billing-account.ts',
      'fund',
      '--email',
      ownerEmail,
    ],
    {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: {
        PATH: process.env['PATH'],
        HOME: process.env['HOME'],
        DATABASE_URL: process.env['DATABASE_URL'],
        BILLING_DATABASE_URL: process.env['DATABASE_URL'],
        BILLING_ENVIRONMENT: 'development',
        NODE_ENV: 'development',
      },
    },
  );
  const accountId = await sql(
    `SELECT account_id FROM billing.billing_owner_binding WHERE auth_user_id = '${userId}' AND revoked_at IS NULL;`,
  );
  if (!/^[a-zA-Z0-9_-]+$/u.test(accountId)) {
    throw new Error('Missing disposable billing owner binding.');
  }
  const id = `cpd-${userId}`;
  await sql(
    `INSERT INTO billing.billing_stripe_customer (id, account_id, environment, stripe_account_id, livemode) VALUES ('${id}', '${accountId}', 'development', 'acct_cpd07', false);`,
  );
  await sql(
    `INSERT INTO subscription (id, plan, status, account_id, environment, customer_binding_id, offer_snapshot, request_id, request_hash, slot_state, paid_through, updated_at) VALUES ('${id}', 'pro', 'active', '${accountId}', 'development', '${id}', '{"plan":"pro"}'::jsonb, '${id}-request', '${id}-hash', 'current', now() + interval '1 hour', now());`,
  );
};

const register = async (projectId: string, name: string): Promise<number> => {
  const response = await fetch(`${desktopE2EApiUrl}/v1/projects/${projectId}`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  await response.arrayBuffer();
  return response.status;
};

const nativeSnapshot = async (root: string): Promise<Record<string, string>> => ({
  source: await readFile(join(root, 'main.scad'), 'utf8'),
  declaration: await readFile(join(root, 'tau.json'), 'utf8'),
  identity: await readFile(join(root, '.tau/project.json'), 'utf8'),
  chat: await readFile(join(root, '.tau/chats/preserved.json'), 'utf8'),
  history: await git(root, ['log', '--format=%H:%s']),
  status: await git(root, ['status', '--porcelain=v1']),
  remotes: await git(root, ['remote', '-v']),
});

/** Read exact authored OPFS bytes without a mock filesystem or a renderer debug hook. */
const browserSnapshot = async (
  page: Page,
  slug: string,
): Promise<{ source: string; declaration: string; identity: string; chat: string }> =>
  page.evaluate(async (name) => {
    const opfs = await navigator.storage.getDirectory();
    const directory = await opfs.getDirectoryHandle(name);
    const tau = await directory.getDirectoryHandle('.tau');
    const chats = await tau.getDirectoryHandle('chats');
    const read = async (parent: FileSystemDirectoryHandle, name: string): Promise<string> => {
      const handle = await parent.getFileHandle(name);
      const file = await handle.getFile();
      return file.text();
    };
    return {
      source: await read(directory, 'main.scad'),
      declaration: await read(directory, 'tau.json'),
      identity: await read(tau, 'project.json'),
      chat: await read(chats, 'preserved.json'),
    };
  }, slug);

describe('completed artifact cloud deletion in native and browser libraries', () => {
  beforeAll(async () => {
    if (
      process.platform !== 'darwin' ||
      process.env['TAU_E2E_COMPLETED_ARTIFACT'] !== 'true' ||
      process.env['TAU_PROJECT_DELETION_ENABLED'] !== 'true'
    ) {
      throw new Error('Deletion acceptance requires the completed signed macOS artifact and enabled deletion.');
    }
    await sql('SELECT 1');
    const output = resolve(
      workspaceRoot,
      'out/research/cloud-project-deletion-blueprint/2026-10-24-implementation/acceptance/desktop-e2e',
    );
    await mkdir(output, { recursive: true });
    artifacts = await mkdtemp(join(output, 'run-'));
    const email = `tau-desktop-deletion-${randomUUID()}@example.test`;
    ownerEmail = email;
    const password = `Tau-${randomUUID()}-pass`;
    const headers = { 'content-type': 'application/json', origin: desktopE2EFrontendUrl };
    const signedUp = await fetch(`${desktopE2EApiUrl}/v1/auth/sign-up/email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password, name: 'Deletion acceptance' }),
    });
    expect(signedUp.status).toBe(200);
    await sql(`UPDATE "user" SET email_verified = true WHERE email = '${email}';`);
    const signedIn = await fetch(`${desktopE2EApiUrl}/v1/auth/sign-in/email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password }),
    });
    expect(signedIn.status).toBe(200);
    const account = (await signedIn.json()) as { token: string; user: { id: string } };
    token = signedIn.headers.get('set-auth-token') ?? account.token;
    userId = account.user.id;
    await writeFile(join(artifacts, 'owner.json'), JSON.stringify({ userId, email }));
    ui = await startUiServer();
  });

  afterAll(async () => {
    await ui?.close();
  });

  it.each(['Grid', 'Table'] as const)(
    'should delete a cloud-only project from %s without cloning, including cancel and lost-response recovery',
    async (view) => {
      const name = `Cloud only ${view} ${randomBytes(4).toString('hex')}`;
      const id = await seedProject(name);
      const context = await browser(`browser-${view.toLowerCase()}`, view === 'Table');
      const page = context.pages()[0] ?? (await context.newPage());
      const gitRequests: string[] = [];
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/v1/git/')) {
          gitRequests.push(request.method());
        }
      });
      try {
        await page.goto(`${desktopE2EFrontendUrl}/projects`);
        await page.getByRole('button', { name: 'View mode', exact: true }).click();
        await page.getByRole('menuitemcheckbox', { name: view, exact: true }).click();
        await page.getByPlaceholder('Search projects…').fill(name);
        await openDeletion(page, name, view === 'Grid');
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        expect(await state(id)).toBe('active');
        expect(
          await page
            .getByRole('button', { name: `Actions for ${name}`, exact: true })
            .evaluate((element) => element === document.activeElement),
        ).toBe(true);
        // The server commits a real DELETE, but the renderer loses its acknowledgement.
        await page.route(`${desktopE2EApiUrl}/v1/projects/${id}`, async (route) => {
          if (route.request().method() !== 'DELETE') {
            await route.continue();
            return;
          }
          const committed = await route.fetch();
          expect(committed.status()).toBe(200);
          await route.abort('connectionfailed');
        });
        await openDeletion(page, name);
        const recovered = page.waitForResponse(
          (response) =>
            response.url() === `${desktopE2EApiUrl}/v1/projects/${id}/deletion` &&
            response.request().method() === 'GET',
        );
        await page.getByRole('button', { name: 'Delete from Tau Cloud', exact: true }).click();
        const recoveredResponse = await recovered;
        expect(recoveredResponse.status()).toBe(200);
        expect(await recoveredResponse.json()).toMatchObject({ state: 'deleted', projectId: id });
        await expect.poll(async () => state(id), { timeout: 30_000 }).toBe('deleted');
        await page.reload();
        await page.getByPlaceholder('Search projects…').fill(name);
        await expect
          .poll(async () => page.getByRole('button', { name: `Actions for ${name}`, exact: true }).count())
          .toBe(0);
        expect(gitRequests).toEqual([]);
        await page.screenshot({ path: join(artifacts, `cloud-only-${view.toLowerCase()}.png`), fullPage: true });
      } finally {
        await context.close();
      }
    },
  );

  it('should keep native Git history, dirty files, chats, identity and a browser copy after deletion and profile restart', async () => {
    const name = `Retained copies ${randomBytes(4).toString('hex')}`;
    const id = await seedProject(name);
    const slug = 'retained-deletion-copy';
    const profile = join(artifacts, 'native-profile');
    const root = join(profile, 'home', slug);
    await seedPaidPlan();
    const source = join(artifacts, 'native-source');
    await mkdir(join(source, '.tau/chats'), { recursive: true });
    await mkdir(join(profile, 'home'), { recursive: true });
    const declaration = JSON.stringify({
      $schema: 'https://tau.new/schemas/tau-v1.json',
      name,
      description: '',
      tags: [],
      assets: { main: { entryPath: 'main.scad' } },
    });
    const identity = JSON.stringify({ version: 1, projectId: id });
    const chat = JSON.stringify({ marker: 'retained opaque chat bytes', userId });
    await writeFile(join(source, 'tau.json'), declaration);
    await writeFile(join(source, '.tau/project.json'), identity);
    await writeFile(join(source, '.tau/chats/preserved.json'), chat);
    await writeFile(join(source, 'main.scad'), 'cube(3);\n');
    await git(source, ['init', '--initial-branch=main']);
    await git(source, ['config', 'user.name', 'Deletion acceptance']);
    await git(source, ['config', 'user.email', 'deletion@example.invalid']);
    await git(source, ['add', '.']);
    await git(source, ['commit', '-m', 'Preserved local history']);
    await git(source, [
      '-c',
      `http.extraHeader=Authorization: ${basicAuthorization(token)}`,
      'push',
      `${desktopE2EApiUrl}/v1/git/${id}.git`,
      'HEAD:refs/heads/main',
    ]);
    await cli(['clone', id, '--into', root, '--json']);
    await git(root, ['config', 'user.name', 'Deletion acceptance']);
    await git(root, ['config', 'user.email', 'deletion@example.invalid']);
    expect(await readFile(join(root, 'main.scad'), 'utf8')).toBe('cube(3);\n');
    expect(await git(root, ['remote', '-v'])).toContain(`/v1/git/${id}.git`);
    await git(root, ['remote', 'add', 'independent', 'https://example.invalid/retained.git']);
    await writeFile(join(root, 'main.scad'), 'cube(7); // dirty native work\n');
    let session: DesktopSession | undefined;
    let context: BrowserContext | undefined;
    try {
      session = await launchDesktopApp({
        token,
        profileRoot: profile,
        preserveProfile: true,
        preparedKernels: false,
        env: { TAU_DESKTOP_UPDATES: 'off' },
      });
      await authenticatePackagedDesktop(session, token);
      await session.page.goto('app://tau/projects');
      await session.page.getByRole('link', { name: `Open ${name}`, exact: true }).waitFor();
      context = await browser('browser-retained');
      let page = context.pages()[0] ?? (await context.newPage());
      await page.goto(`${desktopE2EFrontendUrl}/projects`);
      await page.evaluate(
        async (input) => {
          const opfs = await navigator.storage.getDirectory();
          const directory = await opfs.getDirectoryHandle(input.slug, { create: true });
          const tau = await directory.getDirectoryHandle('.tau', { create: true });
          const chats = await tau.getDirectoryHandle('chats', { create: true });
          const write = async (parent: FileSystemDirectoryHandle, name: string, text: string): Promise<void> => {
            const handle = await parent.getFileHandle(name, { create: true });
            const stream = await handle.createWritable();
            await stream.write(text);
            await stream.close();
          };
          await write(directory, 'tau.json', input.declaration);
          await write(directory, 'main.scad', 'sphere(9); // dirty browser work\n');
          await write(tau, 'project.json', input.identity);
          await write(chats, 'preserved.json', input.chat);
        },
        { slug, declaration, identity, chat },
      );
      await page.reload();
      await page.getByRole('link', { name: `Open ${name}`, exact: true }).waitFor();
      const nativeBefore = await nativeSnapshot(root);
      const browserBefore = await browserSnapshot(page, slug);
      await openDeletion(session.page, name);
      await session.page.getByRole('button', { name: 'Delete from Tau Cloud', exact: true }).click();
      await expect.poll(async () => state(id), { timeout: 30_000 }).toBe('deleted');
      await session.page.getByRole('alertdialog').waitFor({ state: 'detached' });
      expect(await nativeSnapshot(root)).toEqual(nativeBefore);
      await page.reload();
      await page.getByRole('link', { name: `Open ${name}`, exact: true }).waitFor();
      expect(await browserSnapshot(page, slug)).toEqual(browserBefore);
      await session.close();
      session = undefined;
      await context.close();
      context = undefined;
      session = await launchDesktopApp({
        token,
        profileRoot: profile,
        preserveProfile: true,
        preparedKernels: false,
        env: { TAU_DESKTOP_UPDATES: 'off' },
      });
      await session.page.goto('app://tau/projects');
      await session.page.getByRole('link', { name: `Open ${name}`, exact: true }).waitFor();
      expect(await nativeSnapshot(root)).toEqual(nativeBefore);
      context = await browser('browser-retained');
      page = context.pages()[0] ?? (await context.newPage());
      await page.goto(`${desktopE2EFrontendUrl}/projects`);
      await page.getByRole('link', { name: `Open ${name}`, exact: true }).waitFor();
      expect(await browserSnapshot(page, slug)).toEqual(browserBefore);
      // Duplicate is the product operation that deliberately creates a fresh identity.
      await page.getByRole('button', { name: `Actions for ${name}`, exact: true }).click();
      await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
      await page.getByText(`Duplicated ${name}`, { exact: true }).waitFor();
      const duplicateName = `${name} (Copy)`;
      const duplicateLink = page.getByRole('link', { name: `Open ${duplicateName}`, exact: true });
      await duplicateLink.waitFor();
      const duplicateHref = await duplicateLink.getAttribute('href');
      expect(duplicateHref).toBeTruthy();
      const duplicateSlug = decodeURIComponent(
        new URL(duplicateHref!, desktopE2EFrontendUrl).pathname.split('/').at(-1)!,
      );
      const duplicate = await browserSnapshot(page, duplicateSlug);
      const duplicateIdentity = JSON.parse(duplicate.identity) as { projectId: string };
      expect(duplicateIdentity.projectId).toMatch(/^proj_[A-Za-z0-9]{21}$/u);
      expect(duplicateIdentity.projectId).not.toBe(id);
      expect(duplicate.source).toBe(browserBefore.source);
      expect(await register(duplicateIdentity.projectId, duplicateName)).toBe(200);
      expect(await state(duplicateIdentity.projectId)).toBe('active');
      expect(await register(id, name)).toBe(410);

      // Local Trash is reversible without reopening the remote's permanently reserved ID.
      await session.page.getByRole('button', { name: `Actions for ${name}`, exact: true }).click();
      await session.page.getByRole('menuitem', { name: 'Move to Trash', exact: true }).click();
      await session.page.getByText(`Moved ${name} to Trash`, { exact: true }).waitFor();
      await session.page.goto('app://tau/projects?trash=1');
      await session.page.getByRole('button', { name: `Actions for ${name}`, exact: true }).click();
      await session.page.getByRole('menuitem', { name: 'Restore', exact: true }).click();
      await session.page.getByText(`Restored ${name}`, { exact: true }).waitFor();
      await session.page.goto('app://tau/projects');
      await session.page.getByRole('link', { name: `Open ${name}`, exact: true }).waitFor();
      expect(await nativeSnapshot(root)).toEqual(nativeBefore);
      expect(await state(id)).toBe('deleted');
      expect(await register(id, name)).toBe(410);
      await session.page.screenshot({ path: join(artifacts, 'retained-native.png'), fullPage: true });
      await session.close();
      session = undefined;
      const localSave = await cli(['revisions', 'save', '--project', root, '--json']);
      expect(localSave['status']).toBe('saved');
      expect(localSave['backup']).not.toBe('backedUp');
      expect(localSave['backup']).not.toBe('noRemote');
      expect(localSave['reason']).toMatch(/deleted|not found|410/iu);
      expect(await readFile(join(root, 'main.scad'), 'utf8')).toBe(nativeBefore['source']);
      expect(await git(root, ['remote', '-v'])).toBe(nativeBefore['remotes']);
      expect(await state(id)).toBe('deleted');
      await page.screenshot({ path: join(artifacts, 'retained-browser.png'), fullPage: true });

      await writeFile(
        join(artifacts, 'preservation.json'),
        JSON.stringify(
          { projectId: id, nativeBefore, browserBefore, duplicateId: duplicateIdentity.projectId, localSave },
          null,
          2,
        ),
      );
    } finally {
      await context?.close();
      await session?.close();
      // Keep every local project, browser profile, account, database and object namespace for inspection.
    }
  });
});
