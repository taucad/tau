import { siteConfiguration } from '#app/config.server.js';
import { publicPaths } from '#app/pages.server.js';

export function loader(): Response {
  const { origin, launch } = siteConfiguration();
  const urls = launch ? publicPaths.map((path) => `<url><loc>${origin}${path}</loc></url>`).join('') : '';
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
}
