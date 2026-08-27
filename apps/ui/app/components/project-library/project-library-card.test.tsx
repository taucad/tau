import { render, screen } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { projectToManifest } from '@taucad/types';
import { ProjectLibraryCard } from '#components/project-library/project-library.js';
import type { ProjectActions } from '#components/project-library/project-library.js';
import { TooltipProvider } from '#components/ui/tooltip.js';
import type { ProjectListItem } from '#types/project.types.js';

const mockProject: ProjectListItem = {
  ...projectToManifest({
    id: 'proj_aaaaaaaaaaaaaaaaaaaaa',
    name: 'Library Preview Demo',
    description: 'Test project',
    tags: [],
    assets: { main: { entryPath: 'main.scad' } },
  }),
  lastActivityAt: 0,
  locator: { backend: 'indexeddb', storageRootKey: 'indexeddb:tau-', relativeDirectory: '/library' },
  slugs: { workspaceSlug: 'home', projectSlug: 'library' },
};

const mockActions: ProjectActions = {
  handleDelete: vi.fn(),
  handlePermanentlyDelete: vi.fn(),
  handleDuplicate: vi.fn(async () => undefined),
  handleRename: vi.fn(async () => undefined),
  handleRestore: vi.fn(),
};
let providerMountCount = 0;

vi.mock('#components/inline-text-editor.js', () => ({
  InlineTextEditor: ({ value }: { readonly value: string }) => <button type='button'>Edit {value}</button>,
}));

vi.mock('#components/project-library/project-action-dropdown.js', () => ({
  ProjectActionDropdown: () => <button type='button'>Actions</button>,
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    client: { readFile: vi.fn().mockRejectedValue(new Error('not found')) },
    contentService: undefined,
  }),
  SharedWorkerGate: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='shared-worker-gate'>{children}</div>
  ),
  HomeFileManagerProvider: ({
    children,
    projectId,
    rootDirectory,
  }: {
    readonly children: React.ReactNode;
    readonly projectId: string;
    readonly rootDirectory: string;
  }) => (
    <FileManagerProbe projectId={projectId} rootDirectory={rootDirectory}>
      {children}
    </FileManagerProbe>
  ),
}));

function FileManagerProbe({
  children,
  projectId,
  rootDirectory,
}: React.PropsWithChildren<{ projectId: string; rootDirectory: string }>): React.JSX.Element {
  const [mountToken] = useState(() => ++providerMountCount);
  return (
    <div
      data-testid='file-manager-provider'
      data-project-id={projectId}
      data-root-directory={rootDirectory}
      data-mount-token={mountToken}
    >
      {children}
    </div>
  );
}

vi.mock('#hooks/use-cad-preview.js', () => ({
  CadPreviewProvider: ({
    children,
    projectId,
    mainFile,
    files,
    isEnabled,
  }: {
    readonly children: React.ReactNode;
    readonly projectId: string;
    readonly mainFile: string;
    readonly files?: Record<string, { content: Uint8Array<ArrayBuffer> }>;
    readonly isEnabled?: boolean;
  }) => (
    <div
      data-testid='cad-preview-provider'
      data-project-id={projectId}
      data-main-file={mainFile}
      data-has-files={files === undefined ? 'false' : 'true'}
      data-is-enabled={isEnabled === undefined ? 'true' : String(isEnabled)}
    >
      {children}
    </div>
  ),
}));

vi.mock('#components/cad-preview.js', () => ({
  CadPreviewViewer: () => <div data-testid='cad-preview-viewer' />,
}));

function LocationProbe(): React.JSX.Element {
  const location = useLocation();
  return <output data-testid='location'>{location.pathname}</output>;
}

