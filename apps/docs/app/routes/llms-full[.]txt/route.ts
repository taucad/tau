import { getLlmText } from '#lib/fumadocs/get-llms-text.js';
import { source } from '#lib/fumadocs/source.js';

export async function loader(): Promise<Response> {
  const pages = await Promise.all(source.getPages().map(async (page) => getLlmText(page)));
  return new Response(pages.join('\n\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
