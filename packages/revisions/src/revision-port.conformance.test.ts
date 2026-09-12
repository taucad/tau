/**
 * One table, every adapter (VSC6).
 *
 * The rows below are the substrate contract: a revision id that equals its
 * commit id, a `change-id` from creation, conflicts recorded as values with
 * Jujutsu's exact headers, provenance that survives the engine, `objectFormat`
 * on every receipt, `log`/`diff` that never materialize a tree, and one
 * checkout per branch. `isomorphic-git` runs them everywhere; `native-git` runs
 * them wherever `git` is on `PATH`, and the last test in this file is what makes
 * the table an actual comparison rather than a promise: the same scripted edits
 * through both adapters name the same tree (I4).
 */

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryProvider } from '@taucad/filesystem/backend';
import { ImmutableRevisionTree, revisionId } from '@taucad/filesystem/revisions';
import type { FileSystemProvider } from '@taucad/filesystem';
import type { RevisionId } from '@taucad/filesystem/revisions';
import type { RevisionProvenance, RevisionSummary } from '#revision-authority.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseChangeId } from '#git-objects.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import type { RevisionPort } from '#revision-port.js';
import { generatedIgnorePath } from '#workspace-config.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const author = { name: 'Tau', email: 'tau@example.com' };
const createdAt = Date.UTC(2026, 8, 8, 12, 0, 0);
const projectId = 'project-conformance';

const gitOnPath = ((): boolean => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const provenance = (source: RevisionProvenance['source'] = 'agent'): RevisionProvenance => ({
  source,
  actorId: 'actor-lane',
  runId: 'run-lane',
  createdAt,
});
const summary = (generated: string): RevisionSummary => ({ generated });
const tree = (entries: Record<string, string>): ImmutableRevisionTree =>
  new ImmutableRevisionTree(Object.entries(entries).map(([path, content]) => [path, encoder.encode(content)]));

type Harness = Readonly<{
  port: RevisionPort;
  readGenerated: (path: string) => Promise<string>;
  /** A second port over the same store — the next process opening this project. */
  reopen: () => RevisionPort;
  dispose: () => Promise<void>;
}>;

const isomorphicHarness = async (): Promise<Harness> => {
  const filesystem = await createMemoryProvider();
  /* The S4 `/checkouts/<id>` route, as the page will install it: one provider
   * per checkout, handed to the adapter, never a path joined above the project. */
  const roots = new Map<string, FileSystemProvider>();
  const checkouts = {
    projectId,
    root: async (id: string): Promise<FileSystemProvider> => {
      const existing = roots.get(id);
      if (existing !== undefined) {
        return existing;
      }
      const created = await createMemoryProvider();
      roots.set(id, created);
      return created;
    },
  };
  const create = (): RevisionPort => createIsomorphicGitRevisionPort({ filesystem, checkouts });
  return {
    port: create(),
    readGenerated: async (path) => filesystem.readFile(path, 'utf8'),
    reopen: create,
    dispose: async () => {
      await Promise.resolve();
    },
  };
};

const nativeHarness = async (): Promise<Harness> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-revisions-conformance-'));
  const repositoryPath = join(root, 'project');
  await mkdir(repositoryPath, { recursive: true });
  // Never inside the repository's own worktree: native Git refuses that.
  const checkouts = { projectId, directory: join(root, 'checkouts') };
  const create = (): RevisionPort => createNativeGitRevisionPort({ repositoryPath, checkouts });
  return {
    port: create(),
    readGenerated: async (path) => readFile(join(repositoryPath, path), 'utf8'),
    reopen: create,
    dispose: async () => rm(root, { force: true, recursive: true }),
  };
};

type Adapter = Readonly<{
  name: 'isomorphic-git' | 'native-git';
  create: () => Promise<Harness>;
  enabled: boolean;
}>;

const adapters: readonly Adapter[] = [
  { name: 'isomorphic-git', create: isomorphicHarness, enabled: true },
  { name: 'native-git', create: nativeHarness, enabled: gitOnPath },
];

