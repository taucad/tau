/**
 * Tau's revision tree and the person's own Git on one native store, end to end.
 *
 * | Row | Acceptance |
 * | --- | --- |
 * | 1 | with a partial `git add -p` staged, a Tau save lands and the staging is unchanged |
 * | 3 | staging of one file survives a Tau save of another: `git diff --cached` names only the staged hunk, and `git commit` records it on top of Tau's head without undoing the save |
 * | 2 | during a conflicted `git merge`, no save is minted until the merge ends, and the status says why; the save then lands on the person's merge commit |
 *
 * The whole tree runs as a host runs it, over `NodeFsProvider` and the native
 * port; stock `git` is the person's.
 */

import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { afterAll, describe, expect, it } from 'vitest';

import { createNativeGitRevisionPort } from '#native-git-port.js';
import { selectRevisionStatus } from '#project-revisions.machine.js';
import type { RevisionUserActor } from '#revision-authority.js';
import { createProjectRevisionsActor } from '#revision-effects.js';
import type { RevisionPort } from '#revision-port.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';

const author = { name: 'Tau', email: 'noreply@tau.new' };
const ada: RevisionUserActor = { kind: 'user', id: 'user-ada', name: 'Ada' };
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
  const result = spawnSync('git', args, {
    cwd,
    input,
    encoding: 'utf8',
    env: personEnvironment(),
  });
  return { status: result.status ?? -1, stdout: result.stdout };
};

const gitOk = (cwd: string, args: readonly string[], input?: string): string => {
  const result = git(cwd, args, input);
  expect(result.status, `git ${args.join(' ')}`).toBe(0);
  return result.stdout;
};

const lines = (count: number): string =>
  Array.from({ length: count }, (_, index) => `line ${String(index + 1)}\n`).join('');

/** A native project with one saved revision on `main`, and the revision tree running over it. */
const started = async (files: Readonly<Record<string, string>>) => {
  const root = await mkdtemp(join(tmpdir(), 'tau-coexist-tree-'));
  roots.push(root);
  const filesystem = new NodeFsProvider(root);
  for (const [path, content] of Object.entries(files)) {
    // oxlint-disable-next-line no-await-in-loop -- a handful of fixture files, in order.
    await filesystem.writeFile(path, content);
  }
  const port: RevisionPort = createNativeGitRevisionPort({ repositoryPath: root });
  await port.init({ author });
  const { actor } = createProjectRevisionsActor({
    port,
    projectId: 'project-1',
    filesystem: async () => filesystem,
    identity: { via: 'browser', resolve: () => ada },
  });
  actor.start();
  await expect.poll(() => actor.getSnapshot().context.registrySettled, { timeout: 10_000 }).toBe(true);
  let saves = 0;
  /* A person's save: the request is answered once, with what the checkout did. */
  const save = async (): Promise<string> => {
    saves += 1;
    const requestId = `save:${String(saves)}`;
    const answer = Promise.withResolvers<string>();
    const subscriptions = (['revisionMinted', 'nothingToSave', 'cutFailed', 'casLost'] as const).map((type) =>
      actor.on(type, (event: Readonly<{ requestId?: string; type: string }>) => {
        if (event.requestId === requestId) {
          answer.resolve(event.type);
        }
      }),
    );
    actor.send({ type: 'cut', requestId, trigger: 'save', checkoutId: 'live', leaseIds: [] });
    try {
      return await answer.promise;
    } finally {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
    }
  };
  expect(await save()).toBe('revisionMinted');
  gitOk(root, ['status', '--porcelain']);
  return { root, filesystem, port, actor, save };
};

