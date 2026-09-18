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
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
import { lfsPointerFor } from '#lfs.js';
import { createRevisionHttpClient } from '#http-client.js';
import type { Checkout, RevisionPort } from '#revision-port.js';
import { conflictLabels, materializeConflict, readConflictTerms } from '#revision-conflict.js';
import { readRevisionLog } from '#revision-verbs.js';
import { startGitHttpBackend } from '#test/git-http-backend.js';
import { gitOnPath, nativeHarness } from '#test/native-git-harness.js';
import { generatedIgnorePath } from '#workspace-config.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const author = { name: 'Tau', email: 'tau@example.com' };
const createdAt = Date.UTC(2026, 8, 8, 12, 0, 0);
const projectId = 'project-conformance';

const gitExitCode = (cwd: string, args: readonly string[]): number => {
  try {
    execFileSync('git', args, { cwd, stdio: 'ignore' });
    return 0;
  } catch {
    return 1;
  }
};

const provenance = (source: RevisionProvenance['source'] = 'agent'): RevisionProvenance => ({
  source,
  actorId: 'actor-lane',
  runId: 'run-lane',
  createdAt,
});
const summary = (generated: string): RevisionSummary => ({ generated });
const tree = (entries: Record<string, string | Uint8Array<ArrayBuffer>>): ImmutableRevisionTree =>
  new ImmutableRevisionTree(
    Object.entries(entries).map(([path, content]) => [
      path,
      typeof content === 'string' ? encoder.encode(content) : content,
    ]),
  );

/* Review 4 R6: 1.5 KiB of non-UTF-8 bytes, NUL included (index 0, 256, …), so
 * identity covers a blob no text codec could have round-tripped by accident. */
const binaryBlob = Uint8Array.from({ length: 1536 }, (_, index) => (index * 7) % 256);

/** Every file under one checkout's root, as the host would see them. */
const providerFiles = async (provider: FileSystemProvider, path = ''): Promise<readonly string[]> => {
  const names = await provider.readdir(path).catch((): readonly string[] => []);
  const nested = await Promise.all(
    names.map(async (name) => {
      const child = path === '' ? name : `${path}/${name}`;
      const stat = await provider.stat(child);
      return stat.type === 'dir' ? providerFiles(provider, child) : [child];
    }),
  );
  return nested.flat().toSorted();
};

type Harness = Readonly<{
  port: RevisionPort;
  readGenerated: (path: string) => Promise<string>;
  /** Where this host says the live checkout is (architecture:448). */
  liveRoot: string;
  /** What a checkout's root actually holds — the R3 question. */
  checkoutFiles: (checkout: Checkout) => Promise<readonly string[]>;
  writeCheckoutFile: (checkout: Checkout, path: string, content: string) => Promise<void>;
  /** A second port over the same store — the next process opening this project. */
  reopen: () => RevisionPort;
  /**
   * A port over the same store that can reach a remote.
   *
   * On a disk host the `git` binary is the transport and this is the ordinary
   * port; in the page it is the one constructed with Tau's `HttpClient` (S24).
   */
  withTransport: () => RevisionPort;
  /**
   * Write one fully-qualified ref directly.
   *
   * The port publishes branches; the record set (`refs/tau/chats/*`) is written
   * by its own effect in W17, so the transport rows put one there by hand.
   */
  writeRawRef: (name: string, head: RevisionId) => Promise<void>;
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
    withTransport: () =>
      createIsomorphicGitRevisionPort({
        filesystem,
        checkouts,
        /* The host's credential, as a header the client resolves per request
         * (I8). A disk host returns a bearer; the browser returns nothing here
         * and sends the session cookie instead (`credentials: 'include'`). */
        http: createRevisionHttpClient({ authorization: () => 'Bearer session-token' }),
      }),
    writeRawRef: async (name, head) => {
      await filesystem.mkdir(`.git/${name.slice(0, name.lastIndexOf('/'))}`, { recursive: true });
      await filesystem.writeFile(`.git/${name}`, `${head}\n`);
    },
    readGenerated: async (path) => filesystem.readFile(path, 'utf8'),
    liveRoot: `/projects/${projectId}`,
    checkoutFiles: async (checkout) => providerFiles(await checkouts.root(checkout.id)),
    writeCheckoutFile: async (checkout, path, content) => {
      const provider = await checkouts.root(checkout.id);
      await provider.writeFile(path, encoder.encode(content));
    },
    reopen: create,
    dispose: async () => {
      await Promise.resolve();
    },
  };
};

const createNativeHarness = async (): Promise<Harness> => nativeHarness(projectId, 'tau-revisions-conformance-');

type Adapter = Readonly<{
  name: 'isomorphic-git' | 'native-git';
  create: () => Promise<Harness>;
  enabled: boolean;
}>;

const adapters: readonly Adapter[] = [
  { name: 'isomorphic-git', create: isomorphicHarness, enabled: true },
  { name: 'native-git', create: createNativeHarness, enabled: gitOnPath },
];

/* AC23's pin on the table itself: two rows, both live, nothing skipped. `git`
 * on `PATH` is a prerequisite of this suite — the transport rows already spawn
 * `git http-backend` — so a red here means the comparison stopped being one. */
