/**
 * The native mint reads changed paths only (W11, D16, S15's count gate).
 *
 * A save used to stream every byte of the project into one `fast-import`; the
 * mint now names the tree's objects through the store's memo and writes only
 * what the store lacks. These rows count what crosses into Git: a shim named
 * as `gitExecutable` copies each child's stdin to a capture file and logs each
 * child, so the bytes and the processes a mint spends are exact.
 */

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import type { RevisionTreeInput } from '#algorithms/index.js';
import { adoptRevisionTree, revisionTreeFiles } from '#algorithms/revision-tree.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import { revisionTreeId } from '#revision-effects.js';
import type { RevisionPort } from '#revision-port.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';

const author = { name: 'Tau', email: 'tau@example.com' };
const encoder = new TextEncoder();
const roots: string[] = [];
const execGit = promisify(execFile);

afterAll(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

type Counted = Readonly<{
  repositoryPath: string;
  shim: string;
  /** Bytes written to every child's stdin, and the children started, since the last read. */
  spent: () => Promise<Readonly<{ stdinBytes: number; children: readonly string[] }>>;
}>;

const countedRepository = async (): Promise<Counted> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-native-mint-'));
  roots.push(root);
  const capture = join(root, 'stdin.bin');
  const log = join(root, 'children.log');
  const shim = join(root, 'git-counting');
  await writeFile(capture, '');
  await writeFile(
    shim,
    [
      '#!/bin/bash',
      /* The subcommand: the first argument that is neither an option nor the value of `-c` or `-C`. */
      'command=""',
      'skip=0',
      'for argument in "$@"; do',
      '  if [ "$skip" = 1 ]; then skip=0; continue; fi',
      '  case "$argument" in -c|-C) skip=1 ;; -*) ;; *) command="$argument"; break ;; esac',
      'done',
      `echo "$command" >> ${log}`,
      `tee -a ${capture} | git "$@"`,
      `exit "\${PIPESTATUS[1]}"`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  const repositoryPath = join(root, 'project');
  await mkdir(repositoryPath, { recursive: true });
  let bytesRead = 0;
  let childrenRead = 0;
  return {
    repositoryPath,
    shim,
    spent: async () => {
      const { size } = await stat(capture);
      const logged = await readFile(log, 'utf8').catch(() => '');
      const children = logged.split('\n').filter((line) => line !== '');
      const result = { stdinBytes: size - bytesRead, children: children.slice(childrenRead) };
      bytesRead = size;
      childrenRead = children.length;
      return result;
    },
  };
};

/** A tree that shares every record with `base` but the ones named, as a capture from index changes does (E1). */
const changed = (
  base: ImmutableRevisionTree,
  edits: Readonly<Record<string, string | undefined>>,
): ImmutableRevisionTree => {
  const files = new Map(revisionTreeFiles(base));
  for (const [path, content] of Object.entries(edits)) {
    if (content === undefined) {
      files.delete(path);
    } else {
      files.set(path, Object.freeze({ content: encoder.encode(content), mode: '100644' }));
    }
  }
  return adoptRevisionTree(files);
};

/* Every object a commit reaches that the store does not hold: a mint that skipped one would show here. */
const missingObjects = async (repositoryPath: string, commit: string): Promise<string[]> => {
  const { stdout } = await execGit('git', ['rev-list', '--objects', '--missing=print', commit], {
    cwd: repositoryPath,
  });
  return stdout.split('\n').filter((line) => line.startsWith('?'));
};

const mint = async (port: RevisionPort, tree: ImmutableRevisionTree, parent?: string): Promise<string> => {
  const receipt = await port.writeRevision({
    parents: parent === undefined ? [] : [revisionId(parent)],
    tree,
    provenance: { source: 'user', actorId: 'mint', createdAt: 1_757_000_000_000 },
    summary: { generated: 'Mint' },
  });
  return receipt.commitId;
};

/* 900 KiB of a family no attribute tracks stays a Git blob (under the 1 MiB large-object threshold), so it is
 * what a whole-tree mint would resend. */
const unchangedBytes = 900 * 1024;
const project = (): ImmutableRevisionTree =>
  new ImmutableRevisionTree([
    ['docs/base.md', Uint8Array.from({ length: unchangedBytes }, (_unused, index) => (index * 31) % 251)],
    ...Array.from(
      { length: 200 },
      (_unused, index): RevisionTreeInput => [
        `src/${String(index % 10)}/m${String(index)}.ts`,
        `export const v${String(index)} = ${String(index)};\n`,
      ],
    ),
  ]);

describe.runIf(gitToolchainOnPath)('native mint reads changed paths only (D16)', () => {
  it('streams a one-file save into Git, not the project, under the identity the host predicts', async () => {
    const { repositoryPath, shim, spent } = await countedRepository();
    const port = createNativeGitRevisionPort({ repositoryPath, gitExecutable: shim });
    await port.init({ author });
    const first = project();
    const firstCommit = await mint(port, first);
    const cold = await spent();
    /* The first mint writes everything: the measure the later rows are compared with. */
    expect(cold.stdinBytes).toBeGreaterThan(unchangedBytes);

    const second = changed(first, { 'src/3/m3.ts': 'export const v3 = "saved";\n' });
    const secondCommit = await mint(port, second, firstCommit);
    const save = await spent();

    /* The changed file, the three trees on its path and the commit — a few hundred bytes, never the 900 KiB file. */
    expect(save.stdinBytes).toBeLessThan(4096);
    /* Presence check, one blob, one tree batch, the commit object: one process each, whatever the tree holds. */
    expect(save.children.filter((command) => ['fast-import', 'mktree', 'cat-file'].includes(command))).toEqual([
      'cat-file',
      'fast-import',
      'mktree',
    ]);
    const recorded = await port.readRevision(revisionId(secondCommit));
    expect(recorded?.treeId).toBe(revisionTreeId(second, 'sha1'));
    const read = await port.readTree(revisionId(secondCommit));
    expect(new TextDecoder().decode(read?.get('src/3/m3.ts'))).toBe('export const v3 = "saved";\n');
    expect(read?.get('docs/base.md')?.byteLength).toBe(unchangedBytes);
    expect(await missingObjects(repositoryPath, secondCommit)).toEqual([]);
  }, 120_000);

  it('writes only the trees on a removed path and nothing for an unchanged tree', async () => {
    const { repositoryPath, shim, spent } = await countedRepository();
    const port = createNativeGitRevisionPort({ repositoryPath, gitExecutable: shim });
    await port.init({ author });
    const first = project();
    const firstCommit = await mint(port, first);
    await spent();

    const removed = changed(first, { 'src/4/m4.ts': undefined });
    const removedCommit = await mint(port, removed, firstCommit);
    const removal = await spent();
    /* Three tree objects (the root, `src`, `src/4`) and the commit: their listings, never a file. */
    expect(removal.stdinBytes).toBeLessThan(4096);
    /* No blob is new, so no `fast-import` runs at all. */
    expect(removal.children).not.toContain('fast-import');
    const removedTree = await port.readTree(revisionId(removedCommit));
    expect(removedTree?.has('src/4/m4.ts')).toBe(false);
    await spent();

    /* A cut of a tree the store already holds — a turn that changed nothing — writes no object. */
    await mint(port, removed, removedCommit);
    const unchanged = await spent();
    expect(unchanged.children.filter((command) => ['fast-import', 'mktree'].includes(command))).toEqual([]);
    /* The commit object and one header line: a held root is still asked about, since a prune may have taken it. */
    expect(unchanged.children.filter((command) => command === 'cat-file')).toEqual(['cat-file']);
    expect(unchanged.stdinBytes).toBeLessThan(1024);
  }, 120_000);

  it('writes what a prune took from under the memo, never a commit over a missing tree', async () => {
    const { repositoryPath, shim } = await countedRepository();
    const port = createNativeGitRevisionPort({ repositoryPath, gitExecutable: shim });
    await port.init({ author });
    const first = project();
    await mint(port, first);
    /* No ref names the mint, so a prune removes everything the memo holds. */
    await execGit('git', ['gc', '--prune=now', '--quiet'], { cwd: repositoryPath });
    const again = await mint(port, first);
    expect(await missingObjects(repositoryPath, again)).toEqual([]);
    const recorded = await port.readRevision(revisionId(again));
    expect(recorded?.treeId).toBe(revisionTreeId(first, 'sha1'));

    /* A held subtree under a new root: pruned, the first write fails and the retry asks Git for everything. */
    await execGit('git', ['gc', '--prune=now', '--quiet'], { cwd: repositoryPath });
    const next = changed(first, { 'src/5/m5.ts': 'export const v5 = "after prune";\n' });
    const nextCommit = await mint(port, next);
    expect(await missingObjects(repositoryPath, nextCommit)).toEqual([]);
    const read = await port.readTree(revisionId(nextCommit));
    expect(read?.get('docs/base.md')?.byteLength).toBe(unchangedBytes);
    expect(new TextDecoder().decode(read?.get('src/5/m5.ts'))).toBe('export const v5 = "after prune";\n');
  }, 120_000);

  it('a fresh port over a populated store asks for headers, never resends held content', async () => {
    const { repositoryPath, shim, spent } = await countedRepository();
    const writer = createNativeGitRevisionPort({ repositoryPath, gitExecutable: shim });
    await writer.init({ author });
    const first = project();
    const firstCommit = await mint(writer, first);
    await spent();

    /* A restarted host: no memo, no held set, the same records the capture kept. */
    const restarted = createNativeGitRevisionPort({ repositoryPath, gitExecutable: shim });
    const next = changed(first, { 'src/0/m0.ts': 'export const v0 = "after restart";\n' });
    const nextCommit = await mint(restarted, next, firstCommit);
    const afterRestart = await spent();

    /* One header line per object it could not vouch for, plus the one changed file: far below the 900 KiB blob. */
    expect(afterRestart.stdinBytes).toBeLessThan(unchangedBytes / 20);
    const record = await restarted.readRevision(revisionId(nextCommit));
    expect(record?.treeId).toBe(revisionTreeId(next, 'sha1'));
  }, 120_000);

  it('records an empty tree, which Git answers as present even when it is not stored', async () => {
    const { repositoryPath, shim } = await countedRepository();
    const port = createNativeGitRevisionPort({ repositoryPath, gitExecutable: shim });
    await port.init({ author });
    const empty = new ImmutableRevisionTree([]);
    const commit = await mint(port, empty);
    const record = await port.readRevision(revisionId(commit));
    const read = await port.readTree(revisionId(commit));
    expect(record?.treeId).toBe(revisionTreeId(empty, 'sha1'));
    expect(read?.size).toBe(0);
    expect(await missingObjects(repositoryPath, commit)).toEqual([]);
  }, 60_000);
});
