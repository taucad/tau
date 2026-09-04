/**
 * Serve-build root route.
 *
 * Unlike the desktop root, this one **keeps** the shared `loader`. The two
 * builds differ in exactly one way that matters here: Electron's preload
 * injects `window.ENV` before app module evaluation, so a build-time-baked
 * value there would clobber the real one — whereas a daemon serves a plain
 * static document with nothing to inject, so the loader running once at build
 * time is the only way the bundle learns its API origin at all.
 *
 * In SPA mode React Router calls this loader once, at build time, with a
 * synthetic request for `/`: the www-subdomain redirect never fires, the theme
 * cookie is absent (falling through to the localStorage/system path in
 * `use-theme.tsx`), and `getClientEnvironment()` reads the build environment.
 */
// oxlint-disable-next-line no-barrel-files/no-barrel-files -- re-exporting the shared root IS this module's whole job.
export { Layout, links, meta, handle, loader, ErrorBoundary, default } from '#root.js';
