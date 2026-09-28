// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import DesktopHome, { handle } from '#routes/_index/home-surface.desktop.js';
import { galleryProjects } from '#constants/project-examples.js';

vi.mock('#routes/_index/homepage-chat-hero.js', () => ({ HomepageChatHero: () => <div>desktop hero</div> }));
vi.mock('#components/project-library/project-library.js', () => ({ ProjectLibrary: () => <div>project library</div> }));
vi.mock('#components/project-grid.js', () => ({
  CommunityProjectGrid: ({
    projects,
    limit,
  }: {
    readonly projects: ReadonlyArray<{ readonly name: string }>;
    readonly limit: number;
  }) => (
    <ul aria-label='examples'>
      {projects.slice(0, limit).map(({ name }) => (
        <li key={name}>{name}</li>
      ))}
    </ul>
  ),
}));

describe('desktop home surface', () => {
  it('should always render the product home without web document chrome', () => {
    render(<DesktopHome />, { wrapper: MemoryRouter });

    expect(screen.getByText('desktop hero')).toBeInTheDocument();
    expect(screen.getByText('project library')).toBeInTheDocument();
    expect(handle.enablePageFooter).toBe(false);
    expect(handle.enablePageWrapper).toBe(true);
  });

  it('should show the curated examples under the library, with a way into the gallery', () => {
    render(<DesktopHome />, { wrapper: MemoryRouter });

    const heading = screen.getByRole('heading', { level: 2, name: 'Built with Tau' });
    expect(screen.getByText('project library').nextElementSibling).toContainElement(heading);
    const examples = within(screen.getByRole('list', { name: 'examples' })).getAllByRole('listitem');
    expect(examples.map((item) => item.textContent)).toEqual(galleryProjects.slice(0, 10).map(({ name }) => name));
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/community');
  });
});
