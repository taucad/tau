import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PublicationShell } from '#routes/v.$id/publication-shell.js';
import type { ParsedPublication } from '#routes/v.$id/parsed-publication.js';

const mobileMocks = vi.hoisted(() => ({ isMobile: false }));

vi.mock('#hooks/use-mobile.js', () => ({
  useIsMobile: () => mobileMocks.isMobile,
}));

vi.mock('#routes/v.$id/publication-files-pane.js', () => ({
  PublicationFilesPane: () => <div role='region' aria-label='Files' />,
}));

vi.mock('#routes/v.$id/publication-viewer-pane.js', () => ({
  PublicationViewerPane: () => <div role='region' aria-label='Model preview' />,
}));

vi.mock('#routes/v.$id/publication-params-pane.js', () => ({
  PublicationParamsPane: () => <div role='region' aria-label='Parameters' />,
}));

vi.mock('#routes/v.$id/publication-hero-strip.js', () => ({
  PublicationHeroStrip: () => <div role='region' aria-label='Model details' />,
}));

const publication: ParsedPublication = {
  id: 'pub_shell',
  title: 'Shell fixture',
  visibility: 'public',
  viewerRole: 'public',
  entryPath: 'main.ts',
  ownerSnapshot: null,
  forkCount: 0,
  viewCount: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
};

/* eslint-disable @typescript-eslint/naming-convention -- file-path keys can't be camelCase */
const publicationFiles = { 'main.ts': 'https://blob/main' };
/* eslint-enable @typescript-eslint/naming-convention -- end window */

describe('PublicationShell', () => {
  it('renders all three side panes plus hero strip on desktop', () => {
    mobileMocks.isMobile = false;
    render(<PublicationShell publication={publication} publicationFiles={publicationFiles} />);
    expect(screen.getByRole('region', { name: 'Files' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Model preview' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Parameters' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Model details' })).toBeDefined();
  });

  it('renders only the viewer + hero strip on mobile (no Files/Parameters side rails)', () => {
    mobileMocks.isMobile = true;
    render(<PublicationShell publication={publication} publicationFiles={publicationFiles} />);
    expect(screen.queryByRole('region', { name: 'Files' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Parameters' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Model preview' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Model details' })).toBeDefined();
  });
});
