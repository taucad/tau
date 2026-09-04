import { flatRoutes } from '@react-router/fs-routes';
import type { RouteConfigEntry } from '@react-router/dev/routes';

/**
 * Serve route manifest: the web route tree minus every module SPA mode cannot
 * carry (server `loader`/`action`/`headers` exports), plus the e2e fixtures.
 *
 * Every glob carries the literal `../../app/routes/` prefix. `flatRoutes`
 * matches `ignoredRouteFiles` against the path **relative to `appDirectory`**,
 * which for this out-of-tree manifest starts with `../../` — and minimatch's
 * `**` never matches a `..` segment, so a bare `<star><star>/foo` glob
 * silently matches nothing.
 *
 * Excluding a route does not strip its server exports — it only removes it
 * from the manifest. Anything a serve-reachable module still imports from an
 * excluded file drags that file's server code into the client graph.
 *
 * The exclusion list is character-for-character the desktop one
 * (`apps/ui/desktop/app/routes.ts`), because the two builds exclude for the
 * *same* reason — no server behind the document — and nothing on it is
 * Electron-specific. That duplication is deliberate for now and recorded as
 * residue: the two manifests should share one helper (the Electron session's
 * "single RR config" reconsider item), which is a change to
 * `apps/ui/desktop/**` and therefore not this lane's to make.
 */
export default flatRoutes({
  rootDirectory: '../../app/routes',
  ignoredRouteFiles: [
    // Co-located route tests would otherwise become live routes (and generate
    // `+types/*.test.ts` modules vitest then fails to collect).
    '../../app/routes/**/*.test.{ts,tsx}',
    '../../app/routes/**/*.spec.{ts,tsx}',

    // Web-only: the desktop sign-in callback lands in the system browser.
    // A daemon-served page signs in through the ordinary web flow.
    '../../app/routes/auth.desktop/**',

    // Server `action` — a daemon-served page keeps its theme locally
    // (`use-theme.tsx`), because there is no server to set the cookie.
    '../../app/routes/action.set-theme.ts',

    // Server proxies and resource routes: the daemon serves static files and
    // an SPA fallback, and nothing else.
    '../../app/routes/api.ph.$/**',
    '../../app/routes/assets.$/**',
    '../../app/routes/health.live.ts',
    '../../app/routes/health.ready.ts',
    '../../app/routes/health.startup.ts',
    '../../app/routes/i.$/**',
    '../../app/routes/manifest[[].webmanifest[]].ts',
    '../../app/routes/robots[[].[]]txt/**',
    '../../app/routes/sitemap[[].[]]xml/**',

    // Server-side redirects (`settings_`) and publication SSR (`s.$slug`,
    // which also mixes server env into a component module).
    '../../app/routes/s.$slug/**',
    '../../app/routes/settings_/**',
    '../../app/routes/settings_.$/**',

    // Browser-only e2e fixtures, all with server loaders. Their absence is
    // why the AV-4 vertical drives the real composer rather than a seed route.
    '../../app/routes/[[]__e2e[]].*/**',
  ],
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- explicit module boundary required here.
}) as Promise<RouteConfigEntry[]>;
