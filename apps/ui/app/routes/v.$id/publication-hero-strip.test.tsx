import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PublicationHeroStrip } from '#routes/v.$id/publication-hero-strip.js';
import type { ParsedPublication } from '#routes/v.$id/parsed-publication.js';

const publication: ParsedPublication = {
  id: 'pub_hero',
  title: 'Beautiful Axe',
  description: 'A beautifully axe-shaped axe.',
  visibility: 'public',
  viewerRole: 'public',
  entryFile: 'main.ts',
  ownerSnapshot: { id: 'user_1', name: 'Ada Lovelace', image: null },
  forkCount: 12,
  viewCount: 345,
  createdAt: '2025-01-01T00:00:00.000Z',
};

describe('PublicationHeroStrip', () => {
  it('renders the title and description', () => {
    render(<PublicationHeroStrip publication={publication} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Beautiful Axe' })).toBeDefined();
    expect(screen.getByText('A beautifully axe-shaped axe.')).toBeDefined();
  });

  it('renders the by-line with owner name and aria-labelled view + fork counts', () => {
    render(<PublicationHeroStrip publication={publication} />);
    expect(screen.getByText('Ada Lovelace')).toBeDefined();
    expect(screen.getByLabelText('345 views')).toBeDefined();
    expect(screen.getByLabelText('12 remixes')).toBeDefined();
  });

  it('falls back to "Anonymous" when no ownerSnapshot is provided', () => {
    render(<PublicationHeroStrip publication={{ ...publication, ownerSnapshot: null }} />);
    expect(screen.getByText('Anonymous')).toBeDefined();
  });

  it('omits the description block when no description is provided', () => {
    render(<PublicationHeroStrip publication={{ ...publication, description: undefined }} />);
    expect(screen.queryByText('A beautifully axe-shaped axe.')).toBeNull();
  });
});
