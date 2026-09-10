/**
 * One table, every adapter (VSC6).
 *
 * The rows below are the substrate contract: a revision id that equals its
 * commit id, a `change-id` from creation, conflicts recorded as values with
 * Jujutsu's exact headers, provenance that survives the engine, `objectFormat`
 * on every receipt, and `log`/`diff` that never materialize a tree. The
 * `browser` adapter runs them everywhere; the `jj` adapter runs them wherever
 * the pinned binary resolves, and is skipped — never quietly reduced — where it
 * does not.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryProvider } from '@taucad/filesystem/backend';
import { ImmutableRevisionTree, revisionId } from '@taucad/filesystem/revisions';
import type { RevisionId } from '@taucad/filesystem/revisions';
import type { RevisionProvenance, RevisionSummary } from '#revision-authority.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createBrowserRevisionPort } from '#browser-adapter.js';
import { createJjRevisionPort } from '#jj-adapter.js';
import { decodeCommit, encodeCommit, parseChangeId } from '#git-objects.js';
import { runCommand, runGitCommand } from '#git-command.js';
import { loadRevisionAlgebra } from '#revision-algebra.js';
import type { RevisionAlgebra } from '#revision-algebra.js';
import type { RevisionPort } from '#revision-port.js';
import { generatedIgnorePath, generatedJjConfigPath } from '#workspace-config.js';
import { resolveAlgebraArtifact, resolveTestJjExecutable } from '#test-artifacts.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const jjExecutable = resolveTestJjExecutable();
const algebraArtifact = resolveAlgebraArtifact();
const author = { name: 'Tau', email: 'tau@example.com' };
const createdAt = Date.UTC(2026, 8, 8, 12, 0, 0);

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
  workspaceRoot: string;
  readGenerated: (path: string) => Promise<string>;
  /** A second port over the same store — the next process opening this project. */
  reopen: () => RevisionPort;
  dispose: () => Promise<void>;
}>;

let algebra: RevisionAlgebra | undefined;

beforeAll(async () => {
  algebra =
    algebraArtifact === undefined
      ? undefined
      : await loadRevisionAlgebra({ artifact: new Uint8Array(await readFile(algebraArtifact)) });
});

const browserHarness = async (): Promise<Harness> => {
  const filesystem = await createMemoryProvider();
  return {
    port: createBrowserRevisionPort({ filesystem, ...(algebra === undefined ? {} : { algebra }) }),
    workspaceRoot: '',
    readGenerated: async (path) => filesystem.readFile(path, 'utf8'),
    reopen: () => createBrowserRevisionPort({ filesystem, ...(algebra === undefined ? {} : { algebra }) }),
    dispose: async () => {
      await Promise.resolve();
    },
  };
};

const jjHarness = async (): Promise<Harness> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-revisions-jj-'));
  return {
    port: createJjRevisionPort({ workspaceRoot, jjExecutable: jjExecutable!, deadline: 120_000 }),
    workspaceRoot,
    readGenerated: async (path) => readFile(join(workspaceRoot, path), 'utf8'),
    reopen: () => createJjRevisionPort({ workspaceRoot, jjExecutable: jjExecutable!, deadline: 120_000 }),
    dispose: async () => {
      await rm(workspaceRoot, { recursive: true, force: true });
    },
  };
};

type Adapter = Readonly<{ name: 'browser' | 'jj'; create: () => Promise<Harness>; enabled: boolean }>;

const adapters: readonly Adapter[] = [
  { name: 'browser', create: browserHarness, enabled: true },
  { name: 'jj', create: jjHarness, enabled: jjExecutable !== undefined },
];

