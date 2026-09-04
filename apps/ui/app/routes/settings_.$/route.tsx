import { redirect } from 'react-router';
import type { Route } from './+types/route.js';

const validSections = new Set(['general', 'account', 'security', 'api-keys', 'billing', 'compute']);

/**
 * Splat route for /settings/* — redirects to /?settings=<section>
 *
 * Maps legacy deep links like `/settings/account` or `/settings/security`
 * to the URL-driven settings dialog at `/?settings=account`.
 * Falls back to `/?settings=general` for unrecognised segments.
 */
export function loader({ params }: Route.LoaderArgs): Response {
  const splatPath = (params as { '*'?: string })['*'] ?? '';
  const section = validSections.has(splatPath) ? splatPath : 'general';
  return redirect(`/?settings=${section}`);
}
