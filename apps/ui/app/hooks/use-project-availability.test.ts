import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RevisionStatusProjection } from '@taucad/revisions';
import { projectAvailability } from '#hooks/use-project-availability.js';

vi.mock('#hooks/use-project.js', () => ({ useProject: vi.fn() }));
vi.mock('#hooks/use-revision-status.js', () => ({ useRevisionStatus: vi.fn() }));
vi.mock('#hooks/use-cloud-projects.js', () => ({ useTauCloudIntent: vi.fn(), canOpenCloudProject: vi.fn() }));

const status = (changes: Partial<RevisionStatusProjection['sync']> = {}): RevisionStatusProjection =>
  mock<RevisionStatusProjection>({
    remote: mock<RevisionStatusProjection['remote']>({ kind: 'tau', phase: 'connected' }),
    sync: {
      state: 'checking',
      pendingCount: 0,
      online: true,
      conflictRef: undefined,
      error: undefined,
      reason: undefined,
      hasAppliedRemote: false,
      ...changes,
    },
  });

describe('first-open availability', () => {
  it('holds the first frame before any worker projection exists', () => {
    expect(projectAvailability(true, undefined)).toBe('connecting');
    expect(projectAvailability(false, undefined)).toBe('ready');
  });
  it('keeps a long pull pending after the short checking window', () => {
    expect(projectAvailability(true, status({ state: 'pending', pullPhase: 'fetching' }))).toBe('downloading');
    expect(projectAvailability(true, status({ state: 'pending', pullPhase: 'applying' }))).toBe('preparing');
  });
  it('waits for the manifest observer after the authored checkout is applied', () => {
    expect(projectAvailability(true, status({ hasAppliedRemote: true }))).toBe('preparing');
    expect(projectAvailability(false, status({ hasAppliedRemote: true }))).toBe('ready');
  });
  it('does not block files on optional chat loading or failure', () => {
    expect(projectAvailability(false, status({ hasAppliedRemote: true, pullPhase: 'records', chats: 'loading' }))).toBe(
      'ready',
    );
    expect(projectAvailability(false, status({ hasAppliedRemote: true, state: 'queued', chats: 'failed' }))).toBe(
      'ready',
    );
  });
  it('offers recovery for deadline, offline and account mismatch without claiming a missing file', () => {
    expect(projectAvailability(true, status({ state: 'queued', reason: 'unknown' }))).toBe('failed');
    expect(projectAvailability(true, status({ online: false }))).toBe('offline');
    expect(projectAvailability(true, status(), false)).toBe('account');
  });
  it('keeps cached files available during background checks and failures', () => {
    expect(projectAvailability(false, status({ state: 'queued' }))).toBe('ready');
  });
});