const conformance = (adapter: Adapter): void => {
  const suite = adapter.enabled ? describe : describe.skip;

  suite(`RevisionPort conformance — ${adapter.name}`, () => {
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

    it('describes a recorded object format, change ids and conflict handling', async () => {
      const descriptor = await port.describe();
      expect(descriptor.engine).toBe(adapter.name);
      expect(descriptor.objectFormat).toBe('sha1');
      expect(descriptor.changeIds).toBe(true);
      expect(descriptor.conflictsAsValues).toBe(true);
    });

    it('generates the ignore file and the engine config', async () => {
      const ignore = await harness.readGenerated(generatedIgnorePath);
      expect(ignore).toContain('/.tau/cache/');
      expect(ignore).toContain('/.tau/workspaces/');
      expect(ignore).toContain('node_modules/');
      expect(await harness.readGenerated(generatedJjConfigPath)).toContain('max-new-file-size = 0');
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
      expect(await port.readHead()).toBeUndefined();
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
      // The engine computes the conflict when it can. A browser host with no
      // compiled algebra records the terms the caller computed instead; both
      // paths must produce the same headers.
      const engineComputes = adapter.name === 'jj' || algebra !== undefined;
      const merged = await port.writeRevision({
        parents: [left, right],
        provenance: provenance('merge'),
        summary: summary('Conflicted merge'),
        ...(engineComputes
          ? {}
          : {
              tree: tree({ 'a.txt': 'conflict\n' }),
              conflict: {
                trees: ['1'.repeat(40), '2'.repeat(40), '3'.repeat(40)],
                labels: ['left', 'base', 'right'],
              },
            }),
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
  });
};

for (const adapter of adapters) {
  conformance(adapter);
}

const identity = jjExecutable === undefined ? describe.skip : describe;

identity('a revision id is its commit id on every adapter', () => {
  let workspaceRoot: string;
  let port: RevisionPort;

  beforeAll(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-revisions-id-'));
    port = createJjRevisionPort({ workspaceRoot, jjExecutable: jjExecutable!, deadline: 120_000 });
    await port.init({ author });
  }, 180_000);

  afterAll(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('re-encodes a revision the pinned Jujutsu wrote to exactly its own id', async () => {
    const receipt = await port.writeRevision({
      parents: [],
      tree: tree({ 'a.txt': 'hello\n' }),
      provenance: provenance('user'),
      summary: summary('Identity check'),
    });
    const object = await runGitCommand({
      gitExecutable: 'git',
      cwd: workspaceRoot,
      args: ['cat-file', 'commit', receipt.commitId],
    });
    expect(object.exitCode).toBe(0);
    const commit = decodeCommit(object.stdout);
    // The browser adapter's encoder, given the tree and headers the engine
    // wrote, must name the same revision.
    const reencoded = encodeCommit({
      objectFormat: 'sha1',
      tree: commit.tree,
      parents: commit.parents,
      author: commit.author,
      committer: commit.committer,
      message: commit.message,
      changeId: parseChangeId(commit.changeId!),
      ...(commit.conflictedTrees === undefined ? {} : { conflictedTrees: commit.conflictedTrees }),
      ...(commit.conflictLabels === undefined ? {} : { conflictLabels: commit.conflictLabels }),
    });
    expect(reencoded.id).toBe(receipt.commitId);
    expect(commit.changeId).toBe(receipt.changeId);
  }, 180_000);
});

const canary = jjExecutable === undefined ? describe.skip : describe;

canary('an authored file is never silently dropped from a snapshot', () => {
  // One byte past Jujutsu's 1 MiB default. The blueprint's control.
  const oversized = new Uint8Array(1_048_577).fill(0x61);
  let workspaceRoot: string;

  beforeAll(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-revisions-canary-'));
  });

  afterAll(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('drops it under the engine default, and keeps it under the generated config', async () => {
    // Red control: initialize without the generated configuration.
    const bare = join(workspaceRoot, 'bare');
    const bareConfig = join(workspaceRoot, 'bare-config.toml');
    await mkdir(bare, { recursive: true });
    await writeFile(bareConfig, '[user]\nname = "Tau"\nemail = "tau@example.com"\n');
    const jj = async (args: readonly string[]): Promise<string> => {
      const result = await runCommand({
        executable: jjExecutable!,
        cwd: bare,
        args: ['--color=never', '--no-pager', ...args],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment variable name.
        env: { JJ_CONFIG: bareConfig },
        deadline: 120_000,
      });
      return decoder.decode(result.stdout);
    };
    await jj(['git', 'init']);
    await writeFile(join(bare, 'big.bin'), oversized);
    expect(await jj(['file', 'list'])).not.toContain('big.bin');

    // Green: the generated configuration is written before init.
    const configured = join(workspaceRoot, 'configured');
    await mkdir(configured, { recursive: true });
    const port = createJjRevisionPort({ workspaceRoot: configured, jjExecutable: jjExecutable!, deadline: 120_000 });
    await port.init({ author });
    const receipt = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([['big.bin', oversized]]),
      provenance: provenance('user'),
      summary: summary('Oversized authored file'),
    });
    const recovered = await port.readTree(revisionId(receipt.commitId));
    expect(recovered?.get('big.bin')?.byteLength).toBe(1_048_577);
  }, 300_000);
});

describe('browser ref publication under a Web Lock (8-review S4)', () => {
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('queues updateRef behind the same-named lock another document holds', async () => {
    const filesystem = await createMemoryProvider();
    const port = createBrowserRevisionPort({ filesystem });
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
    const port = createBrowserRevisionPort({ filesystem });
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
