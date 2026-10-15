import { siteConfiguration } from '#app/config.server.js';

export function loader(): Response {
  const { origin, launch } = siteConfiguration();
  return new Response(`User-agent: *\nAllow: /\n${launch ? `Sitemap: ${origin}/sitemap.xml\n` : ''}`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
