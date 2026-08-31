import { describe, expect, it } from 'vitest';
import { ImmutableRevisionTree, revisionId } from '#revision-tree.js';
import { RevisionAuthority, revisionBranchName } from '#revision-authority.js';
import type { RevisionProvenance } from '#revision-authority.js';

const provenance = (actorId: string, createdAt: number): RevisionProvenance => ({
  source: 'agent',
  actorId,
  runId: `run-${actorId}`,
  createdAt,
});

const create = (
  authority: RevisionAuthority,
  id: string,
  options: Readonly<{
    parents: ReadonlyArray<ReturnType<typeof revisionId>>;
    content?: string;
  }>,
) =>
  authority.createRevision({
    id: revisionId(id),
    parents: options.parents,
    tree: new ImmutableRevisionTree([['main.ts', options.content ?? id]]),
    provenance: provenance(id, options.parents.length),
    summary: { generated: `Generated ${id}` },
  });

describe('RevisionAuthority', () => {
  it('stores immutable parent, tree, provenance, and editable-summary metadata', () => {
    const authority = new RevisionAuthority();
    const bytes = new TextEncoder().encode('base');
    const tree = new ImmutableRevisionTree([['main.ts', bytes]]);
    const base = authority.createRevision({
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

  it('rejects missing or duplicate parents and duplicate revision identities', () => {
    const authority = new RevisionAuthority();
    const base = create(authority, 'rev-base', { parents: [] });

    expect(() => create(authority, 'rev-missing-parent', { parents: [revisionId('rev-absent')] })).toThrow(
      'Revision parent does not exist',
    );
    expect(() => create(authority, 'rev-duplicate-parent', { parents: [base.id, base.id] })).toThrow(
      'same parent more than once',
    );
    expect(() => create(authority, 'rev-base', { parents: [] })).toThrow('Revision already exists');
  });

  it('publishes an unborn branch and rejects a stale expected head with typed evidence', async () => {
    const authority = new RevisionAuthority();
    const main = revisionBranchName('main');
    const base = create(authority, 'rev-base', { parents: [] });
    const next = create(authority, 'rev-next', { parents: [base.id] });

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

  it('allows exactly one winner for each pair of concurrent same-head publishers', async () => {
    const authority = new RevisionAuthority();
    const branch = revisionBranchName('agents/conformance');
    let head = create(authority, 'rev-race-base', { parents: [] });
    await authority.updateBranchHead({ branch, expectedHead: undefined, head: head.id });
    let updated = 0;
    let conflicted = 0;

    for (let index = 0; index < 1000; index++) {
      const left = create(authority, `rev-left-${index}`, { parents: [head.id] });
      const right = create(authority, `rev-right-${index}`, { parents: [head.id] });
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
    const authority = new RevisionAuthority();
    const base = create(authority, 'rev-base', { parents: [] });
    const first = revisionBranchName('agent/first');
    const second = revisionBranchName('agent/second');

    const results = await Promise.all([
      authority.updateBranchHead({ branch: first, expectedHead: undefined, head: base.id }),
      authority.updateBranchHead({ branch: second, expectedHead: undefined, head: base.id }),
    ]);

    expect(results.map(({ status }) => status)).toEqual(['updated', 'updated']);
  });
});
