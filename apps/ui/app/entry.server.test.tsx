import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createStaticHandler, RouterContextProvider } from 'react-router';
import type { EntryContext } from 'react-router';
import { mock, mockDeep } from 'vitest-mock-extended';
import { afterEach, describe, it, expect, vi } from 'vitest';

import handleRequest, { handleError } from '#entry.server.js';
import { claimSsrErrors, queueSsrError, reportSsrError } from '#lib/sentry.server.js';
import type * as SentryServer from '#lib/sentry.server.js';
import { canonicalProductionUrl } from '#lib/canonical-url.js';
import { rootMiddleware } from '#lib/root-middleware.server.js';
import { resolveContentSecurityPolicyEnvironment } from '#lib/content-security-policy.server.js';
import { contentSecurityPolicyHeaders } from '#scripts/write-content-security-policy-headers.mts';

vi.mock('#lib/sentry.server.js', async (importOriginal) => {
  const original = await importOriginal<typeof SentryServer>();
  return {
    ...original,
    claimSsrErrors: vi.fn(original.claimSsrErrors),
    queueSsrError: vi.fn(original.queueSsrError),
    reportSsrError: vi.fn(original.reportSsrError),
  };
});

const contextMatching = (...routeIds: string[]): EntryContext =>
  ({
    staticHandlerContext: { matches: routeIds.map((id) => ({ route: { id } })) },
  }) as unknown as EntryContext;

const entryContext = contextMatching('root', 'routes/_index');
const loadContext = new RouterContextProvider();

/** A document as React Router serves it: the entry inside the root middleware, which sets the every-response headers. */
const serveDocument = async (request: Request, status: number, context: EntryContext): Promise<Response> => {
  const routerContext = new RouterContextProvider();
  return rootMiddleware(
    { request, url: new URL(request.url), params: {}, pattern: '/*', context: routerContext },
    async () => handleRequest(request, status, new Headers(), context, routerContext),
  ) as Promise<Response>;
};

describe('entry.server handleRequest', () => {
  it.each([
    { method: 'GET', status: 200 },
    { method: 'HEAD', status: 200 },
    { method: 'GET', status: 500 },
    { method: 'HEAD', status: 404 },
  ])(
    'should deliver the static report-only CSP on workspace $method documents with status $status',
    async ({ method, status }) => {
      const request = new Request('https://taucad.dev/w/home/fixture', { method });
      const handler = createStaticHandler([{ id: 'root', path: '*' }]);
      const staticHandlerContext = await handler.query(request);
      if (staticHandlerContext instanceof Response) {
        throw new TypeError('Expected a document context');
      }
      const context = mock<EntryContext>({
        staticHandlerContext,
        serverHandoffStream: undefined,
        isSpaMode: false,
        branches: undefined,
        manifest: mockDeep<EntryContext['manifest']>({
          entry: { module: '/entry.js', imports: [] },
          routes: {
            root: {
              id: 'root',
              parentId: undefined,
              path: '*',
              index: false,
              module: '/root.js',
              hasLoader: false,
              hasClientLoader: false,
            },
          },
        }),
        future: mock<EntryContext['future']>(),
      });
      context.routeModules = { root: { default: () => <p>Workspace fixture</p> } };
      const response = await serveDocument(request, status, context);
      // Drain the real React stream before assertions, including on a failing regression.
      const body = await response.text();
      const netlifyConfig = readFileSync(resolve(import.meta.dirname, '../netlify.toml'), 'utf8');
      // The build writes the same policy for static files (`_headers`); the shared netlify.toml names none.
      const staticPolicy = /^ {2}Content-Security-Policy-Report-Only: (.+)$/mu.exec(
        contentSecurityPolicyHeaders(resolveContentSecurityPolicyEnvironment(process.env['TAU_FRONTEND_URL'])),
      )?.[1];
      expect(staticPolicy).toContain("default-src 'self';");
      expect(response.headers.get('Content-Security-Policy-Report-Only')).toBe(staticPolicy);
      expect(response.headers.has('Content-Security-Policy')).toBe(false);
      expect(netlifyConfig).not.toMatch(/^Content-Security-Policy/mu);
      // SB6: violations and crash reports go to the same-origin receiver, on documents and static files alike.
      expect(staticPolicy).toMatch(/ report-to default;$/u);
      expect(response.headers.get('Reporting-Endpoints')).toBe('default="/api/reports"');
      expect(/^Reporting-Endpoints = '(.+)'$/mu.exec(netlifyConfig)?.[1]).toBe('default="/api/reports"');
      expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
      expect(response.status).toBe(status);
      expect(body).toBe(method === 'HEAD' ? '' : '<p>Workspace fixture</p>');
    },
  );

  it('should apply cross-origin isolation headers to the response (HEAD path)', async () => {
    const request = new Request('https://tau.example/', { method: 'HEAD' });
    const response = await serveDocument(request, 200, entryContext);
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
  });

  it('offers the JS profiler off production only (OQ-P11)', async () => {
    const staging = new Headers();
    await handleRequest(
      new Request('https://tau.example/', { method: 'HEAD' }),
      200,
      staging,
      entryContext,
      loadContext,
    );
    expect(staging.get('Document-Policy')).toBe('js-profiling');

    const production = new Headers();
    await handleRequest(
      new Request(canonicalProductionUrl, { method: 'HEAD' }),
      200,
      production,
      entryContext,
      loadContext,
    );
    expect(production.get('Document-Policy')).toBeNull();
  });

  it('should make every document revalidate, so a deploy is never answered with the replaced build (TAU-UI-6)', async () => {
    const response = await handleRequest(
      new Request('https://taucad.dev/w/home/fixture', { method: 'HEAD' }),
      200,
      new Headers(),
      entryContext,
      loadContext,
    );
    expect(response.headers.get('Cache-Control')).toBe('private, no-cache');
  });

  it('should never let any cache keep the apex document, which a presentation cookie selects', async () => {
    const response = await handleRequest(
      new Request('https://taucad.dev/', { method: 'HEAD' }),
      200,
      new Headers(),
      entryContext,
      loadContext,
    );
    const netlifyConfig = readFileSync(resolve(import.meta.dirname, '../netlify.toml'), 'utf8');
    const apexPolicy = /for = "\/"\n\[headers\.values\]\nCache-Control = "([^"]+)"/u.exec(netlifyConfig)?.[1];

    expect(apexPolicy).toBe('private, no-store');
    expect(response.headers.get('Cache-Control')).toBe(apexPolicy);
  });

  it("should keep a route's own document cache policy", async () => {
    const response = await handleRequest(
      new Request('https://taucad.dev/s/fixture', { method: 'HEAD' }),
      200,
      new Headers({ 'Cache-Control': 'public, max-age=0, must-revalidate' }),
      entryContext,
      loadContext,
    );
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
  });

  it('answers an unknown path with 404 (catch-all route)', async () => {
    const response = await handleRequest(
      new Request('https://tau.example/no-such-page', { method: 'HEAD' }),
      200,
      new Headers(),
      contextMatching('root', 'routes/$'),
      loadContext,
    );
    expect(response.status).toBe(404);
  });

  it('keeps the status of a known path', async () => {
    const response = await handleRequest(
      new Request('https://tau.example/', { method: 'HEAD' }),
      200,
      new Headers(),
      entryContext,
      loadContext,
    );
    expect(response.status).toBe(200);
  });
});

