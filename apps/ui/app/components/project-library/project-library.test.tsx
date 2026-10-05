// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { projectManifestSchemaUrl, projectToManifest } from '@taucad/types';
import { ProjectLibrary } from '#components/project-library/project-library.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { cookieName } from '#constants/cookie.constants.js';
import type { ProjectListItem } from '#types/project-library.types.js';
import type { PendingProjectRecovery } from '#types/pending-project-operation.types.js';
import type { ProjectDiscoveryConflict, WorkspaceBindingRepairGroup } from '#hooks/use-project-manager.js';

const makeProject = (id: string, name: string, directory = `/${id}`): ProjectListItem => ({
  ...projectToManifest({
    id,
    name,
    description: `${name} description`,
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  }),
  lastActivityAt: 0,
  locator: { backend: 'indexeddb', storageRootKey: 'indexeddb:tau-', relativeDirectory: directory },
});

const mockProjects = [
  makeProject('proj_aaaaaaaaaaaaaaaaaaaaa', 'Gearbox Alpha', '/gearbox-alpha'),
  makeProject('proj_bbbbbbbbbbbbbbbbbbbbb', 'Bracket Beta', '/bracket-beta'),
];

const createUseProjectsResult = () => ({
  projects: mockProjects,
  conflicts: [] as ProjectDiscoveryConflict[],
  recoveries: [] as PendingProjectRecovery[],
  workspaceBindingRepairs: [] as WorkspaceBindingRepairGroup[],
  isLoading: false,
  error: undefined as Error | undefined,
  retry: vi.fn(),
  deleteProject: vi.fn(async () => true),
  verifyProjectQuiescent: vi.fn(async () => undefined),
  duplicateProject: vi.fn(),
  restoreProject: vi.fn(),
  permanentlyDeleteProject: vi.fn(),
  updateName: vi.fn(),
  adoptProject: vi.fn(async () => undefined),
  repairProject: vi.fn(async () => undefined),
  chooseProjectDirectory: vi.fn(async () => undefined),
});
let mockUseProjectsResult = createUseProjectsResult();
/** Projects in this device's Trash: answered only to a listing that includes them. */
let mockTrashedProjects: ProjectListItem[] = [];

/** What `useProjects` was last asked for, so the trashed view is observable. */
const useProjectsOptions: Array<{ includeDeleted: boolean }> = [];
vi.mock('#hooks/use-projects.js', () => ({
  useProjects: (options: { includeDeleted: boolean }) => {
    useProjectsOptions.push(options);
    return options.includeDeleted
      ? { ...mockUseProjectsResult, projects: [...mockUseProjectsResult.projects, ...mockTrashedProjects] }
      : mockUseProjectsResult;
  },
}));

const { mockDiscardRecovery, mockRepairWorkspaceBindings } = vi.hoisted(() => ({
  mockDiscardRecovery: vi.fn(async () => undefined),
  mockRepairWorkspaceBindings: vi.fn(async () => ({
    repairedProjectCount: 47,
    removedWorkspaceIds: ['wsp_previous'],
    skipped: [],
  })),
}));
vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({
    createProject: vi.fn(),
    discardRecovery: mockDiscardRecovery,
    repairWorkspaceBindings: mockRepairWorkspaceBindings,
  }),
}));

const { mockCloseProject, mockToastSuccess, mockToastError, mockToastWarning } = vi.hoisted(() => ({
  mockCloseProject: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockToastWarning: vi.fn(),
}));

vi.mock('#hooks/use-sidebar-status.js', () => ({
  useSidebarCommands: () => ({ closeProject: mockCloseProject }),
}));
vi.mock('#components/ui/sonner.js', () => ({
  toast: { success: mockToastSuccess, error: mockToastError, warning: mockToastWarning },
}));

vi.mock('#hooks/use-kernel.js', () => ({
  useKernel: () => ({ kernel: 'replicad', setKernel: vi.fn() }),
}));

const mockSetCookie = vi.fn();
let mockCookieValues: Record<string, unknown> = {};
vi.mock('#hooks/use-cookie.js', () => ({
  // Stateful like the real hook: each cookie keeps its own value, and a write re-renders.
  useCookie: (name: string, defaultValue: unknown) => {
    const [value, setValue] = useState(() => mockCookieValues[name] ?? defaultValue);
    return [
      value,
      (next: unknown) => {
        mockCookieValues[name] = next;
        mockSetCookie(name, next);
        setValue(next);
      },
    ];
  },
}));

