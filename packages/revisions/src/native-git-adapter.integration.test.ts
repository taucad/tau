import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  ImmutableRevisionTree,
  materializedWorkspaceId,
  mergeRevisionTrees,
  revisionId,
} from '@taucad/filesystem/revisions';
import { RevisionAuthority, revisionBranchName } from '#revision-authority.js';
import type { RevisionId } from '@taucad/filesystem/revisions';
import type { Revision, RevisionProvenance } from '#revision-authority.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPortRevisionPersistence } from '#revision-persistence.js';
import type { RevisionPort } from '#revision-port.js';
import { createNativeGitAdapter, createNativeGitRevisionPort, NativeGitError } from '#node/index.js';

const execute = promisify(execFile);
const createdAt = Date.UTC(2026, 7, 28, 12, 0, 0);
const nativeGitIntegration = process.env['TAU_NATIVE_GIT_INTEGRATION'] === '1' ? describe : describe.skip;

const git = async (cwd: string, ...args: string[]): Promise<string> => {
  const result = await execute('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return result.stdout.trim();
};

const makeRevision = (options: {
  id: string;
  parents?: readonly RevisionId[];
  entries: Iterable<readonly [string, Uint8Array<ArrayBuffer> | string]>;
  source?: RevisionProvenance['source'];
}): Revision =>
  Object.freeze({
    id: revisionId(options.id),
    parents: Object.freeze([...(options.parents ?? [])]),
    tree: new ImmutableRevisionTree(options.entries),
    provenance: Object.freeze({
      source: options.source ?? 'agent',
      actorId: 'actor-local',
      runId: 'run-local',
      createdAt,
    }),
    summary: Object.freeze({ generated: `Revision ${options.id}` }),
  });

const hashFile = async (path: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Uint8Array<ArrayBuffer>);
  }
  return hash.digest('hex');
};

const waitForPath = async (path: string): Promise<void> => {
  for (let attempt = 0; attempt < 500; attempt++) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- bounded polling observes a subprocess-created sentinel.
      await stat(path);
      return;
    } catch {
      // oxlint-disable-next-line no-await-in-loop -- the sentinel needs a bounded polling interval.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
};

