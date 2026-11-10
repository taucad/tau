import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { pushCarriesAnonymousCommit } from '#store/push-anonymity.js';

/**
 * Q3: whether a push brought an anonymously recorded commit is read from the
 * commits the push adds, over a real repository, because only git can say
 * which commits new tips reach that old tips did not.
 */

const scratch: string[] = [];

afterAll(() => {
  for (const directory of scratch) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
const isolated = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: '/nonexistent',
  LANG: 'C',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_COMMITTER_NAME: 'Tau',
  GIT_COMMITTER_EMAIL: 'revisions@users.noreply.tau.new',
} as unknown as NodeJS.ProcessEnv;
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

const git = (cwd: string, ...args: readonly string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: isolated, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A repository and a way to commit on `main` as an author. */
const newRepository = (): { directory: string; commit: (author: string) => string } => {
  const directory = mkdtempSync(path.join(tmpdir(), 'tau-push-anonymity-'));
  scratch.push(directory);
  git(directory, 'init', '--quiet', '--initial-branch=main', '.');
  let count = 0;
  return {
    directory,
    commit: (author) => {
      count += 1;
      writeFileSync(path.join(directory, 'main.scad'), `cube(${String(count)});\n`);
      git(directory, 'add', '.');
      git(directory, 'commit', '--quiet', '--author', author, '-m', `save ${String(count)}`);
      return git(directory, 'rev-parse', 'HEAD');
    },
  };
};

const person = 'Ada <user_ada@users.noreply.tau.new>';
const anonymous = 'Anonymous <anon:3fa9c1d2@users.noreply.tau.new>';

describe('pushCarriesAnonymousCommit (Q3)', () => {
  it('should find an anonymous commit anywhere among the commits a push adds', async () => {
    const { directory, commit } = newRepository();
    const first = commit(person);
    commit(anonymous);
    const tip = commit(person);

    await expect(
      pushCarriesAnonymousCommit({
        directory,
        before: { 'refs/heads/main': { oid: first } },
        after: { 'refs/heads/main': { oid: tip } },
      }),
    ).resolves.toBe(true);
  });

  it('should not count an anonymous commit the server already held', async () => {
    const { directory, commit } = newRepository();
    const held = commit(anonymous);
    const tip = commit(person);

    await expect(
      pushCarriesAnonymousCommit({
        directory,
        before: { 'refs/heads/main': { oid: held } },
        after: { 'refs/heads/main': { oid: tip } },
      }),
    ).resolves.toBe(false);
  });

  it('should read a first push in full, and a push that adds nothing as not anonymous', async () => {
    const { directory, commit } = newRepository();
    const tip = commit(anonymous);

    await expect(
      pushCarriesAnonymousCommit({ directory, before: {}, after: { 'refs/heads/main': { oid: tip } } }),
    ).resolves.toBe(true);
    await expect(
      pushCarriesAnonymousCommit({
        directory,
        before: { 'refs/heads/main': { oid: tip } },
        after: { 'refs/heads/main': { oid: tip } },
      }),
    ).resolves.toBe(false);
  });

  it('should not mistake a name that mentions anon for the pseudonym address', async () => {
    const { directory, commit } = newRepository();
    const tip = commit('anon:fan <user_fan@users.noreply.tau.new>');

    await expect(
      pushCarriesAnonymousCommit({ directory, before: {}, after: { 'refs/heads/main': { oid: tip } } }),
    ).resolves.toBe(false);
  });

  it('should fail closed, as anonymous, when the walk cannot run', async () => {
    const { directory } = newRepository();

    await expect(
      pushCarriesAnonymousCommit({ directory, before: {}, after: { 'refs/heads/main': { oid: 'f'.repeat(40) } } }),
    ).resolves.toBe(true);
  });
});
