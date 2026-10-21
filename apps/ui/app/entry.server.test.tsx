import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createStaticHandler } from 'react-router';
import type { AppLoadContext, EntryContext } from 'react-router';
import { mock, mockDeep } from 'vitest-mock-extended';
import { describe, it, expect } from 'vitest';

import handleRequest from '#entry.server.js';
import { canonicalProductionUrl } from '#lib/canonical-url.js';

const contextMatching = (...routeIds: string[]): EntryContext =>
  ({
    staticHandlerContext: { matches: routeIds.map((id) => ({ route: { id } })) },
  }) as unknown as EntryContext;

const entryContext = contextMatching('root', 'routes/_index');
const loadContext = {} as unknown as AppLoadContext;

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
      const response = await handleRequest(request, status, new Headers(), context, mock<AppLoadContext>());
      // Drain the real React stream before assertions, including on a failing regression.
      const body = await response.text();
      const netlifyConfig = readFileSync(resolve(import.meta.dirname, '../netlify.toml'), 'utf8');
      const staticPolicy = /^Content-Security-Policy-Report-Only = "(.+)"$/mu.exec(netlifyConfig)?.[1];
      expect(staticPolicy).toContain("default-src 'self';");
      expect(response.headers.get('Content-Security-Policy-Report-Only')).toBe(staticPolicy);
      expect(response.headers.has('Content-Security-Policy')).toBe(false);
      expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
      expect(response.status).toBe(status);
      expect(body).toBe(method === 'HEAD' ? '' : '<p>Workspace fixture</p>');
    },
  );

  it('should apply cross-origin isolation headers to the response (HEAD path)', async () => {
    const request = new Request('https://tau.example/', { method: 'HEAD' });
    const responseHeaders = new Headers();
    const response = await handleRequest(request, 200, responseHeaders, entryContext, loadContext);
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

  it('should mutate the supplied responseHeaders instance with COI headers', async () => {
    const request = new Request('https://tau.example/', { method: 'HEAD' });
    const responseHeaders = new Headers();
    await handleRequest(request, 200, responseHeaders, entryContext, loadContext);
    expect(responseHeaders.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(responseHeaders.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(responseHeaders.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
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
