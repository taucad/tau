/**
 * Canonical list of paths consumed by the prerender config and `sitemap.xml`.
 */
export function listStaticPrerenderPaths(): string[] {
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