describe('the conformance table', () => {
  it('runs at least two enabled adapters', () => {
    /* AC23 says "at least two", and `toHaveLength(2)` said "exactly two"
     * (review R11) — a third adapter row would have failed the pin that exists
     * to keep rows from going dark. */
    expect(adapters.filter((adapter) => adapter.enabled).length).toBeGreaterThanOrEqual(2);
  });

  it('skips no row', async () => {
    const source = await readFile(new URL(import.meta.url), 'utf8');
    expect(source).not.toMatch(/describe\.skip/u);
  });
});

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
      expect(ignore).toContain('/.git/');
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

    /**
     * The durable turn↔revision link, on this engine (W5, S9).
     *
     * `provenance.turnId` in the `Tau-Metadata` trailer is the **only** path by
     * which a settled turn's card comes back after a reload: the settlement
     * event is gone, and `log(branch)` is all the page has. So the claim that
     * it "rides both engines free" is a row in this table, not a comment.
     */
    it('carries a turn id from the trailer back onto the log row', async () => {
      const name = 'agent/tau-conformance-turn';
      const receipt = await port.writeRevision({
        parents: [child],
        tree: tree({ 'a.txt': 'a3\n' }),
        provenance: { ...provenance('agent'), turnId: 'turn-lane-1' },
        summary: summary('Turn revision'),
      });
      const settled = revisionId(receipt.commitId);
      await port.updateRef({ name, expectedHead: undefined, head: settled });

      const record = await port.readRevision(settled);
      expect(record?.provenance.turnId).toBe('turn-lane-1');

      const rows = await readRevisionLog(port, { branch: name });
      const row = rows.find((entry) => entry.revisionId === settled);
      expect(row?.turnId).toBe('turn-lane-1');
      /* A revision recorded outside a turn carries no turn, rather than an
       * empty string a reader would have to know to ignore. */
      expect(rows.find((entry) => entry.revisionId === child)?.turnId).toBeUndefined();
    }, 180_000);

    /**
     * S31: a named version is an annotated tag, on both engines.
     *
     * The note and the actor ride the tag's own message, so a clone shows the
     * name with `git tag -n` and Tau reads the rest; the revision the name
     * points at is untouched, which is what makes renaming safe.
     */
    it('round-trips a named version as an annotated tag', async () => {
      const actor = {
        kind: 'user',
        id: 'user-lane',
        name: 'Lane Person',
        email: 'lane@example.com',
      } as const;
      const created = await port.tag({
        name: 'v1.0',
        revisionId: child,
        note: 'First cut of the bracket',
        actor,
        createdAt,
      });

      expect(created).toStrictEqual({
        name: 'v1.0',
        revisionId: child,
        note: 'First cut of the bracket',
        actor,
        createdAt,
      });
      expect(await port.listTags()).toStrictEqual([created]);

      /* Re-pointing is the same operation as creating (*Rename* is a create
       * plus a delete), and the named revision itself never changes. */
      const moved = await port.tag({ name: 'v1.0', revisionId: base, note: 'Moved', actor, createdAt });
      const afterMove = await port.listTags();
      expect(afterMove[0]).toStrictEqual(moved);
      const named = await port.readRevision(child);
      expect(named?.id).toBe(child);

      await port.deleteTag('v1.0');
      expect(await port.listTags()).toStrictEqual([]);
      /* Removing a name twice is the outcome the caller asked for. */
      await expect(port.deleteTag('v1.0')).resolves.toBeUndefined();
    }, 180_000);

    /**
     * A26/AC15: stock `git log` shows the person, not the tool.
     *
     * Read through the port's own decoder rather than a shell, so the row runs
     * on both engines; the native integration row proves the same two fields
     * with real `git log --format` on a clone.
     */
    it('writes the actor as the git author and Tau as the committer', async () => {
      const receipt = await port.writeRevision({
        parents: [child],
        tree: tree({ 'a.txt': 'a-attributed\n' }),
        provenance: {
          ...provenance('user'),
          actor: { kind: 'user', id: 'user-lane', name: 'Lane Person', email: 'lane@example.com' },
          trigger: 'save',
        },
        summary: summary('Attributed revision'),
      });
      const attributed = revisionId(receipt.commitId);
      const record = await port.readRevision(attributed);

      expect(record?.provenance.actor).toStrictEqual({
        kind: 'user',
        id: 'user-lane',
        name: 'Lane Person',
        email: 'lane@example.com',
      });
      expect(record?.provenance.trigger).toBe('save');

      /* The same fields through the graph read the pane uses. */
      const [row] = await port.log({ heads: [attributed], limit: 1 });
      expect(row?.provenance.actor).toStrictEqual(record?.provenance.actor);
    }, 180_000);

    it('round-trips a tree', async () => {
      const recovered = await port.readTree(child);
      const entries = recovered?.entries() ?? [];
      expect(entries.map((entry) => entry.path)).toStrictEqual(['a.txt', 'c.txt']);
      expect(decoder.decode(recovered?.get('a.txt'))).toBe('a2\n');
    });

    it('round-trips executable mode and reports a mode-only diff', async () => {
      const plain = await port.writeRevision({
        parents: [child],
        tree: new ImmutableRevisionTree([['run.sh', '#!/bin/sh\n']]),
        provenance: provenance(),
        summary: summary('Plain script'),
      });
      const executable = await port.writeRevision({
        parents: [revisionId(plain.commitId)],
        tree: new ImmutableRevisionTree([['run.sh', '#!/bin/sh\n', '100755']]),
        provenance: provenance(),
        summary: summary('Executable script'),
      });

      const recovered = await port.readTree(revisionId(executable.commitId));
      expect(recovered?.mode('run.sh')).toBe('100755');
      await expect(
        port.diff({ from: revisionId(plain.commitId), to: revisionId(executable.commitId) }),
      ).resolves.toEqual([{ path: 'run.sh', kind: 'modified' }]);
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

    it('never sees a tree whose path collides with a directory (review 4 R27)', () => {
      /* `a` beside `a/b.txt` made `isomorphic-git` write a tree
       * `git fsck --strict` reports as `duplicateEntries` while `fast-import`
       * wrote a *different* tree — one corrupt object and an I4 divergence from
       * the same input. Neither engine can guard it; the model both legs pass
       * through refuses the shape, so no port ever receives it. */
      expect(() => tree({ a: 'file\n', 'a/b.txt': 'nested\n' })).toThrow(/collides/iu);
    });

    it('logs a merge-shaped history first-parent-first, newest first', async () => {
      /* Review 4 R12: the order was unspecified and differed per leg — a BFS in
       * the page, `rev-list --topo-order` on disk — so a UI reading the log got
       * a different graph depending on the host. */
      const leftReceipt = await port.writeRevision({
        parents: [base],
        tree: tree({ 'a.txt': 'order-left\n' }),
        provenance: provenance('agent'),
        summary: summary('Order left'),
      });
      const left = revisionId(leftReceipt.commitId);
      const rightReceipt = await port.writeRevision({
        parents: [base],
        tree: tree({ 'a.txt': 'order-right\n' }),
        provenance: provenance('agent'),
        summary: summary('Order right'),
      });
      const right = revisionId(rightReceipt.commitId);
      const mergeReceipt = await port.writeRevision({
        parents: [left, right],
        tree: tree({ 'a.txt': 'order-merged\n' }),
        provenance: provenance('merge'),
        summary: summary('Order merge'),
      });
      const merge = revisionId(mergeReceipt.commitId);

      const walked = await port.log({ heads: [merge] });
      expect(walked.map((entry) => entry.id)).toStrictEqual([merge, left, right, base]);
      // The limit cuts the same order from the front, it does not reorder it.
      const limited = await port.log({ heads: [merge], limit: 2 });
      expect(limited.map((entry) => entry.id)).toStrictEqual([merge, left]);
    }, 180_000);

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

    it('answers listRefs in the vocabulary each prefix was asked in (I4, review 2 R10)', async () => {
      /*
       * The exact call that diverged between the two legs: a *qualified* prefix.
       * `listRefs('refs/heads')` answered short branch names on the browser leg
       * and full names on the native one, so the push effect's history set was
       * empty in the page and complete on disk. Nothing here asserted it,
       * because every row called `listRefs()` bare.
       */
      const kept = [
        'refs/heads/prefix-branch',
        'refs/tags/prefix-tag',
        'refs/tau/chats/prefix-chat',
        'refs/remotes/origin/prefix-branch',
      ];
      for (const name of kept) {
        // oxlint-disable-next-line no-await-in-loop -- four refs, written in order.
        await port.updateRef({ name, expectedHead: undefined, head: base });
      }
      const names = async (prefix?: string): Promise<readonly string[]> => {
        const listed = await port.listRefs(prefix);
        return listed.map((reference) => reference.name);
      };

      expect(await names('refs/heads')).toContain('refs/heads/prefix-branch');
      expect(await names('refs/tags')).toContain('refs/tags/prefix-tag');
      expect(await names('refs/tau/chats')).toContain('refs/tau/chats/prefix-chat');
      expect(await names('refs/remotes/origin')).toContain('refs/remotes/origin/prefix-branch');
      /* A trailing slash names the same namespace. */
      expect(await names('refs/heads/')).toContain('refs/heads/prefix-branch');
      /* A qualified prefix never answers a short name, and never leaks a
       * neighbouring namespace. */
      expect(await names('refs/heads')).not.toContain('prefix-branch');
      expect(await names('refs/heads')).not.toContain('refs/tags/prefix-tag');
      expect(await names('refs/tau/chats')).not.toContain('refs/heads/prefix-branch');
      /* The bare call is branch names, unchanged. */
      expect(await names()).toContain('prefix-branch');
    }, 180_000);

    it('refuses a publication whose expected head is stale but not empty, and leaves the ref alone', async () => {
      /* Review 4 R9: every other refusal here expects *no* ref, so the engine's
       * compare-and-swap was only ever measured against zero. */
      const name = 'tau-conformance-stale';
      await port.updateRef({ name, expectedHead: undefined, head: base });
      await port.updateRef({ name, expectedHead: base, head: child });
      expect(await port.readRef(name)).toBe(child);

      expect(await port.updateRef({ name, expectedHead: base, head: base })).toMatchObject({
        status: 'conflicted',
        actualHead: child,
        proposedHead: base,
      });
      expect(await port.readRef(name)).toBe(child);
      // The delete path takes the same check, from the same stale value.
      expect(await port.updateRef({ name, expectedHead: base })).toMatchObject({
        status: 'conflicted',
        actualHead: child,
      });
      expect(await port.readRef(name)).toBe(child);
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
      const conflict = await port.conflicts(revisionId(merged.commitId));
      expect(conflict?.trees).toHaveLength(3);
      expect(conflict?.labels).toHaveLength(3);
      expect(conflict?.trees.every((id) => /^[\da-f]{40}$/u.test(id))).toBe(true);
      const record = await port.readRevision(revisionId(merged.commitId));
      expect(record?.receipt.conflicted).toBe(true);
      expect(record?.provenance.source).toBe('merge');
      expect(record?.parents).toStrictEqual([left, right]);
    }, 180_000);

    it('reads a conflicted merge back into its three terms and materializes markers (W10)', async () => {
      /* A real conflicted merge, end to end on this engine: two lines over one
       * base, the terms recorded in the headers, and the same marker text read
       * back out — which is what makes *Keep mine* and the editor's conflict
       * view answer identically on both legs (AC14, I4). */
      const baseRecord = await port.readRevision(base);
      const mineReceipt = await port.writeRevision({
        parents: [base],
        tree: tree({ 'a.txt': 'mine\n', 'settled.txt': 'mine settled it\n' }),
        provenance: provenance('user'),
        summary: summary('Mine'),
      });
      const mine = revisionId(mineReceipt.commitId);
      const theirsReceipt = await port.writeRevision({
        parents: [base],
        tree: tree({ 'a.txt': 'theirs\n' }),
        provenance: provenance('agent'),
        summary: summary('Theirs'),
      });
      const theirs = revisionId(theirsReceipt.commitId);
      const [mineRecord, theirsRecord] = await Promise.all([port.readRevision(mine), port.readRevision(theirs)]);

      const conflicted = await port.writeRevision({
        /* First parent is the branch it is minted on — the one merged *from* —
           so that branch's own first-parent numbering keeps counting. */
        parents: [theirs, mine],
        tree: tree({ 'a.txt': 'theirs\n' }),
        provenance: provenance('merge'),
        summary: summary('Conflicted merge'),
        conflict: {
          trees: [mineRecord!.treeId, baseRecord!.treeId, theirsRecord!.treeId],
          labels: conflictLabels({ ours: 'main', theirs: 'feature' }),
        },
      });

      const terms = await readConflictTerms(port, conflicted.commitId);
      expect(terms?.labels).toStrictEqual({ ours: 'main', theirs: 'feature' });
      expect(terms?.revisions).toStrictEqual({ base, ours: mine, theirs });
      /* The recorded terms and the re-derived ones are the same three trees.
         Tau re-derives (the header stays authoritative for anything reading the
         repository without Tau), so nothing else would ever notice the two
         disagreeing — which is exactly how a merge and its own resolution end
         up acting on different bases (review R6). */
      const recordedTerms = await port.conflicts(revisionId(conflicted.commitId));
      const termRevisions: ReadonlyArray<string | undefined> = [
        terms!.revisions.ours,
        terms!.revisions.base,
        terms!.revisions.theirs,
      ];
      const rederived = await Promise.all(
        termRevisions.map(async (revision) => {
          if (revision === undefined) {
            return undefined;
          }
          const record = await port.readRevision(revisionId(revision));
          return record?.treeId;
        }),
      );
      expect(recordedTerms?.trees).toStrictEqual(rederived);
      expect(terms?.conflicts.map((conflict) => conflict.path)).toStrictEqual(['a.txt']);
      /* `settled.txt` only one side wrote, so resolution starts from it. */
      expect(terms?.merged.entries().map(({ path }) => path)).toStrictEqual(['settled.txt']);

      expect(await materializeConflict(port, { revisionId: conflicted.commitId, path: 'a.txt' })).toBe(
        '<<<<<<< main\nmine\n=======\ntheirs\n>>>>>>> feature\n',
      );
      /* A path that settled is not a conflict, so there is nothing to choose. */
      expect(await materializeConflict(port, { revisionId: conflicted.commitId, path: 'settled.txt' })).toBeUndefined();
    }, 180_000);

    it('lists the live checkout, adds one per branch, and refuses a second on the same branch', async () => {
      const branch = 'checkout/conformance';
      await port.updateRef({ name: branch, expectedHead: undefined, head: base });
      const added = await port.addCheckout!({ branch });
      expect(added).toMatchObject({ projectId, kind: 'linked', branch, baseRevisionId: base });
      expect(added.id).not.toBe('');

      const listed = await port.listCheckouts!();
      /* The live checkout names a root its host can open: the project route on
       * the page (architecture:448), the repository path on disk (review 4 R24
       * — the browser leg reported the empty string). */
      expect(listed[0]).toMatchObject({ kind: 'live', root: harness.liveRoot });
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

    it('clears a removed checkout, so re-adding its branch materializes exactly the new tree', async () => {
      /* Review 4 R3: the id is a pure function of the branch, so a checkout
       * that only forgot its record and kept its files unioned two revisions'
       * trees the moment the same branch was checked out again. */
      const branch = 'checkout/recycled';
      await port.updateRef({ name: branch, expectedHead: undefined, head: base });
      const added = await port.addCheckout!({ branch });
      expect(await harness.checkoutFiles(added)).toStrictEqual(['a.txt', 'nested/b.txt']);
      await harness.writeCheckoutFile(added, 'scratch/draft.txt', 'draft\n');

      await port.removeCheckout!(added.id);
      // The branch moves while nothing holds it — a merge landing, say.
      await port.updateRef({ name: branch, expectedHead: base, head: child });
      const readded = await port.addCheckout!({ branch });
      expect(readded.id).toBe(added.id);
      expect(await harness.checkoutFiles(readded)).toStrictEqual(['a.txt', 'c.txt']);
      await port.removeCheckout!(readded.id);
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
    const harnesses = await Promise.all([isomorphicHarness(), createNativeHarness()]);
    try {
      const records = await Promise.all(
        harnesses.map(async (harness) => {
          await harness.port.init({ author });
          const first = await harness.port.writeRevision({
            parents: [],
            /* `a.txt` beside `a/b.txt` is the ordering guard the a1 rewrite lost
             * (review 4 R6): git sorts a directory as if its name ended with a
             * slash, so `a/` follows `a.txt` and an engine that sorted plain
             * names would name a different tree. */
            tree: tree({
              'a.txt': 'a\n',
              'a/b.txt': 'nested-under-a\n',
              'assets/blob.bin': binaryBlob,
              'nested/deep/b.txt': 'b\n',
              'z.txt': 'z\n',
            }),
            provenance: provenance('user'),
            summary: summary('Base revision'),
          });
          const second = await harness.port.writeRevision({
            parents: [revisionId(first.commitId)],
            tree: tree({
              'a.txt': 'a2\n',
              'a/b.txt': 'nested-under-a\n',
              'assets/blob.bin': binaryBlob,
              'nested/deep/b.txt': 'b\n',
              'nested/c.txt': 'c\n',
            }),
            provenance: provenance('agent'),
            summary: summary('Child revision'),
          });
          const id = revisionId(second.commitId);
          return { record: await harness.port.readRevision(id), tree: await harness.port.readTree(id) };
        }),
      );
      const [isomorphic, native] = records;
      const browserRecord = isomorphic!.record!;
      const diskRecord = native!.record!;
      const browserTree = isomorphic!.tree!;
      const diskTree = native!.tree!;
      expect(browserRecord.treeId).toMatch(/^[\da-f]{40}$/u);
      expect(diskRecord.treeId).toBe(browserRecord.treeId);
      // The commit bytes are the same encoder's on both legs, so the ids match too.
      expect(diskRecord.id).toBe(browserRecord.id);
      expect(diskRecord.receipt.changeId).toBe(browserRecord.receipt.changeId);
      // The binary blob comes back byte for byte, from both object stores.
      expect(browserTree.get('assets/blob.bin')).toStrictEqual(binaryBlob);
      expect(diskTree.get('assets/blob.bin')).toStrictEqual(binaryBlob);
      expect(diskTree.entries().map((entry) => entry.path)).toStrictEqual(
        browserTree.entries().map((entry) => entry.path),
      );
    } finally {
      await Promise.all(harnesses.map(async (harness) => harness.dispose()));
    }
  }, 180_000);

  /* W9 pin (d), green since W11b: the browser leg runs the same host-neutral
   * clean step the disk leg does (`lfs.ts`), so a tracked large object is a
   * pointer in the tree on both legs and the two name the same tree. */
  it('names the same tree for a large object on both legs', async () => {
    const harnesses = await Promise.all([isomorphicHarness(), createNativeHarness()]);
    try {
      const large = Uint8Array.from({ length: 1024 * 1024 + 1 }, (_, index) => (index * 31) % 256);
      const recorded = await Promise.all(
        harnesses.map(async (harness) => {
          await harness.port.init({ author });
          const receipt = await harness.port.writeRevision({
            parents: [],
            tree: tree({ 'models/bracket.step': large }),
            provenance: provenance('user'),
            summary: summary('Large object'),
          });
          const id = revisionId(receipt.commitId);
          const record = await harness.port.readRevision(id);
          const stored = await harness.port.readTree(id);
          return { treeId: record?.treeId, content: stored?.get('models/bracket.step') };
        }),
      );
      expect(recorded[1]?.treeId).toBe(recorded[0]?.treeId);
      /* And the pointer is invisible: both legs smudge it back to the bytes the
       * caller wrote, which is what makes LFS invisible to the user (EQ7). */
      expect(recorded[0]?.content).toStrictEqual(large);
      expect(recorded[1]?.content).toStrictEqual(large);
    } finally {
      await Promise.all(harnesses.map(async (harness) => harness.dispose()));
    }
  }, 180_000);

  /*
   * `largeObjects: false` records the tree byte for byte on both legs (I4). A
   * record ref needs it: its closed tree can carry no `.gitattributes`, so a
   * pointer written into one is a pointer nothing could ever smudge against.
   * The family here is a tracked one, so the default path would pointerise it
   * however little it weighs.
   */
  it('records a tracked family verbatim on both legs when large objects are declined', async () => {
    const harnesses = await Promise.all([isomorphicHarness(), createNativeHarness()]);
    try {
      const small = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
      const recorded = await Promise.all(
        harnesses.map(async (harness) => {
          await harness.port.init({ author });
          const receipt = await harness.port.writeRevision({
            parents: [],
            tree: tree({ 'attachments/photo.jpg': small }),
            largeObjects: false,
            provenance: provenance('user'),
            summary: summary('Verbatim attachment'),
          });
          const id = revisionId(receipt.commitId);
          const record = await harness.port.readRevision(id);
          const stored = await harness.port.readTree(id);
          return { treeId: record?.treeId, content: stored?.get('attachments/photo.jpg') };
        }),
      );
      expect(recorded[1]?.treeId).toBe(recorded[0]?.treeId);
      expect(recorded[0]?.content).toStrictEqual(small);
      expect(recorded[1]?.content).toStrictEqual(small);
      /*
       * The decisive pin, and the reason this row is not just the one above with
       * a smaller file: `readTree` smudges, so reading the bytes back proves
       * nothing about what was stored. Recording the *same* bytes through the
       * default path instead yields a different tree id — a 127-byte pointer
       * blob rather than these eight — so an implementation that ignored the
       * flag would make these two ids equal and fail here.
       */
      const [first] = harnesses;
      const cleaned = await first.port.writeRevision({
        parents: [],
        tree: tree({ 'attachments/photo.jpg': small }),
        provenance: provenance('user'),
        summary: summary('Cleaned attachment'),
      });
      const cleanedRecord = await first.port.readRevision(revisionId(cleaned.commitId));
      expect(cleanedRecord?.treeId).not.toBe(recorded[0]?.treeId);
    } finally {
      await Promise.all(harnesses.map(async (harness) => harness.dispose()));
    }
  }, 180_000);
});

/**
 * Review 4 R28: `log({ limit })` must not read the whole history. The walk is
 * lazy on both legs, and these two cases count the objects each engine actually
 * reads — a provider proxy in the page, a `git` wrapper on disk.
 */
describe('log reads are bounded by the limit (review 4 R28)', () => {
  const chainLength = 200;
  const chainLimit = 5;
  /** A generous ceiling: the walk needs the emitted revisions and their parents. */
  const readCeiling = 20;

  const writeChain = async (port: RevisionPort): Promise<readonly RevisionId[]> => {
    const chain: RevisionId[] = [];
    for (let index = 0; index < chainLength; index++) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each revision names the one before it.
      const receipt = await port.writeRevision({
        parents: chain.length === 0 ? [] : [chain.at(-1)!],
        tree: tree({ 'a.txt': `revision ${index}\n` }),
        // Time moves forward with the chain, as it does in any real history.
        provenance: { ...provenance('agent'), createdAt: createdAt + index * 1000 },
        summary: summary(`Revision ${index}`),
      });
      chain.push(revisionId(receipt.commitId));
    }
    return chain;
  };

  it('reads a handful of objects for a limited log in the page', async () => {
    const backing = await createMemoryProvider();
    let reads = 0;
    const filesystem = new Proxy(backing, {
      get: (target, key, receiver): unknown => {
        const value = Reflect.get(target, key, receiver) as unknown;
        if (typeof value !== 'function') {
          return value;
        }
        const method = value.bind(target) as (...args: readonly unknown[]) => unknown;
        return key === 'readFile'
          ? (...args: readonly unknown[]): unknown => {
              reads++;
              return method(...args);
            }
          : method;
      },
    });
    const port = createIsomorphicGitRevisionPort({ filesystem });
    await port.init({ author });
    const chain = await writeChain(port);

    reads = 0;
    const limited = await port.log({ heads: [chain.at(-1)!], limit: chainLimit });
    expect(limited.map((entry) => entry.id)).toStrictEqual(chain.slice(-chainLimit).toReversed());
    expect(reads).toBeLessThanOrEqual(readCeiling);
    expect(reads).toBeGreaterThan(0);
  }, 180_000);

  it.runIf(gitOnPath)(
    'spawns a handful of object reads for a limited log on disk',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'tau-revisions-bound-'));
      try {
        const repositoryPath = join(root, 'project');
        await mkdir(repositoryPath, { recursive: true });
        const port = createNativeGitRevisionPort({ repositoryPath });
        await port.init({ author });
        const chain = await writeChain(port);

        /* Every engine call goes through a wrapper that records its subcommand:
         * the first argument that is neither an option nor an option's value,
         * because the port pins configuration ahead of every subcommand. */
        const log = join(root, 'commands.log');
        const wrapper = join(root, 'git-counting');
        await writeFile(
          wrapper,
          [
            '#!/bin/sh',
            'verb=',
            'skip=0',
            'for argument in "$@"; do',
            '  if [ "$skip" = 1 ]; then skip=0; continue; fi',
            '  case "$argument" in',
            '    -C|-c) skip=1 ;;',
            '    -*) ;;',
            '    *) verb="$argument"; break ;;',
            '  esac',
            'done',
            `echo "$verb	$*" >> ${log}`,
            'exec git "$@"',
            '',
          ].join('\n'),
          { mode: 0o755 },
        );
        const counted = createNativeGitRevisionPort({ repositoryPath, gitExecutable: wrapper });

        const limited = await counted.log({ heads: [chain.at(-1)!], limit: chainLimit });
        expect(limited.map((entry) => entry.id)).toStrictEqual(chain.slice(-chainLimit).toReversed());
        const recorded = await readFile(log, 'utf8');
        const commands = recorded.split('\n').filter((line) => line !== '');
        /* Object reads only — no `log`, no `show`, nothing that would read a
         * tree — and a handful of processes rather than one per revision (B5). */
        expect(commands.map((command) => command.split('\t')[0])).toStrictEqual(
          commands.map((command) => (command.startsWith('rev-list') ? 'rev-list' : 'cat-file')),
        );
        expect(commands.length).toBeLessThanOrEqual(readCeiling);
        /* The bound reaches the engine, which is what keeps a limited log off
         * the whole history now that the objects arrive in one batch: the
         * process count alone can no longer show it (review 4 R28). */
        const bound = Number(/--max-count=(?<count>\d+)/u.exec(recorded)?.groups?.['count']);
        expect(bound).toBeGreaterThanOrEqual(chainLimit);
        expect(bound).toBeLessThan(chainLength);
      } finally {
        await rm(root, { force: true, recursive: true });
      }
    },
    180_000,
  );
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
    expect(requested).toEqual([`tau:revision-ref:${filesystem.id}:.git:main`]);

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
    expect(requested).toEqual([`tau:revision-ref:${filesystem.id}:.git:HEAD`]);

    held.resolve();
    await moving;
    expect(await port.readHead()).toMatchObject({ branch: 'agent/other' });
  });
});

