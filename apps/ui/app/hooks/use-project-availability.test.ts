import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RevisionStatusProjection } from '@taucad/revisions';
import {
  modelAvailability,
  pendingOpenReadiness,
  pendingPathSet,
  projectAvailability,
  readyFor,
  surfaceReadiness,
  useLargeObjectPending,
  useOpenedLargeObjectPending,
} from '#hooks/use-project-availability.js';
import { useRevisionClient, useRevisionStatus } from '#hooks/use-revision-status.js';

vi.mock('#hooks/use-project.js', () => ({ useProject: vi.fn() }));
vi.mock('#hooks/use-revision-status.js', () => ({ useRevisionStatus: vi.fn(), useRevisionClient: vi.fn() }));
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
    /* D10: a render opens at `filled`; a tree written and not yet filled waits, whatever the facet says. */
    expect(modelAvailability('ready', undefined, 'materialized')).toBe('files');
    expect(modelAvailability('ready', undefined, 'filled')).toBe('ready');
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

/* D10: the editor, tree and viewer open early; search, export, LSP and a cut wait for every file; a render for every object. */
describe('surface readiness', () => {
  it('opens the tree at treeReady and the editor and viewer at entryReady', () => {
    expect(readyFor('tree', 'treeReady')).toBe(true);
    expect(readyFor('editor', 'treeReady')).toBe(false);
    expect(readyFor('editor', 'entryReady')).toBe(true);
    expect(readyFor('viewer', 'entryReady')).toBe(true);
  });
  it('holds search, export, the LSP workspace and a cut until every authored file is a file', () => {
    for (const surface of ['search', 'export', 'lsp', 'cut'] as const) {
      expect(surfaceReadiness[surface]).toBe('materialized');
      expect(readyFor(surface, 'entryReady')).toBe(false);
      expect(readyFor(surface, 'materialized')).toBe(true);
    }
  });
  it('holds a model render until every large object is here', () => {
    expect(readyFor('model', 'materialized')).toBe(false);
    expect(readyFor('model', 'filled')).toBe(true);
  });
  it('serves nothing from an unknown state', () => {
    expect(readyFor('tree', undefined)).toBe(false);
  });
});

/* D10: an opened path jumps the fill queue; a file-tree row listing it does not. */
describe('opened large-object paths', () => {
  const pendingOn = (paths: readonly string[]): ReturnType<typeof vi.fn> => {
    const send = vi.fn();
    vi.mocked(useRevisionStatus).mockReturnValue({
      ...status(),
      largeObjects: { phase: 'fetching', paths, objects: 0, totalObjects: 1, bytes: 0, totalBytes: 1 },
    });
    vi.mocked(useRevisionClient).mockReturnValue(mock({ send }));
    return send;
  };
  it('asks the worker to fetch an open file first while it waits', () => {
    const send = pendingOn(['models/a.step']);
    const { result } = renderHook(() => useOpenedLargeObjectPending('models/a.step'));
    expect(result.current).toBe(true);
    expect(send).toHaveBeenCalledExactlyOnceWith({ command: 'prioritizeLargeObjects', paths: ['models/a.step'] });
  });
  it('asks nothing for a file that is here, or for a row that only lists one', () => {
    const send = pendingOn(['models/a.step']);
    renderHook(() => useOpenedLargeObjectPending('main.scad'));
    renderHook(() => useLargeObjectPending('models/a.step'));
    expect(send).not.toHaveBeenCalled();
  });
});

/* S20: a tab waiting on another tab's cold open shows what the opener announced, never its own empty reading. */
describe('readiness while a cold open is owed', () => {
  const none = mock<RevisionStatusProjection['remote']>({ kind: 'none', phase: 'none' });
  const tau = mock<RevisionStatusProjection['remote']>({ kind: 'tau', phase: 'connected' });
  it('follows the opener until this tab’s own root is connected', () => {
    expect(pendingOpenReadiness(undefined, undefined)).toBe('connected');
    expect(pendingOpenReadiness({ readiness: 'filled', remote: none }, undefined)).toBe('connected');
    expect(pendingOpenReadiness({ readiness: 'filled', remote: none }, 'treeReady')).toBe('treeReady');
  });
  it('takes its own reading once its root is connected', () => {
    expect(pendingOpenReadiness({ readiness: 'materialized', remote: tau }, 'treeReady')).toBe('materialized');
    expect(pendingOpenReadiness({ readiness: undefined, remote: tau }, 'treeReady')).toBe('treeReady');
  });
});
