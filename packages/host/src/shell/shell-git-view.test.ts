/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their platform names. */
// @vitest-environment node
/**
 * The read-only git view (blueprint E1): what the host copies out of a real store, and what it never copies. Built
 * over real repositories made with the machine's git, and read back with that git outside any sandbox; containment is
 * the shell qualification's job.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createShellGitView, shellGitEnvironment } from '#shell/shell-git-view.js';

/** A token-shaped secret seeded into every place the real store keeps settings. */
const secret = 'ghp_SEEDEDSECRETVALUE0123456789';

let base = '';
let checkout = '';
let privateRoot = '';

const gitWith = (input: string | undefined, cwd: string, ...arguments_: string[]): string =>
  execFileSync('git', arguments_, {
    cwd,
    encoding: 'utf8',
    ...(input === undefined ? {} : { input }),
    env: {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
      HOME: base,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    },
  });

const git = (cwd: string, ...arguments_: string[]): string => gitWith(undefined, cwd, ...arguments_);

/** Read git through a view, as the shell would, outside any sandbox. */
const throughView = (view: Readonly<Record<string, string>>, ...arguments_: string[]): string =>
  execFileSync('git', arguments_, {
    cwd: checkout,
    encoding: 'utf8',
    env: { PATH: process.env['PATH'] ?? '/usr/bin:/bin', HOME: base, GIT_CONFIG_NOSYSTEM: '1', ...view },
  });

const filesUnder = async (root: string): Promise<string[]> => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .toSorted();
};

