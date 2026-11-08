/**
 * Git's ignore rules on a leg with no Git (the browser), checked against
 * `git check-ignore` and `git ls-files --others --ignored` on real repositories.
 */
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ignoredUntrackedPaths, parseIgnoreRules } from '#git-ignore.js';
import type { IgnoreWalkFiles } from '#git-ignore.js';
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
  exclude?: string,
): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-git-ignore-'));
  roots.push(root);
  git(root, ['init', '--quiet']);
  for (const [path, content] of Object.entries(files)) {
    // oxlint-disable-next-line no-await-in-loop -- parents first.
    await mkdir(join(root, path, '..'), { recursive: true });
    // oxlint-disable-next-line no-await-in-loop -- see above.
    await writeFile(join(root, path), content);
  }
  if (exclude !== undefined) {
    await writeFile(join(root, '.git', 'info', 'exclude'), exclude);
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

const nodeFiles = (root: string): IgnoreWalkFiles => ({
  readdir: async (path) => readdir(join(root, path)),
  isDirectory: async (path) => {
    const stat = await lstat(join(root, path));
    return stat.isDirectory();
  },
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

const ours = async (root: string, tracked: readonly string[]): Promise<readonly string[]> =>
  ignoredUntrackedPaths(nodeFiles(root), {
    tracked: new Set(tracked),
    exclude: await readOptional(join(root, '.git', 'info', 'exclude')),
    skip: (path) => path === '.git',
  });

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
    const root = await repository(files, tracked, '/excluded/\n');
    const paths = Object.keys(files);

    const excluded = excludedBy(await ours(root, tracked), paths);
    expect(excluded).toStrictEqual(excludedBy(listedByGit(root), paths));
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
    const listing = await ignoredUntrackedPaths(
      {
        readdir: async (path) => {
          const prefix = path === '' ? '' : `${path}/`;
          const names = new Set(
            [...paths, ...Object.keys(files)].flatMap((candidate) =>
              candidate.startsWith(prefix) ? [candidate.slice(prefix.length).split('/')[0]!] : [],
            ),
          );
          return [...names];
        },
        isDirectory: async (path) =>
          directories.has(path) ||
          [...paths, ...Object.keys(files)].some((candidate) => candidate.startsWith(`${path}/`)),
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
    const paths = [...Object.keys(files), 'inner/x.log'];

    const listed = await ours(root, tracked);
    expect(excludedBy(listed, paths)).toStrictEqual(excludedBy(listedByGit(root), paths));
    expect(excludedBy(listed, paths)).toStrictEqual(['build/new.txt', 'build/sub/x']);
  });

  it('compiles nothing for blank lines and comments', () => {
    expect(parseIgnoreRules('\n# a comment\n   \n')).toStrictEqual([]);
  });
});
