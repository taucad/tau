import { describe, expect, it } from 'vitest';
import type { ReadinessSource } from '#open/readiness.js';
import { projectReadinessStates, reachesReadiness, readinessOf, settleReadiness } from '#open/readiness.js';

const remote = (
  phase: ReadinessSource['remote']['phase'],
  changes: Partial<ReadinessSource['remote']> = {},
): ReadinessSource['remote'] => ({
  kind: phase === 'none' ? 'none' : 'tau',
  url: phase === 'connected' ? 'https://api.test/v1/projects/p.git' : undefined,
  phase,
  storage: undefined,
  overQuota: [],
  quota: undefined,
  error: undefined,
  reason: undefined,
  fetchOnly: false,
  provider: undefined,
  repositoryId: undefined,
  ...changes,
});

const source = (changes: Partial<ReadinessSource> = {}): ReadinessSource => ({
  checkoutId: 'live',
  checkoutRoot: '/projects/p',
  headRevisionId: 'h1',
  registrySettled: true,
  remote: remote('connected'),
  sync: {
    state: 'backedUp',
    pendingCount: 0,
    online: true,
    conflictRef: undefined,
    error: undefined,
    reason: undefined,
  },
  ...changes,
});

const facet = {
  phase: 'fetching',
  paths: ['m.step'],
  objects: 0,
  totalObjects: 1,
  bytes: 0,
  totalBytes: 9,
} as const;

describe('readiness vocabulary (D10)', () => {
  it('orders the five states as a project reaches them', () => {
    expect(projectReadinessStates).toEqual(['connected', 'treeReady', 'entryReady', 'materialized', 'filled']);
    expect(reachesReadiness('materialized', 'entryReady')).toBe(true);
    expect(reachesReadiness('treeReady', 'entryReady')).toBe(false);
    expect(reachesReadiness('filled', 'filled')).toBe(true);
  });

  it('never serves a surface from an unknown state (I7)', () => {
    expect(reachesReadiness(undefined, 'connected')).toBe(false);
  });
});

describe('readinessOf', () => {
  it('is connected until the registry names a checkout root', () => {
    expect(readinessOf(source({ registrySettled: false })).state).toBe('connected');
    expect(readinessOf(source({ checkoutRoot: undefined })).state).toBe('connected');
  });

  it('is connected while a remote project has no head and nothing is applied', () => {
    expect(readinessOf(source({ headRevisionId: undefined }))).toEqual({ state: 'connected', tree: undefined });
  });

  it('is treeReady while the tree is being written', () => {
    expect(readinessOf(source({ applyingRoots: ['/projects/p'] })).state).toBe('treeReady');
    expect(readinessOf(source({ sync: { ...source().sync, pullPhase: 'applying' } })).state).toBe('treeReady');
    expect(readinessOf(source({ headRevisionId: undefined, applyingRoots: ['/projects/p'] })).state).toBe('treeReady');
  });

  it('does not count an apply into another checkout', () => {
    expect(readinessOf(source({ applyingRoots: ['/checkouts/b'] })).state).toBe('filled');
  });

  it('is materialized while large objects are outstanding, and filled once none is', () => {
    expect(readinessOf(source({ largeObjects: facet })).state).toBe('materialized');
    expect(readinessOf(source())).toEqual({ state: 'filled', tree: 'live:h1:0' });
  });

  it('stops at materialized until the fill has given its word on the checkout', () => {
    expect(readinessOf(source(), false).state).toBe('materialized');
    expect(readinessOf(source({ applyingRoots: ['/projects/p'] }), false).state).toBe('treeReady');
  });

  it('treats a local project with no revision as complete', () => {
    const local = source({ headRevisionId: undefined, remote: remote('none') });
    expect(readinessOf(local).state).toBe('filled');
    /* No revision means no placeholder: the fill, which never runs there, is not waited for. */
    expect(readinessOf(local, false).state).toBe('filled');
    expect(readinessOf(local, false, 1).state).toBe('materialized');
  });

  it('follows the open once it has applied the remote tree', () => {
    const applied = source({ headRevisionId: undefined, sync: { ...source().sync, hasAppliedRemote: true } });
    expect(readinessOf(applied).state).toBe('filled');
  });
});