function renderCard(
  properties: {
    readonly project?: ProjectListItem;
    readonly isSelected?: boolean;
    readonly onSelect?: () => void;
  } = {},
): RenderResult {
  const { project = mockProject, ...cardProperties } = properties;
  return render(
    <MemoryRouter initialEntries={['/projects']}>
      <TooltipProvider>
        <ProjectLibraryCard project={project} actions={mockActions} {...cardProperties} />
      </TooltipProvider>
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('ProjectLibraryCard live preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerMountCount = 0;
  });

  it('should render the static thumbnail and no project-scoped FM until preview is toggled', () => {
    renderCard();

    expect(screen.getByRole('img', { name: 'Library Preview Demo' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    const cardLink = screen.getByRole('link', { name: 'Open Library Preview Demo' });
    expect(cardLink).toHaveAttribute('href', '/w/home/library');
    expect(cardLink.parentElement).toHaveClass('hover:border-primary/60');
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.queryByText('Test project')).not.toBeInTheDocument();
    expect(screen.queryByText('Mechanical')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shared-worker-gate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('file-manager-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cad-preview-provider')).not.toBeInTheDocument();
  });

  it('shows the Home and project slugs in the location row', () => {
    renderCard();

    const location = screen.getByLabelText('Location: Home in this browser');
    expect(location).toHaveTextContent('home/library');
    expect(location).toHaveClass('w-fit', 'max-w-full');
    expect(location.querySelector('span')).not.toHaveClass('font-mono');
    expect(location.querySelector('svg')).toHaveClass('size-3');
  });

  it('shows the workspace and project slugs for connected folders', () => {
    renderCard({
      project: {
        ...mockProject,
        locator: {
          backend: 'webaccess',
          storageRootKey: 'webaccess:wsp_workshop',
          relativeDirectory: '/library',
          workspaceId: 'wsp_workshop',
        },
        slugs: { workspaceSlug: 'workshop', projectSlug: 'library' },
        workspaceName: 'Workshop',
      },
    });

    const location = screen.getByLabelText('Location: Workshop on your disk');
    expect(location).toHaveTextContent('workshop/library');
    expect(location.querySelector('span')).not.toHaveClass('font-mono');
    expect(location.querySelector('svg')).toHaveClass('size-3');
  });

  it('should mount project-scoped FM and Case A CadPreviewProvider when preview is toggled on', async () => {
    renderCard();

    await userEvent.click(screen.getByRole('button', { name: 'Preview model' }));

    expect(screen.queryByRole('img', { name: 'Library Preview Demo' })).not.toBeInTheDocument();
    expect(screen.getByTestId('shared-worker-gate')).toBeInTheDocument();

    const fm = screen.getByTestId('file-manager-provider');
    expect(fm).toHaveAttribute('data-project-id', mockProject.id);
    expect(fm).toHaveAttribute('data-root-directory', `/projects/${mockProject.id}`);

    const preview = screen.getByTestId('cad-preview-provider');
    expect(preview).toHaveAttribute('data-project-id', mockProject.id);
    expect(preview).toHaveAttribute('data-main-file', 'main.scad');
    expect(preview).toHaveAttribute('data-has-files', 'false');
    expect(screen.getByTestId('cad-preview-viewer')).toBeInTheDocument();
  });

  it('should unmount the preview subtree when preview is toggled off', async () => {
    renderCard();

    const previewToggle = screen.getByRole('button', { name: 'Preview model' });
    await userEvent.click(previewToggle);
    expect(screen.getByTestId('file-manager-provider')).toBeInTheDocument();

    await userEvent.click(previewToggle);
    expect(screen.getByRole('img', { name: 'Library Preview Demo' })).toBeInTheDocument();
    expect(screen.queryByTestId('file-manager-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cad-preview-provider')).not.toBeInTheDocument();
  });

  it('should remount the scoped file manager when an open card is retargeted to another project', async () => {
    const view = renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'Preview model' }));
    const firstToken = screen.getByTestId('file-manager-provider').dataset['mountToken'];
    const nextProject: ProjectListItem = {
      ...mockProject,
      id: 'proj_bbbbbbbbbbbbbbbbbbbbb',
      name: 'Second project',
    };

    view.rerender(
      <MemoryRouter initialEntries={['/projects']}>
        <TooltipProvider>
          <ProjectLibraryCard project={nextProject} actions={mockActions} />
        </TooltipProvider>
        <LocationProbe />
      </MemoryRouter>,
    );

    const provider = screen.getByTestId('file-manager-provider');
    expect(provider).toHaveAttribute('data-project-id', nextProject.id);
    expect(provider.dataset['mountToken']).not.toBe(firstToken);
  });

  it('should keep preview, selection, editing, and action controls independent from card navigation', async () => {
    const onSelect = vi.fn();
    renderCard({ onSelect });

    await userEvent.click(screen.getByRole('button', { name: 'Preview model' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/projects');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Library Preview Demo' }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.getByTestId('location')).toHaveTextContent('/projects');

    await userEvent.click(screen.getByRole('button', { name: 'Edit Library Preview Demo' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/projects');

    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/projects');
  });
});
