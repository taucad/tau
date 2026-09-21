import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { previewBreadcrumb } from '#routes/w.$workspace.$project_.preview/preview-route.js';

vi.mock('#hooks/use-projects.js', () => ({
  useProjects: () => ({
    projects: [
      { id: 'p1', name: 'Honeycomb', slugs: { workspaceSlug: 'home', projectSlug: 'honeycomb' } },
      { id: 'p2', name: 'Other', slugs: { workspaceSlug: 'home', projectSlug: 'other' } },
    ],
    isLoading: false,
  }),
}));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({}) }));

describe('previewBreadcrumb', () => {
  // The shell renders breadcrumbs above the route's providers (page.tsx), so no preview context exists here.
  it('names the project from the listing without the preview route context', () => {
    render(
      <MemoryRouter>
        {previewBreadcrumb({ workspace: 'home', project: 'honeycomb' }, '/w/home/honeycomb/preview')}
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Honeycomb' })).toHaveAttribute('href', '/w/home/honeycomb/preview');
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('falls back to a generic name for an unknown project', () => {
    render(
      <MemoryRouter>
        {previewBreadcrumb({ workspace: 'home', project: 'missing' }, '/w/home/missing/preview')}
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Project' })).toBeInTheDocument();
  });
});
