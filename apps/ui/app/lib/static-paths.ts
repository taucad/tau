// oxlint-disable-next-line eslint/no-restricted-imports -- `react-router.config.ts` imports this module before app aliases are installed.
import { staticShellPrerenderPaths } from './route-classes.js';

/**
 * Public, crawlable paths. These are the only entries `sitemap.xml` advertises.
 */
function listPublicStaticPaths(): string[] {
  return ['/manifest.webmanifest', '/robots.txt', '/sitemap.xml'];
}

/** Paths the sitemap advertises. */
export function listSitemapPaths(): string[] {
  return listPublicStaticPaths();
}

/**
 * Paths the React Router build prerenders to static HTML: the public files and one document per
 * static-shell route class (`route-classes.ts`), which the CDN serves for every URL of its class.
 */
export function listStaticPrerenderPaths(): string[] {
  return [...listPublicStaticPaths(), ...staticShellPrerenderPaths()];
}
