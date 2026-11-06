import { describe, expect, it } from 'vitest';
import type { ReadinessSource } from '#open/readiness.js';
import { projectReadinessStates, reachesReadiness, readinessOf, settleReadiness } from '#open/readiness.js';

const remote = (phase: ReadinessSource['remote']['phase']): ReadinessSource['remote'] => ({
  kind: phase === 'none' ? 'none' : 'tau',
  url: undefined,
  phase,
  storage: undefined,
  overQuota: [],
  quota: undefined,
  error: undefined,
  reason: undefined,
  fetchOnly: false,
  provider: undefined,
  repositoryId: undefined,
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

  it('takes the first reading as it is', () => {
    const first = readinessOf(source({ registrySettled: false }));
    expect(settleReadiness(undefined, first)).toBe(first);
  });
});
