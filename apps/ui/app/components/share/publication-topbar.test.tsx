import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi } from 'vitest';
import { TooltipProvider } from '#components/ui/tooltip.js';
import { PublicationTopbar } from '#components/share/publication-topbar.js';
import type { ParsedPublication } from '#components/share/parsed-publication.js';

vi.mock('#components/share/fork-action.js', () => ({
  ForkAction: () => <button type='button'>Remix</button>,
}));

vi.mock('#routes/w.$workspace.$project/project-export-action.js', () => ({
  ProjectExportAction: () => <button type='button'>Export</button>,
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
});
