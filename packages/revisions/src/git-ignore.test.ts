/**
 * Git's ignore rules on a leg with no Git (the browser), checked against
 * `git check-ignore` and `git ls-files --others --ignored` on real repositories.
 */
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { NodeFsProvider } from '@taucad/filesystem/backend/node';

import { ignoredAmong, ignoredUntrackedPaths, parseIgnoreRules } from '#git-ignore.js';
import type { IgnoreEntryKind, IgnoreWalkFiles } from '#git-ignore.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const git = (cwd: string, args: readonly string[], input?: string): string =>
  execFileSync(
    'git',
    ['-c', 'core.excludesFile=', '-c', 'user.name=Ada', '-c', 'user.email=ada@example.com', ...args],
    { cwd, encoding: 'utf8', ...(input === undefined ? {} : { input }) },
  );

/** A repository holding `files`, with `tracked` committed and the rest left untracked. */
const repository = async (
  files: Readonly<Record<string, string>>,
  tracked: readonly string[],
  options?: Readonly<{ exclude?: string; ignoreCase?: boolean }>,
): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-git-ignore-'));
  roots.push(root);
  git(root, ['init', '--quiet']);
  if (options?.ignoreCase !== undefined) {
    git(root, ['config', 'core.ignoreCase', String(options.ignoreCase)]);
  }
  for (const [path, content] of Object.entries(files)) {
    // oxlint-disable-next-line no-await-in-loop -- parents first.
    await mkdir(join(root, path, '..'), { recursive: true });
    // oxlint-disable-next-line no-await-in-loop -- see above.
    await writeFile(join(root, path), content);
  }
  if (options?.exclude !== undefined) {
    await writeFile(join(root, '.git', 'info', 'exclude'), options.exclude);
  }
  if (tracked.length > 0) {
    git(root, ['add', '--force', '--', ...tracked]);
    git(root, ['commit', '--quiet', '-m', 'Tracked']);
  }
  return root;
};

const readOptional = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
};

const kindOf = async (path: string): Promise<IgnoreEntryKind | undefined> => {
  try {
    const stat = await lstat(path);
    if (stat.isDirectory()) {
      return 'directory';
    }
    if (stat.isSymbolicLink()) {
      return 'symlink';
    }
    return stat.isFile() ? 'file' : 'other';
  } catch {
    return undefined;
  }
};

const nodeFiles = (root: string): IgnoreWalkFiles => ({
  readdir: async (path) => readdir(join(root, path)),
  kind: async (path) => kindOf(join(root, path)),
  readText: async (path) => readOptional(join(root, path)),
});