describe('settleReadiness', () => {
  it('never falls back within one tree (I7)', () => {
    const filled = readinessOf(source());
    const reapplying = readinessOf(source({ applyingRoots: ['/projects/p'] }));
    expect(settleReadiness(filled, reapplying)).toBe(filled);
  });

  it('keeps filled when a pointer is named in the same tree: only a tree write re-enters (I7)', () => {
    const filled = readinessOf(source());
    expect(settleReadiness(filled, readinessOf(source({ largeObjects: facet })))).toBe(filled);
  });

  it('announces a tree write as a new tree from its start, then follows that tree forward', () => {
    const filled = readinessOf(source());
    const writing = readinessOf(source({ applyingRoots: ['/projects/p'] }), false, 1);
    expect(settleReadiness(filled, writing)).toEqual({ state: 'treeReady', tree: 'live:h1:1' });
    const unspoken = readinessOf(source(), false, 1);
    expect(settleReadiness(writing, unspoken)).toEqual({ state: 'materialized', tree: 'live:h1:1' });
    const left = readinessOf(source({ largeObjects: facet }), true, 1);
    expect(settleReadiness(unspoken, left)).toEqual({ state: 'materialized', tree: 'live:h1:1' });
    expect(settleReadiness(left, readinessOf(source(), true, 1))).toEqual({ state: 'filled', tree: 'live:h1:1' });
  });

  it('reads entryReady once the written tree’s entry closure has landed, before materialized (D10, I7)', () => {
    const writing = readinessOf(source({ applyingRoots: ['/projects/p'] }), false, 1);
    expect(writing.state).toBe('treeReady');
    const entry = readinessOf(source({ applyingRoots: ['/projects/p'], entryClosureLanded: true }), false, 1);
    expect(settleReadiness(writing, entry)).toEqual({ state: 'entryReady', tree: 'live:h1:1' });
    /* Within the tree nothing steps back, and the write's end moves it on. */
    expect(settleReadiness(entry, writing)).toBe(entry);
    expect(settleReadiness(entry, readinessOf(source(), false, 1))).toEqual({
      state: 'materialized',
      tree: 'live:h1:1',
    });
    /* No write in progress: the closure says nothing. */
    expect(readinessOf(source({ entryClosureLanded: true })).state).toBe('filled');
  });

  it('never reads a failed write’s new tree as materialized (D10, I7)', () => {
    const writing = readinessOf(source({ applyingRoots: ['/projects/p'] }), false, 1);
    const failed = readinessOf(source({ treeWriteFailed: true }), false, 1);
    expect(failed).toEqual({ state: 'treeReady', tree: 'live:h1:1:failed' });
    expect(settleReadiness(writing, failed)).toEqual(failed);
  });

  /*
   * A failed write's end took away the rows it never landed, so what its tree had reached no longer stands: its
   * readiness is about another tree, the partial one, and only a write running or landed may raise it again (I7).
   */
  it('lets a failed write’s readiness fall back, and keeps it there through the retry until the next write begins', () => {
    const entry = readinessOf(source({ applyingRoots: ['/projects/p'], entryClosureLanded: true }), false, 1);
    const failed = settleReadiness(entry, readinessOf(source({ treeWriteFailed: true }), false, 1));
    expect(failed.state).toBe('treeReady');
    /* The retry fast-forwards before its own write begins: the failed tree is still the one on disk. */
    const retrying = settleReadiness(
      failed,
      readinessOf(
        source({ treeWriteFailed: true, sync: { ...source().sync, state: 'pending', pullPhase: 'applying' } }),
        false,
        1,
      ),
    );
    expect(retrying.state).toBe('treeReady');
    expect(reachesReadiness(retrying.state, 'entryReady')).toBe(false);
    /* The next write announces its tree: a new tree, read on its own. */
    const next = settleReadiness(
      retrying,
      readinessOf(source({ applyingRoots: ['/projects/p'], entryClosureLanded: true }), false, 2),
    );
    expect(next).toEqual({ state: 'entryReady', tree: 'live:h1:2' });
  });

  it('moves forward within one tree', () => {
    const tree = readinessOf(source({ applyingRoots: ['/projects/p'] }));
    const filled = readinessOf(source());
    expect(settleReadiness(tree, filled)).toBe(filled);
  });

  it('re-enters at the new tree’s own state on a switch, restore or pull', () => {
    const filled = readinessOf(source());
    const pulled = readinessOf(source({ headRevisionId: 'h2', largeObjects: facet }));
    expect(settleReadiness(filled, pulled)).toEqual({ state: 'materialized', tree: 'live:h2:0' });
    const switched = readinessOf(source({ checkoutId: 'other' }));
    expect(settleReadiness(filled, switched).tree).toBe('other:h1:0');
  });

  /*
   * A cold Tau Cloud open reads the checkout before its remote is attached: no remote, no head, so complete. The
   * remote's attach makes the tree unknown again, and that completeness must not carry across it (I7).
   */
  it('lets a remote attached to a project with no head replace its local completeness (I7)', () => {
    const local = readinessOf(source({ headRevisionId: undefined, remote: remote('none') }));
    expect(local.state).toBe('filled');
    const connecting = settleReadiness(
      local,
      readinessOf(source({ headRevisionId: undefined, remote: remote('connecting') }), false),
    );
    expect(connecting.state).toBe('connected');
    const applying = settleReadiness(
      connecting,
      readinessOf(source({ headRevisionId: undefined, sync: { ...source().sync, pullPhase: 'applying' } }), false),
    );
    expect(applying.state).toBe('treeReady');
    expect(reachesReadiness(applying.state, 'entryReady')).toBe(false);
    /* The tree write announces its own tree and moves forward from there. */
    const writing = settleReadiness(
      applying,
      readinessOf(source({ headRevisionId: undefined, applyingRoots: ['/projects/p'] }), false, 1),
    );
    expect(writing).toEqual({ state: 'treeReady', tree: 'live::1' });
  });

  it('keeps a local project with no head complete while no remote is attached', () => {
    const local = source({ headRevisionId: undefined, remote: remote('none') });
    const first = settleReadiness(readinessOf(source({ ...local, registrySettled: false })), readinessOf(local));
    expect(first.state).toBe('filled');
    expect(settleReadiness(first, readinessOf(local, false))).toEqual(first);
    /* Its first revision is a new tree, complete on its own reading. */
    expect(settleReadiness(first, readinessOf(source({ remote: remote('none') }))).state).toBe('filled');
  });

  /*
   * A connect that fails after recording its remote removes it again (`abandoning`) and lands in `failed` with no
   * remote: nothing is attached and nothing will be pulled, so the project is the local one it was (I7).
   */
  it('comes back to the local project’s completeness when a connect fails and leaves no remote', () => {
    const local = readinessOf(source({ headRevisionId: undefined, remote: remote('none') }));
    const connecting = settleReadiness(
      local,
      readinessOf(source({ headRevisionId: undefined, remote: remote('connecting') }), false),
    );
    expect(connecting.state).toBe('connected');
    const abandoned = remote('failed', { kind: 'none', url: undefined, error: 'Not on this plan.' });
    const failed = settleReadiness(
      connecting,
      readinessOf(source({ headRevisionId: undefined, remote: abandoned }), false),
    );
    expect(failed).toEqual(local);
    /* A connect whose remote was never recorded fails with its kind still named, and leaves no remote either. */
    const unrecorded = remote('failed', { kind: 'tau', url: undefined, error: 'Could not write the remote.' });
    expect(readinessOf(source({ headRevisionId: undefined, remote: unrecorded }), false)).toEqual(local);
  });

  it('follows an attached remote that holds no tree back to filled', () => {
    const local = readinessOf(source({ headRevisionId: undefined, remote: remote('none') }));
    const connecting = settleReadiness(
      local,
      readinessOf(source({ headRevisionId: undefined, remote: remote('connecting') }), false),
    );
    const applied = settleReadiness(
      connecting,
      readinessOf(source({ headRevisionId: undefined, sync: { ...source().sync, hasAppliedRemote: true } }), false),
    );
    expect(applied.state).toBe('filled');
  });

  it('keeps a project with no head unknown while its remotes list is still being read (I7)', () => {
    const reading = readinessOf(source({ headRevisionId: undefined, remote: remote('none', { reading: true }) }));
    expect(reading).toEqual({ state: 'connected', tree: undefined });
    const retrying = remote('failed', { kind: 'none', error: 'config unreadable', reading: true });
    expect(readinessOf(source({ headRevisionId: undefined, remote: retrying })).state).toBe('connected');
    /* The read settles on no remote: the local project, complete. */
    expect(
      settleReadiness(reading, readinessOf(source({ headRevisionId: undefined, remote: remote('none') }))).state,
    ).toBe('filled');
  });

  it('keeps a project with a head as it is when a remote is attached', () => {
    const local = readinessOf(source({ remote: remote('none') }));
    const connecting = readinessOf(source({ remote: remote('connecting') }));
    expect(connecting.tree).toBe(local.tree);
    expect(settleReadiness(local, connecting)).toEqual({ state: 'filled', tree: 'live:h1:0' });
  });

  it('takes the first reading as it is', () => {
    const first = readinessOf(source({ registrySettled: false }));
    expect(settleReadiness(undefined, first)).toBe(first);
  });
});
