// @vitest-environment jsdom
/**
 * The web `/s/:slug` page's offer of the desktop app (R4).
 *
 * The page keeps doing its own job — the shared workbench is what the link is
 * for — and the offer sits beside it. It is absent whenever handing the link
 * over would dead-end: on the desktop build itself, and for any slug the
 * shell's parser would refuse.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('#components/share/tau-publication.js', () => ({
  default: () => (
    <div data-viewer-frame>
      publication workbench
      <div data-viewer-bottom-controls style={{ bottom: 8 }}>
        <div data-slot='viewer-controls'>Viewer menu</div>
      </div>
    </div>
  ),
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

const mountAt = (slug: string, loaderData: unknown): ReturnType<typeof render> => {
  const router = createMemoryRouter([{ path: '/s/:slug', Component: ShareRoute, loader: () => loaderData }], {
    initialEntries: [`/s/${slug}`],
  });
  return render(<RouterProvider router={router} />);
};

describe('web /s/:slug desktop offer', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.restoreAllMocks();
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

  it('should keep the offer at the bottom-left with the browser continuation action', async () => {
    mountAt('tau~pub_123', { publication: {}, viewerRole: 'public' });

    const openInDesktop = await screen.findByRole('button', { name: 'Open in Tau Desktop' });
    const offer = openInDesktop.closest('.fixed');
    expect(offer).toHaveClass(
      'hidden',
      'lg:block',
      'bottom-[calc(var(--spacing)*4+1px)]',
      'left-[calc(var(--spacing)*4+1px)]',
    );
    expect(screen.getByRole('button', { name: 'Continue in the browser' })).toBeInTheDocument();
  });

  it('should center beside the offer, compact before moving above, and restore on dismissal', async () => {
    let resize = (): void => undefined;
    const observer = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    vi.spyOn(globalThis, 'ResizeObserver').mockImplementation(function (callback) {
      resize = () => {
        callback([], observer);
      };
      return observer;
    });
    const { unmount } = mountAt('tau~pub_123', { publication: {}, viewerRole: 'public' });
    const open = await screen.findByRole('button', { name: 'Open in Tau Desktop' });
    const offer = open.closest('.fixed')!;
    const menu = screen.getByText('Viewer menu');
    const controls = menu.parentElement!;
    const frame = controls.parentElement!;
    const x = () => controls.style.getPropertyValue('--share-desktop-offer-x');
    const y = () => controls.style.getPropertyValue('--share-desktop-offer-y');
    let viewerWidth = 1000;
    vi.spyOn(offer, 'getBoundingClientRect').mockImplementation(() =>
      DOMRect.fromRect({
        x: 17,
        y: 650,
        width: offer.contains(open) ? 320 : 0,
        height: offer.contains(open) ? 133 : 0,
      }),
    );
    vi.spyOn(frame, 'getBoundingClientRect').mockImplementation(() =>
      DOMRect.fromRect({ x: 9, y: 90, width: viewerWidth, height: 701 }),
    );
    vi.spyOn(menu, 'getBoundingClientRect').mockImplementation(() => {
      const width = Object.hasOwn(controls.dataset, 'desktopOfferCompact') ? 248 : 352;
      return DOMRect.fromRect({
        x: 9 + (viewerWidth - width) / 2 + Number.parseFloat(x() || '0'),
        y: 743 + Number.parseFloat(y() || '0'),
        width,
        height: 40,
      });
    });
    globalThis.dispatchEvent(new Event('resize'));
    await waitFor(() => {
      expect(x()).toBe('164px');
    });
    expect(y()).toBe('0px');
    expect(controls).not.toHaveAttribute('data-desktop-offer-compact');

    viewerWidth = 620;
    resize();
    await waitFor(() => {
      expect(controls).toHaveAttribute('data-desktop-offer-compact');
    });
    expect(x()).toBe('164px');
    expect(y()).toBe('0px');

    viewerWidth = 550;
    resize();
    await waitFor(() => {
      expect(y()).toBe('-141px');
    });
    expect(x()).toBe('0px');

    // Re-measuring the transformed menu must not make it oscillate between positions.
    globalThis.dispatchEvent(new Event('resize'));
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
    expect(y()).toBe('-141px');

    viewerWidth = 1000;
    resize();
    await waitFor(() => {
      expect(y()).toBe('0px');
    });
    expect(x()).toBe('164px');
    expect(controls).not.toHaveAttribute('data-desktop-offer-compact');
    fireEvent.click(screen.getByRole('button', { name: 'Continue in the browser' }));
    await waitFor(() => {
      expect(x()).toBe('0px');
    });
    expect(y()).toBe('0px');
    unmount();
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(x()).toBe('');
    expect(y()).toBe('');
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
