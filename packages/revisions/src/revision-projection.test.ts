/**
 * The projection comparator and the change-event rule both compositions read.
 *
 * Moved here with their owners (W10.5, testing policy: the owning module
 * carries its own rows) — they were the browser worker's, and the Node daemon
 * now gates its status frames on the same comparator.
 */
import { describe, expect, it } from 'vitest';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';

import { sameRevisionStatus, versionedChangePaths } from '#revision-projection.js';
import type { RevisionStatusProjection } from '#project-revisions.machine.js';

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
    projectDirty: false,
    dirty: false,
    minting: false,
    headRevisionId: 'rev-1',
    follow: 'chat',
    attention: 0,
    restore: { asking: false, busy: false, removedPathCount: 0, dirty: false, revisionNumber: undefined },
    remote: {
      kind: 'none',
      url: undefined,
      phase: 'none',
      storage: undefined,
      overQuota: [],
      error: undefined,
      reason: undefined,
      fetchOnly: false,
      provider: undefined,
      repositoryId: undefined,
      quota: undefined,
    } as const,
    publish: { phase: 'idle', tags: [], publicationId: undefined, shareUrl: undefined, error: undefined } as const,
    sync: {
      state: 'noRemote',
      pendingCount: 0,
      online: true,
      conflictRef: undefined,
      error: undefined,
      reason: undefined,
    } as const,
    branches: [],
    branchVerb: { busy: false, asking: false, operation: undefined, branch: undefined, question: undefined },
    conflicts: [],
  });

  it('repaints the Sync region when the remote connects and nothing else moves', () => {
    const connected = { ...base(), remote: { ...base().remote, kind: 'tau', phase: 'connected' } as const };

    expect(sameRevisionStatus(base(), base())).toBe(true);
    expect(sameRevisionStatus(base(), connected)).toBe(false);
  });

  it.each([
    ['phase', { phase: 'connecting' } as const],
    ['url', { url: 'https://example.test/repo.git' }],
    ['storage', { storage: { used: 1, quota: 2 } }],
    ['overQuota', { overQuota: ['big.stl'] }],
    ['error', { error: 'refused' }],
  ])('repaints when remote.%s moves on its own', (_field, patch) => {
    expect(sameRevisionStatus(base(), { ...base(), remote: { ...base().remote, ...patch } })).toBe(false);
  });

  it('repaints when the restore confirmation or the publish dialog moves on its own', () => {
    expect(sameRevisionStatus(base(), { ...base(), restore: { ...base().restore, asking: true } })).toBe(false);
    expect(sameRevisionStatus(base(), { ...base(), publish: { ...base().publish, phase: 'choosingVersion' } })).toBe(
      false,
    );
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
