// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import * as Cookies from 'es-cookie';
import Home, { handle, meta } from '#routes/_index/route.js';

vi.mock('#components/project-library/project-library.js', () => ({
  ProjectLibrary: ({ emptyContent }: { readonly emptyContent?: React.ReactNode }) => (
    <div data-testid='project-library'>{emptyContent}</div>
  ),
}));

// Setup's auto-open reads the session; its own tests cover it (`use-setup-offer.test.tsx`).
vi.mock('#components/onboarding/use-setup-offer.js', () => ({ useSetupOffer: () => undefined }));

vi.mock('#components/project-grid.js', () => ({ CommunityProjectGrid: () => <ul aria-label='examples' /> }));

vi.mock('#routes/_index/homepage-chat-hero.js', () => ({
  HomepageChatHero: () => <div data-testid='homepage-chat-hero' />,
}));

function renderHome(path = '/'): ReturnType<typeof createMemoryRouter> {
  const router = createMemoryRouter([{ path: '/', element: <Home /> }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('Home route', () => {
  it('should render the chat hero above the project library', () => {
    renderHome();

    const hero = screen.getByTestId('homepage-chat-hero');
    expect(hero.nextElementSibling).toBe(screen.getByTestId('project-library'));
  });

  it('should offer the community builds as the empty library content', () => {
    renderHome();

    const library = within(screen.getByTestId('project-library'));
    expect(library.getByRole('heading', { level: 2, name: 'Built with Tau' })).toBeInTheDocument();
    expect(library.getByRole('list', { name: 'examples' })).toBeInTheDocument();
    expect(library.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/community');
  });

  it('should record the app preference and drop the marker when a marketing link opens Home', async () => {
    Cookies.remove('tau-entry', { path: '/' });
    const router = renderHome('/?app&utm_source=www');

    await vi.waitFor(() => {
      expect(router.state.location.search).toBe('?utm_source=www');
    });
    expect(Cookies.get('tau-entry')).toBe('app');
  });

  it('should keep the app shell', () => {
    expect(handle.enablePageWrapper).toBe(true);
  });

  it('should provide an application title and description', () => {
    // MetaFunction args are unused by the homepage meta.
    const descriptors = meta({} as Parameters<typeof meta>[0]) as Array<Record<string, unknown>>;

    expect(descriptors.find((descriptor) => 'title' in descriptor)?.['title']).toContain('Tau');
    expect(typeof descriptors.find((descriptor) => descriptor['name'] === 'description')?.['content']).toBe('string');
  });
});