nativeGitIntegration('native Git adapter integration', () => {
  let temporaryRoot: string;
  let repositoryPath: string;
  let worktreeRoot: string;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'tau-native-git-'));
    repositoryPath = join(temporaryRoot, 'repository');
    worktreeRoot = join(temporaryRoot, 'worktrees');
    await execute('git', ['init', '--quiet', repositoryPath]);
  });

  afterEach(async () => {
    await rm(temporaryRoot, { force: true, recursive: true });
  });

  it('materializes concurrent detached worktrees without cross-workspace writes', async () => {
    const adapter = createNativeGitAdapter({ repositoryPath, worktreeRoot });
    const base = makeRevision({
      id: 'base',
      entries: [
        ['模型/part.txt', 'base'],
        ['shared.txt', 'same'],
      ],
    });
    const left = makeRevision({
      id: 'left',
      parents: [base.id],
      entries: [
        ['模型/part.txt', 'left'],
        ['left-only.txt', 'left'],
      ],
    });
    const right = makeRevision({
      id: 'right',
      parents: [base.id],
      entries: [
        ['模型/part.txt', 'right'],
        ['right-only.txt', 'right'],
      ],
    });

    const [leftWorkspace, rightWorkspace] = await Promise.all([
      adapter.bindWorkspace({
        workspaceId: materializedWorkspaceId('workspace-left'),
        runId: 'run-left',
        baseRevision: base,
      }),
      adapter.bindWorkspace({
        workspaceId: materializedWorkspaceId('workspace-right'),
        runId: 'run-right',
        baseRevision: base,
      }),
    ]);
    const [leftUpdate, rightUpdate] = await Promise.all([
      adapter.commitWorkspace({ workspace: leftWorkspace, expectedHead: base.id, revision: left }),
      adapter.commitWorkspace({ workspace: rightWorkspace, expectedHead: base.id, revision: right }),
    ]);

    expect(leftUpdate.status).toBe('updated');
    expect(rightUpdate.status).toBe('updated');
    expect(await readFile(join(leftWorkspace.rootPath, '模型/part.txt'), 'utf8')).toBe('left');
    expect(await readFile(join(rightWorkspace.rootPath, '模型/part.txt'), 'utf8')).toBe('right');
    await expect(readFile(join(leftWorkspace.rootPath, 'right-only.txt'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(join(rightWorkspace.rootPath, 'left-only.txt'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(await git(leftWorkspace.rootPath, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('HEAD');
    expect(await git(rightWorkspace.rootPath, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('HEAD');
  });

  it('atomically rejects a second run claiming the same workspace', async () => {
    const first = createNativeGitAdapter({ repositoryPath, worktreeRoot });
    const second = createNativeGitAdapter({ repositoryPath, worktreeRoot });
    const base = makeRevision({ id: 'ownership-base', entries: [['part.ts', 'base']] });
    const workspaceId = materializedWorkspaceId('owned-workspace');
    const outcomes = await Promise.allSettled([
      first.bindWorkspace({ workspaceId, runId: 'owner-a', baseRevision: base }),
      second.bindWorkspace({ workspaceId, runId: 'owner-b', baseRevision: base }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(rejected?.status).toBe('rejected');
    if (rejected?.status === 'rejected') {
      expect(rejected.reason).toBeInstanceOf(NativeGitError);
      if (rejected.reason instanceof NativeGitError) {
        expect(rejected.reason.code).toBe('WORKSPACE_OWNED');
      }
    }
  });

  it('stores logically identical revision metadata deterministically across adapter instances', async () => {
    const first = createNativeGitAdapter({ repositoryPath, worktreeRoot });
    const second = createNativeGitAdapter({ repositoryPath, worktreeRoot });
    const revision = makeRevision({ id: 'canonical-metadata', entries: [['part.ts', 'same']] });
    const reordered: Revision = Object.freeze({
      id: revision.id,
      parents: revision.parents,
      tree: revision.tree,
      provenance: Object.freeze({
        createdAt: revision.provenance.createdAt,
        runId: revision.provenance.runId,
        actorId: revision.provenance.actorId,
        source: revision.provenance.source,
      }),
      summary: Object.freeze({ generated: revision.summary.generated }),
    });

    const [left, right] = await Promise.all([first.storeRevision(revision), second.storeRevision(reordered)]);
    expect(left.commit).toBe(right.commit);
    const persisted = await second.readRevision(revision.id);
    expect(persisted?.parents).toEqual(revision.parents);
    expect(persisted?.provenance).toEqual(revision.provenance);
    expect(persisted?.summary).toEqual(revision.summary);
    expect(persisted?.tree.entries()).toEqual(revision.tree.entries());
  });

  it.each([
    {
      name: 'provenance.source',
      corrupt: (revision: Revision): unknown => ({
        ...revision,
        provenance: { ...revision.provenance, source: 'future' },
      }),
    },
    {
      name: 'provenance.runId',
      corrupt: (revision: Revision): unknown => ({
        ...revision,
        provenance: { ...revision.provenance, runId: 42 },
      }),
    },
    {
      name: 'summary.edited',
      corrupt: (revision: Revision): unknown => ({
        ...revision,
        summary: { ...revision.summary, edited: { replaceAll: () => 'edited' } },
      }),
    },
    {
      name: 'tree',
      corrupt: (revision: Revision): unknown => ({
        ...revision,
        tree: { entries: () => revision.tree.entries() },
      }),
    },
  ])('rejects invalid $name before publishing the revision', async ({ corrupt }) => {
    const adapter = createNativeGitAdapter({ repositoryPath, worktreeRoot });
    const revision = makeRevision({ id: 'invalid-metadata', entries: [['part.ts', 'content']] });
    // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- trust-boundary regression supplies malformed runtime data.
    const storeResult = await Promise.allSettled([adapter.storeRevision(corrupt(revision) as Revision)]);
    const readResult = await Promise.allSettled([adapter.readRevision(revision.id)]);
    if (storeResult[0].status !== 'rejected') {
      throw new Error('Invalid revision metadata was published.');
    }
    expect(storeResult[0].reason).toBeInstanceOf(TypeError);
    expect(readResult[0]).toEqual({ status: 'fulfilled', value: undefined });
  });

  /* The authority-over-a-port rehydration is covered with a memory provider in
   * `revision-authority.test.ts`; what only a real repository can prove is that
   * the *native* store rehydrates revisions, parents, trees and branch heads
   * through the wrapped port, and that Git's own expected-old `update-ref`
   * refuses a stale head (W1 falsified premise 2, S12). */
  const openPort = (executable?: string): RevisionPort =>
    createNativeGitRevisionPort({ repositoryPath, ...(executable === undefined ? {} : { gitExecutable: executable }) });

  const record = async (
    context: Readonly<{ authority: RevisionAuthority; port: RevisionPort }>,
    options: Readonly<{ label: string; parents: readonly RevisionId[]; content: string }>,
  ): Promise<Revision> => {
    const input = {
      parents: options.parents,
      tree: new ImmutableRevisionTree([['part.ts', options.content]]),
      provenance: { source: 'agent', actorId: options.label, runId: `run-${options.label}`, createdAt } as const,
      summary: { generated: `Revision ${options.label}` },
    };
    const receipt = await context.port.writeRevision(input);
    return context.authority.createRevision({ id: revisionId(receipt.commitId), ...input });
  };

  it('rehydrates RevisionAuthority revisions, branch heads, and expected-old CAS from a real repository', async () => {
    const port = openPort();
    await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
    const first = new RevisionAuthority({ persistence: createPortRevisionPersistence({ port }) });
    await first.ready;
    const base = await record({ authority: first, port }, { label: 'authority-base', parents: [], content: 'base' });
    const next = await record(
      { authority: first, port },
      { label: 'authority-next', parents: [base.id], content: 'next' },
    );
    const branch = revisionBranchName('authority/main');
    await first.updateBranchHead({ branch, expectedHead: undefined, head: base.id });
    /* A revision no ref reaches is unreferenced evidence in the object store,
     * so `next` is named by its own branch, exactly as the recorder names every
     * turn's head. */
    await first.updateBranchHead({
      branch: revisionBranchName('authority/next'),
      expectedHead: undefined,
      head: next.id,
    });

    const reopened = new RevisionAuthority({ persistence: createPortRevisionPersistence({ port: openPort() }) });
    await reopened.ready;

    expect(reopened.getRevision(next.id)?.parents).toEqual([base.id]);
    expect(new TextDecoder().decode(reopened.getRevision(next.id)?.tree.get('part.ts'))).toBe('next');
    expect(reopened.getBranchHead(branch)).toBe(base.id);
    expect(reopened.getRevisionPersistence(next.id)).toMatchObject({
      engine: 'native-git',
      commitId: next.id,
      objectFormat: 'sha1',
      conflicted: false,
    });
    await expect(reopened.updateBranchHead({ branch, expectedHead: undefined, head: next.id })).resolves.toEqual({
      status: 'conflicted',
      conflict: {
        type: 'stale-head',
        branch,
        expectedHead: undefined,
        actualHead: base.id,
        proposedHead: next.id,
      },
    });
  });

  it('rehydrates coherently when a publication interleaves the ref snapshot', async () => {
    const publisher = openPort();
    await publisher.init({ author: { name: 'Tau', email: 'tau@example.com' } });
    const seeding = new RevisionAuthority({ persistence: createPortRevisionPersistence({ port: publisher }) });
    await seeding.ready;
    const base = await record(
      { authority: seeding, port: publisher },
      { label: 'snapshot-base', parents: [], content: 'base' },
    );
    const branch = revisionBranchName('snapshot/main');
    await seeding.updateBranchHead({ branch, expectedHead: undefined, head: base.id });

    /* `load()` reads the refs, then walks the commits they name. The race this
     * pins is a publication landing between those two reads: the branch head the
     * snapshot carries must still be a revision the same snapshot holds. */
    const stateDirectory = join(temporaryRoot, 'snapshot-state');
    const wrapperPath = join(temporaryRoot, 'snapshot-git');
    await writeFile(
      wrapperPath,
      `#!/bin/sh
state=${stateDirectory}
mkdir -p "$state"
if [ "$3" = for-each-ref ]; then
  if mkdir "$state/first" 2>/dev/null; then
    git "$@" > "$state/captured"
    touch "$state/ready"
    while [ ! -f "$state/release" ]; do sleep 0.01; done
    cat "$state/captured"
    exit 0
  fi
fi
exec git "$@"
`,
      { mode: 0o755 },
    );

    const loading = createPortRevisionPersistence({ port: openPort(wrapperPath) }).load();
    await waitForPath(join(stateDirectory, 'ready'));
    const next = await record(
      { authority: seeding, port: publisher },
      { label: 'snapshot-next', parents: [base.id], content: 'next' },
    );
    await seeding.updateBranchHead({ branch, expectedHead: base.id, head: next.id });
    await writeFile(join(stateDirectory, 'release'), '');

    const snapshot = await loading;
    const recoveredHead = snapshot.branchHeads.find((entry) => entry.branch === branch)?.head;
    expect(recoveredHead).toBeDefined();
    expect(snapshot.revisions.some((entry) => entry.revision.id === recoveredHead)).toBe(true);
  });

  it('keeps a committed revision successful when staging cleanup fails and recovers the stale ref on load', async () => {
    const wrapperPath = join(temporaryRoot, 'cleanup-git');
    await writeFile(
      wrapperPath,
      `#!/bin/sh
case "$3:$4:$5" in
  update-ref:-d:refs/tau/transactions/import-*) exit 1 ;;
esac
exec git "$@"
`,
      { mode: 0o755 },
    );
    const faulting = createNativeGitAdapter({
      repositoryPath,
      worktreeRoot,
      gitExecutable: wrapperPath,
    });
    const revision = makeRevision({ id: 'cleanup-revision', entries: [['part.ts', 'stored']] });

    const stored = await faulting.storeRevision(revision);
    expect(stored.revision.id).toBe(revision.id);
    expect(await git(repositoryPath, 'for-each-ref', '--format=%(refname)', 'refs/tau/transactions/')).not.toBe('');

    const recovered = createNativeGitAdapter({ repositoryPath, worktreeRoot });
    await expect(recovered.readRevisionGraph()).resolves.toMatchObject({
      revisions: [{ revision: { id: revision.id }, commit: stored.commit }],
    });
    expect(await git(repositoryPath, 'for-each-ref', '--format=%(refname)', 'refs/tau/transactions/')).toBe('');
  });

  it('allows exactly one expected-old branch publisher and reports the stale head', async () => {
    const adapter = createNativeGitAdapter({ repositoryPath, worktreeRoot });
    const base = makeRevision({ id: 'cas-base', entries: [['part.ts', 'base']] });
    const left = makeRevision({ id: 'cas-left', parents: [base.id], entries: [['part.ts', 'left']] });
    const right = makeRevision({ id: 'cas-right', parents: [base.id], entries: [['part.ts', 'right']] });
    await adapter.storeRevision(base);
    await Promise.all([adapter.storeRevision(left), adapter.storeRevision(right)]);
    const branch = revisionBranchName('main');
    expect(await adapter.updateBranchHead({ branch, expectedHead: undefined, head: base.id })).toMatchObject({
      status: 'updated',
      head: base.id,
    });

    const outcomes = await Promise.all([
      adapter.updateBranchHead({ branch, expectedHead: base.id, head: left.id }),
      adapter.updateBranchHead({ branch, expectedHead: base.id, head: right.id }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'updated')).toHaveLength(1);
    const conflict = outcomes.find((outcome) => outcome.status === 'conflicted');
    expect(conflict).toMatchObject({
      status: 'conflicted',
      conflict: {
        type: 'stale-head',
        expectedHead: base.id,
      },
    });
    if (conflict?.status === 'conflicted') {
      expect([left.id, right.id]).toContain(conflict.conflict.actualHead);
    }
  });

  it('persists deterministic text merges and preserves typed structural and binary conflicts', async () => {
    const adapter = createNativeGitAdapter({ repositoryPath, worktreeRoot });
    const base = makeRevision({ id: 'merge-base', entries: [['part.txt', 'a\nb\nc\n']] });
    const ours = makeRevision({ id: 'merge-ours', parents: [base.id], entries: [['part.txt', 'A\nb\nc\n']] });
    const theirs = makeRevision({
      id: 'merge-theirs',
      parents: [base.id],
      entries: [['part.txt', 'a\nb\nC\n']],
    });
    await adapter.storeRevision(base);
    await Promise.all([adapter.storeRevision(ours), adapter.storeRevision(theirs)]);
    const merged = await adapter.mergeRevisions({
      id: revisionId('merge-result'),
      base,
      ours,
      theirs,
      provenance: { source: 'merge', actorId: 'merge-coordinator', createdAt },
      summary: { generated: 'Merge alternatives' },
    });
    const oracle = mergeRevisionTrees(base.tree, ours.tree, theirs.tree);
    expect(merged.status).toBe('merged');
    expect(oracle.status).toBe('merged');
    if (merged.status === 'merged' && oracle.status === 'merged') {
      expect(merged.stored.revision.tree.entries()).toEqual(oracle.tree.entries());
      const persisted = await adapter.readRevision(merged.stored.revision.id);
      expect(persisted?.tree.entries()).toEqual(oracle.tree.entries());
    }

    const absent = makeRevision({ id: 'absent', entries: [] });
    const addedOurs = makeRevision({ id: 'added-ours', parents: [absent.id], entries: [['new.txt', 'ours']] });
    const addedTheirs = makeRevision({
      id: 'added-theirs',
      parents: [absent.id],
      entries: [['new.txt', 'theirs']],
    });
    const addAdd = await adapter.mergeRevisions({
      id: revisionId('add-add-result'),
      base: absent,
      ours: addedOurs,
      theirs: addedTheirs,
      provenance: { source: 'merge', actorId: 'merge-coordinator', createdAt },
      summary: { generated: 'Conflicting additions' },
    });
    expect(addAdd).toMatchObject({ status: 'conflicted', conflicts: [{ type: 'add-add', path: 'new.txt' }] });

    const deleted = makeRevision({ id: 'deleted', parents: [base.id], entries: [] });
    const modified = makeRevision({
      id: 'modified',
      parents: [base.id],
      entries: [['part.txt', 'modified']],
    });
    const modifyDelete = await adapter.mergeRevisions({
      id: revisionId('modify-delete-result'),
      base,
      ours: deleted,
      theirs: modified,
      provenance: { source: 'merge', actorId: 'merge-coordinator', createdAt },
      summary: { generated: 'Modify delete conflict' },
    });
    expect(modifyDelete).toMatchObject({
      status: 'conflicted',
      conflicts: [{ type: 'modify-delete', modifiedBy: 'theirs', path: 'part.txt' }],
    });

    const binaryBase = makeRevision({ id: 'binary-base', entries: [['part.bin', new Uint8Array([0, 1])]] });
    const binaryOurs = makeRevision({
      id: 'binary-ours',
      parents: [binaryBase.id],
      entries: [['part.bin', new Uint8Array([0, 2])]],
    });
    const binaryTheirs = makeRevision({
      id: 'binary-theirs',
      parents: [binaryBase.id],
      entries: [['part.bin', new Uint8Array([0, 3])]],
    });
    const binary = await adapter.mergeRevisions({
      id: revisionId('binary-result'),
      base: binaryBase,
      ours: binaryOurs,
      theirs: binaryTheirs,
      provenance: { source: 'merge', actorId: 'merge-coordinator', createdAt },
      summary: { generated: 'Binary conflict' },
    });
    expect(binary).toMatchObject({ status: 'conflicted', conflicts: [{ type: 'binary', path: 'part.bin' }] });
  });

  it('preserves crash edits on reopen, recreates missing roots, and releases every workspace ref for rebinding', async () => {
    const first = createNativeGitAdapter({ repositoryPath, worktreeRoot });
    const base = makeRevision({
      id: 'restart-base',
      entries: [
        ['.gitignore', '*.cache\n'],
        ['delete-me.txt', 'tracked'],
        ['part.ts', 'base'],
      ],
    });
    const result = makeRevision({
      id: 'restart-result',
      parents: [base.id],
      entries: [
        ['.gitignore', '*.cache\n'],
        ['delete-me.txt', 'tracked'],
        ['part.ts', 'result'],
      ],
    });
    await first.storeRevision(base);
    const storedResult = await first.storeRevision(result);
    const initial = await first.bindWorkspace({
      workspaceId: materializedWorkspaceId('restart-workspace'),
      runId: 'restart-run',
      baseRevision: base,
    });
    const workspaceHeadRef = await git(repositoryPath, 'for-each-ref', '--format=%(refname)', 'refs/tau/workspaces');
    expect(workspaceHeadRef).toMatch(/^refs\/tau\/workspaces\/[0-9a-f]{64}$/u);
    // Model a process dying after the workspace-ref CAS but before its linked
    // worktree is moved from base to result.
    await git(repositoryPath, 'update-ref', workspaceHeadRef, storedResult.commit, initial.headCommit);
    await writeFile(join(initial.rootPath, 'part.ts'), 'dirty tracked crash edit');
    await rm(join(initial.rootPath, 'delete-me.txt'));
    await writeFile(join(initial.rootPath, 'untracked.tmp'), 'untracked crash edit');
    await writeFile(join(initial.rootPath, 'ignored.cache'), 'ignored crash edit');

    const reopenedAdapter = createNativeGitAdapter({ repositoryPath, worktreeRoot });
    const reopened = await reopenedAdapter.reopenWorkspace({
      workspaceId: initial.workspaceId,
      runId: initial.runId,
    });
    expect(reopened.headRevisionId).toBe(result.id);
    expect(await readFile(join(reopened.rootPath, 'part.ts'), 'utf8')).toBe('dirty tracked crash edit');
    await expect(readFile(join(reopened.rootPath, 'delete-me.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(join(reopened.rootPath, 'untracked.tmp'), 'utf8')).toBe('untracked crash edit');
    expect(await readFile(join(reopened.rootPath, 'ignored.cache'), 'utf8')).toBe('ignored crash edit');
    await rm(reopened.rootPath, { force: true, recursive: true });
    const recoveredAdapter = createNativeGitAdapter({ repositoryPath, worktreeRoot });
    const recovered = await recoveredAdapter.reopenWorkspace({
      workspaceId: reopened.workspaceId,
      runId: reopened.runId,
    });
    expect(await readFile(join(recovered.rootPath, 'part.ts'), 'utf8')).toBe('result');
    expect(await recoveredAdapter.cleanupWorkspace(recovered)).toBe(true);
    expect(await recoveredAdapter.cleanupWorkspace(recovered)).toBe(false);
    expect(
      await git(repositoryPath, 'for-each-ref', '--format=%(refname)', 'refs/tau/owners', 'refs/tau/workspaces'),
    ).toBe('');
    await expect(
      recoveredAdapter.reopenWorkspace({ workspaceId: recovered.workspaceId, runId: recovered.runId }),
    ).rejects.toEqual(expect.objectContaining<Partial<NativeGitError>>({ code: 'WORKSPACE_NOT_FOUND' }));

    const rebound = await recoveredAdapter.bindWorkspace({
      workspaceId: recovered.workspaceId,
      runId: 'restart-rebound-run',
      baseRevision: result,
    });
    expect(await readFile(join(rebound.rootPath, 'part.ts'), 'utf8')).toBe('result');
    expect(await recoveredAdapter.cleanupWorkspace(rebound)).toBe(true);
  });

  it('round-trips Unicode, binary bytes, and a 100 MiB incompressible object through native Git', async () => {
    const adapter = createNativeGitAdapter({ repositoryPath, worktreeRoot });
    const large = new Uint8Array(randomBytes(100 * 1024 * 1024));
    const expectedLargeHash = createHash('sha256').update(large).digest('hex');
    const revision = makeRevision({
      id: 'large-boundary',
      entries: [
        ['設計/δ-part.txt', 'Unicode ✓'],
        ['binary.bin', new Uint8Array([0, 255, 1, 254, 2, 253])],
        ['artifact-100MiB.bin', large],
      ],
    });
    const stored = await adapter.storeRevision(revision);
    const workspace = await adapter.bindWorkspace({
      workspaceId: materializedWorkspaceId('large-workspace'),
      runId: 'large-run',
      baseRevision: revision,
    });

    expect(stored.commit).toMatch(/^[0-9a-f]{40}$/u);
    expect(await readFile(join(workspace.rootPath, '設計/δ-part.txt'), 'utf8')).toBe('Unicode ✓');
    expect(new Uint8Array(await readFile(join(workspace.rootPath, 'binary.bin')))).toEqual(
      new Uint8Array([0, 255, 1, 254, 2, 253]),
    );
    const largeStat = await stat(join(workspace.rootPath, 'artifact-100MiB.bin'));
    expect(largeStat.size).toBe(100 * 1024 * 1024);
    expect(await hashFile(join(workspace.rootPath, 'artifact-100MiB.bin'))).toBe(expectedLargeHash);
  }, 120_000);

  it('pushes and fetches with explicit standard refspecs', async () => {
    const source = createNativeGitAdapter({ repositoryPath, worktreeRoot });
    const revision = makeRevision({ id: 'transport-revision', entries: [['part.ts', 'transport']] });
    const stored = await source.storeRevision(revision);
    const branch = revisionBranchName('transport');
    await source.updateBranchHead({ branch, expectedHead: undefined, head: revision.id });

    const remotePath = join(temporaryRoot, 'remote.git');
    await execute('git', ['init', '--bare', '--quiet', remotePath]);
    await source.push({
      remote: remotePath,
      refspecs: ['refs/heads/tau/transport:refs/heads/tau/transport'],
    });
    expect(await git(remotePath, 'rev-parse', 'refs/heads/tau/transport')).toBe(stored.commit);

    const targetPath = join(temporaryRoot, 'target');
    const targetWorktrees = join(temporaryRoot, 'target-worktrees');
    await execute('git', ['init', '--quiet', targetPath]);
    const target = createNativeGitAdapter({ repositoryPath: targetPath, worktreeRoot: targetWorktrees });
    await target.fetch({
      remote: remotePath,
      refspecs: ['refs/heads/tau/transport:refs/remotes/origin/tau/transport'],
    });
    expect(await target.resolveRef('refs/remotes/origin/tau/transport')).toBe(stored.commit);
  });

  it('rejects every transport route that can read or overwrite Tau-managed refs', async () => {
    const adapter = createNativeGitAdapter({ repositoryPath, worktreeRoot });
    const remotePath = join(temporaryRoot, 'managed-ref-remote.git');
    await execute('git', ['init', '--bare', '--quiet', remotePath]);

    await expect(
      adapter.fetch({
        remote: remotePath,
        refspecs: ['refs/heads/main:refs/tau/workspaces/poison'],
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<NativeGitError>>({ code: 'INVALID_TRANSPORT' }));
    await expect(
      adapter.push({
        remote: remotePath,
        refspecs: ['refs/tau/owners/private:refs/heads/leaked'],
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<NativeGitError>>({ code: 'INVALID_TRANSPORT' }));
    await expect(
      adapter.push({
        remote: remotePath,
        refspecs: ['refs/tau*:refs/heads/leaked*'],
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<NativeGitError>>({ code: 'INVALID_TRANSPORT' }));
    await expect(
      adapter.fetch({
        remote: remotePath,
        refspecs: ['refs/heads*:refs/tau*'],
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<NativeGitError>>({ code: 'INVALID_TRANSPORT' }));
    await expect(
      adapter.fetch({
        remote: remotePath,
        refspecs: ['^refs/tau*'],
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<NativeGitError>>({ code: 'INVALID_TRANSPORT' }));
  });

  /* The transport allow-list, in the positive direction: `refs/tau/chats`,
   * `refs/tau/evidence` and `refs/tau/artifacts` are records that travel, and
   * only the host-local namespaces stay behind (review 3 F13, D14/A15). */
  it('round-trips a chat ref through push and fetch', async () => {
    const source = createNativeGitAdapter({ repositoryPath, worktreeRoot });
    const revision = makeRevision({ id: 'chat-carrier', entries: [['.tau/chats/chat-1/events.jsonl', '{}\n']] });
    const stored = await source.storeRevision(revision);
    const chatRef = 'refs/tau/chats/chat-1';
    await execute('git', ['-C', repositoryPath, 'update-ref', chatRef, stored.commit]);

    const remotePath = join(temporaryRoot, 'chat-remote.git');
    await execute('git', ['init', '--bare', '--quiet', remotePath]);
    await source.push({ remote: remotePath, refspecs: [`${chatRef}:${chatRef}`] });
    expect(await git(remotePath, 'rev-parse', chatRef)).toBe(stored.commit);

    const targetPath = join(temporaryRoot, 'chat-target');
    await execute('git', ['init', '--quiet', targetPath]);
    const target = createNativeGitAdapter({
      repositoryPath: targetPath,
      worktreeRoot: join(temporaryRoot, 'chat-target-worktrees'),
    });
    await target.fetch({ remote: remotePath, refspecs: [`${chatRef}:${chatRef}`] });
    expect(await target.resolveRef(chatRef)).toBe(stored.commit);
  });
});
