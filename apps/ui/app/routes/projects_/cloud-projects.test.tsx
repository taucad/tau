// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectToManifest } from '@taucad/types';
import type { ProjectListItem } from '#types/project.types.js';
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

const { mockCreateProject, auth } = vi.hoisted(() => ({
  mockCreateProject: vi.fn(),
  auth: { current: 'authed' as 'authed' | 'anonymous' | 'indeterminate' },
}));

vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ createProject: mockCreateProject }) }));
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

  it('should leave a project the device refused as Tau Cloud’s, with nothing owed', async () => {
    materializeOnSignIn.set({ kind: 'home' });
    mockCreateProject.mockRejectedValue(new Error('That project is already on this device'));

    renderHook(() => {
      useMaterializeCloudProjects({ cloud, isSettled: true, isFetching: false, held: [held], isLoading: false });
    });

    await waitFor(() => {
      expect(mockCreateProject).toHaveBeenCalledOnce();
    });
    expect(tauCloudIntent.get('proj_bbbbbbbbbbbbbbbbbbbbb')).toBeUndefined();
  });

  it('should ask once per visit for a project the device refused, however often the library renders', async () => {
    materializeOnSignIn.set({ kind: 'home' });
    mockCreateProject.mockRejectedValue(new Error('The workspace is not connected'));
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