describe.runIf(gitToolchainOnPath)('Tau beside the person’s Git', () => {
  it('row 1: a save lands under a partial `git add -p` and leaves the staging as it was', async () => {
    const original = lines(20);
    const { root, filesystem, port, actor, save } = await started({ 'part.txt': original });
    const before = String(await port.readRef('main'));
    const edited = original.replace('line 2\n', 'line 2 staged\n').replace('line 19\n', 'line 19 unstaged\n');
    await filesystem.writeFile('part.txt', edited);
    gitOk(root, ['add', '-p', 'part.txt'], 'y\nn\n');
    const staged = gitOk(root, ['diff', '--cached']);
    const stagedTree = gitOk(root, ['write-tree']);

    expect(await save()).toBe('revisionMinted');

    expect(await port.readRef('main')).not.toBe(before);
    expect(gitOk(root, ['write-tree'])).toBe(stagedTree);
    expect(gitOk(root, ['diff', '--cached', before])).toBe(staged);
    /* The save recorded the unstaged hunk too: the person's entry stays, and Git shows both. */
    expect(gitOk(root, ['status', '--porcelain', '--', 'part.txt'])).toBe('MM part.txt\n');
    actor.stop();
  }, 60_000);

  it('row 3: a save of one file leaves the staged hunk of another for a plain `git commit`', async () => {
    const original = lines(20);
    const { root, filesystem, port, actor, save } = await started({ 'a.txt': original, 'b.txt': 'b one\n' });
    /* The person stages one hunk of `a.txt` from a patch, leaving its file as it was. */
    const patch = [
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,3 +1,3 @@',
      ' line 1',
      '-line 2',
      '+line 2 staged',
      ' line 3',
      '',
    ].join('\n');
    gitOk(root, ['apply', '--cached'], patch);
    const staged = gitOk(root, ['diff', '--cached']);

    await filesystem.writeFile('b.txt', 'b two\n');
    expect(await save()).toBe('revisionMinted');
    const tau = String(await port.readRef('main'));

    expect(gitOk(root, ['diff', '--cached'])).toBe(staged);
    gitOk(root, ['commit', '--quiet', '-m', 'Staged hunk']);
    expect(gitOk(root, ['rev-parse', 'HEAD~1']).trim()).toBe(tau);
    expect(gitOk(root, ['show', 'HEAD:b.txt'])).toBe('b two\n');
    expect(gitOk(root, ['show', 'HEAD:a.txt'])).toContain('line 2 staged');
    actor.stop();
  }, 60_000);

  it('row 2: no save is minted during a conflicted merge, the status says why, and the save lands after it', async () => {
    const { root, filesystem, port, actor, save } = await started({ 'a.txt': 'base\n' });
    gitOk(root, ['switch', '-c', 'theirs']);
    await filesystem.writeFile('a.txt', 'theirs\n');
    gitOk(root, ['commit', '-am', 'Theirs']);
    gitOk(root, ['switch', 'main']);
    await filesystem.writeFile('a.txt', 'ours\n');
    expect(await save()).toBe('revisionMinted');
    const ours = String(await port.readRef('main'));

    expect(git(root, ['merge', 'theirs']).status).not.toBe(0);
    expect(await filesystem.readFile('a.txt', 'utf8')).toContain('<<<<<<<');
    const answered = save();

    await expect
      .poll(() => selectRevisionStatus(actor.getSnapshot()).waiting, { timeout: 10_000 })
      .toEqual({ kind: 'merge' });
    /* Several looks at the store later, nothing has been recorded over the conflict markers. */
    await new Promise((resolve) => {
      setTimeout(resolve, 5000);
    });
    expect(await port.readRef('main')).toBe(ours);
    expect(selectRevisionStatus(actor.getSnapshot()).waiting).toEqual({ kind: 'merge' });

    /* The person resolves and commits the merge. */
    await filesystem.writeFile('a.txt', 'ours and theirs\n');
    gitOk(root, ['commit', '-am', 'Merge theirs']);
    const merged = gitOk(root, ['rev-parse', 'HEAD']).trim();

    /* The waiting save reads the merge commit as its head: its files are that commit's, so nothing is left to record. */
    expect(await answered).toBe('nothingToSave');
    expect(selectRevisionStatus(actor.getSnapshot()).waiting).toBeUndefined();
    expect(await port.readRef('main')).toBe(merged);

    await filesystem.writeFile('a.txt', 'after the merge\n');
    expect(await save()).toBe('revisionMinted');
    expect(gitOk(root, ['rev-parse', 'HEAD~1']).trim()).toBe(merged);
    actor.stop();
  }, 60_000);
});
