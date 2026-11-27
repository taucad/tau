import {
  createRequestHandler,
  UNSAFE_decodeViaTurboStream as decodeViaTurboStream,
  UNSAFE_SingleFetchRedirectSymbol as singleFetchRedirectSymbol,
} from 'react-router';
import type { RequestHandler, ServerBuild } from 'react-router';

type ServerRouteModule = NonNullable<ServerBuild['routes'][string]>['module'];

/**
 * A route module as the server build holds it. A resource route (a loader or action alone) has no `default`, and a
 * route module's typed loader and action (`Route.LoaderArgs`) take narrower params than the build's shared type.
 */
export type TestRouteModule = Omit<ServerRouteModule, 'default' | 'loader' | 'action'> & {
  readonly default?: ServerRouteModule['default'];
  readonly loader?: (args: never) => unknown;
  readonly action?: (args: never) => unknown;
};

/** One route of a test server build, with the module its loader and action come from. */
export type TestRoute = {
  readonly id: string;
  readonly parentId?: string;
  readonly path?: string;
  readonly index?: boolean;
  readonly module: TestRouteModule;
};

/** What a single-fetch `.data` response decodes to. */
export type DataResult =
  | { readonly kind: 'redirect'; readonly status: number; readonly location: string }
  | { readonly kind: 'routes'; readonly status: number; readonly routes: Readonly<Record<string, unknown>> };

type SingleFetchRedirect = { readonly redirect: string; readonly status: number };

const isRecord = (value: unknown): value is Readonly<Record<PropertyKey, unknown>> =>
  typeof value === 'object' && value !== null;

const noEntry = (): ServerBuild['entry']['module'] => ({
  default: () => new Response('document', { status: 200 }),
});

/**
 * A React Router request handler over the given routes, so a test sends a loader the request a client navigation
 * sends (`/<path>.data?_routes=…`) and the loader sees what production sees: on React Router 8 the raw request
 * (blueprint B4), trailing-slash-aware data request names (B5) and middleware are the only behaviour.
 *
 * @param options - The routes and, for document requests, an entry module.
 * @returns The production request handler for that build.
 */
export const createTestRequestHandler = ({
  routes,
  entry = noEntry(),
}: {
  readonly routes: readonly TestRoute[];
  readonly entry?: ServerBuild['entry']['module'];
}): RequestHandler => {
  const build: ServerBuild = {
    entry: { module: entry },
    routes: Object.fromEntries(
      routes.map((route) => [
        route.id,
        {
          id: route.id,
          parentId: route.parentId,
          path: route.path,
          index: route.index,
          // oxlint-disable-next-line typescript/consistent-type-assertions -- the build calls a route's typed loader with its own params; a built resource route has no `default` either.
          module: route.module as ServerRouteModule,
        },
      ]),
    ),
    assets: {
      entry: { imports: [], module: '/entry.client.js' },
      routes: Object.fromEntries(
        routes.map((route) => [
          route.id,
          {
            id: route.id,
            parentId: route.parentId,
            path: route.path,
            index: route.index,
            module: `/${route.id}.js`,
            hasAction: route.module.action !== undefined,
            hasLoader: route.module.loader !== undefined,
            hasClientAction: false,
            hasClientLoader: false,
            hasClientMiddleware: false,
            hasErrorBoundary: route.module.ErrorBoundary !== undefined,
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
  };
  return createRequestHandler(build, 'production');
};

/**
 * Decode a single-fetch `.data` response into the redirect or the per-route results it carries.
 *
 * @param response - The response to a `.data` request.
 * @returns The redirect, or each route's `{ data }` or `{ error }`.
 */
export const decodeDataResponse = async (response: Response): Promise<DataResult> => {
  if (response.body === null) {
    throw new TypeError(`A .data response has a body (status ${response.status})`);
  }
  const decoded = await decodeViaTurboStream(response.body, globalThis);
  await decoded.done;
  const { value } = decoded;
  if (!isRecord(value)) {
    throw new TypeError('A .data response decodes to an object');
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- React Router's own single-fetch redirect shape.
  const redirect = value[singleFetchRedirectSymbol] as SingleFetchRedirect | undefined;
  return redirect === undefined
    ? { kind: 'routes', status: response.status, routes: value }
    : { kind: 'redirect', status: redirect.status, location: redirect.redirect };
};

/**
 * The path of the `.data` request for a page, as React Router 8's client names it (`singleFetchUrl`): trailing-slash
 * aware, so a path ending in `/` gets `<path>_.data` and `/` asks for `/_.data`. React Router 7 named Home's
 * `/_root.data`; a tab of an earlier build may still send that name.
 *
 * @param pathname - The page's path.
 * @returns The data request's path.
 */
export const dataRequestPath = (pathname: string): string =>
  pathname.endsWith('/') ? `${pathname}_.data` : `${pathname}.data`;

/**
 * Send the `.data` request a client navigation to `url` sends, loading the given routes.
 *
 * @param handler - The request handler.
 * @param url - The document URL navigated to.
 * @param routeIds - The routes the client asks to load (`_routes`).
 * @returns The decoded response.
 */
export const requestData = async (
  handler: RequestHandler,
  url: string,
  routeIds: readonly string[],
): Promise<DataResult> => {
  const target = new URL(url);
  // Named as the app's client names it.
  target.pathname = dataRequestPath(target.pathname);
  target.searchParams.set('_routes', routeIds.join(','));
  return decodeDataResponse(await handler(new Request(target)));
};