/**
 * R2, as its own table-free case: `git rev-parse --git-dir` succeeds from any
 * subdirectory of any repository, so a project nested inside one must not be
 * allowed to adopt it. The port owns the store at its own path or it creates
 * one; it never writes a project's revisions into an enclosing repository.
 */
describe.runIf(gitOnPath)('native-git store isolation (review 4 R2)', () => {
  it('creates its own repository inside an enclosing one and writes nothing into it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revisions-nested-'));
    try {
      const outer = join(root, 'outer');
      await mkdir(outer, { recursive: true });
      execFileSync('git', ['init', '--quiet', '--initial-branch=main', outer], { stdio: 'ignore' });
      const repositoryPath = join(outer, 'project');
      await mkdir(repositoryPath, { recursive: true });

      const port = createNativeGitRevisionPort({ repositoryPath });
      await port.init({ author });
      const receipt = await port.writeRevision({
        parents: [],
        tree: tree({ 'a.txt': 'a\n' }),
        provenance: provenance('user'),
        summary: summary('Nested base'),
      });
      await port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(receipt.commitId) });

      // The project reads its own revision back…
      expect(await port.readRevision(revisionId(receipt.commitId))).toBeDefined();
      expect(await readdir(join(repositoryPath, '.git', 'refs', 'heads'))).toContain('main');

      // …and the enclosing repository holds neither the ref nor the object.
      const outerReferences = join(outer, '.git', 'refs');
      expect(await readdir(join(outerReferences, 'heads')).catch(() => [])).toStrictEqual([]);
      expect(await readdir(join(outerReferences, 'tau')).catch(() => [])).toStrictEqual([]);
      expect(gitExitCode(outer, ['cat-file', '-t', receipt.commitId])).not.toBe(0);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }, 180_000);

  it('ignores an ambient GIT_DIR and still creates its own store', async () => {
    /* Review 4 R25: the child inherited `process.env`, so one exported
     * `GIT_DIR` pointed every command — `git init` included — at somebody
     * else's repository, which is the R2 failure through another door. */
    const root = await mkdtemp(join(tmpdir(), 'tau-revisions-ambient-'));
    const ambient = join(root, 'ambient');
    await mkdir(ambient, { recursive: true });
    execFileSync('git', ['init', '--quiet', '--initial-branch=main', ambient], { stdio: 'ignore' });
    const repositoryPath = join(root, 'project');
    await mkdir(repositoryPath, { recursive: true });
    const restore = process.env['GIT_DIR'];
    process.env['GIT_DIR'] = join(ambient, '.git');
    try {
      const port = createNativeGitRevisionPort({ repositoryPath });
      await port.init({ author });
      const receipt = await port.writeRevision({
        parents: [],
        tree: tree({ 'a.txt': 'a\n' }),
        provenance: provenance('user'),
        summary: summary('Ambient base'),
      });
      await port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(receipt.commitId) });

      expect(await readdir(join(repositoryPath, '.git', 'refs', 'heads'))).toContain('main');
      expect(await readdir(join(ambient, '.git', 'refs', 'heads')).catch(() => [])).toStrictEqual([]);
      expect(gitExitCode(ambient, ['--git-dir', join(ambient, '.git'), 'cat-file', '-t', receipt.commitId])).not.toBe(
        0,
      );
    } finally {
      if (restore === undefined) {
        delete process.env['GIT_DIR'];
      } else {
        process.env['GIT_DIR'] = restore;
      }
      await rm(root, { force: true, recursive: true });
    }
  }, 180_000);

  it('refuses a bare repository as the project path', async () => {
    // Review 4 R26: `--show-toplevel` exits 128 in a bare repository, so the
    // a2 gate read "not a repository" and re-initialised it in place.
    const root = await mkdtemp(join(tmpdir(), 'tau-revisions-bare-'));
    try {
      execFileSync('git', ['init', '--bare', '--quiet', '--initial-branch=main', root], { stdio: 'ignore' });
      const port = createNativeGitRevisionPort({ repositoryPath: root });
      await expect(port.init({ author })).rejects.toMatchObject({ code: 'INVALID_REPOSITORY' });
      /* Untouched: no nested store, and not even the generated ignore file —
       * the refusal comes before the port writes anything (review 4 R40). */
      const contents = await readdir(root);
      expect(contents).not.toContain('.git');
      expect(contents).not.toContain(generatedIgnorePath);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }, 180_000);
});

