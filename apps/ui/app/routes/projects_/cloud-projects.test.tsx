// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectToManifest } from '@taucad/types';
import type { ProjectListItem } from '#types/project-library.types.js';
import type { CloudProject } from '#hooks/use-cloud-projects.js';

/**
 * The one library's Tau Cloud half (charter D20, W11): which rows it adds, and
 * materialize on sign-in. The rendering of those rows is the library's own
 * suite (`project-library.test.tsx`).
 */

const held: ProjectListItem = {
  ...projectToManifest({
    id: 'proj_aaaaaaaaaaaaaaaaaaaaa',
    name: 'Gearbox Alpha',
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  }),
  lastActivityAt: 0,
  locator: { backend: 'indexeddb', storageRootKey: 'indexeddb:tau-', relativeDirectory: '/gearbox-alpha' },
};
const heldLocal: ProjectListItem = {
  ...held,
  ...projectToManifest({ ...held, id: 'proj_ccccccccccccccccccccc', name: 'Local Only' }),
};
/* In this device's Trash: still held, so never Tau Cloud's alone. */
const trashed: ProjectListItem = {
  ...held,
  ...projectToManifest({ ...held, id: 'proj_bbbbbbbbbbbbbbbbbbbbb', name: 'Bracket Beta' }),
  deletedAt: 5,
};
const cloud: readonly CloudProject[] = [
  { id: 'proj_aaaaaaaaaaaaaaaaaaaaa', name: 'Gearbox Alpha', role: 'owner', updatedAt: 1 },
  { id: 'proj_bbbbbbbbbbbbbbbbbbbbb', name: 'Bracket Beta', role: 'owner', updatedAt: 2 },
];
/* Shared with this account later: the listing's ids change. */
const newcomer: CloudProject = { id: 'proj_ddddddddddddddddddddd', name: 'Delta Duct', role: 'write', updatedAt: 3 };

const { mockCreateProject, mockGetProjectFileSystemConfig, auth } = vi.hoisted(() => ({
  mockCreateProject: vi.fn(),
  /* The route config: what this device holds, the record `createProject` itself refuses a held id by. */
  mockGetProjectFileSystemConfig: vi.fn(),
  auth: { current: 'authed' as 'authed' | 'anonymous' | 'indeterminate' },
}));

vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ createProject: mockCreateProject }) }));
vi.mock('#filesystem/handle-store.js', () => ({ getProjectFileSystemConfig: mockGetProjectFileSystemConfig }));
vi.mock('#hooks/use-resolved-auth.js', () => ({ useResolvedAuth: () => auth.current }));
/* eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names. */
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test' } }));

const { toLibraryRows, useMaterializeCloudProjects } = await import('#routes/projects_/cloud-projects.js');
const { materializeOnSignIn, materializedCloudProjects, tauCloudIntent } = await import('#hooks/use-cloud-projects.js');

/* Every queued microtask and the lock's chain drain before a macrotask runs. */
const settle = async (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });

describe('toLibraryRows', () => {
  it('should list local, both and Tau-Cloud-only projects in one list', () => {
    const rows = toLibraryRows({ projects: [held, heldLocal], held: [held, heldLocal], cloud, includeCloudOnly: true });

    expect(rows.map((row) => [row.id, 'cloudOnly' in row ? 'cloud' : 'onCloud' in row ? 'both' : 'local'])).toEqual([
      ['proj_aaaaaaaaaaaaaaaaaaaaa', 'both'],
      ['proj_ccccccccccccccccccccc', 'local'],
      ['proj_bbbbbbbbbbbbbbbbbbbbb', 'cloud'],
    ]);
  });

  it('should sort a Tau-Cloud-only row by its update time', () => {
    const rows = toLibraryRows({ projects: [], held: [], cloud, includeCloudOnly: true });

    expect(rows.map((row) => row.lastActivityAt)).toEqual([1, 2]);
  });

  it('should leave Tau-Cloud-only rows out of the Trash', () => {
    const rows = toLibraryRows({ projects: [held], held: [held], cloud, includeCloudOnly: false });

    expect(rows.map((row) => row.id)).toEqual(['proj_aaaaaaaaaaaaaaaaaaaaa']);
  });

  it('should never offer a project in this device’s Trash as Tau Cloud’s alone', () => {
    const rows = toLibraryRows({ projects: [held], held: [held, trashed], cloud, includeCloudOnly: true });

    expect(rows.map((row) => row.id)).toEqual(['proj_aaaaaaaaaaaaaaaaaaaaa']);
  });
});

