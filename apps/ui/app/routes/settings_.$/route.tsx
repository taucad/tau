import { redirect } from 'react-router';
import { settingsSectionSchema } from '#hooks/use-settings-dialog.js';
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
 */
export function loader({ params }: Route.LoaderArgs): Response {
  const splatPath = (params as { '*'?: string })['*'] ?? '';
  const parsed = settingsSectionSchema.safeParse(splatPath);
  return redirect(`/?settings=${parsed.success ? parsed.data : 'general'}`);
}
