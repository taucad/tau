import { readFile, writeFile, mkdir, cp, rm, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pages, renderPage, escapeHtml } from '../src/templates.mjs';
import { validateArticles } from '../src/editorial.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
const launch = process.env.WWW_LAUNCH === 'true';
const rawOrigin = process.env.WWW_ORIGIN || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL;
let origin = '';
if (rawOrigin) {
  const parsed = new URL(rawOrigin);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  )
    throw new Error('WWW_ORIGIN must be an HTTPS origin without credentials, path, query or fragment.');
  origin = parsed.origin;
}
if (launch && !origin) throw new Error('A launch build requires an explicit verified WWW_ORIGIN.');
const analyticsEndpoint = process.env.WWW_ANALYTICS_ENDPOINT || '';
if (analyticsEndpoint && analyticsEndpoint !== '/api/marketing-events')
  throw new Error('Analytics must use the approved first-party endpoint.');
const publicDir = join(root, 'public');
const artifacts = await readdir(publicDir);
for (const required of ['assembly.webp', 'exploded.webp', 'social.png'])
  if (!artifacts.includes(required)) throw new Error(`Missing required public asset: ${required}`);
await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'assets'), { recursive: true });
await cp(publicDir, join(output, 'assets'), { recursive: true });
const hash = (content) => createHash('sha256').update(content).digest('hex').slice(0, 12);
const baseTokens = await readFile(resolve(root, '../../packages/ui/src/styles/tokens.css'), 'utf8');
// Native CSS supports custom properties; Tailwind-only directives are omitted.
const rootTokens = baseTokens.slice(
  baseTokens.indexOf(':root {'),
  baseTokens.indexOf('\n}', baseTokens.indexOf(':root {')) + 2,
);
const css = rootTokens + '\n' + (await readFile(join(root, 'src/site.css'), 'utf8'));
const analytics = await readFile(join(root, 'src/analytics.mjs'), 'utf8');
const analyticsName = `analytics.${hash(analytics)}.mjs`;
await writeFile(join(output, 'assets', analyticsName), analytics);
const js = (await readFile(join(root, 'src/client.mjs'), 'utf8')).replace("'./analytics.mjs'", `'./${analyticsName}'`);
const asset = { css: `/assets/site.${hash(css)}.css`, js: `/assets/site.${hash(js)}.mjs` };
await writeFile(join(output, asset.css), css);
await writeFile(join(output, asset.js), js);
const published = JSON.parse(await readFile(join(root, 'content/articles.json'), 'utf8'));
const articlePages = validateArticles(published).map((article) => {
  return {
    path: `/blog/${article.slug}/`,
    title: `${article.title} · Tau`,
    description: article.description,
    body: () =>
      `<article class="wrap prose"><header class="page-intro"><p class="kicker">The Tau journal</p><h1>${escapeHtml(article.title)}</h1><p>By ${escapeHtml(article.author)} · <time datetime="${article.date}">${article.date}</time></p></header>${article.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}<p><a href="/blog/">← All journal entries</a></p></article>`,
  };
});
if (new Set(articlePages.map((p) => p.path)).size !== articlePages.length) throw new Error('Duplicate article slug.');
const allPages = [...pages, ...articlePages];
for (const page of allPages) {
  let html = renderPage({ page, origin, launch, asset, analyticsEndpoint });
  if (page.path === '/blog/' && articlePages.length)
    html = html
      .replace(/<section class="journal-empty">.*?<\/section>/su, '')
      .replace(
        '<div id="articles"></div>',
        `<div class="feature-rows">${articlePages.map((article) => `<article><h2><a href="${article.path}">${escapeHtml(article.title.replace(' · Tau', ''))}</a></h2><p>${escapeHtml(article.description)}</p></article>`).join('')}</div>`,
      );
  const filename = page.path.endsWith('.html') ? join(output, page.path) : join(output, page.path, 'index.html');
  await mkdir(resolve(filename, '..'), { recursive: true });
  await writeFile(filename, html);
}
await writeFile(
  join(output, 'robots.txt'),
  launch ? `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n` : 'User-agent: *\nAllow: /\n',
);
await writeFile(
  join(output, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${
    launch
      ? allPages
          .filter((p) => !p.error)
          .map((p) => `<url><loc>${escapeHtml(origin + p.path)}</loc></url>`)
          .join('')
      : ''
  }</urlset>`,
);
const hashes = [
  ...new Set(
    allPages.map((page) => {
      const html = renderPage({ page, origin, launch, asset, analyticsEndpoint });
      const json = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/su)[1];
      return `'sha256-${createHash('sha256').update(json).digest('base64')}'`;
    }),
  ),
];
await writeFile(
  join(output, '_headers'),
  `/*\n  Content-Security-Policy: default-src 'self'; script-src 'self' ${hashes.join(' ')}; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Cache-Control: public, max-age=0, must-revalidate\n${launch ? '' : '  X-Robots-Tag: noindex, nofollow\n'}\n/assets/*\n  Cache-Control: public, max-age=3600, must-revalidate\n`,
);
await writeFile(
  join(output, '_redirects'),
  '# Netlify serves 404.html with a real 404 for unknown routes. No SPA catch-all.\n',
);
console.log(
  `Built ${allPages.length} pages. ${launch ? 'Launch metadata enabled' : 'Preview: noindex on every page'}. Analytics ${analyticsEndpoint ? 'configured' : 'disabled'}.`,
);
