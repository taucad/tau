import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuiltinProjectCardModel } from '#constants/project-examples.js';
import { warehouseProjects } from '#constants/warehouse-parts.js';
import { loadBuiltinProjectFiles } from '#constants/project-examples.js';
import { CommunityProjectGrid } from '#components/project-grid.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

const { createProjectMock, presentLocationErrorMock, toastMock } = vi.hoisted(() => ({
  createProjectMock: vi.fn(),
  presentLocationErrorMock: vi.fn(() => false),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('#hooks/use-project-creation-location.js', () => ({
  useProjectCreationLocation: () => ({
    phase: 'ready',
    value: { kind: 'home' },
    canCreate: true,
    shouldShowPicker: false,
    hasWebAccessCapability: false,
    refresh: vi.fn(),
  }),
}));

vi.mock('#components/filesystem/workspace-selector.js', () => ({
  WorkspaceSelector: () => <p>Home in this browser</p>,
}));

vi.mock('#components/ui/sonner.js', () => ({ toast: toastMock }));

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({ createProject: createProjectMock }),
}));

vi.mock('#hooks/use-project-creation-location-error.js', () => ({
  useProjectCreationLocationError: () => presentLocationErrorMock,
}));

vi.mock('#hooks/use-project-file-url.js', () => ({
  useThumbnailSource: () => '/community-thumbnail.png',
}));

vi.mock('#hooks/use-cad-preview.js', () => ({
  CadPreviewProvider: ({
    children,
    projectId,
    mainFile,
    files,
  }: {
    readonly children: React.ReactNode;
    readonly projectId: string;
    readonly mainFile: string;
    readonly files: Record<string, { content: Uint8Array<ArrayBuffer> }>;
  }) => (
    <div
      data-testid='cad-preview-provider'
      data-project-id={projectId}
      data-main-file={mainFile}
      data-file-count={Object.keys(files).length}
    >
      {children}
    </div>
  ),
}));

vi.mock('#components/cad-preview.js', () => ({
  CadPreviewViewer: () => <div data-testid='cad-preview-viewer' />,
}));

const mainFile = 'main.ts';
const files = {
  [mainFile]: { content: new TextEncoder().encode('export default {};') },
  'tau.json': { content: new TextEncoder().encode('{"name":"Community Demo"}') },
};

const project: BuiltinProjectCardModel = {
  locator: 'replicad.community-demo',
  kernel: 'replicad',
  id: 'community-project',
  name: 'Community Demo',
  description: 'Description retained for Remix payload only',
  tags: ['community'],
  thumbnail: '/thumbnail.png',
  assets: { main: { entryPath: mainFile } },
  fileAssets: [
    { path: mainFile, load: async () => files[mainFile].content },
    { path: 'tau.json', load: async () => files['tau.json'].content },
  ],
};

function LocationProbe(): React.JSX.Element {
  const location = useLocation();
  return <output data-testid='location'>{location.pathname}</output>;
}

const secondProject: BuiltinProjectCardModel = {
  ...project,
  locator: 'openscad.second-demo',
  kernel: 'openscad',
  id: 'second-project',
  name: 'Second Demo',
};

