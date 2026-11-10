/**
 * A1: the desktop records the signed-in Tau account, never the machine.
 *
 * The shell is launched signed in, with the mail and author variables of its
 * environment set to sentinels. A *Save* is then read back with stock `git log`
 * from the project's own store: its author is the account under the Tau
 * no-reply address, and no commit carries a sentinel or this machine's login
 * name. Before A1 the host ignored the renderer's `setActor` and authored every
 * native mint as `os.userInfo().username`, with `GIT_AUTHOR_EMAIL` or `EMAIL`
 * when set.
 */

import { writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { desktopE2ECompletedArtifact } from '#support/config.js';
import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import { runGit, tauCloudOwnerIds } from '#support/two-client/tau-cloud.js';

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const account = tauTestAccount('revision-author');
const sentinel = {
  email: 'desktop-env-email-a1@example.invalid',
  authorEmail: 'desktop-git-author-a1@example.invalid',
  authorName: 'Desktop Git Author A1',
} as const;
let token = '';

beforeAll(async () => {
  token = await seedTauTestUser(account);
});

afterAll(async () => {
  if (token) {
    await deleteTauTestUser(account.email);
  }
});

/** One Git read in the project's store, failing at the command that failed. */
const git = async (root: string, args: readonly string[]): Promise<string> => {
  const outcome = await runGit(args, root);
  expect(outcome.code, outcome.stderr).toBe(0);
  return outcome.stdout.trim();
};

it('authors a desktop save as the signed-in account, with no machine identity in any commit', async () => {
  const { userId } = await tauCloudOwnerIds(account.email);
  const session = await launchDesktopApp({
    token,
    /* eslint-disable @typescript-eslint/naming-convention -- process environment names, as a shell sets them. */
    env: {
      TAU_DESKTOP_UPDATES: 'off',
      EMAIL: sentinel.email,
      GIT_AUTHOR_EMAIL: sentinel.authorEmail,
      GIT_AUTHOR_NAME: sentinel.authorName,
    },
    /* eslint-enable @typescript-eslint/naming-convention -- the environment names end here. */
  });
  try {
    if (desktopE2ECompletedArtifact) {
      await authenticatePackagedDesktop(session, token);
    }
    const { page } = session;
    await page.goto('app://tau/projects/new');
    await page.getByLabel('Project Name *').fill('Revision author');
    await page.getByRole('button', { name: /^Create Project/u }).click();
    await page.waitForURL(/\/w\//u, { timeout: 120_000 });
    const projectRoot = join(session.homeRoot, 'revision-author');

    /* A person's edit, then `Mod+S` (`revision-save-shortcut.tsx`). */
    await writeFile(join(projectRoot, 'notes.txt'), 'Saved by the signed-in person.\n');
    const head = async (): Promise<string> => {
      const outcome = await runGit(['rev-parse', 'refs/heads/main'], projectRoot);
      return outcome.stdout.trim();
    };
    const before = await head();
    await expect
      .poll(
        async () => {
          await page.bringToFront();
          await page.keyboard.press(`${modifier}+KeyS`);
          return head();
        },
        { message: 'A1: Mod+S must mint a desktop revision', timeout: 120_000, interval: 2000 },
      )
      .not.toBe(before);

    const author = await git(projectRoot, ['log', '-1', '--format=%an|%ae|%cn|%ce', 'refs/heads/main']);
    expect(author).toBe(`${account.name}|${userId}@users.noreply.tau.new|Tau|noreply@tau.new`);

    /* Every commit Tau wrote here, headers and trailers both. */
    const login = userInfo().username.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);
    const history = await git(projectRoot, ['rev-list', '--all']);
    const commits = history.split('\n').filter((line) => line !== '');
    expect(commits.length).toBeGreaterThan(0);
    for (const commit of commits) {
      // oxlint-disable-next-line no-await-in-loop -- one object at a time, in history order.
      const body = await git(projectRoot, ['cat-file', 'commit', commit]);
      for (const value of Object.values(sentinel)) {
        expect(body, `${commit} carries ${value}`).not.toContain(value);
      }
      expect(body, `${commit} carries the login name`).not.toMatch(
        new RegExp(String.raw`(?:^author |^committer |Tau-Actor: user )${login}\b|<${login}@`, 'mu'),
      );
    }
  } catch (error) {
    await session.capture('revision-author');
    throw error;
  } finally {
    await session.close();
  }
}, 900_000);