/**
 * The transport slice, against a real `git http-backend` (D27, P16, S24).
 *
 * Both legs answer the same three questions here — what does the remote have,
 * what did each ref I offered do, and where did a fetch put it — and the row
 * that matters most is the refusal: a server that turns down one ref must not
 * be able to stop the branch beside it (A39).
 */
describe.runIf(gitOnPath)('transport against a git http-backend fixture', () => {
  for (const adapter of adapters) {
    describe.runIf(adapter.enabled)(adapter.name, () => {
      let harness: Harness;
      let port: RevisionPort;
      let fixture: Awaited<ReturnType<typeof startGitHttpBackend>>;
      let root: string;
      let head: RevisionId;

      beforeAll(async () => {
        harness = await adapter.create();
        port = harness.withTransport();
        root = await mkdtemp(join(tmpdir(), 'tau-revisions-remote-'));
        fixture = await startGitHttpBackend({ root, refusedRef: 'refs/tau/chats/refused' });
        await port.init({ author });
        const receipt = await port.writeRevision({
          parents: [],
          tree: tree({ 'a.txt': 'a\n' }),
          provenance: provenance('user'),
          summary: summary('Base revision'),
        });
        head = revisionId(receipt.commitId);
        await port.updateRef({ name: 'main', expectedHead: undefined, head });
        await port.tag({ name: 'v1', revisionId: head, note: 'First version' });
        await port.setRemote({ name: 'tau', url: fixture.url });
      }, 180_000);

      afterAll(async () => {
        await fixture.close();
        await harness.dispose();
        await rm(root, { force: true, recursive: true });
      });

      it('records the remote in git’s own remotes list', async () => {
        expect(await port.listRemotes()).toStrictEqual([{ name: 'tau', url: fixture.url, kind: 'tau' }]);
      });

      it('refuses to offer a ref that never leaves this host', async () => {
        await expect(port.push({ remote: 'tau', refs: [{ name: 'refs/remotes/tau/main' }] })).rejects.toMatchObject({
          code: 'INVALID_TRANSPORT',
        });
        await expect(port.push({ remote: 'tau', refs: [{ name: 'refs/tau/workspaces/w1' }] })).rejects.toMatchObject({
          code: 'INVALID_TRANSPORT',
        });
      });

      it('pushes each ref on its own result, and a refused record ref does not stop main', async () => {
        await harness.writeRawRef('refs/tau/chats/refused', head);
        await harness.writeRawRef('refs/tau/chats/kept', head);

        const result = await port.push({
          remote: 'tau',
          refs: [
            { name: 'refs/tau/chats/refused' },
            { name: 'refs/tau/chats/kept' },
            { name: 'refs/tags/v1' },
            { name: 'refs/heads/main' },
          ],
        });

        expect(result.refs.map((entry) => [entry.name, entry.status])).toStrictEqual([
          ['refs/tau/chats/refused', 'rejected'],
          ['refs/tau/chats/kept', 'updated'],
          ['refs/tags/v1', 'updated'],
          ['refs/heads/main', 'updated'],
        ]);
        // The server is the witness, not the client's own bookkeeping.
        expect(await fixture.git(['rev-parse', 'refs/heads/main'])).toBe(head);
        expect(await fixture.git(['rev-parse', 'refs/tau/chats/kept'])).toBe(head);
        expect(gitExitCode(fixture.repositoryPath, ['rev-parse', '--verify', 'refs/tau/chats/refused'])).toBe(1);
      }, 180_000);

      it('lists the remote’s refs and re-offers an unchanged one as up to date', async () => {
        const advertised = await port.listRemoteRefs('tau');

        expect(advertised.find((entry) => entry.name === 'refs/heads/main')?.head).toBe(head);
        const again = await port.push({ remote: 'tau', refs: [{ name: 'refs/heads/main' }] });
        expect(again.refs[0]?.status).toBe('upToDate');
      }, 180_000);

      it('fetches into refs/remotes/<remote>/* and leaves every branch where it was', async () => {
        const second = await adapter.create();
        try {
          const reader = second.withTransport();
          await reader.init({ author });
          await reader.setRemote({ name: 'tau', url: fixture.url });

          const fetched = await reader.fetch({ remote: 'tau' });

          expect(fetched.refs.find((entry) => entry.name === 'refs/remotes/tau/main')?.head).toBe(head);
          expect(fetched.refs.find((entry) => entry.name === 'refs/remotes/tau/tau/chats/kept')?.head).toBe(head);
          expect(fetched.refs.find((entry) => entry.name === 'refs/remotes/tau/tags/v1')?.head).toBeDefined();
          expect(await reader.readRef('refs/tags/v1')).toBeDefined();
          // A fetch is not a merge: the local branch is still unborn (A22).
          expect(await reader.readRef('main')).toBeUndefined();
          const fetchedRecord = await reader.readRevision(head);
          expect(fetchedRecord?.summary.generated).toBe('Base revision');
        } finally {
          await second.dispose();
        }
      }, 180_000);

      /* The lease, on both legs (A32, S24, D14 `push(expected)`). It runs last
       * because the held half deliberately moves the remote's `main`. */
      it('refuses a stale lease without touching the remote ref, and takes a held one', async () => {
        const receipt = await port.writeRevision({
          parents: [head],
          tree: tree({ 'a.txt': 'b\n' }),
          provenance: provenance('user'),
          summary: summary('Second revision'),
        });
        const moved = revisionId(receipt.commitId);
        await port.updateRef({ name: 'main', expectedHead: head, head: moved });

        /* A lease naming a value the remote does not hold: the ref moved under
         * this host, so the push is refused and nothing on the server changes. */
        const stale = await port.push({ remote: 'tau', refs: [{ name: 'refs/heads/main', expected: moved }] });

        expect(stale.refs[0]?.status).toBe('rejected');
        expect(await fixture.git(['rev-parse', 'refs/heads/main'])).toBe(head);

        /* `expected: undefined` leases "must not exist" — a first push that
         * must not quietly land on somebody else's ref. This one does exist. */
        const exists = await port.push({ remote: 'tau', refs: [{ name: 'refs/heads/main', expected: undefined }] });

        expect(exists.refs[0]?.status).toBe('rejected');
        expect(await fixture.git(['rev-parse', 'refs/heads/main'])).toBe(head);

        // The lease that holds is the one that lets the push through.
        const held = await port.push({ remote: 'tau', refs: [{ name: 'refs/heads/main', expected: head }] });

        expect(held.refs[0]?.status).toBe('updated');
        expect(await fixture.git(['rev-parse', 'refs/heads/main'])).toBe(moved);
      }, 180_000);
    });
  }
});

