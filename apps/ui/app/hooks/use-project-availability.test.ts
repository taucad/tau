import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { LargeObjectsFacet, ProjectReadiness, RevisionStatusProjection } from '@taucad/revisions';
import type { RevisionClient } from '#types/revision-client.types.js';
import {
  chatsOpen,
  modelAvailability,
  pendingOpenReadiness,
  pendingPathSet,
  projectAvailability,
  projectRenderClosure,
  readyFor,
  surfaceReadiness,
  useLargeObjectPending,
  useOpenedLargeObjectPending,
  useProjectAvailability,
} from '#hooks/use-project-availability.js';
import { useRevisionClient, useRevisionStatus } from '#hooks/use-revision-status.js';
import { kernelClosure } from '@taucad/ui-core/lib/large-object-guard';
import { useProject } from '#hooks/use-project.js';
import { useTauCloudIntent } from '#hooks/use-cloud-projects.js';
import { canOpenCloudProject } from '#lib/tau-cloud-intent.js';
import { followCloudOpen } from '@taucad/ui-core/lib/cloud-open-lock';

vi.mock('#hooks/use-project.js', () => ({ useProject: vi.fn() }));
vi.mock('#hooks/use-revision-status.js', () => ({ useRevisionStatus: vi.fn(), useRevisionClient: vi.fn() }));
vi.mock('#hooks/use-cloud-projects.js', () => ({ useTauCloudIntent: vi.fn() }));
vi.mock('#lib/tau-cloud-intent.js', () => ({ canOpenCloudProject: vi.fn() }));
vi.mock('@taucad/ui-core/lib/cloud-open-lock', () => ({ followCloudOpen: vi.fn(() => () => undefined) }));

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
    expect(projectAvailability(true, status(), { canOpen: false })).toBe('account');
  });
  it('keeps cached files available during background checks and failures', () => {
    expect(projectAvailability(false, status({ state: 'queued' }))).toBe('ready');
  });
  /* STO-25: a first view waits for the entry closure, not for the whole apply. */
  it('opens the tree and the editor once the entry closure lands, while the apply still writes the rest', () => {
    const applying = status({ state: 'pending', pullPhase: 'applying' });
    expect(projectAvailability(true, applying, { firstView: { surface: 'tree', readiness: 'entryReady' } })).toBe(
      'ready',
    );
    expect(projectAvailability(true, applying, { firstView: { surface: 'editor', readiness: 'entryReady' } })).toBe(
      'ready',
    );
    expect(projectAvailability(true, applying, { firstView: { surface: 'viewer', readiness: 'materialized' } })).toBe(
      'ready',
    );
    /* A surface that names none still waits for the whole apply. */
    expect(projectAvailability(true, applying)).toBe('preparing');
  });
  it('keeps the tree waiting until the write has announced its entries, so a listing never misses one (I7)', () => {
    const applying = status({ state: 'pending', pullPhase: 'applying' });
    expect(projectAvailability(true, applying, { firstView: { surface: 'tree', readiness: 'treeReady' } })).toBe(
      'preparing',
    );
    expect(projectAvailability(true, applying, { firstView: { surface: 'tree', readiness: undefined } })).toBe(
      'preparing',
    );
    expect(projectAvailability(true, status(), { firstView: { surface: 'tree', readiness: 'connected' } })).toBe(
      'connecting',
    );
  });
  it('never claims an empty project before every authored file has landed (I7)', () => {
    const applying = status({ state: 'pending', pullPhase: 'applying' });
    expect(projectAvailability(true, applying, { firstView: { surface: 'absence', readiness: 'entryReady' } })).toBe(
      'preparing',
    );
    expect(projectAvailability(true, applying, { firstView: { surface: 'absence', readiness: 'materialized' } })).toBe(
      'ready',
    );
  });
  /* I7: a failed or abandoned apply left a partial tree; it must never read as the project. */
  it('lets a failed open win over a first view whose entry closure had landed', () => {
    for (const failed of [
      status({ state: 'failed' }),
      status({ state: 'queued', reason: 'offline' }),
      status({ state: 'conflicted' }),
    ]) {
      expect(projectAvailability(true, failed, { firstView: { surface: 'tree', readiness: 'entryReady' } })).toBe(
        'failed',
      );
    }
  });
  /*
   * A failed write's tree keeps the readiness it reached (it never steps back within one tree), but its end took its
   * arriving rows away. A retry fetching before the next write announces its tree must not reopen that partial tree.
   */
  it('keeps a first view closed across a failed write and the retry that fetches before the next write', () => {
    const firstView = { surface: 'tree', readiness: 'entryReady' } as const;
    const retrying = status({ state: 'pending', pullPhase: 'fetching' });
    expect(projectAvailability(true, status({ state: 'queued', reason: 'unknown' }), { firstView })).toBe('failed');
    expect(projectAvailability(true, retrying, { firstView })).toBe('downloading');
    expect(projectAvailability(true, status({ state: 'pending', pullPhase: 'idle' }), { firstView })).toBe(
      'connecting',
    );
    /* The next write announces its tree: its own reading opens the view again. */
    expect(projectAvailability(true, status({ state: 'pending', pullPhase: 'applying' }), { firstView })).toBe('ready');
  });
  /* SP2h: chats open on their own records, not on the whole apply, and never with a partial history (I7). */
  it('opens chats once their records land, while the apply still writes the files', () => {
    const firstView = { surface: 'chats', readiness: 'entryReady' } as const;
    const writing = (chats: RevisionStatusProjection['sync']['chats']) =>
      status({ state: 'pending', pullPhase: 'applying', chats });
    expect(projectAvailability(true, writing('loading'), { firstView })).toBe('preparing');
    expect(projectAvailability(true, writing('ready'), { firstView })).toBe('ready');
    expect(projectAvailability(true, writing('disabled'), { firstView })).toBe('ready');
    expect(projectAvailability(true, writing('failed'), { firstView })).toBe('preparing');
    /* The apply landed first: the chats still arriving keep their view closed. */
    expect(
      projectAvailability(true, status({ pullPhase: 'records', hasAppliedRemote: true, chats: 'loading' }), {
        firstView,
      }),
    ).toBe('preparing');
    /* The records landed but the entry closure has not: the project's manifest is not readable yet. */
    expect(
      projectAvailability(true, writing('ready'), { firstView: { surface: 'chats', readiness: 'treeReady' } }),
    ).toBe('preparing');
    /* A failed open never reopens what it left, records or not. */
    expect(projectAvailability(true, status({ state: 'queued', chats: 'ready' }), { firstView })).toBe('failed');
  });
  it('lets chats be created only once they may open', () => {
    const connected = { kind: 'tau', phase: 'connected' } as const;
    const open = (sync: Partial<RevisionStatusProjection['sync']>, readiness: ProjectReadiness) =>
      mock<RevisionStatusProjection>({ ...status(sync), remote: mock(connected), readiness });
    expect(chatsOpen(open({ pullPhase: 'applying', chats: 'ready' }, 'entryReady'), true)).toBe(true);
    expect(chatsOpen(open({ pullPhase: 'applying', chats: 'ready' }, 'treeReady'), true)).toBe(false);
    /* With chat sync off no history is coming: the chats open, and a chat may be made, as the pane does (review). */
    expect(chatsOpen(open({ pullPhase: 'applying', chats: 'disabled' }, 'entryReady'), true)).toBe(true);
    expect(chatsOpen(open({ chats: 'disabled' }, 'connected'), false)).toBe(true);
    expect(chatsOpen(open({ pullPhase: 'applying', chats: 'ready' }, 'entryReady'), true, false)).toBe(false);
    expect(chatsOpen(open({ chats: 'ready' }, 'connected'), false)).toBe(true);
    expect(chatsOpen(open({ chats: 'loading' }, 'filled'), false)).toBe(false);
  });
  it('never opens a first view for an account that cannot open the project', () => {
    expect(
      projectAvailability(true, status(), { canOpen: false, firstView: { surface: 'tree', readiness: 'filled' } }),
    ).toBe('account');
  });
});

