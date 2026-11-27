import { redirect } from 'react-router';
import { pendingInvitationCookie, pendingInvitationPath } from '#lib/pending-invitation.lib.js';
import type { Route } from './+types/route.js';

/**
 * `/invitations/:token` — where an invitation link lands, and leaves at once (#2290).
 *
 * The token is a bearer credential, and every page that renders at an address
 * holding one leaks it: the pageview records the URL, sign-in copies it into
 * `?redirectTo=`, and a replay resolves each relative `href` on the page
 * against it. So nothing renders here. The server takes the token out of the
 * path, holds it in a cookie only `/invitations` reads, and redirects there
 * before any document, script or analytics exists. The accept lives at
 * `/invitations` (`routes/invitations._index`).
 *
 * The desktop shell has no server and serves this path from
 * `desktop-route.tsx`, which does the same in the renderer.
 *
 * @returns A `303` to `/invitations` that sets the cookie, or to `/invitations` alone when the path has no token.
 */
export const loader = ({ params, request }: Route.LoaderArgs): Response => {
  const { token } = params;
  return redirect(pendingInvitationPath, {
    status: 303,
    headers: {
      'Set-Cookie': pendingInvitationCookie(token, request.url),
      // The redirect is per visitor: no shared cache may keep the cookie it sets.
      'Cache-Control': 'private, no-store',
      // The address this answers was a credential; the next page must not name it.
      'Referrer-Policy': 'no-referrer',
    },
  });
};
