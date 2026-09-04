// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import supplies IndexedDB for the provider integration.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { MemoryProvider } from '#backend/memory-provider.js';
import { ProviderRegistry } from '#provider-registry.js';
import { RevisionAuthority, revisionBranchName } from '#revision-authority.js';
import type { Revision } from '#revision-authority.js';
import { createBrowserRevisionPersistence } from '#revision-persistence.js';
import { ImmutableRevisionTree, revisionId } from '#revision-tree.js';

const makeRevision = (id: string, parents: Revision['parents'] = []): Revision =>
  Object.freeze({
    id: revisionId(id),
    parents: Object.freeze([...parents]),
    tree: new ImmutableRevisionTree([['main.ts', id]]),
    provenance: Object.freeze({ source: 'agent', actorId: 'test', runId: 'run-test', createdAt: parents.length }),
    summary: Object.freeze({ generated: `Generated ${id}` }),
  });

class InterleavingRevisionProvider extends MemoryProvider {
  public tearNextMarker = false;
  public tearNextBranch = false;
  public tearNextMarkerRename = false;
  public tearNextBranchRename = false;
  readonly #secondBranchRead = Promise.withResolvers<void>();
  #branchReads = 0;
  #delayBranchReads = false;
  #snapshotBarrier: Readonly<{ entered: PromiseWithResolvers<void>; release: PromiseWithResolvers<void> }> | undefined;

  public delayNextBranchRace(): void {
    this.#delayBranchReads = true;
  }

  public interleaveNextSnapshot(): Readonly<{ entered: Promise<void>; release: () => void }> {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    this.#snapshotBarrier = { entered, release };
    return { entered: entered.promise, release: release.resolve };
  }

  public override async readdir(path: string): Promise<string[]> {
    const entries = await super.readdir(path);
    const barrier = this.#snapshotBarrier;
    if (barrier !== undefined && (path === '.tau/revisions/nodes' || path === '.tau/revisions/branches')) {
      this.#snapshotBarrier = undefined;
      barrier.entered.resolve();
      await barrier.release.promise;
    }
    return entries;
  }

  public override async writeFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> {
    if (this.tearNextMarker && path.includes('/metadata.json')) {
      this.tearNextMarker = false;
      await super.writeFile(path, '{"version":');
      throw new Error('simulated marker crash');
    }
    if (this.tearNextBranch && path.includes('/branches/') && path.includes('.json')) {
      this.tearNextBranch = false;
      await super.writeFile(path, '{"version":');
      throw new Error('simulated branch crash');
    }
    await super.writeFile(path, data);
  }

  public override async rename(from: string, to: string): Promise<void> {
    if (this.tearNextMarkerRename && from.endsWith('/metadata.json.tmp')) {
      this.tearNextMarkerRename = false;
      await super.writeFile(to, '{"version":');
      throw new Error('simulated marker rename crash');
    }
    if (this.tearNextBranchRename && from.includes('/branches/') && from.endsWith('.json.tmp')) {
      this.tearNextBranchRename = false;
      await super.writeFile(to, '{"version":');
      throw new Error('simulated branch rename crash');
    }
    await super.rename(from, to);
  }

  public override readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  public override readFile(path: string, encoding: 'utf8'): Promise<string>;
  public override async readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const content = encoding === 'utf8' ? await super.readFile(path, encoding) : await super.readFile(path);
    if (!this.#delayBranchReads || !path.includes('/branches/') || !path.endsWith('.json')) {
      return content;
    }
    this.#branchReads += 1;
    if (this.#branchReads === 1) {
      await Promise.race([
        this.#secondBranchRead.promise,
        new Promise<void>((resolve) => {
          setTimeout(resolve, 25);
        }),
      ]);
    } else if (this.#branchReads === 2) {
      this.#secondBranchRead.resolve();
    }
    return content;
  }
}

const openAuthority = async (
  databasePrefix: string,
): Promise<{
  authority: RevisionAuthority;
  registry: ProviderRegistry;
}> => {
  const registry = new ProviderRegistry({ databasePrefix });
  const filesystem = await registry.getProvider({ backend: 'indexeddb' });
  const authority = new RevisionAuthority({
    persistence: createBrowserRevisionPersistence({ filesystem }),
  });
  await authority.ready;
  return { authority, registry };
};