function renderGrid(properties: Partial<React.ComponentProps<typeof CommunityProjectGrid>> = {}): void {
  render(
    <MemoryRouter initialEntries={['/community']}>
      <TooltipProvider>
        <CommunityProjectGrid projects={[project]} {...properties} />
      </TooltipProvider>
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('CommunityProjectGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const path = url.endsWith('tau.json') ? 'tau.json' : mainFile;
        return new Response(files[path].content);
      }),
    );
    presentLocationErrorMock.mockReturnValue(false);
    createProjectMock.mockResolvedValue({
      id: 'remixed-project',
      slugs: { workspaceSlug: 'tau-workspace', projectSlug: 'remixed-project' },
    });
  });

  it('should remix a warehouse part with all editable assets through the existing creation location', async () => {
    const part = warehouseProjects[0];
    if (!part) {
      throw new Error('Expected a warehouse part');
    }
    const expectedFiles = await loadBuiltinProjectFiles({ project: part });
    renderGrid({ projects: [part] });
    expect(createProjectMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: `Remix ${part.name}` }));
    await userEvent.click(screen.getByRole('button', { name: 'Create remix' }));
    await waitFor(() => {
      expect(createProjectMock).toHaveBeenCalledExactlyOnceWith({
        project: {
          name: `${part.name} (fork)`,
          description: part.description,
          tags: [...part.tags],
          assets: part.assets,
        },
        files: expectedFiles,
        location: { kind: 'home' },
      });
    });
  });

  it('should render a list of cards named by an Open link, an h2 title and the kernel only', () => {
    renderGrid();

    expect(screen.getByRole('list')).toHaveClass('grid', 'grid-flow-dense');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    const cardLink = screen.getByRole('link', { name: 'Open Community Demo' });
    expect(cardLink).toHaveAttribute('href', '/s/builtin~replicad.community-demo');
    expect(cardLink.parentElement).toHaveClass('hover:border-foreground/30');
    expect(screen.getByRole('heading', { level: 2, name: 'Community Demo' })).toBeInTheDocument();
    expect(screen.getByText('Replicad')).toBeInTheDocument();
    expect(screen.queryByText('Tau Team')).not.toBeInTheDocument();
    expect(screen.queryByText('Featured')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remix Community Demo' })).toBeInTheDocument();
    expect(screen.queryByText('Description retained for Remix payload only')).not.toBeInTheDocument();
  });

  it('should span the featured card over two columns with a badge and its description', () => {
    renderGrid({ projects: [project, secondProject], featuredLocator: project.locator });

    const [featured, plain] = screen.getAllByRole('listitem');
    expect(featured).toHaveClass('col-span-2', 'lg:row-span-2');
    expect(plain).not.toHaveClass('col-span-2');
    expect(screen.getByText('Featured')).toBeInTheDocument();
    expect(screen.getByText('Description retained for Remix payload only')).toBeInTheDocument();
    expect(screen.getByText('OpenSCAD')).toBeInTheDocument();
  });

  it('should draw only the featured card with its thinner-edged featured thumbnail', () => {
    const withFeaturedThumbnail = { featuredThumbnail: '/thumbnail-featured.png' };
    renderGrid({
      projects: [
        { ...project, ...withFeaturedThumbnail },
        { ...secondProject, ...withFeaturedThumbnail },
      ],
      featuredLocator: project.locator,
    });

    const [featured, plain] = screen.getAllByRole('listitem');
    expect(featured?.querySelector('img')).toHaveAttribute('src', '/thumbnail-featured.png');
    expect(plain?.querySelector('img')).toHaveAttribute('src', '/thumbnail.png');
  });

  it('should cap the landing strip at its limit', () => {
    renderGrid({ projects: [project, secondProject], limit: 1 });

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'Open Second Demo' })).not.toBeInTheDocument();
  });

  it('should unmount the preview pipeline when its eye is toggled off', async () => {
    renderGrid();

    const previewToggle = screen.getByRole('button', { name: 'Preview model' });
    expect(screen.queryByTestId('cad-preview-provider')).not.toBeInTheDocument();

    await userEvent.click(previewToggle);
    const provider = await screen.findByTestId('cad-preview-provider');
    expect(provider).toHaveAttribute('data-project-id', 'community-project');
    expect(provider).toHaveAttribute('data-main-file', 'main.ts');
    expect(provider).toHaveAttribute('data-file-count', '2');
    expect(screen.getByTestId('location')).toHaveTextContent('/community');

    await userEvent.click(previewToggle);
    expect(screen.queryByTestId('cad-preview-provider')).not.toBeInTheDocument();
    expect(previewToggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('presentation')).toHaveAttribute('alt', '');
    expect(screen.getByTestId('location')).toHaveTextContent('/community');

    await userEvent.click(previewToggle);
    expect(await screen.findByTestId('cad-preview-provider')).toBeInTheDocument();
  });

  it('should keep one live preview: opening a second eye releases the first', async () => {
    renderGrid({ projects: [project, secondProject] });

    const [firstToggle, secondToggle] = screen.getAllByRole('button', { name: 'Preview model' });
    if (!firstToggle || !secondToggle) {
      throw new Error('Expected two preview toggles');
    }
    await userEvent.click(firstToggle);
    expect(await screen.findByTestId('cad-preview-provider')).toHaveAttribute('data-project-id', 'community-project');

    await userEvent.click(secondToggle);
    await waitFor(() => {
      expect(screen.getAllByTestId('cad-preview-provider')).toHaveLength(1);
    });
    expect(screen.getByTestId('cad-preview-provider')).toHaveAttribute('data-project-id', 'second-project');
    expect(firstToggle).toHaveAttribute('aria-pressed', 'false');
    expect(secondToggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('should tear down a live preview when its card scrolls out of view', async () => {
    let reportIntersection: ((isIntersecting: boolean) => void) | undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        public observe = vi.fn();
        public disconnect = vi.fn();

        public constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
          reportIntersection = (isIntersecting) => {
            callback([{ isIntersecting }]);
          };
        }
      },
    );
    renderGrid();

    await userEvent.click(screen.getByRole('button', { name: 'Preview model' }));
    expect(await screen.findByTestId('cad-preview-provider')).toBeInTheDocument();

    act(() => {
      reportIntersection?.(false);
    });

    expect(screen.queryByTestId('cad-preview-provider')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview model' })).toHaveAttribute('aria-pressed', 'false');
    vi.unstubAllGlobals();
  });

  it('should Remix through the example page flow: location dialog, fork suffix and toast', async () => {
    renderGrid();

    await userEvent.click(screen.getByRole('button', { name: 'Remix Community Demo' }));
    expect(createProjectMock).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Remix Community Demo' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create remix' }));

    expect(createProjectMock).toHaveBeenCalledWith({
      project: {
        name: 'Community Demo (fork)',
        description: 'Description retained for Remix payload only',
        tags: ['community'],
        assets: project.assets,
      },
      files,
      location: { kind: 'home' },
    });
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/w/tau-workspace/remixed-project');
    });
    expect(toastMock.success).toHaveBeenCalledWith('Remixed to your projects', { description: 'Community Demo' });
  });

  it('should keep the dialog and re-enable Remix after a creation-location failure', async () => {
    const error = new Error('disconnected');
    createProjectMock.mockRejectedValue(error);
    presentLocationErrorMock.mockReturnValue(true);
    renderGrid();

    await userEvent.click(screen.getByRole('button', { name: 'Remix Community Demo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create remix' }));

    await waitFor(() => {
      expect(presentLocationErrorMock).toHaveBeenCalledWith(error);
    });
    expect(screen.getByRole('button', { name: 'Create remix' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remix Community Demo', hidden: true })).toBeEnabled();
    expect(screen.getByTestId('location')).toHaveTextContent('/community');
  });

  it('should name the example when a remix fails for another reason', async () => {
    createProjectMock.mockRejectedValue(new Error('quota exceeded'));
    renderGrid();

    await userEvent.click(screen.getByRole('button', { name: 'Remix Community Demo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create remix' }));

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Could not remix Community Demo', { description: 'quota exceeded' });
    });
  });
});
