/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their platform names. */
// @vitest-environment node
/**
 * The read-only git view (blueprint E1): what the host copies out of a real store, and what it never copies. Built
 * over real repositories made with the machine's git, and read back with that git outside any sandbox; containment is
 * the shell qualification's job.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createShellGitView, indexExtensions, shellGitEnvironment } from '#shell/shell-git-view.js';

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
      'index',
      'info/exclude',
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
      if (file !== 'index') {
        expect(text, file).not.toMatch(/remote|credential|lfs|extraheader|hooks|url/iu);
      }
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
    /* Its own index, not the main checkout's. */
    expect(await readFile(join(view!.directory, 'index'))).toStrictEqual(
      await readFile(join(checkout, '.git', 'worktrees', 'linked', 'index')),
    );
  });

  it('should give no view when a linked checkout names a store that does not hold it', async () => {
    await seedRepository();
    const linked = join(base, 'linked');
    git(checkout, 'worktree', 'add', '--quiet', linked, 'feature');
    const own = join(checkout, '.git', 'worktrees', 'linked', 'commondir');
    const other = join(base, 'other');
    git(base, 'init', '--quiet', other);
    await writeFile(own, `${join(other, '.git')}\n`);

    expect(await createShellGitView(linked, privateRoot)).toBeUndefined();
    await writeFile(own, '../..\n');
    expect(await createShellGitView(linked, privateRoot)).toBeDefined();
  });

  it('should give no view when the object store is a link to another store', async () => {
    await seedRepository();
    const linked = join(base, 'linked');
    git(checkout, 'worktree', 'add', '--quiet', linked, 'feature');
    const own = join(checkout, '.git', 'worktrees', 'linked');
    await writeFile(join(own, 'commondir'), '.\n');
    await symlink(join(checkout, '.git', 'objects'), join(own, 'objects'));

    expect(await createShellGitView(linked, privateRoot)).toBeUndefined();
  });

  it('should copy the index so status compares against it: clean prints nothing, an edit shows as modified', async () => {
    await seedRepository();
    const environment = shellGitEnvironment((await createShellGitView(checkout, privateRoot))!);

    expect(throughView(environment, 'status', '--porcelain')).toBe('');
    expect(throughView(environment, 'diff')).toBe('');
    /* The store's own ignores still apply. */
    await writeFile(join(checkout, '.git', 'info', 'exclude'), '/thumbnail.webp\n');
    await writeFile(join(checkout, 'thumbnail.webp'), '');
    const ignoring = shellGitEnvironment((await createShellGitView(checkout, privateRoot))!);
    expect(throughView(ignoring, 'status', '--porcelain')).toBe('');
    await writeFile(join(checkout, 'part.scad'), 'cube(3);\n');
    expect(throughView(ignoring, 'status', '--porcelain')).toBe(' M part.scad\n');
    expect(throughView(environment, 'diff', '--stat')).toMatch(/part\.scad \| 2 \+-/u);
  });

  it('should keep an index whose extensions git can read from the view, in every index version', async () => {
    for (const version of ['2', '3', '4']) {
      // oxlint-disable-next-line no-await-in-loop -- one repository per version, in turn.
      await rm(checkout, { recursive: true, force: true });
      // oxlint-disable-next-line no-await-in-loop -- see above.
      await seedRepository(version === '4' ? 'sha256' : 'sha1');
      git(checkout, 'update-index', `--index-version=${version}`);
      git(checkout, 'update-index', '--untracked-cache');
      git(checkout, '-c', 'core.untrackedCache=true', 'status', '--porcelain');
      // oxlint-disable-next-line no-await-in-loop -- see above.
      const extensions = indexExtensions(new Uint8Array(await readFile(join(checkout, '.git', 'index'))));
      expect(extensions, version).toStrictEqual(expect.arrayContaining(['TREE', 'UNTR']));
      // oxlint-disable-next-line no-await-in-loop -- see above.
      const view = await createShellGitView(checkout, privateRoot);
      // oxlint-disable-next-line no-await-in-loop -- see above.
      expect(await filesUnder(view!.directory), version).toContain('index');
      expect(throughView(shellGitEnvironment(view!), 'status', '--porcelain'), version).toBe('');
    }
  });

  it('should keep an index carrying the fsmonitor extension, which the view ignores and never writes back', async () => {
    await seedRepository();
    const hook = join(base, 'fsmonitor-hook');
    await writeFile(hook, "#!/bin/sh\nprintf 'tau-token\\0/'\n", { mode: 0o755 });
    git(checkout, '-c', `core.fsmonitor=${hook}`, '-c', 'core.fsmonitorHookVersion=2', 'update-index', '--fsmonitor');
    git(checkout, '-c', `core.fsmonitor=${hook}`, '-c', 'core.fsmonitorHookVersion=2', 'status', '--porcelain');
    const real = new Uint8Array(await readFile(join(checkout, '.git', 'index')));
    expect(indexExtensions(real)).toContain('FSMN');
    const view = await createShellGitView(checkout, privateRoot);
    const environment = shellGitEnvironment(view!);

    expect(throughView(environment, 'status', '--porcelain')).toBe('');
    await writeFile(join(checkout, 'part.scad'), 'cube(4);\n');
    expect(throughView(environment, 'status', '--porcelain')).toBe(' M part.scad\n');
    /* With optional locks off, status never rewrote the copy. */
    expect(new Uint8Array(await readFile(join(view!.directory, 'index')))).toStrictEqual(real);
  });

  it('should give no view for a split index, whose shared part lives in the real git directory, or a malformed one', async () => {
    await seedRepository();
    git(checkout, 'update-index', '--split-index');
    expect(indexExtensions(new Uint8Array(await readFile(join(checkout, '.git', 'index'))))).toContain('link');
    expect(await createShellGitView(checkout, privateRoot)).toBeUndefined();
    git(checkout, 'update-index', '--no-split-index');
    await writeFile(join(checkout, '.git', 'index'), 'DIRC-not-an-index');
    expect(await createShellGitView(checkout, privateRoot)).toBeUndefined();
    expect(indexExtensions(new TextEncoder().encode('DIRC-not-an-index'))).toBeUndefined();
  });

  it('should leave out an absent index, packed-refs, shallow or exclude, as git would', async () => {
    await seedRepository();
    for (const name of ['index', 'packed-refs', 'shallow', join('info', 'exclude')]) {
      // oxlint-disable-next-line no-await-in-loop -- one file at a time.
      await rm(join(checkout, '.git', name), { force: true });
    }
    const view = await createShellGitView(checkout, privateRoot);

    expect(await filesUnder(view!.directory)).toStrictEqual([
      'HEAD',
      'config',
      'objects/info/alternates',
      'refs/heads/loose',
    ]);
  });

  it('should give no view when a copied file exists but cannot be copied exactly', async () => {
    await seedRepository();
    const store = join(checkout, '.git');
    const packed = await readFile(join(store, 'packed-refs'), 'utf8');
    const first = git(checkout, 'rev-parse', 'HEAD~1').trim();
    const cases: ReadonlyArray<readonly [string, () => Promise<void>, () => Promise<void>]> = [
      [
        'packed-refs with a line that is not a ref',
        async () => writeFile(join(store, 'packed-refs'), `${packed}not a ref line\n`),
        async () => writeFile(join(store, 'packed-refs'), packed),
      ],
      [
        'packed-refs that is a folder',
        async () => {
          await rm(join(store, 'packed-refs'));
          await mkdir(join(store, 'packed-refs'));
        },
        async () => {
          await rm(join(store, 'packed-refs'), { recursive: true });
          await writeFile(join(store, 'packed-refs'), packed);
        },
      ],
      [
        'shallow with a line that is not an object id',
        async () => writeFile(join(store, 'shallow'), `${first}\nnot-an-id\n`),
        async () => rm(join(store, 'shallow')),
      ],
      [
        'shallow with an empty line between ids, which git refuses as a bad shallow line',
        async () => writeFile(join(store, 'shallow'), `${first}\n\n${first}\n`),
        async () => writeFile(join(store, 'shallow'), `${first}\n`),
      ],
      [
        'shallow holding only a newline, which git refuses as a bad shallow line',
        async () => writeFile(join(store, 'shallow'), '\n'),
        async () => writeFile(join(store, 'shallow'), ''),
      ],
      [
        'a loose branch that holds no ref value',
        async () => writeFile(join(store, 'refs', 'heads', 'loose'), 'garbage\n'),
        async () => writeFile(join(store, 'refs', 'heads', 'loose'), `${first}\n`),
      ],
      [
        'an exclude file holding a NUL',
        async () => writeFile(join(store, 'info', 'exclude'), 'a\0b\n'),
        async () => writeFile(join(store, 'info', 'exclude'), '\n'),
      ],
    ];
    for (const [label, spoil, mend] of cases) {
      // oxlint-disable-next-line no-await-in-loop -- each case spoils and mends one file in turn.
      await spoil();
      // oxlint-disable-next-line no-await-in-loop -- see above.
      expect(await createShellGitView(checkout, privateRoot), label).toBeUndefined();
      // oxlint-disable-next-line no-await-in-loop -- see above.
      await mend();
      // oxlint-disable-next-line no-await-in-loop -- see above.
      expect(await createShellGitView(checkout, privateRoot), `${label}, mended`).toBeDefined();
    }
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
