import { listDocumentPaths } from '#lib/static-paths.js';
import { siteOrigin } from '#lib/site.js';

export async function loader(): Promise<Response> {
  const documentPaths = await listDocumentPaths();
  const entries = ['/', ...documentPaths]
    .map((pathname) => `  <url><loc>${new URL(pathname, siteOrigin).href}</loc></url>`)
    .join('\n');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;

  return new Response(sitemap, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