const conformance = (adapter: Adapter): void => {
  describe.runIf(adapter.enabled)(`RevisionPort conformance — ${adapter.name}`, () => {
    let harness: Harness;
    let port: RevisionPort;
    let base: RevisionId;
    let child: RevisionId;

    beforeAll(async () => {
      harness = await adapter.create();
      port = harness.port;
      await port.init({ author });
      const first = await port.writeRevision({
        parents: [],
        tree: tree({ 'a.txt': 'a\n', 'nested/b.txt': 'b\n' }),
        provenance: provenance('user'),
        summary: summary('Base revision'),
      });
      base = revisionId(first.commitId);
      const second = await port.writeRevision({
        parents: [base],
        tree: tree({ 'a.txt': 'a2\n', 'c.txt': 'c\n' }),
        provenance: provenance('agent'),
        summary: summary('Child revision'),
      });
      child = revisionId(second.commitId);
    }, 180_000);

    afterAll(async () => {
      await harness.dispose();
    });

    it('describes a recorded object format, change ids, conflict handling and checkouts', async () => {
      const descriptor = await port.describe();
      expect(descriptor.engine).toBe(adapter.name);
      expect(descriptor.objectFormat).toBe('sha1');
      expect(descriptor.changeIds).toBe(true);
      expect(descriptor.conflictsAsValues).toBe(true);
      expect(descriptor.checkouts).toBe(true);
    });

    it('generates the ignore file', async () => {
      const ignore = await harness.readGenerated(generatedIgnorePath);
      expect(ignore).toContain('/.tau/cache/');
      expect(ignore).toContain('/.tau/workspaces/');
      expect(ignore).toContain('node_modules/');
    });

    it('gives every revision an id equal to its commit id and a change id from creation', async () => {
      const record = await port.readRevision(child);
      expect(record?.id).toBe(child);
      expect(record?.receipt.commitId).toBe(child);
      expect(record?.receipt.objectFormat).toBe('sha1');
      expect(child).toMatch(/^[\da-f]{40}$/u);
      expect(record?.receipt.changeId).toMatch(/^[k-z]{32}$/u);
      expect(() => parseChangeId(record!.receipt.changeId)).not.toThrow();
      expect(await port.changeId?.(child)).toBe(record?.receipt.changeId);
    });

    it('preserves the provenance trailer through the engine', async () => {
      const record = await port.readRevision(child);
      expect(record?.provenance).toStrictEqual(provenance('agent'));
      expect(record?.summary).toStrictEqual(summary('Child revision'));
      const baseRecord = await port.readRevision(base);
      expect(baseRecord?.provenance.source).toBe('user');
    });

    it('round-trips a tree', async () => {
      const recovered = await port.readTree(child);
      const entries = recovered?.entries() ?? [];
      expect(entries.map((entry) => entry.path)).toStrictEqual(['a.txt', 'c.txt']);
      expect(decoder.decode(recovered?.get('a.txt'))).toBe('a2\n');
    });

    it('answers an unknown revision with undefined, not a throw', async () => {
      expect(await port.readRevision(revisionId('0'.repeat(40)))).toBeUndefined();
    });

    it('walks nothing from an explicit empty heads list, on every adapter', async () => {
      /* A fresh store's first `load()` asks exactly this; `ancestors()` is not a
       * revset and the browser walk answered `[]` (8-review M1 / N5). */
      await expect(port.log({ heads: [] })).resolves.toEqual([]);
    });

    it('logs the graph without materializing a tree', async () => {
      const entries = await port.log({ heads: [child] });
      const ids = entries.map((entry) => entry.id);
      expect(ids).toContain(child);
      expect(ids).toContain(base);
      const head = entries.find((entry) => entry.id === child)!;
      expect(head.parents).toStrictEqual([base]);
      expect(head.conflicted).toBe(false);
      expect(Object.keys(head).toSorted()).toStrictEqual([
        'changeId',
        'conflicted',
        'id',
        'parents',
        'provenance',
        'summary',
      ]);
    });

    it('diffs two revisions as paths, never content', async () => {
      const changes = [...(await port.diff({ from: base, to: child }))].sort((left, right) =>
        left.path.localeCompare(right.path),
      );
      expect(changes).toStrictEqual([
        { path: 'a.txt', kind: 'modified' },
        { path: 'c.txt', kind: 'added' },
        { path: 'nested/b.txt', kind: 'deleted' },
      ]);
      expect(changes.every((change) => Object.keys(change).toSorted().join(',') === 'kind,path')).toBe(true);
    });

    it('publishes a ref only from its expected old value', async () => {
      const name = 'tau-conformance';
      expect(await port.readRef(name)).toBeUndefined();
      expect(await port.updateRef({ name, expectedHead: undefined, head: base })).toMatchObject({
        status: 'updated',
        head: base,
      });
      expect(await port.readRef(name)).toBe(base);
      expect(await port.updateRef({ name, expectedHead: undefined, head: child })).toMatchObject({
        status: 'conflicted',
        actualHead: base,
        proposedHead: child,
      });
      expect(await port.updateRef({ name, expectedHead: base, head: child })).toMatchObject({
        status: 'updated',
        previousHead: base,
        head: child,
      });
      const references = await port.listRefs();
      expect(references.map((reference) => reference.name)).toContain(name);
    });

    it('deletes a ref under the same expected-old check, and it leaves listRefs', async () => {
      const name = 'tau-conformance-delete';
      expect(await port.updateRef({ name, expectedHead: undefined, head: base })).toMatchObject({
        status: 'updated',
        head: base,
      });
      expect(await port.updateRef({ name, expectedHead: child })).toMatchObject({
        status: 'conflicted',
        actualHead: base,
      });
      expect(await port.updateRef({ name, expectedHead: base })).toMatchObject({
        status: 'updated',
        previousHead: base,
        head: undefined,
      });
      const remaining = await port.listRefs();
      expect(remaining.map((reference) => reference.name)).not.toContain(name);
      expect(await port.readRef(name)).toBeUndefined();
    }, 180_000);

    it('tracks the live tree on a branch, and a reopened store reads the same head', async () => {
      // The product's other branch shape carries a slash (c2-review N4).
      const name = 'agent/tau-conformance-head';
      /* `init` leaves HEAD symbolic on an unborn `main`, exactly as `git init`
       * does — the head is a name, and the branch behind it need not exist. */
      expect(await port.readHead()).toEqual({ branch: 'main', head: undefined });
      // Symbolic: the head is set before the branch is born, and follows it.
      await port.setHead(name);
      expect(await port.readHead()).toEqual({ branch: name, head: undefined });
      await port.updateRef({ name, expectedHead: undefined, head: base });
      expect(await port.readHead()).toEqual({ branch: name, head: base });
      /* The next process opening this project reads the same head, and moving
       * it there — what a checkout does — is what this one then reads. */
      const reopened = harness.reopen();
      expect(await reopened.readHead()).toEqual({ branch: name, head: base });
      await reopened.setHead('main');
      expect(await port.readHead()).toEqual({ branch: 'main', head: undefined });
    }, 180_000);

    it('never shows a head between two concurrent moves (c2-review S2)', async () => {
      await port.setHead('main');
      const observed: Array<string | undefined> = [];
      const reading = (async (): Promise<void> => {
        for (let attempt = 0; attempt < 20; attempt++) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- the reads are the interleaving under test.
          const seen = await port.readHead();
          observed.push(seen?.branch);
        }
      })();
      await Promise.all([port.setHead('agent/left'), port.setHead('agent/right'), reading]);
      expect(observed).not.toContain(undefined);
      const settled = await port.readHead();
      expect(['agent/left', 'agent/right']).toContain(settled?.branch);
    }, 180_000);

    it('records a conflicted three-way merge as a value with Jujutsu headers in order', async () => {
      const leftReceipt = await port.writeRevision({
        parents: [base],
        tree: tree({ 'a.txt': 'left\n', 'nested/b.txt': 'b\n' }),
        provenance: provenance('agent'),
        summary: summary('Left side'),
      });
      const left = revisionId(leftReceipt.commitId);
      const rightReceipt = await port.writeRevision({
        parents: [base],
        tree: tree({ 'a.txt': 'right\n', 'nested/b.txt': 'b\n' }),
        provenance: provenance('agent'),
        summary: summary('Right side'),
      });
      const right = revisionId(rightReceipt.commitId);
      /* The caller merges — `mergeRevisionTrees` on both legs — and the terms of
       * an unresolved merge arrive here as a value, which is what keeps a
       * conflict in the graph without either engine owning a merge algorithm. */
      const merged = await port.writeRevision({
        parents: [left, right],
        provenance: provenance('merge'),
        summary: summary('Conflicted merge'),
        tree: tree({ 'a.txt': 'conflict\n' }),
        conflict: {
          trees: ['1'.repeat(40), '2'.repeat(40), '3'.repeat(40)],
          labels: ['left', 'base', 'right'],
        },
      });
      expect(merged.conflicted).toBe(true);
      const conflict = await port.conflicts?.(revisionId(merged.commitId));
      expect(conflict?.trees).toHaveLength(3);
      expect(conflict?.labels).toHaveLength(3);
      expect(conflict!.trees.every((id) => /^[\da-f]{40}$/u.test(id))).toBe(true);
      const record = await port.readRevision(revisionId(merged.commitId));
      expect(record?.receipt.conflicted).toBe(true);
      expect(record?.provenance.source).toBe('merge');
      expect(record?.parents).toStrictEqual([left, right]);
    }, 180_000);

    it('lists the live checkout, adds one per branch, and refuses a second on the same branch', async () => {
      const branch = 'checkout/conformance';
      await port.updateRef({ name: branch, expectedHead: undefined, head: base });
      const added = await port.addCheckout!({ branch });
      expect(added).toMatchObject({ projectId, kind: 'linked', branch, baseRevisionId: base });
      expect(added.id).not.toBe('');

      const listed = await port.listCheckouts!();
      expect(listed[0]).toMatchObject({ kind: 'live' });
      expect(listed.filter((checkout) => checkout.branch === branch)).toHaveLength(1);
      expect(listed.map((checkout) => checkout.id)).toContain(added.id);

      await expect(port.addCheckout!({ branch })).rejects.toMatchObject({ code: 'CHECKOUT_CONFLICT' });
    }, 180_000);

    it('removes a linked checkout and refuses to remove the live one', async () => {
      const branch = 'checkout/removable';
      await port.updateRef({ name: branch, expectedHead: undefined, head: base });
      const added = await port.addCheckout!({ branch });
      await port.removeCheckout!(added.id);
      const remaining = await port.listCheckouts!();
      expect(remaining.map((checkout) => checkout.id)).not.toContain(added.id);
      await expect(port.removeCheckout!('live')).rejects.toMatchObject({ code: 'CHECKOUT_CONFLICT' });
    }, 180_000);
  });
};

