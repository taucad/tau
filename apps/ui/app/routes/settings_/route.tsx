import { redirect } from 'react-router';
import type { Route } from './+types/route.js';

/**
 * Redirect /settings to /?settings=general
 *
 * The settings dialog is now a global modal driven by the `?settings`
 * search param. This route ensures direct navigation or bookmarked
 * links to `/settings` produce a proper 302 redirect.
 *
 * The rest of the query survives, as it does for `/settings/<section>`, so a Checkout return to
 * `/settings?payment_action=…` still reaches the dialog with its payment context.
 */
export function loader({ request }: Route.LoaderArgs): Response {
  const search = new URLSearchParams({ settings: 'general' });
  for (const [key, value] of new URL(request.url).searchParams) {
    if (key !== 'settings') {
      search.append(key, value);
    }
  }
  return redirect(`/?${search.toString()}`);
}
