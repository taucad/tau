/**
 * G2's release-gate lane (M2-fix-2 B1): `--check` reads only the releases a gated commit must still read, so a
 * candidate tag on `HEAD` and a release on a later commit never turn it red.
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

// oxlint-disable-next-line no-restricted-imports -- the check is a script; the `#` import map covers only src/.
import { releaseTags } from './pin-writer-corpus.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const repository = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'tau-writer-tags-'));
  roots.push(root);
  const git = (...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=Tau', '-c', 'user.email=noreply@tau.new', ...args], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  git('init', '--quiet', '--initial-branch=main');
  const commit = (message: string): void => {
    git('commit', '--quiet', '--allow-empty', '-m', message);
  };
  return { root, git, commit };
};

describe('releaseTags (G2 lane, B1)', () => {
  it('should leave out a candidate tag on HEAD, so tagging HEAD keeps --check green', async () => {
    const { root, git, commit } = await repository();
    commit('one');
    git('tag', 'ui@1.0.0');
    commit('two');
    git('tag', 'desktop@1.1.0');
    commit('candidate');
    expect(releaseTags(root)).toStrictEqual(['desktop@1.1.0', 'ui@1.0.0']);

    git('tag', 'desktop@1.2.0');
    git('tag', 'ui@1.2.0');
    expect(releaseTags(root)).toStrictEqual(['desktop@1.1.0', 'ui@1.0.0']);
  });

  it('should leave out a release on a later commit when an older commit is gated', async () => {
    const { root, git, commit } = await repository();
    commit('one');
    git('tag', 'ui@1.0.0');
    commit('older candidate');
    git('tag', 'older');
    commit('later');
    git('tag', 'ui@1.1.0');
    git('checkout', '--quiet', 'older');
    expect(releaseTags(root)).toStrictEqual(['ui@1.0.0']);
  });

  it('should ignore tags that are not ui@ or desktop@ releases', async () => {
    const { root, git, commit } = await repository();
    commit('one');
    git('tag', 'desktop-staging@1.0.0');
    git('tag', 'api@1.0.0');
    commit('two');
    expect(releaseTags(root)).toStrictEqual([]);
  });
});
