import type { Route } from './+types/route.js';
import { source } from '#lib/fumadocs/source.js';
import { getLlmText } from '#lib/fumadocs/get-llms-text.js';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- loaders are inferred types by design.
export async function loader({ params }: Route.LoaderArgs) {
  const slugs = params['*'].split('/').filter((v) => v.length > 0);
  const page = source.getPage(slugs);
  if (!page) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- this is the react-router pattern.
    throw new Response('Not found', { status: 404 });
  }

  const rawMarkdownContent = await getLlmText(page);

  return new Response(rawMarkdownContent, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
