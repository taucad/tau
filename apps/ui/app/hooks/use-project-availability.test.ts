import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RevisionStatusProjection } from '@taucad/revisions';
import { modelAvailability, pendingPathSet, projectAvailability } from '#hooks/use-project-availability.js';

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

/* The operator's "open the UI, model waits": files open with the checkout; the model waits for every large object. */
describe('model availability', () => {
  it('follows the project until the project is ready', () => {
    expect(modelAvailability('downloading', { phase: 'fetching' })).toBe('downloading');
    expect(modelAvailability('preparing', undefined)).toBe('preparing');
  });
  it('waits for the large objects once the files are open', () => {
    expect(modelAvailability('ready', { phase: 'fetching' })).toBe('files');
    expect(modelAvailability('ready', { phase: 'failed' })).toBe('filesFailed');
  });
  it('is ready when no large object is outstanding', () => {
    expect(modelAvailability('ready', undefined)).toBe('ready');
  });
});

describe('pending large-object paths', () => {
  it('builds one set per published facet, shared by every row that asks of it', () => {
    const paths = ['models/a.step', 'models/b.step'];
    const set = pendingPathSet(paths);
    expect(set.has('models/b.step')).toBe(true);
    expect(set.has('main.scad')).toBe(false);
    expect(pendingPathSet(paths)).toBe(set);
    expect(pendingPathSet([...paths])).not.toBe(set);
  });
});
