// @vitest-environment jsdom
/**
 * `/s/:slug` in the desktop shell — the landing site of `tau://s/<slug>` (R4).
 *
 * The properties this suite exists to hold: a share a provider resolves in the
 * browser never reaches the API; a Tau publication does, through the same
 * `/v1/publications/<id>` the web loader calls; and every refusal is a sentence
 * with a way onwards, with the signed-out one holding the link across the
 * browser sign-in the desktop shell owns.
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#routes/s.$slug/route.js', () => ({
  PortableShareSurface: () => <div>portable share surface</div>,
}));
vi.mock('#components/share/tau-publication.js', () => ({
  PublicationInteractiveSurface: ({ publication }: { readonly publication: { readonly title: string } }) => (
    <div>{`workbench: ${publication.title}`}</div>
  ),
  ErrorBoundary: () => null,
}));
vi.mock('#hooks/use-file-manager.js', () => ({
  SharedWorkerGate: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

const { default: DesktopShareRoute } = await import('#routes/s.$slug/desktop-route.js');

const originalEnvironment = globalThis.window.ENV;

const publicationBody = {
  publication: {
    id: 'pub_123',
    title: 'Persisted project',
    entryPath: 'main.ts',
    visibility: 'public',
    createdAt: '2026-09-19T00:00:00.000Z',
  },
  viewerRole: 'public',
  urls: { view: '', share: '', og: '', thumbnail: '' },
  manifest: {},
  files: {},
};

const mountAt = (slug: string): void => {
  render(
    <MemoryRouter initialEntries={[`/s/${slug}`]}>
      <Routes>
        <Route path='/s/:slug' element={<DesktopShareRoute />} />
      </Routes>
    </MemoryRouter>,
  );
};

describe('desktop /s/:slug', () => {
  beforeEach(() => {
    globalThis.window.ENV = {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- browser environment keys are uppercase by contract.
      TAU_API_URL: 'https://api.host.test',
    };
  });

  afterEach(() => {
    globalThis.window.ENV = originalEnvironment;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  /* A cold `window.loadURL` from main is this route's whole entry path, and
     SPA mode has no route-level hydrate fallback to cover it. */
  it('says it is opening the project before the API answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(publicationBody)),
    );

    mountAt('tau~pub_123');

    expect(screen.getByText('Opening shared project…')).toBeInTheDocument();
    expect(await screen.findByText('workbench: Persisted project')).toBeInTheDocument();
  });

  it('opens a Tau publication through the API the web loader calls', async () => {
    const fetchMock = vi.fn(async () => Response.json(publicationBody));
    vi.stubGlobal('fetch', fetchMock);

    mountAt('tau~pub_123');

    expect(await screen.findByText('workbench: Persisted project')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.host.test/v1/publications/pub_123',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it.each(['direct', 'github-gist~0123456789abcdef', 'builtin~replicad.birdhouse'])(
    'resolves %s in the browser without asking the API',
    async (slug) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      mountAt(slug);

      expect(await screen.findByText('portable share surface')).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  /* The desktop shell owns `/auth/sign-in`: landing there opens the system
     browser, and `redirectTo` is what brings the shell back to this link. */
  it('holds the link through the browser sign-in when the publication is private', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 401 })),
    );

    mountAt('tau~pub_123');

    expect(await screen.findByText('Sign in to open this link.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Sign-in opens in your browser. Tau Desktop keeps the link and opens it once you are signed in.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/auth/sign-in?redirectTo=%2Fs%2Ftau~pub_123',
    );
  });

  it('says an unpublished share link is no longer valid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 410 })),
    );

    mountAt('tau~pub_123');

    expect(await screen.findByText('This share link is no longer valid.')).toBeInTheDocument();
    expect(screen.getByText('The owner unpublished it. Ask them for a new link.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to projects' })).toHaveAttribute('href', '/projects');
  });

  /* The shell's parser admits any identifier, so a slug that names no provider
     reaches this route and has to be refused here. */
  it('refuses a slug that names no provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    mountAt('pub_bare');

    expect(await screen.findByText('Tau cannot open this link.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /* Outcomes the deep-link canvas never drew keep the shipped lock screen, so
     the desktop says what the web already says. */
  it.each([
    [404, "This design doesn't exist"],
    [429, 'Too many requests'],
    [503, "We can't load this design right now"],
  ])('falls back to the shipped lock screen for %i', async (status, headline) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status })),
    );

    mountAt('tau~pub_123');

    expect(await screen.findByText(headline)).toBeInTheDocument();
  });

  it('reports an API that never answers as a service outage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );

    mountAt('tau~pub_123');

    expect(await screen.findByText("We can't load this design right now")).toBeInTheDocument();
  });
});
