/* oxlint-disable no-await-in-loop -- Each refusal class drives one client after another on purpose. */
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { localDatabaseName } from '@taucad/utils/worktree-database';
import { desktopE2EApiUrl, desktopE2EFreeTierSyncEnabled } from '#support/config.js';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import {
  backupByDefaultLine,
  connectTauCloud,
  openBackupChooser,
  revisionStatus,
  revisionStrip,
} from '#support/revisions-pane.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import { launchBrowserClient, openCloudOnlyProject, uploadFileInPage } from '#support/two-client/browser-client.js';
import type { BrowserClient } from '#support/two-client/browser-client.js';
import { routeGitRefusal } from '#support/two-client/git-faults.js';
import type { GitRefusal } from '#support/two-client/git-faults.js';
import {
  addProjectCollaborator,
  basicAuthorization,
  forgetSeededProjects,
  projectLfsBytes,
  mintOneTimeToken,
  readStorageUsage,
  runGit,
  seedProPlan,
  setProjectLfsBytes,
  spendProjectStorage,
  tauCloudOwnerIds,
} from '#support/two-client/tau-cloud.js';
import type { StorageUsage, TauCloudOwnerIds } from '#support/two-client/tau-cloud.js';
import { startUiServer } from '#support/two-client/ui-server.js';
import type { UiServer } from '#support/two-client/ui-server.js';

/**
 * What a refused sync looks like from the client (revisions-sync closeout W8,
 * Red-First rows 2–4; revisions policy rule 19).
 *
 * The server half — that the API *emits* each refusal — is `apps/api-e2e`'s.
 * This tier proves the client *renders* it: every refusal is injected on one
 * client's git wire with `#support/two-client/git-faults.js`, because a lapsed
 * plan cannot be seeded (`billing.protect_payment_identity`) and route bytes are
 * exactly what a lapsed or refusing server sends.
 */

const execFileAsync = promisify(execFile);

/** Count rows through the same `docker exec psql` channel the seeding helpers use. */
const countRows = async (statement: string): Promise<number> => {
  const { stdout } = await execFileAsync(
    'docker',
    [
      'exec',
      'tau-postgres',
      'psql',
      '-qtAX',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'dev_user',
      '-d',
      localDatabaseName(),
      '-c',
      statement,
    ],
    { encoding: 'utf8' },
  );
  return Number(stdout.trim());
};

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

type Seeded = { email: string; bearer: string; owner: TauCloudOwnerIds; client: BrowserClient };

let uiServer: UiServer | undefined;
let free: Seeded | undefined;
let pro: Seeded | undefined;

const seed = async (label: string, plan: 'free' | 'pro'): Promise<Seeded> => {
  const account = tauTestAccount(label);
  const bearer = await seedTauTestUser(account);
  const owner = await tauCloudOwnerIds(account.email);
  if (plan === 'pro') {
    await seedProPlan(owner);
  }
  const client = await launchBrowserClient({ oneTimeToken: await mintOneTimeToken(bearer) });
  return { email: account.email, bearer, owner, client };
};

const required = <T>(value: T | undefined): T => {
  if (value === undefined) {
    throw new Error('The suite did not seed its clients.');
  }
  return value;
};

/** Create a project through *New project* and return its OPFS project id. */
const createProject = async (client: BrowserClient, name: string): Promise<string> => {
  const { page } = client;
  await page.goto('/projects/new', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Project Name *').fill(name);
  await page
    .getByRole('button', { name: /^Create Project/u })
    .first()
    .click();
  await page.waitForURL(/\/w\/[^/]+\/[^/?]+/u, { timeout: 180_000 });
  const slug = decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1) ?? '');
  return page.evaluate(async (project: string) => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(project);
    const handle = await directory.getFileHandle('tau.json');
    const file = await handle.getFile();
    return (JSON.parse(await file.text()) as { readonly id: string }).id;
  }, slug);
};

type PageClient = Pick<BrowserClient, 'page'>;
type GitIn = (...args: readonly string[]) => ReturnType<typeof runGit>;

/** Open the Revisions pane through the header's own chip. */
const openRevisions = async (client: PageClient): Promise<void> => {
  await client.page
    .getByRole('button', { name: /^Open Revisions\./u })
    .first()
    .click({ timeout: 120_000 });
};

/** Open Revisions and its Sync region through the product's own offer. */
const openSync = async (client: PageClient): Promise<void> => {
  await openRevisions(client);
  await openBackupChooser(client.page);
};

