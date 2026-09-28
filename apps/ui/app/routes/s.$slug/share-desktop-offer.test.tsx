// @vitest-environment jsdom
/**
 * The web `/s/:slug` page's offer of the desktop app (R4).
 *
 * The page keeps doing its own job — the shared workbench is what the link is
 * for — and the offer sits beside it. It is absent whenever handing the link
 * over would dead-end: on the desktop build itself, and for any slug the
 * shell's parser would refuse.
 */

import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('#components/share/tau-publication.js', () => ({
  default: () => <div>publication workbench</div>,
  PublicationInteractiveSurface: () => null,
  ErrorBoundary: () => null,
  loadPublication: async () => ({}),
  publicationMeta: () => [],
}));
vi.mock('#components/share/github-gist-management.js', () => ({
  GithubGistManagement: () => null,
}));
const shareProvider = vi.hoisted(() => ({ pending: false }));
vi.mock('#lib/share-providers.js', () => ({
  shareProviderRegistry: {
    load: async () => {
      if (shareProvider.pending) {
        // The provider never answers, so the page stays in its opening state.
        return new Promise<never>(() => {
          /* Never settles. */
        });
      }
      throw new Error('not resolvable in this suite');
    },
  },
  withBrowserShareProviderContext: async (operation: (context: unknown) => Promise<unknown>) => operation({}),
}));

const { default: ShareRoute } = await import('#routes/s.$slug/route.js');

const mountAt = (slug: string, loaderData: unknown): void => {
  const router = createMemoryRouter([{ path: '/s/:slug', Component: ShareRoute, loader: () => loaderData }], {
    initialEntries: [`/s/${slug}`],
  });
  render(<RouterProvider router={router} />);
};

describe('web /s/:slug desktop offer', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('offers the app beside the publication the page is already showing', async () => {
    mountAt('tau~pub_123', { publication: {}, viewerRole: 'public' });

    expect(await screen.findByText('publication workbench')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open in Tau Desktop' })).toBeInTheDocument();
  });

  it('offers the app beside a portable share too', async () => {
    mountAt('direct', { kind: 'portable' });

    expect(await screen.findByRole('button', { name: 'Open in Tau Desktop' })).toBeInTheDocument();
  });

  /* The workbench's bottom-right corner holds the end of the parameter list, and
     the viewer's centred bar owns its bottom edge: the card sits over the
     viewer's bottom-left, above the bar, from lg, where the viewer is wide
     enough for it. */
  it('should keep the offer off the workbench and the viewer bar', async () => {
    mountAt('tau~pub_123', { publication: {}, viewerRole: 'public' });

    const openInDesktop = await screen.findByRole('button', { name: 'Open in Tau Desktop' });
    const offer = openInDesktop.closest('.fixed');
    expect(offer).toHaveClass('hidden', 'lg:flex', 'justify-start', 'bottom-16');
    expect(offer).not.toHaveClass('md:flex', 'justify-end');
  });

  /* The desktop route announces the same wait (`desktop-route.tsx`). */
  it('should announce the web opening state as busy', async () => {
    shareProvider.pending = true;
    try {
      mountAt('builtin~replicad.birdhouse', { kind: 'portable' });

      const message = await screen.findByText('Opening shared project…');
      expect(message.closest('main')).toHaveAttribute('role', 'status');
      expect(message.closest('main')).toHaveAttribute('aria-busy', 'true');
    } finally {
      shareProvider.pending = false;
    }
  });

  /* A dead "Open in Tau Desktop" button is worse than none: the shell's parser
     refuses a slug this long, so the page must not pretend it can hand it on. */
  it('offers nothing for a slug the shell would refuse', async () => {
    mountAt('a'.repeat(257), { kind: 'portable' });

    expect(screen.queryByRole('button', { name: 'Open in Tau Desktop' })).not.toBeInTheDocument();
  });

  it('offers nothing on the desktop build', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');

    mountAt('tau~pub_123', { publication: {}, viewerRole: 'public' });

    expect(screen.queryByRole('button', { name: 'Open in Tau Desktop' })).not.toBeInTheDocument();
  });
});
