import type { Route } from './+types/route.js';

export async function loader({ request }: Route.LoaderArgs): Promise<Response> {
  return new Response('Hello from api');
}
