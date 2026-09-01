import { siteOrigin } from '#lib/site.js';

export function loader(): Response {
  const robots = ['User-agent: *', 'Allow: /', '', `Sitemap: ${siteOrigin}/sitemap.xml`].join('\n');

  return new Response(`${robots}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