/** A checkout with history on `main`, a branch, a tag, Tau records and a remote whose settings carry a secret. */
const seedRepository = async (objectFormat: 'sha1' | 'sha256' = 'sha1'): Promise<void> => {
  git(base, 'init', '--quiet', `--object-format=${objectFormat}`, '--initial-branch=main', checkout);
  await writeFile(join(checkout, 'part.scad'), 'cube(1);\n');
  git(checkout, 'add', 'part.scad');
  git(checkout, 'commit', '--quiet', '-m', 'First part');
  await writeFile(join(checkout, 'part.scad'), 'cube(2);\n');
  git(checkout, 'commit', '--quiet', '-am', 'Grow the part');
  git(checkout, 'branch', 'feature');
  git(checkout, 'tag', '-a', 'v1', '-m', 'Version 1');
  const chat = gitWith('HIDDEN-CHAT-LOG\n', checkout, 'hash-object', '-w', '--stdin').trim();
  git(checkout, 'update-ref', 'refs/tau/chats/c1', chat);
  git(checkout, 'update-ref', 'refs/tau/ops/device', chat);
  git(checkout, 'update-ref', 'refs/remotes/origin/tau/chats/c2', 'HEAD');
  git(checkout, 'remote', 'add', 'origin', `https://x-access-token:${secret}@example.invalid/repo.git`);
  git(checkout, 'config', 'credential.helper', `!echo password=${secret}`);
  git(checkout, 'config', 'lfs.url', `https://${secret}@lfs.example.invalid`);
  git(checkout, 'config', 'http.extraheader', `Authorization: Bearer ${secret}`);
  git(checkout, 'config', 'core.hooksPath', '/tmp/hooks');
  git(checkout, 'pack-refs', '--all');
  /* One loose branch beside the packed ones. */
  git(checkout, 'branch', 'loose');
};

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'tau-shell-git-view-')));
  checkout = join(base, 'project');
  privateRoot = join(base, 'tau-shell-private');
  await mkdir(privateRoot);
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('createShellGitView', () => {
  it('should hold only HEAD, branches, tags, the alternates and a fresh config', async () => {
    await seedRepository();
    const view = await createShellGitView(checkout, privateRoot);

    expect(view).toStrictEqual({
      directory: join(privateRoot, 'git'),
      objects: join(checkout, '.git', 'objects'),
      workTree: checkout,
    });
    expect(await filesUnder(view!.directory)).toStrictEqual([
      'HEAD',
      'config',
      'objects/info/alternates',
      'packed-refs',
      'refs/heads/loose',
    ]);
    expect(await readFile(join(view!.directory, 'HEAD'), 'utf8')).toBe('ref: refs/heads/main\n');
    expect(await readFile(join(view!.directory, 'objects', 'info', 'alternates'), 'utf8')).toBe(
      `${join(checkout, '.git', 'objects')}\n`,
    );
    expect(await readFile(join(view!.directory, 'config'), 'utf8')).toBe(
      '[core]\n\trepositoryformatversion = 0\n\tbare = false\n',
    );
    const packed = await readFile(join(view!.directory, 'packed-refs'), 'utf8');
    expect(packed).toMatch(/refs\/heads\/main\n/u);
    expect(packed).toMatch(/refs\/heads\/feature\n/u);
    expect(packed).toMatch(/refs\/tags\/v1\n\^[0-9a-f]{40}\n/u);
    expect(packed).not.toMatch(/refs\/tau|refs\/remotes/u);
  });

  it('should carry no remote, credential helper, LFS setting, header, or hook path of the real config', async () => {
    await seedRepository();
    const view = await createShellGitView(checkout, privateRoot);

    for (const file of await filesUnder(view!.directory)) {
      // oxlint-disable-next-line no-await-in-loop -- a handful of files.
      const text = await readFile(join(view!.directory, file), 'utf8');
      expect(text, file).not.toContain(secret);
      expect(text, file).not.toMatch(/remote|credential|lfs|extraheader|hooks|url/iu);
    }
    const listed = throughView(shellGitEnvironment(view!), 'config', '--list', '--local');
    expect(listed).toBe('core.repositoryformatversion=0\ncore.bare=false\n');
  });

  it('should let git log, diff, show and blame read history, and list no refs/tau or remote ref', async () => {
    await seedRepository();
    const environment = shellGitEnvironment((await createShellGitView(checkout, privateRoot))!);

    expect(throughView(environment, 'log', '--format=%s')).toBe('Grow the part\nFirst part\n');
    expect(throughView(environment, 'diff', 'HEAD~1', 'HEAD', '--', 'part.scad')).toMatch(/-cube\(1\);\n\+cube\(2\);/u);
    expect(throughView(environment, 'show', 'HEAD~1:part.scad')).toBe('cube(1);\n');
    expect(throughView(environment, 'blame', '--porcelain', 'part.scad')).toMatch(/summary Grow the part/u);
    expect(throughView(environment, 'for-each-ref', '--format=%(refname)').split('\n').filter(Boolean)).toStrictEqual([
      'refs/heads/feature',
      'refs/heads/loose',
      'refs/heads/main',
      'refs/tags/v1',
    ]);
    expect(throughView(environment, 'remote')).toBe('');
  });

  it('should keep a SHA-256 store readable', async () => {
    await seedRepository('sha256');
    const view = await createShellGitView(checkout, privateRoot);

    expect(await readFile(join(view!.directory, 'config'), 'utf8')).toBe(
      '[core]\n\trepositoryformatversion = 1\n\tbare = false\n[extensions]\n\tobjectformat = sha256\n',
    );
    expect(throughView(shellGitEnvironment(view!), 'log', '--format=%s', '-1')).toBe('Grow the part\n');
  });

  it('should describe a linked checkout from its own HEAD and the common store', async () => {
    await seedRepository();
    const linked = join(base, 'linked');
    git(checkout, 'worktree', 'add', '--quiet', linked, 'feature');
    const view = await createShellGitView(linked, privateRoot);

    expect(view?.objects).toBe(join(checkout, '.git', 'objects'));
    expect(view?.workTree).toBe(linked);
    expect(await readFile(join(view!.directory, 'HEAD'), 'utf8')).toBe('ref: refs/heads/feature\n');
  });

  it('should copy a shallow boundary', async () => {
    await seedRepository();
    const first = git(checkout, 'rev-parse', 'HEAD~1').trim();
    await writeFile(join(checkout, '.git', 'shallow'), `${first}\n`);
    const view = await createShellGitView(checkout, privateRoot);

    expect(await readFile(join(view!.directory, 'shallow'), 'utf8')).toBe(`${first}\n`);
    expect(throughView(shellGitEnvironment(view!), 'log', '--format=%s')).toBe('Grow the part\nFirst part\n');
  });

  it('should give no view for a store it cannot describe exactly', async () => {
    expect(await createShellGitView(checkout, privateRoot)).toBeUndefined();
    await seedRepository();
    git(checkout, 'symbolic-ref', 'HEAD', 'refs/tau/head/main');
    expect(await createShellGitView(checkout, privateRoot)).toBeUndefined();
    git(checkout, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    git(checkout, 'config', 'core.repositoryformatversion', '1');
    git(checkout, 'config', 'extensions.refStorage', 'reftable');
    expect(await createShellGitView(checkout, privateRoot)).toBeUndefined();
  });
});

describe('shellGitEnvironment', () => {
  it('should point git at the view and the checkout and take no optional lock', () => {
    expect(shellGitEnvironment({ directory: '/p/git', objects: '/c/.git/objects', workTree: '/c' })).toStrictEqual({
      GIT_DIR: '/p/git',
      GIT_WORK_TREE: '/c',
      GIT_OPTIONAL_LOCKS: '0',
    });
  });
});
