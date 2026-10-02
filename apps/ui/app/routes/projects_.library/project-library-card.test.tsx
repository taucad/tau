import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Project } from '@taucad/types';
import { ProjectLibraryCard } from '#routes/projects_.library/route.js';
import type { ProjectActions } from '#routes/projects_.library/route.js';

const mockProject: Project = {
  id: 'proj_library_preview',
  name: 'Library Preview Demo',
  description: 'Test project',
  author: { name: 'Test', avatar: '' },
  tags: [],
  thumbnail: '/placeholder.svg',
  createdAt: 0,
  updatedAt: 0,
  assets: {
    mechanical: { main: 'main.scad', parameters: {} },
  },
};

const mockActions: ProjectActions = {
  handleDelete: vi.fn(),
  handleDuplicate: vi.fn(async () => undefined),
  handleRename: vi.fn(async () => undefined),
  handleRestore: vi.fn(),
};

vi.mock('#components/inline-text-editor.js', () => ({
  InlineTextEditor: ({ value }: { readonly value: string }) => <span>{value}</span>,
}));

vi.mock('#routes/projects_.library/project-action-dropdown.js', () => ({
  ProjectActionDropdown: () => <button type='button'>Actions</button>,
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  SharedWorkerGate: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='shared-worker-gate'>{children}</div>
  ),
  FileManagerProvider: ({
    children,
    projectId,
    rootDirectory,
    initialBackend,
  }: {
    readonly children: React.ReactNode;
    readonly projectId: string;
    readonly rootDirectory: string;
    readonly initialBackend: string;
  }) => (
    <div
      data-testid='file-manager-provider'
      data-project-id={projectId}
      data-root-directory={rootDirectory}
      data-initial-backend={initialBackend}
    >
      {children}
    </div>
  ),
}));

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

describe('ProjectLibraryCard live preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the static thumbnail and no project-scoped FM until preview is toggled', () => {
    render(
      <MemoryRouter>
        <ProjectLibraryCard project={mockProject} actions={mockActions} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: 'Library Preview Demo' })).toBeInTheDocument();
    expect(screen.queryByTestId('shared-worker-gate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('file-manager-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cad-preview-provider')).not.toBeInTheDocument();
  });

  it('mounts project-scoped FM and Case A CadPreviewProvider when preview is toggled on', async () => {
    render(
      <MemoryRouter>
        <ProjectLibraryCard project={mockProject} actions={mockActions} />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Preview model' }));

    expect(screen.queryByRole('img', { name: 'Library Preview Demo' })).not.toBeInTheDocument();
    expect(screen.getByTestId('shared-worker-gate')).toBeInTheDocument();

    const fm = screen.getByTestId('file-manager-provider');
    expect(fm).toHaveAttribute('data-project-id', 'proj_library_preview');
    expect(fm).toHaveAttribute('data-root-directory', '/projects/proj_library_preview');
    expect(fm).toHaveAttribute('data-initial-backend', 'indexeddb');

    const preview = screen.getByTestId('cad-preview-provider');
    expect(preview).toHaveAttribute('data-project-id', 'proj_library_preview');
    expect(preview).toHaveAttribute('data-main-file', 'main.scad');
    expect(preview).toHaveAttribute('data-has-files', 'false');
    expect(screen.getByTestId('cad-preview-viewer')).toBeInTheDocument();
  });

  it('unmounts the preview subtree when preview is toggled off', async () => {
    render(
      <MemoryRouter>
        <ProjectLibraryCard project={mockProject} actions={mockActions} />
      </MemoryRouter>,
    );

    const previewToggle = screen.getByRole('button', { name: 'Preview model' });
    await userEvent.click(previewToggle);
    expect(screen.getByTestId('file-manager-provider')).toBeInTheDocument();

    await userEvent.click(previewToggle);
    expect(screen.getByRole('img', { name: 'Library Preview Demo' })).toBeInTheDocument();
    expect(screen.queryByTestId('file-manager-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cad-preview-provider')).not.toBeInTheDocument();
  });
});