const backupStatus = (client: PageClient) => client.page.getByRole('status', { name: 'Backup status' }).first();

const backupText = async (client: PageClient): Promise<string> =>
  // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- Playwright's locator method keeps rendered line breaks.
  (await backupStatus(client).count()) === 0 ? '' : backupStatus(client).innerText();

/** Connect Tau Cloud with no fault and wait for the first backup to land. */
const connectAndBackUp = async (client: BrowserClient, name: string): Promise<string> => {
  const projectId = await createProject(client, name);
  await openSync(client);
  await connectTauCloud(client.page);
  await expect.poll(async () => backupText(client), { timeout: 180_000 }).toMatch(/Backed up/u);
  return projectId;
};

/** Make the tree differ from head and mint, so the scheduler owes a push. */
const mintRevision = async (client: BrowserClient, filename: string): Promise<void> => {
  const { page } = client;
  await page.keyboard.press('Control+KeyF');
  await page.getByRole('button', { name: 'Create new file' }).first().click({ timeout: 120_000 });
  await page.getByRole('menuitem', { name: 'Blank' }).first().click();
  const pending = page.getByPlaceholder('New File').first();
  await pending.fill(filename);
  await pending.press('Enter');
  await page
    .getByRole('treeitem', { name: new RegExp(filename, 'u') })
    .first()
    .waitFor({ timeout: 60_000 });
  await page
    .getByRole('button', { name: /^Open Revisions\./u })
    .first()
    .click();
  await page.keyboard.press(`${modifier}+KeyS`);
};

/** Wait for the refusal's sentence, then read the actions the row offers. */
const refusedRow = async (client: PageClient, sentence: string, name: string): Promise<readonly string[]> => {
  await expect
    .poll(async () => backupText(client), {
      message: `${name}: the server's sentence must reach the Sync row`,
      timeout: 180_000,
    })
    .toContain(sentence);
  const status = backupStatus(client);
  const buttons = await status.getByRole('button').allInnerTexts();
  const links = await status.getByRole('link').allInnerTexts();
  return [...buttons, ...links].map((text) => text.trim());
};

beforeAll(async () => {
  uiServer = await startUiServer();
  free = await seed('sync-free', 'free');
  pro = await seed('sync-pro', 'pro');
}, 900_000);

afterAll(async () => {
  for (const seeded of [free, pro]) {
    if (seeded !== undefined) {
      await seeded.client.close();
      await forgetSeededProjects(seeded.owner);
      await deleteTauTestUser(seeded.email);
    }
  }
  await uiServer?.close();
}, 900_000);

afterEach(async ({ task }) => {
  if (task.result?.state === 'fail') {
    const label = task.name.replaceAll(/[^a-zA-Z0-9]+/gu, '-');
    await Promise.allSettled([
      free?.client.capture(`sync-refusals-free-${label}`),
      pro?.client.capture(`sync-refusals-pro-${label}`),
    ]);
  }
}, 120_000);

describe.skipIf(desktopE2EFreeTierSyncEnabled)('a free-tier owner', () => {
  /* Row 2 (C5, C11, N5): the plan gate is the client's, and nothing may be
   * registered before the plan admits it — so the table is asserted, not only
   * the pane. */
  it('should offer Available on Pro instead of connecting, and leave no project row behind', async () => {
    const { client, owner } = required(free);
    const registrations: string[] = [];
    client.page.on('request', (request) => {
      if (request.method() === 'PUT' && request.url().includes('/v1/projects/')) {
        registrations.push(request.url());
      }
    });
    const ownedRows = `SELECT count(*) FROM project WHERE owner_id = '${owner.userId}';`;
    const before = await countRows(ownedRows);

    const projectId = await createProject(client, 'W8 Free Tier');
    await openSync(client);
    const region = client.page.getByRole('region', { name: 'Sync' }).first();
    await expect.poll(async () => region.getByRole('radio', { name: 'Tau Cloud' }).isDisabled()).toBe(true);
    await expect.poll(async () => region.getByRole('button', { name: /Available on Pro/u }).count()).toBeGreaterThan(0);
    /* The gesture a person would try anyway: a disabled radio must not connect. */
    await region.getByRole('radio', { name: 'Tau Cloud' }).click({ force: true });
    await expect.poll(async () => region.getByRole('button', { name: 'Connect backup' }).isDisabled()).toBe(true);

    expect(registrations, 'N5: a free owner must never issue PUT /v1/projects').toEqual([]);
    expect(await countRows(ownedRows)).toBe(before);
    expect(await countRows(`SELECT count(*) FROM project WHERE id = '${projectId}';`)).toBe(0);
  }, 900_000);

  /* W11 row 5 (D19 under D23): backup by default follows the entitlement, so a
   * Free account with the gate closed is offered no line, keeps its first
   * revision on this device, and registers nothing. */
  it('should keep a new project on this device, with no backup line and no registration', async () => {
    const { client } = required(free);
    const registrations: string[] = [];
    client.page.on('request', (request) => {
      if (['POST', 'PUT'].includes(request.method()) && request.url().includes('/v1/projects/')) {
        registrations.push(request.url());
      }
    });
    const projectId = await createProject(client, 'W11 Free Local');
    await openRevisions(client);
    await client.page.keyboard.press(`${modifier}+KeyS`);
    await expect
      .poll(async () => revisionStatus(client.page).textContent(), { timeout: 120_000 })
      .toBe('Saved on this device');
    /* The intent is forgotten once the plan answers, so nothing is left to connect later. */
    await expect
      .poll(async () => client.page.evaluate((id) => localStorage.getItem(`tau:tau-cloud-intent:${id}`), projectId))
      .toBeNull();
    expect(await backupByDefaultLine(client.page).count(), 'D19: no line for an account the gate refuses').toBe(0);
    expect(registrations, 'D19/D23: a free owner must never register a project').toEqual([]);
    expect(await countRows(`SELECT count(*) FROM project WHERE id = '${projectId}';`)).toBe(0);
  }, 900_000);
});