for (const adapter of adapters) {
  conformance(adapter);
}

/**
 * I4, as a comparison rather than a promise: the charter's stop condition for
 * this wave is `isomorphic-git` diverging from native Git on identity, and the
 * only thing that can observe it is running the same edits through both.
 */
describe.runIf(gitOnPath)('cross-adapter identity (I4)', () => {
  it('names the same tree — and the same revision — from the same scripted edits', async () => {
    const harnesses = await Promise.all([isomorphicHarness(), nativeHarness()]);
    try {
      const records = await Promise.all(
        harnesses.map(async (harness) => {
          await harness.port.init({ author });
          const first = await harness.port.writeRevision({
            parents: [],
            tree: tree({ 'a.txt': 'a\n', 'nested/deep/b.txt': 'b\n', 'z.txt': 'z\n' }),
            provenance: provenance('user'),
            summary: summary('Base revision'),
          });
          const second = await harness.port.writeRevision({
            parents: [revisionId(first.commitId)],
            tree: tree({ 'a.txt': 'a2\n', 'nested/deep/b.txt': 'b\n', 'nested/c.txt': 'c\n' }),
            provenance: provenance('agent'),
            summary: summary('Child revision'),
          });
          return harness.port.readRevision(revisionId(second.commitId));
        }),
      );
      const [isomorphic, native] = records;
      expect(isomorphic?.treeId).toMatch(/^[\da-f]{40}$/u);
      expect(native?.treeId).toBe(isomorphic?.treeId);
      // The commit bytes are the same encoder's on both legs, so the ids match too.
      expect(native?.id).toBe(isomorphic?.id);
      expect(native?.receipt.changeId).toBe(isomorphic?.receipt.changeId);
    } finally {
      await Promise.all(harnesses.map(async (harness) => harness.dispose()));
    }
  }, 180_000);
});

