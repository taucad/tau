// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
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
const { materializeOnSignIn, tauCloudIntent } = await import('#hooks/use-cloud-projects.js');

describe('toLibraryRows', () => {
  it('should list local, both and Tau-Cloud-only projects in one list', () => {
    const rows = toLibraryRows([held, heldLocal], cloud, true);

    expect(rows.map((row) => [row.id, 'cloudOnly' in row ? 'cloud' : 'onCloud' in row ? 'both' : 'local'])).toEqual([
      ['proj_aaaaaaaaaaaaaaaaaaaaa', 'both'],
      ['proj_ccccccccccccccccccccc', 'local'],
      ['proj_bbbbbbbbbbbbbbbbbbbbb', 'cloud'],
    ]);
  });

  it('should sort a Tau-Cloud-only row by its update time', () => {
    const rows = toLibraryRows([], cloud, true);

    expect(rows.map((row) => row.lastActivityAt)).toEqual([1, 2]);
  });

  it('should leave Tau-Cloud-only rows out of the Trash', () => {
    const rows = toLibraryRows([held], cloud, false);

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
      useMaterializeCloudProjects({ cloud, isSettled: true, projects: [held], isLoading: false });
    });

    await Promise.resolve();
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it('should bring each Tau-Cloud-only project to the chosen workspace under the remote’s id', async () => {
    materializeOnSignIn.set({ kind: 'workspace', workspaceId: 'wsp_aaaaaaaaaaaaaaaaaaaaa' });

    renderHook(() => {
      useMaterializeCloudProjects({ cloud, isSettled: true, projects: [held], isLoading: false });
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
      useMaterializeCloudProjects({ cloud, isSettled: true, projects: [held], isLoading: false });
    });

    await Promise.resolve();
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it('should leave a project the device refused as Tau Cloud’s, with nothing owed', async () => {
    materializeOnSignIn.set({ kind: 'home' });
    mockCreateProject.mockRejectedValue(new Error('That project is already on this device'));

    renderHook(() => {
      useMaterializeCloudProjects({ cloud, isSettled: true, projects: [held], isLoading: false });
    });

    await waitFor(() => {
      expect(mockCreateProject).toHaveBeenCalledOnce();
    });
    expect(tauCloudIntent.get('proj_bbbbbbbbbbbbbbbbbbbbb')).toBeUndefined();
  });
});
