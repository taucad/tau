/**
 * The authority over the one content-addressed store: every id below is the
 * commit id the port minted for that exact tree and those exact headers, so a
 * seeded literal is no longer expressible (R-W1 §6.1).
 */

import { describe, expect, it } from 'vitest';
import { ImmutableRevisionTree, revisionId } from '@taucad/filesystem/revisions';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { createBrowserRevisionPort } from '#browser-adapter.js';
import { RevisionAuthority, revisionBranchName } from '#revision-authority.js';
import type { Revision, RevisionProvenance } from '#revision-authority.js';
import { createPortRevisionPersistence } from '#revision-persistence.js';
import type { RevisionPersistencePort } from '#revision-persistence.js';
import type { RevisionPort } from '#revision-port.js';

const provenance = (actorId: string, createdAt: number): RevisionProvenance => ({
  source: 'agent',
  actorId,
  runId: `run-${actorId}`,
  createdAt,
});

type Store = Readonly<{ filesystem: MemoryProvider; port: RevisionPort }>;

const openStore = (filesystem: MemoryProvider = new MemoryProvider()): Store => ({
  filesystem,
  port: createBrowserRevisionPort({ filesystem }),
});

/** Mint through the store, then index it: the id is the store's, never a literal. */
const create = async (
  context: Readonly<{ authority: RevisionAuthority; store: Store }>,
  label: string,
  options: Readonly<{
    parents: ReadonlyArray<ReturnType<typeof revisionId>>;
    content?: string;
  }>,
): Promise<Revision> => {
  const { authority, store } = context;
  const input = {
    parents: options.parents,
    tree: new ImmutableRevisionTree([['main.ts', options.content ?? label]]),
    provenance: provenance(label, options.parents.length),
    summary: { generated: `Generated ${label}` },
  };
  const receipt = await store.port.writeRevision(input);
  return authority.createRevision({ id: revisionId(receipt.commitId), ...input });
};

const authorityOver = async (store: Store): Promise<RevisionAuthority> => {
  const authority = new RevisionAuthority({ persistence: createPortRevisionPersistence({ port: store.port }) });
  await authority.ready;
  return authority;
};

