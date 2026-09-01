import type { LoaderFunctionArgs } from 'react-router';
import { getLlmText } from '#lib/fumadocs/get-llms-text.js';
import { source } from '#lib/fumadocs/source.js';

export async function loader({ params }: LoaderFunctionArgs): Promise<Response> {
  const path = params['*'] ?? '';
  if (!path.endsWith('.txt')) {
    return new Response('Not found', { status: 404 });
  }

  const slugs = path
    .slice(0, -4)
    .split('/')
    .filter((segment) => segment.length > 0);
  const page = source.getPage(slugs);
  if (!page) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(await getLlmText(page), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
