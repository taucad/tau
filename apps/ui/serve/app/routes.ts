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
const routes: RouteConfigEntry[] = await flatRoutes({
  rootDirectory: '../../app/routes',
  ignoredRouteFiles: [
    // Co-located route tests would otherwise become live routes (and generate
    // `+types/*.test.ts` modules vitest then fails to collect).
    '../../app/routes/**/*.test.{ts,tsx}',
    '../../app/routes/**/*.spec.{ts,tsx}',
    // oxlint-disable-next-line eslint/dot-notation -- ProcessEnv is index-signature-only with noPropertyAccessFromIndexSignature.
    /* The `tau serve` bundle pins `self-host` (adaptive app deployment mode D12): never a Tau Cloud host. */
    '../../app/routes/usage/**',

    // Web-only: the desktop sign-in callback lands in the system browser.
    // A daemon-served page signs in through the ordinary web flow.
    '../../app/routes/auth.desktop/**',

    // Server `action`: the one-time theme cookie migration; a daemon-served
    // page never had the cookie (its theme is a client fact).
    '../../app/routes/action.migrate-theme.ts',

    // Server proxies and resource routes: the daemon serves static files and
    // an SPA fallback, and nothing else.
    '../../app/routes/api.ph.$/**',
    '../../app/routes/api.monitoring/**',
    '../../app/routes/api.reports/**',
    '../../app/routes/assets.$/**',
    '../../app/routes/health.build.ts',
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
    '../../app/routes/[[]__debug[]].observability/**',
  ],
});

/**
 * Paths served from a different module. `/invitations/:token` is a server
 * redirect on the web that moves the token out of the address (#2290); a
 * daemon-served page has no server, so it takes the renderer module the
 * desktop shell uses, which does the same before the router commits.
 */
const spaRouteFiles = new Map<string, string>([
  ['../../app/routes/invitations.$token', '../../app/routes/invitations.$token/desktop-route.tsx'],
]);

export default routes.map((entry) => {
  const file = spaRouteFiles.get(entry.id ?? '');
  return file === undefined ? entry : { ...entry, file };
});
