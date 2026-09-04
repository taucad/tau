import { getEnvironment } from '#environment.config.js';
import { canonicalProductionUrl, isCanonicalProductionUrl } from '#lib/canonical-url.js';
import { listStaticPrerenderPaths } from '#lib/static-paths.js';

const sitemapExcludePathSet = new Set(['/robots.txt', '/sitemap.xml', '/manifest.webmanifest']);

const emptyUrlsetXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>
`;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

type UrlEntryFields = {
  readonly loc: string;
  readonly lastmod: string;
  readonly changefreq: string;
  readonly priority: string;
};

function buildUrlEntry(fields: UrlEntryFields): string {
  return `  <url>
    <loc>${escapeXml(fields.loc)}</loc>
    <lastmod>${fields.lastmod}</lastmod>
    <changefreq>${fields.changefreq}</changefreq>
    <priority>${fields.priority}</priority>
  </url>`;
}

type PathClassification = {
  readonly changefreq: 'weekly' | 'monthly';
  readonly priority: '1.0' | '0.5';
};

/** Per-path crawl hints. Home is the highest-value page. */
function classifyPath(path: string): PathClassification {
  if (path === '/') {
    return { changefreq: 'weekly', priority: '1.0' };
  }
  return { changefreq: 'monthly', priority: '0.5' };
}

type BuildSitemapXmlInput = {
  /** Live frontend URL. Non-canonical origins emit an empty `<urlset>`. */
  readonly frontendUrl: string;
  /** Static prerender paths from {@link listStaticPrerenderPaths}. */
  readonly paths: readonly string[];
  /** ISO-8601 date (`YYYY-MM-DD`) used for every `<lastmod>`. */
  readonly lastmod: string;
};

/**
 * Build a sitemap XML body.
 *
 * Pure function — no env access, no I/O, no `Date.now()`. The loader
 * resolves the live frontend URL, prerender paths, and `lastmod` and
 * passes them in. Per-entry `<loc>` URLs are constructed via
 * `new URL(path, canonicalProductionUrl)` so any malformed path throws
 * instead of producing a broken absolute URL through string concatenation.
 *
 * Non-production origins return an empty `<urlset>` so staging / preview
 * deploys do not advertise their content as canonical.
 */
export function buildSitemapXml(input: BuildSitemapXmlInput): string {
  if (!isCanonicalProductionUrl(input.frontendUrl)) {
    return emptyUrlsetXml;
  }

  const entries: string[] = [];
  for (const path of input.paths) {
    if (sitemapExcludePathSet.has(path)) {
      continue;
    }

    const loc = new URL(path, canonicalProductionUrl).href;
    const { changefreq, priority } = classifyPath(path);
    entries.push(buildUrlEntry({ loc, lastmod: input.lastmod, changefreq, priority }));
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`;
}

/** ISO-8601 date in UTC (`YYYY-MM-DD`) for the `<lastmod>` field. */
function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}

export async function loader(): Promise<Response> {
  const environment = await getEnvironment();
  const paths = listStaticPrerenderPaths();
  const xml = buildSitemapXml({
    frontendUrl: environment.TAU_FRONTEND_URL,
    paths,
    lastmod: todayIsoDate(),
  });
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
}
