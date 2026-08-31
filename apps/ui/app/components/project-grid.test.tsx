import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuiltinProjectCardModel } from '#constants/project-examples.js';
import { CommunityProjectGrid } from '#components/project-grid.js';
import { TooltipProvider } from '#components/ui/tooltip.js';

const { createProjectMock, presentLocationErrorMock } = vi.hoisted(() => ({
  createProjectMock: vi.fn(),
  presentLocationErrorMock: vi.fn(() => false),
}));

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
  author: { name: 'Tau Team', avatar: '/avatar.png' },
  tags: ['community'],
  thumbnail: '/thumbnail.png',
  createdAt: 1,
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

function renderGrid(): void {
  render(
    <MemoryRouter initialEntries={['/community']}>
      <TooltipProvider>
        <CommunityProjectGrid projects={[project]} />
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

  it('should compose a single whole-card link without rendering the description', () => {
    renderGrid();

    expect(screen.getAllByRole('link')).toHaveLength(1);
    const cardLink = screen.getByRole('link', { name: 'Preview Community Demo' });
    expect(cardLink).toHaveAttribute('href', '/s/builtin~replicad.community-demo');
    expect(cardLink.parentElement).toHaveClass('hover:border-primary/60');
    expect(screen.getByText('Community Demo')).toBeInTheDocument();
    expect(screen.getByText('Tau Team')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remix' })).toBeInTheDocument();
    expect(screen.queryByText('Description retained for Remix payload only')).not.toBeInTheDocument();
  });

  it('should mount the preview once and preserve it while hidden', async () => {
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
    expect(screen.getByTestId('cad-preview-provider')).toBeInTheDocument();
    expect(screen.getByTestId('cad-preview-provider').parentElement).toHaveAttribute('hidden');
    expect(screen.getByRole('img', { name: 'Community Demo' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/community');
  });

  it('should Remix with the portable project payload without opening the preview route', async () => {
    renderGrid();

    await userEvent.click(screen.getByRole('button', { name: 'Remix' }));

    expect(createProjectMock).toHaveBeenCalledWith({
      project: {
        name: 'Community Demo (Remixed)',
        description: 'Description retained for Remix payload only',
        tags: ['community'],
        assets: project.assets,
      },
      files,
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/w/tau-workspace/remixed-project');
  });

  it('retains the card and resets Remix after a creation-location failure', async () => {
    const error = new Error('disconnected');
    createProjectMock.mockRejectedValue(error);
    presentLocationErrorMock.mockReturnValue(true);
    renderGrid();

    await userEvent.click(screen.getByRole('button', { name: 'Remix' }));

    expect(presentLocationErrorMock).toHaveBeenCalledWith(error);
    expect(screen.getByRole('button', { name: 'Remix' })).toBeEnabled();
    expect(screen.getByText('Community Demo')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/community');
  });
});