describe.skipIf(desktopE2EFreeTierSyncEnabled)('a Pro owner whose pushes are refused', () => {
  /* Row 3 (C1, C4; rule 19): each class renders the server's own sentence
   * with its one action. The browser receives the JSON envelope (N6: Playwright
   * sends `Origin`), whose sentence is in `error`. Every sentence below differs
   * from the class's generic copy in `remotes.ts` `refusalSentence`, so a pass
   * proves the server's words reached the row. The refusal is fulfilled on
   * every git route, so the first request refused is the `GET info/refs`
   * advertisement, whose body isomorphic-git keeps. */
  const refusals: ReadonlyArray<Readonly<{ name: string; refusal: GitRefusal; action: RegExp }>> = [
    {
      name: '401',
      refusal: { status: 401, message: 'Your Tau session ended on this device (W8 401).' },
      action: /^Sign in$/u,
    },
    {
      name: '403 not entitled',
      refusal: {
        status: 403,
        code: 'GIT_SYNC_NOT_ENTITLED',
        message: 'Your Pro plan has lapsed, so syncing is paused (W8 403).',
      },
      action: /Upgrade/u,
    },
    {
      name: '403 forbidden',
      refusal: { status: 403, message: 'This account may not write to that project (W8 403F).' },
      action: /^Retry$/u,
    },
    {
      name: '404',
      refusal: { status: 404, code: 'GIT_REPOSITORY_NOT_FOUND', message: 'No Tau Cloud project here (W8 404).' },
      action: /^Retry$/u,
    },
    {
      name: '413',
      refusal: {
        status: 413,
        code: 'GIT_QUOTA_EXCEEDED',
        message: 'Storage quota reached: 11 of 10 bytes used (W8 413).',
      },
      action: /Upgrade/u,
    },
    /* Audit §7.2 item 4: both classes were proven in units and on the server
     * (`git.http.integration.test.ts`, `fault-injection.spec.ts`) and never
     * rendered. A 422 is the remote refusing the refs, not the device, so its
     * verb is *Sync now*; a 503 is the retryable busy class, so it is *Retry*
     * (`remotes.ts` classification, `revision-sync-region.tsx` actions). */
    {
      name: '422',
      refusal: { status: 422, message: 'The pushed refs failed the remote connectivity check (W3 422).' },
      action: /^Sync now$/u,
    },
    {
      name: '503',
      refusal: { status: 503, message: 'Tau Cloud storage is busy right now (W3 503).' },
      action: /^Retry$/u,
    },
  ];

  it.each(refusals)(
    'should name a $name server refusal as its own reason in the Sync row',
    async ({ name, refusal, action }) => {
      const { client } = required(pro);
      await connectAndBackUp(client, `W8 Refusal ${name}`);
      const fault = await routeGitRefusal(client, refusal);
      try {
        await mintRevision(client, 'refused.scad');
        const actions = await refusedRow(client, refusal.message ?? '', name);
        expect(actions, `${name}: exactly one action for the class`).toHaveLength(1);
        expect(actions[0], `${name}: the action must match the class`).toMatch(action);
        expect(await backupText(client)).not.toMatch(/could not be reached/u);
        expect(
          fault.requestsMatching('info/refs').length,
          `${name}: the advertisement must be the refused call`,
        ).toBeGreaterThan(0);
      } finally {
        await fault.remove();
      }
    },
    900_000,
  );

  /* Was a red pin on isomorphic-git 1.38.5's POST path, which dropped the body
   * (`index.js:9169`). The browser port now sends its own receive-pack POST and
   * hands a non-200 to the classifier with its body (5436b5df8), so the row
   * asserts the server's own words. */
  it('should name a refusal served on the git-receive-pack POST in its own words', async () => {
    const { client } = required(pro);
    await connectAndBackUp(client, 'W8 Refusal POST');
    const sentence = 'Storage quota reached on the pack upload (W8 POST 413).';
    const fault = await routeGitRefusal(
      client,
      { status: 413, code: 'GIT_QUOTA_EXCEEDED', message: sentence },
      '**/git-receive-pack',
    );
    try {
      await mintRevision(client, 'refused-post.scad');
      await expect.poll(() => fault.requests().length, { timeout: 180_000 }).toBeGreaterThan(0);
      /* Settled on a quota reason first, so the pin fails only on whose words they are. */
      await expect
        .poll(async () => backupText(client), { timeout: 60_000 })
        .toMatch(/over its storage plan|W8 POST 413/u);
      console.info(`[sync-refusals] POST-path row: ${JSON.stringify(await backupText(client))}`);
      expect(await backupText(client)).toContain(sentence);
    } finally {
      await fault.remove();
    }
  }, 900_000);

  /* Row 4 (C3b): a lapse mid-sync names its reason with *Upgrade*, and the
   * refused git calls then stop — measured node-side as a plateau longer than
   * the first backoff steps (5 s, 10 s, 20 s); a retrying client keeps growing
   * inside the same window. */
  it('should stop retrying and say why when the plan lapses mid-sync', async () => {
    const { client } = required(pro);
    await connectAndBackUp(client, 'W8 Lapse');
    const fault = await routeGitRefusal(client, {
      status: 403,
      code: 'GIT_SYNC_NOT_ENTITLED',
      message: 'Your Pro plan lapsed during this sync (W8 lapse).',
    });
    try {
      await mintRevision(client, 'lapsed.scad');
      await expect
        .poll(async () => backupText(client), { timeout: 180_000 })
        .toContain('Your Pro plan lapsed during this sync (W8 lapse).');
      await expect
        .poll(async () =>
          backupStatus(client)
            .getByRole('button', { name: /Upgrade/u })
            .count(),
        )
        .toBe(1);

      const calls = (): string =>
        `${String(fault.requests().length)} git / ${String(fault.requestsMatching('git-receive-pack').length)} receive-pack`;
      const plateauMilliseconds = 25_000;
      let seen = calls();
      let stableSince = Date.now();
      const plateaued = await expect
        .poll(
          () => {
            if (calls() !== seen) {
              seen = calls();
              stableSince = Date.now();
            }
            return Date.now() - stableSince;
          },
          { interval: 1000, timeout: 50_000 },
        )
        .toBeGreaterThanOrEqual(plateauMilliseconds)
        .then(
          () => true,
          () => false,
        );
      console.info(`[sync-refusals] lapse: plateaued=${String(plateaued)} after ${calls()}`);
      expect(plateaued, `C3b: refused git calls kept growing (${calls()})`).toBe(true);
      expect(
        fault.requestsMatching('git-receive-pack').length,
        'C3b: one refused push, not a loop',
      ).toBeLessThanOrEqual(2);
      expect(await backupText(client)).not.toMatch(/Checking…/u);
    } finally {
      await fault.remove();
    }
  }, 900_000);
});