const listedByGit = (root: string): readonly string[] =>
  git(root, ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory'])
    .split('\0')
    .filter((path) => path !== '')
    .toSorted();

/*
 * What a listing keeps out of a capture: a path it names, or one under a
 * directory it names. Git's own listing names some directories and their
 * contents both, so listings are compared by what they exclude.
 */
const excludedBy = (listing: readonly string[], paths: readonly string[]): readonly string[] =>
  paths.filter((path) => listing.some((entry) => entry === path || (entry.endsWith('/') && path.startsWith(entry))));

const inputsOf = async (root: string, tracked: readonly string[], ignoreCase?: boolean) => ({
  tracked: new Set(tracked),
  exclude: await readOptional(join(root, '.git', 'info', 'exclude')),
  ignoreCase,
  skip: (path: string) => path === '.git',
});

const ours = async (root: string, tracked: readonly string[], ignoreCase?: boolean): Promise<readonly string[]> =>
  ignoredUntrackedPaths(nodeFiles(root), await inputsOf(root, tracked, ignoreCase));

/*
 * Every listing agrees with Git's: the walk, and the per-path answer for each
 * path alone and for all of them at once.
 */
const expectGitsListing = async (
  root: string,
  paths: readonly string[],
  options: Readonly<{ tracked: readonly string[]; ignoreCase?: boolean }>,
): Promise<readonly string[]> => {
  const { tracked, ignoreCase } = options;
  const expected = excludedBy(listedByGit(root), paths);
  const inputs = await inputsOf(root, tracked, ignoreCase);
  expect(excludedBy(await ours(root, tracked, ignoreCase), paths)).toStrictEqual(expected);
  expect(excludedBy(await ignoredAmong(nodeFiles(root), inputs, paths), paths)).toStrictEqual(expected);
  const one = await Promise.all(
    paths.map(async (path) => excludedBy(await ignoredAmong(nodeFiles(root), inputs, [path]), [path])),
  );
  expect(one.flat()).toStrictEqual(expected);
  return expected;
};

describe.runIf(gitToolchainOnPath)('git ignore rules as Git reads them', () => {
  it('lists what `git ls-files --others --ignored --directory` lists, nested files and info/exclude included', async () => {
    const files = {
      '.gitignore': [
        '# build output',
        '*.log',
        '!keep.log',
        'dist/',
        '/top.tmp',
        'cache',
        '**/gen/**',
        'docs/**/draft.md',
        String.raw`\#hash.txt`,
        String.raw`\!bang.txt`,
        'trailing.txt   ',
        String.raw`space\ .txt`,
        'file[0-9].bin',
        'name[!a].dat',
        '[[:digit:]]*.num',
        'a?c.q',
        'vendor/*',
        '!vendor/keep/',
        'only/',
      ].join('\n'),
      'a.log': '',
      'keep.log': '',
      'sub/b.log': '',
      'sub/keep.log': '',
      'dist/out.js': '',
      'nested/dist/out.js': '',
      'top.tmp': '',
      'nested/top.tmp': '',
      cache: '',
      'deep/cache/x': '',
      'x/gen/y/z.txt': '',
      'gen/a.txt': '',
      'docs/draft.md': '',
      'docs/a/b/draft.md': '',
      '#hash.txt': '',
      '!bang.txt': '',
      'trailing.txt': '',
      'space .txt': '',
      'file1.bin': '',
      'filex.bin': '',
      'nameb.dat': '',
      'namea.dat': '',
      '7up.num': '',
      'abc.q': '',
      'a/c.q': '',
      'vendor/lib.js': '',
      'vendor/keep/k.js': '',
      only: '',
      'models/.gitignore': '*.stl\n!wanted.stl\n/local.bin\n',
      'models/scan.stl': '',
      'models/wanted.stl': '',
      'models/local.bin': '',
      'models/deep/local.bin': '',
      'models/deep/x.stl': '',
      'excluded/one.txt': '',
      'tracked-dir/committed.log': '',
      'tracked-dir/new.log': '',
      'dist2/inner/x': '',
      'plain.txt': '',
    };
    const tracked = ['.gitignore', 'models/.gitignore', 'plain.txt', 'tracked-dir/committed.log', 'a.log'];
    const root = await repository(files, tracked, { exclude: '/excluded/\n' });

    const excluded = await expectGitsListing(root, Object.keys(files), { tracked });
    expect(excluded).toContain('excluded/one.txt');
    expect(excluded).not.toContain('keep.log');
    expect(excluded).not.toContain('models/wanted.stl');
  });

  it('agrees with `git check-ignore` on every path, a directory included', async () => {
    const files = {
      '.gitignore': [
        '*.o',
        '!important.o',
        'build/',
        'logs/*',
        '!logs/.keep',
        '/root-only',
        'a/**/b',
        'x/**',
        '**/y',
      ].join('\n'),
      'sub/.gitignore': '!*.o\nlocal/\n',
    };
    const root = await repository(files, []);
    const paths = [
      'a.o',
      'important.o',
      'sub/a.o',
      'sub/deep/a.o',
      'build',
      'deep/build',
      'logs/a',
      'logs/.keep',
      'root-only',
      'deep/root-only',
      'a/b',
      'a/x/b',
      'a/x/y/b',
      'x/anything/here',
      'y',
      'deep/y',
      'sub/local',
      'plain',
    ];
    const directories = new Set(['build', 'deep/build', 'sub/local']);
    const reported = new Set(
      git(
        root,
        ['check-ignore', '--no-index', '--stdin', '-z'],
        `${paths.map((path) => (directories.has(path) ? `${path}/` : path)).join('\0')}\0`,
      )
        .split('\0')
        .filter((path) => path !== '')
        .map((path) => path.replace(/\/$/u, '')),
    );
    const everything = [...paths, ...Object.keys(files)];
    const listing = await ignoredUntrackedPaths(
      {
        readdir: async (path) => {
          const prefix = path === '' ? '' : `${path}/`;
          const names = new Set(
            everything.flatMap((candidate) =>
              candidate.startsWith(prefix) ? [candidate.slice(prefix.length).split('/')[0]!] : [],
            ),
          );
          return [...names];
        },
        kind: async (path) =>
          path === '' || directories.has(path) || everything.some((candidate) => candidate.startsWith(`${path}/`))
            ? 'directory'
            : everything.includes(path)
              ? 'file'
              : undefined,
        readText: async (path) => (files as Record<string, string>)[path],
      },
      { tracked: new Set(Object.keys(files)) },
    );
    const covered = (path: string): boolean =>
      listing.some(
        (entry) => entry === path || entry === `${path}/` || (entry.endsWith('/') && path.startsWith(entry)),
      );

    expect(paths.map((path) => [path, covered(path)])).toStrictEqual(paths.map((path) => [path, reported.has(path)]));
  });

  /*
   * Each pattern in a directory of its own, so one repository and one
   * `check-ignore` per case setting answer every pattern against every path:
   * wildmatch's corners (`**` after a literal prefix, three stars before a slash, byte-wise `?` and
   * classes, reversed ranges, unknown and unterminated classes) and the line
   * format's (escaped and lone trailing `\`).
   */
  it.each([false, true])(
    'matches as `git check-ignore` matches, pattern by pattern (core.ignoreCase %s)',
    async (ignoreCase) => {
      const patterns = [
        'a/**/b',
        'a**/b',
        'lib**/gen',
        '***/c',
        '**/**/c',
        'a/**/**/b',
        String.raw`\*\*/c`,
        '/**',
        '**/',
        'a/**',
        '*/b',
        'a/*/b',
        '?.txt',
        '[!a].txt',
        'é.txt',
        '[z-a]',
        'x[z-a]',
        '[[:foo:]]',
        '[[:foo:]]x',
        '[[:upper:]]u',
        '[[:alpha:]-z]x',
        '[[]x',
        '[]]x',
        '[!]]z',
        '[a-]y',
        String.raw`[\-z]x`,
        'x[]',
        'foo\\',
        String.raw`foo\\ `,
        String.raw`foo\ `,
        '*.TXT',
        '[A-Z]u',
        '[A]u',
        String.raw`\Au`,
        String.raw`a\/b`,
        'a?b',
        'a[/]b',
      ];
      const paths = [
        'a/b',
        'a/x/b',
        'a/x/y/b',
        'ab/b',
        'axb',
        'a-b',
        'lib/gen',
        'libx/y/gen',
        'lib/a/gen',
        'c',
        'x/y/c',
        '**/c',
        'b',
        'x/b',
        'a.txt',
        'b.txt',
        'é.txt',
        'ü.txt',
        'A.TXT',
        'z',
        'w',
        'xa',
        'fx',
        'Uu',
        'uu',
        'Au',
        'au',
        '-x',
        'zx',
        '[x',
        ']x',
        ']z',
        'zz',
        '-y',
        'ay',
        'x[]',
        'foo',
        'foo\\',
        'foo ',
      ];
      const files = Object.fromEntries(
        patterns.map((pattern, index) => [`p${String(index)}/.gitignore`, `${pattern}\n`]),
      );
      const root = await repository(files, [], { ignoreCase });
      const queried = patterns.flatMap((_, index) => paths.map((path) => `p${String(index)}/${path}`));
      const reported = new Set(
        git(root, ['check-ignore', '--no-index', '--stdin', '-z'], `${queried.join('\0')}\0`)
          .split('\0')
          .filter((path) => path !== ''),
      );
      const listing = await ignoredAmong(
        {
          readdir: async () => [],
          kind: async (path) =>
            path === '' || queried.some((candidate) => candidate.startsWith(`${path}/`))
              ? 'directory'
              : queried.includes(path) || path in files
                ? 'file'
                : undefined,
          readText: async (path) => files[path],
        },
        { tracked: new Set(), ignoreCase },
        queried,
      );

      const verdicts = (ignored: (path: string) => boolean) =>
        patterns.map((pattern, index) => [pattern, paths.filter((path) => ignored(`p${String(index)}/${path}`))]);
      expect(verdicts((path) => excludedBy(listing, [path]).length > 0)).toStrictEqual(
        verdicts((path) => reported.has(path)),
      );
    },
  );

  it.each([false, true])(
    'folds case exactly where the repository’s own core.ignoreCase (%s) asks',
    async (ignoreCase) => {
      const files = {
        '.gitignore': '*.LOG\nBuild/\n/Docs/Draft.md\n[A-C]*.tmp\n',
        'a.log': '',
        'B.Log': '',
        'build/out.stl': '',
        'docs/draft.md': '',
        'b.tmp': '',
        'D.tmp': '',
        'plain.txt': '',
      };
      const root = await repository(files, ['.gitignore'], { ignoreCase });

      const excluded = await expectGitsListing(root, Object.keys(files), { tracked: ['.gitignore'], ignoreCase });
      expect(excluded.length > 0).toBe(ignoreCase);
    },
  );

  it('drops a leading byte-order mark, as Git does', async () => {
    const files = { '.gitignore': '﻿*.log\n', 'a.log': '', 'plain.txt': '' };
    const root = await repository(files, ['.gitignore']);

    expect(await expectGitsListing(root, Object.keys(files), { tracked: ['.gitignore'] })).toStrictEqual(['a.log']);
  });

  it('never reads a `.gitignore` that is a symbolic link, as Git refuses to', async () => {
    const files = { 'rules.txt': '*.log\n', 'sub/a.log': '', 'b.log': '' };
    const root = await repository(files, ['rules.txt']);
    await symlink('../rules.txt', join(root, 'sub', '.gitignore'));
    await symlink('rules.txt', join(root, '.gitignore'));

    expect(await expectGitsListing(root, Object.keys(files), { tracked: ['rules.txt'] })).toStrictEqual([]);
  });

  it('never ignores a tracked path, and never looks inside an untracked repository', async () => {
    const files = {
      '.gitignore': '*.log\nbuild/\n',
      'build/tracked.txt': '',
      'build/new.txt': '',
      'build/sub/x': '',
      'tracked.log': '',
      'plain.txt': '',
    };
    const tracked = ['.gitignore', 'build/tracked.txt', 'tracked.log'];
    const root = await repository(files, tracked);
    await mkdir(join(root, 'inner'));
    git(join(root, 'inner'), ['init', '--quiet']);
    await writeFile(join(root, 'inner', 'x.log'), '');

    expect(await expectGitsListing(root, [...Object.keys(files), 'inner/x.log'], { tracked })).toStrictEqual([
      'build/new.txt',
      'build/sub/x',
    ]);
  });

  it('walks a directory whose gitfile names no repository, as Git does, and never one whose gitfile does', async () => {
    const files = {
      '.gitignore': '*.log\n',
      'broken/.git': 'gitdir: ../nowhere\n',
      'broken/a.log': '',
      'linked/.git': 'gitdir: ../store\n',
      'linked/b.log': '',
      'garbled/.git': 'not a gitfile\n',
      'garbled/c.log': '',
    };
    const root = await repository(files, ['.gitignore']);
    git(root, ['init', '--quiet', '--bare', 'store']);
    const paths = [...Object.keys(files).filter((path) => !path.endsWith('/.git')), 'store/HEAD'];

    expect(await expectGitsListing(root, paths, { tracked: ['.gitignore'] })).toStrictEqual([
      'broken/a.log',
      'garbled/c.log',
    ]);
  });

  it('compiles nothing for blank lines and comments', () => {
    expect(parseIgnoreRules('\n# a comment\n   \n')).toStrictEqual([]);
  });
});

/*
 * The two ports over one real repository: the native leg asks Git, the
 * browser leg reads the rules itself, and both answer the whole checkout and
 * the named paths alike (I5), under the store's own `core.ignoreCase`.
 */
describe.runIf(gitToolchainOnPath)('both legs read a checkout’s ignore rules alike', () => {
  it.each([false, true])(
    'lists, answers named paths and reports its context as the other leg does (core.ignoreCase %s)',
    async (ignoreCase) => {
      const files = {
        '.gitignore': '*.LOG\nBuild/\n',
        'sub/.gitignore': '!keep.log\n',
        'a.log': '',
        'B.Log': '',
        'sub/keep.log': '',
        'sub/b.log': '',
        'build/x.stl': '',
        'tracked.log': '',
        'plain.txt': '',
        'other.txt': '',
      };
      const tracked = ['.gitignore', 'sub/.gitignore', 'tracked.log', 'plain.txt'];
      const root = await repository(files, tracked, { exclude: 'other.txt\n', ignoreCase });
      const native = createNativeGitRevisionPort({ repositoryPath: root });
      const browser = createIsomorphicGitRevisionPort({ filesystem: new NodeFsProvider(root) });
      const paths = Object.keys(files);
      const expected = excludedBy(listedByGit(root), paths);

      for (const port of [native, browser]) {
        // oxlint-disable-next-line no-await-in-loop -- two ports, each asked in turn.
        expect(excludedBy((await port.ignoredPaths?.()) ?? [], paths)).toStrictEqual(expected);
        // oxlint-disable-next-line no-await-in-loop -- see above.
        expect(excludedBy((await port.ignoredPaths?.(undefined, paths)) ?? [], paths)).toStrictEqual(expected);
      }
      expect(expected).toContain('other.txt');
      expect(expected.includes('a.log')).toBe(ignoreCase);
      const before = await native.ignoreContext?.();
      expect(await browser.ignoreContext?.()).toBe(before);

      await writeFile(join(root, '.git', 'info', 'exclude'), 'plain.txt\n');
      const after = await native.ignoreContext?.();
      expect(after).not.toBe(before);
      expect(await browser.ignoreContext?.()).toBe(after);

      /* `git config` while both ports are open: each reads the store's setting again, and lists by it. */
      git(root, ['config', 'core.ignoreCase', String(!ignoreCase)]);
      const flipped = await native.ignoreContext?.();
      expect(flipped).not.toBe(after);
      expect(await browser.ignoreContext?.()).toBe(flipped);
      const relisted = excludedBy(listedByGit(root), paths);
      expect(excludedBy((await native.ignoredPaths?.()) ?? [], paths)).toStrictEqual(relisted);
      expect(excludedBy((await browser.ignoredPaths?.()) ?? [], paths)).toStrictEqual(relisted);
    },
  );

  it('answers paths two levels inside an ignored folder, alone and in one batch, as the whole listing does', async () => {
    const files = {
      '.gitignore': 'build/\n*.log\n',
      'build/deep/o.js': '',
      'build/deep/x/p.js': '',
      'build/a.js': '',
      'src/deep/q.log': '',
      'src/deep/r.ts': '',
    };
    const root = await repository(files, ['.gitignore']);
    const native = createNativeGitRevisionPort({ repositoryPath: root });
    const browser = createIsomorphicGitRevisionPort({ filesystem: new NodeFsProvider(root) });
    const expected = excludedBy(listedByGit(root), Object.keys(files));
    const batches = [
      ['build/deep/o.js'],
      ['build/deep/o.js', 'build/deep/x/p.js'],
      ['build/deep/x/p.js', 'build/a.js'],
      ['src/deep/q.log', 'src/deep/r.ts'],
    ];

    for (const port of [native, browser]) {
      for (const batch of batches) {
        // oxlint-disable-next-line no-await-in-loop -- each port and batch in turn.
        const answer = (await port.ignoredPaths?.(undefined, batch)) ?? [];
        expect(excludedBy(answer, batch)).toStrictEqual(batch.filter((path) => expected.includes(path)));
      }
    }
    expect(expected).toStrictEqual(['build/deep/o.js', 'build/deep/x/p.js', 'build/a.js', 'src/deep/q.log']);
  });
});
