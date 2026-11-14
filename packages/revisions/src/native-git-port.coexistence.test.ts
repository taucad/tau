/**
 * The native store shared with the person's own Git (engine coexistence).
 *
 * | Row | Acceptance |
 * | --- | --- |
 * | 1 | an index the person staged into with `git add -p` survives a Tau head move, byte for byte |
 * | 2 | an index nobody staged into still follows the head, so `git status` stays clean (R14) |
 * | 3 | a branch switch keeps staging too |
 * | 4 | an `index.lock` the person's Git holds is neither replaced nor removed |
 * | 5 | `gitOperation` names a stopped merge, cherry-pick, revert or rebase, a detached head with the way back, and a held lock |
 * | 6 | a linked checkout answers for its own admin directory |
 * | 7 | staging of one file is carried onto a Tau save of another: `git diff --cached` names only it, and `git commit` records it on top of Tau's head without undoing Tau's save |
 * | 8 | a staged file the Tau save also changed keeps the person's entry, and `git status` shows it staged and modified |
 * | 9 | a rebase whose todo holds an `exec` or `x` line says it runs commands, a real one and a planted one, even beside a planted `MERGE_HEAD`; a todo without one, or with it only in a comment, is a plain rebase (LP7) |
 *
 * Every row drives stock `git` beside the port on a real repository.
 */

import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import type { RevisionId } from '#algorithms/index.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import type { RevisionPort } from '#revision-port.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';
import { recordedBy } from '#test/identity.js';

const author = { name: 'Tau', email: 'tau@example.com' };
const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/* The person's Git: their own identity, none of the caller's `GIT_*`. */
const personEnvironment = (): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
  );
  // Environment names, not identifiers: assigned rather than spelled as keys.
  for (const [name, value] of [
    ['GIT_AUTHOR_NAME', 'Person'],
    ['GIT_AUTHOR_EMAIL', 'person@example.com'],
    ['GIT_COMMITTER_NAME', 'Person'],
    ['GIT_COMMITTER_EMAIL', 'person@example.com'],
    ['GIT_EDITOR', 'true'],
  ] as const) {
    environment[name] = value;
  }
  return environment;
};

const git = (cwd: string, args: readonly string[], input?: string): Readonly<{ status: number; stdout: string }> => {
  const result = spawnSync('git', args, { cwd, input, encoding: 'utf8', env: personEnvironment() });
  return { status: result.status ?? -1, stdout: result.stdout };
};

const gitOk = (cwd: string, args: readonly string[], input?: string): string => {
  const result = git(cwd, args, input);
  expect(result.status, `git ${args.join(' ')}`).toBe(0);
  return result.stdout;
};

const lines = (count: number, label = 'line'): string =>
  Array.from({ length: count }, (_, index) => `${label} ${String(index + 1)}\n`).join('');

type Repository = Readonly<{
  path: string;
  port: RevisionPort;
  mint: (files: Record<string, string>) => Promise<RevisionId>;
}>;

/** A Tau store whose `main` names `files`, with the same bytes on disk and an index stock Git reads clean. */
const repository = async (files: Record<string, string>): Promise<Repository> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-coexist-'));
  roots.push(root);
  const path = join(root, 'project');
  const checkouts = { projectId: 'coexist', directory: join(root, 'checkouts') };
  spawnSync('mkdir', ['-p', path]);
  const port = createNativeGitRevisionPort({ repositoryPath: path, checkouts });
  await port.init({ author });
  /* The setup files `init` wrote are part of every revision, as a capture would find them. */
  const setup = Object.fromEntries(
    gitOk(path, ['ls-files', '--others', '--exclude-standard'])
      .split('\n')
      .filter((name) => name !== '')
      .map((name) => [name, '']),
  );
  for (const name of Object.keys(setup)) {
    // oxlint-disable-next-line no-await-in-loop -- one or two setup files.
    setup[name] = await readFile(join(path, name), 'utf8');
  }
  /* Tau's mint: a revision of the bytes on disk, published expected-old as the checkout's `casHead` does. */
  const mint = async (next: Record<string, string>): Promise<RevisionId> => {
    const parent = await port.readRef('main');
    const receipt = await port.writeRevision({
      parents: parent === undefined ? [] : [parent],
      tree: new ImmutableRevisionTree(Object.entries({ ...setup, ...next })),
      provenance: { source: 'user', ...recordedBy('test'), createdAt: 1 },
      summary: { generated: 'Save' },
    });
    const head = revisionId(receipt.commitId);
    const moved = await port.updateRef({ name: 'main', expectedHead: parent, head });
    expect(moved.status).toBe('updated');
    return head;
  };
  for (const [name, content] of Object.entries(files)) {
    // oxlint-disable-next-line no-await-in-loop -- a handful of fixture files, in order.
    await writeFile(join(path, name), content);
  }
  await mint(files);
  expect(gitOk(path, ['status', '--porcelain'])).toBe('');
  return { path, port, mint };
};