/* D14 (charter W6): a decision travels only on `refs/heads/conflicts/`. The
 * hook refuses a conflicted revision anywhere else with a sentence a person can
 * act on, and the name `conflicts` is kept for those lines. */
describe.skipIf(desktopE2EFreeTierSyncEnabled)('a Pro owner and a decision that travels (D14)', () => {
  it('should refuse a conflicted revision pushed to main, in words, and admit it on a conflict line', async () => {
    const { client, bearer } = required(pro);
    const projectId = await connectAndBackUp(client, 'W6 Conflicted Push');
    const peer = await mkdtemp(join(tmpdir(), 'tau-w6-conflicted-push-'));
    try {
      const authorization = `http.extraHeader=Authorization: ${basicAuthorization(bearer)}`;
      const git = async (...args: readonly string[]) => runGit(['-c', authorization, ...args], peer);
      const output = async (...args: readonly string[]): Promise<string> => {
        const { stdout } = await git(...args);
        return stdout.trim();
      };
      const cloned = await git('clone', '--quiet', `${desktopE2EApiUrl}/v1/git/${projectId}.git`, '.');
      expect(cloned.code, cloned.stderr).toBe(0);
      const head = await output('rev-parse', 'HEAD');
      const tree = await output('rev-parse', 'HEAD^{tree}');
      /* A commit object as Tau writes a conflicted revision: its terms in `jj:trees`. */
      const body = [
        `tree ${tree}`,
        `parent ${head}`,
        'author W6 <w6@tau.invalid> 1790000000 +0000',
        'committer W6 <w6@tau.invalid> 1790000000 +0000',
        `jj:trees ${tree} ${tree} ${tree}`,
        '',
        'Needs your decision',
        '',
      ].join('\n');
      const file = join(peer, '.git', 'conflicted-commit');
      await writeFile(file, body, 'utf8');
      const conflicted = await output('hash-object', '-t', 'commit', '-w', '--literally', file);

      const onMain = await git('push', 'origin', `${conflicted}:refs/heads/main`);
      expect(onMain.code, 'D14: a conflicted revision on main must be refused').not.toBe(0);
      expect(onMain.stderr).toContain('it carries a revision that still needs your decision');

      const onLine = await git('push', 'origin', `${conflicted}:refs/heads/conflicts/main/w6-peer`);
      expect(onLine.code, onLine.stderr).toBe(0);
    } finally {
      await rm(peer, { recursive: true, force: true });
    }
  }, 900_000);

  it('should refuse a branch named conflicts at creation, and say why', async () => {
    const { client } = required(pro);
    await createProject(client, 'W6 Reserved Name');
    const { page } = client;
    /* *New branch* is offered from a revision: record one first. A fresh
     * project opens with Files already showing, where the Files chord closes it;
     * Revisions first leaves the chord to open Files, as it does after a connect. */
    await page
      .getByRole('button', { name: /^Open Revisions\./u })
      .first()
      .click({ timeout: 120_000 });
    await mintRevision(client, 'reserved.scad');
    await page.getByRole('button', { name: 'New branch', exact: true }).first().click({ timeout: 120_000 });
    await page.getByLabel('Name for the new branch').fill('conflicts');
    await page.getByRole('button', { name: 'Create branch', exact: true }).click();

    await expect
      .poll(async () => page.getByText(/is kept for decisions that travel between devices/u).count(), {
        timeout: 60_000,
      })
      .toBeGreaterThan(0);
    expect(await page.getByRole('list', { name: 'Branches' }).getByText('conflicts', { exact: true }).count()).toBe(0);
  }, 900_000);
});

