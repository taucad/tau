import { redirect } from 'react-router';
import { settingsSectionSchema } from '@taucad/settings-ui/components/settings/settings-section';
import type { Route } from './+types/route.js';

/**
 * Splat route for /settings/* — redirects to /?settings=<section>
 *
 * Maps legacy deep links like `/settings/account` or `/settings/security`
 * to the URL-driven settings dialog at `/?settings=account`.
 * Falls back to `/?settings=general` for unrecognised segments.
 *
 * The allow-set is the dialog's own section schema, not a copy: the copy had
 * drifted, so `/settings/models`, `/settings/agents`, `/settings/filesystem`
 * and `/settings/experimental` all landed on General while `/settings/api-keys`
 * redirected to a section that no longer exists.
 *
 * The rest of the query survives, so a Checkout return to `/settings/billing?payment_action=…`
 * still reaches the dialog with its payment context.
 */
export function loader({ params, url }: Route.LoaderArgs): Response {
  const splatPath = params['*'];
  const parsed = settingsSectionSchema.safeParse(splatPath);
  const search = new URLSearchParams({ settings: parsed.success ? parsed.data : 'general' });
  // `url`, not `request.url`: a client navigation's request also carries `_routes` (B4).
  for (const [key, value] of url.searchParams) {
    if (key !== 'settings') {
      search.append(key, value);
    }
  }
  return redirect(`/?${search.toString()}`);
}