vi.mock('#components/chat/chat-textarea.js', () => ({
  ChatTextarea: () => <textarea aria-label='chat input' />,
}));

vi.mock('#components/chat/new-project-chat-composer.js', () => ({
  NewProjectChatComposer: () => <div data-testid='new-project-chat-composer' />,
}));

vi.mock('#components/chat/kernel-selector.js', () => ({
  KernelSelector: () => <div data-testid='kernel-selector' />,
}));

vi.mock('#hooks/active-chat-provider.js', () => ({
  ChatComposerProvider: ({ children }: { readonly children: React.ReactNode }): React.ReactNode => children,
}));

vi.mock('#components/inline-text-editor.js', () => ({
  InlineTextEditor: ({ value }: { readonly value: string }) => <span>{value}</span>,
}));

vi.mock('#components/project-library/project-action-dropdown.js', () => ({
  ProjectActionDropdown: ({
    project,
    actions,
  }: {
    readonly project: ProjectListItem;
    readonly actions: {
      readonly handleDelete: (project: ProjectListItem) => void;
      readonly handlePermanentlyDelete: (project: ProjectListItem) => void;
    };
  }) => (
    <button
      type='button'
      onClick={() => {
        if (project.deletedAt === undefined) {
          actions.handleDelete(project);
        } else {
          actions.handlePermanentlyDelete(project);
        }
      }}
    >
      {`${project.deletedAt === undefined ? 'Trash' : 'Delete permanently'} ${project.name}`}
    </button>
  ),
}));

vi.mock('#hooks/use-file-manager.js', () => {
  // Stable like the provider's memoized value: thumbnails are observed per record client and watch.
  const missing = Object.assign(new Error('not found'), { code: 'ENOENT' });
  const fileManager = {
    client: { readFile: vi.fn().mockRejectedValue(missing) },
    recordFiles: { readFile: vi.fn().mockRejectedValue(missing) },
    watchRecordFile: () => ({
      ready: Promise.resolve(),
      closed: new Promise<never>(() => {
        // Never closes.
      }),
      dispose: () => undefined,
    }),
    contentService: undefined,
  };
  return {
    useFileManager: () => fileManager,
    SharedWorkerGate: ({ children }: { readonly children: React.ReactNode }): React.ReactNode => children,
    HomeFileManagerProvider: ({ children }: { readonly children: React.ReactNode }): React.ReactNode => children,
  };
});

/* D20: the Tau Cloud listing, scripted rather than fetched. */
const { cloudListing, mockOpenCloudProject } = vi.hoisted(() => ({
  cloudListing: {
    current: [] as Array<{ id: string; name: string; role: 'owner' | 'write' | 'read'; updatedAt?: number }>,
  },
  mockOpenCloudProject: vi.fn(async () => undefined),
}));
vi.mock('#hooks/use-cloud-projects.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCloudProjects: () => ({ projects: cloudListing.current, isSettled: true, isFailed: false, isFetching: false }),
}));
vi.mock('#hooks/use-open-cloud-project.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useOpenCloudProject: () => mockOpenCloudProject,
}));
vi.mock('#hooks/use-resolved-auth.js', () => ({ useResolvedAuth: () => 'authed' }));
/* eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names. */
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test' } }));

vi.mock('#hooks/use-cad-preview.js', () => ({
  CadPreviewProvider: ({ children }: { readonly children: React.ReactNode }): React.ReactNode => children,
}));

vi.mock('#components/cad-preview.js', () => ({
  CadPreviewViewer: () => <div data-testid='cad-preview-viewer' />,
}));