/* T6: files open with the checkout; a model waits only on the large objects its own render closure reads. */
describe('model availability', () => {
  const fetching = (paths: readonly string[]): Pick<LargeObjectsFacet, 'phase' | 'paths'> => ({
    phase: 'fetching',
    paths,
  });
  const closure = ['tau.json', 'main.ts'];
  it('follows the project until the project is ready', () => {
    expect(modelAvailability('downloading', { largeObjects: fetching(['main.ts']) }, closure)).toBe('downloading');
    expect(modelAvailability('preparing', undefined, closure)).toBe('preparing');
  });
  it('waits for a large object its render closure reads', () => {
    expect(
      modelAvailability(
        'ready',
        { largeObjects: fetching(['assets/a.png', 'main.ts']), readiness: 'materialized' },
        closure,
      ),
    ).toBe('files');
    expect(
      modelAvailability(
        'ready',
        { largeObjects: { phase: 'failed', paths: ['main.ts'] }, readiness: 'materialized' },
        closure,
      ),
    ).toBe('filesFailed');
  });
  /* STO-25: geometry was ready ~100 s before it showed, held by media the kernel never reads (L8). */
  it('renders while only large objects outside its render closure are downloading', () => {
    expect(
      modelAvailability(
        'ready',
        { largeObjects: fetching(['assets/a.png', 'assets/b.bin']), readiness: 'materialized' },
        closure,
      ),
    ).toBe('ready');
    expect(modelAvailability('ready', { largeObjects: fetching(['assets/a.png']) }, closure)).toBe('ready');
  });
  it('shows a failed fill whatever the closure, so Try again stays reachable', () => {
    expect(
      modelAvailability(
        'ready',
        { largeObjects: { phase: 'failed', paths: ['assets/a.png'] }, readiness: 'materialized' },
        closure,
      ),
    ).toBe('filesFailed');
  });
  it('is ready when no large object is outstanding', () => {
    expect(modelAvailability('ready', undefined, closure)).toBe('ready');
    expect(modelAvailability('ready', { readiness: 'filled' }, closure)).toBe('ready');
  });
  /* Every authored file is a file at `materialized`; a pending object the kernel reads is read through (D9). */
  it('renders once every authored file is written, before the fill has given its word', () => {
    expect(modelAvailability('ready', { readiness: 'materialized' }, closure)).toBe('ready');
  });
  /* T5: before every authored file is written the wait is a check, never a download, whatever is pending. */
  it('waits as a check, not a download, until every authored file is written', () => {
    expect(modelAvailability('ready', { readiness: 'entryReady' }, closure)).toBe('filesChecking');
    expect(
      modelAvailability('ready', { largeObjects: fetching(['assets/a.png']), readiness: 'treeReady' }, closure),
    ).toBe('filesChecking');
  });
});

