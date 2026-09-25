/**
 * The projection comparator and the change-event rule both compositions read.
 *
 * Moved here with their owners (W10.5, testing policy: the owning module
 * carries its own rows) — they were the browser worker's, and the Node daemon
 * now gates its status frames on the same comparator.
 */
import { describe, expect, it } from 'vitest';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';

import { revisionId } from '#algorithms/index.js';
import { sameRevisionStatus, versionedChangePaths } from '#revision-projection.js';
import type { RevisionStatusProjection } from '#project-revisions.types.js';

describe('the projection comparator (P52, W18 DEF-6)', () => {
  /*
   * The defect is the comparator, not the transport: connecting a real remote
   * needs a git server this jsdom suite has none of, so the pin drives the one
   * pure function the subscription gates on. What it proves is exactly what
   * broke — a projection whose *only* moved field is a `remote.*` one is not
   * "the same", so the page is told.
   */
  const base = (): RevisionStatusProjection => ({
    projectId: 'proj_1',
    checkoutId: 'checkout-1',
    checkoutRoot: '/projects/proj_1',
    branch: 'main',
    registrySettled: true,
    projectDirty: false,
    dirty: false,
    minting: false,
    headRevisionId: 'rev-1',
    follow: 'chat',
    attention: 0,
    restore: { asking: true, busy: true, removedPathCount: 1, dirty: true, revisionNumber: 2 },
    remote: {
      kind: 'tau',
      url: 'https://example.test/repo.git',
      phase: 'connected',
      storage: { used: 1, quota: 2 },
      overQuota: ['big.stl'],
      error: 'Storage is full.',
      reason: 'quota',
      fetchOnly: true,
      provider: 'github',
      repositoryId: 'repo-1',
      quota: { remainingBytes: 3, shortfallBytes: 4 },
    } as const,
    publish: {
      phase: 'success',
      tags: [
        {
          name: 'v1',
          revisionId: revisionId('rev-1'),
          note: 'First version',
          actor: { kind: 'user', id: 'user-1', name: 'Ada' },
          createdAt: 1,
        },
      ],
      publicationId: 'publication-1',
      shareUrl: 'https://tau.new/p/publication-1',
      error: 'Previous publish failed.',
    } as const,
    sync: {
      state: 'failed',
      pendingCount: 1,
      online: false,
      conflictRef: 'refs/heads/conflict',
      error: 'Sign in again.',
      reason: 'unauthorized',
    } as const,
    branches: [
      {
        name: 'main',
        head: 'rev-1',
        checkoutId: 'checkout-1',
        checkoutRoot: '/projects/proj_1',
        leaseChatIds: ['chat-1'],
      },
    ],
    branchVerb: { busy: true, asking: true, operation: 'switch', branch: 'feature', question: 'Replace these files?' },
    conflicts: [
      {
        revisionId: 'rev-conflict',
        branch: 'feature',
        labels: { ours: 'main', theirs: 'feature' },
        paths: [{ path: 'main.ts', openable: true, side: 'mine' }],
        busy: false,
        ready: true,
      },
    ],
  });

  const variations: ReadonlyArray<readonly [string, (status: RevisionStatusProjection) => RevisionStatusProjection]> = [
    ['projectId', (status) => ({ ...status, projectId: 'proj_2' })],
    ['checkoutId', (status) => ({ ...status, checkoutId: 'checkout-2' })],
    ['checkoutRoot', (status) => ({ ...status, checkoutRoot: '/checkouts/checkout-2' })],
    ['branch', (status) => ({ ...status, branch: 'feature' })],
    ['projectDirty', (status) => ({ ...status, projectDirty: true })],
    ['dirty', (status) => ({ ...status, dirty: true })],
    ['minting', (status) => ({ ...status, minting: true })],
    ['headRevisionId', (status) => ({ ...status, headRevisionId: 'rev-2' })],
    ['follow', (status) => ({ ...status, follow: 'pinned' })],
    ['attention', (status) => ({ ...status, attention: 1 })],
    ['restore.asking', (status) => ({ ...status, restore: { ...status.restore, asking: false } })],
    ['restore.busy', (status) => ({ ...status, restore: { ...status.restore, busy: false } })],
    [
      'restore.removedPathCount',
      (status) => ({
        ...status,
        restore: { ...status.restore, removedPathCount: 2 },
      }),
    ],
    ['restore.dirty', (status) => ({ ...status, restore: { ...status.restore, dirty: false } })],
    ['restore.revisionNumber', (status) => ({ ...status, restore: { ...status.restore, revisionNumber: 3 } })],
    ['remote.kind', (status) => ({ ...status, remote: { ...status.remote, kind: 'git' } })],
    ['remote.url', (status) => ({ ...status, remote: { ...status.remote, url: 'https://example.test/other.git' } })],
    ['remote.phase', (status) => ({ ...status, remote: { ...status.remote, phase: 'failed' } })],
    ['remote.storage.used', (status) => ({ ...status, remote: { ...status.remote, storage: { used: 2, quota: 2 } } })],
    [
      'remote.storage.quota',
      (status) => ({
        ...status,
        remote: { ...status.remote, storage: { used: 1, quota: 3 } },
      }),
    ],
    ['remote.overQuota', (status) => ({ ...status, remote: { ...status.remote, overQuota: ['other.stl'] } })],
    [
      'remote.quota.remainingBytes',
      (status) => ({
        ...status,
        remote: { ...status.remote, quota: { remainingBytes: 5, shortfallBytes: 4 } },
      }),
    ],
    [
      'remote.quota.shortfallBytes',
      (status) => ({
        ...status,
        remote: { ...status.remote, quota: { remainingBytes: 3, shortfallBytes: 5 } },
      }),
    ],
    ['remote.error', (status) => ({ ...status, remote: { ...status.remote, error: 'Another failure.' } })],
    ['remote.reason', (status) => ({ ...status, remote: { ...status.remote, reason: 'rejected' } })],
    ['remote.fetchOnly', (status) => ({ ...status, remote: { ...status.remote, fetchOnly: false } })],
    ['remote.provider', (status) => ({ ...status, remote: { ...status.remote, provider: undefined } })],
    ['remote.repositoryId', (status) => ({ ...status, remote: { ...status.remote, repositoryId: 'repo-2' } })],
    ['publish.phase', (status) => ({ ...status, publish: { ...status.publish, phase: 'error' } })],
    [
      'publish.tags.name',
      (status) => ({
        ...status,
        publish: { ...status.publish, tags: [{ ...status.publish.tags[0]!, name: 'v2' }] },
      }),
    ],
    [
      'publish.tags.revisionId',
      (status) => ({
        ...status,
        publish: { ...status.publish, tags: [{ ...status.publish.tags[0]!, revisionId: revisionId('rev-2') }] },
      }),
    ],
    [
      'publish.tags.note',
      (status) => ({
        ...status,
        publish: { ...status.publish, tags: [{ ...status.publish.tags[0]!, note: 'Second version' }] },
      }),
    ],
    [
      'publish.tags.actor',
      (status) => ({
        ...status,
        publish: {
          ...status.publish,
          tags: [{ ...status.publish.tags[0]!, actor: { kind: 'agent', id: 'model-1' } }],
        },
      }),
    ],
    [
      'publish.tags.createdAt',
      (status) => ({
        ...status,
        publish: { ...status.publish, tags: [{ ...status.publish.tags[0]!, createdAt: 2 }] },
      }),
    ],
    [
      'publish.publicationId',
      (status) => ({
        ...status,
        publish: { ...status.publish, publicationId: 'publication-2' },
      }),
    ],
    [
      'publish.shareUrl',
      (status) => ({
        ...status,
        publish: { ...status.publish, shareUrl: 'https://tau.new/p/publication-2' },
      }),
    ],
    ['publish.error', (status) => ({ ...status, publish: { ...status.publish, error: 'Another failure.' } })],
    ['sync.state', (status) => ({ ...status, sync: { ...status.sync, state: 'queued' } })],
    ['sync.pendingCount', (status) => ({ ...status, sync: { ...status.sync, pendingCount: 2 } })],
    ['sync.online', (status) => ({ ...status, sync: { ...status.sync, online: true } })],
    ['sync.conflictRef', (status) => ({ ...status, sync: { ...status.sync, conflictRef: 'refs/heads/other' } })],
    ['sync.error', (status) => ({ ...status, sync: { ...status.sync, error: 'Another failure.' } })],
    ['sync.reason', (status) => ({ ...status, sync: { ...status.sync, reason: 'quota' } })],
    ['branches.name', (status) => ({ ...status, branches: [{ ...status.branches[0]!, name: 'feature' }] })],
    ['branches.head', (status) => ({ ...status, branches: [{ ...status.branches[0]!, head: 'rev-2' }] })],
    [
      'branches.checkoutId',
      (status) => ({
        ...status,
        branches: [{ ...status.branches[0]!, checkoutId: 'checkout-2' }],
      }),
    ],
    [
      'branches.checkoutRoot',
      (status) => ({
        ...status,
        branches: [{ ...status.branches[0]!, checkoutRoot: '/checkouts/checkout-2' }],
      }),
    ],
    [
      'branches.leaseChatIds',
      (status) => ({
        ...status,
        branches: [{ ...status.branches[0]!, leaseChatIds: ['chat-2'] }],
      }),
    ],
    ['branchVerb.busy', (status) => ({ ...status, branchVerb: { ...status.branchVerb, busy: false } })],
    ['branchVerb.asking', (status) => ({ ...status, branchVerb: { ...status.branchVerb, asking: false } })],
    ['branchVerb.operation', (status) => ({ ...status, branchVerb: { ...status.branchVerb, operation: 'merge' } })],
    ['branchVerb.branch', (status) => ({ ...status, branchVerb: { ...status.branchVerb, branch: 'other' } })],
    ['branchVerb.question', (status) => ({ ...status, branchVerb: { ...status.branchVerb, question: 'Continue?' } })],
    [
      'conflicts.revisionId',
      (status) => ({
        ...status,
        conflicts: [{ ...status.conflicts[0]!, revisionId: 'rev-other' }],
      }),
    ],
    ['conflicts.branch', (status) => ({ ...status, conflicts: [{ ...status.conflicts[0]!, branch: 'other' }] })],
    [
      'conflicts.labels.ours',
      (status) => ({
        ...status,
        conflicts: [{ ...status.conflicts[0]!, labels: { ...status.conflicts[0]!.labels!, ours: 'other' } }],
      }),
    ],
    [
      'conflicts.labels.theirs',
      (status) => ({
        ...status,
        conflicts: [{ ...status.conflicts[0]!, labels: { ...status.conflicts[0]!.labels!, theirs: 'other' } }],
      }),
    ],
    [
      'conflicts.paths.path',
      (status) => ({
        ...status,
        conflicts: [{ ...status.conflicts[0]!, paths: [{ ...status.conflicts[0]!.paths[0]!, path: 'other.ts' }] }],
      }),
    ],
    [
      'conflicts.paths.openable',
      (status) => ({
        ...status,
        conflicts: [{ ...status.conflicts[0]!, paths: [{ ...status.conflicts[0]!.paths[0]!, openable: false }] }],
      }),
    ],
    [
      'conflicts.paths.side',
      (status) => ({
        ...status,
        conflicts: [{ ...status.conflicts[0]!, paths: [{ ...status.conflicts[0]!.paths[0]!, side: 'theirs' }] }],
      }),
    ],
    ['conflicts.busy', (status) => ({ ...status, conflicts: [{ ...status.conflicts[0]!, busy: true }] })],
    ['conflicts.ready', (status) => ({ ...status, conflicts: [{ ...status.conflicts[0]!, ready: false }] })],
  ];

  it('should compare equal projections structurally', () => {
    expect(sameRevisionStatus(base(), base())).toBe(true);
  });

  it.each(variations)('should repaint when %s moves on its own', (_field, vary) => {
    const status = base();
    expect(sameRevisionStatus(status, vary(status))).toBe(false);
  });
});

