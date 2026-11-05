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
    expect(readinessOf(source())).toEqual({ state: 'filled', tree: 'live:h1' });
  });

  it('stops at materialized until the fill has given its word on the checkout', () => {
    expect(readinessOf(source(), false).state).toBe('materialized');
    expect(readinessOf(source({ applyingRoots: ['/projects/p'] }), false).state).toBe('treeReady');
  });

  it('treats a local project with no revision as complete', () => {
    const local = source({ headRevisionId: undefined, remote: remote('none') });
    expect(readinessOf(local).state).toBe('filled');
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

  it('withdraws filled when the fill names a pointer in the same tree, and nothing else', () => {
    const filled = readinessOf(source());
    const pointer = readinessOf(source({ largeObjects: facet }));
    expect(settleReadiness(filled, pointer)).toBe(pointer);
    const materialized = readinessOf(source({ largeObjects: facet }));
    expect(settleReadiness(materialized, readinessOf(source({ applyingRoots: ['/projects/p'] })))).toBe(materialized);
  });

  it('moves forward within one tree', () => {
    const tree = readinessOf(source({ applyingRoots: ['/projects/p'] }));
    const filled = readinessOf(source());
    expect(settleReadiness(tree, filled)).toBe(filled);
  });

  it('re-enters at the new tree’s own state on a switch, restore or pull', () => {
    const filled = readinessOf(source());
    const pulled = readinessOf(source({ headRevisionId: 'h2', largeObjects: facet }));
    expect(settleReadiness(filled, pulled)).toEqual({ state: 'materialized', tree: 'live:h2' });
    const switched = readinessOf(source({ checkoutId: 'other' }));
    expect(settleReadiness(filled, switched).tree).toBe('other:h1');
  });

  it('takes the first reading as it is', () => {
    const first = readinessOf(source({ registrySettled: false }));
    expect(settleReadiness(undefined, first)).toBe(first);
  });
});
