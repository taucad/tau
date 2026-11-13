/**
 * The engine's second line (linux-terminal-git-parity LP4, Finding 7).
 *
 * Something that can write the store — code in the Terminal, a policy hole —
 * can plant a `commondir` that re-points git at a config of its choosing
 * (threat cases 3 and 5) or set `core.fsmonitor` to a program git runs on every
 * index read (case 1). Tau's engine pins `GIT_COMMON_DIR` to the real store
 * and `core.fsmonitor=false` on every command, so neither plant changes what
 * the engine reads or runs. Each row plants by hand, drives every kind of
 * command the engine issues — the live checkout and a linked one — against a
 * real repository, and then reads the planted marker and the real store.
 */

import { execFileSync } from 'node:child_process';
import { access, chmod, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import type { RevisionId } from '#algorithms/index.js';
import type { Checkout, RevisionPort } from '#revision-port.js';
import { gitToolchainOnPath, nativeHarness } from '#test/native-git-harness.js';
import type { NativeGitHarness } from '#test/native-git-harness.js';
import { recordedBy } from '#test/identity.js';

const encoder = new TextEncoder();
const author = { name: 'Tau', email: 'tau@example.com' };
const projectId = 'project-planted-store';

const tree = (entries: Record<string, string>): ImmutableRevisionTree =>
  new ImmutableRevisionTree(Object.entries(entries).map(([path, content]) => [path, encoder.encode(content)]));

/** Record `files` onto `branch` the way a mint does: write, then publish. */
const mint = async (port: RevisionPort, branch: string, files: Record<string, string>): Promise<RevisionId> => {
  const parent = await port.readRef(branch);
  const receipt = await port.writeRevision({
    parents: parent === undefined ? [] : [parent],
    tree: tree(files),
    provenance: {
      source: 'user',
      ...recordedBy('actor-planted'),
      runId: 'run-planted',
      createdAt: Date.UTC(2026, 10, 13),
    },
    summary: { generated: `Mint onto ${branch}` },
  });
  const head = revisionId(receipt.commitId);
  const updated = await port.updateRef({
    name: branch,
    expectedHead: parent,
    head,
  });
  expect(updated.status).toBe('updated');
  return head;
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

type Planted = Readonly<{
  store: string;
  /** Written by the planted program each time anything runs it. */
  marker: string;
  program: string;
}>;

/** A program that records each run, outside the work tree. */
const plantProgram = async (harness: NativeGitHarness): Promise<Planted> => {
  const marker = join(harness.root, 'ran');
  const program = join(harness.root, 'planted.sh');
  await writeFile(program, `#!/bin/sh\necho "$0 $*" >> '${marker}'\n`);
  await chmod(program, 0o755);
  return { store: join(harness.liveRoot, '.git'), marker, program };
};

/**
 * Every kind of command the engine issues, live checkout and linked checkout:
 * reads, writes, index refreshes, ignore listing, operation probes, and a
 * checkout added and removed.
 */
const exercise = async (port: RevisionPort, linked: Checkout): Promise<RevisionId> => {
  expect(await port.readHead()).toMatchObject({ branch: 'main' });
  const branches = await port.listRefs();
  expect(branches.map((ref) => ref.name)).toEqual(expect.arrayContaining(['main', 'side']));
  const head = await mint(port, 'main', { 'a.txt': 'a\n', 'c.txt': 'c\n' });
  await mint(port, 'side', { 'a.txt': 'a\n', 'b.txt': 'b\n', 'd.txt': 'd\n' });
  const [newest] = await port.log({ heads: [head] });
  expect(newest?.id).toBe(head);
  const changes = await port.diff({ from: undefined, to: head });
  expect(changes.map((entry) => entry.path)).toStrictEqual(['a.txt', 'c.txt']);
  expect(await port.readTree(head)).toBeDefined();
  await port.ignoredPaths?.();
  await port.ignoredPaths?.(linked.root);
  expect(await port.gitOperation?.()).toBeUndefined();
  expect(await port.gitOperation?.(linked.root)).toBeUndefined();
  const listed = await port.listCheckouts!();
  expect(listed.map((checkout) => checkout.kind).toSorted()).toStrictEqual(['linked', 'live']);
  const extra = await port.addCheckout!({ branch: 'extra', from: head });
  await port.removeCheckout!(extra.id);
  return head;
};

/** `main` as the real store's own loose ref holds it, read from disk so that no plant can answer for it. */
const realHead = async (store: string): Promise<string> => {
  const loose = await readFile(join(store, 'refs', 'heads', 'main'), 'utf8');
  return loose.trim();
};

const prepared = async (harness: NativeGitHarness): Promise<Checkout> => {
  const { port } = harness;
  await port.init({ author });
  const base = await mint(port, 'main', { 'a.txt': 'a\n' });
  return port.addCheckout!({ branch: 'side', from: base });
};

describe.runIf(gitToolchainOnPath)('native-git reads only its own store (LP4)', () => {
  it('ignores a commondir written into the store and into a linked checkout', async () => {
    const harness = await nativeHarness(projectId, 'tau-revisions-planted-commondir-');
    try {
      const linked = await prepared(harness);
      const planted = await plantProgram(harness);
      /* A complete common directory of the plant's own, whose config runs the program (cases 3 and 5). */
      const forged = join(harness.root, 'forged');
      await mkdir(forged, { recursive: true });
      await cp(join(planted.store, 'objects'), join(forged, 'objects'), {
        recursive: true,
      });
      await cp(join(planted.store, 'refs'), join(forged, 'refs'), {
        recursive: true,
      });
      await writeFile(
        join(forged, 'config'),
        `[core]\n\trepositoryformatversion = 0\n\tfsmonitor = ${planted.program}\n`,
      );
      const [admin] = await readdir(join(planted.store, 'worktrees'));
      expect(admin).toBeDefined();
      await writeFile(join(planted.store, 'commondir'), `${forged}\n`);
      await writeFile(join(planted.store, 'worktrees', admin!, 'commondir'), `${forged}\n`);

      await exercise(harness.port, linked);
      await exercise(harness.reopen(), linked);

      /* The planted config and its monitor never applied. */
      expect(await exists(planted.marker)).toBe(false);
    } finally {
      await harness.dispose();
    }
  }, 120_000);

  it('never runs a core.fsmonitor set in the store config', async () => {
    const harness = await nativeHarness(projectId, 'tau-revisions-planted-fsmonitor-');
    try {
      const linked = await prepared(harness);
      const planted = await plantProgram(harness);
      execFileSync('git', ['config', '--file', join(planted.store, 'config'), 'core.fsmonitor', planted.program]);

      const first = await exercise(harness.port, linked);
      expect(await realHead(planted.store)).toBe(first);
      const second = await exercise(harness.reopen(), linked);
      expect(await realHead(planted.store)).toBe(second);

      expect(await exists(planted.marker)).toBe(false);
    } finally {
      await harness.dispose();
    }
  }, 120_000);
});
