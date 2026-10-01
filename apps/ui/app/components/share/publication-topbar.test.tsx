import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, it, expect, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { PublicationTopbar } from '#components/share/publication-topbar.js';
import type { ParsedPublication } from '#components/share/parsed-publication.js';

vi.mock('#components/share/fork-action.js', () => ({
  ForkAction: () => <button type='button'>Remix</button>,
}));

vi.mock('#routes/w.$workspace.$project/project-export-action.js', () => ({
  ProjectExportAction: ({ labelClassName }: { readonly labelClassName?: string }) => (
    <button type='button'>
      <span className={labelClassName}>Export</span>
    </button>
  ),
}));

const publication: ParsedPublication = {
  id: 'pub_topbar',
  title: 'Topbar fixture',
  visibility: 'public',
  viewerRole: 'public',
  entryPath: 'main.ts',
  ownerSnapshot: null,
  forkCount: 0,
  viewCount: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
};

const renderTopbar = (): ReturnType<typeof render> =>
  render(
    <TooltipProvider>
      <MemoryRouter>
        <PublicationTopbar publication={publication} files={new Map()} parameters={{}} />
      </MemoryRouter>
    </TooltipProvider>,
  );

describe('PublicationTopbar', () => {
  it('renders the wordmark as a link to /', () => {
    renderTopbar();
    const homeLink = screen.getByRole('link', { name: /go home/iu });
    expect(homeLink.getAttribute('href')).toBe('/');
  });

  it('renders the ForkAction (Remix button)', () => {
    renderTopbar();
    expect(screen.getByRole('button', { name: /^remix$/iu })).toBeDefined();
  });

  it('renders Export immediately after Download source', () => {
    render(
      <TooltipProvider>
        <MemoryRouter>
          <PublicationTopbar publication={publication} files={new Map()} parameters={{}} archive={new Uint8Array()} />
        </MemoryRouter>
      </TooltipProvider>,
    );

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Download source',
      'Export',
      'Remix',
    ]);
  });

  it('should show its own action labels only from md, where the shared page leaves its phone layout', () => {
    render(
      <TooltipProvider>
        <MemoryRouter>
          <PublicationTopbar
            publication={publication}
            files={new Map()}
            parameters={{}}
            archive={new Uint8Array()}
            shareUrl='https://tau.example/s/direct'
          />
        </MemoryRouter>
      </TooltipProvider>,
    );

    // Below md the phone layout adds the Workbench trigger, and the labelled actions no longer fit beside it.
    for (const label of ['Copy link', 'Download source', 'Export']) {
      expect(screen.getByText(label)).toHaveClass('hidden', 'md:inline');
    }
  });

  it('copies the original opened share URL exactly', async () => {
    const clipboard = { writeText: vi.fn<Clipboard['writeText']>().mockResolvedValue(undefined) };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    const shareUrl = 'https://tau.example/s/direct#jwe=protected-carrier&p=shared-password';

    render(
      <TooltipProvider>
        <MemoryRouter>
          <PublicationTopbar publication={publication} files={new Map()} parameters={{}} shareUrl={shareUrl} />
        </MemoryRouter>
      </TooltipProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith(shareUrl);
  });

  it('does not render viewer-page share controls, even for owners', () => {
    renderTopbar();
    expect(screen.queryByRole('button', { name: /share/i })).not.toBeInTheDocument();

    render(
      <TooltipProvider>
        <MemoryRouter>
          <PublicationTopbar publication={{ ...publication, viewerRole: 'owner' }} files={new Map()} parameters={{}} />
        </MemoryRouter>
      </TooltipProvider>,
    );
    expect(screen.queryByRole('button', { name: /share/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^remix$/iu })).toHaveLength(2);
  });

  describe('exits and title', () => {
    const renderAt = (path: string): ReturnType<typeof render> =>
      render(
        <TooltipProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route
                path='/s/:slug'
                element={<PublicationTopbar publication={publication} files={new Map()} parameters={{}} />}
              />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>,
      );

    it('should lead a builtin example back to its card in the gallery', () => {
      renderAt('/s/builtin~replicad.birdhouse');

      expect(screen.getByRole('link', { name: 'Examples' })).toHaveAttribute('href', '/community#replicad.birdhouse');
    });

    it('should lead a warehouse part back to the Parts catalog', () => {
      renderAt('/s/builtin~warehouse.hex-nut');
      expect(screen.getByRole('link', { name: 'Parts' })).toHaveAttribute('href', '/parts#warehouse.hex-nut');
      expect(screen.queryByRole('link', { name: 'Examples' })).not.toBeInTheDocument();
    });

    it('should offer no gallery exit for a share that is not an example', () => {
      renderAt('/s/github-gist~0123456789abcdef');

      expect(screen.queryByRole('link', { name: 'Examples' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /go home/iu })).toHaveAttribute('href', '/');
    });

    // Below sm the title takes its own row instead of disappearing; only the source line hides.
    it('should keep the title on a phone and hide only the source line', () => {
      renderAt('/s/builtin~replicad.birdhouse');

      const title = screen.getByText('Topbar fixture');
      expect(title.parentElement).not.toHaveClass('hidden');
      expect(title.parentElement).toHaveClass('order-last', 'w-full', 'sm:order-none');
      expect(screen.getByText('Public Tau share')).toHaveClass('hidden', 'sm:block');
    });
  });
});
