import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import process from 'node:process';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { desktopE2EPackagedExecutable } from '#support/config.js';
import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { backupLine, connectTauCloud, openBackupChooser } from '#support/revisions-pane.js';
import { expectSignedIn, expectVisible } from '#support/scenario.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import { openCloudOnlyProject } from '#support/two-client/browser-client.js';
import {
  forgetSeededProjects,
  projectLfsBytes,
  runGit,
  seedProPlan,
  tauCloudOwnerIds,
} from '#support/two-client/tau-cloud.js';
import type { TauCloudOwnerIds } from '#support/two-client/tau-cloud.js';

/*
 * Packaged Git LFS round trip: the packaged app, not the development build, records a large file with the git and
 * git-lfs it ships, backs it up to Tau Cloud, and a second packaged install fetches it again to the exact bytes.
 *
 * The app is launched with a Finder launch's PATH and without the login-shell import (`TAU_E2E_KEEP_PATH`), and the
 * row first proves that no `git-lfs` is reachable on that PATH, so every LFS clean, upload, download and smudge here
 * ran through the payload's own `git lfs`. The executable is required, never defaulted, and the payload is asserted to
 * be inside the app, so this row cannot pass against a development build or a package without the payload.
 */

/** What a Finder launch gives an app on macOS. */
const finderPath = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);
const fiveMiB = 5 * 1024 ** 2;
const projectName = 'Packaged LFS Roundtrip';
const largeFile = 'packaged-roundtrip.step';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

const account = tauTestAccount('lfs-packaged');
let token = '';
let owner: TauCloudOwnerIds | undefined;
let session: DesktopSession | undefined;

beforeAll(async () => {
  token = await seedTauTestUser(account);
  owner = await tauCloudOwnerIds(account.email);
  /* The plan rows the backup's storage allowance reads; buying one has a Stripe leg this suite does not drive. */
  await seedProPlan(owner);
});

afterAll(async () => {
  if (owner) {
    await forgetSeededProjects(owner);
  }
  if (token) {
    await deleteTauTestUser(account.email);
  }
});

afterEach(async (context) => {
  if (context.task.result?.state === 'fail' && session) {
    await session.capture(`lfs-packaged-${context.task.id}`);
  }
  await session?.close();
  session = undefined;
});

/** Launch the packaged app signed in, with a Finder launch's PATH and nothing from the login shell. */
const launchPackaged = async (): Promise<DesktopSession> => {
  const launched = await launchDesktopApp({
    packaged: true,
    packagedExecutable: desktopE2EPackagedExecutable(),
    token,
    /* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
    env: {
      PATH: finderPath,
      TAU_E2E_KEEP_PATH: '1',
      TAU_DESKTOP_UPDATES: 'off',
      /* An ad-hoc package signature cannot reach Electron's prior Keychain item unattended. */
      TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE: '1',
    },
    /* eslint-enable @typescript-eslint/naming-convention -- End of environment names. */
  });
  session = launched;
  expect(await launched.application.evaluate(({ app }) => app.isPackaged)).toBe(true);
  await expectVisible(launched.page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
  await authenticatePackagedDesktop(launched, token);
  await expectSignedIn(launched.page);
  return launched;
};

/** The payload's `git` and `git-lfs` inside the packaged app, where `bundledGitEnvironment` resolves them. */
const packagedPayload = async (launched: DesktopSession): Promise<Readonly<{ git: string; gitLfs: string }>> => {
  const resources = await launched.application.evaluate(() => process.resourcesPath);
  const root = join(resources, 'git', `${process.platform}-${process.arch}`);
  return { git: join(root, 'bin', 'git'), gitLfs: join(root, 'libexec', 'git-core', 'git-lfs') };
};

/** Open the Revisions pane through the workbench's own History chip. */
const openRevisionsPane = async (page: Page): Promise<void> => {
  await page
    .getByRole('button', { name: /^Open History\./u })
    .first()
    .click({ timeout: 120_000 });
};

/** What the Backup line says right now. */
const backupText = async (page: Page): Promise<string> =>
  // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- Playwright's own locator method; the copy reads by its line breaks.
  backupLine(page).innerText();

/** The commit `main` names in a project's own store, or nothing while it is absent or unborn. */
const head = async (root: string): Promise<string | undefined> => {
  const outcome = await runGit(['rev-parse', '--verify', '--quiet', 'refs/heads/main^{commit}'], root);
  return outcome.code === 0 ? outcome.stdout.trim() : undefined;
};

