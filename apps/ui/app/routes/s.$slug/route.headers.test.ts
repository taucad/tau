// @vitest-environment node
/**
 * The `/s/:slug` document's `Cache-Control`, served through React Router's request handler and this app's
 * `entry.server.tsx`: a loader's headers reach the document only through the route's `headers` export, and the entry
 * sets its own default only when no route chose one.
 */
import { createRequestHandler } from 'react-router';
import type { ServerBuild } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPublicationLoader } from '@taucad/publish-ui/components/share/tau-publication';
import * as entryServer from '#entry.server.js';

/* eslint-disable @typescript-eslint/naming-convention -- mocked React module exports keep their public names. */
vi.mock('#components/share/tau-publication.js', () => ({
  default: () => null,
  PublicationInteractiveSurface: () => null,
  ErrorBoundary: () => null,
  loadPublication: createPublicationLoader(async () => 'https://api.tau.test'),
}));
/* eslint-enable @typescript-eslint/naming-convention -- end mocked exports. */

const routeModule = await import('#routes/s.$slug/route.js');

const routeId = 'routes/s.$slug/route';

/** The smallest server build that routes `/s/:slug` to the real route module under a bare root. */
const build = {
  entry: { module: entryServer },
  routes: {
    root: { id: 'root', path: '', module: { default: () => null } },
    [routeId]: { id: routeId, parentId: 'root', path: 's/:slug', module: routeModule },
  },
  assets: {
    entry: { module: '/entry.client.js', imports: [] },
    routes: {
      root: { id: 'root', path: '', module: '/root.js', hasLoader: false, hasClientLoader: false },
      [routeId]: {
        id: routeId,
        parentId: 'root',
        path: 's/:slug',
        module: '/s.js',
        hasLoader: true,
        hasClientLoader: false,
        hasErrorBoundary: true,
      },
    },
    url: '/manifest.js',
    version: 'test',
  },
  publicPath: '/',
  assetsBuildDirectory: 'build/client',
  basename: '/',
  future: {},
  ssr: true,
  isSpaMode: false,
  prerender: [],
  routeDiscovery: { mode: 'lazy', manifestPath: '/__manifest' },
} as unknown as ServerBuild;

const serve = async (slug: string): Promise<Response> =>
  createRequestHandler(build, 'production')(new Request(`https://taucad.dev/s/${slug}`, { method: 'HEAD' }));

const apiAnswers = (status: number, body: unknown = {}): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(body, { status })),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/s/:slug document Cache-Control', () => {
  it('sends the publication loader no-store policy on an authorized cloud link document', async () => {
    apiAnswers(200, { publication: { id: 'pub' }, viewerRole: 'owner', files: {} });
    const response = await serve('tau~shr_authorized');
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('sends the same policy on the client navigation data request', async () => {
    apiAnswers(200, { publication: { id: 'pub' }, viewerRole: 'owner', files: {} });
    const response = await createRequestHandler(
      build,
      'production',
    )(new Request('https://taucad.dev/s/tau~shr_authorized.data'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it.each([
    [401, 'sign-in-required'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [410, 'unpublished'],
    [429, 'rate-limited'],
    [500, 'service-unavailable'],
  ])('keeps the lock document for an API %i (%s) out of every cache', async (apiStatus) => {
    apiAnswers(apiStatus);
    const response = await serve('tau~shr_locked');
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('keeps the lock document for a link id that is not one out of every cache', async () => {
    apiAnswers(200);
    const response = await serve('tau~pub_old');
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it.each(['direct', 'github-gist~0123456789abcdef', 'builtin~replicad.birdhouse'])(
    'leaves the entry default on a %s share, whose loader sets no headers',
    async (slug) => {
      const response = await serve(slug);
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('private, no-cache');
    },
  );
});
