import { data } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { pages } from '#www/pages.js';
import { publishedArticles } from '#app/pages.server.js';
/* One loader for every marketing page, so its arguments are React Router's shared type, not one route's `Route.LoaderArgs`.
 * It reads `url`, the page's URL: a client navigation's `request.url` is `/<path>.data?_routes=…` (blueprint B4). */
// oxlint-disable-next-line typescript/explicit-module-boundary-types -- React Router derives serialized route data from the loader.
export function loader({ url }: LoaderFunctionArgs) {
  const { pathname } = url;
  const path = pathname === '/' ? '/' : `${pathname.replace(/\/+$/u, '')}/`;
  const page = pages.find((candidate) => candidate.path === path && !candidate.error);
  const article = publishedArticles.find((candidate) => `/blog/${candidate.slug}/` === path);
  if (!page && !article) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router turns thrown Responses into HTTP error boundaries.
    throw new Response('Page not found', { status: 404 });
  }
  return data({
    path,
    title: article ? `${article.title} · Tau` : page!.title,
    description: article ? article.description : page!.description,
    article,
    articles:
      path === '/blog/'
        ? publishedArticles.map(({ slug, title, description }) => ({
            slug,
            title,
            description,
          }))
        : [],
  });
}