describe.runIf(gitToolchainOnPath)('native store beside stock Git', () => {
  it('row 1: keeps a partial `git add -p` through a Tau save', async () => {
    const original = lines(20);
    const { path, mint } = await repository({ 'part.txt': original });
    const before = String(gitOk(path, ['rev-parse', 'HEAD'])).trim();
    /* Two hunks far apart; the person stages the first and leaves the second. */
    const edited = original.replace('line 2\n', 'line 2 staged\n').replace('line 19\n', 'line 19 unstaged\n');
    await writeFile(join(path, 'part.txt'), edited);
    gitOk(path, ['add', '-p', 'part.txt'], 'y\nn\n');
    const staged = gitOk(path, ['diff', '--cached']);
    expect(staged).toContain('+line 2 staged');
    expect(staged).not.toContain('line 19 unstaged');
    const stagedTree = gitOk(path, ['write-tree']);

    /* Tau's autosave records the whole file and moves `main`. */
    const after = await mint({ 'part.txt': edited });

    expect(String(gitOk(path, ['rev-parse', 'HEAD'])).trim()).toBe(after);
    expect(gitOk(path, ['write-tree'])).toBe(stagedTree);
    expect(gitOk(path, ['diff', '--cached', before])).toBe(staged);
    expect(await readFile(join(path, 'part.txt'), 'utf8')).toBe(edited);
  });

  it('row 2: still points an index nobody staged into at the new head', async () => {
    const { path, mint } = await repository({ 'a.txt': 'one\n' });
    await writeFile(join(path, 'a.txt'), 'two\n');
    await mint({ 'a.txt': 'two\n' });

    expect(gitOk(path, ['status', '--porcelain'])).toBe('');
    expect(gitOk(path, ['diff', '--cached'])).toBe('');
  });

  it('row 3: keeps staging through a branch switch', async () => {
    const { path, port } = await repository({ 'a.txt': 'one\n' });
    const head = await port.readRef('main');
    await port.updateRef({ name: 'side', expectedHead: undefined, head });
    await writeFile(join(path, 'b.txt'), 'staged\n');
    gitOk(path, ['add', 'b.txt']);
    const stagedTree = gitOk(path, ['write-tree']);

    await port.setHead('side');

    expect(gitOk(path, ['symbolic-ref', 'HEAD']).trim()).toBe('refs/heads/side');
    expect(gitOk(path, ['write-tree'])).toBe(stagedTree);
  });

  it('row 4: leaves an index lock the person holds alone', async () => {
    const { path, mint } = await repository({ 'a.txt': 'one\n' });
    const index = await readFile(join(path, '.git', 'index'));
    await writeFile(join(path, '.git', 'index.lock'), 'theirs');
    await writeFile(join(path, 'a.txt'), 'two\n');
    await mint({ 'a.txt': 'two\n' });

    expect(await readFile(join(path, '.git', 'index.lock'), 'utf8')).toBe('theirs');
    expect(await readFile(join(path, '.git', 'index'))).toEqual(index);
  });

  it('row 5: names each operation stock Git leaves in progress', async () => {
    const { path, port, mint } = await repository({ 'a.txt': 'base\n' });
    expect(await port.gitOperation?.()).toBeUndefined();

    /* A conflicting commit of the person's own on another branch. */
    gitOk(path, ['switch', '-c', 'theirs']);
    await writeFile(join(path, 'a.txt'), 'theirs\n');
    gitOk(path, ['commit', '-am', 'Theirs']);
    const theirs = gitOk(path, ['rev-parse', 'HEAD']).trim();
    gitOk(path, ['switch', 'main']);
    await writeFile(join(path, 'a.txt'), 'ours\n');
    await mint({ 'a.txt': 'ours\n' });

    expect(git(path, ['merge', 'theirs']).status).not.toBe(0);
    expect(await port.gitOperation?.()).toEqual({ kind: 'merge' });
    gitOk(path, ['merge', '--abort']);
    expect(await port.gitOperation?.()).toBeUndefined();

    expect(git(path, ['cherry-pick', theirs]).status).not.toBe(0);
    expect(await port.gitOperation?.()).toEqual({ kind: 'cherryPick' });
    gitOk(path, ['cherry-pick', '--abort']);

    expect(git(path, ['rebase', 'theirs']).status).not.toBe(0);
    expect(await port.gitOperation?.()).toEqual({ kind: 'rebase' });
    gitOk(path, ['rebase', '--abort']);

    gitOk(path, ['switch', '--detach', theirs]);
    expect(await port.gitOperation?.()).toEqual({ kind: 'detached', branch: 'main' });
    gitOk(path, ['switch', 'main']);
    expect(await port.gitOperation?.()).toBeUndefined();

    gitOk(path, ['revert', '--no-edit', 'HEAD']);
    await writeFile(join(path, 'a.txt'), 'ours again\n');
    gitOk(path, ['commit', '-am', 'Again']);
    expect(git(path, ['revert', 'HEAD~1']).status).not.toBe(0);
    expect(await port.gitOperation?.()).toEqual({ kind: 'revert' });
    gitOk(path, ['revert', '--abort']);

    await writeFile(join(path, '.git', 'index.lock'), '');
    expect(await port.gitOperation?.()).toEqual({ kind: 'locked' });
  });

  it('row 9: says a rebase whose todo holds an exec line runs commands', async () => {
    const { path, port, mint } = await repository({ 'a.txt': 'base\n' });
    gitOk(path, ['switch', '-c', 'theirs']);
    await writeFile(join(path, 'a.txt'), 'theirs\n');
    gitOk(path, ['commit', '-am', 'Theirs']);
    gitOk(path, ['switch', 'main']);
    await writeFile(join(path, 'a.txt'), 'ours\n');
    await mint({ 'a.txt': 'ours\n' });

    /* Stock Git's own: stopped on the conflict, `exec true` still to run. */
    expect(git(path, ['rebase', '--exec', 'true', 'theirs']).status).not.toBe(0);
    expect(await port.gitOperation?.()).toEqual({ kind: 'rebase', runsCommands: true });
    gitOk(path, ['rebase', '--abort']);
    expect(await port.gitOperation?.()).toBeUndefined();

    /* Planted whole, as threat probe case 11 plants it. */
    const head = gitOk(path, ['rev-parse', 'HEAD']);
    const rebase = join(path, '.git', 'rebase-merge');
    spawnSync('mkdir', ['-p', rebase]);
    for (const [name, content] of [
      ['onto', head],
      ['orig-head', head],
      ['head-name', 'refs/heads/main\n'],
      ['interactive', ''],
      ['done', ''],
      ['end', '1\n'],
      ['msgnum', '0\n'],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- a handful of small files.
      await writeFile(join(rebase, name), content);
    }
    const todo = join(rebase, 'git-rebase-todo');
    await writeFile(todo, 'exec ./planted.sh\n');
    expect(await port.gitOperation?.()).toEqual({ kind: 'rebase', runsCommands: true });
    await writeFile(todo, `pick ${head.trim()} Ours\n  x ./planted.sh\n`);
    expect(await port.gitOperation?.()).toEqual({ kind: 'rebase', runsCommands: true });

    /* A planted `MERGE_HEAD` would otherwise name a merge and hide the warning. */
    await writeFile(join(path, '.git', 'MERGE_HEAD'), head);
    expect(await port.gitOperation?.()).toEqual({ kind: 'rebase', runsCommands: true });
    await rm(join(path, '.git', 'MERGE_HEAD'));

    await writeFile(todo, `pick ${head.trim()} Ours\n# exec ./planted.sh\n`);
    expect(await port.gitOperation?.()).toEqual({ kind: 'rebase' });
  });

  it('row 7: carries staging of one file onto a Tau save of another', async () => {
    const original = lines(20);
    const { path, port, mint } = await repository({ 'a.txt': original, 'b.txt': 'b one\n', 'c.txt': 'c\n' });
    /* The person stages one hunk of `a.txt` and the removal of `c.txt`. */
    await writeFile(
      join(path, 'a.txt'),
      original.replace('line 2\n', 'line 2 staged\n').replace('line 19\n', 'line 19 unstaged\n'),
    );
    gitOk(path, ['add', '-p', 'a.txt'], 'y\nn\n');
    gitOk(path, ['rm', '--quiet', 'c.txt']);
    const staged = gitOk(path, ['diff', '--cached']);

    /* Tau saves `b.txt` alone. */
    await writeFile(join(path, 'b.txt'), 'b two\n');
    const tau = await mint({ 'a.txt': original, 'b.txt': 'b two\n', 'c.txt': 'c\n' });

    expect(gitOk(path, ['diff', '--cached'])).toBe(staged);
    expect(gitOk(path, ['diff', '--cached', '--name-only'])).toBe('a.txt\nc.txt\n');
    gitOk(path, ['commit', '--quiet', '-m', 'Staged hunk']);
    expect(gitOk(path, ['rev-parse', 'HEAD~1']).trim()).toBe(tau);
    expect(gitOk(path, ['show', 'HEAD:b.txt'])).toBe('b two\n');
    expect(gitOk(path, ['show', 'HEAD:a.txt'])).toContain('line 2 staged');
    expect(gitOk(path, ['show', 'HEAD:a.txt'])).not.toContain('unstaged');
    expect(git(path, ['cat-file', '-e', 'HEAD:c.txt']).status).not.toBe(0);
    expect(await port.readRef('main')).toBe(revisionId(gitOk(path, ['rev-parse', 'HEAD']).trim()));
  });

  it('row 8: keeps the person\u2019s entry for a staged file the Tau save also changed, and shows both', async () => {
    const original = lines(20);
    const { path, mint } = await repository({ 'a.txt': original, 'b.txt': 'b one\n' });
    const edited = original.replace('line 2\n', 'line 2 staged\n').replace('line 19\n', 'line 19 unstaged\n');
    await writeFile(join(path, 'a.txt'), edited);
    gitOk(path, ['add', '-p', 'a.txt'], 'y\nn\n');
    const stagedBlob = gitOk(path, ['rev-parse', ':a.txt']);

    /* Tau's save records the whole of `a.txt` and a change to `b.txt`. */
    await writeFile(join(path, 'b.txt'), 'b two\n');
    await mint({ 'a.txt': edited, 'b.txt': 'b two\n' });

    expect(gitOk(path, ['rev-parse', ':a.txt'])).toBe(stagedBlob);
    expect(gitOk(path, ['status', '--porcelain'])).toBe('MM a.txt\n');
    expect(gitOk(path, ['diff', '--cached', '--name-only'])).toBe('a.txt\n');
  });

  it('row 6: answers for a linked checkout from its own admin directory', async () => {
    const { path, port } = await repository({ 'a.txt': 'one\n' });
    const head = await port.readRef('main');
    await port.updateRef({ name: 'side', expectedHead: undefined, head });
    const linked = await port.addCheckout!({ branch: 'side' });

    gitOk(linked.root, ['switch', '--detach', 'HEAD']);
    expect(await port.gitOperation?.(linked.root)).toEqual({ kind: 'detached', branch: 'side' });
    expect(await port.gitOperation?.()).toBeUndefined();
    expect(gitOk(path, ['status', '--porcelain'])).toBe('');
  });
});