describe.runIf(gitOnPath)('native remote credential transport', () => {
  it('passes the credential only through the child environment', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revisions-credential-'));
    const fixture = await startGitHttpBackend({ root });
    const repositoryPath = join(root, 'project');
    const argumentsLog = join(root, 'arguments.log');
    const environmentLog = join(root, 'environment.log');
    const wrapper = join(root, 'git-credential-check');
    const authorization = 'Bearer github-secret-value';
    try {
      await mkdir(repositoryPath, { recursive: true });
      await writeFile(
        wrapper,
        [
          '#!/bin/sh',
          `printf '%s\\n' "$@" > ${argumentsLog}`,
          `printf '%s\n%s\n%s\n%s' "$GIT_CONFIG_KEY_0" "$GIT_CONFIG_VALUE_0" "$GIT_CONFIG_KEY_1" "$GIT_CONFIG_VALUE_1" > ${environmentLog}`,
          'exec git "$@"',
          '',
        ].join('\n'),
        { mode: 0o755 },
      );
      const port = createNativeGitRevisionPort({
        repositoryPath,
        gitExecutable: wrapper,
        remoteCredential: () => ({ repositoryUrl: fixture.url, authorization }),
      });
      await port.init({ author });
      await port.setRemote({ name: 'origin', url: fixture.url });

      await port.listRemoteRefs('origin');

      expect(await readFile(argumentsLog, 'utf8')).not.toContain(authorization);
      expect(await readFile(environmentLog, 'utf8')).toBe(
        `http.${fixture.url}.extraHeader\nAuthorization: ${authorization}\nlfs.url\n${fixture.url}/info/lfs`,
      );
      expect(await readFile(join(repositoryPath, '.git', 'config'), 'utf8')).not.toContain(authorization);
    } finally {
      await fixture.close();
      await rm(root, { force: true, recursive: true });
    }
  }, 180_000);
});

