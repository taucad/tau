import type { LoaderFunctionArgs } from 'react-router';

/**
 * Catch-all loader for `/assets/*` requests.
 *
 * In production the UI is served by an Express server (`apps/ui/server.ts`)
 * that mounts `@react-router/express` after `coiMiddleware` and the
 * `express.static` asset pipeline. Without an explicit route for `/assets/*`,
 * an asset hash that no longer exists on disk (e.g. a
 * stale browser cache pointing at an old chunk) falls through to the SPA's
 * root splat route (`routes/$/route.tsx`) and is answered with a `200 OK`
 * HTML response. The browser then tries to evaluate that HTML as JavaScript,
 * producing an opaque worker load failure that surfaces as the previous
 * `[FileManager] WORKER ERROR: undefined undefined undefined`.
 *
 * Returning a real `404` here turns those stale-hash requests into legitimate
 * network failures so the FileManager's worker-error diagnostics carry an
 * actionable filename + URL instead of a parse error.
 *
 * Real assets are served by Express static middleware *before* the React
 * Router request handler runs, so this loader only ever fires for genuine
 * cache-mismatch / 404 cases — it does not interfere with the normal asset
 * pipeline.
 *
 * Mounted at `/assets/*` automatically by `@react-router/fs-routes`
 * `flatRoutes()` via the `assets.$` directory naming convention.
 */
// oxlint-disable-next-line require-await -- React Router loader signature
export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  const url = new URL(request.url);
  // Throwing a `Response` is the React Router idiom for short-circuiting a
  // route with an HTTP status — the framework rethrows it with the correct
  // headers/body.
  // oxlint-disable-next-line typescript/only-throw-error -- React Router loader Response-throw idiom
  throw new Response(`Asset not found: ${url.pathname}`, {
    status: 404,
    statusText: 'Not Found',
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
  });
}

/**
 * Component is unreachable — `loader` always throws — but React Router still
 * requires a default export when the route is registered.
 */
// oxlint-disable-next-line typescript/no-restricted-types -- intentional null return for unreachable component
const AssetsNotFound = (): null => null;
export default AssetsNotFound;
