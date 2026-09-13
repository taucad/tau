import { getEnvironment } from '#environment.config.js';
import { canonicalProductionUrl, isCanonicalProductionUrl } from '#lib/canonical-url.js';

const sitemapUrl = new URL('/sitemap.xml', canonicalProductionUrl);

/** Non-production: block crawlers entirely (staging, previews, local). */
function nonProductionRobots(): string {
  return `User-agent: *
Disallow: /
`;
}

function productionRobots(): string {
  return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /auth/
Disallow: /projects
Disallow: /projects/
Disallow: /projects_
Disallow: /files
Disallow: /settings_
Disallow: /usage
Disallow: /workflows
Disallow: /convert
Disallow: /import/
Disallow: /i/
Disallow: /*?utm_

Sitemap: ${sitemapUrl.href}
`;
}

/**
 * Build the `robots.txt` body for a given frontend URL.
 *
 * Pure function — no env access, no I/O. The loader resolves the live
 * frontend URL from the environment and passes it in. Invalid URLs throw
 * via `new URL(...)` so misconfiguration surfaces immediately.
 */
export function buildRobotsTxt(frontendUrl: string): string {
  return isCanonicalProductionUrl(frontendUrl) ? productionRobots() : nonProductionRobots();
}

export async function loader(): Promise<Response> {
  const environment = await getEnvironment();
  return new Response(buildRobotsTxt(environment.TAU_FRONTEND_URL), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