/**
 * What the native leg says a remote said (N1, C2, C66).
 *
 * The parity gap L8 measured: `runCommand` captures git's stderr and both throw
 * sites discarded it, so 401, 403, 404, 413 and 500 all reached the Sync row as
 * one sentence — *Native Git could not reach the remote.* — which is false in
 * every one of those cases and left the only recovery path unreachable on this
 * leg. These rows are the browser leg's `isomorphic-git-adapter.test.ts` table,
 * asked of the binary.
 */
describe.runIf(gitOnPath)('native remote refusals (N1)', () => {
  it.each([
    { status: 401, code: 'REMOTE_UNAUTHORIZED' },
    { status: 403, code: 'REMOTE_FORBIDDEN' },
    { status: 404, code: 'REMOTE_NOT_FOUND' },
    { status: 413, code: 'REMOTE_QUOTA_EXCEEDED' },
    { status: 500, code: 'REMOTE_UNAVAILABLE' },
  ])(
    'answers HTTP $status with $code on every remote verb',
    async ({ status, code }) => {
      const root = await mkdtemp(join(tmpdir(), 'tau-revisions-native-refusal-'));
      const server = createServer((_request, response) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end('{"code":"X","message":"server sentence"}');
      });
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
      });
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- `AddressInfo` on a listening TCP server.
      const { port: listening } = server.address() as { port: number };
      const origin = `http://127.0.0.1:${String(listening)}`;
      const repositoryPath = join(root, 'project');
      try {
        await mkdir(repositoryPath, { recursive: true });
        const port = createNativeGitRevisionPort({
          repositoryPath,
          tauCredential: () => ({ apiBaseUrl: origin, authorization: 'Bearer session-token' }),
        });
        await port.init({ author });
        const receipt = await port.writeRevision({
          parents: [],
          tree: tree({ 'part.ts': 'export const a = 1;\n' }),
          provenance: provenance('user'),
          summary: summary('First'),
        });
        await port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(receipt.commitId) });
        await port.setRemote({ name: 'tau', url: `${origin}/v1/git/p1.git` });

        await expect(port.push({ remote: 'tau', refs: [{ name: 'refs/heads/main' }] })).rejects.toMatchObject({ code });
        await expect(port.fetch({ remote: 'tau', refs: ['refs/heads/main'] })).rejects.toMatchObject({ code });
        await expect(port.listRemoteRefs('tau')).rejects.toMatchObject({ code });
      } finally {
        await new Promise<void>((resolve) => {
          server.close(() => {
            resolve();
          });
        });
        await rm(root, { force: true, recursive: true });
      }
    },
    180_000,
  );

  it('names the files a push over the storage plan could not carry (C66, Rule 13)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revisions-native-quota-'));
    const fixture = await startGitHttpBackend({
      root,
      quotaRefusal: {
        message: 'Storage quota exceeded: this push needs 5242880 bytes more than the plan allows.',
        shortfallBytes: 5_242_880,
        remainingBytes: 0,
      },
    });
    const repositoryPath = join(root, 'project');
    const large = new Uint8Array(new ArrayBuffer(1024 * 1024 + 1));
    for (let index = 0; index < large.length; index += 1) {
      large[index] = (index * 31) % 256;
    }
    try {
      await mkdir(repositoryPath, { recursive: true });
      const port = createNativeGitRevisionPort({
        repositoryPath,
        tauCredential: () => ({ apiBaseUrl: fixture.url, authorization: 'Bearer session-token' }),
      });
      await port.init({ author });
      const receipt = await port.writeRevision({
        parents: [],
        tree: new ImmutableRevisionTree([['models/bracket.step', large]]),
        provenance: provenance('user'),
        summary: summary('Large object'),
      });
      await port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(receipt.commitId) });
      await port.setRemote({ name: 'tau', url: fixture.url });

      /* The same class the browser leg raises, so `remote.machine` reaches
       * `quotaRefused` on desktop and the CLI too — with the paths the port
       * already computed, and the server's own sentence off git-lfs's
       * `batch response:` line. */
      await expect(port.push({ remote: 'tau', refs: [{ name: 'refs/heads/main' }] })).rejects.toMatchObject({
        name: 'LfsQuotaError',
        refusal: { paths: ['models/bracket.step'] },
      });
      expect(fixture.trail().some((entry) => entry.endsWith('/git-receive-pack'))).toBe(false);
    } finally {
      await fixture.close();
      await rm(root, { force: true, recursive: true });
    }
  }, 180_000);
});