describe('versionedChangePaths', () => {
  it('should raise one change per content-change event whatever its path count (F9)', () => {
    expect(
      versionedChangePaths(
        { type: 'fileWritten', path: '/projects/alpha/src/main.scad', backend: 'memory' },
        '/projects/alpha',
        tauPathPolicy,
      ),
    ).toEqual(['src/main.scad']);
    expect(
      versionedChangePaths(
        {
          type: 'fileRenamed',
          oldPath: '/projects/alpha/a.scad',
          newPath: '/projects/alpha/b.scad',
          backend: 'memory',
        },
        '/projects/alpha',
        tauPathPolicy,
      ),
    ).toEqual(['a.scad', 'b.scad']);
    /* Records are not versioned, so the lease the turn itself writes can never
     * make its own checkout dirty. */
    expect(
      versionedChangePaths(
        { type: 'fileWritten', path: '/projects/alpha/.tau/runs/run-1.json', backend: 'memory' },
        '/projects/alpha',
        tauPathPolicy,
      ),
    ).toEqual([]);
    /* Another project's write is not this project's change. */
    expect(
      versionedChangePaths(
        { type: 'fileWritten', path: '/projects/beta/main.scad', backend: 'memory' },
        '/projects/alpha',
        tauPathPolicy,
      ),
    ).toEqual([]);
  });
});
