import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { LargeObjectsFacet, ProjectReadiness, RevisionStatusProjection } from '@taucad/revisions';
import type { RevisionClient } from '@taucad/revisions-ui/types/revision-client.types';
import {
  chatsOpen,
  filePaneAvailability,
  modelAvailability,
  modelFirstViewOpens,
  pendingOpenReadiness,
  pendingPathSet,
  projectAvailability,
  projectRenderClosure,
  readyFor,
  surfaceReadiness,
  useFilePaneAvailability,
  useLargeObjectPending,
  useModelAvailability,
  useOpenedLargeObjectPending,
  usePathLanded,
  useProjectAvailability,
} from '#hooks/use-project-availability.js';
import { useRevisionClient, useRevisionStatus } from '#hooks/use-revision-status.js';
import { kernelClosure } from '@taucad/ui-core/lib/large-object-guard';
import { useProject } from '#hooks/use-project.js';
import { useTauCloudIntent } from '#hooks/use-cloud-projects.js';
import { canOpenCloudProject } from '#lib/tau-cloud-intent.js';
import { followCloudOpen } from '@taucad/ui-core/lib/cloud-open-lock';
import { noteManifestReconciled } from '#lib/manifest-reconciliation.js';
import { sha256Bytes } from '@taucad/utils/hash';

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
  /* A retry that fails after the checkout applied keeps hasAppliedRemote: the failure still wins over a first view. */
  it('never opens a first view over a failed retry once the checkout had applied', () => {
    const failedAfterApply = status({ state: 'queued', reason: 'offline', hasAppliedRemote: true, chats: 'ready' });
    for (const surface of ['tree', 'chats'] as const) {
      expect(projectAvailability(true, failedAfterApply, { firstView: { surface, readiness: 'filled' } })).not.toBe(
        'ready',
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

/*
 * STO-25 gap 3: a file outside the entry closure opens on its own landing, not on the whole apply, and never shows
 * bytes the open's write has yet to replace, nor calls such a file missing (I7).
 */
describe('a file pane during a Tau Cloud open', () => {
  /* Both of a pane's readings, as {@link projectAvailability} gives them for one status. */
  const readings = (
    projection: RevisionStatusProjection,
    readiness: ProjectReadiness,
    canOpen = true,
  ): Readonly<{
    firstView: ReturnType<typeof projectAvailability>;
    absence: ReturnType<typeof projectAvailability>;
  }> => ({
    firstView: projectAvailability(true, projection, { canOpen, firstView: { surface: 'editor', readiness } }),
    absence: projectAvailability(true, projection, { canOpen, firstView: { surface: 'absence', readiness } }),
  });
  const applying = status({ state: 'pending', pullPhase: 'applying' });

  it('opens a file the write has landed at the first view, and waits on one it has not', () => {
    const atEntry = readings(applying, 'entryReady');
    expect(filePaneAvailability({ inClosure: false, ...atEntry, landed: true })).toBe('ready');
    expect(filePaneAvailability({ inClosure: false, ...atEntry, landed: false })).toBe('waiting');
  });
  it('waits for the first view even for a file the write has landed', () => {
    expect(filePaneAvailability({ inClosure: false, ...readings(applying, 'treeReady'), landed: true })).toBe(
      'preparing',
    );
  });
  it('opens every file once every authored file has landed, and the closure’s own at the first view', () => {
    expect(filePaneAvailability({ inClosure: false, ...readings(applying, 'materialized'), landed: false })).toBe(
      'ready',
    );
    expect(filePaneAvailability({ inClosure: true, ...readings(applying, 'entryReady'), landed: false })).toBe('ready');
    expect(filePaneAvailability({ inClosure: true, ...readings(applying, 'treeReady'), landed: true })).toBe(
      'preparing',
    );
  });
  it('lets a failed open win over a file the write had landed', () => {
    for (const failed of [
      status({ state: 'failed' }),
      status({ state: 'queued', reason: 'offline' }),
      status({ state: 'conflicted' }),
    ]) {
      for (const inClosure of [false, true]) {
        expect(filePaneAvailability({ inClosure, ...readings(failed, 'entryReady'), landed: true })).toBe('failed');
      }
    }
  });
  it('never opens a landed file for an account that cannot open the project', () => {
    for (const readiness of ['entryReady', 'materialized', 'filled'] as const) {
      expect(filePaneAvailability({ inClosure: false, ...readings(applying, readiness, false), landed: true })).toBe(
        'account',
      );
    }
  });
  it('keeps a landed file closed across a failed retry after the checkout applied', () => {
    const failedAfterApply = status({ state: 'queued', reason: 'offline', hasAppliedRemote: true });
    for (const inClosure of [false, true]) {
      expect(filePaneAvailability({ inClosure, ...readings(failedAfterApply, 'filled'), landed: true })).not.toMatch(
        /^(?:ready|waiting)$/u,
      );
    }
  });
  it('waits again on its own file once a retry’s write announces the next tree', () => {
    /* The retry fetches first: no tree is being written, whatever was landed before. */
    const retrying = status({ state: 'pending', pullPhase: 'fetching' });
    expect(filePaneAvailability({ inClosure: false, ...readings(retrying, 'entryReady'), landed: true })).toBe(
      'downloading',
    );
    /* Its write lands its closure; this file is not landed for the new tree until the host says so. */
    expect(filePaneAvailability({ inClosure: false, ...readings(applying, 'entryReady'), landed: false })).toBe(
      'waiting',
    );
  });
  it('is the project’s availability once no open is owed', () => {
    const ready = projectAvailability(false, applying);
    expect(filePaneAvailability({ inClosure: false, firstView: ready, absence: ready, landed: false })).toBe('ready');
  });
});

describe('a file pane’s own landing', () => {
  const pendingOpen = (
    readiness: ProjectReadiness,
    landedPaths?: readonly string[],
  ): Readonly<{
    send: ReturnType<typeof vi.fn>;
    publish: (next: RevisionStatusProjection | undefined) => void;
  }> => {
    const send = vi.fn();
    const listeners = new Set<() => void>();
    let current: RevisionStatusProjection | undefined = {
      ...status({ state: 'pending', pullPhase: 'applying' }),
      remote: { kind: 'tau', phase: 'connected' },
      readiness,
      ...(landedPaths === undefined ? {} : { landedPaths }),
    } as unknown as RevisionStatusProjection;
    vi.mocked(useProject).mockReturnValue({ projectId: 'project-1' } as ReturnType<typeof useProject>);
    vi.mocked(useTauCloudIntent).mockReturnValue('open');
    vi.mocked(canOpenCloudProject).mockReturnValue(true);
    vi.mocked(useRevisionStatus).mockReturnValue(current);
    const client = mock<RevisionClient>({
      send,
      status: () => current,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    });
    vi.mocked(useRevisionClient).mockReturnValue(client);
    return {
      send,
      publish: (next) => {
        current = next;
        for (const listener of listeners) {
          listener();
        }
      },
    };
  };

  it('asks this tab’s host to watch the file while it waits, and stops when the pane goes', () => {
    const { send } = pendingOpen('entryReady');
    const { result, unmount } = renderHook(() => useFilePaneAvailability('lib/gear.ts', false));
    expect(result.current).toBe('waiting');
    const [[{ watcher }]] = send.mock.calls as [[{ watcher: string }]];
    expect(send).toHaveBeenCalledExactlyOnceWith({ command: 'watchLanding', watcher, paths: ['lib/gear.ts'] });
    unmount();
    expect(send).toHaveBeenLastCalledWith({ command: 'watchLanding', watcher, paths: [] });
  });
  it('opens once the host names the file landed', () => {
    pendingOpen('entryReady', ['README.md', 'lib/gear.ts']);
    expect(renderHook(() => useFilePaneAvailability('lib/gear.ts', false)).result.current).toBe('ready');
  });
  it('asks nothing before the first view, for the closure’s own file, or once every file has landed', () => {
    const { send } = pendingOpen('treeReady');
    expect(renderHook(() => useFilePaneAvailability('lib/gear.ts', false)).result.current).toBe('preparing');
    pendingOpen('entryReady').send.mockImplementation(send);
    expect(renderHook(() => useFilePaneAvailability('main.ts', true)).result.current).toBe('ready');
    pendingOpen('materialized').send.mockImplementation(send);
    expect(renderHook(() => useFilePaneAvailability('lib/gear.ts', false)).result.current).toBe('ready');
    expect(send).not.toHaveBeenCalled();
  });
  it('says its watch again to a host the client reconnects to', () => {
    const { send, publish } = pendingOpen('entryReady');
    const { result } = renderHook(() => usePathLanded('lib/gear.ts'));
    expect(send).toHaveBeenCalledTimes(1);
    const connected = vi.mocked(useRevisionStatus)();
    /* The client closes its connection: its status is gone until the new host's first. */
    act(() => {
      publish(undefined);
    });
    expect(send).toHaveBeenCalledTimes(1);
    act(() => {
      publish(connected);
    });
    const watches = send.mock.calls.filter(([command]) => (command as { paths: string[] }).paths.length > 0);
    expect(watches).toHaveLength(2);
    expect(result.current).toBe(false);
  });
  it('opens when the client publishes the file landed, with no render of its own', () => {
    const { publish } = pendingOpen('entryReady');
    const { result } = renderHook(() => usePathLanded('lib/gear.ts'));
    expect(result.current).toBe(false);
    act(() => {
      publish({ ...vi.mocked(useRevisionStatus)(), landedPaths: ['lib/gear.ts'] } as RevisionStatusProjection);
    });
    expect(result.current).toBe(true);
  });
  it('reads a path the host has not named as not landed (I7)', () => {
    pendingOpen('entryReady', ['README.md']);
    expect(renderHook(() => usePathLanded('lib/gear.ts')).result.current).toBe(false);
    expect(renderHook(() => usePathLanded(undefined)).result.current).toBe(false);
  });
});

/*
 * STO-25 gap 1: the viewer, Parameters and the model panel render from the open's first view, not after the whole
 * apply and the intent. Only while the project holds the manifest the write landed (the host's `entryManifest` and
 * the manifest observation's finding name the same bytes), so the main entry of the open's placeholder manifest is
 * never rendered (I7); every other file the render reads waits for the write to land it (Rule 33).
 */
describe('a model surface during a Tau Cloud open', () => {
  const landed = 'a'.repeat(64);
  const placeholder = 'b'.repeat(64);
  const applying = status({ state: 'pending', pullPhase: 'applying' });
  const opens = (
    projection: RevisionStatusProjection,
    readiness: ProjectReadiness,
    options: Readonly<{
      entryManifest?: string;
      reconciled?: string;
      canOpen?: boolean;
      surface?: 'viewer' | 'export';
    }>,
  ): boolean =>
    modelFirstViewOpens({
      surface: options.surface ?? 'viewer',
      project: projectAvailability(true, projection, { canOpen: options.canOpen ?? true }),
      firstView: projectAvailability(true, projection, {
        canOpen: options.canOpen ?? true,
        firstView: { surface: 'viewer', readiness },
      }),
      status: options.entryManifest === undefined ? {} : { entryManifest: options.entryManifest },
      reconciled: options.reconciled,
    });

  it('opens at the first view once the project holds the manifest the write landed', () => {
    expect(opens(applying, 'entryReady', { entryManifest: landed, reconciled: landed })).toBe(true);
    expect(modelAvailability('ready', { readiness: 'entryReady', firstView: true }, ['tau.json', 'main.ts'])).toBe(
      'ready',
    );
  });
  it('waits while the project still holds the placeholder manifest, or the landed one is not named yet', () => {
    expect(opens(applying, 'entryReady', { entryManifest: landed, reconciled: placeholder })).toBe(false);
    expect(opens(applying, 'entryReady', { entryManifest: landed })).toBe(false);
    expect(opens(applying, 'entryReady', { reconciled: landed })).toBe(false);
  });
  it('waits for the entry closure to land', () => {
    expect(opens(applying, 'treeReady', { entryManifest: landed, reconciled: landed })).toBe(false);
    expect(modelAvailability('ready', { readiness: 'treeReady', firstView: true }, ['tau.json', 'main.ts'])).toBe(
      'filesChecking',
    );
  });
  it('lets a failed open and an account refusal win, whatever has landed', () => {
    for (const failed of [status({ state: 'failed' }), status({ state: 'queued', reason: 'offline' })]) {
      expect(opens(failed, 'entryReady', { entryManifest: landed, reconciled: landed })).toBe(false);
    }
    expect(opens(applying, 'entryReady', { entryManifest: landed, reconciled: landed, canOpen: false })).toBe(false);
  });
  it('leaves export and print to the whole apply (D10)', () => {
    expect(opens(applying, 'entryReady', { entryManifest: landed, reconciled: landed, surface: 'export' })).toBe(false);
  });
  it('waits again once a retry’s write lands its own closure, then opens on it', () => {
    /* A failed write's manifest is never named by the host, and its retry fetches first. */
    expect(opens(status({ state: 'pending', pullPhase: 'fetching' }), 'entryReady', { reconciled: landed })).toBe(
      false,
    );
    expect(opens(applying, 'treeReady', { reconciled: landed })).toBe(false);
    expect(opens(applying, 'entryReady', { entryManifest: landed, reconciled: landed })).toBe(true);
  });
  it('still waits on a large object its own closure reads', () => {
    expect(
      modelAvailability(
        'ready',
        { readiness: 'entryReady', largeObjects: { phase: 'fetching', paths: ['main.ts'] }, firstView: true },
        ['tau.json', 'main.ts'],
      ),
    ).toBe('files');
  });
  it('is nothing to a project with no open owed', () => {
    const project = projectAvailability(false, applying);
    expect(
      modelFirstViewOpens({
        surface: 'viewer',
        project,
        firstView: project,
        status: { entryManifest: landed },
        reconciled: landed,
      }),
    ).toBe(false);
  });

  it('swaps from the placeholder manifest to the landed one in the hook, never rendering the placeholder', async () => {
    const encoder = new TextEncoder();
    const real = encoder.encode('{"assets":{"main":{"entryPath":"model/main.ts"}}}');
    const stub = encoder.encode('{"assets":{"main":{"entryPath":"main.scad"}}}');
    const projectId = 'project-model-1';
    const projection = {
      ...applying,
      remote: { kind: 'tau', phase: 'connected' },
      readiness: 'entryReady',
      entryManifest: await sha256Bytes(real),
    } as unknown as RevisionStatusProjection;
    vi.mocked(useProject).mockReturnValue({
      projectId,
      mainEntryPath: 'main.scad',
      viewRecords: new Map(),
      geometryUnits: new Map(),
    } as unknown as ReturnType<typeof useProject>);
    vi.mocked(useTauCloudIntent).mockReturnValue('open');
    vi.mocked(canOpenCloudProject).mockReturnValue(true);
    vi.mocked(useRevisionStatus).mockReturnValue(projection);
    const { result } = renderHook(() => useModelAvailability());
    expect(result.current).toBe('preparing');
    /* The observation found the project equal to the placeholder's bytes: still not the tree's. */
    act(() => {
      noteManifestReconciled(projectId, stub);
    });
    await act(async () => {
      await sha256Bytes(stub);
    });
    expect(result.current).toBe('preparing');
    act(() => {
      noteManifestReconciled(projectId, real);
    });
    await vi.waitFor(() => {
      expect(result.current).toBe('ready');
    });
    expect(renderHook(() => useModelAvailability('export')).result.current).toBe('preparing');
    /* A reload begins: the project is no longer known to be those bytes'. */
    act(() => {
      noteManifestReconciled(projectId, undefined);
    });
    expect(result.current).toBe('preparing');
  });
});
