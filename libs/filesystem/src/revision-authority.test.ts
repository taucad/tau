import { describe, expect, it } from 'vitest';
import { ImmutableRevisionTree, revisionId } from '#revision-tree.js';
import { RevisionAuthority, revisionBranchName } from '#revision-authority.js';
import type { Revision, RevisionProvenance } from '#revision-authority.js';
import { createBrowserRevisionPersistence } from '#revision-persistence.js';
import type { RevisionPersistencePort } from '#revision-persistence.js';
import { MemoryProvider } from '#backend/memory-provider.js';

const provenance = (actorId: string, createdAt: number): RevisionProvenance => ({
  source: 'agent',
  actorId,
  runId: `run-${actorId}`,
  createdAt,
});

const create = async (
  authority: RevisionAuthority,
  id: string,
  options: Readonly<{
    parents: ReadonlyArray<ReturnType<typeof revisionId>>;
    content?: string;
  }>,
): Promise<Revision> =>
  authority.createRevision({
    id: revisionId(id),
    parents: options.parents,
    tree: new ImmutableRevisionTree([['main.ts', options.content ?? id]]),
    provenance: provenance(id, options.parents.length),
    summary: { generated: `Generated ${id}` },
  });

const createAuthority = async (): Promise<RevisionAuthority> => {
  const authority = new RevisionAuthority({
    persistence: createBrowserRevisionPersistence({ filesystem: new MemoryProvider() }),
  });
  await authority.ready;
  return authority;
};

describe('RevisionAuthority', () => {
  it('stores immutable parent, tree, provenance, and editable-summary metadata', async () => {
    const authority = await createAuthority();
    const bytes = new TextEncoder().encode('base');
    const tree = new ImmutableRevisionTree([['main.ts', bytes]]);
    const base = await authority.createRevision({
      id: revisionId('rev-base'),
      parents: [],
      tree,
      provenance: { ...provenance('agent-a', 10), source: 'import' },
      summary: { generated: 'Imported project', edited: 'Baseline' },
    });
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
    const authority = await createAuthority();
    const base = await create(authority, 'rev-base', { parents: [] });

    await expect(create(authority, 'rev-missing-parent', { parents: [revisionId('rev-absent')] })).rejects.toThrow(
      'Revision parent does not exist',
    );
    await expect(create(authority, 'rev-duplicate-parent', { parents: [base.id, base.id] })).rejects.toThrow(
      'same parent more than once',
    );
    await expect(create(authority, 'rev-base', { parents: [] })).rejects.toThrow('Revision already exists');
  });

  it('publishes an unborn branch and rejects a stale expected head with typed evidence', async () => {
    const authority = await createAuthority();
    const main = revisionBranchName('main');
    const base = await create(authority, 'rev-base', { parents: [] });
    const next = await create(authority, 'rev-next', { parents: [base.id] });

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
    const authority = await createAuthority();
    const base = await create(authority, 'rev-list-base', { parents: [] });
    const next = await create(authority, 'rev-list-next', { parents: [base.id] });
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
    const authority = await createAuthority();
    const branch = revisionBranchName('agents/conformance');
    let head = await create(authority, 'rev-race-base', { parents: [] });
    await authority.updateBranchHead({ branch, expectedHead: undefined, head: head.id });
    let updated = 0;
    let conflicted = 0;

    for (let index = 0; index < 1000; index++) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each round's revisions share the head selected by the prior CAS race.
      const [left, right] = await Promise.all([
        create(authority, `rev-left-${index}`, { parents: [head.id] }),
        create(authority, `rev-right-${index}`, { parents: [head.id] }),
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
    const authority = await createAuthority();
    const base = await create(authority, 'rev-base', { parents: [] });
    const first = revisionBranchName('agent/first');
    const second = revisionBranchName('agent/second');

    const results = await Promise.all([
      authority.updateBranchHead({ branch: first, expectedHead: undefined, head: base.id }),
      authority.updateBranchHead({ branch: second, expectedHead: undefined, head: base.id }),
    ]);

    expect(results.map(({ status }) => status)).toEqual(['updated', 'updated']);
  });

  it('rehydrates revisions and expected-old branch CAS from the same persistence store', async () => {
    const persistence = createBrowserRevisionPersistence({ filesystem: new MemoryProvider() });
    const options = { persistence };
    const first = new RevisionAuthority(options);
    await first.ready;
    const base = await create(first, 'rev-reload-base', { parents: [], content: 'base' });
    const next = await create(first, 'rev-reload-next', { parents: [base.id], content: 'next' });
    const branch = revisionBranchName('reload/main');
    await first.updateBranchHead({ branch, expectedHead: undefined, head: base.id });

    const reopened = new RevisionAuthority(options);
    await reopened.ready;

    expect(reopened.getRevision(next.id)?.parents).toEqual([base.id]);
    expect(new TextDecoder().decode(reopened.getRevision(next.id)?.tree.get('main.ts'))).toBe('next');
    expect(reopened.getBranchHead(branch)).toBe(base.id);
    expect(reopened.getRevisionPersistence(next.id)).toEqual({ type: 'browser' });
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
      id: revisionId('retry-base'),
      parents: Object.freeze([]),
      tree: new ImmutableRevisionTree([['main.ts', 'base']]),
      provenance: Object.freeze(provenance('retry', 1)),
      summary: Object.freeze({ generated: 'Retry base' }),
    });
    const branch = revisionBranchName('retry/main');
    let loads = 0;
    const persistence: RevisionPersistencePort = {
      load: async () => {
        loads += 1;
        return loads === 1
          ? {
              revisions: [{ revision: base, persistence: { type: 'browser' } }],
              branchHeads: [{ branch, head: revisionId('missing') }],
            }
          : {
              revisions: [{ revision: base, persistence: { type: 'browser' } }],
              branchHeads: [{ branch, head: base.id }],
            };
      },
      storeRevision: async () => ({ type: 'browser' }),
      updateBranchHead: async () => {
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
    const first = new RevisionAuthority({
      persistence: createBrowserRevisionPersistence({ filesystem }),
    });
    await first.ready;
    const base = await create(first, 'refresh-base', { parents: [] });
    const proposed = await create(first, 'refresh-proposed', { parents: [base.id] });
    const branch = revisionBranchName('refresh/main');
    await first.updateBranchHead({ branch, expectedHead: undefined, head: base.id });

    const stale = new RevisionAuthority({
      persistence: createBrowserRevisionPersistence({ filesystem }),
    });
    await stale.ready;
    const actual = await create(first, 'refresh-actual', { parents: [base.id] });
    await first.updateBranchHead({ branch, expectedHead: base.id, head: actual.id });

    await expect(stale.updateBranchHead({ branch, expectedHead: base.id, head: proposed.id })).resolves.toMatchObject({
      status: 'conflicted',
      conflict: { actualHead: actual.id },
    });
    expect(stale.getBranchHead(branch)).toBe(actual.id);
    expect(stale.getRevision(actual.id)).toMatchObject({ id: actual.id, parents: [base.id] });
    expect(stale.getRevisionPersistence(actual.id)).toEqual({ type: 'browser' });
  });
});
