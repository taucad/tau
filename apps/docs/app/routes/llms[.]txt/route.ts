import { getLlmRefText } from '#lib/fumadocs/get-llms-text.js';
import { siteOrigin } from '#lib/site.js';

export async function loader(): Promise<Response> {
  const content = await getLlmRefText({
    siteTitle: 'Tau Documentation',
    siteUrl: siteOrigin,
  });

  return new Response(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