describe('RevisionAuthority', () => {
  it('re-reads a store another process wrote into', async () => {
    // A host placement records its turns into the same directory from another
    // process; hydration is otherwise once, so without this the pane that reads
    // the graph never learns those branches exist (R-W4b note 3).
    const filesystem = new MemoryProvider();
    const reader = await authorityOver(openStore(filesystem));
    expect([...reader.listBranchHeads()]).toEqual([]);

    const writerStore = openStore(filesystem);
    const writer = await authorityOver(writerStore);
    const revision = await create({ authority: writer, store: writerStore }, 'rev-host', { parents: [] });
    await writer.updateBranchHead({
      branch: revisionBranchName('agent/chat-host'),
      expectedHead: undefined,
      head: revision.id,
    });

    expect([...reader.listBranchHeads()]).toEqual([]);
    await reader.reload();

    expect([...reader.listBranchHeads()]).toEqual([[revisionBranchName('agent/chat-host'), revision.id]]);
    expect(reader.getRevision(revision.id)?.summary.generated).toBe('Generated rev-host');
  });

  it('stores immutable parent, tree, provenance, and editable-summary metadata', async () => {
    const store = openStore();
    const authority = await authorityOver(store);
    const bytes = new TextEncoder().encode('base');
    const tree = new ImmutableRevisionTree([['main.ts', bytes]]);
    const input = {
      parents: [],
      tree,
      provenance: { ...provenance('agent-a', 10), source: 'import' } satisfies RevisionProvenance,
      summary: { generated: 'Imported project', edited: 'Baseline' },
    };
    const receipt = await store.port.writeRevision(input);
    const base = await authority.createRevision({ id: revisionId(receipt.commitId), ...input });
    bytes[0] = 0;
    const returned = base.tree.get('main.ts')!;
    returned[0] = 0;

    expect(new TextDecoder().decode(base.tree.get('main.ts'))).toBe('base');
    expect(base).toEqual(authority.getRevision(base.id));
    expect(base.parents).toEqual([]);
    expect(base.provenance).toEqual({ source: 'import', actorId: 'agent-a', runId: 'run-agent-a', createdAt: 10 });
    expect(base.summary).toEqual({ generated: 'Imported project', edited: 'Baseline' });
    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(base.provenance)).toBe(true);
  });

  it('rejects missing or duplicate parents and duplicate revision identities', async () => {
    const store = openStore();
    const authority = await authorityOver(store);
    const base = await create({ authority, store }, 'rev-base', { parents: [] });

    await expect(
      create({ authority, store }, 'rev-missing-parent', { parents: [revisionId('a'.repeat(40))] }),
    ).rejects.toThrow('Revision parent does not exist');
    await expect(create({ authority, store }, 'rev-duplicate-parent', { parents: [base.id, base.id] })).rejects.toThrow(
      'same parent more than once',
    );
    await expect(create({ authority, store }, 'rev-base', { parents: [] })).rejects.toThrow('Revision already exists');
  });

  it('publishes an unborn branch and rejects a stale expected head with typed evidence', async () => {
    const store = openStore();
    const authority = await authorityOver(store);
    const main = revisionBranchName('main');
    const base = await create({ authority, store }, 'rev-base', { parents: [] });
    const next = await create({ authority, store }, 'rev-next', { parents: [base.id] });

    await expect(authority.updateBranchHead({ branch: main, expectedHead: undefined, head: base.id })).resolves.toEqual(
      {
        status: 'updated',
        branch: main,
        previousHead: undefined,
        head: base.id,
      },
    );
    await expect(authority.updateBranchHead({ branch: main, expectedHead: undefined, head: next.id })).resolves.toEqual(
      {
        status: 'conflicted',
        conflict: {
          type: 'stale-head',
          branch: main,
          expectedHead: undefined,
          actualHead: base.id,
          proposedHead: next.id,
        },
      },
    );
    expect(authority.getBranchHead(main)).toBe(base.id);
  });

  it('lists every published branch head so a caller can pick the lane it last published to', async () => {
    const store = openStore();
    const authority = await authorityOver(store);
    const base = await create({ authority, store }, 'rev-list-base', { parents: [] });
    const next = await create({ authority, store }, 'rev-list-next', { parents: [base.id] });
    const first = revisionBranchName('agent/chat-a/run-1');
    const second = revisionBranchName('agent/chat-a/run-2');
    await authority.updateBranchHead({ branch: first, expectedHead: undefined, head: base.id });
    await authority.updateBranchHead({ branch: second, expectedHead: undefined, head: next.id });

    expect([...authority.listBranchHeads()]).toEqual([
      [first, base.id],
      [second, next.id],
    ]);
  });

  it('allows exactly one winner for each pair of concurrent same-head publishers', async () => {
    const store = openStore();
    const authority = await authorityOver(store);
    const branch = revisionBranchName('agents/conformance');
    let head = await create({ authority, store }, 'rev-race-base', { parents: [] });
    await authority.updateBranchHead({ branch, expectedHead: undefined, head: head.id });
    let updated = 0;
    let conflicted = 0;

    for (let index = 0; index < 1000; index++) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each round's revisions share the head selected by the prior CAS race.
      const [left, right] = await Promise.all([
        create({ authority, store }, `rev-left-${index}`, { parents: [head.id] }),
        create({ authority, store }, `rev-right-${index}`, { parents: [head.id] }),
      ]);
      // oxlint-disable-next-line eslint/no-await-in-loop -- each round deliberately advances the expected head for the next CAS race.
      const results = await Promise.all([
        authority.updateBranchHead({ branch, expectedHead: head.id, head: left.id }),
        authority.updateBranchHead({ branch, expectedHead: head.id, head: right.id }),
      ]);
      updated += results.filter(({ status }) => status === 'updated').length;
      conflicted += results.filter(({ status }) => status === 'conflicted').length;
      const nextHead = authority.getBranchHead(branch);
      expect(nextHead === left.id || nextHead === right.id).toBe(true);
      if (nextHead === undefined) {
        throw new Error('Concurrent CAS race did not publish a head.');
      }
      const nextRevision = authority.getRevision(nextHead);
      if (nextRevision === undefined) {
        throw new Error('Published CAS head does not identify a revision.');
      }
      head = nextRevision;
    }

    expect(updated).toBe(1000);
    expect(conflicted).toBe(1000);
  });

  it('does not serialize independent branch keys behind each other', async () => {
    const store = openStore();
    const authority = await authorityOver(store);
    const base = await create({ authority, store }, 'rev-base', { parents: [] });
    const first = revisionBranchName('agent/first');
    const second = revisionBranchName('agent/second');

    const results = await Promise.all([
      authority.updateBranchHead({ branch: first, expectedHead: undefined, head: base.id }),
      authority.updateBranchHead({ branch: second, expectedHead: undefined, head: base.id }),
    ]);

    expect(results.map(({ status }) => status)).toEqual(['updated', 'updated']);
  });

  it('rehydrates revisions and expected-old branch CAS from the same persistence store', async () => {
    const store = openStore();
    const options = { persistence: createPortRevisionPersistence({ port: store.port }) };
    const first = new RevisionAuthority(options);
    await first.ready;
    const base = await create({ authority: first, store }, 'rev-reload-base', { parents: [], content: 'base' });
    const next = await create({ authority: first, store }, 'rev-reload-next', {
      parents: [base.id],
      content: 'next',
    });
    const branch = revisionBranchName('reload/main');
    await first.updateBranchHead({ branch, expectedHead: undefined, head: base.id });
    /* A revision no ref reaches is unreferenced evidence in the object store,
     * not part of the graph a reopened authority loads — so `next` is named by
     * its own branch, exactly as the recorder names every turn's head. */
    await first.updateBranchHead({ branch: revisionBranchName('reload/next'), expectedHead: undefined, head: next.id });

    const reopened = new RevisionAuthority(options);
    await reopened.ready;

    expect(reopened.getRevision(next.id)?.parents).toEqual([base.id]);
    expect(new TextDecoder().decode(reopened.getRevision(next.id)?.tree.get('main.ts'))).toBe('next');
    expect(reopened.getBranchHead(branch)).toBe(base.id);
    expect(reopened.getRevisionPersistence(next.id)).toMatchObject({
      engine: 'browser',
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

  it('retries failed initialization without exposing a partially built graph', async () => {
    const base = Object.freeze({
      id: revisionId('b'.repeat(40)),
      parents: Object.freeze([]),
      tree: new ImmutableRevisionTree([['main.ts', 'base']]),
      provenance: Object.freeze(provenance('retry', 1)),
      summary: Object.freeze({ generated: 'Retry base' }),
    });
    const branch = revisionBranchName('retry/main');
    let loads = 0;
    const receipt = Object.freeze({
      engine: 'browser',
      commitId: base.id,
      changeId: 'k'.repeat(32),
      objectFormat: 'sha1',
      conflicted: false,
    } as const);
    const persistence: RevisionPersistencePort = {
      load: async () => {
        loads += 1;
        return loads === 1
          ? {
              revisions: [{ revision: base, persistence: receipt }],
              branchHeads: [{ branch, head: revisionId('c'.repeat(40)) }],
            }
          : {
              revisions: [{ revision: base, persistence: receipt }],
              branchHeads: [{ branch, head: base.id }],
            };
      },
      storeRevision: async () => receipt,
      updateBranchHead: async () => {
        throw new Error('not used');
      },
      deleteBranchHead: async () => {
        throw new Error('not used');
      },
    };
    const authority = new RevisionAuthority({ persistence });

    await expect(authority.ready).rejects.toThrow('unknown revision');
    expect(() => authority.getRevision(base.id)).toThrow('not ready');
    await expect(authority.ready).resolves.toBeUndefined();
    expect(authority.getBranchHead(branch)).toBe(base.id);
    expect(loads).toBe(2);
  });

  it('rehydrates a stale conflict head before caching it', async () => {
    const filesystem = new MemoryProvider();
    const store = openStore(filesystem);
    const first = await authorityOver(store);
    const base = await create({ authority: first, store }, 'refresh-base', { parents: [] });
    const branch = revisionBranchName('refresh/main');
    await first.updateBranchHead({ branch, expectedHead: undefined, head: base.id });

    const stale = await authorityOver(openStore(filesystem));
    const proposed = await create({ authority: stale, store }, 'refresh-proposed', { parents: [base.id] });
    const actual = await create({ authority: first, store }, 'refresh-actual', { parents: [base.id] });
    await first.updateBranchHead({ branch, expectedHead: base.id, head: actual.id });

    await expect(stale.updateBranchHead({ branch, expectedHead: base.id, head: proposed.id })).resolves.toMatchObject({
      status: 'conflicted',
      conflict: { actualHead: actual.id },
    });
    expect(stale.getBranchHead(branch)).toBe(actual.id);
    expect(stale.getRevision(actual.id)).toMatchObject({ id: actual.id, parents: [base.id] });
    expect(stale.getRevisionPersistence(actual.id)).toMatchObject({ engine: 'browser', commitId: actual.id });
  });
});