/** Where git-lfs keeps one object in a project's own store. */
const lfsObjectPath = (root: string, oid: string): string =>
  join(root, '.git', 'lfs', 'objects', oid.slice(0, 2), oid.slice(2, 4), oid);

describe('[completed-artifact] packaged Git LFS round trip', () => {
  it('should save, back up and fetch again a large file with the packaged git payload and no git-lfs on PATH', async () => {
    /* The premise: nothing on the PATH the app is given can answer `git lfs`. */
    const reachableGitLfs = finderPath.split(delimiter).filter((entry) => existsSync(join(entry, 'git-lfs')));
    expect(reachableGitLfs, 'a system git-lfs is on the PATH the packaged app is launched with').toEqual([]);

    const bytes = new Uint8Array(fiveMiB).fill(0x50);
    bytes.set(new TextEncoder().encode('ISO-10303-21;\n/* packaged LFS row */\n'), 0);
    const oid = createHash('sha256').update(bytes).digest('hex');

    /* Save and back up on the first install. */
    const source = await launchPackaged();
    const payload = await packagedPayload(source);
    expect(existsSync(payload.git), `the packaged app carries no git at ${payload.git}`).toBe(true);
    expect(existsSync(payload.gitLfs), `the packaged app carries no git-lfs at ${payload.gitLfs}`).toBe(true);
    await source.page.goto('app://tau/projects/new', { waitUntil: 'domcontentloaded' });
    await source.page.getByLabel('Project Name *').fill(projectName);
    await source.page
      .getByRole('button', { name: /^Create Project/u })
      .first()
      .click();
    await source.page.waitForURL(/\/w\/[^/]+\/[^/?]+/u, { timeout: 180_000 });
    const slug = decodeURIComponent(new URL(source.page.url()).pathname.split('/').at(-1) ?? '');
    const sourceRoot = join(source.homeRoot, slug);
    const identity = JSON.parse(await readFile(join(sourceRoot, '.tau/project.json'), 'utf8')) as {
      readonly projectId?: string;
    };
    const projectId = identity.projectId ?? '';
    expect(projectId, 'the packaged project has no id').not.toBe('');

    await openRevisionsPane(source.page);
    await openBackupChooser(source.page);
    await connectTauCloud(source.page);
    await expect
      .poll(async () => backupText(source.page), { message: 'the packaged project must back up', timeout: 180_000 })
      .toMatch(/Backed up/u);
    const before = await head(sourceRoot);

    await writeFile(join(sourceRoot, largeFile), bytes);
    await expect
      .poll(
        async () => {
          await source.page.bringToFront();
          await source.page.keyboard.press(`${modifier}+KeyS`);
          return head(sourceRoot);
        },
        { message: 'Mod+S must save the large file in the packaged app', timeout: 120_000, interval: 2000 },
      )
      .toSatisfy((after: string | undefined) => after !== undefined && after !== before);
    const saved = await head(sourceRoot);
    const pointer = await runGit(['show', `${saved ?? 'HEAD'}:${largeFile}`], sourceRoot);
    expect(pointer.code, pointer.stderr).toBe(0);
    expect(pointer.stdout, 'the packaged save must record the file as an LFS pointer').toContain(`oid sha256:${oid}`);
    expect(existsSync(lfsObjectPath(sourceRoot, oid)), 'the packaged git-lfs must store the object locally').toBe(true);

    await expect
      .poll(async () => projectLfsBytes(projectId), {
        message: 'Tau Cloud must verify and charge the object the packaged app uploaded',
        timeout: 180_000,
      })
      .toBe(fiveMiB);
    await expect
      .poll(async () => backupText(source.page), { message: 'the large-file revision must back up', timeout: 180_000 })
      .toMatch(/Backed up/u);
    await source.close();
    session = undefined;

    /* Fetch it again on a second install, which has never held the object. */
    const destination = await launchPackaged();
    const destinationSlug = await openCloudOnlyProject(destination.page, {
      projectsUrl: 'app://tau/projects',
      name: projectName,
      message: 'packaged LFS fetch',
    });
    const destinationRoot = join(destination.homeRoot, destinationSlug);
    await expect
      .poll(async () => readFile(join(destinationRoot, largeFile)).catch(() => undefined), {
        message: 'the packaged git-lfs must fetch and smudge the large file to its exact bytes',
        timeout: 180_000,
      })
      .toEqual(Buffer.from(bytes));
    expect(await head(destinationRoot), 'the fetched project must be on the saved revision').toBe(saved);
    expect(
      existsSync(lfsObjectPath(destinationRoot, oid)),
      'the packaged git-lfs must hold the fetched object in its store',
    ).toBe(true);
  });
});