describe('ProjectLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookieValues = {};
    mockUseProjectsResult = createUseProjectsResult();
    mockTrashedProjects = [];
    cloudListing.current = [];
  });

  // ── D20: one list, local and Tau Cloud ──────────────────────────────────────
  describe('one list with Tau Cloud (D20)', () => {
    const renderLibrary = (): void => {
      render(
        <MemoryRouter>
          <TooltipProvider>
            <ProjectLibrary />
          </TooltipProvider>
        </MemoryRouter>,
      );
    };

    it('should list local-only, both and Tau-Cloud-only projects in the same grid, with no second section', () => {
      cloudListing.current = [
        { id: 'proj_aaaaaaaaaaaaaaaaaaaaa', name: 'Gearbox Alpha', role: 'owner' },
        { id: 'proj_ddddddddddddddddddddd', name: 'Hinge Delta', role: 'owner' },
      ];
      renderLibrary();

      expect(screen.getByRole('link', { name: 'Open Gearbox Alpha' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Open Bracket Beta' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open Hinge Delta' })).toBeInTheDocument();
      /* Both: the Tau Cloud glyph, once. */
      expect(screen.getAllByText('Also on Tau Cloud')).toHaveLength(1);
      expect(screen.getByText('Backed up on Tau Cloud. This device does not have it yet.')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'From Tau Cloud' })).toBeNull();
    });

    it('should mark each row local, both or Tau Cloud only', () => {
      mockCookieValues = { [cookieName.projectViewMode]: 'table' };
      cloudListing.current = [
        { id: 'proj_aaaaaaaaaaaaaaaaaaaaa', name: 'Gearbox Alpha', role: 'owner' },
        { id: 'proj_ddddddddddddddddddddd', name: 'Hinge Delta', role: 'owner' },
      ];
      renderLibrary();

      expect(screen.getByRole('row', { name: /Gearbox Alpha/u })).toHaveTextContent('Also on Tau Cloud');
      expect(screen.getByRole('row', { name: /Bracket Beta/u })).not.toHaveTextContent('Also on Tau Cloud');
      const cloudOnly = screen.getByRole('row', { name: /Hinge Delta/u });
      expect(cloudOnly).toHaveTextContent('Backed up on Tau Cloud. This device does not have it yet.');
      expect(within(cloudOnly).getByRole('button', { name: 'Open Hinge Delta' })).toBeInTheDocument();
    });

    it('should never offer a project in this device’s Trash as Tau Cloud’s alone', () => {
      mockTrashedProjects = [
        { ...makeProject('proj_ddddddddddddddddddddd', 'Hinge Delta', '/hinge-delta'), deletedAt: 5 },
      ];
      cloudListing.current = [{ id: 'proj_ddddddddddddddddddddd', name: 'Hinge Delta', role: 'owner' }];
      renderLibrary();

      expect(screen.queryByRole('button', { name: 'Open Hinge Delta' })).toBeNull();
      expect(screen.queryByText('Hinge Delta')).toBeNull();
    });

    it('should open a Tau-Cloud-only project by cloning it under the remote’s id', async () => {
      cloudListing.current = [{ id: 'proj_ddddddddddddddddddddd', name: 'Hinge Delta', role: 'owner' }];
      renderLibrary();

      fireEvent.click(screen.getByRole('button', { name: 'Open Hinge Delta' }));

      await waitFor(() => {
        expect(mockOpenCloudProject).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'proj_ddddddddddddddddddddd', name: 'Hinge Delta' }),
        );
      });
    });

    it('should say it is opening, and be busy, while the clone runs', async () => {
      let finish: () => void = () => undefined;
      mockOpenCloudProject.mockImplementationOnce(
        async () =>
          new Promise<undefined>((resolve) => {
            finish = () => {
              resolve(undefined);
            };
          }),
      );
      cloudListing.current = [{ id: 'proj_ddddddddddddddddddddd', name: 'Hinge Delta', role: 'owner' }];
      renderLibrary();

      fireEvent.click(screen.getByRole('button', { name: 'Open Hinge Delta' }));

      const opening = await screen.findByRole('button', { name: 'Opening… Hinge Delta' });
      expect(opening).toHaveAttribute('aria-busy', 'true');
      expect(opening).toBeDisabled();
      finish();
      expect(await screen.findByRole('button', { name: 'Open Hinge Delta' })).toHaveAttribute('aria-busy', 'false');
    });

    it('should say whose a shared Tau-Cloud-only project is before it is opened', () => {
      cloudListing.current = [{ id: 'proj_ddddddddddddddddddddd', name: 'Reference Jig', role: 'read' }];
      renderLibrary();

      mockCookieValues = { [cookieName.projectViewMode]: 'table' };
      cloudListing.current = [{ id: 'proj_ddddddddddddddddddddd', name: 'Reference Jig', role: 'read' }];
      renderLibrary();

      const card = screen.getByRole('row', { name: /Reference Jig/u });
      expect(card).toHaveTextContent('Can view');
      expect(card).toHaveTextContent('Shared with you. You can open it but not change it.');
    });

    it('should show a Tau-Cloud-only project instead of the empty state when this device has none', () => {
      mockUseProjectsResult = { ...createUseProjectsResult(), projects: [] };
      cloudListing.current = [{ id: 'proj_ddddddddddddddddddddd', name: 'Hinge Delta', role: 'owner' }];
      renderLibrary();

      expect(screen.getByRole('button', { name: 'Open Hinge Delta' })).toBeInTheDocument();
      expect(screen.queryByText('No projects yet')).toBeNull();
    });

    it('should leave Tau-Cloud-only projects out of the table’s selection', () => {
      mockCookieValues = { [cookieName.projectViewMode]: 'table' };
      cloudListing.current = [{ id: 'proj_ddddddddddddddddddddd', name: 'Hinge Delta', role: 'owner' }];
      renderLibrary();

      /* Two local rows can be selected; the Tau Cloud row has nothing here to trash. */
      expect(screen.getAllByRole('checkbox', { name: 'Select row' })).toHaveLength(2);
      expect(screen.getByRole('button', { name: 'Open Hinge Delta' })).toBeInTheDocument();
    });

    it('should select only this device’s projects on Select all', () => {
      mockCookieValues = { [cookieName.projectViewMode]: 'table' };
      cloudListing.current = [{ id: 'proj_ddddddddddddddddddddd', name: 'Hinge Delta', role: 'owner' }];
      renderLibrary();

      fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));

      expect(screen.getByRole('button', { name: 'Move to Trash 2' })).toBeInTheDocument();
      expect(within(screen.getByRole('row', { name: /Hinge Delta/u })).queryByRole('checkbox')).toBeNull();
    });

    it('counts completed bulk trash results before reporting partial success', async () => {
      mockCookieValues = { [cookieName.projectViewMode]: 'table' };
      const deleteProject = vi
        .fn(async () => true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      mockUseProjectsResult = { ...createUseProjectsResult(), deleteProject };
      renderLibrary();

      fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
      fireEvent.click(screen.getByRole('button', { name: 'Move to Trash 2' }));
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Move to Trash' }));

      await waitFor(() => {
        expect(deleteProject).toHaveBeenCalledTimes(2);
        expect(mockToastWarning).toHaveBeenCalledWith('Moved 1 project to Trash; 1 failed');
      });
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });

  it('should render the projects heading and every project from useProjects', () => {
    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectLibrary />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByText('Gearbox Alpha')).toBeInTheDocument();
    expect(screen.getByText('Bracket Beta')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Location: Home in this browser')).toHaveLength(2);
    expect(screen.getByText('gearbox-alpha')).toBeInTheDocument();
    expect(screen.getByText('bracket-beta')).toBeInTheDocument();
  });

  it('keeps same-named projects distinct with their directory slug', () => {
    mockUseProjectsResult = {
      ...createUseProjectsResult(),
      // Same display name — only the slug tells the two rows apart (F5).
      projects: [
        makeProject('proj_aaaaaaaaaaaaaaaaaaaaa', 'Gearbox Alpha', '/gearbox-alpha'),
        makeProject('proj_ccccccccccccccccccccc', 'Gearbox Alpha', '/gearbox-alpha-1'),
      ],
    };
    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectLibrary />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Gearbox Alpha')).toHaveLength(2);
    expect(screen.getByText('gearbox-alpha')).toBeInTheDocument();
    expect(screen.getByText('gearbox-alpha-1')).toBeInTheDocument();
  });

  it('shows project recovery without hiding usable projects or offering adoption', () => {
    mockUseProjectsResult = {
      ...createUseProjectsResult(),
      recoveries: [
        {
          operationId: 'req_recovery',
          projectId: 'proj_recovery',
          kind: 'create',
          storage: { backend: 'opfs', providerBasePath: '/recovery' },
          status: 'recovering',
        },
      ],
    };

    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectLibrary />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Tau is finishing this project.')).toBeInTheDocument();
    expect(screen.getByText('Gearbox Alpha')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adopt' })).not.toBeInTheDocument();
  });

  it('names each conflict honestly instead of calling every block a duplicate', () => {
    const locator = (name: string) =>
      ({
        backend: 'webaccess',
        storageRootKey: 'webaccess:wsp_alpha',
        relativeDirectory: `/${name}`,
        workspaceId: 'wsp_alpha',
      }) as const;
    mockUseProjectsResult = {
      ...createUseProjectsResult(),
      conflicts: [
        {
          status: 'invalid',
          locator: locator('unreadable'),
          issue: { code: 'manifest-unreadable', message: 'storage unavailable' },
        },
        {
          status: 'invalid',
          locator: locator('broken'),
          issue: { code: 'manifest-invalid-json', message: 'bad json' },
        },
        {
          status: 'route-blocked',
          manifest: projectToManifest({
            id: 'proj_ccccccccccccccccccccc',
            name: 'Blocked Project',
            description: '',
            tags: [],
            assets: { main: { entryPath: 'main.ts' } },
          }),
          locator: locator('blocked'),
        },
      ],
    };

    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectLibrary />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('This project directory could not be read.')).toBeInTheDocument();
    expect(screen.getByText('The tau.json manifest is invalid and was not opened.')).toBeInTheDocument();
    expect(
      screen.getByText('This project’s workspace is not connected. Reconnect the folder to open it.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('This copied project shares an identity with another directory.'),
    ).not.toBeInTheDocument();
  });

  it('groups eligible historical bindings behind an explicit metadata-only repair confirmation', async () => {
    const locator = {
      backend: 'webaccess',
      storageRootKey: 'webaccess:wsp_canonical',
      relativeDirectory: 'blocked',
      workspaceId: 'wsp_canonical',
    } as const;
    mockUseProjectsResult = {
      ...createUseProjectsResult(),
      conflicts: [
        {
          status: 'route-blocked',
          manifest: projectToManifest({
            id: 'proj_ccccccccccccccccccccc',
            name: 'Blocked Project',
            description: '',
            tags: [],
            assets: { main: { entryPath: 'main.ts' } },
          }),
          locator,
        },
      ],
      workspaceBindingRepairs: [{ canonicalWorkspaceId: 'wsp_canonical', workspaceName: 'Workshop', projectCount: 47 }],
    };

    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectLibrary />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('47 projects are linked to previous workspace identities.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Repair links' }));
    expect(screen.getByText(/updates browser routing metadata only/u)).toBeInTheDocument();
    expect(screen.getByText(/will not move or modify folder contents/u)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Repair 47 projects' }));

    await waitFor(() => {
      expect(mockRepairWorkspaceBindings).toHaveBeenCalledExactlyOnceWith('wsp_canonical');
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('Repaired 47 project links');
  });

  it('renders a terminal retryable load error instead of an empty-library state', () => {
    const retry = vi.fn();
    mockUseProjectsResult = {
      ...createUseProjectsResult(),
      projects: [],
      error: new Error('discovery failed'),
      retry,
    };

    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectLibrary />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Projects could not be loaded')).toBeInTheDocument();
    expect(screen.queryByText('No projects yet')).not.toBeInTheDocument();
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('mounts the shared creation composer for an empty project library', () => {
    mockUseProjectsResult = { ...createUseProjectsResult(), projects: [] };

    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectLibrary />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('new-project-chat-composer')).toBeInTheDocument();
  });

  it('shows the project skeleton instead of the empty state while the listing is loading', () => {
    mockUseProjectsResult = { ...createUseProjectsResult(), projects: [], isLoading: true };

    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectLibrary />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('status', { name: 'Loading projects' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('No projects yet')).not.toBeInTheDocument();
  });

  it('names the directory a failed recovery is stuck on and offers to discard it', async () => {
    mockUseProjectsResult = {
      ...createUseProjectsResult(),
      recoveries: [
        {
          operationId: 'req_recovery',
          projectId: 'proj_recovery',
          kind: 'create',
          storage: { backend: 'opfs', providerBasePath: '/gearbox-alpha-2' },
          status: 'failed',
          reason: 'workspace-unavailable',
        },
      ],
    };

    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectLibrary />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('gearbox-alpha-2')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Discard' }).click();
    await vi.waitFor(() => {
      expect(mockDiscardRecovery).toHaveBeenCalledExactlyOnceWith('req_recovery');
    });
  });

  // R11 — adoption-required used to render an unactionable banner.
  it('adopts an identity-less project directory on request', async () => {
    const locator = {
      backend: 'indexeddb',
      storageRootKey: 'indexeddb:tau-',
      relativeDirectory: '/dropped',
    } as const;
    mockUseProjectsResult = {
      ...createUseProjectsResult(),
      conflicts: [
        {
          status: 'adoption-required',
          manifest: {
            $schema: projectManifestSchemaUrl,
            name: 'Dropped Project',
            description: '',
            tags: [],
            assets: { main: { entryPath: 'main.ts' } },
          },
          locator,
          issue: { code: 'manifest-invalid', issues: [] },
        },
      ],
    };

    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectLibrary />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('This project needs a Tau identity before it can be opened.')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Adopt' }).click();

    await vi.waitFor(() => {
      expect(mockUseProjectsResult.adoptProject).toHaveBeenCalledExactlyOnceWith(locator);
    });
  });

  it('lets a person choose which copied folder a project opens from', async () => {
    const locator = {
      backend: 'webaccess',
      storageRootKey: 'webaccess:wsp_alpha',
      relativeDirectory: 'relief-copy',
      workspaceId: 'wsp_alpha',
    } as const;
    const manifest = projectToManifest({
      id: 'proj_ccccccccccccccccccccc',
      name: 'Relief',
      description: '',
      tags: [],
      assets: { main: { entryPath: 'main.cs' } },
    });
    mockUseProjectsResult = {
      ...createUseProjectsResult(),
      conflicts: [{ status: 'duplicate-id', manifest, locator }],
    };

    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectLibrary />
        </TooltipProvider>
      </MemoryRouter>,
    );
    screen.getByRole('button', { name: 'Use this folder' }).click();

    await vi.waitFor(() => {
      expect(mockUseProjectsResult.chooseProjectDirectory).toHaveBeenCalledExactlyOnceWith(locator, manifest.id);
    });
  });

  it('names a degraded manifest’s exact defect and repairs it on request', async () => {
    const degraded: ProjectListItem = {
      ...mockProjects[0]!,
      manifestIssue: {
        code: 'manifest-invalid',
        issues: [
          { code: 'unrecognized_keys', keys: ['second'], path: ['assets'], message: 'Unrecognized key: "second"' },
        ],
      },
    };
    mockUseProjectsResult = { ...createUseProjectsResult(), projects: [degraded, mockProjects[1]!] };

    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectLibrary />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('assets: Unrecognized key: "second"')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Repair' }).click();

    await vi.waitFor(() => {
      expect(mockUseProjectsResult.repairProject).toHaveBeenCalledExactlyOnceWith(degraded.id);
    });
  });

  it('names what quarantines a manifest it cannot read as this project', () => {
    mockUseProjectsResult = {
      ...createUseProjectsResult(),
      conflicts: [
        {
          status: 'invalid',
          locator: {
            backend: 'webaccess',
            storageRootKey: 'webaccess:wsp_alpha',
            relativeDirectory: 'from-the-future',
            workspaceId: 'wsp_alpha',
          },
          issue: {
            code: 'manifest-unknown-schema',
            found: 'https://tau.new/schemas/tau-schema-v2.json',
            supported: projectManifestSchemaUrl,
          },
        },
      ],
    };

    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectLibrary />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(
      screen.getByText('tau.json uses a format this version of Tau does not support. Update Tau to open it.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('$schema "https://tau.new/schemas/tau-schema-v2.json" is not supported by this version of Tau.'),
    ).toBeInTheDocument();
  });

  it('reports the trash outcome instead of assuming success', async () => {
    const deleteProject = vi.fn(async () => false);
    mockUseProjectsResult = { ...createUseProjectsResult(), deleteProject };

    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectLibrary />
        </TooltipProvider>
      </MemoryRouter>,
    );
    screen.getByRole('button', { name: `Trash ${mockProjects[0]!.name}` }).click();

    await vi.waitFor(() => {
      expect(deleteProject).toHaveBeenCalledWith(mockProjects[0]!.id);
      expect(mockToastError).toHaveBeenCalled();
    });
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('paginates by the remembered page size', () => {
    mockCookieValues = { 'project-page-size': 50 };
    mockUseProjectsResult = {
      ...createUseProjectsResult(),
      projects: Array.from({ length: 60 }, (_, index) =>
        makeProject(`proj_${String(index).padStart(21, 'p')}`, `Project ${index}`, `/project-${index}`),
      ),
    };

    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectLibrary />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Location: Home in this browser')).toHaveLength(50);
  });

  it('remembers a newly chosen page size', async () => {
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.scrollIntoView = vi.fn();
    mockUseProjectsResult = {
      ...createUseProjectsResult(),
      projects: Array.from({ length: 60 }, (_, index) =>
        makeProject(`proj_${String(index).padStart(21, 'p')}`, `Project ${index}`, `/project-${index}`),
      ),
    };

    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectLibrary />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Items per page' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: '100' }));

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    });
    expect(mockCookieValues['project-page-size']).toBe(100);
  });

  /*
   * D1: the Trash is a place. `/projects?trash=1` is the address the trashed
   * project's notice sends people to, so it has to render the trashed view on
   * arrival rather than after a click nobody knows to make.
   */
  describe('the trashed view lives in the URL', () => {
    const renderAt = (entry: string): { search: () => string } => {
      let currentSearch = '';
      const SearchProbe = (): undefined => {
        currentSearch = useLocation().search;
        return undefined;
      };
      render(
        <MemoryRouter initialEntries={[entry]}>
          <TooltipProvider>
            <ProjectLibrary />
            <SearchProbe />
          </TooltipProvider>
        </MemoryRouter>,
      );
      return { search: () => currentSearch };
    };

    it('lists trashed projects on arrival at /projects?trash=1', () => {
      useProjectsOptions.length = 0;
      renderAt('/projects?trash=1');

      expect(useProjectsOptions.at(-1)).toEqual({ includeDeleted: true });
    });

    it('does not offer permanent deletion while a run cannot be verified quiescent', async () => {
      mockTrashedProjects = [{ ...mockProjects[0]!, deletedAt: 1 }];
      const verifyProjectQuiescent = vi.fn(async () => {
        throw new Error('Restore and open this project to verify its chats before deleting it.');
      });
      mockUseProjectsResult = { ...createUseProjectsResult(), projects: [mockProjects[1]!], verifyProjectQuiescent };
      renderAt('/projects?trash=1');
      screen.getByRole('button', { name: `Delete permanently ${mockProjects[0]!.name}` }).click();
      await waitFor(() => {
        expect(verifyProjectQuiescent).toHaveBeenCalledWith(mockProjects[0]!.id);
        expect(mockToastError).toHaveBeenCalledWith(`Could not delete ${mockProjects[0]!.name} permanently`, {
          description: 'Restore and open this project to verify its chats before deleting it.',
        });
      });
      expect(screen.queryByRole('heading', { name: 'Delete this project permanently?' })).not.toBeInTheDocument();
      expect(mockUseProjectsResult.permanentlyDeleteProject).not.toHaveBeenCalled();
    });

    it('hides trashed projects at /projects', () => {
      useProjectsOptions.length = 0;
      renderAt('/projects');

      expect(useProjectsOptions.at(-1)).toEqual({ includeDeleted: false });
    });

    it('writes and clears the parameter from the Settings checkbox', async () => {
      Element.prototype.hasPointerCapture = vi.fn(() => false);
      Element.prototype.scrollIntoView = vi.fn();
      useProjectsOptions.length = 0;
      const route = renderAt('/projects?page=2');

      fireEvent.keyDown(screen.getByRole('button', { name: 'Settings' }), { key: 'Enter' });
      fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Show trashed projects' }));

      await waitFor(() => {
        expect(useProjectsOptions.at(-1)).toEqual({ includeDeleted: true });
      });
      /* The write merges: an unrelated parameter is not collateral damage. */
      expect(route.search()).toContain('trash=1');
      expect(route.search()).toContain('page=2');

      fireEvent.keyDown(screen.getByRole('button', { name: 'Settings' }), { key: 'Enter' });
      fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Show trashed projects' }));

      await waitFor(() => {
        expect(useProjectsOptions.at(-1)).toEqual({ includeDeleted: false });
      });
      /* The fallback deletes the parameter, so the default view has a clean URL. */
      expect(route.search()).not.toContain('trash');
    });
  });
});
