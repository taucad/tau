import { createFromSource } from 'fumadocs-core/search/server';
// eslint-disable-next-line no-restricted-imports -- allowed for route types
import type { Route } from './+types/route.js';
import { source } from '#lib/fumadocs/source.js';

const server = createFromSource(source, {
  // https://docs.orama.com/docs/orama-js/supported-languages
  language: 'english',
});

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- inferred type
export async function loader({ request }: Route.LoaderArgs) {
  // eslint-disable-next-line new-cap -- Fumadocs internals
  return server.GET(request);
}
