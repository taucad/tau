// @vitest-environment jsdom
import { createProjectFixture } from '#lib/project.fixture.js';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectListItem } from '#types/project-library.types.js';
import { CloudProjectUnavailableError, tauCloudIntent, useTauCloudIntent } from '#hooks/use-cloud-projects.js';
import type { CloudProject } from '#hooks/use-cloud-projects.js';
import { setRevisionSessionUser } from '#lib/revision-actor.js';
import { toLibraryRows } from '#routes/projects_/cloud-projects.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- Deployment environment keys.
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test' } }));

/**
 * *Open* on a Tau-Cloud-only library row (W18 DEF-2, charter D20): the project
 * is created under the remote's own id from the one stub materialize on
 * sign-in also uses, and the project-scoped worker connects after navigation.
 */

const held: ProjectListItem = {
  ...createProjectFixture({
    id: 'proj_aaaaaaaaaaaaaaaaaaaaa',
    name: 'Gearbox Alpha',
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  }),
  lastActivityAt: 0,
  locator: { backend: 'indexeddb', storageRootKey: 'indexeddb:tau-', relativeDirectory: '/gearbox-alpha' },
  slugs: { workspaceSlug: 'home', projectSlug: 'gearbox-alpha' },
};

/* In this device's Trash: held, so *Open* must not try to create it again. */
const trashed: ProjectListItem = {
  ...held,
  ...createProjectFixture({ ...held, id: 'proj_ccccccccccccccccccccc', name: 'Old Hinge' }),
  slugs: { workspaceSlug: 'home', projectSlug: 'old-hinge' },
  deletedAt: 5,
};

const { mockCreateProject, mockToastInfo, useProjectsOptions, mockGetConfig } = vi.hoisted(() => ({
  mockCreateProject: vi.fn(),
  mockGetConfig: vi.fn(),
  mockToastInfo: vi.fn<(message: string, options: { action: { label: string; onClick: () => void } }) => void>(),
  useProjectsOptions: [] as unknown[],
}));
vi.mock('#filesystem/handle-store.js', () => ({ getProjectFileSystemConfig: mockGetConfig }));
vi.mock('#hooks/use-projects.js', () => ({
  useProjects: (options: unknown) => {
    useProjectsOptions.push(options);
    return { projects: [held, trashed] };
  },
}));
vi.mock('#components/ui/sonner.js', () => ({ toast: { info: mockToastInfo } }));
vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({ createProject: mockCreateProject, getProjects: async () => [] }),
}));

const { cloudProjectStub, useOpenCloudProject } = await import('#hooks/use-open-cloud-project.js');

const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <MemoryRouter initialEntries={['/projects']}>{children}</MemoryRouter>
);

const renderOpen = () => renderHook(() => ({ open: useOpenCloudProject(), location: useLocation() }), { wrapper });
const shared: CloudProject = { id: 'shared-project', name: 'Shared bracket', role: 'write' };
const fetchMock = vi.fn<typeof fetch>();

