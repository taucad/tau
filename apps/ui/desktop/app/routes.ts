import { flatRoutes } from '@react-router/fs-routes';
import type { RouteConfigEntry } from '@react-router/dev/routes';
// oxlint-disable-next-line eslint/no-restricted-imports -- route generation runs outside the app alias root.
import { resolveTauCloudBuildEnabled } from '../../build-environment.js';

/**
 * Desktop route manifest: the web route tree minus every module SPA mode
 * cannot carry (server `loader`/`action`/`headers` exports) plus the e2e
 * fixtures, which only exist for the browser suites.
 *
 * Every glob carries the literal `../../app/routes/` prefix. `flatRoutes`
 * matches `ignoredRouteFiles` against the path **relative to `appDirectory`**,
 * which for this out-of-tree manifest starts with `../../` — and minimatch's
 * `**` never matches a `..` segment, so a bare `** /foo` glob silently matches
 * nothing (measured: 38 routes in, 38 routes out).
 *
 * Excluding a route does not strip its server exports — it only removes it
 * from the manifest. Anything a desktop-reachable module still imports from an
 * excluded file drags that file's server code into the client graph, which is
 * why `webManifestLinks` moved to `app/lib/web-manifest.ts`.
 */
const routes: RouteConfigEntry[] = await flatRoutes({
  rootDirectory: '../../app/routes',
  ignoredRouteFiles: [
    // Co-located route tests would otherwise become live routes (and generate
    // `+types/*.test.ts` modules vitest then fails to collect).
    '../../app/routes/**/*.test.{ts,tsx}',
    '../../app/routes/**/*.spec.{ts,tsx}',
    // oxlint-disable-next-line eslint/dot-notation -- ProcessEnv is index-signature-only with noPropertyAccessFromIndexSignature.
    ...(resolveTauCloudBuildEnabled(process.env['TAU_CLOUD_ENABLED']) ? [] : ['../../app/routes/usage/**']),

    // Web-only: the desktop sign-in callback lands in the system browser, not
    // in the shell (see `desktop-auth-signin-blueprint.md`).
    '../../app/routes/auth.desktop/**',

    // Server `action` — the desktop theme preference is local (`use-theme.tsx`).
    '../../app/routes/action.set-theme.ts',

    // Server proxies and resource routes: no server exists behind `app://tau`.
    '../../app/routes/api.ph.$/**',
    '../../app/routes/assets.$/**',
    '../../app/routes/health.live.ts',
    '../../app/routes/health.ready.ts',
    '../../app/routes/health.startup.ts',
    '../../app/routes/i.$/**',
    '../../app/routes/legal/**',
    '../../app/routes/legal.*/**',
    '../../app/routes/manifest[[].webmanifest[]].ts',
    '../../app/routes/robots[[].[]]txt/**',
    '../../app/routes/sitemap[[].[]]xml/**',

    // Server-side redirects.
    '../../app/routes/settings_/**',
    '../../app/routes/settings_.$/**',

    // Browser-only e2e fixtures, all with server loaders.
    '../../app/routes/[[]__e2e[]].*/**',
  ],
});

/**
 * Paths the desktop keeps but serves from a different module.
 *
 * Excluding a route removes the path; a `tau://` link needs the path. `/s/:slug`
 * is where `tau://s/<slug>` lands (R4) and the web module resolves a Tau
 * publication in a server `loader` SPA mode forbids, so the desktop swaps the
 * module and leaves the web route's SSR, cookies and meta untouched.
 */
const desktopRouteFiles = new Map<string, string>([
  ['../../app/routes/_index', '../../app/routes/_index/home-surface.desktop.tsx'],
  ['../../app/routes/s.$slug', '../../app/routes/s.$slug/desktop-route.tsx'],
]);

export default routes.map((entry) => {
  const file = desktopRouteFiles.get(entry.id ?? '');
  return file === undefined ? entry : { ...entry, file };
});