describe('render closure', () => {
  const fetching = (paths: readonly string[]): Pick<LargeObjectsFacet, 'phase' | 'paths'> => ({
    phase: 'fetching',
    paths,
  });
  /* A workspace mirror lists a pending file at its object's size and its read waits (D9): its closure is its entry's. */
  it('waits on a mirroring kernel’s own closure only, as on any other kernel’s', () => {
    const mirror = kernelClosure('main.py');
    expect(mirror).toStrictEqual(['tau.json', 'main.py']);
    expect(
      modelAvailability('ready', { largeObjects: fetching(['assets/a.png']), readiness: 'materialized' }, mirror),
    ).toBe('ready');
    expect(modelAvailability('ready', { largeObjects: fetching(['main.py']), readiness: 'materialized' }, mirror)).toBe(
      'files',
    );
    expect(modelAvailability('ready', { readiness: 'materialized' }, mirror)).toBe('ready');
  });
  it('waits on nothing but the manifest while the project names no main entry', () => {
    const entryless = kernelClosure('');
    expect(
      modelAvailability('ready', { largeObjects: fetching(['assets/a.png']), readiness: 'materialized' }, entryless),
    ).toBe('ready');
    expect(
      modelAvailability('ready', { largeObjects: fetching(['tau.json']), readiness: 'materialized' }, entryless),
    ).toBe('files');
  });
  /* Every view's entry runs a kernel the gate admits, not only main's. */
  it('is every viewed entry’s closure', () => {
    expect(projectRenderClosure('main.ts', ['main.ts', 'lib/gear.ts'])).toStrictEqual([
      'tau.json',
      'main.ts',
      'lib/gear.ts',
    ]);
    const multi = projectRenderClosure('main.ts', ['lib/gear.ts']);
    expect(
      modelAvailability('ready', { largeObjects: fetching(['lib/gear.ts']), readiness: 'materialized' }, multi),
    ).toBe('files');
    expect(projectRenderClosure('', ['part.py'])).toStrictEqual(['tau.json', 'part.py']);
    expect(projectRenderClosure('', [])).toStrictEqual(['tau.json']);
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

/* D10: the editor, tree and viewer open early; search, export, LSP, a cut and a render wait for every authored file. */
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
  it('holds a model render until every authored file is a file, not until every large object is here', () => {
    expect(readyFor('model', 'entryReady')).toBe(false);
    expect(readyFor('model', 'materialized')).toBe(true);
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
    vi.mocked(useRevisionClient).mockReturnValue(mock<RevisionClient>({ send }));
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

/*
 * Another tab's open: its broadcast readiness speaks for the opener's tree write, whose expected entries live in the
 * opener's worker. This tab's listing knows none of them, so its first view waits for its own reading (I7).
 */
describe('a first view in a tab that follows another tab’s open', () => {
  it('opens on its own readiness only, never on the opener’s broadcast', () => {
    vi.mocked(useProject).mockReturnValue({ projectId: 'project-1' } as ReturnType<typeof useProject>);
    vi.mocked(useTauCloudIntent).mockReturnValue('open');
    vi.mocked(canOpenCloudProject).mockReturnValue(true);
    vi.mocked(followCloudOpen).mockImplementation((_projectId, listener) => {
      listener('entryReady');
      return () => undefined;
    });
    const applying = {
      ...status({ state: 'pending', pullPhase: 'applying' }),
      remote: { kind: 'none', phase: 'none' },
      readiness: undefined,
    } as unknown as RevisionStatusProjection;
    vi.mocked(useRevisionStatus).mockReturnValue(applying);
    expect(renderHook(() => useProjectAvailability('tree')).result.current).toBe('preparing');

    vi.mocked(useRevisionStatus).mockReturnValue({
      ...applying,
      remote: { kind: 'tau', phase: 'connected' },
      readiness: 'entryReady',
    } as unknown as RevisionStatusProjection);
    expect(renderHook(() => useProjectAvailability('tree')).result.current).toBe('ready');
  });
});