/*
 * W8's rows with charter D23's free-tier sync gate open (D16, D17, D18). They
 * run only in the target's second pass, whose API boots with
 * `TAU_FREE_TIER_SYNC_ENABLED=true`; every describe above runs only in the
 * first, so `a free-tier owner` still sees the gate closed.
 *
 * Not here: W8's self-host row (`… of 10 GB`, no plan action). It needs a
 * self-host UI build and an API with `TAU_CLOUD_ENABLED=false`, and this tier's
 * build and API are the cloud variant by design (see `test:e2e:two-client`).
 */
describe.runIf(desktopE2EFreeTierSyncEnabled)('a free-tier owner with the free-sync gate open (W8)', () => {
  const ownerSentence = 'This push needs more room than your 1 GB storage plan has left, so it was not backed up.';
  const figure = /\bof 1 GB\b/u;
  const allowanceName = 'W8 Free Allowance';
  let desktop: DesktopSession | undefined;
  let collaborator: Seeded | undefined;
  let allowanceProjectId = '';
  let desktopRoot = '';

  const regionText = async (client: PageClient): Promise<string> =>
    // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- Playwright's locator method keeps rendered line breaks.
    client.page.getByRole('region', { name: 'Sync' }).filter({ visible: true }).first().innerText();

  /** A stock-git clone of the project as the owner, for pushes a client would not make. */
  const clonePeer = async (projectId: string, label: string): Promise<Readonly<{ directory: string; git: GitIn }>> => {
    const directory = await mkdtemp(join(tmpdir(), `tau-w8-${label}-`));
    const authorization = `http.extraHeader=Authorization: ${basicAuthorization(required(free).bearer)}`;
    const git: GitIn = async (...args) => runGit(['-c', authorization, ...args], directory);
    const cloned = await git('clone', '--quiet', `${desktopE2EApiUrl}/v1/git/${projectId}.git`, '.');
    expect(cloned.code, cloned.stderr).toBe(0);
    for (const [key, value] of [
      ['user.email', 'w8@example.test'],
      ['user.name', 'W8'],
    ] as const) {
      await git('config', key, value);
    }
    return { directory, git };
  };

  /**
   * Leave `remaining` bytes of the owner's allowance, charged to one project's
   * LFS figure. The quota is account-wide (D16), so the other projects' bytes —
   * including a refused push that a later retry lands — count too.
   */
  const leaveAccountHeadroom = async (projectId: string, remaining: number): Promise<void> => {
    const { usage } = await readStorageUsage(projectId, required(free).bearer);
    const figures = required(usage);
    const others = figures.storageBytes + figures.lfsBytes - (await projectLfsBytes(projectId));
    await setProjectLfsBytes(projectId, Math.max(0, figures.storageLimitBytes - others - remaining));
  };

  /** Incompressible text, so a pack is as large as the file (base64 of random bytes). */
  const incompressible = (bytes: number): string => randomBytes(bytes).toString('base64');

  beforeAll(async () => {
    desktop = await launchDesktopApp({ token: required(free).bearer });
    collaborator = await seed('sync-collaborator', 'free');
  }, 900_000);

  afterAll(async () => {
    await desktop?.close();
    if (collaborator !== undefined) {
      await collaborator.client.close();
      await deleteTauTestUser(collaborator.email);
    }
  }, 900_000);

  afterEach(async ({ task }) => {
    if (task.result?.state === 'fail') {
      const label = task.name.replaceAll(/[^a-zA-Z0-9]+/gu, '-');
      await Promise.allSettled([
        desktop?.capture(`sync-refusals-desktop-${label}`),
        collaborator?.client.capture(`sync-refusals-collaborator-${label}`),
      ]);
    }
  }, 120_000);

  /* Row 1 (D16, D18). D19 now connects a new project by itself once the plan
   * allows it, so the chooser is reached the way a person keeps a project
   * local first: *Turn off backup* on the line D19 shows, then *Back up*. */
  it('should include 1 GB of Tau Cloud, connect, and read the figure on both clients after a reopen', async () => {
    const { client } = required(free);
    const b = required(desktop);
    allowanceProjectId = await createProject(client, allowanceName);
    await openRevisions(client);
    const line = backupByDefaultLine(client.page);
    await line.getByRole('button', { name: 'Turn off backup', exact: true }).click({ timeout: 120_000 });
    await line.waitFor({ state: 'hidden', timeout: 60_000 });

    await openBackupChooser(client.page);
    const region = client.page.getByRole('region', { name: 'Sync' }).filter({ visible: true }).first();
    const choice = region.getByRole('radio', { name: 'Tau Cloud' });
    await expect.poll(async () => choice.isEnabled(), { timeout: 60_000 }).toBe(true);
    expect(await regionText(client), 'D16: the chooser says what Free includes').toContain('1 GB included');
    await choice.click();
    await region.getByRole('button', { name: 'Connect backup', exact: true }).click();
    await expect.poll(async () => backupText(client), { timeout: 180_000 }).toMatch(/Backed up/u);
    await expect.poll(async () => regionText(client), { message: 'D18: x of 1 GB', timeout: 120_000 }).toMatch(figure);

    await client.page.reload({ waitUntil: 'domcontentloaded' });
    await openSync(client);
    await expect
      .poll(async () => regionText(client), { message: 'D18: the figure after a reopen', timeout: 120_000 })
      .toMatch(figure);

    const slug = await openCloudOnlyProject(b.page, {
      projectsUrl: 'app://tau/projects',
      name: allowanceName,
      message: 'W8 row 1 desktop',
    });
    desktopRoot = join(b.homeRoot, slug);
    await openSync(b);
    await expect
      .poll(async () => regionText(b), { message: 'D18: the desktop reads the figure', timeout: 180_000 })
      .toMatch(figure);
    await b.page.reload({ waitUntil: 'domcontentloaded' });
    await openSync(b);
    await expect
      .poll(async () => regionText(b), { message: 'D18: the desktop figure after a reopen', timeout: 180_000 })
      .toMatch(figure);
  }, 900_000);

  /* Row 4 (D17, L6-F2): a pack over the allowance meets the pre-receive hook,
   * whose refusal stock git prints and the desktop's native push files as quota. */
  it('should refuse a non-LFS push over the allowance on the wire and on the desktop as quota', async () => {
    const b = required(desktop);
    expect(allowanceProjectId, 'row 1 must have connected the project').not.toBe('');
    await leaveAccountHeadroom(allowanceProjectId, 128 * 1024);
    const peer = await clonePeer(allowanceProjectId, 'hook');
    try {
      await writeFile(join(peer.directory, 'big.scad'), `// ${incompressible(384 * 1024)}\n`, 'utf8');
      await peer.git('add', 'big.scad');
      await peer.git('commit', '--quiet', '-m', 'Over the allowance');
      const pushed = await peer.git('push', 'origin', 'HEAD:main');
      expect(pushed.code, 'D17: the hook must refuse the pack').not.toBe(0);
      expect(pushed.stderr).toContain('Tau: storage quota exceeded');
      expect(pushed.stderr).toContain(ownerSentence);
      expect(pushed.stderr).toContain('the largest files it adds are:');
      expect(pushed.stderr).toContain('big.scad');

      await writeFile(join(desktopRoot, 'desktop-big.scad'), `// ${incompressible(384 * 1024)}\n`, 'utf8');
      await openRevisions(b);
      await b.page.keyboard.press(`${modifier}+KeyS`);
      const actions = await refusedRow(b, ownerSentence, 'W8 row 4 desktop');
      /* ponytail: this tier's desktop UI is the self-host build (ui:build:desktop
       * without TAU_CLOUD_ENABLED, so canUpgradePlan is false) and offers no
       * Upgrade; row 2 proves Upgrade on the cloud web build. Filed as quota
       * here means no retry verb and the strip's quota ask. */
      expect(actions, 'D17: filed as quota, so no Sync now or Retry').toEqual([]);
      await expect
        .poll(async () => revisionStrip(b.page).textContent(), { timeout: 30_000 })
        .toContain('Over your plan');
    } finally {
      await spendProjectStorage(allowanceProjectId, 0);
      await rm(peer.directory, { recursive: true, force: true });
    }
  }, 900_000);

  /* Row 2 (D17): the LFS batch refusal names the allowance to its owner, lists
   * the file, and offers the one plan action, on the row and on the strip. */
  it('should refuse an over-allowance push to its owner with the file named and Upgrade alone', async () => {
    const { client } = required(free);
    const projectId = await connectAndBackUp(client, 'W8 Free Over Allowance');
    /* Room for the revision's pack and trailing chat refs, never for the file
     * (the Pro row's reasoning; the quota is account-wide). */
    await leaveAccountHeadroom(projectId, 512 * 1024);
    try {
      await uploadFileInPage(client.page, 'over-allowance.step', Buffer.alloc(1024 * 1024 + 1, 1));
      await openRevisions(client);
      await client.page.keyboard.press(`${modifier}+KeyS`);
      const actions = await refusedRow(client, ownerSentence, 'W8 row 2');
      expect(actions, 'D17: the owner gets exactly one action').toHaveLength(1);
      expect(actions[0]).toMatch(/Upgrade/u);
      const listed = await regionText(client);
      expect(listed).toContain('These files are over your plan and were not backed up:');
      expect(listed).toContain('over-allowance.step');
      const strip = revisionStrip(client.page);
      expect(await strip.getByRole('button', { name: /Upgrade/u }).count(), 'D17: the strip offers Upgrade').toBe(1);
      expect(await strip.getByRole('button', { name: 'Sync now', exact: true }).count()).toBe(0);
    } finally {
      await spendProjectStorage(projectId, 0);
    }
  }, 900_000);

  /* Row 3 (D17, D18): a write collaborator's push draws on the owner's plan, so
   * the sentence points at the owner, no plan action is offered, and the owner's
   * figures are not theirs to read. */
  it('should tell a write collaborator to ask the owner, with no plan action and no figure', async () => {
    const owner = required(free);
    const guest = required(collaborator);
    const name = 'W8 Free Shared';
    const projectId = await connectAndBackUp(owner.client, name);
    await addProjectCollaborator({ projectId, collaborator: guest.owner, role: 'write', invitedBy: owner.owner });
    await openCloudOnlyProject(guest.client.page, { projectsUrl: '/projects', name, message: 'W8 row 3' });
    await openSync(guest.client);
    await expect.poll(async () => backupText(guest.client), { timeout: 180_000 }).toMatch(/Backed up/u);

    await leaveAccountHeadroom(projectId, 512 * 1024);
    try {
      await uploadFileInPage(guest.client.page, 'shared-over.step', Buffer.alloc(1024 * 1024 + 1, 1));
      await openRevisions(guest.client);
      await guest.client.page.keyboard.press(`${modifier}+KeyS`);
      const actions = await refusedRow(
        guest.client,
        "This push needs more room than the project owner's storage plan has left, so it was not backed up. Ask the owner to make room.",
        'W8 row 3',
      );
      expect(
        actions.filter((action) => /Upgrade/u.test(action)),
        'D17: no plan action for a collaborator',
      ).toEqual([]);
      const listed = await regionText(guest.client);
      expect(listed).toContain('These files did not fit in the project owner’s plan and were not backed up:');
      expect(listed).toContain('shared-over.step');
      expect(listed, 'D18: a collaborator draws no figure').not.toMatch(figure);
      expect(
        await revisionStrip(guest.client.page)
          .getByRole('button', { name: /Upgrade/u })
          .count(),
      ).toBe(0);
      const guestUsage = await readStorageUsage(projectId, guest.bearer);
      expect(guestUsage.status, 'D18: usage is the owner’s').toBe(403);
    } finally {
      await spendProjectStorage(projectId, 0);
    }
  }, 900_000);

  /* Row 6 (D18, L6-F5): the ninth live pack makes the committer compact; the
   * packs it retires stay inside the retention window and are reported beside
   * the charged figure, never in it. */
  it('should show packs a compaction retired beside the figure, never inside it', async () => {
    const { client, bearer } = required(free);
    const projectId = await connectAndBackUp(client, 'W8 Free Retained');
    const peer = await clonePeer(projectId, 'retained');
    const usage = async (): Promise<StorageUsage | undefined> => {
      const answer = await readStorageUsage(projectId, bearer);
      return answer.usage;
    };
    try {
      let before: StorageUsage | undefined;
      let after: StorageUsage | undefined;
      /* The usage route is budgeted per caller (30 a minute, shared with the
       * clients' own reads), so a refused read is simply read again later. */
      const observe = async (): Promise<Readonly<{ before?: StorageUsage; after?: StorageUsage }>> => {
        const read = await usage();
        return read === undefined ? {} : read.retainedBytes > 0 ? { after: read } : { before: read };
      };
      /* One pack per push; the bound is eight live packs (`livePackBound`), and
       * the browser's own backup already holds some, so twelve always crosses it. */
      for (let push = 1; push <= 12 && after === undefined; push += 1) {
        await writeFile(join(peer.directory, `pack-${String(push)}.scad`), `// ${incompressible(4096)}\n`, 'utf8');
        await peer.git('add', '.');
        await peer.git('commit', '--quiet', '-m', `Pack ${String(push)}`);
        const pushed = await peer.git('push', 'origin', 'HEAD:main');
        expect(pushed.code, pushed.stderr).toBe(0);
        if (push >= 5) {
          /* The sweep runs after the reply, off the request path. */
          await delay(3000);
          const seen = await observe();
          before = seen.before ?? before;
          after = seen.after;
        }
      }
      for (let waited = 0; after === undefined && waited < 90_000; waited += 5000) {
        await delay(5000);
        const seen = await observe();
        before = seen.before ?? before;
        after = seen.after;
      }
      if (after === undefined || before === undefined) {
        throw new Error(
          `D18: no compaction was observed (before ${JSON.stringify(before)}, after ${JSON.stringify(after)}).`,
        );
      }
      const retained: StorageUsage = after;
      const charged: StorageUsage = before;
      /* Retired packs counted as live would add their bytes to `storageBytes` on
       * top of the new pack; kept apart, the charged figure only moves by that pack. */
      expect(retained.storageBytes, 'D18: retained bytes are never charged').toBeLessThan(
        charged.storageBytes + retained.retainedBytes,
      );

      await client.page.reload({ waitUntil: 'domcontentloaded' });
      await openSync(client);
      await expect
        .poll(async () => regionText(client), { message: 'D18: the retained column after a reopen', timeout: 120_000 })
        .toMatch(/of 1 GB[\s\S]*kept for recovery, not counted/u);
    } finally {
      await rm(peer.directory, { recursive: true, force: true });
    }
  }, 900_000);
});