describe('browser revision persistence', () => {
  it('rehydrates the complete graph and enforces expected-old CAS after reopening IndexedDB', async () => {
    const databasePrefix = `revision-persistence-${crypto.randomUUID()}`;
    const first = await openAuthority(databasePrefix);
    const base = await first.authority.createRevision({
      id: revisionId('browser-base'),
      parents: [],
      tree: new ImmutableRevisionTree([
        ['main.ts', 'base'],
        ['binary.bin', new Uint8Array([0, 255, 1])],
      ]),
      provenance: { source: 'import', actorId: 'browser-user', createdAt: 1 },
      summary: { generated: 'Browser base' },
    });
    const next = await first.authority.createRevision({
      id: revisionId('browser-next'),
      parents: [base.id],
      tree: new ImmutableRevisionTree([['main.ts', 'next']]),
      provenance: { source: 'agent', actorId: 'browser-agent', runId: 'run-browser', createdAt: 2 },
      summary: { generated: 'Browser next', edited: 'Kept next' },
    });
    const branch = revisionBranchName('browser/main');
    await first.authority.updateBranchHead({ branch, expectedHead: undefined, head: base.id });
    first.registry.disposeAll();
    await Promise.resolve();

    const reopened = await openAuthority(databasePrefix);
    try {
      expect(reopened.authority.getRevision(base.id)?.tree.entries()).toEqual(base.tree.entries());
      expect(reopened.authority.getRevision(next.id)).toMatchObject({
        id: next.id,
        parents: [base.id],
        provenance: next.provenance,
        summary: next.summary,
      });
      expect(reopened.authority.getBranchHead(branch)).toBe(base.id);
      expect(reopened.authority.getRevisionPersistence(next.id)).toEqual({ type: 'browser' });
      await expect(
        reopened.authority.updateBranchHead({ branch, expectedHead: undefined, head: next.id }),
      ).resolves.toEqual({
        status: 'conflicted',
        conflict: {
          type: 'stale-head',
          branch,
          expectedHead: undefined,
          actualHead: base.id,
          proposedHead: next.id,
        },
      });
    } finally {
      reopened.registry.disposeAll();
    }
  });

  it('allows only one winner across two independently opened persistence ports', async () => {
    const filesystem = new InterleavingRevisionProvider();
    const setup = createBrowserRevisionPersistence({ filesystem });
    const branch = revisionBranchName('race/main');
    const base = makeRevision('race-base');
    const left = makeRevision('race-left', [base.id]);
    const right = makeRevision('race-right', [base.id]);
    await Promise.all([setup.storeRevision(base), setup.storeRevision(left), setup.storeRevision(right)]);
    await setup.updateBranchHead({ branch, expectedHead: undefined, head: base.id });

    const first = createBrowserRevisionPersistence({ filesystem });
    const second = createBrowserRevisionPersistence({ filesystem });
    filesystem.delayNextBranchRace();
    const outcomes = await Promise.all([
      first.updateBranchHead({ branch, expectedHead: base.id, head: left.id }),
      second.updateBranchHead({ branch, expectedHead: base.id, head: right.id }),
    ]);

    expect(outcomes.filter(({ status }) => status === 'updated')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'conflicted')).toHaveLength(1);
  });

  it('rehydrates a coherent snapshot while a revision is published between its directory reads', async () => {
    const filesystem = new InterleavingRevisionProvider();
    const publisher = new RevisionAuthority({
      persistence: createBrowserRevisionPersistence({ filesystem }),
    });
    await publisher.ready;
    const base = await publisher.createRevision(makeRevision('interleaved-base'));
    const branch = revisionBranchName('interleaved/main');
    await publisher.updateBranchHead({ branch, expectedHead: undefined, head: base.id });

    const barrier = filesystem.interleaveNextSnapshot();
    const reopened = new RevisionAuthority({
      persistence: createBrowserRevisionPersistence({ filesystem }),
    });
    const { ready } = reopened;
    await barrier.entered;
    const next = await publisher.createRevision(makeRevision('interleaved-next', [base.id]));
    await publisher.updateBranchHead({ branch, expectedHead: base.id, head: next.id });
    barrier.release();

    await expect(ready).resolves.toBeUndefined();
    const recoveredHead = reopened.getBranchHead(branch);
    expect(recoveredHead).toBeDefined();
    expect(reopened.getRevision(recoveredHead!)).toBeDefined();
  });

  it('garbage-collects a torn marker and preserves the prior ref after a torn overwrite', async () => {
    const filesystem = new InterleavingRevisionProvider();
    const persistence = createBrowserRevisionPersistence({ filesystem });
    const torn = makeRevision('torn-node');
    filesystem.tearNextMarker = true;

    await expect(persistence.storeRevision(torn)).rejects.toThrow('simulated marker crash');
    await expect(persistence.load()).resolves.toEqual({ revisions: [], branchHeads: [] });
    await expect(filesystem.exists('.tau/revisions/nodes/torn-node')).resolves.toBe(false);

    const base = makeRevision('crash-base');
    const next = makeRevision('crash-next', [base.id]);
    const branch = revisionBranchName('crash/main');
    await persistence.storeRevision(base);
    await persistence.storeRevision(next);
    await persistence.updateBranchHead({ branch, expectedHead: undefined, head: base.id });
    filesystem.tearNextBranch = true;

    await expect(persistence.updateBranchHead({ branch, expectedHead: base.id, head: next.id })).rejects.toThrow(
      'simulated branch crash',
    );
    await expect(persistence.load()).resolves.toMatchObject({
      branchHeads: [{ branch, head: base.id }],
    });
  });

  it('recovers when a copy-based provider tears the destination of a rename', async () => {
    const filesystem = new InterleavingRevisionProvider();
    const persistence = createBrowserRevisionPersistence({ filesystem });
    const revision = makeRevision('rename-torn-node');
    filesystem.tearNextMarkerRename = true;

    await expect(persistence.storeRevision(revision)).rejects.toThrow('simulated marker rename crash');
    await expect(persistence.load()).resolves.toMatchObject({
      revisions: [{ revision: { id: revision.id } }],
    });

    const next = makeRevision('rename-torn-next', [revision.id]);
    const branch = revisionBranchName('rename-crash/main');
    await persistence.storeRevision(next);
    await persistence.updateBranchHead({ branch, expectedHead: undefined, head: revision.id });
    filesystem.tearNextBranchRename = true;

    await expect(persistence.updateBranchHead({ branch, expectedHead: revision.id, head: next.id })).rejects.toThrow(
      'simulated branch rename crash',
    );
    await expect(persistence.load()).resolves.toMatchObject({
      branchHeads: [{ branch, head: revision.id }],
    });
  });
});
