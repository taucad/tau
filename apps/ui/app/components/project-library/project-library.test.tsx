// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { projectManifestSchemaUrl, projectToManifest } from '@taucad/types';
import { ProjectLibrary } from '#components/project-library/project-library.js';
import { TooltipProvider } from '#components/ui/tooltip.js';
import type { ProjectListItem } from '#types/project.types.js';
import type { PendingProjectRecovery } from '#types/pending-project-operation.types.js';
import type { ProjectDiscoveryConflict } from '#hooks/use-project-manager.js';

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
  error: undefined as Error | undefined,
  retry: vi.fn(),
  deleteProject: vi.fn(async () => true),
  duplicateProject: vi.fn(),
  restoreProject: vi.fn(),
  permanentlyDeleteProject: vi.fn(),
  updateName: vi.fn(),
  adoptProject: vi.fn(async () => undefined),
});
let mockUseProjectsResult = createUseProjectsResult();

vi.mock('#hooks/use-projects.js', () => ({
  useProjects: () => mockUseProjectsResult,
}));

const { mockDiscardRecovery } = vi.hoisted(() => ({ mockDiscardRecovery: vi.fn(async () => undefined) }));
vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({
    createProject: vi.fn(),
    discardRecovery: mockDiscardRecovery,
  }),
}));

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));
vi.mock('#components/ui/sonner.js', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

vi.mock('#hooks/use-kernel.js', () => ({
  useKernel: () => ({ kernel: 'replicad', setKernel: vi.fn() }),
}));

vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: () => ['grid', vi.fn()],
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
    readonly actions: { readonly handleDelete: (project: ProjectListItem) => void };
  }) => (
    <button
      type='button'
      onClick={() => {
        actions.handleDelete(project);
      }}
    >
      {`Trash ${project.name}`}
    </button>
  ),
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    client: { readFile: vi.fn().mockRejectedValue(new Error('not found')) },
    contentService: undefined,
  }),
  SharedWorkerGate: ({ children }: { readonly children: React.ReactNode }): React.ReactNode => children,
  HomeFileManagerProvider: ({ children }: { readonly children: React.ReactNode }): React.ReactNode => children,
}));

vi.mock('#hooks/use-cad-preview.js', () => ({
  CadPreviewProvider: ({ children }: { readonly children: React.ReactNode }): React.ReactNode => children,
}));

vi.mock('#components/cad-preview.js', () => ({
  CadPreviewViewer: () => <div data-testid='cad-preview-viewer' />,
}));

describe('ProjectLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectsResult = createUseProjectsResult();
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
});