describe('useOpenCloudProject', () => {
  beforeEach(() => {
    localStorage.clear();
    setRevisionSessionUser({ id: 'account-a', name: 'A' });
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () =>
      Response.json([
        { id: 'proj_bbbbbbbbbbbbbbbbbbbbb', name: 'Bracket Beta' },
        { id: 'partial-project', name: 'Partial' },
        shared,
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    mockCreateProject.mockReset();
    mockGetConfig.mockReset();
    mockToastInfo.mockReset();
    mockCreateProject.mockResolvedValue({
      id: 'proj_bbbbbbbbbbbbbbbbbbbbb',
      slugs: { workspaceSlug: 'home', projectSlug: 'bracket-beta' },
    });
  });

  afterEach(() => {
    cleanup();
    setRevisionSessionUser(undefined);
    vi.unstubAllGlobals();
  });

  it('should create the project under the remote’s id from the shared stub and connect after navigation', async () => {
    const entry: CloudProject = { id: 'proj_bbbbbbbbbbbbbbbbbbbbb', name: 'Bracket Beta', role: 'owner' };
    const { result } = renderOpen();

    await act(async () => result.current.open(entry));

    expect(mockCreateProject).toHaveBeenCalledWith(cloudProjectStub(entry));
    expect(result.current.location.pathname).toBe('/w/home/bracket-beta');
    expect(result.current.location.search).toBe('');
    expect(tauCloudIntent.get(entry.id)).toBe('open');
    expect(result.current.location.state).toBeNull();
  });

  it.each(['present', 'unreadable'])('keeps a %s partial stub pending after creation fails', async (state) => {
    const entry: CloudProject = { id: 'partial-project', name: 'Partial', role: 'owner' };
    if (state === 'present') {
      mockGetConfig.mockResolvedValue({ backend: 'indexeddb' });
    } else {
      mockGetConfig.mockRejectedValue(new Error('storage unavailable'));
    }
    mockCreateProject.mockRejectedValue(new Error('quota'));
    const { result } = renderOpen();
    await act(async () => {
      await expect(result.current.open(entry)).rejects.toThrow('quota');
    });
    expect(tauCloudIntent.get(entry.id)).toBe('open');
    expect(result.current.location.pathname).toBe('/projects');
    tauCloudIntent.set(entry.id, undefined);
  });

  it('should refuse a stale invitation before creating a local shell', async () => {
    fetchMock.mockResolvedValue(Response.json([]));
    const view = renderOpen();
    await act(async () => {
      await expect(view.result.current.open(shared)).rejects.toThrow(CloudProjectUnavailableError);
    });
    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(tauCloudIntent.get(shared.id)).toBeUndefined();
    expect(view.result.current.location.pathname).toBe('/projects');
  });

  it('should retain the local shell but settle a deletion during creation across library remount', async () => {
    const creation = Promise.withResolvers<{ slugs: { workspaceSlug: string; projectSlug: string } }>();
    mockCreateProject.mockReturnValue(creation.promise);
    const local = { ...held, id: shared.id, name: shared.name };
    const view = renderOpen();
    let opened: Promise<void> | undefined;
    act(() => {
      opened = view.result.current.open(shared);
    });
    await waitFor(() => {
      expect(mockCreateProject).toHaveBeenCalledOnce();
    });
    expect(tauCloudIntent.get(shared.id)).toBe('open');
    expect(toLibraryRows({ projects: [local], held: [local], cloud: [], includeCloudOnly: true })[0]).toHaveProperty(
      'cloudOnly',
      true,
    );
    fetchMock.mockResolvedValue(Response.json([]));
    await act(async () => {
      const refusal = expect(opened).rejects.toThrow(CloudProjectUnavailableError);
      creation.resolve({ slugs: { workspaceSlug: 'home', projectSlug: 'shared-bracket' } });
      await refusal;
    });
    expect(view.result.current.location.pathname).toBe('/projects');
    view.unmount();
    const reloaded = renderHook(() => ({
      intent: useTauCloudIntent(shared.id),
      rows: toLibraryRows({ projects: [local], held: [local], cloud: [], includeCloudOnly: true }),
    }));
    expect(reloaded.result.current.intent).toBeUndefined();
    expect(reloaded.result.current.rows).toEqual([local]);
    expect(localStorage.getItem(`tau:tau-cloud-intent:${shared.id}`)).toBeNull();
    expect(localStorage.getItem(`tau:tau-cloud-intent:${shared.id}:account`)).toBeNull();
  });

  it('should retain the persisted open intent when the post-creation check is offline', async () => {
    mockCreateProject.mockImplementation(async () => {
      fetchMock.mockRejectedValue(new TypeError('offline'));
      return { slugs: { workspaceSlug: 'home', projectSlug: 'shared-bracket' } };
    });
    const view = renderOpen();
    await act(async () => {
      await expect(view.result.current.open(shared)).rejects.toThrow('offline');
    });
    expect(mockCreateProject).toHaveBeenCalledOnce();
    expect(tauCloudIntent.get(shared.id)).toBe('open');
    expect(localStorage.getItem(`tau:tau-cloud-intent:${shared.id}`)).toBe('open');
    view.unmount();
    const reloaded = renderHook(() => useTauCloudIntent(shared.id));
    expect(reloaded.result.current).toBe('open');
  });

  it.each(['account', 'intent'])(
    'should preserve a newer %s intent after creation loses cloud access',
    async (change) => {
      mockCreateProject.mockImplementation(async () => {
        if (change === 'account') {
          setRevisionSessionUser({ id: 'account-b', name: 'B' });
        }
        tauCloudIntent.set(shared.id, change === 'account' ? 'open' : 'connected');
        fetchMock.mockResolvedValue(Response.json([]));
        return { slugs: { workspaceSlug: 'home', projectSlug: 'shared-bracket' } };
      });
      const view = renderOpen();
      await act(async () => {
        await expect(view.result.current.open(shared)).rejects.toThrow(CloudProjectUnavailableError);
      });
      expect(tauCloudIntent.get(shared.id)).toBe(change === 'account' ? 'open' : 'connected');
      expect(view.result.current.location.pathname).toBe('/projects');
      if (change === 'account') {
        expect(localStorage.getItem(`tau:tau-cloud-intent:${shared.id}:account`)).toBe('account-b');
      }
    },
  );

  it('should navigate to a project this device already holds instead of creating it again', async () => {
    const { result } = renderOpen();

    await act(async () => result.current.open({ id: held.id, name: held.name, role: 'owner' }));

    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(result.current.location.pathname).toBe('/w/home/gearbox-alpha');
  });

  it('should say a project in this device’s Trash is there, offering the Trash, rather than failing', async () => {
    const { result } = renderOpen();

    await act(async () => result.current.open({ id: trashed.id, name: 'Old Hinge', role: 'owner' }));

    expect(useProjectsOptions.at(-1)).toEqual({ includeDeleted: true });
    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(result.current.location.pathname).toBe('/projects');
    expect(mockToastInfo).toHaveBeenCalledOnce();
    const [message, options] = mockToastInfo.mock.calls[0] ?? [];
    expect(message).toBe('Old Hinge is in Trash on this device');
    expect(options?.action.label).toBe('Show Trash');
    act(() => {
      mockToastInfo.mock.calls[0]?.[1].action.onClick();
    });

    expect(result.current.location.search).toBe('?trash=1');
  });
});

describe('cloudProjectStub', () => {
  it('should carry the remote’s id and name, no chat and no files', () => {
    expect(cloudProjectStub({ id: 'proj_bbbbbbbbbbbbbbbbbbbbb', name: 'Bracket Beta', role: 'owner' })).toEqual({
      id: 'proj_bbbbbbbbbbbbbbbbbbbbb',
      chat: false,
      deferInitialView: true,
      project: { name: 'Bracket Beta', description: '', tags: [], assets: { main: { entryPath: 'main.scad' } } },
      files: {},
    });
  });
});
