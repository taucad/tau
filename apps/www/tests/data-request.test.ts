/**
 * Client navigations through React Router's own request handler, with the site's routes. React Router 8 passes a
 * loader the raw `/<path>.data?_routes=…` request as `request.url` (blueprint B4), so every page loader must read the
 * page's URL from its `url` argument; reading `request.url` answered every client navigation with a 404 payload.
 */
import {
  createRequestHandler,
  Outlet,
  UNSAFE_decodeViaTurboStream as decodeViaTurboStream,
  UNSAFE_SingleFetchRedirectSymbol as singleFetchRedirectSymbol,
} from 'react-router';
import type { ServerBuild } from 'react-router';
import { describe, expect, test } from 'vitest';
import { pages } from '#www/pages.js';
import { publishedArticles } from '#app/pages.server.js';
import routes from '#app/routes.js';
// oxlint-disable-next-line eslint/no-restricted-imports -- the build configuration lives one directory above the app alias root.
import config from '../react-router.config.js';

type ServerRoute = NonNullable<ServerBuild['routes'][string]>;
type RouteModule = ServerRoute['module'];

const routeModules = await Promise.all(
  routes.map(async (route) => ({
    id: route.id ?? route.file,
    path: route.path,
    index: route.index,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- a route file's exports are its module.
    module: (await import(/* @vite-ignore */ `../app/${route.file}`)) as RouteModule,
  })),
);
// A page has a component; `robots.txt`, `llms.txt` and `sitemap.xml` are resource routes, never navigated to.
const pageRoutes = routeModules.filter((route) => 'default' in route.module);
const serverRoutes: Record<string, ServerRoute> = { root: { id: 'root', path: '', module: { default: Outlet } } };
for (const route of pageRoutes) {
  serverRoutes[route.id] = { ...route, parentId: 'root' };
}

/** The site's page routes under a root, as the server build holds them. */
const handler = createRequestHandler(
  {
    entry: { module: { default: () => new Response('document') } },
    routes: serverRoutes,
    assets: {
      entry: { imports: [], module: '/entry.client.js' },
      routes: Object.fromEntries(
        [{ id: 'root', path: '', index: undefined, module: {} }, ...pageRoutes].map((route) => [
          route.id,
          {
            id: route.id,
            parentId: route.id === 'root' ? undefined : 'root',
            path: route.path,
            index: route.index,
            module: `/${route.id}.js`,
            hasAction: false,
            hasLoader: 'loader' in route.module,
            hasClientAction: false,
            hasClientLoader: false,
            hasClientMiddleware: false,
            hasErrorBoundary: false,
            clientActionModule: undefined,
            clientLoaderModule: undefined,
            clientMiddlewareModule: undefined,
            hydrateFallbackModule: undefined,
          },
        ]),
      ),
      url: '/manifest.js',
      version: 'test',
    },
    publicPath: '/',
    assetsBuildDirectory: 'build/client',
    future: {},
    ssr: true,
    isSpaMode: false,
    prerender: [],
    routeDiscovery: { mode: 'initial', manifestPath: '/__manifest' },
  },
  'production',
);

/**
 * The `.data` path the client asks for at `pathname`: React Router 8's `singleFetchUrl`, trailing-slash aware. A path
 * ending in `/` gets `<path>_.data`, so `/` gets `/_.data`.
 */
const dataRequestPath = (pathname: string): string =>
  pathname.endsWith('/') ? `${pathname}_.data` : `${pathname}.data`;

/** The per-route results of the `.data` request a client navigation to `path` sends. */
const navigate = async (path: string): Promise<Readonly<Record<string, { data?: { path?: string } }>>> => {
  const url = new URL(path, 'https://tau.new');
  url.pathname = dataRequestPath(url.pathname);
  url.searchParams.set('_routes', pageRoutes.map((route) => route.id).join(','));
  const response = await handler(new Request(url));
  if (response.body === null) {
    throw new TypeError(`${path}: a .data response has a body`);
  }
  const decoded = await decodeViaTurboStream(response.body, globalThis);
  await decoded.done;
  // oxlint-disable-next-line typescript/consistent-type-assertions -- React Router's single-fetch result shape.
  const value = decoded.value as Record<PropertyKey, unknown>;
  expect(value[singleFetchRedirectSymbol], `${path} redirected`).toBeUndefined();
  // oxlint-disable-next-line typescript/consistent-type-assertions -- React Router's single-fetch result shape.
  return value as Record<string, { data?: { path?: string } }>;
};

const loadedPath = (results: Awaited<ReturnType<typeof navigate>>): string | undefined =>
  Object.values(results).find((result) => result.data?.path !== undefined)?.data?.path;

describe('client navigation', () => {
  test('sets no React Router 7 `v8_*` flag, which React Router 8 rejects', () => {
    expect('future' in config).toBe(false);
  });

  test("names data requests trailing-slash aware, as React Router 8 does, so the home's is `/_.data`", () => {
    expect(dataRequestPath('/')).toBe('/_.data');
    expect(dataRequestPath('/pricing/')).toBe('/pricing/_.data');
  });

  test.each([
    ...pages.filter((page) => !page.error).map((page) => page.path),
    ...publishedArticles.map((article) => `/blog/${article.slug}/`),
  ])('should return the data of %s', async (path) => {
    expect(loadedPath(await navigate(path))).toBe(path);
  });

  test('should answer a path with no page with a 404 error, not data', async () => {
    const results = await navigate('/no-such-page/');

    expect(loadedPath(results)).toBeUndefined();
    expect(Object.values(results)).toContainEqual({ error: expect.objectContaining({ status: 404 }) as unknown });
  });
});
