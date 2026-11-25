import { createRequestHandler, Outlet, redirect } from 'react-router';
import type { ServerBuild } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handleRequest from '#entry.server.js';
import { everyResponseHeaders, rootMiddleware } from '#lib/root-middleware.server.js';
import { skewProtectionCookieName } from '#lib/skew-protection.server.js';
import type * as SentryServer from '#lib/sentry.server.js';

vi.mock('#lib/sentry.server.js', async (importOriginal) => ({
  ...(await importOriginal<typeof SentryServer>()),
  queueSsrError: vi.fn(),
}));

/** The middleware this test throws from, after the root one, so a request reaches the pipeline as in the app. */
const failing = vi.fn<() => void>();

const route = (id: string, path: string, module: Readonly<Record<string, unknown>>) => ({
  id,
  parentId: id === 'root' ? undefined : 'root',
  path,
  index: undefined,
  caseSensitive: undefined,
  module,
});

const manifestRoute = (id: string, path: string, hasLoader: boolean) => ({
  id,
  parentId: id === 'root' ? undefined : 'root',
  path,
  module: `/${id}.js`,
  hasLoader,
  hasAction: false,
  hasClientAction: false,
  hasClientLoader: false,
  hasClientMiddleware: false,
  hasErrorBoundary: id === 'root',
});

/** The smallest server build with the app's root middleware and entry: a page, a resource, a redirect and a failure. */
const build = (handleError: ServerBuild['entry']['module']['handleError']): ServerBuild =>
  ({
    entry: { module: { default: handleRequest, handleError } },
    routes: {
      root: route('root', '', {
        default: () => <Outlet />,
        ErrorBoundary: () => <p>Something went wrong</p>,
        middleware: [
          rootMiddleware,
          () => {
            failing();
          },
        ],
      }),
      page: route('page', 'page', { default: () => <p>Page</p>, loader: () => ({ ok: true }) }),
      resource: route('resource', 'resource', { loader: () => new Response('ok') }),
      moved: route('moved', 'moved', {
        loader: () => {
          // oxlint-disable-next-line @typescript-eslint/only-throw-error -- React Router's redirect is a thrown Response.
          throw redirect('/page');
        },
      }),
      fails: route('fails', 'fails', {
        default: () => <p>Fails</p>,
        loader: () => {
          throw new Error('loader failed');
        },
      }),
    },
    assets: {
      entry: { module: '/entry.js', imports: [] },
      routes: {
        root: manifestRoute('root', '', false),
        page: manifestRoute('page', 'page', true),
        resource: manifestRoute('resource', 'resource', true),
        moved: manifestRoute('moved', 'moved', true),
        fails: manifestRoute('fails', 'fails', true),
      },
      url: '/manifest.js',
      version: 'test',
    },
    publicPath: '/',
    assetsBuildDirectory: 'build/client',
    // React Router 8 passes raw requests (RR2), so the redirect must be built from `url`; middleware always runs.
    future: {},
    ssr: true,
    isSpaMode: false,
    prerender: [],
    routeDiscovery: { mode: 'initial', manifestPath: '/__manifest' },
  }) as unknown as ServerBuild;

const origin = 'https://taucad.dev';

/* Every kind of response the root middleware answers (C1 parity): a document, a `.data` request, a resource, a
 * redirect and an error. */
const kinds = [
  { kind: 'document', path: '/page', status: 200, document: true },
  { kind: '.data', path: '/page.data', status: 200, document: false },
  { kind: 'resource', path: '/resource', status: 200, document: false },
  { kind: 'redirect', path: '/moved', status: 302, document: false },
  { kind: 'error document', path: '/fails', status: 500, document: true },
] as const;

describe('root middleware (React Router 8 migration C1, RR3)', () => {
  beforeEach(() => {
    vi.stubEnv('NETLIFY_SKEW_PROTECTION_TOKEN', 'deploy-token');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    failing.mockReset();
  });

  it.each(kinds)('should send the every-response headers on a $kind response', async ({ path, status, document }) => {
    const handler = createRequestHandler(build(vi.fn()));

    const response = await handler(new Request(`${origin}${path}`, { redirect: 'manual' }));
    await response.text();

    expect(response.status).toBe(status);
    for (const [name, value] of Object.entries(everyResponseHeaders)) {
      expect(response.headers.get(name), name).toBe(value);
    }
    /* The skew cookie pins a page to the deploy that rendered it: on a `.data` or resource response it would re-pin a
     * tab still running the previous build, so only a document carries it. */
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith(`${skewProtectionCookieName}=`))).toBe(
      document,
    );
  });

  it('should redirect `www.` to the apex page, also from a `.data` request', async () => {
    const handler = createRequestHandler(build(vi.fn()));

    const document = await handler(new Request('https://www.taucad.dev/page?x=1', { redirect: 'manual' }));
    const data = await handler(new Request('https://www.taucad.dev/page.data?x=1', { redirect: 'manual' }));

    expect(document.status).toBe(301);
    expect(document.headers.get('Location')).toBe('https://taucad.dev/page?x=1');
    expect(document.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(await data.text()).toContain('https://taucad.dev/page?x=1');
  });

  it.each([
    { kind: 'document', path: '/page' },
    { kind: '.data', path: '/page.data' },
    { kind: 'resource', path: '/resource' },
  ])(
    'should hand an error thrown in the root middleware to handleError once, on a $kind request',
    async ({ kind, path }) => {
      const thrown = new Error('middleware failed');
      failing.mockImplementation(() => {
        throw thrown;
      });
      const handleError = vi.fn();
      const handler = createRequestHandler(build(handleError));

      const response = await handler(new Request(`${origin}${path}`));
      const body = await response.text();

      expect(handleError).toHaveBeenCalledOnce();
      expect(handleError.mock.calls[0]?.[0]).toBe(thrown);
      expect(response.status).toBe(500);
      if (kind === 'document') {
        // The boundary still renders.
        expect(body).toContain('Something went wrong');
      }
    },
  );
});
