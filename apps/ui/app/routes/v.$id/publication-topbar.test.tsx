import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi } from 'vitest';
import { TooltipProvider } from '#components/ui/tooltip.js';
import { PublicationTopbar } from '#routes/v.$id/publication-topbar.js';
import type { ParsedPublication } from '#routes/v.$id/parsed-publication.js';

vi.mock('#routes/v.$id/fork-action.js', () => ({
  ForkAction: () => <button type='button'>Remix</button>,
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
        <PublicationTopbar publication={publication} files={new Map()} />
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

  it('does not render viewer-page share controls, even for owners', () => {
    renderTopbar();
    expect(screen.queryByRole('button', { name: /share/i })).not.toBeInTheDocument();

    render(
      <TooltipProvider>
        <MemoryRouter>
          <PublicationTopbar publication={{ ...publication, viewerRole: 'owner' }} files={new Map()} />
        </MemoryRouter>
      </TooltipProvider>,
    );
    expect(screen.queryByRole('button', { name: /share/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^remix$/iu })).toHaveLength(2);
  });
});