/**
 * The browser's LFS client, end to end over the batch API (S49, V13, AC16).
 *
 * The disk leg gets this from the `git-lfs` binary; in the page it is Tau's, so
 * the three claims that matter are proved against a real server: the object
 * goes up *before* the ref that names it, it goes up *once*, and a second store
 * that only fetched pointers reads the bytes back.
 */
describe.runIf(gitOnPath)('LFS clients over the batch API', () => {
  const large = ((): Uint8Array<ArrayBuffer> => {
    const bytes = new Uint8Array(new ArrayBuffer(5 * 1024 * 1024));
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = (index * 37) % 251;
    }
    return bytes;
  })();

  it('uploads once before the ref push, and a second store reads the bytes back', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revisions-lfs-'));
    const fixture = await startGitHttpBackend({ root });
    const writer = await isomorphicHarness();
    const reader = await isomorphicHarness();
    try {
      const port = writer.withTransport();
      await port.init({ author });
      const receipt = await port.writeRevision({
        parents: [],
        tree: tree({ 'models/bracket.step': large }),
        provenance: provenance('user'),
        summary: summary('Large object'),
      });
      const head = revisionId(receipt.commitId);
      await port.updateRef({ name: 'main', expectedHead: undefined, head });
      await port.setRemote({ name: 'tau', url: fixture.url });

      const result = await port.push({ remote: 'tau', refs: [{ name: 'refs/heads/main' }] });

      expect(result.refs[0]?.status).toBe('updated');
      expect(fixture.uploadCount()).toBe(1);
      const trail = fixture.trail();
      const uploaded = trail.findIndex((entry) => entry.startsWith('PUT /lfs/'));
      const received = trail.findIndex((entry) => entry.endsWith('/git-receive-pack'));
      // A pointer must never land ahead of its object (A39).
      expect(uploaded).toBeGreaterThanOrEqual(0);
      expect(uploaded).toBeLessThan(received);

      /* The object was *verified*, through the Tau client: the server counts an
       * object against the plan only when the client says it landed, and that
       * route is behind the API's auth guard (W11a §9.6). */
      expect(fixture.verified()).toStrictEqual([lfsPointerFor(large).pointer.oid]);

      // A second push offers the same object and the remote asks for nothing.
      await port.push({ remote: 'tau', refs: [{ name: 'refs/heads/main' }] });
      expect(fixture.uploadCount()).toBe(1);

      const second = reader.withTransport();
      await second.init({ author });
      await second.setRemote({ name: 'tau', url: fixture.url });
      await second.fetch({ remote: 'tau' });

      // The fetch brought the pointer; reading the tree brings the bytes.
      const fetchedTree = await second.readTree(head);
      const fetchedRecord = await second.readRevision(head);
      const writtenRecord = await port.readRevision(head);
      expect(fetchedTree?.get('models/bracket.step')).toStrictEqual(large);
      expect(fetchedRecord?.treeId).toBe(writtenRecord?.treeId);

      const nativeReader = await createNativeHarness();
      try {
        const nativePort = nativeReader.withTransport();
        await nativePort.init({ author });
        await nativePort.setRemote({ name: 'tau', url: fixture.url });
        await nativePort.fetch({ remote: 'tau' });
        const nativeTree = await nativePort.readTree(head);
        expect(nativeTree?.get('models/bracket.step')).toStrictEqual(large);
      } finally {
        await nativeReader.dispose();
      }
      expect(fixture.uploadCount()).toBe(1);
    } finally {
      await fixture.close();
      await writer.dispose();
      await reader.dispose();
      await rm(root, { force: true, recursive: true });
    }
  }, 180_000);

  it('refuses the push when the verify call carries no Tau credential', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revisions-verify-'));
    const fixture = await startGitHttpBackend({ root });
    const filesystem = await createMemoryProvider();
    try {
      /* No credential resolver and no cookie: `verify` is a Tau route behind the
       * API's auth guard, so a client that cannot authenticate it must fail the
       * push rather than report a large object the server never counted. */
      const port = createIsomorphicGitRevisionPort({ filesystem, http: createRevisionHttpClient() });
      await port.init({ author });
      const receipt = await port.writeRevision({
        parents: [],
        tree: tree({ 'models/bracket.step': large }),
        provenance: provenance('user'),
        summary: summary('Large object'),
      });
      await port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(receipt.commitId) });
      await port.setRemote({ name: 'tau', url: fixture.url });

      await expect(port.push({ remote: 'tau', refs: [{ name: 'refs/heads/main' }] })).rejects.toThrow(/\(401\)/u);
      expect(fixture.verified()).toStrictEqual([]);
    } finally {
      await fixture.close();
      await rm(root, { force: true, recursive: true });
    }
  }, 180_000);

  it('sends the credential as a header and refuses a push over the storage plan', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revisions-quota-'));
    const fixture = await startGitHttpBackend({
      root,
      quotaRefusal: {
        message: 'Storage quota exceeded: this push needs 5242880 bytes more than the plan allows.',
        shortfallBytes: 5_242_880,
        remainingBytes: 0,
      },
    });
    const filesystem = await createMemoryProvider();
    try {
      const port = createIsomorphicGitRevisionPort({
        filesystem,
        http: createRevisionHttpClient({ authorization: () => 'Bearer session-token' }),
      });
      await port.init({ author });
      const receipt = await port.writeRevision({
        parents: [],
        tree: tree({ 'models/bracket.step': large }),
        provenance: provenance('user'),
        summary: summary('Large object'),
      });
      await port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(receipt.commitId) });
      await port.setRemote({ name: 'tau', url: fixture.url });

      /* The server answers in object ids; the port maps them back to the paths
       * the Sync region lists (D16, AC16). */
      await expect(port.push({ remote: 'tau', refs: [{ name: 'refs/heads/main' }] })).rejects.toMatchObject({
        name: 'LfsQuotaError',
        refusal: { paths: ['models/bracket.step'], shortfallBytes: 5_242_880 },
      });

      // I8: the credential is a header on every request, never a query string.
      expect(fixture.authorizations()).toContain('Bearer session-token');
      expect(fixture.trail().some((entry) => entry.includes('token'))).toBe(false);
      // Nothing landed: the refusal is before the ref push, not after it.
      expect(fixture.trail().some((entry) => entry.endsWith('/git-receive-pack'))).toBe(false);
    } finally {
      await fixture.close();
      await rm(root, { force: true, recursive: true });
    }
  }, 180_000);
});