describe('browser ref publication under a Web Lock (8-review S4)', () => {
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('queues updateRef behind the same-named lock another document holds', async () => {
    const filesystem = await createMemoryProvider();
    const port = createIsomorphicGitRevisionPort({ filesystem });
    await port.init({ author: { name: 'Tau', email: 'tau@example.test' } });
    const first = await port.writeRevision({
      parents: [],
      tree: tree({ 'a.txt': 'a\n' }),
      provenance: provenance('user'),
      summary: summary('Base revision'),
    });

    // Another document is inside the critical section for this ref.
    const held = Promise.withResolvers<void>();
    const requested: string[] = [];
    vi.stubGlobal('navigator', {
      locks: {
        request: async (
          name: string,
          options: { readonly mode: 'exclusive' },
          callback: (lock: { readonly name: string; readonly mode: 'exclusive' }) => Promise<unknown>,
        ): Promise<unknown> => {
          requested.push(name);
          await held.promise;
          return callback({ name, mode: options.mode });
        },
      },
    });

    const publishing = port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(first.commitId) });
    await expect(
      Promise.race([
        publishing.then((): 'published' => 'published'),
        new Promise<'waiting'>((resolve) => {
          setTimeout(() => {
            resolve('waiting');
          }, 100);
        }),
      ]),
    ).resolves.toBe('waiting');
    expect(requested).toEqual([`tau:revision-ref:${filesystem.id}:.tau/revisions:main`]);

    held.resolve();
    await expect(publishing).resolves.toMatchObject({ status: 'updated', name: 'main' });
  });

  it('queues setHead behind the same-named lock another document holds (c2-review S2)', async () => {
    const filesystem = await createMemoryProvider();
    const port = createIsomorphicGitRevisionPort({ filesystem });
    await port.init({ author: { name: 'Tau', email: 'tau@example.test' } });
    await port.setHead('main');

    const held = Promise.withResolvers<void>();
    const requested: string[] = [];
    vi.stubGlobal('navigator', {
      locks: {
        request: async (
          name: string,
          options: { readonly mode: 'exclusive' },
          callback: (lock: { readonly name: string; readonly mode: 'exclusive' }) => Promise<unknown>,
        ): Promise<unknown> => {
          requested.push(name);
          await held.promise;
          return callback({ name, mode: options.mode });
        },
      },
    });

    const moving = port.setHead('agent/other');
    await expect(
      Promise.race([
        moving.then((): 'moved' => 'moved'),
        new Promise<'waiting'>((resolve) => {
          setTimeout(() => {
            resolve('waiting');
          }, 100);
        }),
      ]),
    ).resolves.toBe('waiting');
    expect(requested).toEqual([`tau:revision-ref:${filesystem.id}:.tau/revisions:HEAD`]);

    held.resolve();
    await moving;
    expect(await port.readHead()).toMatchObject({ branch: 'agent/other' });
  });
});
