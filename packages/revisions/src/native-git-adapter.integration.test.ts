import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { MessageChannel } from 'node:worker_threads';
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { NodeFsAuthorityHost, serveNodeFsProvider, toNodeFsPort } from '@taucad/filesystem/backend/node';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { ImmutableRevisionTree, mergeRevisionTrees, revisionId } from '#algorithms/index.js';
import { revisionBranchName } from '#revision-authority.js';
import type { RevisionId } from '#algorithms/index.js';
import type { Revision, RevisionProvenance } from '#revision-authority.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RevisionPort } from '#revision-port.js';
import { createNativeGitAdapter } from '#native-git-adapter.js';
import { createNativeGitRevisionPort } from '#node/index.js';
import { NativeGitError } from '#native-git.types.js';
import { generatedGitattributesPath, generatedIgnoreContent, generatedIgnorePath } from '#workspace-config.js';

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

  it('holds the exact worktree target against an admitted writer during removal', async () => {
    const authorityRoot = join(temporaryRoot, 'authority');
    await Promise.all([mkdir(authorityRoot), mkdir(worktreeRoot)]);
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => repositoryPath,
    });
    const { port1, port2 } = new MessageChannel();
    const admittedRoots = new Set<string>();
    const stopServer = serveNodeFsProvider(toNodeFsPort(port1), {
      policy: tauPathPolicy,
      authority,
      allowRoot: (root) => admittedRoots.has(root),
    });
    const channel = new NodeFsChannel(toNodeFsPort(port2));
    const removeEntered = Promise.withResolvers<void>();
    const allowRemove = Promise.withResolvers<void>();
    const targets: Array<Readonly<{ operation: 'add' | 'remove'; targetRoot: string; targetPath: string }>> = [];
    const revisionPort = createNativeGitRevisionPort({
      repositoryPath,
      checkouts: {
        projectId: 'project-1',
        directory: worktreeRoot,
        withMutationAuthority: async (target, mutation) =>
          authority.run({ root: target.parentRoot, paths: [target.targetPath] }, async () => {
            targets.push(target);
            if (target.operation === 'remove') {
              removeEntered.resolve();
              await allowRemove.promise;
            }
            return mutation();
          }),
      },
    });

    try {
      await revisionPort.init({ author: { name: 'Tau', email: 'tau@example.com' } });
      const receipt = await revisionPort.writeRevision({
        parents: [],
        tree: new ImmutableRevisionTree([['part.ts', 'export const part = 1;\n']]),
        provenance: { source: 'user', actorId: 'person-1', createdAt },
        summary: { generated: 'Base' },
      });
      const head = revisionId(receipt.commitId);
      await revisionPort.updateRef({ name: 'main', expectedHead: undefined, head });
      await revisionPort.setHead('main');
      await revisionPort.updateRef({ name: 'side', expectedHead: undefined, head });
      const checkout = await revisionPort.addCheckout!({ branch: 'side' });
      const canonicalCheckoutRoot = await realpath(checkout.root);
      admittedRoots.add(checkout.root);
      const provider = new NodeFsProviderClient(channel, checkout.root);
      await provider.writeFile('before.txt', 'before\n');

      const removing = revisionPort.removeCheckout!(checkout.id);
      await removeEntered.promise;
      let writeSettled = false;
      let writeFailure: unknown;
      const racingWrite = async (): Promise<void> => {
        try {
          await provider.writeFile('racing.txt', 'racing\n');
        } catch (error) {
          writeFailure = error;
        } finally {
          writeSettled = true;
        }
      };
      const writing = racingWrite();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });
      expect(writeSettled).toBe(false);
      allowRemove.resolve();
      await removing;
      await writing;
      expect(writeFailure).toBeInstanceOf(Error);
      expect(targets).toEqual([
        expect.objectContaining({ operation: 'add', targetPath: checkout.id }),
        expect.objectContaining({
          operation: 'remove',
          targetRoot: canonicalCheckoutRoot,
          targetPath: checkout.id,
        }),
      ]);
    } finally {
      channel.close();
      await stopServer();
    }
  }, 60_000);

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
        workspaceId: 'workspace-left',
        runId: 'run-left',
        baseRevision: base,
      }),
      adapter.bindWorkspace({
        workspaceId: 'workspace-right',
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
    const workspaceId = 'owned-workspace';
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

  /* What only a real repository can prove is that the *native* store rehydrates
   * revisions, parents, trees and branch heads through the wrapped port, and
   * that Git's own expected-old `update-ref` refuses a stale head (W1 falsified
   * premise 2, S12). Read through the port itself since P65 retired the
   * in-memory authority: the store is the graph, and `readRevision` / `readTree`
   * / `readRef` / `log` are how every reader in the tree reaches it. */
  const openPort = (executable?: string): RevisionPort =>
    createNativeGitRevisionPort({ repositoryPath, ...(executable === undefined ? {} : { gitExecutable: executable }) });

  /*
   * G0-9 on the disk leg: `init` is also the open seam
   * (`revision-effects.ensureStore` calls it once per authority, and `git init`
   * is skipped for a store that is already here), so a project created by an
   * older build is migrated on its next open — and a project already current is
   * not rewritten, which a pinned mtime is the only way to observe here.
   */
  it('should migrate a stale generated block on open and then leave both files alone', async () => {
    const ignorePath = join(repositoryPath, generatedIgnorePath);
    const attributesPath = join(repositoryPath, generatedGitattributesPath);
    await writeFile(
      ignorePath,
      `# mine\n*.log\n# BEGIN Tau generated — derived content is never versioned\n/.git/\n/.jj/\n/.tau/binding.json\nnode_modules/\n# END Tau generated\n`,
    );

    await openPort().init({ author: { name: 'Tau', email: 'tau@example.com' } });

    expect(await readFile(ignorePath, 'utf8')).toBe(generatedIgnoreContent('# mine\n*.log\n'));
    const pinned = Date.UTC(2020, 0, 1);
    await utimes(ignorePath, new Date(pinned), new Date(pinned));
    await utimes(attributesPath, new Date(pinned), new Date(pinned));

    await openPort().init({ author: { name: 'Tau', email: 'tau@example.com' } });

    const ignoreStat = await stat(ignorePath);
    const attributesStat = await stat(attributesPath);
    expect(ignoreStat.mtimeMs).toBe(pinned);
    expect(attributesStat.mtimeMs).toBe(pinned);
  });

  const write = async (
    port: RevisionPort,
    options: Readonly<{ label: string; parents: readonly RevisionId[]; content: string }>,
  ): Promise<RevisionId> => {
    const receipt = await port.writeRevision({
      parents: options.parents,
      tree: new ImmutableRevisionTree([['part.ts', options.content]]),
      provenance: { source: 'agent', actorId: options.label, runId: `run-${options.label}`, createdAt },
      summary: { generated: `Revision ${options.label}` },
    });
    return revisionId(receipt.commitId);
  };

  it('rehydrates revisions, branch heads, and expected-old CAS from a real repository', async () => {
    const port = openPort();
    await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
    const base = await write(port, { label: 'authority-base', parents: [], content: 'base' });
    const next = await write(port, { label: 'authority-next', parents: [base], content: 'next' });
    const branch = revisionBranchName('authority/main');
    await port.updateRef({ name: branch, expectedHead: undefined, head: base });
    /* A revision no ref reaches is unreferenced evidence in the object store,
     * so `next` is named by its own branch, exactly as the recorder names every
     * turn's head. */
    await port.updateRef({ name: revisionBranchName('authority/next'), expectedHead: undefined, head: next });

    /* A second port over the same directory: nothing of the first is in memory. */
    const reopened = openPort();

    const record = await reopened.readRevision(next);
    expect(record?.parents).toEqual([base]);
    expect(record?.receipt).toMatchObject({
      engine: 'native-git',
      commitId: next,
      objectFormat: 'sha1',
      conflicted: false,
    });
    const tree = await reopened.readTree(next);
    expect(new TextDecoder().decode(tree?.get('part.ts'))).toBe('next');
    expect(await reopened.readRef(branch)).toBe(base);
    await expect(reopened.updateRef({ name: branch, expectedHead: undefined, head: next })).resolves.toMatchObject({
      status: 'conflicted',
      name: branch,
      expectedHead: undefined,
      actualHead: base,
      proposedHead: next,
    });
  });

  it('rehydrates coherently when a publication interleaves the ref snapshot', async () => {
    const publisher = openPort();
    await publisher.init({ author: { name: 'Tau', email: 'tau@example.com' } });
    const base = await write(publisher, { label: 'snapshot-base', parents: [], content: 'base' });
    const branch = revisionBranchName('snapshot/main');
    await publisher.updateRef({ name: branch, expectedHead: undefined, head: base });

    /* A reader takes the refs, then walks the commits they name. The race this
     * pins is a publication landing between those two reads: the branch head the
     * snapshot carries must still be a revision the same snapshot holds. */
    const stateDirectory = join(temporaryRoot, 'snapshot-state');
    const wrapperPath = join(temporaryRoot, 'snapshot-git');
    await writeFile(
      wrapperPath,
      `#!/bin/sh
state=${stateDirectory}
mkdir -p "$state"
# The port pins configuration ahead of every subcommand, so the verb is found
# by scanning the arguments rather than by its position.
verb=
for argument in "$@"; do
  case "$argument" in
    for-each-ref) verb=for-each-ref ;;
  esac
done
if [ "$verb" = for-each-ref ]; then
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

    const racing = openPort(wrapperPath);
    const reading = (async () => {
      const references = await racing.listRefs();
      return { references, entries: await racing.log({ heads: references.map((reference) => reference.head) }) };
    })();
    await waitForPath(join(stateDirectory, 'ready'));
    const next = await write(publisher, { label: 'snapshot-next', parents: [base], content: 'next' });
    await publisher.updateRef({ name: branch, expectedHead: base, head: next });
    await writeFile(join(stateDirectory, 'release'), '');

    const snapshot = await reading;
    const recoveredHead = snapshot.references.find((reference) => reference.name === branch)?.head;
    expect(recoveredHead).toBeDefined();
    expect(snapshot.entries.some((entry) => entry.id === recoveredHead)).toBe(true);
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
      workspaceId: 'restart-workspace',
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
      workspaceId: 'large-workspace',
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

  /* AC16, local half: a large file is a pointer in the tree and real bytes
   * through the port, and the object lands where git-lfs looks for it. The
   * pointer bytes are checked against the installed `git lfs` so this stays a
   * measurement of the format rather than of our own encoder. */
  it('records a 5 MiB STEP file as an LFS pointer and reads its bytes back', async () => {
    const port = openPort();
    await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
    const content = randomBytes(5 * 1024 * 1024);
    const bytes = Uint8Array.from(content);
    const receipt = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([
        ['models/bracket.step', bytes],
        ['src/part.ts', 'export const part = 1;\n'],
      ]),
      provenance: { source: 'user', actorId: 'lfs', createdAt },
      summary: { generated: 'Large object' },
    });
    const recorded = revisionId(receipt.commitId);

    const pointer = await git(repositoryPath, 'show', `${recorded}:models/bracket.step`);
    expect(pointer).toContain('version https://git-lfs.github.com/spec/v1');
    const oid = /oid sha256:([\da-f]{64})/u.exec(pointer)?.[1] ?? '';
    expect(oid).toBe(createHash('sha256').update(content).digest('hex'));
    expect(pointer).toContain(`size ${String(content.byteLength)}`);
    /* The engine's own verdict on the format. */
    const pointerFile = join(temporaryRoot, 'bracket.pointer');
    await writeFile(pointerFile, `${pointer}\n`);
    const checked = await execute('git', ['-C', repositoryPath, 'lfs', 'pointer', '--check', '--file', pointerFile], {
      encoding: 'utf8',
    }).then(
      () => true,
      () => false,
    );
    expect(checked).toBe(true);
    expect(await hashFile(join(repositoryPath, '.git/lfs/objects', oid.slice(0, 2), oid.slice(2, 4), oid))).toBe(oid);

    // A small source file beside it is stored as itself.
    expect(await git(repositoryPath, 'show', `${recorded}:src/part.ts`)).toBe('export const part = 1;');

    const tree = await port.readTree(recorded);
    expect(tree?.get('models/bracket.step')).toEqual(bytes);
    expect(tree?.get('models/bracket.step')?.byteLength).toBe(5 * 1024 * 1024);

    // The generated attributes file is what makes a stock clone resolve it.
    expect(await readFile(join(repositoryPath, '.gitattributes'), 'utf8')).toContain(
      '*.step filter=lfs diff=lfs merge=lfs -text',
    );
  }, 60_000);

  /* P15: size never pointerises on its own. A big file whose family nothing
   * tracks gets a line of its own in the same cut, so the clone that reads the
   * pointer also reads the attribute that smudges it back. */
  it('tracks a large file of an untracked family by name, and a stock clone reads its bytes', async () => {
    const port = openPort();
    await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
    const notes = Uint8Array.from(randomBytes(2 * 1024 * 1024));
    const model = Uint8Array.from(randomBytes(2 * 1024 * 1024));
    const receipt = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([
        ['.gitattributes', await readFile(join(repositoryPath, '.gitattributes'), 'utf8')],
        ['notes.txt', notes],
        ['models/big.step', model],
        ['small.txt', 'a line\n'],
      ]),
      provenance: { source: 'user', actorId: 'lfs', createdAt },
      summary: { generated: 'Large objects' },
    });
    const recorded = revisionId(receipt.commitId);
    await port.updateRef({ name: 'main', expectedHead: undefined, head: recorded });
    await port.setHead('main');

    // Both are pointers in the tree; only the untracked family earned a line.
    const attributes = await git(repositoryPath, 'show', `${recorded}:.gitattributes`);
    expect(attributes).toContain('/notes.txt filter=lfs diff=lfs merge=lfs -text');
    expect(attributes).not.toContain('/models/big.step ');
    expect(attributes).toContain('*.step filter=lfs diff=lfs merge=lfs -text');
    expect(await git(repositoryPath, 'show', `${recorded}:notes.txt`)).toContain('oid sha256:');
    expect(await git(repositoryPath, 'show', `${recorded}:models/big.step`)).toContain('oid sha256:');
    // A file below the threshold is still its own bytes.
    expect(await git(repositoryPath, 'show', `${recorded}:small.txt`)).toBe('a line');

    // What a person with a terminal gets: a stock clone, smudged by git-lfs.
    const clonePath = join(temporaryRoot, 'clone');
    await execute('git', ['clone', '--quiet', repositoryPath, clonePath]);
    const listed = await git(clonePath, 'lfs', 'ls-files');
    expect(listed).toContain('notes.txt');
    expect(listed).toContain('models/big.step');
    const clonedNotes = await stat(join(clonePath, 'notes.txt'));
    const clonedModel = await stat(join(clonePath, 'models/big.step'));
    expect(clonedNotes.size).toBe(2 * 1024 * 1024);
    expect(clonedModel.size).toBe(2 * 1024 * 1024);
  }, 120_000);

  /* Review a1 R4: a checkout can hold un-smudged pointer text (no `git-lfs` on
   * the machine, `GIT_LFS_SKIP_SMUDGE`, an unfetched clone). Recording it must
   * not make a pointer to a pointer, which reads back as 132 bytes of text
   * where the file should be. */
  it('stores a tree entry that is already a pointer as itself', async () => {
    const port = openPort();
    await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
    const bytes = Uint8Array.from(randomBytes(2 * 1024 * 1024));
    const first = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([['models/bracket.step', bytes]]),
      provenance: { source: 'user', actorId: 'lfs', createdAt },
      summary: { generated: 'Large object' },
    });
    const pointerText = `${await git(repositoryPath, 'show', `${revisionId(first.commitId)}:models/bracket.step`)}\n`;

    const second = await port.writeRevision({
      parents: [revisionId(first.commitId)],
      tree: new ImmutableRevisionTree([['models/bracket.step', pointerText]]),
      provenance: { source: 'user', actorId: 'lfs', createdAt },
      summary: { generated: 'Un-smudged checkout' },
    });
    const recorded = revisionId(second.commitId);
    expect(`${await git(repositoryPath, 'show', `${recorded}:models/bracket.step`)}\n`).toBe(pointerText);
    // And the object behind it is still the file, not the pointer's own text.
    const reread = await port.readTree(recorded);
    expect(reread?.get('models/bracket.step')).toEqual(bytes);
  }, 60_000);

  /* W3a review R43: the port pins its own configuration on every invocation, so
   * a person's `core.autocrlf` or a repository hook cannot move a tree id or
   * fail a checkout. Nothing else asserts the pin, and the symptom it prevents
   * (one tree, two ids, on two machines) is the most expensive in the program. */
  it('records the same bytes under a hostile core.autocrlf and hooksPath', async () => {
    const hooks = join(temporaryRoot, 'hooks');
    await execute('mkdir', ['-p', hooks]);
    await writeFile(join(hooks, 'post-checkout'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    await writeFile(join(hooks, 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    await git(repositoryPath, 'config', 'core.autocrlf', 'true');
    await git(repositoryPath, 'config', 'core.hooksPath', hooks);

    const port = createNativeGitRevisionPort({
      repositoryPath,
      checkouts: { projectId: 'project-1', directory: worktreeRoot },
    });
    await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
    const crlf = 'first\r\nsecond\n';
    const receipt = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([['mixed.txt', crlf]]),
      provenance: { source: 'user', actorId: 'pin', createdAt },
      summary: { generated: 'Line endings' },
    });
    const recorded = revisionId(receipt.commitId);
    await port.updateRef({ name: 'main', expectedHead: undefined, head: recorded });
    await port.setHead('main');

    const stored = await port.readTree(recorded);
    expect(new TextDecoder().decode(stored?.get('mixed.txt'))).toBe(crlf);
    // The hook would fail the checkout if the pin were dropped.
    await port.updateRef({ name: 'side', expectedHead: undefined, head: recorded });
    const checkout = await port.addCheckout!({ branch: 'side' });
    expect(await readFile(join(checkout.root, 'mixed.txt'), 'utf8')).toBe(crlf);
  }, 60_000);
});