describe('useMaterializeCloudProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    materializeOnSignIn.set(undefined);
    auth.current = 'authed';
    mockCreateProject.mockResolvedValue({ id: 'proj_bbbbbbbbbbbbbbbbbbbbb' });
    mockGetProjectFileSystemConfig.mockResolvedValue(undefined);
  });

  it('should create nothing while the setting is off, its default', async () => {
    renderHook(() => {
      useMaterializeCloudProjects({ cloud, isSettled: true, isFetching: false, held: [held], isLoading: false });
    });

    await settle();
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it('should bring each Tau-Cloud-only project to the chosen workspace under the remote’s id', async () => {
    materializeOnSignIn.set({ kind: 'workspace', workspaceId: 'wsp_aaaaaaaaaaaaaaaaaaaaa' });

    renderHook(() => {
      useMaterializeCloudProjects({ cloud, isSettled: true, isFetching: false, held: [held], isLoading: false });
    });

    await waitFor(() => {
      expect(tauCloudIntent.get('proj_bbbbbbbbbbbbbbbbbbbbb')).toBe('open');
    });
    /* Held already, so only the other one; and under its own id, because the id is the repository path. */
    expect(mockCreateProject).toHaveBeenCalledOnce();
    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'proj_bbbbbbbbbbbbbbbbbbbbb',
        chat: false,
        files: {},
        location: { kind: 'workspace', workspaceId: 'wsp_aaaaaaaaaaaaaaaaaaaaa' },
      }),
    );
  });

  it('should wait for a signed-in account', async () => {
    materializeOnSignIn.set({ kind: 'home' });
    auth.current = 'anonymous';

    renderHook(() => {
      useMaterializeCloudProjects({ cloud, isSettled: true, isFetching: false, held: [held], isLoading: false });
    });

    await settle();
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it('should mark a project to connect on first open as soon as its creation starts, however slowly it settles', async () => {
    materializeOnSignIn.set({ kind: 'home' });
    /* The directory, and so the library card, exists long before `createProject` answers (defect R). */
    const creation = Promise.withResolvers<{ id: string }>();
    mockCreateProject.mockReturnValue(creation.promise);

    renderHook(() => {
      useMaterializeCloudProjects({ cloud, isSettled: true, isFetching: false, held: [held], isLoading: false });
    });

    await waitFor(() => {
      expect(mockCreateProject).toHaveBeenCalledOnce();
    });
    expect(tauCloudIntent.get('proj_bbbbbbbbbbbbbbbbbbbbb')).toBe('open');
    /* Not recorded as brought until it is: a creation that never lands must be asked again. */
    expect(materializedCloudProjects.has('proj_bbbbbbbbbbbbbbbbbbbbb')).toBe(false);

    creation.resolve({ id: 'proj_bbbbbbbbbbbbbbbbbbbbb' });
    await waitFor(() => {
      expect(materializedCloudProjects.has('proj_bbbbbbbbbbbbbbbbbbbbb')).toBe(true);
    });
    expect(tauCloudIntent.get('proj_bbbbbbbbbbbbbbbbbbbbb')).toBe('open');
  });

  it('should ask once while a creation runs, however often the library renders', async () => {
    materializeOnSignIn.set({ kind: 'home' });
    const creation = Promise.withResolvers<{ id: string }>();
    mockCreateProject.mockReturnValue(creation.promise);
    const { rerender } = renderHook(() => {
      /* A fresh listing array each render, as `useProjects` answers. */
      useMaterializeCloudProjects({
        cloud: [...cloud],
        isSettled: true,
        isFetching: false,
        held: [held],
        isLoading: false,
      });
    });
    await waitFor(() => {
      expect(mockCreateProject).toHaveBeenCalledOnce();
    });

    rerender();
    rerender();
    await settle();

    expect(mockCreateProject).toHaveBeenCalledOnce();
    /* Settled, so the pass's lock is free for the next row. */
    creation.resolve({ id: 'proj_bbbbbbbbbbbbbbbbbbbbb' });
    await settle();
  });

  it('should leave nothing owed after a creation that failed, report it, and ask again once the listing changes', async () => {
    materializeOnSignIn.set({ kind: 'home' });
    const failure = new Error('The workspace is not connected');
    mockCreateProject.mockRejectedValueOnce(failure);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rerender } = renderHook(
      ({ listing }: { listing: readonly CloudProject[] }) => {
        useMaterializeCloudProjects({
          cloud: listing,
          isSettled: true,
          isFetching: false,
          held: [held],
          isLoading: false,
        });
      },
      { initialProps: { listing: cloud } },
    );
    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('Bracket Beta'), failure);
    });
    expect(tauCloudIntent.get('proj_bbbbbbbbbbbbbbbbbbbbb')).toBeUndefined();
    expect(materializedCloudProjects.has('proj_bbbbbbbbbbbbbbbbbbbbb')).toBe(false);

    rerender({ listing: [...cloud, newcomer] });

    await waitFor(() => {
      expect(materializedCloudProjects.has('proj_bbbbbbbbbbbbbbbbbbbbb')).toBe(true);
    });
    expect(tauCloudIntent.get('proj_bbbbbbbbbbbbbbbbbbbbb')).toBe('open');
    consoleError.mockRestore();
  });

  it('should ask for a creation that keeps failing once per listing, however often the library renders', async () => {
    materializeOnSignIn.set({ kind: 'home' });
    mockCreateProject.mockRejectedValue(new Error('The workspace is not connected'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rerender } = renderHook(
      ({ listing }: { listing: readonly CloudProject[] }) => {
        /* A fresh array each render, as `useProjects` answers. */
        useMaterializeCloudProjects({
          cloud: [...listing],
          isSettled: true,
          isFetching: false,
          held: [held],
          isLoading: false,
        });
      },
      { initialProps: { listing: cloud } },
    );
    const askedFor = (id: string): number =>
      mockCreateProject.mock.calls.filter(([options]) => (options as { id: string }).id === id).length;
    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledOnce();
    });

    for (let render = 0; render < 5; render += 1) {
      rerender({ listing: cloud });
    }
    await settle();
    expect(askedFor('proj_bbbbbbbbbbbbbbbbbbbbb')).toBe(1);
    expect(consoleError).toHaveBeenCalledOnce();

    rerender({ listing: [...cloud, newcomer] });
    await waitFor(() => {
      expect(askedFor('proj_bbbbbbbbbbbbbbbbbbbbb')).toBe(2);
    });
    consoleError.mockRestore();
  });

  it('should leave the mark of a project already on this device as it was, and not ask again', async () => {
    materializeOnSignIn.set({ kind: 'home' });
    tauCloudIntent.set('proj_bbbbbbbbbbbbbbbbbbbbb', 'noticed');
    mockCreateProject.mockRejectedValue(new Error('That project is already on this device'));
    mockGetProjectFileSystemConfig.mockResolvedValue({ kind: 'indexeddb' });
    const { rerender } = renderHook(() => {
      useMaterializeCloudProjects({
        cloud: [...cloud],
        isSettled: true,
        isFetching: false,
        held: [held],
        isLoading: false,
      });
    });

    await waitFor(() => {
      expect(materializedCloudProjects.has('proj_bbbbbbbbbbbbbbbbbbbbb')).toBe(true);
    });
    expect(tauCloudIntent.get('proj_bbbbbbbbbbbbbbbbbbbbb')).toBe('noticed');

    rerender();
    await settle();
    expect(mockCreateProject).toHaveBeenCalledOnce();
  });

  it('should keep a project marked to connect when its creation landed on this device and then threw', async () => {
    materializeOnSignIn.set({ kind: 'home' });
    mockCreateProject.mockRejectedValue(new Error('Project list refresh failed'));
    mockGetProjectFileSystemConfig.mockResolvedValue({ kind: 'indexeddb' });

    renderHook(() => {
      useMaterializeCloudProjects({ cloud, isSettled: true, isFetching: false, held: [held], isLoading: false });
    });

    await waitFor(() => {
      expect(materializedCloudProjects.has('proj_bbbbbbbbbbbbbbbbbbbbb')).toBe(true);
    });
    expect(tauCloudIntent.get('proj_bbbbbbbbbbbbbbbbbbbbb')).toBe('open');
  });

  it('should not bring back a project already brought to this device once', async () => {
    materializeOnSignIn.set({ kind: 'home' });
    materializedCloudProjects.add('proj_bbbbbbbbbbbbbbbbbbbbb');

    renderHook(() => {
      useMaterializeCloudProjects({ cloud, isSettled: true, isFetching: false, held: [held], isLoading: false });
    });

    await settle();
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it('should remember what it brought, so a later pass skips it', async () => {
    materializeOnSignIn.set({ kind: 'home' });

    renderHook(() => {
      useMaterializeCloudProjects({ cloud, isSettled: true, isFetching: false, held: [held], isLoading: false });
    });

    await waitFor(() => {
      expect(materializedCloudProjects.has('proj_bbbbbbbbbbbbbbbbbbbbb')).toBe(true);
    });
  });

  it('should skip a project in this device’s Trash', async () => {
    materializeOnSignIn.set({ kind: 'home' });

    renderHook(() => {
      useMaterializeCloudProjects({
        cloud,
        isSettled: true,
        isFetching: false,
        held: [held, trashed],
        isLoading: false,
      });
    });

    await settle();
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it('should wait while the listing is being read again, as it is after an account switch', async () => {
    materializeOnSignIn.set({ kind: 'home' });
    const { rerender } = renderHook(
      ({ isFetching }: { isFetching: boolean }) => {
        useMaterializeCloudProjects({ cloud, isSettled: true, isFetching, held: [held], isLoading: false });
      },
      { initialProps: { isFetching: true } },
    );

    await settle();
    expect(mockCreateProject).not.toHaveBeenCalled();

    rerender({ isFetching: false });
    await waitFor(() => {
      expect(mockCreateProject).toHaveBeenCalledOnce();
    });
  });

  it('should run one pass at a time, so two libraries open at once create a project once', async () => {
    materializeOnSignIn.set({ kind: 'home' });
    const materialize = (): void => {
      useMaterializeCloudProjects({ cloud, isSettled: true, isFetching: false, held: [held], isLoading: false });
    };

    renderHook(materialize);
    renderHook(materialize);

    await waitFor(() => {
      expect(materializedCloudProjects.has('proj_bbbbbbbbbbbbbbbbbbbbb')).toBe(true);
    });
    await settle();
    expect(mockCreateProject).toHaveBeenCalledOnce();
  });
});
