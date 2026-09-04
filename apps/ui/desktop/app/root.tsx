/**
 * Desktop root route.
 *
 * Re-exports the shared root's document/app shell and deliberately exports
 * **no** `loader`. Two reasons:
 *
 * 1. SPA mode grandfathers a root loader, but a build-time-baked `window.ENV`
 *    would clobber the environment the Electron preload injects before app
 *    module evaluation (blueprint risk P-R2). With no loader here, the shared
 *    `Layout` renders `buildClientEnvScript({})` and the preload's values win.
 * 2. The shared loader reads a request cookie, which has no meaning in an
 *    `app://tau` document with no server.
 *
 * `useRouteLoaderData('root')` in the shared `Layout` returns `undefined` here,
 * which the shared code already handles (theme falls through to the
 * localStorage/system path in `use-theme.tsx`).
 */
// oxlint-disable-next-line no-barrel-files/no-barrel-files -- re-exporting the shared root IS this module's whole job.
export { Layout, links, meta, handle, ErrorBoundary, default } from '#root.js';