/**
 * The ready option the entry streamed a workspace document on, for a user agent, read from the document's
 * `Server-Timing` (`shell` for `onShellReady`, `all-ready` for `onAllReady`).
 */
const readyOptionFor = async (userAgent: string): Promise<string | undefined> => {
  const request = new Request('https://taucad.dev/w/home/fixture', { headers: { 'User-Agent': userAgent } });
  const staticHandlerContext = await createStaticHandler([{ id: 'root', path: '*' }]).query(request);
  if (staticHandlerContext instanceof Response) {
    throw new TypeError('Expected a document context');
  }
  const context = mock<EntryContext>({
    staticHandlerContext,
    serverHandoffStream: undefined,
    isSpaMode: false,
    branches: undefined,
    manifest: mockDeep<EntryContext['manifest']>({
      entry: { module: '/entry.js', imports: [] },
      routes: {
        root: {
          id: 'root',
          parentId: undefined,
          path: '*',
          index: false,
          module: '/root.js',
          hasLoader: false,
          hasClientLoader: false,
        },
      },
    }),
    future: mock<EntryContext['future']>(),
  });
  context.routeModules = { root: { default: () => <p>Workspace fixture</p> } };
  const response = await handleRequest(request, 200, new Headers(), context, new RouterContextProvider());
  // Drain the real React stream.
  await response.text();
  return /\b(shell|all-ready);dur=/u.exec(response.headers.get('Server-Timing') ?? '')?.[1];
};

/**
 * React Router 8 prerenders through a Vite preview server and marks the whole pass with `IS_RR_BUILD_REQUEST=yes`.
 * A prerender whose request carries a bare `node` user agent (Node's `fetch`) must stream as a browser's document, or
 * the static shells differ from the function's document (prerender dry run 2026-11-17, finding D3).
 */
describe('entry.server handleRequest for a prerender (RR8, D3)', () => {
  const browser =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should wait for everything for a bot, such as a bare `node` user agent outside a build', async () => {
    vi.stubEnv('IS_RR_BUILD_REQUEST', undefined);
    await expect(readyOptionFor('node')).resolves.toBe('all-ready');
  });

  it("should stream a prerender's `node` user agent from the shell, as a browser's document", async () => {
    vi.stubEnv('IS_RR_BUILD_REQUEST', 'yes');
    await expect(readyOptionFor('node')).resolves.toBe('shell');
  });

  it('should stream a browser from the shell with or without the build marker', async () => {
    vi.stubEnv('IS_RR_BUILD_REQUEST', undefined);
    await expect(readyOptionFor(browser)).resolves.toBe('shell');
    vi.stubEnv('IS_RR_BUILD_REQUEST', 'yes');
    await expect(readyOptionFor(browser)).resolves.toBe('shell');
  });
});

describe('entry.server handleError (SB10)', () => {
  it('should hand a server error to the SSR reporter and still log it', () => {
    const error = new Error('loader failed');
    const request = new Request('https://taucad.dev/w/home/fixture');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    handleError(error, { request, params: {}, context: loadContext });

    expect(queueSsrError).toHaveBeenCalledWith(error, request);
    expect(logged).toHaveBeenCalledWith(error);
    logged.mockRestore();
  });

  it('should skip a request the client aborted', () => {
    const controller = new AbortController();
    controller.abort();
    vi.mocked(queueSsrError).mockClear();

    handleError(new Error('aborted'), {
      request: new Request('https://taucad.dev/', { signal: controller.signal }),
      params: {},
      context: loadContext,
    });

    expect(queueSsrError).not.toHaveBeenCalled();
  });

  it('should name the document route and status for the errors handleError took', async () => {
    const request = new Request('https://taucad.dev/w/home/fixture', { method: 'HEAD' });

    await handleRequest(
      request,
      500,
      new Headers(),
      contextMatching('root', 'routes/w.$workspace.$project'),
      loadContext,
    );

    expect(claimSsrErrors).toHaveBeenCalledWith(request, 'routes/w.$workspace.$project', 500);
    expect(reportSsrError).not.toHaveBeenCalled();
  });
});
