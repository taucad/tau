/**
 * Public, crawlable paths. These are the only entries `sitemap.xml` advertises.
 */
function listPublicStaticPaths(): string[] {
  return [
    '/manifest.webmanifest',
    '/robots.txt',
    '/sitemap.xml',
    '/legal',
    '/legal/terms',
    '/legal/privacy',
    '/legal/cookies',
    '/legal/subprocessors',
    '/legal/acceptable-use',
  ];
}

/**
 * Account routes prerendered as a neutral document so a cold offline start has
 * HTML to boot (B5 R2). They carry `noindex, nofollow` route meta and are
 * deliberately absent from {@link listSitemapPaths}: prerendering is a build
 * artefact, not a statement that the route is public content.
 */
const offlineShellPaths = ['/usage'];

/** Paths the sitemap advertises. */
export function listSitemapPaths(): string[] {
  return listPublicStaticPaths();
}

/** Paths the React Router build prerenders to static HTML. */
export function listStaticPrerenderPaths(): string[] {
  return [...listPublicStaticPaths(), ...offlineShellPaths];
}

/** The neutral prerendered documents the offline shell worker may cache. */
export function listOfflineShellPaths(): readonly string[] {
  return offlineShellPaths;
}

/**
 * Whether a pathname is served by the offline shell.
 *
 * @param pathname - URL pathname, with or without a trailing slash.
 * @returns `true` when the offline shell owns this document.
 */
export function isOfflineShellPath(pathname: string): boolean {
  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return offlineShellPaths.includes(normalized);
}
