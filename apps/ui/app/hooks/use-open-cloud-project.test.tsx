// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectToManifest } from '@taucad/types';
import type { ProjectListItem } from '#types/project.types.js';
import type { CloudProject } from '#hooks/use-cloud-projects.js';

/**
 * *Open* on a Tau-Cloud-only library row (W18 DEF-2, charter D20): the project
 * is created under the remote's own id from the one stub materialize on
 * sign-in also uses, and the project-scoped worker connects after navigation.
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
  slugs: { workspaceSlug: 'home', projectSlug: 'gearbox-alpha' },
};

const { mockCreateProject } = vi.hoisted(() => ({ mockCreateProject: vi.fn() }));
vi.mock('#hooks/use-projects.js', () => ({ useProjects: () => ({ projects: [held] }) }));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ createProject: mockCreateProject }) }));

const { cloudProjectStub, useOpenCloudProject } = await import('#hooks/use-open-cloud-project.js');

const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <MemoryRouter initialEntries={['/projects']}>{children}</MemoryRouter>
);

const renderOpen = () => renderHook(() => ({ open: useOpenCloudProject(), location: useLocation() }), { wrapper });

describe('useOpenCloudProject', () => {
  beforeEach(() => {
    mockCreateProject.mockReset();
    mockCreateProject.mockResolvedValue({
      id: 'proj_bbbbbbbbbbbbbbbbbbbbb',
      slugs: { workspaceSlug: 'home', projectSlug: 'bracket-beta' },
    });
  });

  it('should create the project under the remote’s id from the shared stub and connect after navigation', async () => {
    const entry: CloudProject = { id: 'proj_bbbbbbbbbbbbbbbbbbbbb', name: 'Bracket Beta', role: 'owner' };
    const { result } = renderOpen();

    await act(async () => result.current.open(entry));

    expect(mockCreateProject).toHaveBeenCalledWith(cloudProjectStub(entry));
    expect(result.current.location.pathname).toBe('/w/home/bracket-beta');
    expect(result.current.location.search).toBe('?cloudOpen=tau');
    expect(result.current.location.state).toEqual({ openFromTauCloud: true });
  });

  it('should navigate to a project this device already holds instead of creating it again', async () => {
    const { result } = renderOpen();

    await act(async () => result.current.open({ id: held.id, name: held.name, role: 'owner' }));

    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(result.current.location.pathname).toBe('/w/home/gearbox-alpha');
  });
});

describe('cloudProjectStub', () => {
  it('should carry the remote’s id and name, no chat and no files', () => {
    expect(cloudProjectStub({ id: 'proj_bbbbbbbbbbbbbbbbbbbbb', name: 'Bracket Beta', role: 'owner' })).toEqual({
      id: 'proj_bbbbbbbbbbbbbbbbbbbbb',
      chat: false,
      project: { name: 'Bracket Beta', description: '', tags: [], assets: { main: { entryPath: 'main.scad' } } },
      files: {},
    });
  });
});
