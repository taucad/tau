import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PublicationMobileSheet } from '#routes/v.$id/publication-mobile-sheet.js';
import type { ParsedPublication } from '#routes/v.$id/parsed-publication.js';

const mobileMocks = vi.hoisted(() => ({ isMobile: true }));

vi.mock('#hooks/use-mobile.js', () => ({
  useIsMobile: () => mobileMocks.isMobile,
}));

vi.mock('#routes/v.$id/publication-params-pane.js', () => ({
  PublicationParamsPane: () => <div data-slot='params-pane-stub' />,
}));

const publication: ParsedPublication = {
  id: 'pub_mobile',
  title: 'Mobile demo',
  visibility: 'public',
  viewerRole: 'public',
  entryPath: 'main.ts',
  ownerSnapshot: { id: 'user_1', name: 'Ada Lovelace', image: null },
  forkCount: 0,
  viewCount: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
};

describe('PublicationMobileSheet', () => {
  it('renders nothing when not mobile', () => {
    mobileMocks.isMobile = false;
    const { container } = render(<PublicationMobileSheet publication={publication} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a Vaul Drawer trigger when mobile', () => {
    mobileMocks.isMobile = true;
    render(<PublicationMobileSheet publication={publication} />);
    expect(screen.getByRole('button', { name: /parameters/iu })).toBeDefined();
  });
});
