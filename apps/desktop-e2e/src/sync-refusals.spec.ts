/* oxlint-disable no-await-in-loop -- Each refusal class drives one client after another on purpose. */
import { execFile } from 'node:child_process';
import process from 'node:process';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { desktopE2EDatabaseName } from '#support/config.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import { launchBrowserClient } from '#support/two-client/browser-client.js';
import type { BrowserClient } from '#support/two-client/browser-client.js';
import { routeGitHookRefusal, routeGitRefusal } from '#support/two-client/git-faults.js';
import type { GitRefusal } from '#support/two-client/git-faults.js';
import {
  forgetSeededProjects,
  mintOneTimeToken,
  seedProPlan,
  tauCloudOwnerIds,
} from '#support/two-client/tau-cloud.js';
import type { TauCloudOwnerIds } from '#support/two-client/tau-cloud.js';
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
      desktopE2EDatabaseName,
      '-c',
      statement,
    ],
    { encoding: 'utf8' },
  );
  return Number(stdout.trim());
};

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

type Seeded = { email: string; owner: TauCloudOwnerIds; client: BrowserClient };

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
  return { email: account.email, owner, client };
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

/** Open Revisions and its Sync region through the product's own offer. */
const openSync = async (client: BrowserClient): Promise<void> => {
  const { page } = client;
  await page
    .getByRole('button', { name: /^Open Revisions\./u })
    .first()
    .click({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Connect Tau Cloud', exact: true }).first().click({ timeout: 120_000 });
  await page.getByRole('region', { name: 'Sync' }).first().waitFor({ state: 'visible', timeout: 60_000 });
};

const backupStatus = (client: BrowserClient) => client.page.getByRole('status', { name: 'Backup status' }).first();

const backupText = async (client: BrowserClient): Promise<string> =>
  // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- Playwright's locator method keeps rendered line breaks.
  (await backupStatus(client).count()) === 0 ? '' : backupStatus(client).innerText();

/** Connect Tau Cloud with no fault and wait for the first backup to land. */
const connectAndBackUp = async (client: BrowserClient, name: string): Promise<void> => {
  await createProject(client, name);
  await openSync(client);
  await client.page.getByRole('radio', { name: 'Tau Cloud' }).first().click();
  await client.page.getByRole('button', { name: 'Connect backup', exact: true }).first().click();
  await expect.poll(async () => backupText(client), { timeout: 180_000 }).toMatch(/Backed up/u);
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

describe('a free-tier owner', () => {
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
});

describe('a Pro owner whose pushes are refused', () => {
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
  ];

  /** Wait for the refusal's sentence, then read the actions the row offers. */
  const refusedRow = async (client: BrowserClient, sentence: string, name: string): Promise<readonly string[]> => {
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

  /* Red pin (upstream): isomorphic-git 1.38.5 does not await `stringifyBody` on
   * its POST path (`index.js:9169`), so a refusal served on the
   * `git-receive-pack` POST reaches the classifier with no body and the row
   * shows the generic class sentence. Remove `.fails` when the dependency
   * awaits it. */
  it.fails('should name a refusal served on the git-receive-pack POST in its own words', async () => {
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

/**
 * The three browser-leg answers the git storage substrate charter's W10 owes
 * (items 3): a retryable 503, a terminal 410, and D20's ceiling refusal.
 *
 * All three are the *client's* behaviour, which is why they are here and not in
 * `apps/api-e2e`: what W10 has to show is that the sync machine retries the
 * first, stops on the second, and lands in `quota` with the server's own
 * sentence on the third.
 */
describe("a Pro owner meeting the hosted remote's own three answers (W10 item 3)", () => {
  it('should retry a lost race answered 503 and end up backed up', async () => {
    const { client } = required(pro);
    await connectAndBackUp(client, 'W10 Race 503');
    /* `GIT_PUSH_RACE_LOST` is D4's answer to a lost conditional write, and Rule
     * 19 files it as retryable with no user-facing class: the row must not
     * settle on a refusal, it must settle on Backed up. */
    const fault = await routeGitRefusal(
      client,
      {
        status: 503,
        code: 'GIT_PUSH_RACE_LOST',
        message: 'Another writer committed first; retry this push.',
      },
      '**/git-receive-pack',
    );
    await mintRevision(client, 'raced.scad');
    await expect.poll(() => fault.requestsMatching('git-receive-pack').length, { timeout: 180_000 }).toBeGreaterThan(0);
    /* The store is "available" again, which is what the client's own retry
     * then meets. */
    await fault.remove();
    await expect.poll(async () => backupText(client), { timeout: 180_000 }).toMatch(/Backed up/u);
    console.info(
      `[sync-refusals] 503: backed up after ${String(fault.requestsMatching('git-receive-pack').length)} refused pushes`,
    );
  }, 900_000);

  it('should stop on a 410 and name the project as gone', async () => {
    const { client } = required(pro);
    await connectAndBackUp(client, 'W10 Tombstone 410');
    const sentence = 'This Tau Cloud project was deleted (W10 410).';
    const fault = await routeGitRefusal(client, {
      status: 410,
      code: 'GIT_REPOSITORY_DELETED',
      message: sentence,
    });
    try {
      await mintRevision(client, 'tombstoned.scad');
      await expect.poll(async () => backupText(client), { timeout: 180_000 }).toContain(sentence);

      /* Rule 19: `REMOTE_NOT_FOUND` is terminal — the machine enters `failed`
       * and stops, which is observable as the refused calls plateauing. */
      const calls = (): number => fault.requests().length;
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
        .toBeGreaterThanOrEqual(25_000)
        .then(
          () => true,
          () => false,
        );
      console.info(`[sync-refusals] 410: plateaued=${String(plateaued)} after ${String(calls())} git calls`);
      expect(plateaued, 'a 410 is terminal: the sync machine must stop').toBe(true);
    } finally {
      await fault.remove();
    }
  }, 900_000);

  /* The hook's own bytes: the fixed marker `remotes.ts` classifies on, the
   * sentence, and the ten-largest-files list D20 asks for. */
  const ceilingReason =
    'Tau: repository size limit exceeded (1.2 GiB of 1 GiB). Remove large files and push again. ' +
    'Largest files: assembly.step 412 MiB | frame.step 311 MiB | housing.step 208 MiB';

  it("should render D20's ceiling refusal in the hook's own words, file list and all", async () => {
    const { client } = required(pro);
    await connectAndBackUp(client, 'W10 Ceiling Words');
    const fault = await routeGitHookRefusal(client, ceilingReason);
    try {
      await mintRevision(client, 'over-ceiling.scad');
      await expect
        .poll(() => fault.requestsMatching('git-receive-pack').length, { timeout: 180_000 })
        .toBeGreaterThan(0);
      await expect
        .poll(async () => backupText(client), { timeout: 180_000 })
        .toMatch(/repository size limit exceeded/u);
      const rendered = await backupText(client);
      console.info(`[sync-refusals] ceiling row: ${JSON.stringify(rendered)}`);
      expect(rendered, "the hook's own file list must be on the row").toContain('assembly.step');
    } finally {
      await fault.remove();
    }
  }, 900_000);

  /**
   * W10 defect 4, now closed. Rule 19 and D20 say a ceiling refusal is
   * `REMOTE_QUOTA_EXCEEDED` → the `quota` reason, whose one action is
   * *Upgrade*; *Sync now* cannot clear a ceiling, because a fetch and a replay
   * push the same bytes again.
   *
   * `remotes.ts:573-581` does classify on `ceilingRefusalMarker` — but only on
   * the path where the refusal arrives as a *thrown* transport error, which is
   * the native leg. On the isomorphic-git leg a `pre-receive` refusal comes
   * back as a per-ref result, and `sync.machine.ts:1214` writes
   * `reason: 'rejected'` for any refused ref without ever reading the marker.
   * Measured: the row shows the server's sentence and its file list (the case
   * above) and offers **Sync now**.
   *
   * Fixed in W4 lane a a4: `sync.machine.ts` now files a per-ref refusal
   * carrying the marker as `quota`, whose one action is Upgrade, while the
   * remote's sentence and file list are untouched (`sync.machine.test.ts` →
   * "files a per-ref ceiling refusal as quota, keeping the remote's sentence").
   */
  it('should offer Upgrade rather than Sync now on a ceiling refusal', async () => {
    const { client } = required(pro);
    await connectAndBackUp(client, 'W10 Ceiling Action');
    const fault = await routeGitHookRefusal(client, ceilingReason);
    try {
      await mintRevision(client, 'over-ceiling-action.scad');
      await expect
        .poll(async () => backupText(client), { timeout: 180_000 })
        .toMatch(/repository size limit exceeded/u);
      const buttons = await backupStatus(client).getByRole('button').allInnerTexts();
      const links = await backupStatus(client).getByRole('link').allInnerTexts();
      const offered = [...buttons, ...links].map((text) => text.trim());
      console.info(`[sync-refusals] ceiling actions: ${JSON.stringify(offered)}`);
      expect(offered).toHaveLength(1);
      expect(offered[0]).toMatch(/Upgrade/u);
    } finally {
      await fault.remove();
    }
  }, 900_000);
});
