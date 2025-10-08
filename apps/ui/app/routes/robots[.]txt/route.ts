import { ENV } from '#config.js';

export async function loader(): Promise<Response> {
  return new Response(
    String(`User-agent: *
Allow: /

Host: ${ENV.TAU_FRONTEND_URL}

Sitemap: ${ENV.TAU_FRONTEND_URL}/sitemap.xml`),
  );
}
